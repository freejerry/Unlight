import { createAuthExchange, createRegistrationVerifier } from './srp.js';
import { applySessionKey, createFrameParser, encodeCommand, readReply, signedByte } from './wire.js';
import {
  AVATAR_COMMAND, LOBBY_AVATAR_COMMAND, REGISTRATION_COMMAND, VERSION_COMMAND, readDataProfile, readLobbyAvatar, readVersions,
} from './data-bootstrap.js';
import {
  QUEST_DISCOVERY_REQUEST, QUEST_DISCOVERY_REPLY, QUEST_INVENTORY_REPLY, QUEST_MAP_REQUEST, QUEST_MAP_REPLY,
  QUEST_SEARCH_REQUEST, QUEST_SEARCH_REPLY, QUEST_SEARCH_TIMER, MAX_QUEST_SEARCH_TIMER, QUEST_ENERGY_REPLY, QUEST_ERROR_REPLY,
  QUEST_CONFIRM_REQUEST, QUEST_START_REQUEST, QUEST_DELETED_REPLY,
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
  QUEST_REWARD_HIGH_REQUEST, QUEST_REWARD_LOW_REQUEST, QUEST_REWARD_NEXT_REQUEST, QUEST_REWARD_TAKE_REQUEST,
  QUEST_REWARD_AWARD_REPLY, QUEST_REWARD_CANDIDATES_REPLY, QUEST_REWARD_BASE_DICE_REPLY,
  QUEST_REWARD_DECISION_REPLY, QUEST_REWARD_ROLLED_DICE_REPLY, QUEST_REWARD_FINAL_REPLY,
  QUEST_ITEM_USE_REQUEST, QUEST_ITEM_GRANTED_REPLY, QUEST_ITEM_CONSUMED_REPLY,
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
  readQuestSettlementValueReply, readQuestCharacterAwardReply, readQuestRewardReply, readQuestItemReply,
} from './quest-data.js';

const AUTH_PORT = 12001;
const AUTH_REGISTER_REQUEST = 5;
const AUTH_REGISTER_REPLY = 0;
const SERVER_SB = 0;
const LOBBY_PORT = 12002;
const DATA_PORT = 12003;
const DATA_AVATAR_CREATED_REQUEST = 4;
const DATA_ACHIEVEMENT_CLEAR_REPLY = 22;
const DATA_ACHIEVEMENT_NEW_REPLY = 23;
const DATA_ACHIEVEMENT_DELETE_REPLY = 24;
const DATA_ACHIEVEMENT_UPDATE_REPLY = 25;
const DATA_ACHIEVEMENT_FIELD_LIMIT = 1024 * 1024;
const QUEST_PORT = 12005;
const LOBBY_CREATE_AVATAR_REQUEST = 10;
const LOBBY_CHECK_NAME_REQUEST = 11;
const LOBBY_CREATE_AVATAR_REPLY = 5;
const LOBBY_CHECK_NAME_REPLY = 6;
const LOBBY_SELECT_DECK_REQUEST = 12;
const LOBBY_SELECT_DECK_REPLY = 9;
const LOBBY_MOVE_DECK_CARD_REQUEST = 5;
const LOBBY_MOVE_DECK_CARD_FAILED_REPLY = 10;
const LOBBY_ERROR_REPLY = 34;
const LOBBY_MOVE_DECK_CARD_FINISH_REPLY = 67;
const LOBBY_ACHIEVEMENT_CHECK = 35;
const LOBBY_SELECTABLE_REWARD_REQUEST = 51;
const LOBBY_PONG = 35;
const LOBBY_REFRESH_AVATAR = 17;
const LOBBY_ENERGY_REPLY = 17;
const LOBBY_ENERGY_MAX_REPLY = 18;
const LOBBY_LEVEL_REPLY = 22;
const LOBBY_DECK_EXP_REPLY = 23;
const LOBBY_DECK_LEVEL_REPLY = 24;
const LOBBY_GEMS_REPLY = 25;
const LOBBY_ITEM_GRANTED_REPLY = 27;
const LOBBY_CHARACTER_GRANTED_REPLY = 31;
const LOBBY_FREE_DUEL_COUNT_REPLY = 42;
const LOBBY_RECOVERY_INTERVAL_REPLY = 45;
const LOBBY_ACHIEVEMENT_CLEAR_REPLY = 51;
const LOBBY_ACHIEVEMENT_NEW_REPLY = 52;
const LOBBY_NOTICE_REPLY = 54;
const LOBBY_SELECTABLE_OPTIONS_REPLY = 71;
const LOBBY_SELECTABLE_RESULT_REPLY = 72;
const LOBBY_SELECTABLE_NOTICE_TYPE = '26';
const LOBBY_NOTICE_MAX_BYTES = 1024 * 1024 - 6;
const LOBBY_SELECTABLE_OPTIONS_MAX_BYTES = 4096;
const LOBBY_REFRESH_INTERVAL = 2000;
// Destination levels with a nonzero LEVEL_ENG_BOUNUS in the original Ruby table (levels 1–150).
const ENERGY_CAP_GROWTH_LEVELS = [2, 4, 6, 8, 10, 13, 17, 21, 26, 31, 36, 41, 46, 51, 56, 61, 66, 73, 80, 90, 100,
  110, 120, 130, 140, 150];
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
const QUEST_PRESENTED = 6;
const QUEST_ACTION_CARD_COUNT_REPLY = 32;
const MAX_QUEST_ROWS = 127; // The original Data inventory count is a signed byte.
const QUEST_LAND_SLOTS = 15;
const QUEST_GEM_TREASURE_TYPE = 5; // Original TG_GEM.
const QUEST_CHARACTER_TREASURE_TYPE = 1; // Original TG_CHARA_CARD.
const QUEST_OWN_CARD_TREASURE_TYPE = 6; // Original TG_OWN_CARD.
const QUEST_BONUS_GAME_TREASURE_TYPE = 7; // Original TG_BONUS_GAME.
const QUEST_VANGUARD_KINDS = new Set([0, 8, 13]); // Original ordinary, reborn, and episode characters.
const QUEST_BOSS_KIND = 2; // Original QT_BOSS.
const MAX_QUEST_MAP_ID = 35; // Ordinary Traditional Chinese quest maps.
const ORDINARY_QUEST_PAGE_LAST_INDEX = [2, 10, 18, 26, 34, 35]; // Flash Const.QUEST_MAP_NUM cumulative totals minus one.
const QUEST_REWARD_ITEMS = new Map([[4, null], [5, 1], [6, 3], [7, 5], [8, 12]]); // AvatarItems master definitions and ITEM_EFFECTS.
const QUEST_ITEM_MISSING = 72;
const LAST_ORDINARY_SEARCH_MAP = 36;
const FIRST_TUTORIAL_SEARCH_MAP = 2009;
const LAST_TUTORIAL_SEARCH_MAP = 2013;
const MAX_TIMER_DELAY = 0x7fffffff;
const QUEST_SEARCH_ERRORS = new Set([1, 30, 31, 32]); // Original get_quest return codes.
const QUEST_START_ERRORS = new Set([1, 16, 40, 41, 42]); // Original quest_start return codes.
const QUEST_LAND_REJECTIONS = new Set([16, 41, 42, 43]); // Before the original next-land commit.
const QUEST_MISSING_ERROR = 40;
const DIRECTION_PENDING = 2;
const DIRECTION_CHARA_CHANGE = 3;
const QUEST_CARD_ROTATE_REQUEST = 32;
const QUEST_CARD_ROTATE_REPLY = 63;
const QUEST_EVENT_CARD_ROTATE_REPLY = 64;
const QUEST_MOVE_SUBMITTED_REPLY = 67;
const QUEST_ATTACK_SUBMITTED_REPLY = 68;
const QUEST_DEFENCE_SUBMITTED_REPLY = 69;
const QUEST_POINT_UPDATE_REPLY = 82;
const QUEST_HAND_ZONE = 0;
const QUEST_MOVE_ZONE = 1;
const QUEST_BATTLE_ZONE = 2;
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
const QUEST_REWARD_REPLIES = [QUEST_REWARD_AWARD_REPLY, QUEST_REWARD_CANDIDATES_REPLY, QUEST_REWARD_BASE_DICE_REPLY,
  QUEST_REWARD_DECISION_REPLY, QUEST_REWARD_ROLLED_DICE_REPLY, QUEST_REWARD_FINAL_REPLY, QUEST_ITEM_CONSUMED_REPLY];
const QUEST_REWARD_AVATAR_REPLIES = [QUEST_EXP_REPLY, QUEST_LEVEL_REPLY, QUEST_GEMS_REPLY, QUEST_CHARACTER_AWARD_REPLY];
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
  'deck-select-unavailable': '目前無法切換牌組。',
  'deck-select-uncertain': '未能確認選中的牌組，請重新登入查看。',
  'search-uncertain': '尚未確認搜尋結果，請重新登入後再搜尋。',
  'search-rejected': '遊戲服務未接受這次搜尋。',
  'search-unavailable': '目前無法搜尋這個地區。',
  'quest-confirm-unavailable': '目前無法確認這個任務。',
  'quest-confirm-uncertain': '未能確認任務狀態，請回到大廳後重新進入任務查看。',
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
  'quest-reward-unavailable': '原版獎勵目前不接受這項操作。',
  'quest-reward-uncertain': '尚未確認獎勵結果，本次獎勵暫停操作。',
  'quest-reward-item-unavailable': '目前無法使用這個獎勵道具。',
  'quest-reward-item-rejected': '遊戲服務未接受這個獎勵道具。',
  'quest-reward-item-insufficient': '骰點差超出這個道具的補正範圍。',
  'quest-return-unavailable': '任務服務尚未確認可返回地圖。',
  'quest-return-uncertain': '未能確認原版任務連線已釋放。',
  'lobby-reward-unavailable': '目前無法領取這項成就獎勵。',
  'lobby-reward-rejected': '伺服器未接受這次獎勵選擇。',
  'lobby-reward-uncertain': '尚未確認獎勵是否入庫，請重新登入查看。',
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
    signal?.throwIfAborted();
    this.send(2, []);
    this.#reason = 'closed';
    try {
      await bounded(this.closed, signal, CLOSE_TIMEOUT);
      signal?.throwIfAborted();
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

function readAchievementEvent(reply, isNew) {
  const achievementId = reply.int();
  if (achievementId <= 0) throw new SessionError('protocol');
  if (isNew) return { kind: 'new-achievement', achievementId };
  const treasureType = reply.int();
  const itemId = reply.int();
  const amount = reply.int();
  const slotType = reply.int();
  if (treasureType < 0 || treasureType > 7 || itemId < 0 || amount < 0 || slotType < 0) {
    throw new SessionError('protocol');
  }
  return { kind: 'achievement', achievementId, treasureType, itemId, amount, slotType };
}

function readSelectableLobbyNotices(reply) {
  const body = reply.string(LOBBY_NOTICE_MAX_BYTES, true);
  const unique = new Set();
  for (const row of body.split('|')) {
    if (!row.startsWith(`${LOBBY_SELECTABLE_NOTICE_TYPE}:`)) continue;
    const idText = row.slice(LOBBY_SELECTABLE_NOTICE_TYPE.length + 1);
    const achievementId = Number(idText);
    if (!/^[1-9]\d{0,9}$/.test(idText) || achievementId > 0x7fffffff || unique.has(achievementId)) {
      throw new SessionError('protocol');
    }
    unique.add(achievementId);
  }
  return [...unique];
}

function readSelectableLobbyOptions(reply) {
  const achievementId = reply.int();
  const packed = reply.string(LOBBY_SELECTABLE_OPTIONS_MAX_BYTES);
  if (achievementId <= 0) throw new SessionError('protocol');
  let previous = -1;
  const choices = packed.split(',').map((row) => {
    if (!/^\d{1,10}(\/\d{1,10}){4}$/.test(row)) throw new SessionError('protocol');
    const [index, type, itemId, amount, slotType] = row.split('/').map(Number);
    if (index <= previous || index >= 255 || type !== 1 || itemId < 1 || itemId > 0x7fffffff || amount !== 1 || slotType !== 0) {
      throw new SessionError('protocol');
    }
    previous = index;
    return Object.freeze({ index, type, itemId, amount, slotType });
  });
  return { kind: 'selectable-options', achievementId, choices: Object.freeze(choices) };
}

function readSelectableLobbyResult(reply, achievementId, selectionIndex) {
  const id = reply.int();
  const index = reply.int();
  const code = reply.byte();
  const inventoryId = reply.int();
  const cardId = reply.int();
  reply.done();
  if (id !== achievementId || index !== selectionIndex || (code === 0 && (inventoryId < 1 || cardId < 1))
    || (code !== 0 && ((code !== 1 && code !== 2) || inventoryId !== 0 || cardId !== 0))) throw new SessionError('protocol');
  return { code, inventoryId, cardId };
}

function observeLobbyAvatar(reply, publish) {
  let patch;
  let marker;
  let event;
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
      case LOBBY_RECOVERY_INTERVAL_REPLY: {
        const energyRecoveryInterval = reply.int();
        if (energyRecoveryInterval > 0) patch = { energyRecoveryInterval };
        break;
      }
      case LOBBY_GEMS_REPLY: {
        const gems = reply.int();
        if (gems >= 0) {
          patch = { gems };
          event = { kind: 'gems', gems };
        }
        break;
      }
      case LOBBY_ITEM_GRANTED_REPLY:
      case LOBBY_CHARACTER_GRANTED_REPLY: {
        const inventoryId = reply.int();
        const definitionId = reply.int();
        if (inventoryId > 0 && definitionId > 0) {
          event = reply.command === LOBBY_ITEM_GRANTED_REPLY
            ? { kind: 'item', inventoryId, itemId: definitionId }
            : { kind: 'card', inventoryId, cardId: definitionId };
        }
        break;
      }
      case LOBBY_ACHIEVEMENT_CLEAR_REPLY:
      case LOBBY_ACHIEVEMENT_NEW_REPLY:
        event = readAchievementEvent(reply, reply.command === LOBBY_ACHIEVEMENT_NEW_REPLY);
        break;
      case LOBBY_NOTICE_REPLY:
        event = { kind: 'selectable-notices', achievementIds: readSelectableLobbyNotices(reply) };
        break;
      case LOBBY_SELECTABLE_OPTIONS_REPLY:
        event = readSelectableLobbyOptions(reply);
        break;
      case LOBBY_FREE_DUEL_COUNT_REPLY: {
        const freeDuelCount = reply.byte();
        if (freeDuelCount >= 0 && freeDuelCount <= 3) patch = { freeDuelCount };
        break;
      }
      case LOBBY_LEVEL_REPLY:
      case LOBBY_DECK_EXP_REPLY:
      case LOBBY_DECK_LEVEL_REPLY: {
        const value = reply.int();
        if (value >= 0) marker = value;
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
  if (patch || marker !== undefined || event) publish(patch, reply.command, marker, event);
  return true;
}

function authReply(reply, expected) {
  if (reply.command === expected) return reply;
  if (reply.command === 4) throw new SessionError('network');
  throw new SessionError('credentials');
}

function observeInitialData(channel, signal, publishAchievement) {
  const { socket } = channel;
  const decoding = new AbortController();
  let versions;
  let profileStarted = false;
  let unsubscribe;
  channel.waitingForProfile = true;
  const received = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([
      VERSION_COMMAND, AVATAR_COMMAND, REGISTRATION_COMMAND, DATA_ACHIEVEMENT_CLEAR_REPLY, DATA_ACHIEVEMENT_NEW_REPLY,
      DATA_ACHIEVEMENT_DELETE_REPLY, DATA_ACHIEVEMENT_UPDATE_REPLY,
    ], (reply) => {
      try {
        if (!channel.verified) throw new SessionError('protocol');
        if (reply.command === VERSION_COMMAND) {
          if (versions) throw new SessionError('protocol');
          versions = readVersions(reply);
          return;
        }
        if (!versions) throw new SessionError('protocol');
        if (reply.command === DATA_ACHIEVEMENT_CLEAR_REPLY || reply.command === DATA_ACHIEVEMENT_NEW_REPLY) {
          const event = readAchievementEvent(reply, reply.command === DATA_ACHIEVEMENT_NEW_REPLY);
          reply.done();
          publishAchievement(event);
          return;
        }
        if (reply.command === DATA_ACHIEVEMENT_DELETE_REPLY) {
          if (reply.int() <= 0) throw new SessionError('protocol');
          reply.done();
          return;
        }
        if (reply.command === DATA_ACHIEVEMENT_UPDATE_REPLY) {
          for (let field = 0; field < 5; field += 1) reply.discardString(DATA_ACHIEVEMENT_FIELD_LIMIT, true);
          reply.done();
          return;
        }
        if (profileStarted) throw new SessionError('protocol');
        profileStarted = true;
        channel.waitingForProfile = false;
        // Anchor the original relative times at frame arrival, before async inflation.
        const receivedAt = performance.now();
        readDataProfile(reply, decoding.signal).then(
          ({ questData, ...profile }) => resolve({
            versions,
            ...profile,
            questData: questData ? Object.assign(questData, { receivedAt }) : null,
          }),
          reject,
        );
      } catch (error) {
        reject(error);
      }
    });
    socket.closed.then(() => reject(new SessionError('network')));
  });
  return {
    received: bounded(received, signal),
    dispose() {
      channel.waitingForProfile = false;
      unsubscribe();
      decoding.abort();
    },
  };
}

async function confirmChannel(channel, playerId, sessionKey, signal, publishAchievement) {
  const { socket } = channel;
  await socket.open(signal);
  const negotiation = await socket.ask(0, [playerId], [0, 2], {
    signal,
    nextKey: sessionKey,
    onSend() { channel.negotiationSent = true; },
  });
  if (negotiation.command !== 0) throw new SessionError('protocol');
  const sign = negotiation.string(4);
  if (!/^\d{1,4}$/.test(sign) || negotiation.string(10) !== 'are you ok') {
    throw new SessionError('protocol');
  }
  negotiation.done();

  // This service sends the bootstrap immediately after its certificate in the same TCP stream.
  const initial = channel.port === DATA_PORT ? observeInitialData(channel, signal, publishAchievement) : null;
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
    return { ...profile, questData: Object.assign(questData, { receivedAt }) };
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

async function readDeckCharacterCatalog(ids, signal) {
  const params = new URLSearchParams({ ids: [...ids].join(',') });
  try {
    const response = await fetch(`/api/deck-character-catalog?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
    });
    if (!response.ok) return null;
    const { cards } = await response.json();
    if (!Array.isArray(cards) || cards.length !== ids.size) return null;
    const known = new Map();
    for (const card of cards) {
      if (!ids.has(card?.id) || known.has(card.id)) return null;
      known.set(card.id, card);
    }
    return known;
  } catch {
    signal.throwIfAborted();
    return null;
  }
}

async function verifyDeckAppend(cardId, previousCards, signal) {
  const ids = new Set([cardId, ...previousCards.map((card) => card.cardId)]);
  const known = await readDeckCharacterCatalog(ids, signal);
  return Boolean(known && canAppendDeckCharacter(known.get(cardId), previousCards.map((card) => known.get(card.cardId))));
}

async function readQuestVanguardReward(deck, signal) {
  const roster = deck.cards.slice().sort((first, second) => first.position - second.position);
  const known = await readDeckCharacterCatalog(new Set(roster.map(({ cardId }) => cardId)), signal);
  if (!known || [...known.values()].some(({ kind }) => !Number.isInteger(kind))) return null;
  const vanguard = roster.map(({ cardId }) => known.get(cardId)).find(({ kind }) => QUEST_VANGUARD_KINDS.has(kind));
  return validQuestCardId(vanguard?.ownCardLevel1Id) ? vanguard.ownCardLevel1Id : null;
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

async function queryQuest(playerId, sessionKey, signal, read, onPushedReply) {
  const socket = new SessionSocket(QUEST_PORT, undefined, onPushedReply);
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

async function readQuestInventoryPushes(socket, confirm, signal, { sceneChannel } = {}) {
  const rows = [];
  let sawCardCount = false;
  let invalid = false;
  const commands = sceneChannel ? [QUEST_ACTION_CARD_COUNT_REPLY, QUEST_INVENTORY_REPLY] : [QUEST_INVENTORY_REPLY];
  const unsubscribe = socket.observe(commands, (reply) => {
    if (invalid) return;
    try {
      if (sceneChannel) {
        if (!sceneChannel.verified) throw new SessionError('protocol');
        if (reply.command === QUEST_ACTION_CARD_COUNT_REPLY) {
          const count = reply.int();
          reply.done();
          if (sawCardCount || count < 0) throw new SessionError('protocol');
          sawCardCount = true;
          return;
        }
        if (!sawCardCount) throw new SessionError('protocol');
      }
      const row = readQuestInventoryReply(reply, { loginReplay: Boolean(sceneChannel), includeSender: Boolean(sceneChannel) });
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
    if (invalid || (sceneChannel && !sawCardCount)) throw new SessionError('protocol');
    return rows;
  } finally {
    unsubscribe();
  }
}

function mergeQuestSceneRows(cachedRows, liveRows) {
  const unmatched = new Map(liveRows.map((row) => [row.inventoryId, row]));
  if (unmatched.size !== liveRows.length) throw new SessionError('protocol');
  const rows = [];
  for (const cached of cachedRows) {
    const live = unmatched.get(cached.inventoryId);
    if (live) {
      rows.push(cached.status === live.status && cached.questId === live.questId ? { ...cached, ...live } : live);
      unmatched.delete(cached.inventoryId);
    } else if (cached.status === QUEST_PENDING) {
      // The original Quest login deliberately omits pending searches; Data supplies their timers.
      rows.push(cached);
    }
  }
  rows.push(...unmatched.values());
  if (rows.length > MAX_QUEST_ROWS) throw new SessionError('protocol');
  return rows;
}

function questDiscoveryDue(row, profileReceivedAt) {
  if (row.status !== QUEST_PENDING || row.questId !== 0 || !Number.isInteger(row.findSeconds)) return null;
  const receivedAt = row.receivedAt ?? profileReceivedAt;
  if (!Number.isFinite(receivedAt)) return null;
  if (row.receivedAt !== undefined) return receivedAt + row.findSeconds * 1000 + 1;
  // Data truncates the original UTC deadline to seconds. Zero may still be within the next second.
  return receivedAt + (row.findSeconds < 0 ? 0 : (row.findSeconds + 1) * 1000);
}

async function readQuestDiscovery(socket, confirm, signal, inventoryId) {
  // Recover a committed discovery when its original reply did not reach this session.
  const rows = await readQuestInventoryPushes(socket, confirm, signal);
  const existing = rows.find((row) => row.inventoryId === inventoryId && row.questId > 0);
  if (existing) return existing;

  return sendQuestDiscovery(socket, signal, inventoryId);
}

async function sendQuestDiscovery(socket, signal, inventoryId, markDispatched) {
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
    markDispatched?.();
    await finishQuestObservation(socket, signal, unsubscribe);
    return discovered;
  } finally {
    unsubscribe();
  }
}

async function sendQuestConfirmation(socket, signal, row, deckIndex, markDispatched) {
  let confirmed;
  let invalid = false;
  let settle;
  const receipt = new Promise((resolve) => { settle = resolve; });
  const unsubscribe = socket.observe([QUEST_DISCOVERY_REPLY], (reply) => {
    try {
      const update = readQuestDiscoveryReply(reply);
      if (update.inventoryId !== row.inventoryId) return;
      if (confirmed || update.questId !== row.questId || update.status !== QUEST_UNSOLVED) invalid = true;
      else confirmed = update;
    } catch {
      invalid = true;
    }
    settle();
  });
  try {
    signal.throwIfAborted();
    socket.send(QUEST_CONFIRM_REQUEST, [row.inventoryId, signedByte(deckIndex)]);
    markDispatched();
    await bounded(receipt, signal);
    if (invalid) throw new SessionError('quest-confirm-uncertain');
    await finishQuestObservation(socket, signal, unsubscribe);
    if (invalid) throw new SessionError('quest-confirm-uncertain');
    return confirmed;
  } finally {
    unsubscribe();
  }
}

async function submitQuestSearch(socket, confirm, signal, mapId, inventoryIds, markDispatched) {
  const existing = await readQuestInventoryPushes(socket, confirm, signal);
  const known = new Set(inventoryIds);
  for (const { inventoryId } of existing) known.add(inventoryId);
  const result = await sendQuestSearch(socket, signal, mapId, QUEST_SEARCH_TIMER, known, markDispatched);
  if (result.rejection !== undefined) return result;
  return { row: result.row, energy: result.energy.energy };
}

async function sendQuestSearch(socket, signal, mapId, timerIndex, known, markDispatched) {
  const immediate = timerIndex === 0;
  let row = null;
  let energy = null;
  let rejection = null;
  let invalid = false;
  let settle;
  const receipt = new Promise((resolve) => { settle = resolve; });
  const unsubscribe = socket.observe([QUEST_SEARCH_REPLY, QUEST_ENERGY_REPLY, QUEST_ERROR_REPLY], (reply) => {
    if (invalid) return;
    try {
      switch (reply.command) {
        case QUEST_SEARCH_REPLY: {
          const receivedAt = performance.now();
          const added = readQuestSearchReply(reply, timerIndex);
          if (!added || (immediate && known.has(added.inventoryId))) break;
          if (row || known.has(added.inventoryId) || (immediate && !energy) || rejection !== null) invalid = true;
          else row = immediate ? added : { ...added, receivedAt };
          break;
        }
        case QUEST_ENERGY_REPLY: {
          const update = readQuestEnergyReply(reply);
          // Ruby emits energy first only for instantaneous search.
          if (energy || (!immediate && !row) || rejection !== null) invalid = true;
          else energy = { ...update, receivedAt: performance.now() };
          break;
        }
        case QUEST_ERROR_REPLY: {
          const code = readQuestErrorReply(reply);
          if (row || energy || rejection !== null || !QUEST_SEARCH_ERRORS.has(code)) invalid = true;
          else rejection = code;
          break;
        }
      }
    } catch {
      invalid = true;
    }
    if (invalid || rejection !== null || (row && energy)) settle();
  });
  try {
    signal.throwIfAborted();
    socket.send(QUEST_SEARCH_REQUEST, [mapId, timerIndex]);
    markDispatched();
    const lost = socket.closed.then(() => { throw new SessionError('network'); });
    await bounded(Promise.race([receipt, lost]), signal);
    if (invalid) throw new SessionError('search-uncertain');
    await finishQuestObservation(socket, signal, unsubscribe);
    if (!invalid && rejection !== null && !row) return { rejection };
    if (!invalid && rejection === null && row && energy !== null) return { row, energy };
    throw new SessionError('search-uncertain');
  } finally {
    unsubscribe();
  }
}

function isStartableQuest(row, allowGift = false) {
  return row?.questId > 0 && (row.status === QUEST_NEW || row.status === QUEST_UNSOLVED
    || (allowGift && row.status === QUEST_PRESENTED));
}

async function submitQuestStart(socket, confirm, signal, selected, deckIndex, markDispatched) {
  const rows = await readQuestInventoryPushes(socket, confirm, signal);
  const current = rows.find(({ inventoryId }) => inventoryId === selected.inventoryId);
  if (!isStartableQuest(current) || current.questId !== selected.questId) {
    throw new SessionError('quest-start-unavailable');
  }
  return sendQuestStart(socket, signal, selected, deckIndex, markDispatched);
}

async function sendQuestStart(socket, signal, selected, deckIndex, markDispatched) {
  let energy = null;
  let deleted = false;
  let acknowledged = false;
  let duplicate = false;
  let unsubscribe;
  const notification = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([QUEST_ENERGY_REPLY, QUEST_DISCOVERY_REPLY, QUEST_DELETED_REPLY, QUEST_ERROR_REPLY], (reply) => {
      if (acknowledged) {
        try {
          duplicate ||= reply.command === QUEST_DISCOVERY_REPLY
            ? readQuestDiscoveryReply(reply).inventoryId === selected.inventoryId
            : reply.command !== QUEST_DELETED_REPLY || readQuestDeletedReply(reply) === selected.inventoryId;
        } catch {
          duplicate = true;
        }
        return;
      }
      try {
        switch (reply.command) {
          case QUEST_ENERGY_REPLY:
            if (energy !== null) throw new SessionError('protocol');
            energy = { ...readQuestEnergyReply(reply), energyReceivedAt: performance.now() };
            break;
          case QUEST_DISCOVERY_REPLY: {
            const row = readQuestDiscoveryReply(reply);
            if (row.inventoryId !== selected.inventoryId) break;
            if (row.questId !== selected.questId || row.status !== QUEST_IN_PROGRESS || energy === null || deleted) {
              throw new SessionError('protocol');
            }
            acknowledged = true;
            resolve({ row, energy: energy.energy, energyRemainingSeconds: energy.remainingSeconds,
              energyReceivedAt: energy.energyReceivedAt });
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
    if (duplicate) throw new SessionError('protocol');
    return result;
  } finally {
    unsubscribe();
  }
}

async function submitQuestLand(socket, signal, { inventoryId, deckIndex }, slot, markDispatched, markEncounter,
  { emptyTerrain = false, fixedGemTreasure = null, firstLand, expectBattle = false, strictTerrain = false,
    previousProgress = 0, onArrival } = {}) {
  const peaceful = emptyTerrain || fixedGemTreasure !== null;
  const terminal = firstLand?.nextMask === 0;
  let arrived = false;
  let encounter = null;
  let progress = null;
  let terrainReceivedAt = null;
  let finish = null;
  let deleted = false;
  let deckReset = false;
  let invalid = false;
  let gemBalance = null;
  let treasure = null;
  const map = { questFlag: null, questClearNum: null };
  let unsubscribe;
  const notification = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([
      QUEST_NEXT_LAND_REPLY, QUEST_ENCOUNTER_REPLY, QUEST_DUEL_START_REPLY,
      QUEST_PROGRESS_REPLY, QUEST_FINISH_REPLY, QUEST_DELETED_REPLY, QUEST_ERROR_REPLY,
      ...(peaceful || firstLand ? [QUEST_DECK_STATE_REPLY, QUEST_DUEL_FINISH_REPLY] : []),
      ...(fixedGemTreasure || firstLand ? [QUEST_GEMS_REPLY] : []),
      ...(fixedGemTreasure || strictTerrain ? [QUEST_TREASURE_REPLY] : []),
      ...(firstLand ? [QUEST_MAP_FLAG_REPLY, QUEST_MAP_CLEAR_COUNT_REPLY] : []),
    ], (reply) => {
      if (invalid) return;
      try {
        switch (reply.command) {
          case QUEST_NEXT_LAND_REPLY:
            if (arrived) throw new SessionError('protocol');
            readQuestNextLandReply(reply, slot);
            arrived = true;
            onArrival?.();
            break;
          case QUEST_ENCOUNTER_REPLY:
            if (peaceful || !arrived || encounter || progress !== null || deleted) throw new SessionError('protocol');
            encounter = readQuestEncounterReply(reply);
            if (firstLand) {
              if (encounter.stage !== firstLand.stage) throw new SessionError('protocol');
              encounter.receivedAt = performance.now();
            }
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
            if (expectBattle || !arrived || encounter || deleted || (update.progress & (1 << slot)) === 0) {
              throw new SessionError('protocol');
            }
            if ((peaceful || firstLand) && (progress !== null || (previousProgress & (1 << slot)) !== 0
                || update.progress !== (previousProgress | (1 << slot)))) {
              throw new SessionError('protocol');
            }
            progress = update.progress;
            if (strictTerrain) terrainReceivedAt = performance.now();
            if (!fixedGemTreasure) resolve(null); // The original callback may still settle this quest.
            break;
          }
          case QUEST_GEMS_REPLY: {
            const { value } = readQuestSettlementValueReply(reply);
            if (progress === null || (strictTerrain && (!fixedGemTreasure || gemBalance !== null))
                || (fixedGemTreasure && !treasure
                && (gemBalance !== null || value < fixedGemTreasure.value))) throw new SessionError('protocol');
            gemBalance = value;
            break;
          }
          case QUEST_MAP_FLAG_REPLY:
          case QUEST_MAP_CLEAR_COUNT_REPLY: {
            if (!terminal || progress === null) throw new SessionError('protocol');
            const { field, value } = readQuestSettlementValueReply(reply);
            map[field] = value;
            break;
          }
          case QUEST_TREASURE_REPLY: {
            // SC25 has no inventory ID and belongs to this one outstanding, matched land entry.
            if (!fixedGemTreasure || gemBalance === null || treasure) throw new SessionError('protocol');
            readMatchingQuestTreasure(reply, fixedGemTreasure);
            treasure = strictTerrain ? fixedGemReceipt(fixedGemTreasure, gemBalance)
              : { treasureId: fixedGemTreasure.treasureId, amount: fixedGemTreasure.value, balance: gemBalance };
            resolve(null);
            break;
          }
          case QUEST_DELETED_REPLY:
            if (readQuestDeletedReply(reply) !== inventoryId) break;
            if (encounter || ((peaceful || firstLand) && arrived && (!terminal || !deckReset))) {
              throw new SessionError('protocol');
            }
            deleted = true;
            if (!arrived) {
              unsubscribe();
              resolve({ rejection: QUEST_MISSING_ERROR, deleted });
            }
            break;
          case QUEST_FINISH_REPLY: {
            const settled = readQuestFinishReply(reply);
            if (settled.inventoryId !== inventoryId) break;
            if (!arrived || encounter || !deleted || finish || (firstLand && (!terminal || settled.result !== 0))
                || (peaceful && !terminal)) throw new SessionError('protocol');
            finish = settled;
            resolve(null);
            break;
          }
          case QUEST_DECK_STATE_REPLY: {
            const update = readQuestDeckStateReply(reply);
            if (update.deckIndex !== deckIndex) break;
            if (!terminal || progress === null || deckReset || deleted || update.status !== QUEST_IN_PROGRESS
                || update.damage.some((damage) => damage !== 0)) throw new SessionError('protocol');
            deckReset = true;
            break;
          }
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
    await finishQuestObservation(socket, signal, peaceful || firstLand ? undefined : unsubscribe);
    if (invalid || (deleted && !finish) || (firstLand && Boolean(finish) !== terminal)) throw new SessionError('protocol');
    return {
      slot, encounter: null, progress, finish,
      ...(emptyTerrain ? { emptyTerrain: true } : {}), ...(treasure ? { fixedGemTreasure: treasure } : {}),
      ...(firstLand ? { gemBalance, map } : {}),
      ...(strictTerrain ? { terrainReceivedAt } : {}),
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
  const { positions, mapId, kind, mapClearTarget, storyNo } = quests[0];
  const ordinaryMap = Number.isInteger(mapId) && mapId >= 1 && mapId <= MAX_QUEST_MAP_ID;
  if (!Array.isArray(positions) || positions.length > QUEST_LAND_SLOTS) return null;
  const nodes = new Map();
  for (const { slot, id, name, caption, stage, nextMask, enemyId, eventNo, emptyTerrain, fixedGemTreasure,
    fixedBattleGemTreasure, fixedCharacterTreasure, ownCardTreasure, bonusGameTreasure, nextSlots } of positions) {
    if (!validQuestSlot(slot) || nodes.has(slot) || !validQuestCardId(id) || typeof name !== 'string'
        || typeof caption !== 'string' || !Array.isArray(nextSlots) || nextSlots.length > 3
        || new Set(nextSlots).size !== nextSlots.length || nextSlots.some((next) => !validQuestSlot(next)
          || Math.floor(next / 3) !== Math.floor(slot / 3) + 1)) return null;
    nodes.set(slot, {
      slot, id, name, caption, enemyId: validQuestCardId(enemyId) ? enemyId : null,
      stage: Number.isInteger(stage) && stage >= 0 && stage <= 127 ? stage : null,
      nextMask: Number.isInteger(nextMask) && nextMask >= 0 && nextMask <= 7 ? nextMask : null,
      emptyTerrain: ordinaryMap && emptyTerrain === true && enemyId === 0,
      fixedGemTreasure: ordinaryMap && emptyTerrain === false && enemyId === 0
        ? verifiedFixedTreasure(fixedGemTreasure, QUEST_GEM_TREASURE_TYPE) : null,
      fixedBattleGemTreasure: ordinaryMap && storyNo === 0 && eventNo === 0 && validQuestCardId(enemyId)
        ? verifiedFixedTreasure(fixedBattleGemTreasure, QUEST_GEM_TREASURE_TYPE) : null,
      fixedCharacterTreasure: ordinaryMap && storyNo === 0 && nextMask === 0 && validQuestCardId(enemyId)
        ? verifiedFixedTreasure(fixedCharacterTreasure, QUEST_CHARACTER_TREASURE_TYPE) : null,
      ownCardTreasure: ordinaryMap && storyNo === 0 && eventNo === 0 && nextMask > 0 && validQuestCardId(enemyId)
        && ownCardTreasure?.slotType === 1 && ownCardTreasure.value === 1
        ? verifiedFixedTreasure(ownCardTreasure, QUEST_OWN_CARD_TREASURE_TYPE) : null,
      bonusGameTreasure: ordinaryMap && storyNo === 0 && eventNo === 0 && validQuestCardId(enemyId)
        && bonusGameTreasure?.slotType === 1 && bonusGameTreasure.value <= 8
        ? verifiedFixedTreasure(bonusGameTreasure, QUEST_BONUS_GAME_TREASURE_TYPE) : null,
      mapId, questKind: kind, mapClearTarget,
      nextSlots,
    });
  }
  if (positions.some(({ nextSlots }) => nextSlots.some((slot) => !nodes.has(slot)))) return null;
  return nodes;
}

function verifiedFixedTreasure(treasure, expectedType) {
  if (!treasure || typeof treasure !== 'object') return null;
  const { treasureId, type, slotType, value } = treasure;
  if (!validQuestCardId(treasureId) || type !== expectedType || !validQuestCardId(value)
      || !Number.isInteger(slotType) || slotType < 0 || slotType > 0x7fffffff) return null;
  return { treasureId, type, slotType, value };
}

function readMatchingQuestTreasure(reply, expected) {
  const { type, slotType, value } = readQuestTreasureReply(reply);
  if (type !== expected.type || slotType !== expected.slotType || value !== expected.value) throw new SessionError('protocol');
}

function fixedGemReceipt(treasure, balance) {
  return { ...treasure, amount: treasure.value, balance, receivedAt: performance.now() };
}

function expectedTreasureMapUpdate(land, map) {
  const { mapId, questKind, mapClearTarget } = land;
  const { questFlag, questClearNum } = map;
  if (!Number.isInteger(questFlag) || !Number.isInteger(questClearNum) || !Number.isInteger(questKind)) return null;
  if (questFlag + 1 !== mapId) return { questFlag: null, questClearNum: null };
  if (questKind === QUEST_BOSS_KIND) {
    if (!Number.isInteger(mapClearTarget) || mapClearTarget < 0) return null;
    if (questClearNum >= mapClearTarget) return { questFlag: mapId, questClearNum: 0 };
  }
  return { questFlag: null, questClearNum: questClearNum + 1 };
}

function sameValues(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function activeSceneAdventure(scene) {
  return scene.adventure && scene.adventure.state !== 'finished';
}

function questSceneAdventureSnapshot(current, operation) {
  if (!current) return null;
  const { inventoryId, questId, deckIndex } = current.selected;
  return Object.freeze({
    inventoryId, questId, deckIndex, state: current.state, slot: current.slot,
    progress: current.run.progress, encounter: current.encounter ?? null, finish: current.finish ?? null,
    emptyTerrain: current.emptyTerrain === true, fixedGemTreasure: current.fixedGemTreasure ?? null,
    ...(current.cardTreasure ? { cardTreasure: current.cardTreasure } : {}),
    ...(current.terrainReceivedAt != null ? { terrainReceivedAt: current.terrainReceivedAt } : {}),
    battle: current.state === 'encounter' ? current.battle.sceneSnapshot(operation) : null,
    ...(current.state === 'between-lands' ? { nextLands: current.nextLands ?? current.battle.outcome.nextLands } : {}),
  });
}

function freezeQuestReceipt(receipt) {
  const { avatar, map, cards, deltas, deckRestored, treasure } = receipt;
  return Object.freeze({
    ...receipt, avatar: Object.freeze(avatar), map: Object.freeze(map),
    cards: Object.freeze(cards.map((card) => Object.freeze({ ...card }))), deltas: Object.freeze(deltas),
    deckRestored: deckRestored && Object.freeze(deckRestored),
    ...(treasure ? { treasure: Object.freeze({ ...treasure,
      ...(treasure.card ? { card: Object.freeze({ ...treasure.card }) } : {}),
    }) } : {}),
  });
}

function freezeQuestEncounter(encounter) {
  const { playerCardIds, opponentCardIds, playerDamage, opponentDamage, duel } = encounter;
  return Object.freeze({
    ...encounter, playerCardIds: Object.freeze(playerCardIds.slice()), opponentCardIds: Object.freeze(opponentCardIds.slice()),
    playerDamage: Object.freeze(playerDamage.slice()), opponentDamage: Object.freeze(opponentDamage.slice()),
    duel: Object.freeze({ ...duel }),
  });
}

function nextBattleLands(positions, slot, progress) {
  const position = positions?.get(slot);
  return (position?.nextSlots ?? [])
    .filter((next) => (progress & (1 << next)) === 0)
    .map((next) => positions.get(next))
    .filter((next) => next.enemyId !== null)
    .map(({ slot, id, name, caption, enemyId }) => ({ slot, id, name, caption, enemyId }));
}

function nextSceneLands(positions, slot, progress, includeGemTerrain = false) {
  const current = positions?.get(slot);
  return Object.freeze((current?.nextSlots ?? []).flatMap((next) => {
    const { id, name, caption, stage, nextMask, enemyId, fixedGemTreasure } = positions.get(next);
    const allowed = current.nextMask & (1 << (2 - next % 3)); // Original column mask is top 4, middle 2, bottom 1.
    if (!allowed || (progress & (1 << next)) !== 0 || stage === null || nextMask === null) return [];
    const land = { slot: next, id, name, caption, enemyId, stage };
    if (enemyId !== null) return [Object.freeze(land)];
    if (!includeGemTerrain || !fixedGemTreasure || !nextSceneLands(positions, next, progress).length) return [];
    return [Object.freeze({ ...land, enemyId: 0, fixedGemTreasure: Object.freeze({ ...fixedGemTreasure }) })];
  }));
}

function observeNonCombatTerrain(socket, { inventoryId, deckIndex }, { progress, fixedGemTreasure, terrainReceivedAt }, onUncertain) {
  const commands = [QUEST_PROGRESS_REPLY, QUEST_DECK_STATE_REPLY, QUEST_DELETED_REPLY, QUEST_FINISH_REPLY,
    QUEST_NEXT_LAND_REPLY, QUEST_ENCOUNTER_REPLY, QUEST_DUEL_START_REPLY, QUEST_DUEL_FINISH_REPLY, QUEST_ERROR_REPLY];
  if (fixedGemTreasure || terrainReceivedAt != null) commands.push(QUEST_GEMS_REPLY, QUEST_TREASURE_REPLY);
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

function sameQuestReward(first, second) {
  return first === second || (first && second && first.genre === second.genre && first.id === second.id && first.amount === second.amount);
}

function observeQuestBattleReward(socket, { canPlay, knowsCard, applyClaim, publish, itemInventory, mapFlag, duel }) {
  let phase = 'loading';
  let round = 0;
  let rank = null;
  let choices = Object.freeze([]);
  let baseDice = null;
  let rolledDice = null;
  let decision = null;
  let itemUse = null;
  let itemBaseDiceReceived = false;
  let claim = null;
  let append;
  let nextRank;
  let award;
  let avatar;
  let cards;
  let pending;
  let pendingItem;
  let expected = QUEST_REWARD_CANDIDATES_REPLY;
  const preludeDeadline = setTimeout(fail, TIMEOUT);

  function fail() {
    if (phase === 'uncertain') return;
    clearTimeout(preludeDeadline);
    phase = 'uncertain';
    expected = null;
    if (pendingItem?.dispatched && !pendingItem.consumed) itemInventory.block(pendingItem.item.inventoryId);
    pending?.reject(new SessionError('quest-reward-uncertain'));
    publish();
  }

  function verifyDecision(data) {
    if (data.bonus !== nextRank || (data.won && (!sameQuestReward(data.current, choices[1])
        || !sameQuestReward(data.next, append)))) throw new SessionError('protocol');
  }

  function acceptDecision(data) {
    if (data.won) choices = Object.freeze([data.current, ...choices.slice(2), data.next]);
    decision = data;
    rank = data.bonus;
    phase = 'offer';
  }

  function receiveItem(reply) {
    const { item } = pendingItem;
    if (reply.command === QUEST_ERROR_REPLY) {
      const code = readQuestErrorReply(reply);
      if (code !== QUEST_ITEM_MISSING || expected !== QUEST_ITEM_CONSUMED_REPLY) throw new SessionError('protocol');
      itemInventory.block(item.inventoryId);
      phase = 'offer';
      expected = null;
      pending.reject(new SessionError('quest-reward-item-rejected', code));
      return;
    }
    if (pendingItem.insufficient) throw new SessionError('protocol');
    if (reply.command !== expected) throw new SessionError('protocol');
    if (reply.command === QUEST_ITEM_CONSUMED_REPLY) {
      const { inventoryId } = readQuestItemReply(reply);
      if (inventoryId !== item.inventoryId) throw new SessionError('protocol');
      itemInventory.consume(inventoryId);
      pendingItem.consumed = true;
      itemUse = Object.freeze({ inventoryId, itemId: item.itemId, kind: item.kind });
      itemBaseDiceReceived = false;
      expected = QUEST_REWARD_BASE_DICE_REPLY;
      return;
    }
    if (reply.command === QUEST_REWARD_BASE_DICE_REPLY) {
      const dice = readQuestRewardReply(reply);
      if (!sameValues(dice, rolledDice)) throw new SessionError('protocol');
      pendingItem.dice = dice;
      itemBaseDiceReceived = true;
      if (item.kind === 'amend') {
        expected = QUEST_REWARD_DECISION_REPLY;
        return;
      }
    } else {
      const amended = readQuestRewardReply(reply);
      verifyDecision(amended);
      if (!amended.won) throw new SessionError('protocol');
      pendingItem.decision = amended;
    }
    // The acknowledged physical use does not prove the effect on the reward phase.
    baseDice = pendingItem.dice;
    if (item.kind === 'reroll') {
      round += 1;
      rolledDice = decision = null;
      phase = 'guess';
    } else acceptDecision(pendingItem.decision);
    expected = null;
    pending.resolve();
  }

  function received(reply) {
    const rewardReply = QUEST_REWARD_REPLIES.includes(reply.command);
    const claimUpdate = phase === 'claiming' && QUEST_REWARD_AVATAR_REPLIES.includes(reply.command);
    const itemReply = phase === 'using-item' && (rewardReply || reply.command === QUEST_ERROR_REPLY);
    if (!rewardReply && !claimUpdate && !itemReply) return false;
    if (phase === 'uncertain' || phase === 'claimed') return true;
    try {
      if (itemReply) {
        receiveItem(reply);
        publish();
        return true;
      }
      if (claimUpdate) {
        if (award || decision?.won === false) throw new SessionError('protocol');
        if (reply.command === QUEST_CHARACTER_AWARD_REPLY) {
          const card = readQuestCharacterAwardReply(reply);
          if (knowsCard(card.inventoryId) || cards.has(card.inventoryId) || cards.size >= MAX_QUEST_ROWS) {
            throw new SessionError('protocol');
          }
          cards.set(card.inventoryId, card);
        } else {
          const { field, value } = readQuestSettlementValueReply(reply);
          avatar[field] = value;
        }
        return true;
      }
      if (reply.command !== expected) throw new SessionError('protocol');
      const data = readQuestRewardReply(reply);
      switch (reply.command) {
        case QUEST_REWARD_CANDIDATES_REPLY:
          if (phase === 'loading') {
            if (!data.choices.every(Boolean)) throw new SessionError('protocol');
            choices = Object.freeze(data.choices);
            rank = data.rank;
          } else {
            if (!data.choices[0] || data.choices.slice(1).some(Boolean) || data.rank < rank) throw new SessionError('protocol');
            append = data.choices[0];
            nextRank = data.rank;
          }
          expected = QUEST_REWARD_BASE_DICE_REPLY;
          break;
        case QUEST_REWARD_BASE_DICE_REPLY:
          if (phase === 'loading') {
            clearTimeout(preludeDeadline);
            phase = 'offer';
          } else {
            if (!sameValues(data, rolledDice ?? baseDice)) throw new SessionError('protocol');
            round += 1;
            phase = 'guess';
            rolledDice = decision = null;
          }
          baseDice = data;
          expected = null;
          break;
        case QUEST_REWARD_ROLLED_DICE_REPLY:
          rolledDice = data;
          expected = QUEST_REWARD_DECISION_REPLY;
          break;
        case QUEST_REWARD_DECISION_REPLY:
          verifyDecision(data);
          acceptDecision(data);
          expected = null;
          break;
        case QUEST_REWARD_AWARD_REPLY: {
          const offered = decision?.won === false ? null : choices[0];
          if (!sameQuestReward(data.reward, offered)
              || data.inventoryIds.some((id) => knowsCard(id) || cards.has(id))
              || (offered?.genre === 0 && avatar.exp === null)
              || (offered?.genre === 1 && avatar.gems === null)) throw new SessionError('protocol');
          award = data;
          expected = QUEST_REWARD_FINAL_REPLY;
          break;
        }
        case QUEST_REWARD_FINAL_REPLY:
          if (!sameQuestReward(data.reward, award.reward)) throw new SessionError('protocol');
          // Original Reward#cancel after a lost guess leaves the duel's base payout untouched.
          if (decision?.won === false && (data.totalGems !== duel.totalGems || data.totalExp !== duel.totalExp
              || data.addPoint !== 0)) throw new SessionError('protocol');
          applyClaim({ avatar, cards: [...cards.values(), ...award.inventoryIds.map((inventoryId) => ({ inventoryId, cardId: award.reward.id }))] });
          claim = Object.freeze({ ...data, inventoryIds: award.inventoryIds });
          phase = 'claimed';
          expected = null;
          break;
      }
      if (expected === null) pending?.resolve();
      publish();
    } catch {
      fail();
    }
    return true;
  }

  function snapshot() {
    const allowed = !pending && canPlay();
    const failed = phase === 'offer' && decision?.won === false;
    const items = Object.freeze(itemInventory.available().map(({ inventoryId, itemId, blocked }) => {
      const maximumDifference = QUEST_REWARD_ITEMS.get(itemId);
      return Object.freeze({ inventoryId, itemId, kind: maximumDifference === null ? 'reroll' : 'amend', maximumDifference,
        usable: !blocked && allowed && failed });
    }));
    return Object.freeze({ phase, round, rank, choices, baseDice, rolledDice, decision, claim, items, itemUse, itemBaseDiceReceived,
      canUseItem: items.some((item) => item.usable),
      canNext: allowed && phase === 'offer' && decision?.won !== false,
      canTake: allowed && phase === 'offer', canGuess: allowed && phase === 'guess' });
  }

  async function request(action, signal, { inventoryId, mapIndex } = {}) {
    if (signal.aborted) throw new SessionError('cancelled');
    if (phase === 'uncertain') throw new SessionError('quest-reward-uncertain');
    if (pending) throw new SessionError('busy');
    const gate = snapshot();
    const next = action === 'next';
    const take = action === 'take';
    const usesItem = action === 'item';
    const item = usesItem && gate.items.find((owned) => owned.inventoryId === inventoryId && owned.usable);
    if (usesItem && (!item || !Number.isInteger(mapFlag) || mapFlag < 0
        || !ORDINARY_QUEST_PAGE_LAST_INDEX.some((last) => Math.min(mapFlag, last) === mapIndex))) {
      throw new SessionError('quest-reward-item-unavailable');
    }
    if (!usesItem && !(next ? gate.canNext : take ? gate.canTake : gate.canGuess && (action === 'high' || action === 'low'))) {
      throw new SessionError('quest-reward-unavailable');
    }
    const previous = phase;
    const response = new Promise((resolve, reject) => { pending = { resolve, reject }; });
    const result = bounded(response, signal);
    let sent = false;
    let refusalFence;
    let fenceController;
    try {
      if (usesItem) {
        phase = 'using-item';
        expected = QUEST_ITEM_CONSUMED_REPLY;
        const difference = Math.abs(baseDice[0] + baseDice[1] - rolledDice[0] - rolledDice[1]);
        pendingItem = { item, insufficient: item.maximumDifference !== null && difference > item.maximumDifference };
        socket.send(QUEST_ITEM_USE_REQUEST, [item.inventoryId, mapIndex]);
        pendingItem.dispatched = true;
        if (pendingItem.insufficient) {
          // Above the authored threshold Ruby restores the item and sends no outcome packet.
          fenceController = new AbortController();
          refusalFence = finishQuestObservation(socket, AbortSignal.any([signal, fenceController.signal])).then(() => {
            if (phase !== 'using-item') return;
            phase = 'offer';
            expected = null;
            pending.reject(new SessionError('quest-reward-item-insufficient'));
          }).catch((error) => pending.reject(error));
        }
      } else if (next) {
        phase = 'opening';
        expected = QUEST_REWARD_CANDIDATES_REPLY;
        socket.send(QUEST_REWARD_NEXT_REQUEST, []);
      } else if (take) {
        phase = 'claiming';
        expected = QUEST_REWARD_AWARD_REPLY;
        avatar = { exp: null, gems: null, level: null, energy: null };
        cards = new Map();
        socket.send(QUEST_REWARD_TAKE_REQUEST, []);
      } else {
        phase = 'rolling';
        expected = QUEST_REWARD_ROLLED_DICE_REPLY;
        socket.send(action === 'high' ? QUEST_REWARD_HIGH_REQUEST : QUEST_REWARD_LOW_REQUEST, []);
      }
      sent = true;
      publish();
      await result;
      signal.throwIfAborted();
      if (phase === 'uncertain') throw new SessionError('quest-reward-uncertain');
      socket.assertOpen();
    } catch (error) {
      if (sent) {
        if (error.kind === 'quest-reward-item-rejected' || error.kind === 'quest-reward-item-insufficient') throw error;
        fail();
        throw new SessionError('quest-reward-uncertain');
      }
      phase = previous;
      expected = null;
      pending.reject(error);
      await result.catch(() => {});
      throw error;
    } finally {
      if (fenceController) {
        fenceController.abort();
        await refusalFence;
      }
      pending = null;
      pendingItem = null;
      publish();
    }
  }

  return { received, snapshot, request, stop: () => clearTimeout(preludeDeadline),
    invalidate() { if (phase !== 'claimed' && phase !== 'uncertain') fail(); } };
}

function observeQuestBattle(socket, { inventoryId, questId, deckIndex }, slot, encounter, run, applySettlement, onStateChange, continuation) {
  const land = continuation && run.positions?.get(slot);
  const ownCardTreasure = land?.ownCardTreasure && { ...land.ownCardTreasure, value: continuation.ownCardLevel1Id };
  const characterTreasure = land?.fixedCharacterTreasure ?? ownCardTreasure;
  const fixedBattleGemTreasure = land?.fixedBattleGemTreasure;
  const bonusGameTreasure = land?.bonusGameTreasure;
  const fixedTreasure = characterTreasure ?? fixedBattleGemTreasure;
  const treasureMap = (fixedTreasure || bonusGameTreasure) && land.nextMask === 0
    ? expectedTreasureMapUpdate(land, continuation.mapBefore) : null;
  let treasureStage = 'progress';
  let treasureCard;
  let duelGemBalance = null;
  let treasureBalance;
  let treasure;
  let phase = 'encounter';
  let turn = null;
  let startDistance = null;
  let direction = null;
  let ready = null;
  let result = null;
  let hand = null;
  let moveTable = null;
  let exchange = null;
  let sceneCombat = null;
  let exchangeHistory = Object.freeze([]);
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
  let outcomeDuel = null;
  let outcomeState = null;
  let outcomeReceipt = null;
  let reward = null;
  let outcomeDeadline;
  let landFence;
  let outcomeNextLands = Object.freeze([]);
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
  let opponentHeldCount = null;
  let opponentMoveCount = null;
  let movePoints = null;
  let moveSubmitted = false;
  let moveHealing = null;
  let moveStartedAt = null;
  let moveDeadline;
  let settlementTimer;
  let publishedPhase = phase;
  let publishedTurn = turn;
  let publishedOpponentHeldCount = opponentHeldCount;
  let publishedOpponentMoveCount = opponentMoveCount;
  let publishedCombatPhase = null;

  function publishBattlePhase(combatChanged = false) {
    const combatPhase = sceneCombat?.exchange.phase ?? null;
    if (!onStateChange || (!combatChanged && phase === publishedPhase && turn === publishedTurn
        && opponentHeldCount === publishedOpponentHeldCount && opponentMoveCount === publishedOpponentMoveCount
        && combatPhase === publishedCombatPhase)) return;
    publishedPhase = phase;
    publishedTurn = turn;
    publishedOpponentHeldCount = opponentHeldCount;
    publishedOpponentMoveCount = opponentMoveCount;
    publishedCombatPhase = combatPhase;
    onStateChange();
  }

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
    publishBattlePhase(true);
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
      onStateChange?.();
    } finally {
      for (const id of ids) loadingEventCards.delete(id);
    }
  }

  function uncertain() {
    if (phase === 'closed') return;
    clearTimeout(settlementTimer);
    opponentHeldCount = null;
    opponentMoveCount = null;
    if (phase === 'moved' && exchange && exchange.phase !== 'complete' && exchange.phase !== 'terminal') {
      exchange.phase = 'uncertain';
    } else phase = 'uncertain';
    pending?.reject(new SessionError('quest-battle-uncertain'));
    publishBattlePhase();
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
        moveStartedAt = performance.now();
        ready = readyParts;
        if (onStateChange) {
          if (ready.turn === 1) opponentHeldCount = 0;
          if (opponentHeldCount !== null) opponentHeldCount += ready.action.opponentDrawCount + ready.event.opponentDrawCount;
          opponentMoveCount = 0;
        }
        movePoints = null;
        moveSubmitted = false;
        moveHealing = null;
        // Original SC44 then SC45 append to the same hand, after any survivors.
        hand ??= [];
        hand.push(...ready.action.cards, ...ready.event.cards.map((card) => ({ ...card, event: true })));
        void loadEventCards(ready.event.cards).catch(() => {});
        moveTable = [];
        startDistance = result?.distance ?? startDistance;
        result = null;
        direction = null;
        exchange = null;
        sceneCombat = null;
        clearTimeout(settlementTimer);
        moveDeadline = moveStartedAt + QUEST_MOVE_WAIT + TIMEOUT;
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
    // Flash uses the default wire index for defense add, while the hand still moves by physical ID.
    const wireIndex = command === QUEST_DEFENCE_CARD_ADD_REQUEST && sceneCombat?.exchange === exchange ? 0 : index;
    const fields = [id, signedByte(wireIndex)];
    const face = adding ? up ?? source[index].up : source[index].up;
    if (adding) fields.push(signedByte(face ? 1 : 0));
    const reply = combat
      ? (adding ? QUEST_BATTLE_CARD_ADD_REPLY : QUEST_BATTLE_CARD_REMOVE_REPLY)
      : (adding ? QUEST_MOVE_CARD_ADD_REPLY : QUEST_MOVE_CARD_REMOVE_REPLY);
    const card = { id, up: face };
    if (source[index].event) card.event = true;
    // Original attack/defense handlers omit the passed index when calling the model.
    const stage = combat ? exchange.phase : phase;
    return { fields, reply, source, destination, index, echoIndex: combat ? 0 : index, card, stage };
  }

  function receiveMoveCard(reply) {
    if (opponentMoveCount === null || (phase !== 'move' && phase !== 'committing')) return receiveCard(reply);
    const update = readQuestMoveCardReply(reply);
    if (update.player) return receiveCard(reply, update);
    if (update.index < 0) return; // Original failed transfer sentinel.
    const adding = reply.command === QUEST_MOVE_CARD_ADD_REPLY;
    const sourceCount = adding ? opponentHeldCount : opponentMoveCount;
    if (sourceCount !== null && update.index >= sourceCount) throw new SessionError('protocol');
    opponentMoveCount += adding ? 1 : -1;
    if (opponentHeldCount !== null) opponentHeldCount += adding ? -1 : 1;
  }

  function receiveBattleCard(reply) {
    if (sceneCombat?.exchange !== exchange) return receiveCard(reply);
    const update = readQuestBattleCardReply(reply);
    if (update.player) return receiveCard(reply, update);
    const enemyDropping = exchange.playerAttacks === false && nextCombatReply === QUEST_ATTACK_PHASE_FINISH_REPLY
      || exchange.playerAttacks === true && nextCombatReply === QUEST_DEFENCE_PHASE_FINISH_REPLY;
    if (!enemyDropping || sceneCombat.opponentTableCount === null || update.index < 0) return;
    const next = sceneCombat.opponentTableCount + (reply.command === QUEST_BATTLE_CARD_ADD_REPLY ? 1 : -1);
    if (next < 0 || next > 0xff) throw new SessionError('protocol');
    if (opponentHeldCount !== null) {
      const held = opponentHeldCount + sceneCombat.opponentTableCount - next;
      opponentHeldCount = held < 0 ? null : held;
    }
    sceneCombat.opponentTableCount = next;
    publishBattlePhase(true);
  }

  function receiveCard(reply, decodedUpdate) {
    const expected = pending?.cardTransfer;
    const stage = exchange?.phase ?? phase;
    if (expected?.reply !== reply.command || pending.answered || expected.stage !== stage
        || pending.turn !== turn || (pending.exchange && pending.exchange !== exchange)) return;
    const update = decodedUpdate ?? (stage === 'move' ? readQuestMoveCardReply(reply) : readQuestBattleCardReply(reply));
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

  function prepareRotation(id, table, tableZone) {
    const inHand = hand.findIndex((card) => card.id === id);
    const onTable = table.findIndex((card) => card.id === id);
    const source = inHand >= 0 ? hand : table;
    const index = inHand >= 0 ? inHand : onTable;
    if (index < 0 || index > 127 || (inHand >= 0 && onTable >= 0)
        || source.some((card, at) => card.id === id && at !== index)
        || (source[index].event && stockEventCards.get(id) !== true)) {
      throw new SessionError('quest-card-unavailable');
    }
    const zone = inHand >= 0 ? QUEST_HAND_ZONE : tableZone;
    const up = !source[index].up;
    return { id, zone, index, up, source, fields: [id, signedByte(zone), signedByte(index), signedByte(up ? 1 : 0)] };
  }

  function receiveRotation(reply) {
    const player = reply.byte();
    const zone = reply.byte();
    const index = reply.byte();
    const id = reply.int();
    const face = reply.byte();
    reply.done();
    if ((player !== 0 && player !== 1) || zone < 0 || zone > 2 || index < 0
        || (player ? id <= 0 : id !== 0) || (face !== 0 && face !== 1)) throw new SessionError('protocol');
    const expected = pending?.rotation;
    if (!player || !expected || pending.answered || pending.turn !== turn
        || (pending.exchange && pending.exchange !== exchange) || zone !== expected.zone || index !== expected.index
        || id !== expected.id || Boolean(face) !== expected.up) return;
    const card = { ...expected.source[index], up: expected.up };
    expected.source[index] = card;
    pending.answered = true;
    pending.resolve(card);
  }

  function receiveMovePoints(reply) {
    const player = reply.byte();
    reply.discardString(8192, true); // Active table IDs are unnecessary for the visible point total.
    reply.uint();
    const points = reply.int();
    reply.done();
    if (player !== 0 && player !== 1) throw new SessionError('protocol');
    if (player && points !== movePoints) {
      movePoints = points;
      onStateChange();
    }
  }

  function receiveCombatPoints(reply) {
    // SC82 may precede a transfer ACK. Keep its points independently from the owned table.
    const player = reply.byte();
    if (player !== 0 && player !== 1) throw new SessionError('protocol');
    let activeCards = null;
    let list = '';
    if (player) list = reply.string(4096, true);
    else reply.discardString(4096, true);
    const mask = reply.uint();
    const value = reply.int();
    reply.done();
    if (player && (!list || /^[1-9]\d*(?:,[1-9]\d*)*$/.test(list))) {
      const ids = list ? list.split(',').map(Number) : [];
      // The source may report a previous table's mask alongside a valid current total.
      if (ids.length <= 32 && ids.every(validQuestCardId) && new Set(ids).size === ids.length
          && (ids.length === 32 || (mask >>> ids.length) === 0)) activeCards = { ids, mask };
    }
    if (exchange.dice) {
      // Ruby emits opponent then player SC82 immediately before the next SC51.
      if (!player) sceneCombat.nextAttackPoints = { opponent: value };
      else if (sceneCombat.nextAttackPoints) sceneCombat.nextAttackPoints.player = { value, activeCards };
      return;
    }
    sceneCombat.points[player ? 'player' : 'opponent'] = value;
    if (player) sceneCombat.playerPointCards = activeCards;
    publishBattlePhase(true);
  }

  function isOwnSubmission(reply) {
    try {
      const player = reply.byte();
      reply.done();
      return player === 1;
    } catch {
      return false;
    }
  }

  function receiveMoveSubmission(reply) {
    if (moveSubmitted || pending?.kind !== 'commit' || (phase !== 'committing' && phase !== 'settling')
        || !isOwnSubmission(reply)) return;
    moveSubmitted = true;
    onStateChange();
  }

  function receiveCombatSubmission(reply) {
    if (sceneCombat?.exchange !== exchange || sceneCombat.submitted || pending?.kind !== 'battle-commit'
        || pending.exchange !== exchange || exchange.phase !== 'committing') return;
    const expected = exchange.playerAttacks ? QUEST_ATTACK_SUBMITTED_REPLY : QUEST_DEFENCE_SUBMITTED_REPLY;
    if (reply.command !== expected || !isOwnSubmission(reply)) return;
    sceneCombat.submitted = true;
    publishBattlePhase(true);
  }

  function waitForCombat(command, timeout = TIMEOUT) {
    clearTimeout(settlementTimer);
    nextCombatReply = command;
    combatDeadline = performance.now() + timeout;
    settlementTimer = setTimeout(uncertain, timeout);
  }

  function finishCombat(stage, boundary = stage === 'terminal' ? 'terminal' : 'next-attack') {
    clearTimeout(settlementTimer);
    if (!closeCombatDrop() && stage !== 'terminal') return false;
    exchange.phase = stage;
    exchange.battleTable = [];
    if (sceneCombat?.exchange === exchange) {
      sceneCombat.boundary = boundary;
      sceneCombat.opponentTableCount = null;
      const completed = sceneExchangeSnapshot();
      exchangeHistory = Object.freeze([...exchangeHistory.filter(({ key }) => key !== completed.key), completed].slice(-2));
    }
    if (stage === 'complete') previousExchange = structuredClone(exchange);
    if (pending?.kind === 'battle-commit' && pending.exchange === exchange) pending.resolve(exchange);
    return true;
  }

  function closeCombatDrop() {
    if ((pending?.kind === 'battle-card' || pending?.kind === 'battle-rotate')
        && pending.exchange === exchange && !pending.answered) uncertain();
    return exchange.phase !== 'uncertain';
  }

  function consumePlayedCards(cards) {
    const playedIds = new Set(cards.map((card) => card.id));
    hand = hand.filter((card) => !playedIds.has(card.id));
  }

  function openExchange(index, openingPoints) {
    exchange = {
      turn, index, phase: 'awaiting-attack', playerAttacks: null, battleTable: [], attackCards: null, defenceCards: null,
      cards: null, dice: null, damage: [], hitPoints: { player: null, opponent: null }, duelFinish, questFinish,
    };
    if (onStateChange) {
      sceneCombat = {
        exchange, opponentTableCount: null, opponentSelectedCount: null, attackStartedAt: null, defenceStartedAt: null,
        points: { player: openingPoints?.player?.value ?? null, opponent: openingPoints?.opponent ?? null },
        playerPointCards: openingPoints?.player?.activeCards ?? null, nextAttackPoints: null, boundary: null, submitted: false,
      };
    }
  }

  function openAttack(playerAttacks) {
    confirmActiveCharacters();
    exchange.playerAttacks = playerAttacks;
    exchange.phase = playerAttacks ? 'attack' : 'awaiting-defense';
    if (sceneCombat?.exchange === exchange) {
      sceneCombat.attackStartedAt = performance.now();
      if (!playerAttacks) sceneCombat.opponentTableCount = 0;
    }
    waitForCombat(QUEST_ATTACK_PHASE_FINISH_REPLY, QUEST_COMBAT_WAIT + TIMEOUT);
  }

  function revealOpponentSelection(reveal) {
    if (sceneCombat?.exchange !== exchange) return;
    if (sceneCombat.opponentTableCount !== null) {
      sceneCombat.opponentSelectedCount = sceneCombat.opponentTableCount;
      if (sceneCombat.opponentSelectedCount !== reveal.opponentCards.length) opponentHeldCount = null;
    }
    sceneCombat.opponentTableCount = null;
  }

  function beginNextTurn() {
    if (exchange.phase !== 'complete' && !finishCombat('complete', 'next-turn')) return;
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
      if (phase !== 'moved' || !finishCombat('complete', 'character-change')) throw new SessionError('protocol');
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

  function outcomeSnapshot() {
    if (!outcomeState) return null;
    const canReturn = !duelFinish?.bonus || reward?.snapshot().phase === 'claimed';
    return Object.freeze({
      inventoryId, questId, state: outcomeState, duel: outcomeDuel,
      quest: questFinish && Object.freeze({ ...questFinish }), receipt: outcomeReceipt,
      canReturn: Boolean(canReturn && (outcomeState === 'settled' || (outcomeState === 'land-cleared' && outcomeNextLands.length > 0))),
      nextLands: outcomeNextLands,
    });
  }

  function failQuestOutcome() {
    clearTimeout(outcomeDeadline);
    outcomeState = 'uncertain';
    outcomeNextLands = Object.freeze([]);
    reward?.invalidate();
    if (!duelFinish) uncertain();
    publishBattlePhase(true);
  }

  function markDuelFinished() {
    if (exchange) {
      exchange.duelFinish = duelFinish;
      finishCombat('terminal');
    } else if (onStateChange) {
      clearTimeout(settlementTimer);
      phase = 'terminal';
      pending?.reject(new SessionError('quest-battle-unavailable'));
    } else uncertain();
  }

  function hasNextLand() {
    return continuation && run.positions?.get(slot)?.nextMask > 0;
  }

  function expectsLandContinuation() {
    return hasNextLand() && duelFinish?.result === 0 && (!duelFinish.bonus || bonusGameTreasure);
  }

  function expectsFixedTreasure() {
    return fixedTreasure && duelFinish?.result === 0 && !duelFinish.bonus;
  }

  function expectsBonusTreasure() {
    return bonusGameTreasure && duelFinish?.result === 0 && duelFinish.bonus;
  }

  function confirmLandProgress() {
    if (landFence) return;
    const signal = catalogRequests.signal;
    landFence = Promise.resolve().then(async () => {
      if (signal.aborted || outcomeState !== 'awaiting-settlement' || questDeleted || questFinish) return;
      await continuation.fence(signal);
      if (signal.aborted || outcomeState !== 'awaiting-settlement' || questDeleted || questFinish) return;
      if (settlementMap.questFlag !== null || settlementMap.questClearNum !== null) return;
      const damage = Object.freeze(arrivedDamage.slice());
      const receipt = continuation.reconcile({
        kind: 'land-progress', inventoryId, questId, deckIndex, damage,
        avatar: { ...settlementAvatar }, map: { ...settlementMap, progress }, cards: [...awards.values()],
        ...(treasure ? { treasure } : {}),
      });
      run.progress = progress;
      run.damage = damage;
      clearTimeout(outcomeDeadline);
      outcomeReceipt = freezeQuestReceipt(receipt);
      outcomeNextLands = nextSceneLands(run.positions, slot, progress, Boolean(fixedBattleGemTreasure || bonusGameTreasure));
      outcomeState = 'land-cleared';
      publishBattlePhase(true);
    }).catch(() => { if (!signal.aborted) failQuestOutcome(); });
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
    if (settlement || outcomeState === 'uncertain') return;
    if (reply.command === QUEST_DUEL_FINISH_REPLY) {
      if (duelFinish && (hasNextLand() || fixedTreasure || bonusGameTreasure)) {
        const duplicate = readQuestDuelFinishReply(reply, { awards: true });
        if (Object.entries(duplicate).some(([field, value]) => outcomeDuel[field] !== value)) failQuestOutcome();
      }
      if (!duelFinish) {
        if (onStateChange) {
          outcomeDuel = Object.freeze(readQuestDuelFinishReply(reply, { awards: true }));
          const { result, bonus } = outcomeDuel;
          duelFinish = { result, bonus };
          outcomeState = bonus && !bonusGameTreasure ? 'bonus-pending' : 'awaiting-settlement';
          outcomeDeadline = setTimeout(failQuestOutcome, TIMEOUT);
          if (bonus && bonusGameTreasure) {
            reward = observeQuestBattleReward(socket, {
              canPlay: () => outcomeState === 'land-cleared' || outcomeState === 'settled',
              knowsCard: continuation.knowsCard,
              applyClaim: continuation.claimReward,
              itemInventory: continuation.itemInventory,
              mapFlag: continuation.mapBefore.questFlag,
              duel: outcomeDuel,
              publish: () => publishBattlePhase(true),
            });
          }
        } else duelFinish = readQuestDuelFinishReply(reply);
        markDuelFinished();
        if (bonusGameTreasure && !duelFinish.bonus) failQuestOutcome();
      }
      return;
    }

    switch (reply.command) {
      case QUEST_DELETED_REPLY:
        if (readQuestDeletedReply(reply) === inventoryId) {
          if (onStateChange && (!duelFinish || outcomeState === 'land-cleared')) return failQuestOutcome();
          if (expectsBonusTreasure() && hasNextLand()) return failQuestOutcome();
          if (expectsFixedTreasure() || expectsBonusTreasure()) {
            if (treasureStage !== 'delete') return failQuestOutcome();
            treasureStage = 'finish';
          }
          questDeleted = true;
        }
        break;
      case QUEST_FINISH_REPLY: {
        const finish = readQuestFinishReply(reply);
        // Original battle settlement sends win or loss; draw is a quest loss.
        if (finish.inventoryId !== inventoryId) return;
        if (onStateChange && (!duelFinish || !questDeleted || finish.result !== (duelFinish.result === 0 ? 0 : 1))) {
          return failQuestOutcome();
        }
        if ((expectsFixedTreasure() || expectsBonusTreasure()) && treasureStage !== 'finish') return failQuestOutcome();
        if (finish.result !== 0 && finish.result !== 1) return;
        questFinish ??= finish;
        if (exchange) {
          exchange.questFinish = questFinish;
          finishCombat('terminal');
        } else if (!onStateChange) uncertain();
        break;
      }
      case QUEST_PROGRESS_REPLY: {
        const update = readQuestProgressReply(reply);
        if (update.inventoryId !== inventoryId) break;
        const expected = duelFinish?.result === 0 && (previousProgress & (1 << slot)) === 0
          && update.progress === (previousProgress | (1 << slot));
        if (hasNextLand() && (!duelFinish || (expectsLandContinuation() && !expected))) {
          return failQuestOutcome();
        }
        if ((fixedTreasure || bonusGameTreasure) && !duelFinish) return failQuestOutcome();
        if (expectsBonusTreasure()) {
          if (!expected || treasureStage !== 'progress') return failQuestOutcome();
          treasureStage = 'treasure';
        }
        if (expectsFixedTreasure()) {
          if (!expected || treasureStage !== 'progress') return failQuestOutcome();
          treasureStage = fixedBattleGemTreasure ? 'gem-balance' : 'award';
        }
        if (expected) {
          progress ??= update.progress;
          if (!expectsLandContinuation() && !fixedBattleGemTreasure) run.progress = progress;
        }
        break;
      }
      case QUEST_DECK_STATE_REPLY: {
        const update = readQuestDeckStateReply(reply);
        if (update.deckIndex !== deckIndex) break;
        if ((hasNextLand() || fixedTreasure || bonusGameTreasure) && !duelFinish) return failQuestOutcome();
        if (expectsFixedTreasure() || expectsBonusTreasure()) {
          if (update.status !== QUEST_IN_PROGRESS || update.damage.some((damage) => damage < 0)) return failQuestOutcome();
          if (treasureStage === 'damage') treasureStage = hasNextLand() ? 'confirmed' : 'reset';
          else if (treasureStage === 'reset' && treasureMap && update.damage.every((damage) => damage === 0)) {
            treasureStage = treasureMap.questClearNum === null ? 'delete' : 'clear-count';
          } else return failQuestOutcome();
        }
        if (expectsLandContinuation() && !questDeleted && !questFinish) {
          if (progress === null || update.status !== QUEST_IN_PROGRESS || update.damage.some((damage) => damage < 0)
              || (arrivedDamage && !sameValues(arrivedDamage, update.damage))) return failQuestOutcome();
          arrivedDamage ??= update.damage;
          confirmLandProgress();
          break;
        }
        // This packet has no inventory ID; correlate only after this land's own progress.
        if (progress !== null && !questDeleted && update.status === QUEST_IN_PROGRESS) {
          arrivedDamage ??= update.damage;
          run.damage = arrivedDamage;
          queueMicrotask(() => { if (routeReceiptReady()) loadRoute(); });
        }
        break;
      }
      case QUEST_CHARACTER_AWARD_REPLY: {
        const card = readQuestCharacterAwardReply(reply);
        if (characterTreasure && expectsFixedTreasure()) {
          if (awards.has(card.inventoryId) || continuation.knowsCard(card.inventoryId) || awards.size >= MAX_QUEST_ROWS) {
            return failQuestOutcome();
          }
          if (ownCardTreasure && !['progress', 'award'].includes(treasureStage)) return failQuestOutcome();
          if (card.cardId === characterTreasure.value) {
            if (treasureStage === 'award') {
              treasureCard = card;
              treasureStage = 'treasure';
            } else if (treasureStage === 'treasure' || (!ownCardTreasure && treasureStage === 'progress')) {
              return failQuestOutcome();
            }
          }
        }
        if (awards.size < MAX_QUEST_ROWS && !awards.has(card.inventoryId)) awards.set(card.inventoryId, card);
        break;
      }
      case QUEST_TREASURE_REPLY: {
        if (expectsBonusTreasure()) {
          if (treasureStage !== 'treasure') return failQuestOutcome();
          readMatchingQuestTreasure(reply, bonusGameTreasure);
          treasureStage = 'damage'; // The original result scene owns this reward, not a separate map chest.
          break;
        }
        if (!expectsFixedTreasure() || treasureStage !== 'treasure') return failQuestOutcome();
        readMatchingQuestTreasure(reply, fixedTreasure);
        treasure = fixedBattleGemTreasure ? fixedGemReceipt(fixedBattleGemTreasure, treasureBalance)
          : { ...characterTreasure, card: treasureCard, ...(ownCardTreasure ? { receivedAt: performance.now() } : {}) };
        treasureStage = 'damage';
        break;
      }
      case QUEST_GEMS_REPLY: {
        const { value } = readQuestSettlementValueReply(reply);
        if (fixedBattleGemTreasure && expectsFixedTreasure()) {
          // The duel's own absolute balance precedes SC19. Only the later SC10 belongs to the chest.
          if (treasureStage === 'progress') duelGemBalance = value;
          else if (treasureStage === 'gem-balance') {
            if (duelGemBalance === null || value !== duelGemBalance + fixedBattleGemTreasure.value) return failQuestOutcome();
            treasureBalance = value;
            treasureStage = 'treasure';
          } else if (treasureStage !== 'delete' || value <= settlementAvatar.gems) {
            // Terminal achievements may credit further absolute totals after the map updates and before deletion.
            return failQuestOutcome();
          }
        } else if (ownCardTreasure && expectsFixedTreasure() && treasureStage !== 'progress') {
          // Own Card may grant achievement Gems while the source creates the physical card.
          if (treasureStage !== 'award' || (settlementAvatar.gems !== null && value <= settlementAvatar.gems)) {
            return failQuestOutcome();
          }
        }
        settlementAvatar.gems = value;
        break;
      }
      case QUEST_ENERGY_REPLY:
        settlementAvatar.energy = readQuestEnergyReply(reply).energy;
        break;
      default: {
        const { field, value } = readQuestSettlementValueReply(reply);
        if ((expectsFixedTreasure() || expectsBonusTreasure()) && Object.hasOwn(settlementMap, field)) {
          const expectedStage = field === 'questClearNum' ? 'clear-count' : 'map-flag';
          if (treasureStage !== expectedStage || treasureMap?.[field] !== value) return failQuestOutcome();
          treasureStage = field === 'questClearNum' && treasureMap.questFlag !== null ? 'map-flag' : 'delete';
        }
        const group = Object.hasOwn(settlementAvatar, field) ? settlementAvatar : settlementMap;
        group[field] = value;
        break;
      }
    }
    if (questDeleted && questFinish) {
      if (fixedBattleGemTreasure && progress !== null) run.progress = progress;
      settlement = applySettlement({
        ...questFinish, questId, avatar: { ...settlementAvatar }, map: { ...settlementMap, progress },
        cards: [...awards.values()], ...(treasure ? { treasure } : {}),
      });
      if (onStateChange) {
        clearTimeout(outcomeDeadline);
        outcomeReceipt = freezeQuestReceipt(settlement);
        outcomeState = duelFinish.bonus && !bonusGameTreasure ? 'bonus-pending' : 'settled';
      }
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
        const staged = sceneCombat?.nextAttackPoints;
        if (finishCombat('complete')) {
          openExchange(2, staged?.player ? staged : undefined);
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
        if (!exchange.playerAttacks) revealOpponentSelection(exchange.attackCards);
        if (!closeCombatDrop()) break;
        exchange.phase = 'awaiting-defense';
        waitForCombat(QUEST_DEFENCE_PHASE_START_REPLY);
        break;
      case QUEST_DEFENCE_PHASE_START_REPLY: {
        const playerDefends = readQuestDefencePhaseReply(reply);
        if (playerDefends === exchange.playerAttacks) throw new SessionError('protocol');
        exchange.phase = playerDefends ? 'defense' : 'resolving';
        if (sceneCombat?.exchange === exchange) {
          sceneCombat.defenceStartedAt = performance.now();
          if (!playerDefends) sceneCombat.opponentTableCount = 0;
        }
        waitForCombat(QUEST_DEFENCE_PHASE_FINISH_REPLY, QUEST_COMBAT_WAIT + TIMEOUT);
        break;
      }
      case QUEST_DEFENCE_PHASE_FINISH_REPLY:
        exchange.defenceCards = readQuestBattleCardsReply(reply);
        if (exchange.playerAttacks) revealOpponentSelection(exchange.defenceCards);
        if (!closeCombatDrop()) break;
        exchange.phase = 'resolving';
        waitForCombat(QUEST_BATTLE_CARDS_REPLY);
        break;
      case QUEST_BATTLE_CARDS_REPLY: {
        exchange.cards = readQuestBattleCardsReply(reply);
        if (sceneCombat?.exchange === exchange && sceneCombat.opponentSelectedCount !== null
            && sceneCombat.opponentSelectedCount !== exchange.cards.opponentCards.length) opponentHeldCount = null;
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
    ...(onStateChange ? [QUEST_MOVE_SUBMITTED_REPLY, QUEST_ATTACK_SUBMITTED_REPLY, QUEST_DEFENCE_SUBMITTED_REPLY,
      QUEST_POINT_UPDATE_REPLY] : []),
    ...(fixedTreasure || bonusGameTreasure ? [QUEST_TREASURE_REPLY] : []),
    ...(bonusGameTreasure ? QUEST_REWARD_REPLIES : []),
  ];
  function receiveReply(reply) {
    if (phase === 'closed') return;
    let combatChanged = false;
    try {
      if (reward?.received(reply)) return;
      if (QUEST_REWARD_REPLIES.includes(reply.command)) return failQuestOutcome();
      if (sceneCombat?.nextAttackPoints && reply.command !== QUEST_POINT_UPDATE_REPLY
          && reply.command !== QUEST_ATTACK_PHASE_START_REPLY) sceneCombat.nextAttackPoints = null;
      if (QUEST_SETTLEMENT_REPLIES.includes(reply.command) || reply.command === QUEST_TREASURE_REPLY) {
        const beforeOutcome = outcomeState;
        const beforeReceipt = outcomeReceipt;
        receiveSettlement(reply);
        combatChanged = outcomeState !== beforeOutcome || outcomeReceipt !== beforeReceipt
          || (sceneCombat?.exchange === exchange && (reply.command === QUEST_DUEL_FINISH_REPLY || reply.command === QUEST_FINISH_REPLY));
        return;
      }
      if (reward && reply.command === QUEST_ERROR_REPLY && outcomeReceipt) {
        reward.invalidate();
        return;
      }
      if ((expectsLandContinuation() || expectsFixedTreasure()) && reply.command === QUEST_ERROR_REPLY) {
        readQuestErrorReply(reply);
        failQuestOutcome();
        return;
      }
      if (reward && reply.command === QUEST_ERROR_REPLY) {
        reward.invalidate();
        return;
      }
      if (phase === 'uncertain' || exchange?.phase === 'uncertain' || duelFinish || questFinish) return;
      if (reply.command === QUEST_MOVE_SUBMITTED_REPLY) {
        receiveMoveSubmission(reply);
        return;
      }
      if (reply.command === QUEST_ATTACK_SUBMITTED_REPLY || reply.command === QUEST_DEFENCE_SUBMITTED_REPLY) {
        receiveCombatSubmission(reply);
        return;
      }
      if (onStateChange && reply.command === QUEST_POINT_UPDATE_REPLY) {
        if (phase === 'move' || phase === 'committing') receiveMovePoints(reply);
        else if (phase === 'moved' && sceneCombat?.exchange === exchange) {
          try { receiveCombatPoints(reply); } catch { sceneCombat.nextAttackPoints = null; }
        }
        return;
      }
      if (onStateChange && reply.command === QUEST_CARD_ROTATE_REPLY
          && (phase === 'move' || phase === 'committing' || (sceneCombat?.exchange === exchange
            && ['attack', 'defense'].includes(exchange?.phase)))) {
        receiveRotation(reply);
        return;
      }
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
        combatChanged = Boolean(onStateChange);
        if (onStateChange && phase === 'settling' && hp.kind === 'heal' && hp.index === null && hp.value > 0) {
          moveHealing ??= { player: 0, opponent: 0 };
          moveHealing[hp.player ? 'player' : 'opponent'] += hp.value;
        }
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
        const affectsPlayer = readQuestHandEffectReply(reply);
        if (onStateChange && reply.command !== QUEST_CARD_ROTATE_REPLY && reply.command !== QUEST_EVENT_CARD_ROTATE_REPLY) {
          // These effects can change a hidden hand or table without a transfer notice.
          opponentHeldCount = null;
          opponentMoveCount = null;
          if (sceneCombat) sceneCombat.opponentTableCount = null;
          combatChanged = true;
        }
        if (affectsPlayer) uncertain();
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
        if (QUEST_COMBAT_REPLIES.includes(reply.command)) {
          combatChanged = sceneCombat?.exchange === exchange;
          receiveCombat(reply);
        } else if (reply.command === QUEST_BATTLE_CARD_ADD_REPLY || reply.command === QUEST_BATTLE_CARD_REMOVE_REPLY) {
          receiveBattleCard(reply);
        } else if (reply.command === QUEST_ERROR_REPLY) {
          readQuestErrorReply(reply);
          uncertain();
        }
        return;
      }
      switch (reply.command) {
        case QUEST_DIRECTION_REPLY: {
          const update = readQuestDirectionReply(reply);
          if (phase !== 'move' || pending?.kind !== 'direction' || pending.answered || pending.turn !== turn || !update.player) break;
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
          receiveMoveCard(reply);
          break;
        case QUEST_MOVE_PHASE_FINISH_REPLY:
          if (phase !== 'move' && phase !== 'committing') throw new SessionError('protocol');
          readQuestMovePhaseReply(reply);
          if ((pending?.cardTransfer || pending?.rotation) && !pending.answered) {
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
          if (moveHealing) result.healing = Object.freeze(moveHealing);
          consumePlayedCards(result.playerCards);
          moveTable.length = 0;
          if (opponentMoveCount !== null && opponentMoveCount !== result.opponentCards.length) opponentHeldCount = null;
          opponentMoveCount = null;
          movePoints = null;
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
      if (onStateChange && (reply.command === QUEST_DUEL_FINISH_REPLY || reply.command === QUEST_DELETED_REPLY
          || reply.command === QUEST_FINISH_REPLY || ((hasNextLand() || fixedTreasure || bonusGameTreasure) && (reply.command === QUEST_PROGRESS_REPLY
            || reply.command === QUEST_DECK_STATE_REPLY || reply.command === QUEST_ERROR_REPLY)))) failQuestOutcome();
      else if ((fixedTreasure || bonusGameTreasure) && [QUEST_CHARACTER_AWARD_REPLY, QUEST_TREASURE_REPLY, QUEST_MAP_FLAG_REPLY,
        QUEST_MAP_CLEAR_COUNT_REPLY, QUEST_GEMS_REPLY].includes(reply.command)) failQuestOutcome();
      else uncertain();
    } finally {
      publishBattlePhase(combatChanged);
    }
  }
  let unsubscribe = socket.observe(replies, receiveReply);
  void loadStartingHp().catch(() => {});
  loadRoute();
  // A retained scene already stops its current battle on peer closure and can reuse the socket.
  if (!onStateChange) {
    void socket.closed.then(() => {
      catalogRequests.abort();
      uncertain();
    });
  }

  async function send(kind, command, fields, signal, details = {}) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (phase === 'uncertain' || exchange?.phase === 'uncertain') throw new SessionError('quest-battle-uncertain');
    if (pending) throw new SessionError('busy');
    const combat = kind === 'battle-card' || kind === 'battle-commit' || kind === 'battle-rotate';
    const choosingCharacter = kind === 'character';
    const transferring = kind === 'card' || kind === 'battle-card';
    const rotating = kind === 'rotate' || kind === 'battle-rotate';
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
      throw new SessionError(transferring || rotating ? 'quest-card-unavailable' : 'quest-battle-unavailable');
    }
    const remaining = (combat || choosingCharacter ? combatDeadline : moveDeadline) - performance.now();
    if ((combat || choosingCharacter || phase === 'move') && remaining <= 0) {
      uncertain();
      throw new SessionError('quest-battle-uncertain');
    }

    if (combat && !rotating) command = combatCommands[command];
    const cardTransfer = transferring ? prepareCard(command, details, combat) : null;
    const rotation = rotating ? prepareRotation(details.id, combat ? exchange.battleTable : moveTable,
      combat ? QUEST_BATTLE_ZONE : QUEST_MOVE_ZONE) : null;
    const controller = new AbortController();
    const cancel = () => controller.abort(new SessionError('cancelled'));
    signal?.addEventListener('abort', cancel, { once: true });
    const action = { kind, turn, exchange: combat ? exchange : null, direction: details.direction,
      cardTransfer, rotation, controller, answered: false,
      character: character && { index: character.index, cardId: character.cardId } };
    const notification = new Promise((resolve, reject) => {
      action.resolve = resolve;
      action.reject = reject;
    });
    pending = action;
    action.task = (async () => {
      let sent = false;
      try {
        socket.send(command, (cardTransfer ?? rotation)?.fields ?? fields);
        sent = true;
        if (kind === 'ready') phase = 'preparing';
        else if (kind === 'commit') phase = 'committing';
        else if (kind === 'battle-commit') exchange.phase = 'committing';
        else if (choosingCharacter) characterChange.requestedIndex = character.index;
        publishBattlePhase();
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

  function freezeCards(cards) {
    return Object.freeze(cards.map(({ id, up }) => Object.freeze({ id, up })));
  }

  function freezeHand(cards) {
    return cards && Object.freeze(cards.map(({ id, up, event }) => Object.freeze({
      id, up, event: event === true, playable: !event || stockEventCards.get(id) === true,
    })));
  }

  function sceneExchangeSnapshot() {
    if (!sceneCombat) return null;
    const { exchange: current, opponentTableCount, attackStartedAt, defenceStartedAt, points, playerPointCards, boundary, submitted } = sceneCombat;
    const freezeReveal = (reveal) => reveal && Object.freeze({
      ...reveal, playerCards: freezeCards(reveal.playerCards), opponentCards: freezeCards(reveal.opponentCards),
    });
    const table = current.cards?.playerCards ?? current.battleTable;
    const activePlayerCardIds = playerPointCards && sameValues(playerPointCards.ids, table.map(({ id }) => id))
      ? Object.freeze(playerPointCards.ids.filter((_, index) => ((playerPointCards.mask >>> index) & 1) === 1)) : null;
    return Object.freeze({
      key: `${current.turn}:${current.index}`, turn: current.turn, index: current.index,
      phase: current.phase, playerAttacks: current.playerAttacks,
      battleTable: freezeHand(current.battleTable), opponentTableCount: current.phase === 'uncertain' ? null : opponentTableCount,
      attackStartedAt, defenceStartedAt, durationMs: QUEST_COMBAT_WAIT, boundary, submitted,
      points: Object.freeze({ ...points }), activePlayerCardIds,
      attackCards: freezeReveal(current.attackCards), defenceCards: freezeReveal(current.defenceCards), cards: freezeReveal(current.cards),
      dice: current.dice && Object.freeze({
        ...current.dice, attackDice: Object.freeze(current.dice.attackDice.slice()), defenceDice: Object.freeze(current.dice.defenceDice.slice()),
      }),
      damage: Object.freeze(current.damage.map((hit) => Object.freeze({ ...hit }))),
      hitPoints: Object.freeze({ ...current.hitPoints }),
      duelFinish: current.duelFinish && Object.freeze({ ...current.duelFinish }),
      questFinish: current.questFinish && Object.freeze({ ...current.questFinish }),
    });
  }

  return {
    get busy() { return pending !== null; },
    get outcome() { return outcomeSnapshot(); },
    get settlement() { return structuredClone(settlementSnapshot()); },
    get nextLands() { return nextLands(); },
    resume() { unsubscribe = socket.observe(replies, receiveReply); },
    sceneSnapshot(operation) {
      const freezeRefill = ({ cards, opponentDrawCount }) => Object.freeze({ cards: freezeCards(cards), opponentDrawCount });
      const freezeSide = ({ activeIndex, cards }) => Object.freeze({ activeIndex,
        cards: Object.freeze(cards.map((card) => Object.freeze({ ...card }))),
      });
      return Object.freeze({
        phase, turn, startDistance: startDistance ?? encounter.duel.distance, moveStartedAt,
        encounterKey: `${inventoryId}:${slot}`,
        moveDurationMs: QUEST_MOVE_WAIT, opponentHandCount: opponentHeldCount, opponentMoveCount, direction,
        operation, moveSubmitted, movePoints: phase === 'uncertain' ? null : movePoints,
        ready: ready && Object.freeze({ turn: ready.turn, action: freezeRefill(ready.action), event: freezeRefill(ready.event) }),
        actionHand: hand && freezeCards(hand.filter((card) => !card.event)),
        eventHand: hand && freezeCards(hand.filter((card) => card.event)),
        hand: freezeHand(hand), moveTable: freezeHand(moveTable),
        result: result && Object.freeze({
          ...result, playerCards: freezeCards(result.playerCards), opponentCards: freezeCards(result.opponentCards),
        }),
        exchange: (duelFinish || questFinish || (phase !== 'between-turns' && phase !== 'preparing')) ? sceneExchangeSnapshot() : null,
        exchangeHistory, previousExchange: exchangeHistory.at(-1) ?? null,
        outcome: outcomeSnapshot(),
        ...(reward ? { reward: reward.snapshot() } : {}),
        roster: Object.freeze({ player: freezeSide(roster.player), opponent: freezeSide(roster.opponent) }),
        characterChange: characterChange && Object.freeze({
          kind: characterChange.kind, playerDone: characterChange.playerDone, opponentDone: characterChange.opponentDone,
          closed: characterChange.closed,
        }),
      });
    },
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
    rotateMoveCard: (id, signal) => send('rotate', QUEST_CARD_ROTATE_REQUEST, null, signal, { id }),
    commit: (signal) => send('commit', QUEST_MOVE_COMMIT_REQUEST, ['', ''], signal),
    addBattleCard: (id, up, signal) => send('battle-card', 'add', null, signal, { id, up }),
    removeBattleCard: (id, signal) => send('battle-card', 'remove', null, signal, { id }),
    rotateBattleCard: (id, signal) => send('battle-rotate', QUEST_CARD_ROTATE_REQUEST, null, signal, { id }),
    commitBattle: (signal) => send('battle-commit', 'done', ['', ''], signal),
    async rewardAction(action, signal, round, details) {
      if (!reward || (round !== undefined && round !== reward.snapshot().round)) {
        throw new SessionError('quest-reward-unavailable');
      }
      await reward.request(action, signal, details);
      return reward.snapshot();
    },
    async stop(reason) {
      phase = 'closed';
      catalogRequests.abort();
      if (exchange) exchange.phase = 'closed';
      clearTimeout(settlementTimer);
      clearTimeout(outcomeDeadline);
      reward?.stop();
      unsubscribe();
      const action = pending;
      if (action) {
        action.controller.abort(new SessionError(reason === 'closed' ? 'cancelled' : 'network'));
        await action.task.catch(() => {});
      }
      await landFence;
    },
  };
}

function activeSession(auth, channels, playerId, sessionKey, { questData, ...initialData }, attachLobbyAvatar,
  lobbyStartupComplete, startupLobbyEvents) {
  const lobby = channels.find(({ port }) => port === LOBBY_PORT);
  const data = channels.find(({ port }) => port === DATA_PORT);
  const registrationOptions = avatarRegistrationOptions(initialData.registration);
  let registrationState = registrationOptions ? 'available' : 'unavailable';
  let confirmedAvatar = null;
  let registrationLobbyPatch = null;
  let lastLobbyRefresh = -Infinity;
  let lobbyStartupPending = Boolean(initialData.avatar && !lobbyStartupComplete);
  let lobbyRefresh;
  let ordinaryRefreshBacklog = 0;
  let queuedEnergyRefresh;
  let verifiedLobbyCap;
  const avatarSubscriptions = new Set();
  const lobbyAchievementSubscriptions = new Set();
  const pendingLobbyAchievements = new Set();
  const checkedLobbyShows = new WeakSet();
  const selectableLobbyAchievements = new Map();
  let selectableLobbyNoticeIds = new Set();
  let selectableLobbyClaim;
  let uncertainSelectableCardId;
  let lobbyAchievementFenceUncertain = false;
  let profileRequest;
  let deckEditState;
  let deckSelectionUncertain = false;
  let closing;
  let questRequest;
  let questReturn;
  let questScene;
  let searchUncertain = false;
  const attemptedDiscoveries = new Set();
  const questConfirmations = new Map();
  let questStartUncertain = false;
  let adventure = null;
  const boundQuestDecks = new Map();
  const confirmedQuestAwards = new Set();
  let knownQuestItems = readItemInventory(questData);
  const blockedQuestItems = new Set();
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });

  function readItemInventory(data) {
    return data?.itemInventory ? new Map(data.itemInventory.map((item) => [item.inventoryId, item])) : null;
  }

  const rewardItemInventory = {
    available() {
      if (!knownQuestItems) return [];
      return [...knownQuestItems.values()].filter(({ itemId, state }) => state === 0 && QUEST_REWARD_ITEMS.has(itemId))
        .map((item) => ({ ...item, blocked: blockedQuestItems.has(item.inventoryId) }));
    },
    block(id) { blockedQuestItems.add(id); },
    consume(id) {
      const item = knownQuestItems?.get(id);
      if (item?.state !== 0 || blockedQuestItems.has(id)) throw new SessionError('protocol');
      knownQuestItems.set(id, { ...item, state: 2 });
    },
  };

  function rememberItemGrant({ inventoryId, itemId }) {
    if (!knownQuestItems) return false;
    const previous = knownQuestItems.get(inventoryId);
    if (previous && (previous.itemId !== itemId || previous.state === 2)) throw new SessionError('protocol');
    if (previous) return false;
    knownQuestItems.set(inventoryId, { inventoryId, itemId, state: 0 });
    return true;
  }

  function receiveQuestItemGrant(scene, reply) {
    if (reply.command !== QUEST_ITEM_GRANTED_REPLY || !scene?.channel.verified || questScene !== scene) return false;
    if (!knownQuestItems) return true;
    try {
      if (!rememberItemGrant(readQuestItemReply(reply))) return true;
    } catch {
      knownQuestItems = null;
    }
    publishQuestScene(scene);
    return true;
  }

  function notifyLobbyListener(listener, event) {
    try {
      void Promise.resolve(listener(event)).catch(() => {});
    } catch {
      // Presentation callbacks cannot interrupt the verified Lobby stream.
    }
  }

  function recordLobbyEvent(event) {
    if (!initialData?.avatar) return;
    if (event.kind === 'selectable-notices') {
      selectableLobbyNoticeIds = new Set(event.achievementIds);
      for (const { offer, state } of selectableLobbyAchievements.values()) {
        if (state === 'available' && !selectableLobbyNoticeIds.has(offer.achievementId)) {
          invalidateLobbyReward(offer);
        }
      }
      return;
    }
    if (event.kind === 'selectable-options') {
      const { achievementId, choices } = event;
      if (!selectableLobbyNoticeIds.has(achievementId) || selectableLobbyAchievements.has(achievementId)) return;
      const offer = Object.freeze({ kind: 'selectable-achievement', achievementId, choices });
      selectableLobbyAchievements.set(achievementId, { offer, state: 'available' });
      publishLobbyEvent(offer);
      return;
    }
    if (event.kind === 'item') {
      try {
        if (knownQuestItems && !rememberItemGrant(event)) return;
      } catch {
        knownQuestItems = null;
        if (questScene?.state === 'open') publishQuestScene(questScene);
        return;
      }
      if (questScene?.state === 'open') publishQuestScene(questScene);
    } else if (event.kind === 'card') {
      const { inventoryId, cardId } = event;
      const { deckCollection, deckChoices, selectedDeck } = initialData;
      if (confirmedQuestAwards.has(inventoryId) || deckCollection?.binder.some((card) => card.inventoryId === inventoryId)
        || deckCollection?.deck.cards.some((card) => card.inventoryId === inventoryId)
        || selectedDeck?.cards.some((card) => card.inventoryId === inventoryId)
        || deckChoices?.some(({ cards }) => cards.some((card) => card.inventoryId === inventoryId))) return;
      if (selectableLobbyClaim?.dispatched && selectableLobbyClaim.choice.itemId === cardId) {
        if (selectableLobbyClaim.grant) selectableLobbyClaim.duplicate = true;
        else selectableLobbyClaim.grant = Object.freeze({ inventoryId, cardId });
        return;
      }
      if (uncertainSelectableCardId === cardId) return;
      if (deckCollection) {
        const card = Object.freeze({ inventoryId, cardId });
        const binder = Object.freeze([...deckCollection.binder, card]);
        initialData.deckCollection = Object.freeze({ ...deckCollection, binder });
      }
    }
    publishLobbyEvent(Object.freeze(event));
  }

  function lobbyRewardEntry(receipt) {
    if (receipt?.kind !== 'selectable-achievement') return null;
    const entry = selectableLobbyAchievements.get(receipt.achievementId);
    return entry?.offer === receipt ? entry : null;
  }

  function invalidateLobbyReward(receipt) {
    const entry = lobbyRewardEntry(receipt);
    if (entry) entry.state = 'unavailable';
    pendingLobbyAchievements.delete(receipt);
  }

  async function claimLobbyReward(receipt, selectionIndex, signal) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (!initialData?.avatar || !initialData.deckCollection || !lobby.verified) throw new SessionError('lobby-reward-unavailable');
    if (selectableLobbyClaim || profileRequest || questRequest || questReturn || questScene || adventure) throw new SessionError('busy');
    if (uncertainSelectableCardId !== undefined) throw new SessionError('lobby-reward-uncertain');
    const entry = lobbyRewardEntry(receipt);
    const choice = entry?.offer.choices.find(({ index }) => index === selectionIndex);
    if (entry?.state !== 'available' || !choice) throw new SessionError('lobby-reward-unavailable');
    auth.assertOpen();
    const { achievementId } = receipt;
    const claim = { choice, dispatched: false };
    selectableLobbyClaim = claim;
    entry.state = 'claiming';
    try {
      // A view may leave after sending. Keep observing the session's authoritative reply.
      return await withRegistrationChannel(lobby, undefined, async (socket, requestSignal) => {
        if (signal?.aborted) throw new SessionError('cancelled');
        if (!selectableLobbyNoticeIds.has(achievementId)) throw new SessionError('lobby-reward-unavailable');
        let grantAtResult;
        const reply = await socket.ask(LOBBY_SELECTABLE_REWARD_REQUEST, [`${achievementId},${selectionIndex}`],
          [LOBBY_SELECTABLE_RESULT_REPLY], {
            signal: requestSignal,
            allowOther: true,
            onSend() { claim.dispatched = true; },
            onReply() { grantAtResult = claim.grant; },
          });
        const result = readSelectableLobbyResult(reply, achievementId, selectionIndex);
        if (result.code !== 0) {
          if (claim.grant) throw new SessionError('protocol');
          claim.dispatched = false;
          if (result.code === 2) invalidateLobbyReward(receipt);
          throw new SessionError('lobby-reward-rejected', result.code);
        }
        if (!grantAtResult || claim.duplicate || result.inventoryId !== grantAtResult.inventoryId
          || result.cardId !== choice.itemId || !initialData) throw new SessionError('protocol');
        claim.dispatched = false;
        entry.state = 'claimed';
        pendingLobbyAchievements.delete(receipt);
        selectableLobbyNoticeIds.delete(achievementId);
        recordLobbyEvent({ kind: 'card', ...grantAtResult });
        return Object.freeze({ achievementId, selectionIndex, grants: Object.freeze([grantAtResult]) });
      });
    } catch (error) {
      if (claim.dispatched) {
        entry.state = 'uncertain';
        uncertainSelectableCardId = choice.itemId;
        throw new SessionError('lobby-reward-uncertain');
      }
      if (entry.state === 'claiming') {
        if (selectableLobbyNoticeIds.has(achievementId)) entry.state = 'available';
        else invalidateLobbyReward(receipt);
      }
      throw error;
    } finally {
      selectableLobbyClaim = null;
    }
  }

  function publishLobbyEvent(receipt) {
    if (['achievement', 'new-achievement', 'selectable-achievement'].includes(receipt.kind)) {
      pendingLobbyAchievements.add(receipt);
    }
    for (const subscription of [...lobbyAchievementSubscriptions]) {
      if (lobbyAchievementSubscriptions.has(subscription)) notifyLobbyListener(subscription.listener, receipt);
    }
  }

  function finishLobbyAchievementBatch(signal, onBatchReady) {
    const previous = lobby.heartbeat;
    const batch = (async () => {
      if (previous) await previous;
      if (!initialData || lobbyAchievementFenceUncertain) return false;
      await finishLobbyObservation(lobby.socket);
      return true;
    })().catch(() => {
      // The original Pong has no ID. A late reply cannot confirm another achievement batch.
      lobbyAchievementFenceUncertain = true;
      return false;
    });
    lobby.heartbeat = batch;
    void batch.then((confirmed) => {
      if (lobby.heartbeat === batch) lobby.heartbeat = null;
      if (initialData && !signal.aborted) notifyLobbyListener(onBatchReady, confirmed);
    });
  }

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

  function trackLobbyRefresh(scene) {
    const request = { scene, revision: scene?.energyRevision, stage: 'energy' };
    request.timeout = setTimeout(() => { request.expired = true; }, TIMEOUT);
    lobbyRefresh = request;
  }

  function sendLobbyRefresh(scene) {
    try {
      auth.assertOpen();
      lobby.socket.send(LOBBY_REFRESH_AVATAR, []);
      lastLobbyRefresh = performance.now();
      if (lobbyRefresh) ordinaryRefreshBacklog += 1;
      else trackLobbyRefresh(scene);
      return true;
    } catch {
      return false;
    }
  }

  function canRefreshSceneEnergy(scene) {
    return scene && scene === questScene && scene.state === 'open' && scene.energyRefreshDue && !profileRequest
      && !questRequest && !questReturn && initialData?.avatar;
  }

  function recordLobbyRefresh(patch, command, marker) {
    if (lobbyStartupPending) {
      if (command === LOBBY_DECK_LEVEL_REPLY) lobbyStartupPending = false;
      return;
    }
    const request = lobbyRefresh;
    if (!request) return;
    if (command === LOBBY_ENERGY_REPLY && request.stage !== 'energy') request.expired = true;
    if (request.stage === 'energy') {
      if (command === LOBBY_ENERGY_REPLY) request.energy = patch;
      if (command === LOBBY_FREE_DUEL_COUNT_REPLY && request.energy) request.stage = 'profile';
      return;
    }
    if (request.stage === 'profile') {
      if (command === LOBBY_ENERGY_MAX_REPLY) request.energyMax = patch.energyMax;
      if (command === LOBBY_LEVEL_REPLY) request.level = marker;
      if (command === LOBBY_DECK_EXP_REPLY) request.stage = 'tail';
      return;
    }
    if (command !== LOBBY_DECK_LEVEL_REPLY) return;
    clearTimeout(request.timeout);
    lobbyRefresh = undefined;
    if (!request.expired && request.energyMax !== undefined && request.level !== undefined) {
      verifiedLobbyCap = { level: request.level, energyMax: request.energyMax };
    }
    const { scene } = request;
    if (!request.expired && canRefreshSceneEnergy(scene) && request.revision === scene.energyRevision &&
        (request.level === undefined || request.level === initialData.avatar.level)) {
      const avatar = initialData.avatar;
      Object.assign(avatar, request.energy);
      if (request.energyMax !== undefined) avatar.energyMax = request.energyMax;
      scene.energyRefreshDue = false;
      publishAvatar();
      publishQuestScene(scene);
    }
    if (ordinaryRefreshBacklog) {
      ordinaryRefreshBacklog -= 1;
      trackLobbyRefresh();
    } else if (queuedEnergyRefresh) {
      const queued = queuedEnergyRefresh;
      queuedEnergyRefresh = undefined;
      if (canRefreshSceneEnergy(queued)) sendLobbyRefresh(queued);
    }
  }

  function ownQuestEnergy(scene) {
    scene.energyOwned = true;
    scene.energyRevision = (scene.energyRevision ?? 0) + 1;
    scene.energyRefreshDue = false;
  }

  attachLobbyAvatar((patch, command, marker, event) => {
    if (!initialData) return;
    if (event && !patch) recordLobbyEvent(event);
    recordLobbyRefresh(patch, command, marker);
    if (!patch || (questScene?.energyOwned && (command === LOBBY_ENERGY_REPLY || command === LOBBY_ENERGY_MAX_REPLY))) return;
    const avatar = initialData.avatar;
    if (avatar) {
      if (Object.entries(patch).some(([field, value]) => avatar[field] !== value)) {
        Object.assign(avatar, patch);
        publishAvatar();
        if (Object.hasOwn(patch, 'energy') && questScene?.state === 'open') publishQuestScene(questScene);
      }
      if (event) recordLobbyEvent(event);
    } else if (confirmedAvatar) {
      Object.assign(confirmedAvatar.avatar, patch);
    } else if (registrationLobbyPatch) {
      Object.assign(registrationLobbyPatch, patch);
    }
  });
  for (const event of startupLobbyEvents) recordLobbyEvent(event);
  startupLobbyEvents.length = 0;

  function stop(reason) {
    if (!closing) {
      clearInterval(timer);
      clearTimeout(lobbyRefresh?.timeout);
      lobbyRefresh = queuedEnergyRefresh = undefined;
      ordinaryRefreshBacklog = 0;
      initialData = null;
      questData = null;
      confirmedAvatar = null;
      for (const subscription of avatarSubscriptions) subscription.unsubscribe();
      for (const subscription of lobbyAchievementSubscriptions) subscription.unsubscribe();
      pendingLobbyAchievements.clear();
      selectableLobbyAchievements.clear();
      selectableLobbyNoticeIds.clear();
      boundQuestDecks.clear();
      attemptedDiscoveries.clear();
      questConfirmations.clear();
      sessionKey.fill(0);
      const request = questRequest;
      const returning = questReturn;
      const profileOperation = profileRequest;
      const retained = adventure;
      const scene = questScene;
      if (retained) retained.state = 'closed';
      for (const operation of [request, returning, profileOperation]) {
        operation?.controller.abort(new SessionError(reason === 'closed' ? 'cancelled' : 'network'));
      }
      closing = (async () => {
        if (request) await request.task.catch(() => {});
        if (returning) await returning.task.catch(() => {});
        if (profileOperation) await profileOperation.task.catch(() => {});
        if (scene) await closeQuestScene(scene).catch(() => {});
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
    if (questScene) throw new SessionError(questScene.state === 'return-uncertain' ? 'quest-return-uncertain' : 'busy');
    if (adventure) {
      if (adventure.state === 'return-uncertain') throw new SessionError('quest-return-uncertain');
      throw new SessionError(adventure.state === 'uncertain' ? 'quest-land-uncertain' : 'quest-adventure-active');
    }
  }

  function editableDeck() {
    if (!initialData?.avatar || !questData || questScene || adventure || questRequest || questReturn || profileRequest
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

  async function readFromQuest(read, signal, reconcile, onPushedReply) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (!initialData) throw new SessionError('network');
    assertQuestAvailable();
    auth.assertOpen();
    for (const { socket } of channels) socket.assertOpen();

    const controller = new AbortController();
    const cancel = () => controller.abort(new SessionError('cancelled'));
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(new SessionError('timeout')), TIMEOUT);
    const task = queryQuest(playerId, sessionKey, controller.signal, read, onPushedReply);
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

  function closeQuestScene(scene) {
    scene.closeTask ??= (async () => {
      if (scene.state === 'return-uncertain') throw new SessionError('quest-return-uncertain');
      scene.state = 'closing';
      const operation = scene.operation;
      disposeQuestSceneOperations(scene, 'cancelled');
      if (operation) await operation.task.catch(() => {});
      await stopQuestSceneAdventure(scene, 'closed');
      const { socket, negotiationSent } = scene.channel;
      try {
        // Ruby's unbind also deletes the player registration after negotiation alone.
        if (negotiationSent) await socket.releaseQuest();
        else await socket.close();
      } catch {
        scene.state = 'return-uncertain';
        await socket.close();
        throw new SessionError('quest-return-uncertain');
      }
      if (questScene === scene) questScene = undefined;
    })();
    return scene.closeTask;
  }

  async function stopQuestSceneAdventure(scene, reason) {
    const current = scene.adventure;
    if (!current) return;
    current.nonCombatObserver?.stop();
    await current.battle?.stop(reason);
    const { inventoryId, deckIndex } = current.selected;
    // The peer owns its current terrain. Preserve the row and lock, but do not resume it on another peer.
    const row = questData?.rows.find((entry) => entry.inventoryId === inventoryId);
    if (row?.deckIndex === deckIndex) delete row.deckIndex;
    boundQuestDecks.delete(inventoryId);
  }

  function maintainQuestScene() {
    const scene = questScene;
    if (scene?.state !== 'open' || scene.heartbeat || scene.operation || scene.landFence) return;
    const { socket } = scene.channel;
    scene.heartbeat = socket.ask(3, [], [3], { allowOther: true }).then((pong) => pong.done()).catch((error) => {
      if (scene.state !== 'open') return;
      scene.state = 'return-uncertain';
      scene.failure = error.kind === 'timeout' ? 'expired' : 'network';
      return socket.close();
    }).finally(() => { scene.heartbeat = null; });
  }

  async function fenceQuestSceneLand(scene, signal) {
    const fence = Promise.resolve().then(async () => {
      if (scene.heartbeat) await bounded(scene.heartbeat, signal);
      if (questScene !== scene || scene.state !== 'open') throw new SessionError('network');
      await finishQuestObservation(scene.channel.socket, signal);
    });
    scene.landFence = fence;
    try {
      await fence;
    } finally {
      if (scene.landFence === fence) scene.landFence = null;
    }
  }

  function disposeQuestSceneOperations(scene, reason) {
    clearTimeout(scene.discoveryTimer);
    scene.operation?.controller.abort(new SessionError(reason));
    for (const subscription of scene.subscriptions) subscription.unsubscribe();
  }

  function questSceneRow(scene, row) {
    const snapshot = { ...row };
    const dueAt = questDiscoveryDue(row, questData.receivedAt);
    if (dueAt !== null) snapshot.dueAt = dueAt;
    const sender = scene.senders.get(row.inventoryId);
    if (sender?.questId === row.questId) snapshot.senderName = sender.name;
    if (row.status === QUEST_NEW && questConfirmations.get(row.inventoryId) === row.questId
        && scene.confirming !== row.inventoryId) snapshot.confirmationState = 'uncertain';
    return Object.freeze(snapshot);
  }

  function publishQuestScene(scene) {
    if (scene.state !== 'open' || !initialData) return;
    const staleDeck = ['pending-verification', 'uncertain'].includes(deckEditState);
    const decks = staleDeck ? [] : initialData.avatar.questDecks;
    const deckChoices = staleDeck ? [] : initialData.deckChoices;
    const inAdventure = activeSceneAdventure(scene);
    const selectedDeck = staleDeck ? null : initialData.selectedDeck;
    const readyDeck = selectedDeck?.cards.some(({ position }) => position === 0)
      && decks.some(({ index }) => index === selectedDeck.index);
    const deckSelectionState = scene.operation?.kind === 'deck-select' ? 'busy' : deckSelectionUncertain ? 'uncertain'
      : inAdventure ? 'unavailable'
      : initialData.selectedDeck && deckChoices?.length ? 'ready' : 'unavailable';
    const searchState = scene.operation?.kind === 'search' ? 'busy'
      : searchUncertain ? 'uncertain' : scene.operation || inAdventure ? 'busy' : 'ready';
    const startState = scene.operation?.kind === 'start' ? 'busy' : questStartUncertain ? 'uncertain'
      : inAdventure || deckSelectionUncertain || !readyDeck ? 'unavailable'
      : scene.operation ? 'busy' : 'ready';
    const battleOperation = scene.operation?.kind.startsWith('battle-') ? scene.operation.kind.slice(7) : null;
    const adventureSnapshot = questSceneAdventureSnapshot(scene.adventure, battleOperation);
    const snapshot = Object.freeze({
      ...questData,
      rows: Object.freeze(questData.rows.map((row) => questSceneRow(scene, row))),
      questDecks: Object.freeze(decks.map((deck) => Object.freeze({ ...deck }))),
      selectedDeck,
      deckChoices: deckChoices?.length ? deckChoices : Object.freeze([]),
      deckSelectionState,
      tutorialQuestFlag: initialData.tutorialQuestProgress?.tutorialQuestFlag ?? null,
      tutorialQuestClearNum: initialData.tutorialQuestProgress?.tutorialQuestClearNum ?? null,
      energy: initialData.avatar.energy,
      searchState,
      startState,
      adventure: adventureSnapshot,
      outcome: adventureSnapshot?.battle?.outcome ?? scene.lastOutcome ?? null,
    });
    scene.snapshot = snapshot;
    for (const { listener } of scene.subscriptions) {
      try {
        void Promise.resolve(listener(snapshot)).catch(() => {});
      } catch {
        // Rendering callbacks cannot interrupt the retained service.
      }
    }
  }

  async function runQuestSceneOperation(scene, kind, signal, work, deadline = TIMEOUT) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open' || !initialData) throw new SessionError('network');
    if (scene.operation) throw new SessionError('busy');
    const controller = new AbortController();
    const cancel = () => controller.abort(new SessionError('cancelled'));
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(new SessionError('timeout')), deadline);
    const operation = { controller, kind };
    scene.operation = operation;
    operation.task = Promise.resolve().then(async () => {
      if (scene.heartbeat) await bounded(scene.heartbeat, controller.signal);
      controller.signal.throwIfAborted();
      return work(scene.channel.socket, controller.signal);
    });
    publishQuestScene(scene);
    try {
      return await operation.task;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      scene.operation = null;
      if (scene.state === 'open') {
        scheduleQuestDiscovery(scene);
        publishQuestScene(scene);
      }
    }
  }

  async function acknowledgeQuestScene(scene, inventoryId, signal) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open' || !questData) throw new SessionError('network');
    const index = questData.rows.findIndex((row) => row.inventoryId === inventoryId);
    const row = questData.rows[index];
    if (!row?.questId || ![QUEST_NEW, QUEST_UNSOLVED, QUEST_IN_PROGRESS, QUEST_PRESENTED].includes(row.status)) {
      throw new SessionError('quest-confirm-unavailable');
    }
    if (row.status !== QUEST_NEW) return questSceneRow(scene, row);
    if (activeSceneAdventure(scene)) throw new SessionError('quest-adventure-active');
    if (scene.operation) throw new SessionError('busy');
    if (questConfirmations.has(inventoryId)) throw new SessionError('quest-confirm-uncertain');
    if (deckSelectionUncertain) throw new SessionError('deck-select-uncertain');
    const deck = scene.snapshot.selectedDeck;
    if (!deck) throw new SessionError('quest-confirm-unavailable');

    return runQuestSceneOperation(scene, 'acknowledge', signal, async (socket, questSignal) => {
      try {
        const confirmed = await sendQuestConfirmation(socket, questSignal, row, deck.index, () => {
          questConfirmations.set(inventoryId, row.questId);
          scene.confirming = inventoryId;
        });
        questSignal.throwIfAborted();
        socket.assertOpen();
        questData.rows[index] = confirmed;
        questConfirmations.delete(inventoryId);
        return questSceneRow(scene, confirmed);
      } catch (error) {
        if (questConfirmations.has(inventoryId)) throw new SessionError('quest-confirm-uncertain');
        throw error;
      } finally {
        scene.confirming = undefined;
      }
    });
  }

  async function selectQuestSceneDeck(scene, delta, signal) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open' || !initialData) throw new SessionError('network');
    if (scene.operation || profileRequest) throw new SessionError('busy');
    if (activeSceneAdventure(scene)) throw new SessionError('quest-adventure-active');
    if (deckSelectionUncertain) throw new SessionError('deck-select-uncertain');
    const { deckChoices, selectedDeck } = scene.snapshot;
    const current = deckChoices.findIndex(({ index }) => index === selectedDeck?.index);
    if ((delta !== -1 && delta !== 1) || current < 0) throw new SessionError('deck-select-unavailable');
    const requested = deckChoices[(current + delta + deckChoices.length) % deckChoices.length].index;

    return runQuestSceneOperation(scene, 'deck-select', signal, async (_socket, questSignal) => {
      try {
        return await withRegistrationChannel(lobby, questSignal, async (socket, lobbySignal) => {
          const reply = await socket.ask(LOBBY_SELECT_DECK_REQUEST, [requested], [LOBBY_SELECT_DECK_REPLY], {
            signal: lobbySignal, allowOther: true, onSend() { deckSelectionUncertain = true; },
          });
          const index = reply.int();
          reply.done();
          const deck = deckChoices.find((choice) => choice.index === index);
          if (!deck) throw new SessionError('protocol');
          lobbySignal.throwIfAborted();
          socket.assertOpen();
          initialData.selectedDeck = Object.freeze({ index, name: deck.name, cards: deck.cards });
          deckSelectionUncertain = false;
          return index;
        });
      } catch (error) {
        if (deckSelectionUncertain) throw new SessionError('deck-select-uncertain');
        throw error;
      }
    });
  }

  function updateQuestDeckStatus(index, status) {
    if (!initialData.deckChoices?.some((deck) => deck.index === index)) return;
    initialData.deckChoices = Object.freeze(initialData.deckChoices.map((deck) => (
      deck.index === index ? Object.freeze({ ...deck, status }) : deck
    )));
  }

  function applyQuestStart(index, selected, deck, result) {
    questStartUncertain = false;
    if (result.rejection !== undefined) {
      if (result.deleted) questData.rows.splice(index, 1);
      throw new SessionError('quest-start-rejected', result.rejection);
    }
    const { energy, energyRemainingSeconds, energyReceivedAt } = result;
    const { index: deckIndex } = deck;
    const row = { ...result.row, deckIndex };
    const { avatar } = initialData;
    questData.rows[index] = row;
    Object.assign(avatar, { energy, energyRemainingSeconds, energyReceivedAt });
    avatar.questDecks = avatar.questDecks.filter(({ index }) => index !== deckIndex);
    updateQuestDeckStatus(deckIndex, 1); // Original CDS_QUEST, proven after the Quest Pong.
    boundQuestDecks.set(selected.inventoryId, { ...deck });
    return { row, energy, deckIndex };
  }

  async function startQuestScene(scene, inventoryId, signal) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open' || !initialData) throw new SessionError('network');
    if (scene.operation) throw new SessionError('busy');
    if (questStartUncertain) throw new SessionError('quest-start-uncertain');
    if (deckSelectionUncertain) throw new SessionError('deck-select-uncertain');
    if (questConfirmations.has(inventoryId)) throw new SessionError('quest-confirm-uncertain');
    const index = questData.rows.findIndex((row) => row.inventoryId === inventoryId);
    const selected = questData.rows[index];
    const deck = scene.snapshot.selectedDeck;
    const readyDeck = scene.snapshot.questDecks.find((choice) => choice.index === deck?.index);
    if (activeSceneAdventure(scene) || !isStartableQuest(selected, true) || !readyDeck
        || !deck.cards.some(({ position }) => position === 0)) throw new SessionError('quest-start-unavailable');

    return runQuestSceneOperation(scene, 'start', signal, async (socket, questSignal) => {
      const ownedEnergy = scene.energyOwned;
      try {
        const result = await sendQuestStart(socket, questSignal, selected, deck.index, () => {
          questStartUncertain = true;
          ownQuestEnergy(scene);
        });
        questSignal.throwIfAborted();
        socket.assertOpen();
        if (result.rejection !== undefined) scene.energyOwned = ownedEnergy;
        const started = applyQuestStart(index, selected, readyDeck, result);
        scene.adventure = { selected: started.row, deck, state: 'started', slot: null, run: questRun() };
        scene.lastOutcome = null;
        publishAvatar();
        return { ...started, row: questSceneRow(scene, started.row) };
      } catch (error) {
        if (questStartUncertain) throw new SessionError('quest-start-uncertain');
        throw error;
      }
    });
  }

  async function enterQuestSceneLand(scene, slot, signal) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open' || !initialData) throw new SessionError('network');
    if (scene.operation) throw new SessionError('busy');
    const current = scene.adventure;
    if (current?.state === 'uncertain') throw new SessionError('quest-land-uncertain');
    const continuing = current?.state === 'between-lands';
    if (!validQuestSlot(slot) || (!continuing && (current?.state !== 'started' || slot > 2))) {
      throw new SessionError('quest-land-unavailable');
    }
    const { selected, state: previousState, battle: previousBattle } = current;
    const previousObserver = previousBattle ?? current.nonCombatObserver;
    return runQuestSceneOperation(scene, 'land', signal, async (socket, questSignal) => {
      const priorRun = current.run;
      let run = priorRun;
      let firstLand;
      if (continuing) {
        const outcome = previousBattle?.outcome;
        const nextLands = previousBattle ? outcome?.nextLands : current.nextLands;
        if (current.state !== 'between-lands' || (previousBattle && outcome?.state !== 'land-cleared')
            || !nextLands?.some((land) => land.slot === slot)) throw new SessionError('quest-land-unavailable');
        run = { ...questRun(), positions: priorRun.positions, progress: priorRun.progress, damage: priorRun.damage };
        firstLand = run.positions.get(slot);
      } else {
        const catalogSignal = AbortSignal.any([questSignal, AbortSignal.timeout(3500)]);
        run.positions = await readQuestRoute(selected.questId, catalogSignal).catch(() => null);
        questSignal.throwIfAborted();
        const first = [2, 1, 0].find((candidate) => run.positions?.has(candidate));
        if (first === slot) firstLand = run.positions.get(first);
      }
      if (!firstLand || firstLand.stage === null || firstLand.nextMask === null) {
        throw new SessionError('quest-land-unavailable');
      }
      let ownCardLevel1Id = null;
      if (firstLand.ownCardTreasure) {
        if (initialData.selectedDeck?.index !== selected.deckIndex) throw new SessionError('quest-reward-unavailable');
        ownCardLevel1Id = await readQuestVanguardReward(current.deck, questSignal);
        questSignal.throwIfAborted();
        if (current.state !== previousState) throw new SessionError('quest-land-uncertain');
        if (!ownCardLevel1Id) throw new SessionError('quest-reward-unavailable');
      }
      const previousProgress = run.progress ?? 0;
      const opensPassage = firstLand.nextMask > 0 && Boolean(firstLand.fixedGemTreasure || (!continuing && firstLand.emptyTerrain));
      const passageNext = opensPassage ? nextSceneLands(run.positions, slot, previousProgress | (1 << slot)) : null;
      if (opensPassage && !passageNext.length) {
        throw new SessionError('quest-land-unavailable');
      }

      let dispatched = false;
      try {
        const result = await submitQuestLand(socket, questSignal, selected, slot, () => {
          dispatched = true;
          current.state = 'entering';
          publishQuestScene(scene);
        }, (encounter) => {
          if (!sameValues(current.deck.cards.map(({ cardId }) => cardId), encounter.playerCardIds)
              || (continuing && run.damage && !sameValues(run.damage, encounter.playerDamage))) {
            throw new SessionError('protocol');
          }
          if (continuing) run.damage ??= encounter.playerDamage.slice();
          current.battle = observeQuestBattle(socket, selected, slot, encounter, run, (receipt) => {
            const settlement = reconcileQuestSettlement(selected, receipt);
            if (initialData) publishAvatar();
            return settlement;
          }, () => {
            if (['between-lands', 'terrain-reward'].includes(current.state) && current.battle.outcome?.state !== 'land-cleared') {
              scene.lastOutcome = current.battle.outcome;
              current.state = 'uncertain';
            }
            publishQuestScene(scene);
          }, {
            fence: (signal) => fenceQuestSceneLand(scene, signal),
            reconcile: (receipt) => reconcileSceneLandProgress(scene, current, receipt),
            itemInventory: rewardItemInventory,
            ownCardLevel1Id,
            mapBefore: { questFlag: questData.questFlag, questClearNum: questData.questClearNum },
            knowsCard: (id) => confirmedQuestAwards.has(id)
              || initialData?.deckCollection?.binder.some(({ inventoryId }) => inventoryId === id)
              || initialData?.deckChoices?.some(({ cards }) => cards.some(({ inventoryId }) => inventoryId === id)),
            claimReward(receipt) {
              if (questScene !== scene || scene.adventure !== current || current.state !== 'encounter') {
                throw new SessionError('protocol');
              }
              reconcileQuestRewards(receipt);
              publishAvatar();
            },
          });
          void previousObserver?.stop('closed');
          current.nonCombatObserver = null;
        }, {
          firstLand, previousProgress, expectBattle: continuing && !opensPassage,
          emptyTerrain: firstLand.emptyTerrain, fixedGemTreasure: firstLand.fixedGemTreasure,
          strictTerrain: Boolean(opensPassage || current.nonCombatObserver || current.fixedGemTreasure || current.cardTreasure),
          onArrival() {
            current.slot = slot;
            publishQuestScene(scene);
          },
        });
        questSignal.throwIfAborted();
        socket.assertOpen();
        if (result.rejection !== undefined) {
          current.state = result.deleted ? 'uncertain' : previousState;
          if (result.deleted) questData.rows = questData.rows.filter(({ inventoryId }) => inventoryId !== selected.inventoryId);
          throw new SessionError('quest-land-rejected', result.rejection);
        }
        current.encounter = result.encounter ? freezeQuestEncounter({ ...result.encounter, key: `${selected.inventoryId}:${slot}` }) : null;
        current.run = run;
        if (continuing) scene.lastOutcome = null;
        if (result.progress !== null) run.progress = result.progress;
        current.emptyTerrain = result.emptyTerrain;
        current.fixedGemTreasure = result.fixedGemTreasure ? Object.freeze(result.fixedGemTreasure) : null;
        current.cardTreasure = null;
        current.terrainReceivedAt = result.terrainReceivedAt;
        current.nextLands = null;
        if (result.finish) {
          current.finish = Object.freeze(result.finish);
          current.state = 'finished';
          reconcileQuestSettlement(selected, {
            inventoryId: selected.inventoryId, map: result.map,
            avatar: { exp: null, level: null, energy: null, gems: result.gemBalance },
          });
          publishAvatar();
        } else if (result.encounter) current.state = 'encounter';
        else {
          current.battle = null;
          void previousObserver?.stop('closed');
          if (opensPassage) {
            current.nextLands = passageNext;
            current.state = current.fixedGemTreasure ? 'terrain-reward' : 'between-lands';
          } else current.state = 'progress';
          current.nonCombatObserver = observeNonCombatTerrain(socket, selected, result, () => {
            current.state = 'uncertain';
            publishQuestScene(scene);
          });
          if (result.gemBalance !== null) {
            initialData.avatar.gems = result.gemBalance;
            publishAvatar();
          }
        }
        return { slot, encounter: current.encounter, progress: run.progress, finish: current.finish ?? null,
          ...(current.emptyTerrain ? { emptyTerrain: true } : {}),
          ...(current.fixedGemTreasure ? { fixedGemTreasure: current.fixedGemTreasure } : {}) };
      } catch (error) {
        if (continuing && current.battle === previousBattle && current.state !== 'finished') previousObserver.resume();
        if (dispatched && error.kind !== 'quest-land-rejected') {
          current.state = 'uncertain';
          throw new SessionError('quest-land-uncertain');
        }
        throw error;
      }
    });
  }

  async function confirmQuestSceneTerrainReward(scene, signal) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open' || !initialData) throw new SessionError('network');
    if (scene.operation) throw new SessionError('busy');
    const current = scene.adventure;
    if (current?.state === 'uncertain') throw new SessionError('quest-land-uncertain');
    if (current?.state !== 'terrain-reward' || !current.nextLands?.length) throw new SessionError('quest-land-unavailable');
    scene.channel.socket.assertOpen();
    current.state = 'between-lands';
    publishQuestScene(scene);
    return current.fixedGemTreasure ?? current.cardTreasure;
  }

  function matchesEncounter(current, key) {
    return current?.state === 'encounter' && (key === undefined ? current.slot < 3 : current.encounter?.key === key);
  }

  async function runQuestSceneBattle(scene, kind, signal, act, phaseKey, encounterKey) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open') throw new SessionError('network');
    const { adventure } = scene;
    if (!matchesEncounter(adventure, encounterKey)) throw new SessionError('quest-battle-unavailable');
    const combat = kind.startsWith('combat-');
    const expected = phaseKey === undefined ? (combat ? '1:1' : 1) : phaseKey;
    const matches = (battle) => kind === 'ready' || expected === (combat ? battle.exchange?.key : battle.ready?.turn);
    if (!matches(scene.snapshot.adventure.battle)) throw new SessionError('quest-battle-unavailable');
    const deadline = kind === 'commit' ? QUEST_MOVE_WAIT + 2 * TIMEOUT
      : kind === 'combat-commit' ? 2 * QUEST_COMBAT_WAIT + 7 * TIMEOUT : TIMEOUT;
    await runQuestSceneOperation(scene, `battle-${kind}`, signal, async (socket, questSignal) => {
      if (scene.adventure !== adventure || !matchesEncounter(adventure, encounterKey)
          || !matches(scene.snapshot.adventure.battle)) throw new SessionError('quest-battle-unavailable');
      await act(adventure.battle, questSignal);
      questSignal.throwIfAborted();
      socket.assertOpen();
      const battle = scene.snapshot.adventure.battle;
      if (matches(battle) && (battle.phase === 'uncertain' || (combat && battle.exchange?.phase === 'uncertain'))) {
        throw new SessionError('quest-battle-uncertain');
      }
    }, deadline);
    return scene.snapshot.adventure.battle;
  }

  async function runQuestSceneReward(scene, action, { signal, encounterKey, rewardRound, mapIndex } = {}, inventoryId) {
    const current = scene.adventure;
    return runQuestSceneOperation(scene, `battle-reward-${action}`, signal, (_, requestSignal) => {
      if (scene.adventure !== current || !matchesEncounter(current, encounterKey)) throw new SessionError('quest-reward-unavailable');
      return current.battle.rewardAction(action, requestSignal, rewardRound, { inventoryId, mapIndex });
    });
  }

  async function returnFromQuestSceneBattle(scene, signal, encounterKey) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open' || !initialData) throw new SessionError('network');
    const current = scene.adventure;
    if (scene.operation || current?.battle?.busy) throw new SessionError('busy');
    const outcome = current?.battle?.outcome;
    if (outcome?.state === 'uncertain') throw new SessionError('quest-return-uncertain');
    if (!outcome?.canReturn || !matchesEncounter(current, encounterKey)) throw new SessionError('quest-return-unavailable');
    scene.channel.socket.assertOpen();
    const { energy, energyMax } = initialData.avatar;
    scene.energyRefreshDue = scene.energyOwned && (energy === null || energyMax === null);
    if (outcome.state === 'land-cleared') {
      const treasure = outcome.receipt?.treasure;
      current.fixedGemTreasure = treasure?.type === QUEST_GEM_TREASURE_TYPE ? treasure : null;
      current.cardTreasure = treasure?.type === QUEST_OWN_CARD_TREASURE_TYPE ? treasure : null;
      current.nextLands = outcome.nextLands;
      current.state = current.fixedGemTreasure || current.cardTreasure ? 'terrain-reward' : 'between-lands';
      current.encounter = null;
      scene.lastOutcome = outcome;
      publishQuestScene(scene);
      return outcome;
    }
    const stopBattle = current.battle.stop('closed');
    scene.adventure = null;
    scene.lastOutcome = outcome;
    scheduleQuestDiscovery(scene);
    publishQuestScene(scene);
    await stopBattle;
    return outcome;
  }

  function scheduleQuestDiscovery(scene) {
    clearTimeout(scene.discoveryTimer);
    if (scene.state !== 'open' || scene.operation || activeSceneAdventure(scene) || !questData) return;
    let next;
    for (const row of questData.rows) {
      if (attemptedDiscoveries.has(row.inventoryId) || scene.failedDiscoveries.has(row.inventoryId)) continue;
      const dueAt = questDiscoveryDue(row, questData.receivedAt);
      if (dueAt !== null && (!next || dueAt < next.dueAt)) next = { row, dueAt };
    }
    if (!next) return;
    const { row, dueAt } = next;
    scene.discoveryTimer = setTimeout(() => {
      if (scene.state !== 'open' || scene.operation) return;
      if (performance.now() < dueAt) {
        scheduleQuestDiscovery(scene);
        return;
      }
      void runQuestSceneOperation(scene, 'discovery', undefined, async (socket, signal) => {
        const update = await sendQuestDiscovery(socket, signal, row.inventoryId, () => {
          attemptedDiscoveries.add(row.inventoryId);
        });
        signal.throwIfAborted();
        if (!update) return;
        const index = questData.rows.indexOf(row);
        if (index >= 0) questData.rows[index] = update;
      }).catch(() => {
        scene.failedDiscoveries.add(row.inventoryId);
      });
    }, Math.max(0, Math.min(MAX_TIMER_DELAY, dueAt - performance.now())));
  }

  async function searchQuestScene(scene, mapId, timerIndex, signal) {
    if (signal?.aborted) throw new SessionError('cancelled');
    if (questScene !== scene || scene.state !== 'open' || !initialData) throw new SessionError('network');
    if (scene.operation) throw new SessionError('busy');
    if (activeSceneAdventure(scene)) throw new SessionError('quest-adventure-active');
    if (searchUncertain) throw new SessionError('search-uncertain');
    const tutorialFlag = initialData.tutorialQuestProgress?.tutorialQuestFlag;
    const ordinary = mapId >= 1 && mapId <= Math.min(questData.questFlag + 1, LAST_ORDINARY_SEARCH_MAP);
    const tutorial = mapId >= FIRST_TUTORIAL_SEARCH_MAP && mapId <= Math.min(tutorialFlag + 1, LAST_TUTORIAL_SEARCH_MAP);
    if (!Number.isInteger(mapId) || (!ordinary && !tutorial)
        || !Number.isInteger(timerIndex) || timerIndex < 0 || timerIndex > MAX_QUEST_SEARCH_TIMER) {
      throw new SessionError('search-unavailable');
    }
    return runQuestSceneOperation(scene, 'search', signal, async (socket, questSignal) => {
      const known = new Set(questData.rows.map(({ inventoryId }) => inventoryId));
      const alreadyOwnedEnergy = scene.energyOwned;
      try {
        const result = await sendQuestSearch(socket, questSignal, mapId, timerIndex, known, () => {
          searchUncertain = true;
          ownQuestEnergy(scene);
        });
        questSignal.throwIfAborted();
        if (result.rejection !== undefined) {
          searchUncertain = false;
          scene.energyOwned = alreadyOwnedEnergy;
          throw new SessionError('search-rejected', result.rejection);
        }
        if (questData.rows.length >= MAX_QUEST_ROWS) throw new SessionError('search-uncertain');
        const { row, energy: { energy, remainingSeconds, receivedAt } } = result;
        questData.rows.push(row);
        Object.assign(initialData.avatar, { energy, energyRemainingSeconds: remainingSeconds, energyReceivedAt: receivedAt });
        searchUncertain = false;
        publishAvatar();
        const dueAt = questDiscoveryDue(row, questData.receivedAt);
        return { row: Object.freeze(dueAt === null ? { ...row } : { ...row, dueAt }), energy };
      } catch (error) {
        if (searchUncertain) throw new SessionError('search-uncertain');
        throw error;
      }
    });
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

  function reconcileQuestRewards(receipt) {
    const avatar = initialData?.avatar;
    const deltas = { exp: null, gems: null, level: null };
    if (!avatar) return deltas;

    for (const { inventoryId } of receipt.cards ?? []) confirmedQuestAwards.add(inventoryId);
    const nextLevel = receipt.avatar.level;
    const leveled = nextLevel !== null && nextLevel !== avatar.level;
    if (questScene?.energyOwned && (leveled || receipt.avatar.energy !== null)) ownQuestEnergy(questScene);
    if (leveled) {
      // check_level_up can refill AP without an update. It can also leave the cap unchanged,
      // in which case the subsequent Lobby refresh only needs to report current AP.
      const capUnchanged = Number.isInteger(avatar.level) && Number.isInteger(nextLevel)
        && avatar.level >= 1 && nextLevel > avatar.level && nextLevel <= ENERGY_CAP_GROWTH_LEVELS.at(-1)
        && !ENERGY_CAP_GROWTH_LEVELS.some((level) => level > avatar.level && level <= nextLevel);
      avatar.energy = null;
      avatar.energyRemainingSeconds = null;
      avatar.energyReceivedAt = null;
      if (verifiedLobbyCap?.level === nextLevel) avatar.energyMax = verifiedLobbyCap.energyMax;
      else if (!capUnchanged) avatar.energyMax = null;
    }
    for (const field of Object.keys(deltas)) {
      const absolute = receipt.avatar[field];
      if (absolute === null) continue;
      if (Number.isInteger(avatar[field])) deltas[field] = absolute - avatar[field];
      avatar[field] = absolute;
    }
    if (receipt.avatar.energy !== null) avatar.energy = receipt.avatar.energy;
    return deltas;
  }

  function reconcileSceneLandProgress(scene, current, receipt) {
    const row = questData?.rows.find(({ inventoryId }) => inventoryId === receipt.inventoryId);
    const deck = initialData?.deckChoices?.find(({ index }) => index === receipt.deckIndex);
    if (questScene !== scene || scene.adventure !== current || current.state !== 'encounter'
        || row?.status !== QUEST_IN_PROGRESS || row.questId !== receipt.questId || row.deckIndex !== receipt.deckIndex
        || deck?.status !== 1 || boundQuestDecks.get(receipt.inventoryId)?.index !== receipt.deckIndex) {
      throw new SessionError('protocol');
    }
    const deltas = reconcileQuestRewards(receipt);
    publishAvatar();
    return { ...receipt, deltas, deckRestored: null };
  }

  function reconcileQuestSettlement(selected, receipt) {
    const avatar = initialData?.avatar;
    const deltas = reconcileQuestRewards(receipt);
    let deckRestored = null;
    if (!questData || !avatar) return { ...receipt, deltas, deckRestored };
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
      updateQuestDeckStatus(deck.index, 0); // Original CDS_NONE after a verified Quest finish.
      deckRestored = { ...deck };
    }
    return { ...receipt, deltas, deckRestored };
  }

  const timer = setInterval(async () => {
    maintainQuestScene();
    maintainAdventure();
    try {
      const replies = await Promise.all([
        auth.ask(6, [], [7], { allowOther: true }),
        ...channels.map((channel) => {
          const { socket, pong } = channel;
          if (profileRequest?.channel === channel || channel.heartbeat) return null;
          const heartbeat = socket.ask(3, [], [pong], { allowOther: true }).finally(() => {
            if (channel.heartbeat === heartbeat) channel.heartbeat = null;
          });
          channel.heartbeat = heartbeat;
          return heartbeat;
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
      if (!initialData?.avatar || profileRequest || questRequest || questReturn) return false;
      if (questScene?.energyOwned) {
        if (!canRefreshSceneEnergy(questScene)) return false;
        if (!lobbyRefresh) return sendLobbyRefresh(questScene);
        if (!lobbyRefresh.scene) queuedEnergyRefresh = questScene;
        return false;
      }
      if (now - lastLobbyRefresh < LOBBY_REFRESH_INTERVAL) return false;
      return sendLobbyRefresh();
    },
    checkLobbyAchievements({ signal, onBatchReady } = {}) {
      if (!(signal instanceof AbortSignal) || signal.aborted || checkedLobbyShows.has(signal) || !initialData?.avatar
        || !lobby.verified || profileRequest || questRequest || questReturn || questScene || adventure) return false;
      try {
        auth.assertOpen();
        lobby.socket.send(LOBBY_ACHIEVEMENT_CHECK, [signedByte(1)]);
        checkedLobbyShows.add(signal);
        if (typeof onBatchReady === 'function') finishLobbyAchievementBatch(signal, onBatchReady);
        return true;
      } catch {
        return false;
      }
    },
    subscribeLobbyAchievementEvents(listener, { signal } = {}) {
      if (!initialData || signal?.aborted || typeof listener !== 'function') return () => {};
      const subscription = {
        listener,
        unsubscribe() {
          lobbyAchievementSubscriptions.delete(subscription);
          signal?.removeEventListener('abort', subscription.unsubscribe);
        },
      };
      lobbyAchievementSubscriptions.add(subscription);
      signal?.addEventListener('abort', subscription.unsubscribe, { once: true });
      for (const receipt of [...pendingLobbyAchievements]) {
        if (!lobbyAchievementSubscriptions.has(subscription)) break;
        if (pendingLobbyAchievements.has(receipt)) notifyLobbyListener(listener, receipt);
      }
      return subscription.unsubscribe;
    },
    acknowledgeLobbyAchievement(receipt) {
      return (receipt?.kind === 'achievement' || receipt?.kind === 'new-achievement')
        && pendingLobbyAchievements.delete(receipt);
    },
    getLobbyAchievementOptions(receipt) {
      return lobbyRewardEntry(receipt)?.offer.choices ?? null;
    },
    getLobbyAchievementRewardState(receipt) {
      return lobbyRewardEntry(receipt)?.state ?? 'unavailable';
    },
    claimLobbyAchievementReward(receipt, selectionIndex, { signal } = {}) {
      return claimLobbyReward(receipt, selectionIndex, signal);
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
          knownQuestItems = readItemInventory(questData);
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
    async openQuestScene({ signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      if (!initialData.avatar || !questData) throw new SessionError('protocol');

      let scene;
      try {
        return await readFromQuest(async (socket, confirm, questSignal, channel) => {
          scene = { channel, state: 'opening', subscriptions: new Set(), failedDiscoveries: new Set(), senders: new Map() };
          questScene = scene;
          channel.retained = true;
          return readQuestInventoryPushes(socket, confirm, questSignal, { sceneChannel: channel });
        }, signal, (liveRows) => {
          const { socket } = scene.channel;
          socket.assertOpen();
          const rows = mergeQuestSceneRows(questData.rows, liveRows.map(({ senderName, ...row }) => {
            if (senderName) scene.senders.set(row.inventoryId, { questId: row.questId, name: senderName });
            return row;
          }));
          for (const row of liveRows) {
            if (questConfirmations.get(row.inventoryId) === row.questId) questConfirmations.delete(row.inventoryId);
          }
          questData.rows = rows;
          scene.state = 'open';
          publishQuestScene(scene);
          scheduleQuestDiscovery(scene);
          return {
            get snapshot() { return scene.snapshot; },
            subscribe(listener, { signal } = {}) {
              if (scene.state !== 'open' || signal?.aborted || typeof listener !== 'function') return () => {};
              const subscription = {
                listener,
                unsubscribe() {
                  scene.subscriptions.delete(subscription);
                  signal?.removeEventListener('abort', subscription.unsubscribe);
                },
              };
              scene.subscriptions.add(subscription);
              signal?.addEventListener('abort', subscription.unsubscribe, { once: true });
              return subscription.unsubscribe;
            },
            search: (mapId, timerIndex, { signal } = {}) => searchQuestScene(scene, mapId, timerIndex, signal),
            acknowledge: (inventoryId, { signal } = {}) => acknowledgeQuestScene(scene, inventoryId, signal),
            selectDeck: (delta, { signal } = {}) => selectQuestSceneDeck(scene, delta, signal),
            start: (inventoryId, { signal } = {}) => startQuestScene(scene, inventoryId, signal),
            enterLand: (slot, { signal } = {}) => enterQuestSceneLand(scene, slot, signal),
            confirmTerrainReward: ({ signal } = {}) => confirmQuestSceneTerrainReward(scene, signal),
            readyBattle: ({ signal, encounterKey } = {}) => runQuestSceneBattle(scene, 'ready', signal,
              (battle, active) => battle.ready(active), undefined, encounterKey),
            async chooseMove(direction, { signal, moveTurn, encounterKey } = {}) {
              if (!Number.isInteger(direction) || direction < -1 || direction > 1) throw new SessionError('protocol');
              return runQuestSceneBattle(scene, 'direction', signal, (battle, active) => battle.choose(direction, active), moveTurn, encounterKey);
            },
            async rotateMoveCard(cardId, { signal, moveTurn, encounterKey } = {}) {
              if (!validQuestCardId(cardId)) throw new SessionError('quest-card-unavailable');
              return runQuestSceneBattle(scene, 'rotate', signal, (battle, active) => battle.rotateMoveCard(cardId, active), moveTurn, encounterKey);
            },
            async addMoveCard(cardId, { signal, moveTurn, encounterKey } = {}) {
              if (!validQuestCardId(cardId)) throw new SessionError('quest-card-unavailable');
              return runQuestSceneBattle(scene, 'add', signal, (battle, active) => battle.addCard(cardId, undefined, active), moveTurn, encounterKey);
            },
            async removeMoveCard(cardId, { signal, moveTurn, encounterKey } = {}) {
              if (!validQuestCardId(cardId)) throw new SessionError('quest-card-unavailable');
              return runQuestSceneBattle(scene, 'remove', signal, (battle, active) => battle.removeCard(cardId, active), moveTurn, encounterKey);
            },
            commitMove: ({ signal, moveTurn, encounterKey } = {}) => runQuestSceneBattle(scene, 'commit', signal,
              (battle, active) => battle.commit(active), moveTurn, encounterKey),
            async addBattleCard(cardId, { signal, exchangeKey, encounterKey } = {}) {
              if (!validQuestCardId(cardId)) throw new SessionError('quest-card-unavailable');
              return runQuestSceneBattle(scene, 'combat-add', signal, (battle, active) => battle.addBattleCard(cardId, undefined, active), exchangeKey, encounterKey);
            },
            async removeBattleCard(cardId, { signal, exchangeKey, encounterKey } = {}) {
              if (!validQuestCardId(cardId)) throw new SessionError('quest-card-unavailable');
              return runQuestSceneBattle(scene, 'combat-remove', signal, (battle, active) => battle.removeBattleCard(cardId, active), exchangeKey, encounterKey);
            },
            async rotateBattleCard(cardId, { signal, exchangeKey, encounterKey } = {}) {
              if (!validQuestCardId(cardId)) throw new SessionError('quest-card-unavailable');
              return runQuestSceneBattle(scene, 'combat-rotate', signal, (battle, active) => battle.rotateBattleCard(cardId, active), exchangeKey, encounterKey);
            },
            commitBattle: ({ signal, exchangeKey, encounterKey } = {}) => runQuestSceneBattle(scene, 'combat-commit', signal,
              (battle, active) => battle.commitBattle(active), exchangeKey, encounterKey),
            nextBattleReward: (options) => runQuestSceneReward(scene, 'next', options),
            guessBattleReward: async (direction, options) => {
              if (direction !== 'high' && direction !== 'low') throw new SessionError('quest-reward-unavailable');
              return runQuestSceneReward(scene, direction, options);
            },
            takeBattleReward: (options) => runQuestSceneReward(scene, 'take', options),
            useBattleRewardItem: (inventoryId, options) => runQuestSceneReward(scene, 'item', options, inventoryId),
            returnFromBattle: ({ signal, encounterKey } = {}) => returnFromQuestSceneBattle(scene, signal, encounterKey),
            close: () => closeQuestScene(scene),
            closed: socket.closed.then(async (reason) => {
              if (scene.closeTask) return scene.closeTask.then(() => 'closed', () => 'network');
              scene.state = 'return-uncertain';
              disposeQuestSceneOperations(scene, 'network');
              await stopQuestSceneAdventure(scene, 'network');
              return scene.failure ?? reason;
            }),
          };
        }, (reply) => receiveQuestItemGrant(scene, reply));
      } catch (error) {
        if (scene) await closeQuestScene(scene);
        throw error;
      }
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
            const started = applyQuestStart(index, selected, deck, result);
            return { ...started, row: { ...started.row } };
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
  const startupLobbyEvents = [];
  let lobbyStartupComplete = false;
  let publishLobbyAvatar = (patch, command, marker, event) => {
    Object.assign(startupAvatarPatch, patch);
    if (command === LOBBY_DECK_LEVEL_REPLY) lobbyStartupComplete = true;
    if (event && event.kind !== 'gems') startupLobbyEvents.push(event);
  };
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
      let onPushedReply;
      if (port === LOBBY_PORT) {
        onPushedReply = (reply) => channel.verified && observeLobbyAvatar(reply, publishLobbyAvatar);
      } else if (port === DATA_PORT) {
        onPushedReply = () => {
          if (channel.waitingForProfile) throw new SessionError('protocol');
          return false;
        };
      }
      channel.socket = new SessionSocket(port, rejectStartup, onPushedReply);
      channels.push(channel);
      const data = await confirmChannel(channel, playerId, sessionKeyBytes, startupSignal,
        (event) => startupLobbyEvents.push(event));
      if (data) initialData = data;
    }
    startupSignal.throwIfAborted();
    auth.assertOpen();
    for (const { socket } of channels) socket.assertOpen();
    finishStartup();
    if (initialData.avatar) Object.assign(initialData.avatar, startupAvatarPatch);
    return activeSession(auth, channels, playerId, sessionKeyBytes, initialData, (receiver) => {
      publishLobbyAvatar = receiver;
    }, lobbyStartupComplete, startupLobbyEvents);
  } catch (error) {
    finishStartup();
    sessionKeyBytes?.fill(0);
    await closeSession(auth, channels);
    throw error instanceof SessionError ? error : new SessionError('protocol');
  }
}
