import { readFields } from './wire.js';

const MAX_WIRE_BYTES = 1024 * 1024;
const MAX_RECORD_BYTES = 4 * MAX_WIRE_BYTES;
const UNKNOWN_RECORDS = Object.freeze({ status: 'unknown', rows: Object.freeze([]) });
const EVENT_STATES = { 'new-achievement': 0, achievement: 1, 'failed-achievement': 2 };

export function readAchievementVectorFields(fields) {
  const values = Array.from({ length: 5 }, () => fields.string(MAX_RECORD_BYTES, true));
  fields.done();
  return values;
}

export function readAchievementRows([ids, states, progress, ends, codes]) {
  if (![ids, states, progress, ends, codes].some(Boolean)) return [];

  const rawIds = ids.split(',');
  const rawStates = states.split(',');
  const progressRows = progress.split('_');
  const endRows = ends.split(',');
  const codeRows = codes.split(',');
  if ([rawStates, progressRows, endRows, codeRows].some(rows => rows.length !== rawIds.length)) {
    throw new Error('Inconsistent achievement record fields.');
  }
  const unique = new Set();
  return rawIds.map((id, index) => {
    const achievementId = Number(id);
    const state = rawStates[index];
    if (!/^[1-9]\d{0,9}$/.test(id) || achievementId > 0x7fffffff || unique.has(achievementId) || !/^[012]$/.test(state)) {
      throw new Error('Invalid achievement record.');
    }
    unique.add(achievementId);
    return { achievementId, state: Number(state), progress: progressRows[index], endAt: endRows[index], code: codeRows[index] };
  });
}

async function inflateAchievementRows(compressed, signal) {
  const chunks = [];
  let length = 0;
  let reader;
  let body;
  const cancel = () => { void reader?.cancel().catch(() => {}); };
  try {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(compressed); controller.close(); } });
    reader = stream.pipeThrough(new DecompressionStream('deflate')).getReader();
    signal.addEventListener('abort', cancel, { once: true });
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.length;
      if (length > MAX_RECORD_BYTES) throw new Error('Achievement records are too large.');
    }
    signal.throwIfAborted();
    body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return readAchievementRows(readAchievementVectorFields(readFields(body)));
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader?.releaseLock();
    compressed.fill(0);
    body?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

function applyAchievementEvent(records, event) {
  const { kind, achievementId } = event;
  if (kind === 'drop-achievement') return records.delete(achievementId);
  if (kind === 'achievement-rows') {
    let changed = false;
    for (const row of event.rows) {
      const previous = records.get(row.achievementId);
      // Original incrementals do not regress a terminal record. A new event starts a repeat explicitly.
      const state = previous?.state > 0 ? previous.state : row.state;
      if (previous?.state === state && previous.progress === row.progress && previous.endAt === row.endAt
        && previous.code === row.code) continue;
      records.set(row.achievementId, Object.freeze({ ...row, state }));
      changed = true;
    }
    return changed;
  }
  const state = EVENT_STATES[kind];
  const previous = records.get(achievementId);
  if (state === undefined || previous?.state === state) return false;
  const fields = state === 0 ? null : previous;
  records.set(achievementId, Object.freeze({ achievementId, state,
    progress: fields?.progress ?? null, endAt: fields?.endAt ?? null, code: fields?.code ?? null }));
  return true;
}

export function createAchievementRecords() {
  let records = new Map();
  let snapshot = UNKNOWN_RECORDS;
  let pending;
  let stopped = false;
  const subscribers = new Set();

  function notify(listener) {
    try { void Promise.resolve(listener(snapshot)).catch(() => {}); } catch { /* Keep authenticated updates independent of views. */ }
  }

  function publish(status) {
    snapshot = Object.freeze({ status, rows: Object.freeze([...records.values()]) });
    for (const subscription of [...subscribers]) if (subscribers.has(subscription)) notify(subscription.listener);
  }

  function reset() {
    pending?.controller.abort();
    records.clear();
    snapshot = UNKNOWN_RECORDS;
  }

  return {
    read() { return snapshot; },
    subscribe(listener, { signal } = {}) {
      if (stopped || signal?.aborted || typeof listener !== 'function') return () => {};
      const subscription = { listener, unsubscribe() {
        subscribers.delete(subscription);
        signal?.removeEventListener('abort', subscription.unsubscribe);
      } };
      subscribers.add(subscription);
      signal?.addEventListener('abort', subscription.unsubscribe, { once: true });
      notify(listener);
      return subscription.unsubscribe;
    },
    apply(event) {
      if (stopped || (!Object.hasOwn(EVENT_STATES, event.kind)
        && event.kind !== 'achievement-rows' && event.kind !== 'drop-achievement')) return;
      pending?.changes.push(event);
      if (applyAchievementEvent(records, event)) publish(snapshot.status === 'ready' ? 'ready' : 'partial');
    },
    receiveBaseline(reply) {
      if (stopped || pending || snapshot.status === 'ready') return;
      const compressed = reply.takeRest(MAX_WIRE_BYTES - 2);
      const decoding = { controller: new AbortController(), changes: [] };
      pending = decoding;
      void inflateAchievementRows(compressed, decoding.controller.signal).then(rows => {
        if (decoding.controller.signal.aborted) return;
        records = new Map(rows.map(row => [row.achievementId, Object.freeze(row)]));
        for (const event of decoding.changes) applyAchievementEvent(records, event);
        publish('ready');
      }).catch(() => {
        // Auxiliary records may be unavailable even though the avatar profile is valid.
      }).finally(() => { pending = undefined; });
    },
    reset,
    close() {
      stopped = true;
      reset();
      for (const subscription of subscribers) subscription.unsubscribe();
    },
  };
}
