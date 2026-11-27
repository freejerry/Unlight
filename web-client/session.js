import { createAuthExchange } from './srp.js';
import { applySessionKey, createFrameParser, encodeCommand, readReply, signedByte } from './wire.js';
import {
  AVATAR_COMMAND, REGISTRATION_COMMAND, VERSION_COMMAND, readDataProfile, readVersions,
} from './data-bootstrap.js';
import {
  QUEST_DISCOVERY_REQUEST, QUEST_DISCOVERY_REPLY, QUEST_INVENTORY_REPLY, QUEST_MAP_REQUEST, QUEST_MAP_REPLY,
  QUEST_SEARCH_REQUEST, QUEST_SEARCH_REPLY, QUEST_SEARCH_TIMER, QUEST_ENERGY_REPLY, QUEST_ERROR_REPLY,
  QUEST_START_REQUEST, QUEST_DELETED_REPLY,
  QUEST_NEXT_LAND_REQUEST, QUEST_NEXT_LAND_REPLY, QUEST_ENCOUNTER_REPLY, QUEST_DUEL_START_REPLY,
  QUEST_PROGRESS_REPLY, QUEST_DECK_STATE_REPLY, QUEST_FINISH_REPLY,
  QUEST_READY_REQUEST, QUEST_DIRECTION_REQUEST, QUEST_MOVE_COMMIT_REQUEST, QUEST_TURN_REPLY,
  QUEST_MOVE_CARD_ADD_REQUEST, QUEST_MOVE_CARD_REMOVE_REQUEST, QUEST_MOVE_CARD_ADD_REPLY, QUEST_MOVE_CARD_REMOVE_REPLY,
  QUEST_ACTION_REFILL_REPLY, QUEST_EVENT_REFILL_REPLY, QUEST_MOVE_PHASE_START_REPLY,
  QUEST_MOVE_PHASE_FINISH_REPLY, QUEST_MOVE_RESULT_REPLY, QUEST_DIRECTION_REPLY, QUEST_ATTACK_PHASE_START_REPLY,
  QUEST_ATTACK_CARD_ADD_REQUEST, QUEST_ATTACK_CARD_REMOVE_REQUEST, QUEST_ATTACK_DONE_REQUEST,
  QUEST_DEFENCE_CARD_ADD_REQUEST, QUEST_DEFENCE_CARD_REMOVE_REQUEST, QUEST_DEFENCE_DONE_REQUEST,
  QUEST_ATTACK_PHASE_FINISH_REPLY, QUEST_DEFENCE_PHASE_START_REPLY, QUEST_DEFENCE_PHASE_FINISH_REPLY,
  QUEST_BATTLE_CARDS_REPLY, QUEST_BATTLE_DICE_REPLY, QUEST_BATTLE_CARD_ADD_REPLY, QUEST_BATTLE_CARD_REMOVE_REPLY,
  QUEST_DAMAGE_REPLY, QUEST_HIT_POINT_REPLY, QUEST_DUEL_FINISH_REPLY, QUEST_DEAD_CHARA_CHANGE_REPLY, QUEST_TURN_FINISH_REPLY,
  QUEST_CHARA_CHANGE_START_REPLY, QUEST_CHARA_CHANGE_FINISH_REPLY, QUEST_DEAD_CHARA_CHANGE_FINISH_REPLY,
  QUEST_CHARA_CHANGE_REQUEST, QUEST_CHARA_CHANGE_REPLY, QUEST_ROSTER_HP_REPLIES, QUEST_CHARA_REVIVE_REPLY,
  QUEST_CHARA_TRANSFORM_REPLY,
  QUEST_HAND_EFFECT_REPLIES,
  QUEST_EXP_REPLY, QUEST_LEVEL_REPLY, QUEST_GEMS_REPLY, QUEST_MAP_FLAG_REPLY, QUEST_MAP_CLEAR_COUNT_REPLY,
  QUEST_CHARACTER_AWARD_REPLY,
  readQuestDeletedReply, readQuestDiscoveryReply, readQuestInventoryReply, readQuestMapReply,
  readQuestSearchReply, readQuestEnergyReply, readQuestErrorReply,
  readQuestNextLandReply, readQuestEncounterReply, readQuestDuelStartReply,
  readQuestProgressReply, readQuestDeckStateReply, readQuestFinishReply,
  readQuestTurnReply, readQuestRefillReply, readQuestMovePhaseReply,
  readQuestDirectionReply, readQuestMoveCardReply, readQuestMoveResultReply, readQuestAttackPhaseReply,
  readQuestDefencePhaseReply, readQuestBattleCardReply, readQuestBattleCardsReply, readQuestBattleDiceReply,
  readQuestDuelFinishReply, readQuestCombatBoundaryReply,
  readQuestHandEffectReply,
  readQuestCharaChangeReply, readQuestRosterHpReply, readQuestCharaTransformReply,
  readQuestSettlementValueReply, readQuestCharacterAwardReply,
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
const QUEST_LAND_SLOTS = 15;
const MAX_QUEST_MAP_ID = 35; // Ordinary Traditional Chinese quest maps.
const QUEST_SEARCH_ERRORS = new Set([1, 30, 31, 32]); // Original get_quest return codes.
const QUEST_START_ERRORS = new Set([1, 16, 40, 41, 42]); // Original quest_start return codes.
const QUEST_LAND_REJECTIONS = new Set([16, 41, 42, 43]); // Before the original next-land commit.
const QUEST_MISSING_ERROR = 40;
const DIRECTION_PENDING = 2;
const DIRECTION_CHARA_CHANGE = 3;
const QUEST_TURN_REPLIES = [
  QUEST_TURN_REPLY, QUEST_ACTION_REFILL_REPLY, QUEST_EVENT_REFILL_REPLY, QUEST_MOVE_PHASE_START_REPLY,
];
const CHANNELS = [
  { port: 12002, pong: 35 },
  { port: DATA_PORT, pong: 3 },
  { port: 12020, pong: 3 },
];
const TIMEOUT = 8000;
const QUEST_MOVE_WAIT = 120_000; // Original Ruby INIT_WAIT_TIME.
const QUEST_COMBAT_WAIT = 120_000; // Original Ruby BATTLE_WAIT_TIME.
const QUEST_COMBAT_COMMANDS = {
  attack: { add: QUEST_ATTACK_CARD_ADD_REQUEST, remove: QUEST_ATTACK_CARD_REMOVE_REQUEST, done: QUEST_ATTACK_DONE_REQUEST },
  defense: { add: QUEST_DEFENCE_CARD_ADD_REQUEST, remove: QUEST_DEFENCE_CARD_REMOVE_REQUEST, done: QUEST_DEFENCE_DONE_REQUEST },
};
const QUEST_COMBAT_REPLIES = [
  QUEST_ATTACK_PHASE_START_REPLY, QUEST_ATTACK_PHASE_FINISH_REPLY, QUEST_DEFENCE_PHASE_START_REPLY,
  QUEST_DEFENCE_PHASE_FINISH_REPLY, QUEST_BATTLE_CARDS_REPLY, QUEST_BATTLE_DICE_REPLY,
  QUEST_DEAD_CHARA_CHANGE_REPLY, QUEST_TURN_FINISH_REPLY,
  QUEST_CHARA_CHANGE_START_REPLY, QUEST_CHARA_CHANGE_FINISH_REPLY, QUEST_DEAD_CHARA_CHANGE_FINISH_REPLY,
];
const QUEST_SETTLEMENT_REPLIES = [
  QUEST_DUEL_FINISH_REPLY, QUEST_FINISH_REPLY, QUEST_DELETED_REPLY, QUEST_PROGRESS_REPLY, QUEST_DECK_STATE_REPLY,
  QUEST_EXP_REPLY, QUEST_LEVEL_REPLY, QUEST_GEMS_REPLY, QUEST_MAP_FLAG_REPLY, QUEST_MAP_CLEAR_COUNT_REPLY,
  QUEST_CHARACTER_AWARD_REPLY, QUEST_ENERGY_REPLY,
];
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
  'quest-land-unavailable': '此任務目前無法進入第一個地形。',
  'quest-land-rejected': '遊戲服務未接受進入地形。',
  'quest-land-uncertain': '地形進入結果未確認，本次登入暫停再次派出。',
  'quest-adventure-active': '本次登入已有任務地形工作階段。',
  'quest-battle-unavailable': '原版對局目前不接受這項操作。',
  'quest-battle-uncertain': '對局操作結果未確認，本次對局暫停操作。',
  'quest-direction-rejected': '遊戲服務未接受這個移動方向。',
  'quest-card-unavailable': '目前無法移動這張卡。',
  'quest-card-rejected': '遊戲服務未接受移動這張卡。',
  'quest-character-unavailable': '目前無法選擇這張角色卡。',
  'quest-character-overridden': '原版伺服器選擇了其他角色。',
  'quest-return-unavailable': '任務服務尚未確認可返回地圖。',
  'quest-return-uncertain': '未能確認原版任務連線已釋放。',
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
  #cleanPeerClose = false;
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
    this.#socket.onclose = (event) => this.#finishClose(event);
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
    const observer = { commands, receive };
    this.#observer = observer;
    return () => { if (this.#observer === observer) this.#observer = null; };
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

  async releaseQuest(signal) {
    signal.throwIfAborted();
    this.send(2, []);
    this.#reason = 'closed';
    try {
      await bounded(this.closed, signal, CLOSE_TIMEOUT);
      signal.throwIfAborted();
      if (!this.#cleanPeerClose) throw new SessionError('network');
    } catch (error) {
      this.#closeTransport();
      throw error;
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

  #finishClose(event) {
    this.#cleanPeerClose = event?.wasClean === true && event.code === 1000 && this.#fault === null;
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
  const channel = { socket, port: QUEST_PORT, verified: false, retained: false };
  try {
    const confirm = () => confirmChannel(channel, playerId, sessionKey, signal);
    return await read(socket, confirm, signal, channel);
  } catch (error) {
    throw error instanceof SessionError ? error : new SessionError('protocol');
  } finally {
    if (!channel.retained) await closeChannel(channel);
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

async function submitQuestLand(socket, signal, { inventoryId, deckIndex }, slot, markDispatched, markEncounter) {
  let arrived = false;
  let encounter = null;
  let progress = null;
  let finish = null;
  let deleted = false;
  let invalid = false;
  let unsubscribe;
  const notification = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([
      QUEST_NEXT_LAND_REPLY, QUEST_ENCOUNTER_REPLY, QUEST_DUEL_START_REPLY,
      QUEST_PROGRESS_REPLY, QUEST_FINISH_REPLY, QUEST_DELETED_REPLY, QUEST_ERROR_REPLY,
    ], (reply) => {
      if (invalid) return;
      try {
        switch (reply.command) {
          case QUEST_NEXT_LAND_REPLY:
            if (arrived) throw new SessionError('protocol');
            readQuestNextLandReply(reply, slot);
            arrived = true;
            break;
          case QUEST_ENCOUNTER_REPLY:
            if (!arrived || encounter || progress !== null || deleted) throw new SessionError('protocol');
            encounter = readQuestEncounterReply(reply);
            break;
          case QUEST_DUEL_START_REPLY: {
            if (!encounter) throw new SessionError('protocol');
            const duel = readQuestDuelStartReply(reply);
            unsubscribe();
            encounter = { ...encounter, duel };
            markEncounter(encounter);
            resolve({ slot, encounter, progress: null, finish: null });
            break;
          }
          case QUEST_PROGRESS_REPLY: {
            const update = readQuestProgressReply(reply);
            if (update.inventoryId !== inventoryId) break;
            if (!arrived || encounter || deleted || (update.progress & (1 << slot)) === 0) {
              throw new SessionError('protocol');
            }
            progress = update.progress;
            resolve(null); // The original callback may still settle this quest.
            break;
          }
          case QUEST_DELETED_REPLY:
            if (readQuestDeletedReply(reply) !== inventoryId) break;
            if (encounter) throw new SessionError('protocol');
            deleted = true;
            if (!arrived) {
              unsubscribe();
              resolve({ rejection: QUEST_MISSING_ERROR, deleted });
            }
            break;
          case QUEST_FINISH_REPLY: {
            const settled = readQuestFinishReply(reply);
            if (settled.inventoryId !== inventoryId) break;
            if (!arrived || encounter || !deleted || finish) throw new SessionError('protocol');
            finish = settled;
            resolve(null);
            break;
          }
          case QUEST_ERROR_REPLY: {
            const code = readQuestErrorReply(reply);
            if (arrived || !QUEST_LAND_REJECTIONS.has(code)) throw new SessionError('protocol');
            unsubscribe();
            resolve({ rejection: code });
            break;
          }
        }
      } catch {
        invalid = true;
        reject(new SessionError('protocol'));
      }
    });
  });
  try {
    signal.throwIfAborted();
    socket.send(QUEST_NEXT_LAND_REQUEST, [inventoryId, signedByte(deckIndex), signedByte(slot)]);
    markDispatched();
    const interrupted = socket.closed.then(() => { throw new SessionError('network'); });
    const result = await bounded(Promise.race([notification, interrupted]), signal);
    if (result) return result;

    await finishQuestObservation(socket, signal, unsubscribe);
    if (invalid || (deleted && !finish)) throw new SessionError('protocol');
    return { slot, encounter: null, progress, finish };
  } finally {
    unsubscribe();
  }
}

function validQuestCardId(cardId) {
  return Number.isInteger(cardId) && cardId > 0 && cardId <= 0x7fffffff;
}

function validQuestSlot(slot) {
  return Number.isInteger(slot) && slot >= 0 && slot < QUEST_LAND_SLOTS;
}

function questRun() {
  return {
    positions: null, progress: null, damage: null,
    avatar: { exp: null, gems: null, level: null, energy: null, energyMax: null },
    map: { questFlag: null, questClearNum: null },
    awards: new Map(),
  };
}

async function readQuestRoute(questId, signal) {
  const params = new URLSearchParams({ id: String(questId) });
  const response = await fetch(`/api/quest-catalog?${params}`, { signal });
  if (!response.ok) return null;
  const { quests } = await response.json();
  if (signal.aborted || !Array.isArray(quests) || quests.length !== 1 || quests[0].id !== questId) return null;
  const { positions } = quests[0];
  if (!Array.isArray(positions) || positions.length > QUEST_LAND_SLOTS) return null;
  const nodes = new Map();
  for (const { slot, id, name, caption, enemyId, nextSlots } of positions) {
    if (!validQuestSlot(slot) || nodes.has(slot) || !validQuestCardId(id) || typeof name !== 'string'
        || typeof caption !== 'string' || !Array.isArray(nextSlots) || nextSlots.length > 3
        || new Set(nextSlots).size !== nextSlots.length || nextSlots.some((next) => !validQuestSlot(next)
          || Math.floor(next / 3) !== Math.floor(slot / 3) + 1)) return null;
    nodes.set(slot, { slot, id, name, caption, enemyId: validQuestCardId(enemyId) ? enemyId : null, nextSlots });
  }
  if (positions.some(({ nextSlots }) => nextSlots.some((slot) => !nodes.has(slot)))) return null;
  return nodes;
}

function sameValues(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function questRoster(cardIds, damage) {
  if (cardIds.length < 1 || cardIds.length > 3) throw new SessionError('protocol');
  return {
    activeIndex: 0, // The original Entrant begins in slot zero.
    cards: cardIds.map((cardId, index) => ({
      index, cardId, seedDamage: damage[index], hp: null,
      alive: null,
    })),
  };
}

function observeQuestBattle(socket, { inventoryId, questId, deckIndex }, slot, encounter, run, applySettlement) {
  let phase = 'encounter';
  let turn = null;
  let startDistance = null;
  let direction = null;
  let ready = null;
  let result = null;
  let hand = null;
  let moveTable = null;
  let exchange = null;
  let previousExchange = null;
  let characterChange = null;
  let lastCharacterChange = null;
  const roster = {
    player: questRoster(encounter.playerCardIds, encounter.playerDamage),
    opponent: questRoster(encounter.opponentCardIds, encounter.opponentDamage),
  };
  const changedHp = new Set();
  const catalogRequests = new AbortController();
  const stockEventCards = new Map();
  const loadingEventCards = new Set();
  let duelFinish = null;
  let questFinish = null;
  let questDeleted = false;
  let settlement = null;
  const { avatar: settlementAvatar, map: settlementMap, awards } = run;
  const previousProgress = run.progress ?? 0;
  let progress = null;
  let arrivedDamage = null;
  let routeRequests = 0;
  let loadingRoute = false;
  let nextCombatReply;
  let combatDeadline;
  let readyParts = {};
  let readyStep = 0;
  let pending = null;
  let moveDeadline;
  let settlementTimer;

  async function loadStartingHp() {
    const ids = new Set(roster.player.cards.map((card) => card.cardId));
    const signal = AbortSignal.any([catalogRequests.signal, AbortSignal.timeout(3500)]);
    const params = new URLSearchParams({ ids: [...ids].join(',') });
    const response = await fetch(`/api/quest-character-cards?${params}`, { signal });
    if (!response.ok) return;
    const { cards } = await response.json();
    if (signal.aborted || !Array.isArray(cards) || cards.length > ids.size) return;
    const bases = new Map();
    for (const { id, hp } of cards) {
      if (!ids.has(id) || !Number.isInteger(hp) || hp < 0 || hp > 0x7fffffff || bases.has(id)) return;
      bases.set(id, hp);
    }
    // Quest passes the enemy-only HP adjustment separately; local HP uses the published base and SC37 damage.
    for (const card of roster.player.cards) {
      if (!bases.has(card.cardId) || changedHp.has(card)) continue;
      const hp = bases.get(card.cardId) - card.seedDamage;
      if (card.alive === true && hp <= 0) continue;
      card.hp = hp;
      card.alive = hp > 0;
    }
  }

  async function loadEventCards(refilled) {
    const ids = new Set(refilled.map(({ id }) => id).filter((id) => !stockEventCards.has(id) && !loadingEventCards.has(id)));
    if (ids.size === 0) return;
    const signal = AbortSignal.any([catalogRequests.signal, AbortSignal.timeout(3500)]);
    const params = new URLSearchParams();
    for (const id of ids) {
      params.append('id', String(id));
      loadingEventCards.add(id);
    }
    try {
      const response = await fetch(`/api/action-card-catalog?${params}`, { signal });
      if (!response.ok) return;
      const { cards } = await response.json();
      if (signal.aborted || !Array.isArray(cards) || cards.length > ids.size) return;
      const verified = new Map();
      for (const { id, eventNo, stockEventFiller } of cards) {
        if (!ids.has(id) || verified.has(id)) return;
        verified.set(id, eventNo === 0 && stockEventFiller === true);
      }
      for (const id of ids) stockEventCards.set(id, verified.get(id) === true);
    } finally {
      for (const id of ids) loadingEventCards.delete(id);
    }
  }

  function uncertain() {
    if (phase === 'closed') return;
    clearTimeout(settlementTimer);
    if (phase === 'moved' && exchange && exchange.phase !== 'complete' && exchange.phase !== 'terminal') {
      exchange.phase = 'uncertain';
    } else phase = 'uncertain';
    pending?.reject(new SessionError('quest-battle-uncertain'));
  }

  function receiveReady(reply) {
    if (phase === 'moved' && reply.command === QUEST_TURN_REPLY && exchange?.index === 2 && exchange.dice) {
      beginNextTurn();
    }
    if (phase === 'between-turns' && reply.command === QUEST_TURN_REPLY) phase = 'preparing';
    if (phase !== 'preparing' || QUEST_TURN_REPLIES[readyStep] !== reply.command) {
      throw new SessionError('protocol');
    }
    switch (reply.command) {
      case QUEST_TURN_REPLY: {
        const next = readQuestTurnReply(reply);
        if (next !== (ready?.turn ?? 0) + 1) throw new SessionError('protocol');
        turn = next;
        readyParts.turn = next;
        clearTimeout(settlementTimer);
        settlementTimer = setTimeout(uncertain, TIMEOUT);
        break;
      }
      case QUEST_ACTION_REFILL_REPLY:
        readyParts.action = readQuestRefillReply(reply);
        break;
      case QUEST_EVENT_REFILL_REPLY:
        readyParts.event = readQuestRefillReply(reply);
        break;
      case QUEST_MOVE_PHASE_START_REPLY:
        readQuestMovePhaseReply(reply);
        ready = readyParts;
        // Original SC44 then SC45 append to the same hand, after any survivors.
        hand ??= [];
        hand.push(...ready.action.cards, ...ready.event.cards.map((card) => ({ ...card, event: true })));
        void loadEventCards(ready.event.cards).catch(() => {});
        moveTable = [];
        startDistance = result?.distance ?? startDistance;
        result = null;
        direction = null;
        exchange = null;
        clearTimeout(settlementTimer);
        moveDeadline = performance.now() + QUEST_MOVE_WAIT + TIMEOUT;
        phase = 'move';
        completeCharacterChange();
        confirmActiveCharacters();
        if (pending?.kind === 'ready') pending.resolve(ready);
        break;
    }
    readyStep += 1;
  }

  function prepareCard(command, { id, up }, combat) {
    const adding = command === QUEST_MOVE_CARD_ADD_REQUEST
      || command === QUEST_ATTACK_CARD_ADD_REQUEST || command === QUEST_DEFENCE_CARD_ADD_REQUEST;
    const table = combat ? exchange.battleTable : moveTable;
    const source = adding ? hand : table;
    const destination = adding ? table : hand;
    const index = source.findIndex((card) => card.id === id);
    if (index < 0 || index > 127 || (source[index].event && stockEventCards.get(id) !== true)
        || source.some((card, position) => card.id === id && position !== index)
        || destination.some((card) => card.id === id)) {
      throw new SessionError('quest-card-unavailable');
    }
    const fields = [id, signedByte(index)];
    if (adding) fields.push(signedByte(up ? 1 : 0));
    const reply = combat
      ? (adding ? QUEST_BATTLE_CARD_ADD_REPLY : QUEST_BATTLE_CARD_REMOVE_REPLY)
      : (adding ? QUEST_MOVE_CARD_ADD_REPLY : QUEST_MOVE_CARD_REMOVE_REPLY);
    const card = { id, up: adding ? up : source[index].up };
    if (source[index].event) card.event = true;
    // Original attack/defense handlers omit the passed index when calling the model.
    const stage = combat ? exchange.phase : phase;
    return { fields, reply, source, destination, index, echoIndex: combat ? 0 : index, card, stage };
  }

  function receiveCard(reply) {
    const expected = pending?.cardTransfer;
    const stage = exchange?.phase ?? phase;
    if (expected?.reply !== reply.command || pending.answered || expected.stage !== stage) return;
    const update = stage === 'move' ? readQuestMoveCardReply(reply) : readQuestBattleCardReply(reply);
    if (!update.player) return;
    if (update.index === -1) {
      pending.answered = true;
      pending.reject(new SessionError('quest-card-rejected'));
      return;
    }
    if (update.index !== expected.echoIndex || update.id !== expected.card.id) return;

    expected.source.splice(expected.index, 1);
    expected.destination.push(expected.card);
    pending.answered = true;
    pending.resolve(expected.card);
  }

  function waitForCombat(command, timeout = TIMEOUT) {
    clearTimeout(settlementTimer);
    nextCombatReply = command;
    combatDeadline = performance.now() + timeout;
    settlementTimer = setTimeout(uncertain, timeout);
  }

  function finishCombat(stage) {
    clearTimeout(settlementTimer);
    if (!closeCombatDrop() && stage !== 'terminal') return false;
    exchange.phase = stage;
    exchange.battleTable = [];
    if (stage === 'complete') previousExchange = structuredClone(exchange);
    if (pending?.kind === 'battle-commit') pending.resolve(exchange);
    return true;
  }

  function closeCombatDrop() {
    if (pending?.kind === 'battle-card' && !pending.answered) uncertain();
    return exchange.phase !== 'uncertain';
  }

  function consumePlayedCards(cards) {
    const playedIds = new Set(cards.map((card) => card.id));
    hand = hand.filter((card) => !playedIds.has(card.id));
  }

  function openExchange(index) {
    exchange = {
      turn, index, phase: 'awaiting-attack', playerAttacks: null, battleTable: [], attackCards: null, defenceCards: null,
      cards: null, dice: null, damage: [], hitPoints: { player: null, opponent: null }, duelFinish, questFinish,
    };
  }

  function openAttack(playerAttacks) {
    confirmActiveCharacters();
    exchange.playerAttacks = playerAttacks;
    exchange.phase = playerAttacks ? 'attack' : 'awaiting-defense';
    waitForCombat(QUEST_ATTACK_PHASE_FINISH_REPLY, QUEST_COMBAT_WAIT + TIMEOUT);
  }

  function beginNextTurn() {
    if (exchange.phase !== 'complete' && !finishCombat('complete')) return;
    phase = 'between-turns';
    readyParts = {};
    readyStep = 0;
    waitForCombat(QUEST_TURN_REPLY);
  }

  function confirmActiveCharacters() {
    // The original movement, voluntary-change and attack phase guards require living active characters.
    for (const side of Object.values(roster)) {
      const active = side.cards[side.activeIndex];
      if (active.hp !== null && active.hp <= 0) {
        active.hp = null;
        changedHp.add(active);
      }
      active.alive = true;
    }
  }

  function canRequestCharacterChange() {
    return phase === 'move' && encounter.duel.multi && roster.player.cards.filter((card) => card.alive === true).length > 1;
  }

  function characterChoices() {
    if (phase !== 'character-change' || !characterChange || characterChange.closed || characterChange.playerDone) return [];
    return roster.player.cards.filter((card) => card.alive === true
      && (characterChange.kind === 'movement' || card.index !== roster.player.activeIndex));
  }

  function openCharacterChange(kind, { playerDone, opponentDone }) {
    characterChange = {
      kind, turn, playerDone, opponentDone, closed: false, requestedIndex: null, applied: { player: null, opponent: null },
    };
    phase = 'character-change';
    waitForCombat(kind === 'movement' ? QUEST_CHARA_CHANGE_FINISH_REPLY : QUEST_DEAD_CHARA_CHANGE_FINISH_REPLY,
      QUEST_COMBAT_WAIT + TIMEOUT);
  }

  function receiveChangedCharacter(reply) {
    const update = readQuestCharaChangeReply(reply);
    if (phase !== 'character-change' || !characterChange || characterChange.closed) return;
    const side = update.player ? 'player' : 'opponent';
    if (!roster[side].cards[update.index]) throw new SessionError('protocol');
    characterChange.applied[side] = update;
  }

  function completeCharacterChange() {
    if (!characterChange?.closed) return;
    const { kind, applied } = characterChange;
    for (const side of ['player', 'opponent']) {
      const update = applied[side];
      if (!update) continue;
      const selected = roster[side].cards[update.index];
      if (selected.cardId !== update.cardId) {
        selected.cardId = update.cardId;
        selected.hp = null;
        changedHp.add(selected);
      }
      selected.alive = true;
      roster[side].activeIndex = update.index;
    }
    lastCharacterChange = { kind, turn: characterChange.turn, ...applied };
    characterChange = null;
    if (pending?.kind !== 'character') return;
    if (applied.player?.index === pending.character.index && applied.player.cardId === pending.character.cardId) {
      pending.resolve(applied.player);
    } else pending.reject(new SessionError('quest-character-overridden'));
  }

  function receiveCharacterChange(reply) {
    const state = readQuestCombatBoundaryReply(reply);
    if (reply.command === QUEST_CHARA_CHANGE_START_REPLY) {
      if (phase !== 'moved' || nextCombatReply !== QUEST_ATTACK_PHASE_START_REPLY) throw new SessionError('protocol');
      confirmActiveCharacters();
      openCharacterChange('movement', state);
    } else if (reply.command === QUEST_DEAD_CHARA_CHANGE_REPLY) {
      if (phase !== 'moved' || !finishCombat('complete')) throw new SessionError('protocol');
      const discarded = new Set(state.playerCards);
      hand = hand.filter((card) => !discarded.has(card.id));
      openCharacterChange('defeated', state);
    } else {
      if (phase !== 'character-change' || nextCombatReply !== reply.command) throw new SessionError('protocol');
      const { kind, playerDone, opponentDone, applied } = characterChange;
      if ((!playerDone && !applied.player) || (!opponentDone && !applied.opponent)) throw new SessionError('protocol');
      characterChange.closed = true;
      if (kind === 'defeated') beginNextTurn();
      else waitForCombat(QUEST_ATTACK_PHASE_START_REPLY);
    }
  }

  function observeRosterHp(update, revival) {
    const side = update.player ? 'player' : 'opponent';
    const position = roster[side];
    // An unindexed HP event emitted while the real character is switching can target either slot.
    if (update.index === null && characterChange && update.value !== 0) {
      const applied = characterChange.applied[side];
      if (!applied && !characterChange[update.player ? 'playerDone' : 'opponentDone']) {
        for (const card of position.cards) {
          changedHp.add(card);
          card.hp = null;
          card.alive = null;
        }
        return;
      }
    }
    const card = position.cards[update.index ?? characterChange?.applied[side]?.index ?? position.activeIndex];
    if (!card) throw new SessionError('protocol');
    if (revival && card.alive !== false) {
      if (card.alive === null && update.value > 0) {
        changedHp.add(card);
        card.alive = true;
      }
      return;
    }
    if (update.kind === 'absolute' || update.value !== 0) changedHp.add(card);
    if (update.kind === 'absolute') card.hp = update.value;
    else if (card.hp !== null) card.hp += update.kind === 'heal' ? update.value : -update.value;
    if (card.hp !== null) card.alive = card.hp > 0;
    else if (update.value !== 0) {
      const raises = update.kind === 'heal' ? update.value > 0 : update.value < 0;
      card.alive = raises ? true : card.alive === false ? false : null;
    }
  }

  function settlementSnapshot() {
    if (!settlement) return null;
    const bonusPending = duelFinish?.bonus ?? null;
    const duelResult = duelFinish?.result === 0 ? 0 : 1;
    return { ...settlement, bonusPending, canReturn: bonusPending === false && duelResult === settlement.result };
  }

  function nextLands() {
    if (!routeReceiptReady()) return [];
    const position = run.positions?.get(slot);
    return (position?.nextSlots ?? [])
      .filter((next) => (progress & (1 << next)) === 0)
      .map((next) => run.positions.get(next))
      .filter((next) => next.enemyId !== null)
      .map(({ slot, id, name, caption, enemyId }) => ({ slot, id, name, caption, enemyId }));
  }

  function routeReceiptReady() {
    return duelFinish?.result === 0 && !duelFinish.bonus && !questDeleted && !questFinish && !settlement
      && progress !== null && arrivedDamage !== null && phase !== 'uncertain' && phase !== 'closed';
  }

  function loadRoute() {
    if (run.positions || loadingRoute || routeRequests >= 2 || catalogRequests.signal.aborted) return;
    routeRequests += 1;
    loadingRoute = true;
    const signal = AbortSignal.any([catalogRequests.signal, AbortSignal.timeout(3500)]);
    void readQuestRoute(questId, signal).then((positions) => {
      if (!signal.aborted && positions?.has(slot)) run.positions = positions;
    }).catch(() => {}).finally(() => {
      loadingRoute = false;
      if (routeReceiptReady()) loadRoute();
    });
  }

  function receiveSettlement(reply) {
    if (settlement) return;
    if (reply.command === QUEST_DUEL_FINISH_REPLY) {
      duelFinish ??= readQuestDuelFinishReply(reply);
      if (exchange) {
        exchange.duelFinish = duelFinish;
        finishCombat('terminal');
      } else uncertain();
      return;
    }

    switch (reply.command) {
      case QUEST_DELETED_REPLY:
        if (readQuestDeletedReply(reply) === inventoryId) questDeleted = true;
        break;
      case QUEST_FINISH_REPLY: {
        const finish = readQuestFinishReply(reply);
        // Original battle settlement sends win or loss; draw is a quest loss.
        if (finish.inventoryId !== inventoryId || (finish.result !== 0 && finish.result !== 1)) return;
        questFinish ??= finish;
        if (exchange) {
          exchange.questFinish = questFinish;
          finishCombat('terminal');
        } else uncertain();
        break;
      }
      case QUEST_PROGRESS_REPLY: {
        const update = readQuestProgressReply(reply);
        if (update.inventoryId === inventoryId && duelFinish?.result === 0 && (previousProgress & (1 << slot)) === 0
            && update.progress === (previousProgress | (1 << slot))) {
          progress ??= update.progress;
          run.progress = progress;
        }
        break;
      }
      case QUEST_DECK_STATE_REPLY: {
        const update = readQuestDeckStateReply(reply);
        // This packet has no inventory ID; correlate only after this land's own progress.
        if (progress !== null && !questDeleted && update.deckIndex === deckIndex && update.status === QUEST_IN_PROGRESS) {
          arrivedDamage ??= update.damage;
          run.damage = arrivedDamage;
          queueMicrotask(() => { if (routeReceiptReady()) loadRoute(); });
        }
        break;
      }
      case QUEST_CHARACTER_AWARD_REPLY: {
        const card = readQuestCharacterAwardReply(reply);
        if (awards.size < MAX_QUEST_ROWS && !awards.has(card.inventoryId)) awards.set(card.inventoryId, card);
        break;
      }
      case QUEST_ENERGY_REPLY:
        settlementAvatar.energy = readQuestEnergyReply(reply).energy;
        break;
      default: {
        const { field, value } = readQuestSettlementValueReply(reply);
        const group = Object.hasOwn(settlementAvatar, field) ? settlementAvatar : settlementMap;
        group[field] = value;
        break;
      }
    }
    if (questDeleted && questFinish) {
      settlement = applySettlement({
        ...questFinish, questId, avatar: { ...settlementAvatar }, map: { ...settlementMap, progress },
        cards: [...awards.values()],
      });
    }
  }

  function receiveCombat(reply) {
    if (reply.command === QUEST_CHARA_CHANGE_START_REPLY || reply.command === QUEST_CHARA_CHANGE_FINISH_REPLY
        || reply.command === QUEST_DEAD_CHARA_CHANGE_REPLY || reply.command === QUEST_DEAD_CHARA_CHANGE_FINISH_REPLY) {
      receiveCharacterChange(reply);
      return;
    }
    if (['complete', 'terminal', 'uncertain'].includes(exchange.phase)) return;

    if (reply.command === QUEST_TURN_FINISH_REPLY) {
      readQuestCombatBoundaryReply(reply);
      if (exchange.index === 2 && exchange.dice) beginNextTurn();
      else uncertain();
      return;
    }
    if (reply.command === QUEST_ATTACK_PHASE_START_REPLY && exchange.playerAttacks !== null) {
      const nextAttacker = readQuestAttackPhaseReply(reply);
      if (exchange.index === 1 && exchange.dice && nextAttacker !== exchange.playerAttacks) {
        if (finishCombat('complete')) {
          openExchange(2);
          openAttack(nextAttacker);
        }
      } else uncertain();
      return;
    }

    // Abilities can publish cosmetic dice before the ordinary result stage.
    if (reply.command === QUEST_BATTLE_DICE_REPLY && nextCombatReply !== QUEST_BATTLE_DICE_REPLY) {
      if (exchange.dice) uncertain();
      return;
    }
    if (reply.command !== nextCombatReply) throw new SessionError('protocol');
    switch (reply.command) {
      case QUEST_ATTACK_PHASE_START_REPLY: {
        const attacker = readQuestAttackPhaseReply(reply);
        if (characterChange?.closed && characterChange.kind === 'movement') {
          phase = 'moved';
          completeCharacterChange();
        }
        openAttack(attacker);
        break;
      }
      case QUEST_ATTACK_PHASE_FINISH_REPLY:
        exchange.attackCards = readQuestBattleCardsReply(reply);
        if (!closeCombatDrop()) break;
        exchange.phase = 'awaiting-defense';
        waitForCombat(QUEST_DEFENCE_PHASE_START_REPLY);
        break;
      case QUEST_DEFENCE_PHASE_START_REPLY: {
        const playerDefends = readQuestDefencePhaseReply(reply);
        if (playerDefends === exchange.playerAttacks) throw new SessionError('protocol');
        exchange.phase = playerDefends ? 'defense' : 'resolving';
        waitForCombat(QUEST_DEFENCE_PHASE_FINISH_REPLY, QUEST_COMBAT_WAIT + TIMEOUT);
        break;
      }
      case QUEST_DEFENCE_PHASE_FINISH_REPLY:
        exchange.defenceCards = readQuestBattleCardsReply(reply);
        if (!closeCombatDrop()) break;
        exchange.phase = 'resolving';
        waitForCombat(QUEST_BATTLE_CARDS_REPLY);
        break;
      case QUEST_BATTLE_CARDS_REPLY: {
        exchange.cards = readQuestBattleCardsReply(reply);
        consumePlayedCards(exchange.cards.playerCards);
        exchange.battleTable.length = 0;
        waitForCombat(QUEST_BATTLE_DICE_REPLY);
        break;
      }
      case QUEST_BATTLE_DICE_REPLY: {
        const dice = readQuestBattleDiceReply(reply);
        if (dice.playerAttacks !== exchange.playerAttacks) throw new SessionError('protocol');
        exchange.dice = dice;
        waitForCombat(null);
        break;
      }
    }
  }

  const replies = [
    ...QUEST_TURN_REPLIES, QUEST_DIRECTION_REPLY, QUEST_MOVE_CARD_ADD_REPLY, QUEST_MOVE_CARD_REMOVE_REPLY,
    QUEST_MOVE_PHASE_FINISH_REPLY, QUEST_MOVE_RESULT_REPLY, QUEST_ERROR_REPLY,
    QUEST_BATTLE_CARD_ADD_REPLY, QUEST_BATTLE_CARD_REMOVE_REPLY, ...QUEST_COMBAT_REPLIES, ...QUEST_SETTLEMENT_REPLIES,
    ...QUEST_HAND_EFFECT_REPLIES, QUEST_CHARA_CHANGE_REPLY, QUEST_CHARA_TRANSFORM_REPLY, ...QUEST_ROSTER_HP_REPLIES,
  ];
  function receiveReply(reply) {
    if (phase === 'closed') return;
    try {
      if (QUEST_SETTLEMENT_REPLIES.includes(reply.command)) {
        receiveSettlement(reply);
        return;
      }
      if (phase === 'uncertain' || exchange?.phase === 'uncertain' || duelFinish || questFinish) return;
      if (reply.command === QUEST_CHARA_CHANGE_REPLY) {
        receiveChangedCharacter(reply);
        return;
      }
      if (reply.command === QUEST_CHARA_TRANSFORM_REPLY) {
        readQuestCharaTransformReply(reply);
        uncertain();
        return;
      }
      if (QUEST_ROSTER_HP_REPLIES.includes(reply.command)) {
        const hp = readQuestRosterHpReply(reply);
        observeRosterHp(hp, reply.command === QUEST_CHARA_REVIVE_REPLY);
        if (phase === 'moved' && exchange && exchange.playerAttacks !== null && exchange.phase !== 'complete') {
          if (reply.command === QUEST_DAMAGE_REPLY) {
            if (exchange.damage.length >= 64) throw new SessionError('protocol');
            exchange.damage.push({ player: hp.player, damage: hp.value, nonHostile: hp.nonHostile });
          } else if (reply.command === QUEST_HIT_POINT_REPLY) {
            exchange.hitPoints[hp.player ? 'player' : 'opponent'] = hp.value;
          }
        }
        return;
      }
      if (QUEST_HAND_EFFECT_REPLIES.includes(reply.command)) {
        if (readQuestHandEffectReply(reply)) uncertain();
        return;
      }
      if (QUEST_TURN_REPLIES.includes(reply.command)) {
        receiveReady(reply);
        return;
      }
      if (exchange && reply.command === QUEST_DIRECTION_REPLY) {
        const { player, direction: reset } = readQuestDirectionReply(reply);
        if (phase === 'moved' && exchange.index === 2 && exchange.dice && player && reset === DIRECTION_PENDING) {
          beginNextTurn();
        }
        return;
      }
      if (exchange) {
        if (QUEST_COMBAT_REPLIES.includes(reply.command)) receiveCombat(reply);
        else if (reply.command === QUEST_BATTLE_CARD_ADD_REPLY || reply.command === QUEST_BATTLE_CARD_REMOVE_REPLY) {
          receiveCard(reply);
        } else if (reply.command === QUEST_ERROR_REPLY) {
          readQuestErrorReply(reply);
          uncertain();
        }
        return;
      }
      switch (reply.command) {
        case QUEST_DIRECTION_REPLY: {
          const update = readQuestDirectionReply(reply);
          if (phase !== 'move' || pending?.kind !== 'direction' || pending.answered || !update.player) break;
          if (update.direction === pending.direction) {
            direction = update.direction;
            pending.answered = true;
            pending.resolve(update);
          } else if (update.direction === DIRECTION_PENDING) {
            direction = null;
            pending.answered = true;
            pending.reject(new SessionError('quest-direction-rejected', update.direction));
          }
          break;
        }
        case QUEST_MOVE_CARD_ADD_REPLY:
        case QUEST_MOVE_CARD_REMOVE_REPLY:
          receiveCard(reply);
          break;
        case QUEST_MOVE_PHASE_FINISH_REPLY:
          if (phase !== 'move' && phase !== 'committing') throw new SessionError('protocol');
          readQuestMovePhaseReply(reply);
          if (pending?.cardTransfer && !pending.answered) {
            uncertain();
            break;
          }
          phase = 'settling';
          settlementTimer = setTimeout(uncertain, TIMEOUT);
          if (pending?.kind === 'direction') pending.reject(new SessionError('quest-battle-unavailable'));
          break;
        case QUEST_MOVE_RESULT_REPLY:
          if (phase !== 'settling') throw new SessionError('protocol');
          result = readQuestMoveResultReply(reply);
          consumePlayedCards(result.playerCards);
          moveTable.length = 0;
          clearTimeout(settlementTimer);
          phase = 'moved';
          openExchange(1);
          waitForCombat(QUEST_ATTACK_PHASE_START_REPLY, QUEST_COMBAT_WAIT + TIMEOUT);
          if (pending?.kind === 'commit') pending.resolve(result);
          break;
        case QUEST_ATTACK_PHASE_START_REPLY:
          // A later phase cannot stand in for a missing movement result.
          readQuestAttackPhaseReply(reply);
          uncertain();
          break;
        case QUEST_ERROR_REPLY:
          readQuestErrorReply(reply);
          uncertain();
          break;
      }
    } catch {
      uncertain();
    }
  }
  let unsubscribe = socket.observe(replies, receiveReply);
  void loadStartingHp().catch(() => {});
  loadRoute();
  void socket.closed.then(() => {
    catalogRequests.abort();
    uncertain();
  });

  async function send(kind, command, fields, signal, details = {}) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (phase === 'uncertain' || exchange?.phase === 'uncertain') throw new SessionError('quest-battle-uncertain');
    if (pending) throw new SessionError('busy');
    const combat = kind === 'battle-card' || kind === 'battle-commit';
    const choosingCharacter = kind === 'character';
    const transferring = kind === 'card' || kind === 'battle-card';
    const combatCommands = combat ? QUEST_COMBAT_COMMANDS[exchange?.phase] : null;
    const character = choosingCharacter && characterChange?.requestedIndex === null
      ? characterChoices().find(({ index }) => index === details.index) : null;
    const directionChange = kind === 'direction' && details.direction === DIRECTION_CHARA_CHANGE;
    if ((choosingCharacter && !character) || (directionChange && !canRequestCharacterChange())) {
      throw new SessionError('quest-character-unavailable');
    }
    const expectedPhase = choosingCharacter ? 'character-change' : kind === 'ready' ? 'encounter' : 'move';
    const allowed = !duelFinish && !questFinish && (combat ? phase === 'moved' && Boolean(combatCommands)
      : phase === expectedPhase);
    if (!allowed) {
      throw new SessionError(transferring ? 'quest-card-unavailable' : 'quest-battle-unavailable');
    }
    const remaining = (combat || choosingCharacter ? combatDeadline : moveDeadline) - performance.now();
    if ((combat || choosingCharacter || phase === 'move') && remaining <= 0) {
      uncertain();
      throw new SessionError('quest-battle-uncertain');
    }

    if (combat) command = combatCommands[command];
    const cardTransfer = transferring ? prepareCard(command, details, combat) : null;
    const controller = new AbortController();
    const cancel = () => controller.abort(new SessionError('cancelled'));
    signal?.addEventListener('abort', cancel, { once: true });
    const action = { kind, direction: details.direction, cardTransfer, controller, answered: false,
      character: character && { index: character.index, cardId: character.cardId } };
    const notification = new Promise((resolve, reject) => {
      action.resolve = resolve;
      action.reject = reject;
    });
    pending = action;
    action.task = (async () => {
      let sent = false;
      try {
        socket.send(command, cardTransfer?.fields ?? fields);
        sent = true;
        if (kind === 'ready') phase = 'preparing';
        else if (kind === 'commit') phase = 'committing';
        else if (kind === 'battle-commit') exchange.phase = 'committing';
        else if (choosingCharacter) characterChange.requestedIndex = character.index;
        // A commit waits for both entrants or the source phase timer.
        let timeout = TIMEOUT;
        if (kind === 'commit') timeout = remaining;
        if (choosingCharacter) timeout = remaining + 2 * TIMEOUT;
        if (kind === 'battle-commit') {
          // The combat observer separately bounds each original stage; this caps the whole action.
          timeout = remaining + (exchange.playerAttacks ? QUEST_COMBAT_WAIT : 0) + 5 * TIMEOUT;
        }
        const acknowledged = await bounded(notification, controller.signal, timeout);
        return structuredClone(kind === 'battle-commit'
          ? { ...acknowledged, settlement: settlementSnapshot() } : acknowledged);
      } catch (error) {
        if (sent && phase !== 'closed' && error.kind !== 'quest-direction-rejected'
            && error.kind !== 'quest-card-rejected' && error.kind !== 'quest-battle-unavailable'
            && error.kind !== 'quest-character-overridden') {
          uncertain();
          throw new SessionError('quest-battle-uncertain');
        }
        throw error;
      } finally {
        signal?.removeEventListener('abort', cancel);
        pending = null;
      }
    })();
    return action.task;
  }

  return {
    get busy() { return pending !== null; },
    get settlement() { return structuredClone(settlementSnapshot()); },
    get nextLands() { return nextLands(); },
    resume() { unsubscribe = socket.observe(replies, receiveReply); },
    snapshot() {
      const choices = characterChoices();
      return structuredClone({
        phase, turn, startDistance, direction, ready, result, previousExchange, lastCharacterChange, moveTable, roster,
        canRequestCharacterChange: canRequestCharacterChange(),
        characterChange: characterChange && {
          ...characterChange, choices, canSelect: characterChange.requestedIndex === null && choices.length > 0,
        },
        actionHand: hand && hand.filter((card) => !card.event),
        eventHand: hand && hand.filter((card) => card.event)
          .map(({ id, up }) => ({ id, up, playable: stockEventCards.get(id) === true })),
        exchange: exchange && { ...exchange, settlement: settlementSnapshot() },
      });
    },
    ready: (signal) => send('ready', QUEST_READY_REQUEST, [], signal),
    choose: (chosen, signal) => send('direction', QUEST_DIRECTION_REQUEST, [signedByte(chosen)], signal, { direction: chosen }),
    chooseCharacter: (index, signal) => send('character', QUEST_CHARA_CHANGE_REQUEST, [signedByte(index)], signal, { index }),
    addCard: (id, up, signal) => send('card', QUEST_MOVE_CARD_ADD_REQUEST, null, signal, { id, up }),
    removeCard: (id, signal) => send('card', QUEST_MOVE_CARD_REMOVE_REQUEST, null, signal, { id }),
    commit: (signal) => send('commit', QUEST_MOVE_COMMIT_REQUEST, ['', ''], signal),
    addBattleCard: (id, up, signal) => send('battle-card', 'add', null, signal, { id, up }),
    removeBattleCard: (id, signal) => send('battle-card', 'remove', null, signal, { id }),
    commitBattle: (signal) => send('battle-commit', 'done', ['', ''], signal),
    async stop(reason) {
      phase = 'closed';
      catalogRequests.abort();
      if (exchange) exchange.phase = 'closed';
      clearTimeout(settlementTimer);
      unsubscribe();
      const action = pending;
      if (action) {
        action.controller.abort(new SessionError(reason === 'closed' ? 'cancelled' : 'network'));
        await action.task.catch(() => {});
      }
    },
  };
}

function activeSession(auth, channels, playerId, sessionKey, { questData, ...initialData }) {
  let closing;
  let questRequest;
  let questReturn;
  let searchUncertain = false;
  let questStartUncertain = false;
  let adventure = null;
  const boundQuestDecks = new Map();
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });

  function stop(reason) {
    if (!closing) {
      clearInterval(timer);
      initialData = null;
      questData = null;
      boundQuestDecks.clear();
      sessionKey.fill(0);
      const request = questRequest;
      const returning = questReturn;
      const retained = adventure;
      if (retained) retained.state = 'closed';
      request?.controller.abort(new SessionError(reason === 'closed' ? 'cancelled' : 'network'));
      returning?.controller.abort(new SessionError(reason === 'closed' ? 'cancelled' : 'network'));
      closing = (async () => {
        if (request) await request.task.catch(() => {});
        if (returning) await returning.task.catch(() => {});
        if (retained) {
          if (retained.battle) await retained.battle.stop(reason);
          await closeChannel(retained.channel);
        }
        await closeSession(auth, channels);
        resolveClosed(reason);
      })();
    }
    return closing;
  }

  function assertQuestAvailable() {
    if (questRequest || questReturn) throw new SessionError('busy');
    if (adventure) {
      if (adventure.state === 'return-uncertain') throw new SessionError('quest-return-uncertain');
      throw new SessionError(adventure.state === 'uncertain' ? 'quest-land-uncertain' : 'quest-adventure-active');
    }
  }

  async function readFromQuest(read, signal, reconcile) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (!initialData) throw new SessionError('network');
    assertQuestAvailable();
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

  function maintainAdventure() {
    const current = adventure;
    if (!current?.connected || questRequest || current.heartbeat || current.battle?.busy
        || !['encounter', 'progress', 'uncertain'].includes(current.state)) return;
    const { socket } = current.channel;
    current.heartbeat = socket.ask(3, [], [3], { allowOther: true }).then((pong) => pong.done()).catch(() => {
      if (['encounter', 'progress', 'entering'].includes(current.state)) current.state = 'uncertain';
      if (current.state === 'uncertain') return closeChannel(current.channel);
    }).finally(() => { current.heartbeat = null; });
  }

  function activeBattle() {
    if (!initialData) throw new SessionError('network');
    if (adventure?.state === 'uncertain') throw new SessionError('quest-battle-uncertain');
    if (questRequest) throw new SessionError('busy');
    if (adventure?.state !== 'encounter' || !adventure.battle) {
      throw new SessionError('quest-battle-unavailable');
    }
    return adventure.battle;
  }

  function reconcileQuestSettlement(selected, receipt) {
    const avatar = initialData?.avatar;
    const deltas = { exp: null, gems: null, level: null };
    let deckRestored = null;
    if (!questData || !avatar) return { ...receipt, deltas, deckRestored };

    if (receipt.avatar.level !== null && receipt.avatar.level !== avatar.level) {
      // check_level_up can refill and raise the AP cap without sending an AP update.
      avatar.energy = null;
      avatar.energyMax = null;
    }
    for (const field of Object.keys(deltas)) {
      const absolute = receipt.avatar[field];
      if (absolute === null) continue;
      if (Number.isInteger(avatar[field])) deltas[field] = absolute - avatar[field];
      avatar[field] = absolute;
    }
    if (receipt.avatar.energy !== null) avatar.energy = receipt.avatar.energy;
    for (const field of ['questFlag', 'questClearNum']) {
      if (receipt.map[field] !== null) questData[field] = receipt.map[field];
    }

    const finished = questData.rows.findIndex((row) => row.inventoryId === receipt.inventoryId);
    if (finished >= 0) questData.rows.splice(finished, 1);
    const deck = boundQuestDecks.get(receipt.inventoryId);
    boundQuestDecks.delete(receipt.inventoryId);
    // Original quest_all_clear releases the already-bound deck before sending SC24.
    if (deck?.index === selected.deckIndex && !avatar.questDecks.some(({ index }) => index === deck.index)) {
      avatar.questDecks = [...avatar.questDecks, deck].sort((first, second) => first.index - second.index);
      deckRestored = { ...deck };
    }
    return { ...receipt, deltas, deckRestored };
  }

  const timer = setInterval(async () => {
    maintainAdventure();
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
    get questAdventure() {
      if (!adventure) return null;
      const { inventoryId, slot, state, channel, run } = adventure;
      const nextLands = state === 'encounter' ? adventure.battle?.nextLands ?? [] : [];
      return {
        inventoryId, slot, state: nextLands.length ? 'between-lands' : state, closed: channel.socket.closed,
        nextLands, progress: run.progress, damage: run.damage?.slice() ?? null,
      };
    },
    get questBattle() { return adventure?.battle?.snapshot() ?? null; },
    get questSettlement() { return adventure?.battle?.settlement ?? null; },
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
      const deck = avatar?.questDecks?.find(({ index }) => index === deckIndex);
      if (!isStartableQuest(selected) || !deck) {
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
            boundQuestDecks.set(inventoryId, { ...deck });
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
    async enterQuestLand(inventoryId, slot, { signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      assertQuestAvailable();
      if (!questData || !Number.isInteger(inventoryId) || inventoryId < 1 || inventoryId > 0x7fffffff
          || !Number.isInteger(slot) || slot < 0 || slot > 2) {
        throw new SessionError('protocol');
      }
      const index = questData.rows.findIndex((row) => row.inventoryId === inventoryId);
      const selected = questData.rows[index];
      // Only a successful CS13 associates a deck in this login's cached inventory.
      if (selected?.status !== QUEST_IN_PROGRESS || !Number.isInteger(selected.deckIndex)
          || selected.deckIndex < 1 || selected.deckIndex > 127) {
        throw new SessionError('quest-land-unavailable');
      }

      let current;
      try {
        return await readFromQuest(
          async (socket, confirm, questSignal, channel) => {
            const rows = await readQuestInventoryPushes(socket, confirm, questSignal);
            if (!rows.some((row) => row.inventoryId === inventoryId && row.questId === selected.questId
                && row.status === QUEST_IN_PROGRESS)) throw new SessionError('quest-land-unavailable');
            const result = await submitQuestLand(socket, questSignal, selected, slot, () => {
              current = { inventoryId, slot, channel, connected: true, state: 'entering', run: questRun() };
              channel.retained = true;
              adventure = current;
              void socket.closed.then(() => {
                current.connected = false;
                if (['entering', 'encounter', 'progress'].includes(current.state)) current.state = 'uncertain';
              });
            }, (encounter) => {
              current.selected = selected;
              current.playerCards = encounter.playerCardIds.slice();
              current.battle = observeQuestBattle(socket, selected, slot, encounter, current.run,
                (receipt) => reconcileQuestSettlement(selected, receipt));
            });
            if (result.rejection !== undefined) {
              adventure = null;
              channel.retained = false;
            } else if (result.finish) {
              if (current.state !== 'closed') current.state = 'finished';
              channel.retained = false;
            }
            return result;
          },
          signal,
          (result) => {
            if (result.rejection !== undefined) {
              if (result.deleted) questData.rows.splice(index, 1);
              throw new SessionError('quest-land-rejected', result.rejection);
            }
            if (result.finish) questData.rows.splice(index, 1);
            else {
              current.channel.socket.assertOpen();
              current.state = result.encounter ? 'encounter' : 'progress';
            }
            return result;
          },
        );
      } catch (error) {
        if (current && adventure === current) {
          if (current.state !== 'closed' && current.state !== 'finished') current.state = 'uncertain';
          throw new SessionError('quest-land-uncertain');
        }
        throw error;
      }
    },
    async enterNextQuestLand(slot, { signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      if (questRequest || questReturn || adventure?.battle?.busy) throw new SessionError('busy');
      if (adventure?.state === 'uncertain') throw new SessionError('quest-land-uncertain');
      const current = adventure;
      const previous = current?.battle;
      if (!validQuestSlot(slot) || current?.state !== 'encounter' || !current.connected
          || !previous?.nextLands.some((land) => land.slot === slot)) {
        throw new SessionError('quest-land-unavailable');
      }

      auth.assertOpen();
      for (const { socket } of channels) socket.assertOpen();
      const { socket } = current.channel;
      const controller = new AbortController();
      const cancel = () => controller.abort(new SessionError('cancelled'));
      signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => controller.abort(new SessionError('timeout')), TIMEOUT);
      let dispatched = false;
      current.state = 'entering';
      const task = (async () => {
        if (current.heartbeat) await bounded(current.heartbeat, controller.signal);
        const pong = await socket.ask(3, [], [3], { signal: controller.signal, allowOther: true });
        pong.done();
        if (current.state !== 'entering' || !previous.nextLands.some((land) => land.slot === slot)) {
          throw new SessionError('quest-land-unavailable');
        }

        const damage = current.run.damage.slice();
        const result = await submitQuestLand(socket, controller.signal, current.selected, slot,
          () => { dispatched = true; }, (encounter) => {
            if (!sameValues(encounter.playerCardIds, current.playerCards) || !sameValues(encounter.playerDamage, damage)) {
              throw new SessionError('protocol');
            }
            current.battle = observeQuestBattle(socket, current.selected, slot, encounter, current.run,
              (receipt) => reconcileQuestSettlement(current.selected, receipt));
            current.slot = slot;
            void previous.stop('closed');
          });
        controller.signal.throwIfAborted();
        if (result.rejection !== undefined && !result.deleted) throw new SessionError('quest-land-rejected', result.rejection);
        if (!result.encounter) throw new SessionError('protocol');
        return result;
      })();
      questRequest = { controller, task };
      try {
        const result = await task;
        if (current.state !== 'entering') throw new SessionError('network');
        current.state = 'encounter';
        return result;
      } catch (error) {
        if (current.state === 'closed') throw error;
        if (current.battle === previous) previous.resume();
        if (dispatched && error.kind !== 'quest-land-rejected') {
          current.state = 'uncertain';
          throw new SessionError('quest-land-uncertain');
        }
        if (current.state === 'entering') current.state = 'encounter';
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
        questRequest = null;
      }
    },
    async readyQuestBattle({ signal } = {}) {
      return activeBattle().ready(signal);
    },
    async chooseQuestMove(direction, { signal } = {}) {
      if (!Number.isInteger(direction) || direction < -1 || direction > DIRECTION_CHARA_CHANGE
          || direction === DIRECTION_PENDING) throw new SessionError('protocol');
      return activeBattle().choose(direction, signal);
    },
    async chooseQuestCharacter(index, { signal } = {}) {
      if (!Number.isInteger(index) || index < 0 || index > 2) throw new SessionError('quest-character-unavailable');
      return activeBattle().chooseCharacter(index, signal);
    },
    async addQuestMoveCard(cardId, up, { signal } = {}) {
      if (!validQuestCardId(cardId) || typeof up !== 'boolean') {
        throw new SessionError('quest-card-unavailable');
      }
      return activeBattle().addCard(cardId, up, signal);
    },
    async removeQuestMoveCard(cardId, { signal } = {}) {
      if (!validQuestCardId(cardId)) {
        throw new SessionError('quest-card-unavailable');
      }
      return activeBattle().removeCard(cardId, signal);
    },
    async commitQuestMove({ signal } = {}) {
      return activeBattle().commit(signal);
    },
    async addQuestBattleCard(cardId, up, { signal } = {}) {
      if (!validQuestCardId(cardId) || typeof up !== 'boolean') throw new SessionError('quest-card-unavailable');
      return activeBattle().addBattleCard(cardId, up, signal);
    },
    async removeQuestBattleCard(cardId, { signal } = {}) {
      if (!validQuestCardId(cardId)) throw new SessionError('quest-card-unavailable');
      return activeBattle().removeBattleCard(cardId, signal);
    },
    async commitQuestBattle({ signal } = {}) {
      return activeBattle().commitBattle(signal);
    },
    async returnFromQuest({ signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      const current = adventure;
      if (questRequest || questReturn || current?.battle?.busy) throw new SessionError('busy');
      if (current?.state === 'return-uncertain') throw new SessionError('quest-return-uncertain');
      const settlement = current?.battle?.settlement;
      if (!settlement?.canReturn || current.state !== 'encounter' || !current.connected) {
        throw new SessionError('quest-return-unavailable');
      }

      const controller = new AbortController();
      const cancel = () => controller.abort(new SessionError('cancelled'));
      signal?.addEventListener('abort', cancel, { once: true });
      current.state = 'returning';
      const task = current.channel.socket.releaseQuest(controller.signal);
      questReturn = { controller, task };
      try {
        await task;
        controller.signal.throwIfAborted();
        await current.battle.stop('closed');
        controller.signal.throwIfAborted();
        adventure = null;
        return settlement;
      } catch (error) {
        if (current.state === 'closed') throw error;
        current.state = 'return-uncertain';
        throw new SessionError('quest-return-uncertain');
      } finally {
        questReturn = null;
        signal?.removeEventListener('abort', cancel);
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
