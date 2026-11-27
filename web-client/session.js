import { createAuthExchange, createRegistrationVerifier } from './srp.js';
import { applySessionKey, createFrameParser, encodeCommand, readReply, signedByte } from './wire.js';
import {
  AVATAR_COMMAND, LOBBY_AVATAR_COMMAND, REGISTRATION_COMMAND, VERSION_COMMAND, readDataProfile, readLobbyAvatar, readVersions,
} from './data-bootstrap.js';
import {
  QUEST_DISCOVERY_REQUEST, QUEST_DISCOVERY_REPLY, QUEST_INVENTORY_REPLY, QUEST_MAP_REQUEST, QUEST_MAP_REPLY,
  QUEST_SEARCH_REQUEST, QUEST_SEARCH_REPLY, QUEST_SEARCH_TIMER, QUEST_ENERGY_REPLY, QUEST_ERROR_REPLY,
  QUEST_START_REQUEST, QUEST_DELETED_REPLY,
  QUEST_NEXT_LAND_REQUEST, QUEST_NEXT_LAND_REPLY, QUEST_ENCOUNTER_REPLY, QUEST_DUEL_START_REPLY,
  QUEST_PROGRESS_REPLY, QUEST_DECK_STATE_REPLY, QUEST_FINISH_REPLY, QUEST_TREASURE_REPLY,
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
  readQuestProgressReply, readQuestDeckStateReply, readQuestFinishReply, readQuestTreasureReply,
  readQuestTurnReply, readQuestRefillReply, readQuestMovePhaseReply,
  readQuestDirectionReply, readQuestMoveCardReply, readQuestMoveResultReply, readQuestAttackPhaseReply,
  readQuestDefencePhaseReply, readQuestBattleCardReply, readQuestBattleCardsReply, readQuestBattleDiceReply,
  readQuestDuelFinishReply, readQuestCombatBoundaryReply,
  readQuestHandEffectReply,
  readQuestCharaChangeReply, readQuestRosterHpReply, readQuestCharaTransformReply,
  readQuestSettlementValueReply, readQuestCharacterAwardReply,
} from './quest-data.js';

const AUTH_PORT = 12001;
const AUTH_REGISTER_REQUEST = 5;
const AUTH_REGISTER_REPLY = 0;
const SERVER_SB = 0;
const LOBBY_PORT = 12002;
const DATA_PORT = 12003;
const DATA_AVATAR_CREATED_REQUEST = 4;
const QUEST_PORT = 12005;
const LOBBY_CREATE_AVATAR_REQUEST = 10;
const LOBBY_CHECK_NAME_REQUEST = 11;
const LOBBY_CREATE_AVATAR_REPLY = 5;
const LOBBY_CHECK_NAME_REPLY = 6;
const LOBBY_MOVE_DECK_CARD_REQUEST = 5;
const LOBBY_MOVE_DECK_CARD_FAILED_REPLY = 10;
const LOBBY_ERROR_REPLY = 34;
const LOBBY_MOVE_DECK_CARD_FINISH_REPLY = 67;
const LOBBY_PONG = 35;
const LOBBY_REFRESH_AVATAR = 17;
const LOBBY_ENERGY_REPLY = 17;
const LOBBY_ENERGY_MAX_REPLY = 18;
const LOBBY_GEMS_REPLY = 25;
const LOBBY_FREE_DUEL_COUNT_REPLY = 42;
const LOBBY_REFRESH_INTERVAL = 2000;
const AVATAR_REGISTRATION_REPLIES = [LOBBY_AVATAR_COMMAND, LOBBY_CREATE_AVATAR_REPLY, LOBBY_CHECK_NAME_REPLY];
// Original AvatarParts.csv types, in the order sent by AvatarStyleEditor.
const AVATAR_STARTER_PART_GROUPS = [
  [1, 2, 3], [5, 6, 7, 10, 11, 12, 15, 16, 17], [24, 25, 26], [27, 28, 29, 32, 33, 34, 37, 38, 39],
];
const AVATAR_STARTER_CARDS = [1, 21, 31, 101, 111];
const DECK_EDIT_ERRORS = new Set([6, 10, 16, 17]); // Original update_chara_card_deck return codes.
const DECK_CHARACTER_KINDS = new Set([0, 1, 8, 11, 12, 13]); // Original DeckEditor card kinds.
const DECK_LEAD_KINDS = new Set([0, 8, 12, 13]);
const DECK_CHARACTER_IDENTITIES = ['characterId', 'unlightCharacterId', 'parentId'];
const CHARACTER_DECK_SIZE = 3;
const QUEST_REGION = 0;
const QUEST_NEW = 0;
const QUEST_UNSOLVED = 1;
const QUEST_IN_PROGRESS = 2;
const QUEST_PENDING = 4;
const MAX_QUEST_ROWS = 127; // The original Data inventory count is a signed byte.
const QUEST_LAND_SLOTS = 15;
const QUEST_GEM_TREASURE_TYPE = 5; // Original TG_GEM.
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
  { port: LOBBY_PORT, pong: LOBBY_PONG },
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
  'account-register-invalid': '請確認帳號與密碼的格式。',
  'account-name-taken': '這個帳號已有人使用。',
  'account-register-rejected': '遊戲服務未接受註冊。',
  'account-register-uncertain': '尚未確認帳號是否已建立。請先用剛才的帳密登入確認。',
  busy: '正在讀取任務資料。',
  'avatar-name-invalid': '此角色名稱無法使用。',
  'avatar-name-taken': '此角色名稱已有人使用。',
  'avatar-name-uncertain': '未能確認名稱檢查結果，請重新登入。',
  'avatar-starter-invalid': '請選擇伺服器提供的外觀和起始角色卡。',
  'avatar-create-rejected': '伺服器未接受建立角色。',
  'avatar-create-uncertain': '未能確認角色是否已建立，請重新登入查看。',
  'avatar-tutorial-uncertain': '角色已建立，但角色資料尚未切換。請重新登入。',
  'avatar-registration-unavailable': '本次登入目前無法建立角色。',
  'deck-edit-unavailable': '目前無法編輯牌組。',
  'deck-card-unavailable': '目前無法將這張卡移入牌組。',
  'deck-edit-rejected': '伺服器未接受這次移牌。',
  'deck-edit-uncertain': '未能確認移牌結果，請重新登入查看。',
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
  #onPushedReply;

  constructor(port, onStartupFailure, onPushedReply) {
    this.#onStartupFailure = onStartupFailure;
    this.#onPushedReply = onPushedReply;
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

  async ask(command, fields, replies, { signal, skip, allowOther, nextKey, onSend, onReply } = {}) {
    signal?.throwIfAborted();
    this.assertOpen();
    if (this.#waiting) throw new SessionError('protocol');

    const response = new Promise((resolve, reject) => {
      this.#waiting = { replies, skip, allowOther, onReply, resolve, reject };
    });
    try {
      this.send(command, fields);
      onSend?.();
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
          waiter.onReply?.(reply);
          this.#waiting = null;
          waiter.resolve(reply);
        } else if (this.#observer?.commands.includes(reply.command)) {
          this.#observer.receive(reply);
        } else if (reply.command === this.#expireCommand) {
          this.#fail(new SessionError('network'), 'expired');
        } else if (!this.#onPushedReply?.(reply) && waiter && !waiter.allowOther && !waiter.skip?.includes(reply.command)) {
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
    this.#onPushedReply = null;
    this.#parser.reset();
    this.#resolveOpen(false);
    const error = this.#fault ?? new SessionError('network');
    this.#waiting?.reject(error);
    if (this.#reason !== 'closed') this.#onStartupFailure?.(error);
    this.#resolveClose(this.#reason ?? 'network');
  }
}

function observeLobbyAvatar(reply, publish) {
  let patch;
  try {
    switch (reply.command) {
      case LOBBY_ENERGY_REPLY: {
        const energy = reply.int();
        const energyRemainingSeconds = reply.int();
        if (energy >= 0 && energyRemainingSeconds >= 0) {
          patch = { energy, energyRemainingSeconds, energyReceivedAt: performance.now() };
        }
        break;
      }
      case LOBBY_ENERGY_MAX_REPLY: {
        const energyMax = reply.int();
        if (energyMax > 0) patch = { energyMax };
        break;
      }
      case LOBBY_GEMS_REPLY: {
        const gems = reply.int();
        if (gems >= 0) patch = { gems };
        break;
      }
      case LOBBY_FREE_DUEL_COUNT_REPLY: {
        const freeDuelCount = reply.byte();
        if (freeDuelCount >= 0 && freeDuelCount <= 3) patch = { freeDuelCount };
        break;
      }
      default:
        return false;
    }
    reply.done();
  } catch {
    // A malformed optional status update does not affect the other Lobby replies.
    return true;
  }
  if (patch) publish(patch);
  return true;
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
    const login = socket.ask(1, ['yes, ok.', sign], [1, 2], {
      signal,
      onReply(certificate) {
        if (certificate.command !== 1) throw new SessionError('protocol');
        certificate.discardString(4096);
        certificate.discardString(4096);
        certificate.done();
        channel.verified = true;
        socket.expireOn(2);
      },
    });
    const [, initialData] = await Promise.all([login, initial?.received]);
    return initialData;
  } finally {
    initial?.dispose();
  }
}

function avatarRegistrationOptions(registration) {
  if (!registration) return null;
  const partGroups = AVATAR_STARTER_PART_GROUPS.map((group) => Object.freeze(
    group.filter((id) => registration.partIds.includes(id)),
  ));
  const cardIds = Object.freeze(AVATAR_STARTER_CARDS.filter((id) => registration.cardIds.includes(id)));
  if (!partGroups.every((group) => group.length) || !cardIds.length) return null;
  return Object.freeze({ partGroups: Object.freeze(partGroups), cardIds });
}

function validateAvatarName(name) {
  if (typeof name !== 'string' || name.length < 3 || name.length > 12 || /[ ",\u3000]|\*{3}|\p{Cc}|\p{Cs}/u.test(name)) {
    throw new SessionError('avatar-name-invalid');
  }
}

function avatarRegistrationFields({ name, partIds, cardId }, { partGroups, cardIds }) {
  validateAvatarName(name);
  if (!Array.isArray(partIds) || partIds.length !== partGroups.length
      || !partGroups.every((group, index) => group.includes(partIds[index])) || !cardIds.includes(cardId)) {
    throw new SessionError('avatar-starter-invalid');
  }
  return [name, partIds.join(','), String(cardId), 0]; // Original optional invitation omitted.
}

async function finishLobbyObservation(socket, signal) {
  const pong = await socket.ask(3, [], [LOBBY_PONG], { signal, allowOther: true });
  pong.done();
}

async function requestAvatarName(socket, name, signal, markSent) {
  let unexpected = false;
  const unsubscribe = socket.observe(AVATAR_REGISTRATION_REPLIES, () => { unexpected = true; });
  try {
    const reply = await socket.ask(LOBBY_CHECK_NAME_REQUEST, [name], [LOBBY_CHECK_NAME_REPLY], {
      signal, allowOther: true, onSend: markSent,
    });
    const code = reply.int();
    reply.done();
    if (code < 0 || code > 2) throw new SessionError('protocol');
    await finishLobbyObservation(socket, signal);
    if (unexpected) throw new SessionError('protocol');
    return code;
  } finally {
    unsubscribe();
  }
}

async function submitAvatarRegistration(socket, fields, signal, { markSent, markProfile }) {
  let accepted;
  let receivedAt;
  let profileStarted = false;
  let invalid = false;
  let unsubscribe;
  const confirmation = new Promise((resolve, reject) => {
    unsubscribe = socket.observe(AVATAR_REGISTRATION_REPLIES, (reply) => {
      if (invalid) return;
      try {
        if (reply.command === LOBBY_CREATE_AVATAR_REPLY && accepted === undefined) {
          const status = reply.byte();
          reply.done();
          if (status !== 0 && status !== 1) throw new SessionError('protocol');
          accepted = status === 1;
          if (!accepted) resolve(null);
        } else if (reply.command === LOBBY_AVATAR_COMMAND && accepted && !profileStarted) {
          profileStarted = true;
          receivedAt = performance.now();
          markProfile();
          resolve(readLobbyAvatar(reply, signal));
        } else throw new SessionError('protocol');
      } catch {
        invalid = true;
        reject(new SessionError('protocol'));
      }
    });
  });
  try {
    signal.throwIfAborted();
    socket.send(LOBBY_CREATE_AVATAR_REQUEST, fields);
    markSent();
    const lost = socket.closed.then(() => { throw new SessionError('network'); });
    const profile = await bounded(Promise.race([confirmation, lost]), signal);
    // Keep watching this stage until the ordered fence and its chunk are processed.
    await finishLobbyObservation(socket, signal);
    if (invalid) throw new SessionError('protocol');
    if (profile === null) return null;
    const { avatar, questData } = profile;
    if (avatar.name !== fields[0] || avatar.level < 1 || avatar.gems < 0 || avatar.exp < 0
        || avatar.energy < 0 || avatar.energyMax < 1 || !questData || !avatar.questDecks.some(({ index }) => index === 1)) {
      throw new SessionError('protocol');
    }
    return { ...profile, questData: { ...questData, receivedAt } };
  } finally {
    unsubscribe();
  }
}

export function canAppendDeckCharacter(card, currentCards) {
  if (!Array.isArray(currentCards) || currentCards.length >= CHARACTER_DECK_SIZE
      || !DECK_LEAD_KINDS.has((currentCards[0] ?? card)?.kind)) return false;
  return [...currentCards, card].every((entry, index, roster) => DECK_CHARACTER_KINDS.has(entry?.kind)
    && DECK_CHARACTER_IDENTITIES.every((key) => Number.isSafeInteger(entry[key]) && entry[key] > 0)
    && roster.slice(0, index).every((other) => DECK_CHARACTER_IDENTITIES.every((key) => entry[key] !== other[key])));
}

async function verifyDeckAppend(cardId, previousCards, signal) {
  const ids = new Set([cardId, ...previousCards.map((card) => card.cardId)]);
  const params = new URLSearchParams({ ids: [...ids].join(',') });
  try {
    const response = await fetch(`/api/deck-character-catalog?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
    });
    if (!response.ok) return false;
    const { cards } = await response.json();
    if (!Array.isArray(cards) || cards.length !== ids.size) return false;
    const known = new Map();
    for (const card of cards) {
      if (!ids.has(card.id) || known.has(card.id)) return false;
      known.set(card.id, card);
    }
    return canAppendDeckCharacter(known.get(cardId), previousCards.map((card) => known.get(card.cardId)));
  } catch {
    signal.throwIfAborted();
    return false;
  }
}

async function submitDeckAppend(socket, { inventoryId, deckIndex, position }, signal, markSent) {
  let rejection = null;
  let finished = false;
  let invalid = false;
  let unsubscribe;
  const confirmation = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([LOBBY_ERROR_REPLY, LOBBY_MOVE_DECK_CARD_FINISH_REPLY, LOBBY_MOVE_DECK_CARD_FAILED_REPLY],
      (reply) => {
        if (invalid) return;
        try {
          if (finished) throw new SessionError('protocol');
          if (reply.command === LOBBY_MOVE_DECK_CARD_FINISH_REPLY) {
            reply.done();
            finished = true;
            resolve();
          } else if (reply.command === LOBBY_ERROR_REPLY && rejection === null) {
            const code = reply.int();
            reply.done();
            if (!DECK_EDIT_ERRORS.has(code)) throw new SessionError('protocol');
            rejection = code;
          } else throw new SessionError('protocol');
        } catch {
          invalid = true;
          reject(new SessionError('protocol'));
        }
      });
  });
  try {
    signal.throwIfAborted();
    socket.send(LOBBY_MOVE_DECK_CARD_REQUEST, [inventoryId, deckIndex, position]);
    markSent();
    const lost = socket.closed.then(() => { throw new SessionError('network'); });
    await bounded(Promise.race([confirmation, lost]), signal);
    // SC67 is unconditional. Keep watching for an error or duplicate through the Pong's chunk.
    await finishLobbyObservation(socket, signal);
    if (invalid) throw new SessionError('protocol');
    return rejection;
  } finally {
    unsubscribe();
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

async function submitQuestLand(socket, signal, { inventoryId, deckIndex }, slot, markDispatched, markEncounter,
  { emptyTerrain = false, fixedGemTreasure = null } = {}) {
  const peaceful = emptyTerrain || fixedGemTreasure !== null;
  let arrived = false;
  let encounter = null;
  let progress = null;
  let finish = null;
  let deleted = false;
  let invalid = false;
  let gemBalance = null;
  let treasure = null;
  let unsubscribe;
  const notification = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([
      QUEST_NEXT_LAND_REPLY, QUEST_ENCOUNTER_REPLY, QUEST_DUEL_START_REPLY,
      QUEST_PROGRESS_REPLY, QUEST_FINISH_REPLY, QUEST_DELETED_REPLY, QUEST_ERROR_REPLY,
      ...(peaceful ? [QUEST_DECK_STATE_REPLY, QUEST_DUEL_FINISH_REPLY] : []),
      ...(fixedGemTreasure ? [QUEST_GEMS_REPLY, QUEST_TREASURE_REPLY] : []),
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
            if (peaceful || !arrived || encounter || progress !== null || deleted) throw new SessionError('protocol');
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
            if (peaceful && (progress !== null || update.progress !== (1 << slot))) {
              throw new SessionError('protocol');
            }
            progress = update.progress;
            if (!fixedGemTreasure) resolve(null); // The original callback may still settle this quest.
            break;
          }
          case QUEST_GEMS_REPLY: {
            const { value } = readQuestSettlementValueReply(reply);
            if (progress === null || gemBalance !== null || value < fixedGemTreasure.value) throw new SessionError('protocol');
            gemBalance = value;
            break;
          }
          case QUEST_TREASURE_REPLY: {
            const { type, slotType, value } = readQuestTreasureReply(reply);
            // SC25 has no inventory ID and belongs to this one outstanding, matched land entry.
            if (gemBalance === null || treasure || type !== fixedGemTreasure.type
                || slotType !== fixedGemTreasure.slotType || value !== fixedGemTreasure.value) {
              throw new SessionError('protocol');
            }
            treasure = { treasureId: fixedGemTreasure.treasureId, amount: value, balance: gemBalance };
            resolve(null);
            break;
          }
          case QUEST_DELETED_REPLY:
            if (readQuestDeletedReply(reply) !== inventoryId) break;
            if (encounter || (peaceful && arrived)) throw new SessionError('protocol');
            deleted = true;
            if (!arrived) {
              unsubscribe();
              resolve({ rejection: QUEST_MISSING_ERROR, deleted });
            }
            break;
          case QUEST_FINISH_REPLY: {
            const settled = readQuestFinishReply(reply);
            if (settled.inventoryId !== inventoryId) break;
            if (peaceful || !arrived || encounter || !deleted || finish) throw new SessionError('protocol');
            finish = settled;
            resolve(null);
            break;
          }
          case QUEST_DECK_STATE_REPLY:
            if (readQuestDeckStateReply(reply).deckIndex === deckIndex) throw new SessionError('protocol');
            break;
          case QUEST_DUEL_FINISH_REPLY:
            throw new SessionError('protocol');
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

    // Preserve authored land observation through the Pong's chunk to catch contradictions.
    await finishQuestObservation(socket, signal, peaceful ? undefined : unsubscribe);
    if (invalid || (deleted && !finish)) throw new SessionError('protocol');
    return {
      slot, encounter: null, progress, finish,
      ...(emptyTerrain ? { emptyTerrain: true } : {}), ...(treasure ? { fixedGemTreasure: treasure } : {}),
    };
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
  const { positions, mapId } = quests[0];
  const ordinaryMap = Number.isInteger(mapId) && mapId >= 1 && mapId <= MAX_QUEST_MAP_ID;
  if (!Array.isArray(positions) || positions.length > QUEST_LAND_SLOTS) return null;
  const nodes = new Map();
  for (const { slot, id, name, caption, enemyId, emptyTerrain, fixedGemTreasure, nextSlots } of positions) {
    if (!validQuestSlot(slot) || nodes.has(slot) || !validQuestCardId(id) || typeof name !== 'string'
        || typeof caption !== 'string' || !Array.isArray(nextSlots) || nextSlots.length > 3
        || new Set(nextSlots).size !== nextSlots.length || nextSlots.some((next) => !validQuestSlot(next)
          || Math.floor(next / 3) !== Math.floor(slot / 3) + 1)) return null;
    nodes.set(slot, {
      slot, id, name, caption, enemyId: validQuestCardId(enemyId) ? enemyId : null,
      emptyTerrain: ordinaryMap && emptyTerrain === true && enemyId === 0,
      fixedGemTreasure: ordinaryMap && emptyTerrain === false && enemyId === 0
        ? verifiedFixedGemTreasure(fixedGemTreasure) : null,
      nextSlots,
    });
  }
  if (positions.some(({ nextSlots }) => nextSlots.some((slot) => !nodes.has(slot)))) return null;
  return nodes;
}

function verifiedFixedGemTreasure(treasure) {
  if (!treasure || typeof treasure !== 'object') return null;
  const { treasureId, type, slotType, value } = treasure;
  if (!validQuestCardId(treasureId) || type !== QUEST_GEM_TREASURE_TYPE || !validQuestCardId(value)
      || !Number.isInteger(slotType) || slotType < 0 || slotType > 0x7fffffff) return null;
  return { treasureId, type, slotType, value };
}

function sameValues(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function nextBattleLands(positions, slot, progress) {
  const position = positions?.get(slot);
  return (position?.nextSlots ?? [])
    .filter((next) => (progress & (1 << next)) === 0)
    .map((next) => positions.get(next))
    .filter((next) => next.enemyId !== null)
    .map(({ slot, id, name, caption, enemyId }) => ({ slot, id, name, caption, enemyId }));
}

function observeNonCombatTerrain(socket, { inventoryId, deckIndex }, { progress, fixedGemTreasure }, onUncertain) {
  const commands = [QUEST_PROGRESS_REPLY, QUEST_DECK_STATE_REPLY, QUEST_DELETED_REPLY, QUEST_FINISH_REPLY,
    QUEST_NEXT_LAND_REPLY, QUEST_ENCOUNTER_REPLY, QUEST_DUEL_START_REPLY, QUEST_DUEL_FINISH_REPLY, QUEST_ERROR_REPLY];
  if (fixedGemTreasure) commands.push(QUEST_GEMS_REPLY, QUEST_TREASURE_REPLY);
  function receive(reply) {
    try {
      if (reply.command === QUEST_PROGRESS_REPLY) {
        const update = readQuestProgressReply(reply);
        if (update.inventoryId !== inventoryId || update.progress === progress) return;
      } else if (reply.command === QUEST_DECK_STATE_REPLY) {
        if (readQuestDeckStateReply(reply).deckIndex !== deckIndex) return;
      } else if (reply.command === QUEST_DELETED_REPLY) {
        if (readQuestDeletedReply(reply) !== inventoryId) return;
      } else if (reply.command === QUEST_FINISH_REPLY) {
        if (readQuestFinishReply(reply).inventoryId !== inventoryId) return;
      }
    } catch {
      // Any malformed evidence leaves the edge unavailable.
    }
    onUncertain();
  }
  let stop = socket.observe(commands, receive);
  return { resume() { stop = socket.observe(commands, receive); }, stop: () => stop() };
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
    return nextBattleLands(run.positions, slot, progress);
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

function activeSession(auth, channels, playerId, sessionKey, { questData, ...initialData }, attachLobbyAvatar) {
  const lobby = channels.find(({ port }) => port === LOBBY_PORT);
  const data = channels.find(({ port }) => port === DATA_PORT);
  const registrationOptions = avatarRegistrationOptions(initialData.registration);
  let registrationState = registrationOptions ? 'available' : 'unavailable';
  let confirmedAvatar = null;
  let registrationLobbyPatch = null;
  let lastLobbyRefresh = -Infinity;
  const avatarSubscriptions = new Set();
  let profileRequest;
  let deckEditState;
  let closing;
  let questRequest;
  let questReturn;
  let searchUncertain = false;
  let questStartUncertain = false;
  let adventure = null;
  const boundQuestDecks = new Map();
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });

  function publishAvatar() {
    if (!avatarSubscriptions.size) return;
    const avatar = initialData.avatar;
    const questDecks = Object.freeze(avatar.questDecks.map((deck) => Object.freeze({ ...deck })));
    const snapshot = Object.freeze({ ...avatar, questDecks });
    for (const { listener } of avatarSubscriptions) {
      try {
        void Promise.resolve(listener(snapshot)).catch(() => {});
      } catch {
        // Presentation callbacks cannot interrupt the verified Lobby stream.
      }
    }
  }

  attachLobbyAvatar((patch) => {
    if (!initialData) return;
    const avatar = initialData.avatar;
    if (avatar) {
      if (Object.entries(patch).every(([field, value]) => avatar[field] === value)) return;
      Object.assign(avatar, patch);
      publishAvatar();
    } else if (confirmedAvatar) {
      Object.assign(confirmedAvatar.avatar, patch);
    } else if (registrationLobbyPatch) {
      Object.assign(registrationLobbyPatch, patch);
    }
  });

  function stop(reason) {
    if (!closing) {
      clearInterval(timer);
      initialData = null;
      questData = null;
      confirmedAvatar = null;
      for (const subscription of avatarSubscriptions) subscription.unsubscribe();
      boundQuestDecks.clear();
      sessionKey.fill(0);
      const request = questRequest;
      const returning = questReturn;
      const profileOperation = profileRequest;
      const retained = adventure;
      if (retained) retained.state = 'closed';
      for (const operation of [request, returning, profileOperation]) {
        operation?.controller.abort(new SessionError(reason === 'closed' ? 'cancelled' : 'network'));
      }
      closing = (async () => {
        if (request) await request.task.catch(() => {});
        if (returning) await returning.task.catch(() => {});
        if (profileOperation) await profileOperation.task.catch(() => {});
        if (retained) {
          if (retained.battle) await retained.battle.stop(reason);
          retained.nonCombatObserver?.stop();
          await closeChannel(retained.channel);
        }
        await closeSession(auth, channels);
        resolveClosed(reason);
      })();
    }
    return closing;
  }

  function assertQuestAvailable() {
    if (questRequest || questReturn || profileRequest) throw new SessionError('busy');
    if (adventure) {
      if (adventure.state === 'return-uncertain') throw new SessionError('quest-return-uncertain');
      throw new SessionError(adventure.state === 'uncertain' ? 'quest-land-uncertain' : 'quest-adventure-active');
    }
  }

  function editableDeck() {
    if (!initialData?.avatar || !questData || adventure || questRequest || questReturn || profileRequest
        || searchUncertain || questStartUncertain || questData.rows.some((row) => row.status === QUEST_IN_PROGRESS)) return null;
    const deck = initialData.deckCollection?.deck;
    if (deck?.index !== 1 || deck.status !== 0 || deck.cards.length >= CHARACTER_DECK_SIZE
        || deck.cards.some((card, index) => card.position !== index)) return null;
    return deck;
  }

  function assertAvatarRegistration(expected, signal) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (!initialData) throw new SessionError('network');
    if (questRequest || questReturn || profileRequest) throw new SessionError('busy');
    if (registrationState !== expected) throw new SessionError('avatar-registration-unavailable');
    auth.assertOpen();
    for (const { socket } of channels) socket.assertOpen();
  }

  async function withRegistrationChannel(channel, signal, work) {
    const controller = new AbortController();
    const requestSignal = controller.signal;
    const cancel = () => controller.abort(new SessionError('cancelled'));
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(new SessionError('timeout')), TIMEOUT);
    const task = (async () => {
      if (channel.heartbeat) await bounded(channel.heartbeat, requestSignal);
      requestSignal.throwIfAborted();
      return work(channel.socket, requestSignal);
    })();
    profileRequest = { channel, controller, task };
    try {
      return await task;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      profileRequest = null;
    }
  }

  function assertQuestDeckCurrent() {
    if (deckEditState === 'pending-verification' || deckEditState === 'uncertain') {
      throw new SessionError('deck-edit-unavailable');
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

  function availableNextLands(current) {
    if (current.battle) return current.battle.nextLands;
    if ((!current.emptyTerrain && !current.fixedGemTreasure) || current.run.progress === null) return [];
    return nextBattleLands(current.run.positions, current.slot, current.run.progress);
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
        ...channels.map((channel) => {
          const { socket, pong } = channel;
          if (profileRequest?.channel === channel) return null;
          channel.heartbeat = socket.ask(3, [], [pong], { allowOther: true }).finally(() => { channel.heartbeat = null; });
          return channel.heartbeat;
        }),
      ]);
      for (const reply of replies) reply?.done();
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
    refreshLobbyAvatar() {
      const now = performance.now();
      if (!initialData?.avatar || profileRequest || questRequest || questReturn
          || now - lastLobbyRefresh < LOBBY_REFRESH_INTERVAL) return false;
      try {
        auth.assertOpen();
        lobby.socket.send(LOBBY_REFRESH_AVATAR, []);
        lastLobbyRefresh = now;
        return true;
      } catch {
        return false;
      }
    },
    subscribeAvatar(listener, { signal } = {}) {
      if (!initialData || signal?.aborted || typeof listener !== 'function') return () => {};
      const subscription = {
        listener,
        unsubscribe() {
          avatarSubscriptions.delete(subscription);
          signal?.removeEventListener('abort', subscription.unsubscribe);
        },
      };
      avatarSubscriptions.add(subscription);
      signal?.addEventListener('abort', subscription.unsubscribe, { once: true });
      return subscription.unsubscribe;
    },
    get avatarRegistrationState() { return initialData ? registrationState : 'unavailable'; },
    get avatarRegistrationOptions() { return initialData?.registration ? registrationOptions : null; },
    async checkAvatarName(name, { signal } = {}) {
      assertAvatarRegistration('available', signal);
      validateAvatarName(name);
      let namePending = false;
      try {
        await withRegistrationChannel(lobby, signal, async (socket, requestSignal) => {
          const code = await requestAvatarName(socket, name, requestSignal, () => { namePending = true; });
          namePending = false;
          if (code !== 0) throw new SessionError(code === 1 ? 'avatar-name-taken' : 'avatar-name-invalid', code);
        });
      } catch (error) {
        if (namePending) {
          registrationState = 'uncertain';
          throw new SessionError('avatar-name-uncertain');
        }
        throw error;
      }
    },
    async createAvatar(selection, { signal } = {}) {
      assertAvatarRegistration('available', signal);
      const fields = avatarRegistrationFields(selection ?? {}, registrationOptions);

      let namePending = false;
      let createSent = false;
      registrationState = 'creating';
      try {
        return await withRegistrationChannel(lobby, signal, async (socket, requestSignal) => {
          const code = await requestAvatarName(socket, fields[0], requestSignal, () => { namePending = true; });
          namePending = false;
          if (code !== 0) throw new SessionError(code === 1 ? 'avatar-name-taken' : 'avatar-name-invalid', code);
          const reply = await submitAvatarRegistration(socket, fields, requestSignal, {
            markSent() { createSent = true; },
            markProfile() { registrationLobbyPatch = {}; },
          });
          requestSignal.throwIfAborted();
          if (!reply) {
            createSent = false;
            throw new SessionError('avatar-create-rejected');
          }
          Object.assign(reply.avatar, registrationLobbyPatch);
          confirmedAvatar = reply;
          registrationState = 'confirmed';
          return { avatarId: reply.avatar.id, name: reply.avatar.name };
        });
      } catch (error) {
        registrationState = createSent || namePending ? 'uncertain' : 'available';
        if (createSent) throw new SessionError('avatar-create-uncertain');
        if (namePending) throw new SessionError('avatar-name-uncertain');
        throw error;
      } finally {
        registrationLobbyPatch = null;
      }
    },
    async enterAvatarTutorial({ signal } = {}) {
      assertAvatarRegistration('confirmed', signal);
      let notified = false;
      registrationState = 'activating';
      try {
        return await withRegistrationChannel(data, signal, async (socket, requestSignal) => {
          // The original client rebinds the new avatar on Data before playing the tutorial.
          // This command has no profile reply. The profile comes from the verified Lobby SC4.
          socket.send(DATA_AVATAR_CREATED_REQUEST, []);
          notified = true;
          const pong = await socket.ask(3, [], [data.pong], { signal: requestSignal, allowOther: true });
          pong.done();
          requestSignal.throwIfAborted();
          socket.assertOpen();
          const { questData: profileQuests, ...profile } = confirmedAvatar;
          initialData = { ...initialData, ...profile, registration: null };
          questData = profileQuests;
          confirmedAvatar = null;
          registrationState = 'active';
          publishAvatar();
          return profile.avatar;
        });
      } catch (error) {
        registrationState = notified ? 'uncertain' : 'confirmed';
        if (notified) {
          confirmedAvatar = null;
          throw new SessionError('avatar-tutorial-uncertain');
        }
        throw error;
      }
    },
    get deckEditState() {
      if (!initialData) return 'unavailable';
      return deckEditState ?? (editableDeck() ? 'available' : 'unavailable');
    },
    async addDeckCard(inventoryId, { signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      if (questRequest || questReturn || profileRequest) throw new SessionError('busy');
      const deck = editableDeck();
      if (deckEditState || !deck) throw new SessionError('deck-edit-unavailable');
      const candidate = initialData.deckCollection.binder.find((card) => card.inventoryId === inventoryId);
      if (!candidate) throw new SessionError('deck-card-unavailable');
      const ticket = Object.freeze({
        playerId, avatarId: initialData.avatar.id, inventoryId: candidate.inventoryId, cardId: candidate.cardId,
        deckIndex: deck.index, position: deck.cards.length, previousCards: deck.cards,
      });
      auth.assertOpen();
      for (const { socket } of channels) socket.assertOpen();

      const controller = new AbortController();
      const editSignal = controller.signal;
      const cancel = () => controller.abort(new SessionError('cancelled'));
      signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => controller.abort(new SessionError('timeout')), TIMEOUT);
      let sent = false;
      deckEditState = 'moving';
      const task = (async () => {
        if (lobby.heartbeat) await bounded(lobby.heartbeat, editSignal);
        if (!await verifyDeckAppend(ticket.cardId, ticket.previousCards, editSignal)) {
          throw new SessionError('deck-card-unavailable');
        }
        const rejection = await submitDeckAppend(lobby.socket, ticket, editSignal, () => { sent = true; });
        editSignal.throwIfAborted();
        if (rejection !== null) {
          sent = false;
          throw new SessionError('deck-edit-rejected', rejection);
        }
      })();
      profileRequest = { channel: lobby, controller, task };
      try {
        await task;
        editSignal.throwIfAborted();
        deckEditState = 'pending-verification';
        return ticket;
      } catch (error) {
        deckEditState = sent ? 'uncertain' : undefined;
        if (sent) {
          const unknown = new SessionError('deck-edit-uncertain');
          unknown.ticket = ticket;
          throw unknown;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
        profileRequest = null;
      }
    },
    get questAdventure() {
      if (!adventure) return null;
      const { inventoryId, slot, state, channel, run } = adventure;
      const nextLands = ['encounter', 'progress'].includes(state) ? availableNextLands(adventure) : [];
      return {
        inventoryId, slot, state: nextLands.length ? 'between-lands' : state, closed: channel.socket.closed,
        nextLands, progress: run.progress, damage: run.damage?.slice() ?? null, emptyTerrain: adventure.emptyTerrain === true,
        fixedGemTreasure: adventure.fixedGemTreasure ? { ...adventure.fixedGemTreasure } : null,
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
      assertQuestDeckCurrent();
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
    async enterQuestLand(inventoryId, slot, { signal, emptyTerrain = false, fixedGemTreasure = false } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      assertQuestAvailable();
      assertQuestDeckCurrent();
      if (!questData || !Number.isInteger(inventoryId) || inventoryId < 1 || inventoryId > 0x7fffffff
          || !Number.isInteger(slot) || slot < 0 || slot > 2 || typeof emptyTerrain !== 'boolean'
          || typeof fixedGemTreasure !== 'boolean' || (emptyTerrain && fixedGemTreasure)) {
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
            const run = questRun();
            let authoredTreasure = null;
            if (emptyTerrain || fixedGemTreasure) {
              const catalogSignal = AbortSignal.any([questSignal, AbortSignal.timeout(3500)]);
              run.positions = await readQuestRoute(selected.questId, catalogSignal).catch(() => null);
              questSignal.throwIfAborted();
              const authored = run.positions?.get(slot);
              authoredTreasure = fixedGemTreasure ? authored?.fixedGemTreasure ?? null : null;
              if (!(emptyTerrain ? authored?.emptyTerrain : authoredTreasure)
                  || !nextBattleLands(run.positions, slot, 0).length) {
                throw new SessionError('quest-land-unavailable');
              }
            }
            const rows = await readQuestInventoryPushes(socket, confirm, questSignal);
            if (!rows.some((row) => row.inventoryId === inventoryId && row.questId === selected.questId
                && row.status === QUEST_IN_PROGRESS)) throw new SessionError('quest-land-unavailable');
            const result = await submitQuestLand(socket, questSignal, selected, slot, () => {
              current = { inventoryId, slot, channel, selected, connected: true, state: 'entering', run };
              channel.retained = true;
              adventure = current;
              void socket.closed.then(() => {
                current.connected = false;
                if (['entering', 'encounter', 'progress'].includes(current.state)) current.state = 'uncertain';
              });
            }, (encounter) => {
              current.playerCards = encounter.playerCardIds.slice();
              current.battle = observeQuestBattle(socket, selected, slot, encounter, current.run,
                (receipt) => reconcileQuestSettlement(selected, receipt));
            }, { emptyTerrain, fixedGemTreasure: authoredTreasure });
            if (result.rejection !== undefined) {
              adventure = null;
              channel.retained = false;
            } else if (result.emptyTerrain || result.fixedGemTreasure) {
              current.run.progress = result.progress;
              current.nonCombatObserver = observeNonCombatTerrain(socket, selected, result, () => {
                if (['entering', 'progress'].includes(current.state)) current.state = 'uncertain';
              });
              current.emptyTerrain = result.emptyTerrain === true;
              current.fixedGemTreasure = result.fixedGemTreasure ? { ...result.fixedGemTreasure } : null;
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
              if (current.state === 'uncertain') throw new SessionError('quest-land-uncertain');
              if (result.fixedGemTreasure) initialData.avatar.gems = result.fixedGemTreasure.balance;
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
      if (!validQuestSlot(slot) || !['encounter', 'progress'].includes(current?.state) || !current.connected
          || !availableNextLands(current).some((land) => land.slot === slot)) {
        throw new SessionError('quest-land-unavailable');
      }
      const previousBattle = current.battle;
      const previousObserver = previousBattle ?? current.nonCombatObserver;
      const previousState = current.state;

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
        if (current.state !== 'entering' || !availableNextLands(current).some((land) => land.slot === slot)) {
          throw new SessionError('quest-land-unavailable');
        }

        const damage = current.run.damage?.slice();
        const result = await submitQuestLand(socket, controller.signal, current.selected, slot,
          () => { dispatched = true; }, (encounter) => {
            if ((current.playerCards && !sameValues(encounter.playerCardIds, current.playerCards))
                || (damage && !sameValues(encounter.playerDamage, damage))) {
              throw new SessionError('protocol');
            }
            current.playerCards ??= encounter.playerCardIds.slice();
            current.run.damage ??= encounter.playerDamage.slice();
            current.battle = observeQuestBattle(socket, current.selected, slot, encounter, current.run,
              (receipt) => reconcileQuestSettlement(current.selected, receipt));
            current.slot = slot;
            current.emptyTerrain = false;
            current.fixedGemTreasure = null;
            current.nonCombatObserver = null;
            void previousObserver.stop('closed');
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
        if (current.battle === previousBattle) previousObserver.resume();
        if (dispatched && error.kind !== 'quest-land-rejected') {
          current.state = 'uncertain';
          throw new SessionError('quest-land-uncertain');
        }
        if (current.state === 'entering') current.state = previousState;
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

export async function registerAccount(username, password, { signal } = {}) {
  if (signal?.aborted) throw new SessionError('cancelled');
  if (typeof username !== 'string' || typeof password !== 'string'
      || !LOGIN_FIELD.test(username) || !LOGIN_FIELD.test(password)) {
    throw new SessionError('account-register-invalid');
  }

  const registration = new AbortController();
  const cancel = () => registration.abort(new SessionError('cancelled'));
  signal?.addEventListener('abort', cancel, { once: true });
  let auth;
  let dispatched = false;
  let result;
  try {
    const verifierPromise = createRegistrationVerifier(username, password);
    password = '';
    const { salt, verifier } = await bounded(verifierPromise, registration.signal);
    registration.signal.throwIfAborted();
    auth = new SessionSocket(AUTH_PORT);
    await auth.open(registration.signal);
    // Original CS5 has no email field. Ruby supplies the platform email on its side.
    const reply = await auth.ask(AUTH_REGISTER_REQUEST, [username, salt, verifier, SERVER_SB], [AUTH_REGISTER_REPLY], {
      signal: registration.signal,
      onSend: () => { dispatched = true; },
    });
    result = reply.int();
    reply.done();
    if (result < 0 || result > 7) throw new SessionError('protocol');
  } catch (error) {
    if (dispatched) throw new SessionError('account-register-uncertain');
    throw error instanceof SessionError ? error : new SessionError('protocol');
  } finally {
    signal?.removeEventListener('abort', cancel);
    await auth?.close();
  }

  if (result === 1) throw new SessionError('account-name-taken', result);
  if (result !== 0) throw new SessionError('account-register-rejected', result);
}

export async function startSession(username, password, { signal, onAuthenticated } = {}) {
  if (signal?.aborted) throw new SessionError('cancelled');
  if (typeof username !== 'string' || typeof password !== 'string'
    || !LOGIN_FIELD.test(username) || !LOGIN_FIELD.test(password)) {
    throw new SessionError('credentials');
  }

  let auth;
  let sessionKeyBytes;
  const channels = [];
  const startupAvatarPatch = {};
  let publishLobbyAvatar = (patch) => Object.assign(startupAvatarPatch, patch);
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
    startupSignal.throwIfAborted();
    auth.assertOpen();
    if (typeof onAuthenticated === 'function') {
      try {
        void Promise.resolve(onAuthenticated()).catch(() => {});
      } catch {
        // A presentation callback cannot interrupt the remaining service connections.
      }
    }

    let initialData;
    for (const { port, pong } of CHANNELS) {
      startupSignal.throwIfAborted();
      const channel = { port, pong, verified: false };
      const onPushedReply = port === LOBBY_PORT
        ? (reply) => channel.verified && observeLobbyAvatar(reply, publishLobbyAvatar)
        : undefined;
      channel.socket = new SessionSocket(port, rejectStartup, onPushedReply);
      channels.push(channel);
      const data = await confirmChannel(channel, playerId, sessionKeyBytes, startupSignal);
      if (data) initialData = data;
    }
    startupSignal.throwIfAborted();
    auth.assertOpen();
    for (const { socket } of channels) socket.assertOpen();
    finishStartup();
    if (initialData.avatar) Object.assign(initialData.avatar, startupAvatarPatch);
    return activeSession(auth, channels, playerId, sessionKeyBytes, initialData, (receiver) => {
      publishLobbyAvatar = receiver;
    });
  } catch (error) {
    finishStartup();
    sessionKeyBytes?.fill(0);
    await closeSession(auth, channels);
    throw error instanceof SessionError ? error : new SessionError('protocol');
  }
}
