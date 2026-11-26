import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
const wasmPath = process.argv[3];
const seed = 3407;
const timeoutMs = 5000;
const statuses = ["playing", "won", "lost", "draw"];

async function request(path, body) {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path} returned non-JSON (${response.status}): ${raw.slice(0, 200)}`, { cause: error });
  }
  return { status: response.status, payload };
}

async function successful(path, body) {
  const { status, payload } = await request(path, body);
  assert.ok(status >= 200 && status < 300, `${path}: ${status} ${JSON.stringify(payload)}`);
  return payload;
}

function matchPath(id) {
  return `/api/matches/${encodeURIComponent(id)}`;
}

function verifySnapshot(snapshot, actions, expectedId) {
  assert.equal(typeof snapshot.id, "string");
  assert.ok(snapshot.id.length > 0);
  if (expectedId !== undefined) assert.equal(snapshot.id, expectedId);
  assert.equal(snapshot.seed, seed);
  const { view } = snapshot;
  assert.deepEqual(snapshot.history, actions, "Server history contains the accepted commands in order");
  assert.equal(view.revision, actions.length, "Each accepted command advances the revision once");
  assert.ok(statuses.includes(view.status));
  for (const number of [view.turn, view.revision, view.energy, view.max_energy, view.deck_count]) {
    assert.ok(Number.isSafeInteger(number) && number >= 0);
  }
  assert.ok(view.energy <= view.max_energy);
  for (const side of [view.player, view.opponent]) {
    for (const number of [side.hp, side.max_hp, side.shield]) {
      assert.ok(Number.isSafeInteger(number) && number >= 0);
    }
    assert.ok(side.max_hp > 0 && side.hp <= side.max_hp);
  }
  assert.ok(!("hand" in view.opponent), "Snapshot must keep the opponent hand private");
  assert.ok(Array.isArray(view.hand));
  assert.equal(new Set(view.hand.map((card) => card.id)).size, view.hand.length);
  for (const card of view.hand) {
    for (const value of [card.id, card.name, card.kind, card.description]) {
      assert.ok(typeof value === "string" && value.length > 0);
    }
    assert.ok(Number.isSafeInteger(card.cost) && card.cost >= 0);
    assert.ok(Number.isSafeInteger(card.power));
  }
  assert.ok(Array.isArray(view.events));
  for (let index = 1; index < view.events.length; index += 1) {
    assert.ok(view.events[index].seq > view.events[index - 1].seq, "Events are in sequence order");
  }
}

function observeMatch(id) {
  const url = new URL(`${matchPath(id)}/ws`, base);
  url.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  const received = [];
  socket.addEventListener("message", ({ data }) => received.push(data));

  async function waitFor(predicate, description) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const message = received.map((item) => JSON.parse(item)).find(predicate);
      if (message) return message;
      assert.notEqual(socket.readyState, WebSocket.CLOSED, `WebSocket closed before ${description}`);
      await delay(20);
    }
    assert.fail(`WebSocket did not send ${description}`);
  }

  return {
    atRevision(revision) {
      return waitFor((message) => message.view?.revision === revision, `revision ${revision}`);
    },
    error(status) {
      return waitFor((message) => message.status === status && message.error, `error ${status}`);
    },
    send(command) {
      socket.send(JSON.stringify(command));
    },
    close() {
      socket.close();
    },
  };
}

function expectClientError(response, message) {
  assert.ok(response.status >= 400 && response.status < 500, message);
  assert.ok(typeof response.payload.error === "string" && response.payload.error.length > 0, message);
}

function aggressiveAction(view) {
  const affordable = view.hand.filter((card) => card.cost <= view.energy);
  const attack = affordable
    .filter((card) => card.kind === "strike")
    .sort((left, right) => (right.power - left.power) || (left.cost - right.cost))[0];
  const card = attack ?? affordable.find((candidate) => candidate.kind !== "repair"
    || view.player.hp < view.player.max_hp);
  return card ? { type: "play", card_id: card.id } : { type: "end_turn" };
}

async function runMatch(selectAction, expectedStatus, verifyTransport) {
  const actions = [];
  const initial = await successful("/api/matches", { seed });
  verifySnapshot(initial, actions);
  assert.equal(initial.view.status, "playing");
  assert.ok(initial.view.hand.length > 0);
  const path = matchPath(initial.id);
  assert.deepEqual(await successful(path), initial, "GET returns exactly the created state");
  const stream = verifyTransport ? observeMatch(initial.id) : undefined;
  let snapshot = initial;

  try {
    if (stream) {
      assert.deepEqual(await stream.atRevision(initial.view.revision), initial);
      const illegal = { revision: initial.view.revision, type: "play", card_id: "nonexistent-smoke-card" };
      expectClientError(await request(`${path}/actions`, illegal), "Missing cards are rejected");
      assert.deepEqual(await successful(path), initial, "An invalid move has no effects");

      const firstAction = selectAction(snapshot.view);
      assert.equal(firstAction.type, "play");
      const command = { revision: initial.view.revision, ...firstAction };
      const responses = await Promise.all([
        request(`${path}/actions`, command),
        request(`${path}/actions`, command),
      ]);
      const accepted = responses.filter(({ status }) => status >= 200 && status < 300);
      const conflicts = responses.filter(({ status }) => status === 409);
      assert.equal(accepted.length, 1, "A repeated revision succeeds exactly once");
      assert.equal(conflicts.length, 1, "A concurrent repeat conflicts");
      expectClientError(conflicts[0], "Stale revisions are rejected");
      snapshot = accepted[0].payload;
      actions.push(firstAction);
      verifySnapshot(snapshot, actions, initial.id);
      assert.deepEqual(await stream.atRevision(snapshot.view.revision), snapshot);
      assert.deepEqual(await successful(path), snapshot, "The repeated command has no additional effects");

      stream.send(command);
      await stream.error(409);
      assert.deepEqual(await successful(path), snapshot, "A stale WebSocket move has no effects");

      const wsRevision = snapshot.view.revision;
      const wsAction = selectAction(snapshot.view);
      stream.send({ revision: wsRevision, ...wsAction });
      const pushed = await stream.atRevision(wsRevision + 1);
      actions.push(wsAction);
      snapshot = await successful(path);
      verifySnapshot(snapshot, actions, initial.id);
      assert.deepEqual(snapshot, pushed, "HTTP recovers the history after an accepted WebSocket move");
    }

    while (snapshot.view.status === "playing" && actions.length < 150) {
      const previousRevision = snapshot.view.revision;
      const action = selectAction(snapshot.view);
      snapshot = await successful(`${path}/actions`, { revision: previousRevision, ...action });
      actions.push(action);
      verifySnapshot(snapshot, actions, initial.id);
    }

    assert.equal(snapshot.view.status, expectedStatus, `Expected ${expectedStatus} after ${actions.length} moves`);
    assert.deepEqual(await successful(path), snapshot);
    if (stream) {
      assert.deepEqual(await stream.atRevision(snapshot.view.revision), snapshot);
      const reconnected = observeMatch(initial.id);
      try {
        assert.deepEqual(await reconnected.atRevision(snapshot.view.revision), snapshot);
      } finally {
        reconnected.close();
      }
    }
    const afterFinish = { revision: snapshot.view.revision, type: "end_turn" };
    expectClientError(await request(`${path}/actions`, afterFinish), "Finished matches reject further moves");
    assert.deepEqual(await successful(path), snapshot);
    return { snapshot, initial };
  } finally {
    stream?.close();
  }
}

async function verifyWasm(path, runs) {
  const { instance } = await WebAssembly.instantiate(await readFile(path));
  const { memory, allocate, deallocate, replay } = instance.exports;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });

  function run(input) {
    const bytes = encoder.encode(JSON.stringify(input));
    const inputPointer = allocate(bytes.length);
    assert.ok(inputPointer > 0);
    try {
      new Uint8Array(memory.buffer, inputPointer, bytes.length).set(bytes);
      const packed = replay(inputPointer, bytes.length);
      const outputPointer = Number((packed >> 32n) & 0xffffffffn);
      const outputLength = Number(packed & 0xffffffffn);
      assert.ok(outputPointer > 0 && outputLength > 0);
      try {
        return JSON.parse(decoder.decode(new Uint8Array(memory.buffer, outputPointer, outputLength)));
      } finally {
        deallocate(outputPointer, outputLength);
      }
    } finally {
      deallocate(inputPointer, bytes.length);
    }
  }

  for (const { snapshot } of runs) {
    const { seed, history, view } = snapshot;
    const result = run({ seed, actions: history });
    assert.equal(result.ok, true);
    assert.deepEqual(result.view, view, `Wasm and server agree on the ${view.status} replay`);
  }
  const rejected = run({ seed, actions: [{ type: "play", card_id: "nonexistent-smoke-card" }] });
  assert.equal(rejected.ok, false);
  assert.ok(typeof rejected.error === "string" && rejected.error.length > 0);
}

assert.deepEqual(await successful("/api/health"), { ok: true });
const victory = await runMatch(aggressiveAction, "won", true);
const defeat = await runMatch(() => ({ type: "end_turn" }), "lost", false);
assert.notEqual(victory.initial.id, defeat.initial.id, "A restart creates an isolated match");
assert.deepEqual(victory.initial.view, defeat.initial.view, "The same seed starts the same match");
console.log(`HTTP and WebSocket passed. With seed ${seed}, server history records victory in ${victory.snapshot.history.length} moves and defeat in ${defeat.snapshot.history.length} moves.`);
if (wasmPath) {
  await verifyWasm(wasmPath, [victory, defeat]);
  console.log("Wasm reproduces both server results from their authoritative history and rejects invalid replay commands.");
}
