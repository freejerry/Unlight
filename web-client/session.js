import { createAuthExchange } from './srp.js';
import { applySessionKey, createFrameParser, encodeCommand, readReply, signedByte } from './wire.js';
import {
  AVATAR_COMMAND, REGISTRATION_COMMAND, VERSION_COMMAND, readDataProfile, readVersions,
} from './data-bootstrap.js';
import {
  QUEST_DISCOVERY_REQUEST, QUEST_DISCOVERY_REPLY, QUEST_INVENTORY_REPLY, QUEST_MAP_REQUEST, QUEST_MAP_REPLY,
  QUEST_SEARCH_REQUEST, QUEST_SEARCH_REPLY, QUEST_SEARCH_TIMER, QUEST_ENERGY_REPLY, QUEST_ERROR_REPLY,
  QUEST_START_REQUEST, QUEST_DELETED_REPLY,
  readQuestDeletedReply, readQuestDiscoveryReply, readQuestInventoryReply, readQuestMapReply,
  readQuestSearchReply, readQuestEnergyReply, readQuestErrorReply,
} from './quest-data.js';

const AUTH_PORT = 12001;
const DATA_PORT = 12003;
const QUEST_PORT = 12005;
const QUEST_REGION = 0;
const QUEST_NEW = 0;
const QUEST_UNSOLVED = 1;
const QUEST_IN_PROGRESS = 2;
const QUEST_PENDING = 4;
const MAX_QUEST_ROWS = 127; // The original Data inventory count is a signed byte.
const MAX_QUEST_MAP_ID = 35; // Ordinary Traditional Chinese quest maps.
const QUEST_SEARCH_ERRORS = new Set([1, 30, 31, 32]); // Original get_quest return codes.
const QUEST_START_ERRORS = new Set([1, 16, 40, 41, 42]); // Original quest_start return codes.
const QUEST_MISSING_ERROR = 40;
const CHANNELS = [
  { port: 12002, pong: 35 },
  { port: DATA_PORT, pong: 3 },
  { port: 12020, pong: 3 },
];
const TIMEOUT = 8000;
const HEARTBEAT = 180_000;
const CLOSE_TIMEOUT = 1500;
const LOGIN_FIELD = /^[A-Za-z0-9_.-]{1,16}$/;

const messages = {
  credentials: '登入未通過，請確認帳號和密碼。',
  network: '無法連線至遊戲服務，請稍後再試。',
  protocol: '遊戲服務回傳的登入資料無法驗證。',
  timeout: '遊戲服務未及時回覆，請再試一次。',
  cancelled: '已取消連線。',
  busy: '正在讀取任務資料。',
  'search-uncertain': '尚未確認搜尋結果，請重新登入後再搜尋。',
  'search-rejected': '遊戲服務未接受這次搜尋。',
  'quest-start-unavailable': '此任務目前無法開始。',
  'quest-start-rejected': '遊戲服務未接受開始任務。',
  'quest-start-uncertain': '開始任務的結果未確認，可先查看任務服務的即時庫存。',
};

export class SessionError extends Error {
  constructor(kind, code) {
    super(messages[kind]);
    this.name = 'SessionError';
    this.kind = kind;
    if (code !== undefined) this.code = code;
  }
}

function bounded(promise, signal, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(reject, new SessionError('timeout')), timeout);
    const cancel = () => finish(reject, signal.reason);

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      callback(value);
    }

    promise.then((value) => finish(resolve, value), (error) => finish(reject, error));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

class SessionSocket {
  #socket;
  #key = null;
  #parser = createFrameParser();
  #waiting = null;
  #observer = null;
  #opened;
  #resolveOpen;
  #resolveClose;
  #reason = null;
  #fault = null;
  #expireCommand = null;
  #onStartupFailure;

  constructor(port, onStartupFailure) {
    this.#onStartupFailure = onStartupFailure;
    const address = new URL(`/socket/${port}`, location.href);
    address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      this.#socket = new WebSocket(address);
    } catch {
      throw new SessionError('network');
    }
    this.#socket.binaryType = 'arraybuffer';
    this.#opened = new Promise((resolve) => { this.#resolveOpen = resolve; });
    this.closed = new Promise((resolve) => { this.#resolveClose = resolve; });
    this.#socket.onopen = () => this.#resolveOpen(true);
    this.#socket.onmessage = ({ data }) => this.#receive(data);
    this.#socket.onerror = () => this.#fail(new SessionError('network'));
    this.#socket.onclose = () => this.#finishClose();
  }

  async open(signal) {
    if (!await bounded(this.#opened, signal)) {
      throw this.#fault ?? new SessionError('network');
    }
  }

  assertOpen() {
    if (this.#socket.readyState !== WebSocket.OPEN || this.#reason) {
      throw this.#fault ?? new SessionError('network');
    }
  }

  finishStartup() {
    this.#onStartupFailure = null;
  }

  send(command, fields) {
    this.assertOpen();
    const frame = encodeCommand(command, fields, this.#key);
    try {
      this.#socket.send(frame);
    } catch {
      throw new SessionError('network');
    }
  }

  async ask(command, fields, replies, { signal, skip, allowOther, nextKey, onReply } = {}) {
    signal?.throwIfAborted();
    this.assertOpen();
    if (this.#waiting) throw new SessionError('protocol');

    const response = new Promise((resolve, reject) => {
      this.#waiting = { replies, skip, allowOther, onReply, resolve, reject };
    });
    try {
      this.send(command, fields);
      // The first service request is plain. Each socket owns its key thereafter.
      if (nextKey) this.#key = nextKey.slice();
      return await bounded(response, signal);
    } finally {
      this.#waiting = null;
    }
  }

  expireOn(command) {
    this.#expireCommand = command;
  }

  observe(commands, receive) {
    this.#observer = { commands, receive };
    return () => { this.#observer = null; };
  }

  async close(logout, { waitForPeer = false } = {}) {
    if (!this.#reason) {
      this.#reason = 'closed';
      let sentLogout = false;
      if (logout !== undefined && this.#socket.readyState === WebSocket.OPEN) {
        try {
          this.#socket.send(encodeCommand(logout, [], this.#key));
          sentLogout = true;
        } catch {
          // Closing the connection also detaches the session on the server.
        }
      }
      if (!waitForPeer || !sentLogout) this.#closeTransport();
    }
    try {
      await bounded(this.closed, undefined, CLOSE_TIMEOUT);
    } catch {
      this.#closeTransport();
      this.#finishClose();
    }
  }

  #receive(data) {
    if (this.#reason) return;
    try {
      this.#parser.push(data, (body) => {
        if (this.#reason) return;
        applySessionKey(body, this.#key);
        const reply = readReply(body);
        const waiter = this.#waiting;
        if (waiter?.replies.includes(reply.command)) {
          waiter.onReply?.();
          this.#waiting = null;
          waiter.resolve(reply);
        } else if (this.#observer?.commands.includes(reply.command)) {
          this.#observer.receive(reply);
        } else if (reply.command === this.#expireCommand) {
          this.#fail(new SessionError('network'), 'expired');
        } else if (waiter && !waiter.allowOther && !waiter.skip?.includes(reply.command)) {
          throw new SessionError('protocol');
        }
      });
    } catch {
      this.#fail(new SessionError('protocol'));
    }
  }

  #fail(error, reason = 'network') {
    this.#reason ??= reason;
    this.#fault ??= error;
    this.#resolveOpen(false);
    this.#waiting?.reject(this.#fault);
    if (this.#reason !== 'closed') this.#onStartupFailure?.(this.#fault);
    this.#closeTransport();
  }

  #closeTransport() {
    if (this.#socket.readyState < WebSocket.CLOSING) this.#socket.close(1000);
  }

  #finishClose() {
    this.#socket.onopen = this.#socket.onmessage = this.#socket.onerror = this.#socket.onclose = null;
    this.#key?.fill(0);
    this.#key = null;
    this.#observer = null;
    this.#parser.reset();
    this.#resolveOpen(false);
    const error = this.#fault ?? new SessionError('network');
    this.#waiting?.reject(error);
    if (this.#reason !== 'closed') this.#onStartupFailure?.(error);
    this.#resolveClose(this.#reason ?? 'network');
  }
}

function authReply(reply, expected) {
  if (reply.command === expected) return reply;
  if (reply.command === 4) throw new SessionError('network');
  throw new SessionError('credentials');
}

function observeInitialData(socket, signal) {
  const decoding = new AbortController();
  let versions;
  let profileStarted = false;
  let unsubscribe;
  const received = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([VERSION_COMMAND, AVATAR_COMMAND, REGISTRATION_COMMAND], (reply) => {
      try {
        if (reply.command === VERSION_COMMAND) {
          if (versions) throw new SessionError('protocol');
          versions = readVersions(reply);
        } else {
          if (!versions || profileStarted) throw new SessionError('protocol');
          profileStarted = true;
          // Anchor the original relative times at frame arrival, before async inflation.
          const receivedAt = performance.now();
          readDataProfile(reply, decoding.signal).then(
            ({ questData, ...profile }) => resolve({
              versions,
              ...profile,
              questData: questData ? { ...questData, receivedAt } : null,
            }),
            reject,
          );
        }
      } catch (error) {
        reject(error);
      }
    });
    socket.closed.then(() => reject(new SessionError('network')));
  });
  return {
    received: bounded(received, signal),
    dispose() {
      unsubscribe();
      decoding.abort();
    },
  };
}

async function confirmChannel(channel, playerId, sessionKey, signal) {
  const { socket } = channel;
  await socket.open(signal);
  const negotiation = await socket.ask(0, [playerId], [0, 2], { signal, nextKey: sessionKey });
  if (negotiation.command !== 0) throw new SessionError('protocol');
  const sign = negotiation.string(4);
  if (!/^\d{1,4}$/.test(sign) || negotiation.string(10) !== 'are you ok') {
    throw new SessionError('protocol');
  }
  negotiation.done();

  // This service sends the bootstrap immediately after its certificate in the same TCP stream.
  const initial = channel.port === DATA_PORT ? observeInitialData(socket, signal) : null;
  try {
    const login = socket.ask(1, ['yes, ok.', sign], [1, 2], { signal }).then((certificate) => {
      if (certificate.command !== 1) throw new SessionError('protocol');
      channel.verified = true;
      certificate.discardString(4096);
      certificate.discardString(4096);
      certificate.done();
      socket.expireOn(2);
    });
    const [, initialData] = await Promise.all([login, initial?.received]);
    return initialData;
  } finally {
    initial?.dispose();
  }
}

function closeChannel({ socket, verified, port }) {
  // The Quest server closes after removing its registration for this player.
  return socket.close(verified ? 2 : undefined, { waitForPeer: port === QUEST_PORT });
}

async function closeSession(auth, channels) {
  await Promise.all(channels.map(closeChannel));
  // AuthServer handles logout in its disconnect callback.
  await auth?.close();
}

async function queryQuest(playerId, sessionKey, signal, read) {
  const socket = new SessionSocket(QUEST_PORT);
  const channel = { socket, port: QUEST_PORT, verified: false };
  try {
    const confirm = () => confirmChannel(channel, playerId, sessionKey, signal);
    return await read(socket, confirm, signal);
  } catch (error) {
    throw error instanceof SessionError ? error : new SessionError('protocol');
  } finally {
    await closeChannel(channel);
  }
}

async function readQuestMapList(socket, confirm, signal) {
  await confirm();
  const reply = await socket.ask(QUEST_MAP_REQUEST, [QUEST_REGION], [QUEST_MAP_REPLY], {
    signal, allowOther: true,
  });
  return readQuestMapReply(reply, QUEST_REGION);
}

async function finishQuestObservation(socket, signal, unsubscribe) {
  // Stop collecting in frame dispatch, even when later events share the Pong's chunk.
  const pong = await socket.ask(3, [], [3], { signal, allowOther: true, onReply: unsubscribe });
  pong.done();
}

async function readQuestInventoryPushes(socket, confirm, signal) {
  const rows = [];
  let invalid = false;
  const unsubscribe = socket.observe([QUEST_INVENTORY_REPLY], (reply) => {
    if (invalid) return;
    try {
      const row = readQuestInventoryReply(reply);
      if (row.status === QUEST_PENDING) return;
      if (rows.length === MAX_QUEST_ROWS) throw new SessionError('protocol');
      rows.push(row);
    } catch {
      invalid = true;
    }
  });
  try {
    await confirm();
    // Ruby finishes the inventory resend in its login callback before handling KeepAlive.
    await finishQuestObservation(socket, signal, unsubscribe);
    if (invalid) throw new SessionError('protocol');
    return rows;
  } finally {
    unsubscribe();
  }
}

async function readQuestDiscovery(socket, confirm, signal, inventoryId) {
  // Recover a committed discovery when its original reply did not reach this session.
  const rows = await readQuestInventoryPushes(socket, confirm, signal);
  const existing = rows.find((row) => row.inventoryId === inventoryId && row.questId > 0);
  if (existing) return existing;

  let discovered = null;
  const unsubscribe = socket.observe([QUEST_DISCOVERY_REPLY], (reply) => {
    try {
      const row = readQuestDiscoveryReply(reply);
      if (row.inventoryId === inventoryId && row.status === QUEST_NEW && row.questId > 0) {
        discovered ??= row;
      }
    } catch {
      // An invalid state notification cannot confirm this quest.
    }
  });
  try {
    signal.throwIfAborted();
    socket.send(QUEST_DISCOVERY_REQUEST, [inventoryId]);
    await finishQuestObservation(socket, signal, unsubscribe);
    return discovered;
  } finally {
    unsubscribe();
  }
}

async function submitQuestSearch(socket, confirm, signal, mapId, inventoryIds, markDispatched) {
  const existing = await readQuestInventoryPushes(socket, confirm, signal);
  const known = new Set(inventoryIds);
  for (const { inventoryId } of existing) known.add(inventoryId);

  let row = null;
  let energy = null;
  let rejection = null;
  let invalid = false;
  const unsubscribe = socket.observe([QUEST_SEARCH_REPLY, QUEST_ENERGY_REPLY, QUEST_ERROR_REPLY], (reply) => {
    if (invalid) return;
    try {
      switch (reply.command) {
        case QUEST_SEARCH_REPLY: {
          const receivedAt = performance.now();
          const added = readQuestSearchReply(reply);
          if (!added) break; // The original may resend untimed rows on rejection.
          if (row || known.has(added.inventoryId)) invalid = true;
          else row = { ...added, receivedAt };
          break;
        }
        case QUEST_ENERGY_REPLY: {
          const update = readQuestEnergyReply(reply);
          // The original sends the timed inventory row before spending the energy.
          if (!row) break;
          if (energy !== null) invalid = true;
          else energy = update.energy;
          break;
        }
        case QUEST_ERROR_REPLY: {
          const code = readQuestErrorReply(reply);
          if (rejection !== null || !QUEST_SEARCH_ERRORS.has(code)) invalid = true;
          else rejection = code;
          break;
        }
      }
    } catch {
      invalid = true;
    }
  });
  try {
    signal.throwIfAborted();
    socket.send(QUEST_SEARCH_REQUEST, [mapId, QUEST_SEARCH_TIMER]);
    markDispatched();
    await finishQuestObservation(socket, signal, unsubscribe);
    if (!invalid && rejection !== null && !row) return { rejection };
    if (!invalid && rejection === null && row && energy !== null) return { row, energy };
    throw new SessionError('search-uncertain');
  } finally {
    unsubscribe();
  }
}

function isStartableQuest(row) {
  return row?.questId > 0 && (row.status === QUEST_NEW || row.status === QUEST_UNSOLVED);
}

async function submitQuestStart(socket, confirm, signal, selected, deckIndex, markDispatched) {
  const rows = await readQuestInventoryPushes(socket, confirm, signal);
  const current = rows.find(({ inventoryId }) => inventoryId === selected.inventoryId);
  if (!isStartableQuest(current) || current.questId !== selected.questId) {
    throw new SessionError('quest-start-unavailable');
  }

  let energy = null;
  let deleted = false;
  let acknowledged = false;
  let unsubscribe;
  const notification = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([QUEST_ENERGY_REPLY, QUEST_DISCOVERY_REPLY, QUEST_DELETED_REPLY, QUEST_ERROR_REPLY], (reply) => {
      if (acknowledged) return;
      try {
        switch (reply.command) {
          case QUEST_ENERGY_REPLY:
            if (energy !== null) throw new SessionError('protocol');
            energy = readQuestEnergyReply(reply).energy;
            break;
          case QUEST_DISCOVERY_REPLY: {
            const row = readQuestDiscoveryReply(reply);
            if (row.inventoryId !== selected.inventoryId || row.questId !== selected.questId
                || row.status !== QUEST_IN_PROGRESS) break;
            if (energy === null || deleted) throw new SessionError('protocol');
            acknowledged = true;
            resolve({ row, energy });
            break;
          }
          case QUEST_DELETED_REPLY:
            if (readQuestDeletedReply(reply) === selected.inventoryId) deleted = true;
            break;
          case QUEST_ERROR_REPLY: {
            const code = readQuestErrorReply(reply);
            if (!QUEST_START_ERRORS.has(code) || energy !== null || (deleted && code !== QUEST_MISSING_ERROR)) {
              throw new SessionError('protocol');
            }
            acknowledged = true;
            resolve({ rejection: code, deleted });
            break;
          }
        }
      } catch {
        acknowledged = true;
        reject(new SessionError('protocol'));
      }
    });
  });
  try {
    signal.throwIfAborted();
    socket.send(QUEST_START_REQUEST, [selected.inventoryId, signedByte(deckIndex)]);
    markDispatched();
    const interrupted = socket.closed.then(() => { throw new SessionError('network'); });
    const result = await bounded(Promise.race([notification, interrupted]), signal);
    if (result.row) {
      // The original persists the deck lock after emitting the quest-state update.
      await finishQuestObservation(socket, signal, unsubscribe);
    }
    return result;
  } finally {
    unsubscribe();
  }
}

function activeSession(auth, channels, playerId, sessionKey, { questData, ...initialData }) {
  let closing;
  let questRequest;
  let searchUncertain = false;
  let questStartUncertain = false;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });

  function stop(reason) {
    if (!closing) {
      clearInterval(timer);
      initialData = null;
      questData = null;
      sessionKey.fill(0);
      const request = questRequest;
      request?.controller.abort(new SessionError(reason === 'closed' ? 'cancelled' : 'network'));
      closing = (async () => {
        if (request) await request.task.catch(() => {});
        await closeSession(auth, channels);
        resolveClosed(reason);
      })();
    }
    return closing;
  }

  async function readFromQuest(read, signal, reconcile) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (!initialData) throw new SessionError('network');
    if (questRequest) throw new SessionError('busy');
    auth.assertOpen();
    for (const { socket } of channels) socket.assertOpen();

    const controller = new AbortController();
    const cancel = () => controller.abort(new SessionError('cancelled'));
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(new SessionError('timeout')), TIMEOUT);
    const task = queryQuest(playerId, sessionKey, controller.signal, read);
    questRequest = { controller, task };
    try {
      const result = await task;
      controller.signal.throwIfAborted();
      return reconcile ? reconcile(result) : result;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      questRequest = null;
    }
  }

  const timer = setInterval(async () => {
    try {
      const replies = await Promise.all([
        auth.ask(6, [], [7], { allowOther: true }),
        ...channels.map(({ socket, pong }) => socket.ask(3, [], [pong], { allowOther: true })),
      ]);
      for (const reply of replies) reply.done();
    } catch (error) {
      void stop(error.kind === 'timeout' ? 'expired' : 'network');
    }
  }, HEARTBEAT);

  Promise.race([auth.closed, ...channels.map(({ socket }) => socket.closed)])
    .then((reason) => stop(reason));
  return {
    playerId,
    lobbyVerified: true,
    dataVerified: true,
    chatVerified: true,
    get initialData() { return initialData; },
    async readQuestInventory({ signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      if (!initialData.avatar) return null;
      if (!questData) throw new SessionError('protocol');
      return { ...questData, rows: questData.rows.map((row) => ({ ...row })) };
    },
    async readQuestMaps({ signal } = {}) {
      return readFromQuest(readQuestMapList, signal);
    },
    async readQuestServiceInventory({ signal } = {}) {
      return readFromQuest(readQuestInventoryPushes, signal);
    },
    async startQuestSearch({ signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      if (questRequest) throw new SessionError('busy');
      if (searchUncertain) throw new SessionError('search-uncertain');

      const mapId = questData?.questFlag + 1;
      if (!initialData.avatar || !Number.isInteger(mapId) || mapId < 1 || mapId > MAX_QUEST_MAP_ID) {
        throw new SessionError('protocol');
      }
      const inventoryIds = questData.rows.map(({ inventoryId }) => inventoryId);
      let sent = false;
      try {
        return await readFromQuest(
          (socket, confirm, questSignal) => submitQuestSearch(socket, confirm, questSignal, mapId, inventoryIds, () => {
            sent = true;
            searchUncertain = true;
          }),
          signal,
          (result) => {
            if (result.rejection !== undefined) {
              searchUncertain = false;
              throw new SessionError('search-rejected', result.rejection);
            }
            const { row, energy } = result;
            questData.rows.push(row);
            initialData.avatar.energy = energy;
            searchUncertain = false;
            return { row: { ...row }, energy };
          },
        );
      } catch (error) {
        // Replaying a search without a result could create another row and spend more energy.
        if (sent && searchUncertain) throw new SessionError('search-uncertain');
        throw error;
      }
    },
    async checkQuestDiscovery(inventoryId, { signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      if (!questData || !Number.isInteger(inventoryId) || inventoryId < 1 || inventoryId > 0x7fffffff) {
        throw new SessionError('protocol');
      }
      const index = questData.rows.findIndex((row) => row.inventoryId === inventoryId);
      if (index < 0) return null;
      const row = questData.rows[index];
      if (row.status !== QUEST_PENDING) return row.questId > 0 ? { ...row } : null;

      return readFromQuest(
        (socket, confirm, questSignal) => readQuestDiscovery(socket, confirm, questSignal, inventoryId),
        signal,
        (confirmed) => {
          if (!confirmed) return null;
          questData.rows[index] = confirmed;
          return { ...confirmed };
        },
      );
    },
    async startQuest(inventoryId, deckIndex, { signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      if (questRequest) throw new SessionError('busy');
      if (questStartUncertain) throw new SessionError('quest-start-uncertain');
      if (!questData || !Number.isInteger(inventoryId) || inventoryId < 1 || inventoryId > 0x7fffffff
          || !Number.isInteger(deckIndex) || deckIndex < 1 || deckIndex > 127) {
        throw new SessionError('protocol');
      }
      const index = questData.rows.findIndex((row) => row.inventoryId === inventoryId);
      const selected = questData.rows[index];
      const avatar = initialData.avatar;
      if (!isStartableQuest(selected) || !avatar?.questDecks?.some(({ index }) => index === deckIndex)) {
        throw new SessionError('quest-start-unavailable');
      }

      let sent = false;
      try {
        return await readFromQuest(
          (socket, confirm, questSignal) => submitQuestStart(socket, confirm, questSignal, selected, deckIndex, () => {
            sent = true;
            questStartUncertain = true;
          }),
          signal,
          (result) => {
            if (result.rejection !== undefined) {
              if (result.deleted) questData.rows.splice(index, 1);
              questStartUncertain = false;
              throw new SessionError('quest-start-rejected', result.rejection);
            }
            const row = { ...result.row, deckIndex };
            questData.rows[index] = row;
            avatar.energy = result.energy;
            avatar.questDecks = avatar.questDecks.filter(({ index }) => index !== deckIndex);
            questStartUncertain = false;
            return { row: { ...row }, energy: result.energy, deckIndex };
          },
        );
      } catch (error) {
        // Only a verified rejection can make it safe to send another start.
        if (sent && questStartUncertain) throw new SessionError('quest-start-uncertain');
        throw error;
      }
    },
    closed,
    close: () => stop('closed'),
  };
}

export async function startSession(username, password, { signal } = {}) {
  if (signal?.aborted) throw new SessionError('cancelled');
  if (typeof username !== 'string' || typeof password !== 'string'
    || !LOGIN_FIELD.test(username) || !LOGIN_FIELD.test(password)) {
    throw new SessionError('credentials');
  }

  let auth;
  let sessionKeyBytes;
  const channels = [];
  const startup = new AbortController();
  const startupSignal = startup.signal;
  const rejectStartup = (error) => startup.abort(error);
  const cancelStartup = () => rejectStartup(new SessionError('cancelled'));
  signal?.addEventListener('abort', cancelStartup, { once: true });

  function finishStartup() {
    signal?.removeEventListener('abort', cancelStartup);
    auth?.finishStartup();
    for (const { socket } of channels) socket.finishStartup();
  }

  try {
    const exchange = createAuthExchange();
    auth = new SessionSocket(AUTH_PORT, rejectStartup);
    await auth.open(startupSignal);

    const challenge = authReply(await auth.ask(1, [username, exchange.publicKey], [1, 3, 4, 8, 9], {
      signal: startupSignal, skip: [7],
    }), 1);
    const salt = challenge.string(64);
    const serverPublicKey = challenge.string(66);
    challenge.done();
    const { proof, sessionKey, verify } = await bounded(
      exchange.answer(username, password, salt, serverPublicKey), startupSignal,
    );
    password = '';

    const certificate = authReply(await auth.ask(2, [proof], [2, 3, 4, 8, 9], {
      signal: startupSignal, skip: [7],
    }), 2);
    const cert = certificate.string(40);
    const playerId = certificate.uint();
    certificate.done();
    if (!playerId || !/^[0-9a-f]{40}$/.test(sessionKey)
      || !await bounded(Promise.resolve(verify(cert)), startupSignal)) {
      throw new SessionError('protocol');
    }
    sessionKeyBytes = Uint8Array.from(sessionKey.match(/../g), (pair) => Number.parseInt(pair, 16));
    auth.expireOn(8);

    let initialData;
    for (const { port, pong } of CHANNELS) {
      startupSignal.throwIfAborted();
      const channel = { socket: new SessionSocket(port, rejectStartup), port, pong, verified: false };
      channels.push(channel);
      const data = await confirmChannel(channel, playerId, sessionKeyBytes, startupSignal);
      if (data) initialData = data;
    }
    startupSignal.throwIfAborted();
    auth.assertOpen();
    for (const { socket } of channels) socket.assertOpen();
    finishStartup();
    return activeSession(auth, channels, playerId, sessionKeyBytes, initialData);
  } catch (error) {
    finishStartup();
    sessionKeyBytes?.fill(0);
    await closeSession(auth, channels);
    throw error instanceof SessionError ? error : new SessionError('protocol');
  }
}
