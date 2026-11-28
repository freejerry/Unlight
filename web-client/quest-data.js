const MAX_ID_LIST_BYTES = 4096;
const MAX_PART_LIST_BYTES = 64 * 1024;
const MAX_CARD_LIST_BYTES = 1024 * 1024;
const MIN_INT32 = -0x80000000;
const MAX_INT32 = 0x7fffffff;
const MAX_SENDER_NAME_BYTES = 128;
const MAX_DIALOGUE_BYTES = 64 * 1024;
const MAX_DECK_INDEX = 127;
const LAND_SLOT_COUNT = 15;
const MAX_LAND_PROGRESS = (1 << LAND_SLOT_COUNT) - 1;
const ROSTER_SLOT_COUNT = 3;
const FEAT_SLOT_COUNT = 4;
const MAX_FEAT_EFFECT_NUMBER = 447; // Original CharaCardEvent effect numbers.
const MAX_FEAT_CONDITION_BYTES = 256;
const REFILL_ORIENTATION_BITS = 32;
const NEW_STATUS = 0;
const PENDING_STATUS = 4;
const SEARCH_BASE_SECONDS = [0, 180, 600, 1800, 3600, 7200, 14400, 28800, 57600, 86400, 259200]; // Ruby QFT_SET.
const EQUIPPED_PART = 1; // Original PartInventory APS_USED bit.
const MAX_FREE_DUEL_COUNT = 3; // Original FREE_DUEL_COUNT and FreeDuelCountImage frames.
const text = new TextDecoder('utf-8', { fatal: true });

export const QUEST_MAP_REQUEST = 6;
export const QUEST_ITEM_USE_REQUEST = 7;
export const QUEST_MAP_REPLY = 14;
export const QUEST_INVENTORY_REPLY = 6;
export const QUEST_DISCOVERY_REQUEST = 17;
export const QUEST_DISCOVERY_REPLY = 17;
export const QUEST_SEARCH_REQUEST = 5;
export const QUEST_SEARCH_REPLY = QUEST_INVENTORY_REPLY;
export const QUEST_SEARCH_TIMER = 1;
export const MAX_QUEST_SEARCH_TIMER = SEARCH_BASE_SECONDS.length - 1;
export const QUEST_ENERGY_REPLY = 4;
export const QUEST_EXP_REPLY = 7;
export const QUEST_LEVEL_REPLY = 8;
export const QUEST_GEMS_REPLY = 10;
export const QUEST_ITEM_GRANTED_REPLY = 11;
export const QUEST_PART_GRANTED_REPLY = 133;
export const QUEST_CHARACTER_AWARD_REPLY = 13;
export const QUEST_MAP_FLAG_REPLY = 26;
export const QUEST_MAP_CLEAR_COUNT_REPLY = 28;
export const QUEST_ERROR_REPLY = 29;
export const QUEST_CONFIRM_REQUEST = 12;
export const QUEST_START_REQUEST = 13;
export const QUEST_DELETED_REPLY = 22;
export const QUEST_NEXT_LAND_REQUEST = 16;
export const QUEST_NEXT_LAND_REPLY = 128;
export const QUEST_PROGRESS_REPLY = 19;
export const QUEST_DECK_STATE_REPLY = 20;
export const QUEST_FINISH_REPLY = 24;
export const QUEST_TREASURE_REPLY = 25;
export const QUEST_ENCOUNTER_REPLY = 37;
export const QUEST_DUEL_START_REPLY = 40;
export const QUEST_DUEL_FINISH_REPLY = 41;
export const QUEST_READY_REQUEST = 22;
export const QUEST_DIRECTION_REQUEST = 23;
export const QUEST_MOVE_CARD_ADD_REQUEST = 24;
export const QUEST_MOVE_CARD_REMOVE_REQUEST = 25;
export const QUEST_MOVE_COMMIT_REQUEST = 26;
export const QUEST_ATTACK_CARD_ADD_REQUEST = 28;
export const QUEST_ATTACK_CARD_REMOVE_REQUEST = 29;
export const QUEST_DEFENCE_CARD_ADD_REQUEST = 30;
export const QUEST_DEFENCE_CARD_REMOVE_REQUEST = 31;
export const QUEST_ATTACK_DONE_REQUEST = 33;
export const QUEST_DEFENCE_DONE_REQUEST = 34;
export const QUEST_CHARA_CHANGE_REQUEST = 35;
export const QUEST_REWARD_HIGH_REQUEST = 36;
export const QUEST_REWARD_LOW_REQUEST = 37;
export const QUEST_REWARD_TAKE_REQUEST = 38;
export const QUEST_REWARD_NEXT_REQUEST = 39;
export const QUEST_REWARD_AWARD_REPLY = 38;
export const QUEST_TURN_REPLY = 43;
export const QUEST_ACTION_REFILL_REPLY = 44;
export const QUEST_EVENT_REFILL_REPLY = 45;
export const QUEST_MOVE_PHASE_START_REPLY = 46;
export const QUEST_MOVE_PHASE_FINISH_REPLY = 47;
export const QUEST_MOVE_RESULT_REPLY = 48;
export const QUEST_CHARA_CHANGE_START_REPLY = 49;
export const QUEST_CHARA_CHANGE_FINISH_REPLY = 50;
export const QUEST_ATTACK_PHASE_START_REPLY = 51;
export const QUEST_ATTACK_PHASE_FINISH_REPLY = 52;
export const QUEST_DEFENCE_PHASE_START_REPLY = 53;
export const QUEST_DEFENCE_PHASE_FINISH_REPLY = 54;
export const QUEST_BATTLE_CARDS_REPLY = 55;
export const QUEST_BATTLE_DICE_REPLY = 56;
export const QUEST_DEAD_CHARA_CHANGE_REPLY = 57;
export const QUEST_DEAD_CHARA_CHANGE_FINISH_REPLY = 58;
export const QUEST_TURN_FINISH_REPLY = 59;
export const QUEST_DIRECTION_REPLY = 60;
export const QUEST_MOVE_CARD_ADD_REPLY = 61;
export const QUEST_MOVE_CARD_REMOVE_REPLY = 62;
export const QUEST_BATTLE_CARD_ADD_REPLY = 65;
export const QUEST_BATTLE_CARD_REMOVE_REPLY = 66;
export const QUEST_CHARA_CHANGE_REPLY = 72;
export const QUEST_DAMAGE_REPLY = 73;
export const QUEST_POINT_REWRITE_REPLY = 83;
export const QUEST_FEAT_REPLACEMENT_REPLY = 109;
export const QUEST_FEAT_CONDITION_REPLY = 120;
const QUEST_FEAT_SEALED_REPLY = 81;
const QUEST_FEAT_ON_REPLY = 107;
const QUEST_FEAT_OFF_REPLY = 108;
const QUEST_FEAT_USED_REPLY = 110;
export const QUEST_FEAT_REPLIES = [
  QUEST_FEAT_SEALED_REPLY, QUEST_FEAT_ON_REPLY, QUEST_FEAT_OFF_REPLY, QUEST_FEAT_USED_REPLY,
];
export const QUEST_CHARA_REVIVE_REPLY = 75;
export const QUEST_HIT_POINT_REPLY = 79;
export const QUEST_CHARA_TRANSFORM_REPLY = 112;
export const QUEST_REWARD_CANDIDATES_REPLY = 122;
export const QUEST_REWARD_BASE_DICE_REPLY = 123;
export const QUEST_REWARD_DECISION_REPLY = 124;
export const QUEST_REWARD_ROLLED_DICE_REPLY = 125;
export const QUEST_REWARD_FINAL_REPLY = 126;
export const QUEST_ITEM_CONSUMED_REPLY = 127;

const PARTY_DAMAGE_REPLY = 74;
const HEAL_REPLY = 77;
const PARTY_HEAL_REPLY = 78;
export const QUEST_ROSTER_HP_REPLIES = Object.freeze([
  QUEST_DAMAGE_REPLY, PARTY_DAMAGE_REPLY, QUEST_CHARA_REVIVE_REPLY, HEAL_REPLY, PARTY_HEAL_REPLY, QUEST_HIT_POINT_REPLY,
]);

const CARD_ROTATE_REPLIES = [63, 64];
const CARD_REMOVE_REPLIES = [84, 85, 86];
const CARD_STEAL_REPLY = 89;
const CARD_DEAL_REPLIES = [87, 88, CARD_STEAL_REPLY, 90];
export const QUEST_HAND_EFFECT_REPLIES = Object.freeze([...CARD_ROTATE_REPLIES, ...CARD_REMOVE_REPLIES, ...CARD_DEAL_REPLIES]);

const skipString = {};
const skipStrings = (count) => Array(count).fill(skipString);
const skipGroup = (count) => [4, ...skipStrings(count)];
const optionalList = (key, limit = MAX_ID_LIST_BYTES) => ({ key, limit, optional: true });
const settlementFields = {
  [QUEST_EXP_REPLY]: 'exp',
  [QUEST_LEVEL_REPLY]: 'level',
  [QUEST_GEMS_REPLY]: 'gems',
  [QUEST_MAP_FLAG_REPLY]: 'questFlag',
  [QUEST_MAP_CLEAR_COUNT_REPLY]: 'questClearNum',
};

// Order from DataCommand.scAvatarInfo. Length-prefixed fields can span inflated chunks.
const questFields = [
  4, skipString, 11 * 4, // Avatar header.
  { key: 'partCount', width: 4 }, optionalList('partInventoryIds', MAX_PART_LIST_BYTES),
  optionalList('partIds', MAX_PART_LIST_BYTES), optionalList('partUsage', MAX_PART_LIST_BYTES),
  optionalList('partTimes', MAX_PART_LIST_BYTES),
  { key: 'itemCount', width: 4 }, optionalList('itemInventoryIds', MAX_CARD_LIST_BYTES),
  optionalList('itemIds', MAX_CARD_LIST_BYTES), optionalList('itemStates', MAX_CARD_LIST_BYTES),
  { key: 'deckCount', width: 4 }, optionalList('deckNames'), ...skipStrings(3),
  optionalList('deckStatuses'), ...skipStrings(2),
  { key: 'cardCount', width: 4 }, optionalList('cardInventoryIds', MAX_CARD_LIST_BYTES),
  optionalList('cardIds', MAX_CARD_LIST_BYTES),
  optionalList('cardDeckIndices', MAX_CARD_LIST_BYTES), optionalList('cardPositions', MAX_CARD_LIST_BYTES),
  ...skipGroup(8), // Equipped slots.
  { key: 'capacity', width: 1 },
  { key: 'count', width: 1 },
  { key: 'inventoryIds' },
  { key: 'questIds' },
  { key: 'statuses' },
  { key: 'findTimes', signed: true },
  skipString, // Sender names.
  { key: 'questFlag', width: 4 },
  { key: 'questClearNum', width: 4 },
];
const fields = [
  ...questFields,
  { key: 'friendMax', width: 4 }, { key: 'partMax', width: 4 }, { key: 'freeDuelCount', width: 1 },
  3 * 4, { key: 'currentDeck', width: 1 }, // Original exp, gem and Quest find power, then current_deck.
  1 + 5 * 4, // Sale type/time, favorite character, tower floor, and event flag/count.
  { key: 'tutorialQuestFlag', width: 4 },
  { key: 'tutorialQuestClearNum', width: 4 },
];

function integerList(csv, signed = false) {
  if (csv === '') return [];
  const pattern = signed ? /^-?\d+(?:,-?\d+)*$/ : /^\d+(?:,\d+)*$/;
  if (!pattern.test(csv)) throw new Error('Invalid quest list.');
  const list = csv.split(',').map(Number);
  if (!list.every(Number.isSafeInteger)) throw new Error('Quest list value exceeds bounds.');
  return list;
}

function readPhysicalParts({ partCount, partInventoryIds, partIds, partUsage }) {
  if (!Number.isInteger(partCount) || partCount < 0 || [partInventoryIds, partIds, partUsage].includes(undefined)) {
    return null;
  }
  const inventoryIds = integerList(partInventoryIds);
  const ids = integerList(partIds);
  const usage = integerList(partUsage);
  if ([inventoryIds, ids, usage].some((list) => list.length !== partCount)
    || new Set(inventoryIds).size !== partCount
    || [inventoryIds, ids].some((list) => list.some((id) => id <= 0 || id > MAX_INT32))
    || usage.some((bits) => bits > MAX_INT32)) {
    return null;
  }
  return { inventoryIds, ids, usage };
}

function readAvatarPartRows(values, receivedAt) {
  const parts = readPhysicalParts(values);
  if (!parts || values.partTimes === undefined) return null;
  const remaining = integerList(values.partTimes, true);
  if (remaining.length !== parts.ids.length || remaining.some(seconds => seconds < MIN_INT32 || seconds > MAX_INT32)) return null;
  return Object.freeze(parts.inventoryIds.map((inventoryId, index) => Object.freeze({
    inventoryId, partId: parts.ids[index], used: parts.usage[index], remainingSeconds: remaining[index], receivedAt,
  })));
}

function readOwnedItems({ itemCount, itemInventoryIds, itemIds, itemStates }) {
  if (itemCount < 0 || [itemInventoryIds, itemIds, itemStates].includes(undefined)) return null;
  try {
    const inventoryIds = integerList(itemInventoryIds);
    const ids = integerList(itemIds);
    const states = integerList(itemStates);
    if ([inventoryIds, ids, states].some((list) => list.length !== itemCount)
        || new Set(inventoryIds).size !== itemCount
        || [inventoryIds, ids].some((list) => list.some((id) => id < 1 || id > MAX_INT32))
        || states.some((state) => state > 1)) return null;
    return Object.freeze(inventoryIds.map((inventoryId, index) => Object.freeze({
      inventoryId, itemId: ids[index], state: states[index],
    })));
  } catch {
    return null;
  }
}

function readDeckLists(values) {
  const { deckCount, deckNames, deckStatuses, cardCount, cardIds, cardDeckIndices, cardPositions } = values;
  if (deckCount < 2 || deckCount > MAX_DECK_INDEX + 1 || cardCount < 0
    || [deckNames, deckStatuses, cardIds, cardDeckIndices, cardPositions].some((list) => list === undefined)) {
    return null;
  }
  const names = deckNames.split(',');
  const statuses = integerList(deckStatuses);
  const ids = integerList(cardIds);
  const indices = integerList(cardDeckIndices);
  const positions = integerList(cardPositions, true);
  if (names.length !== deckCount || statuses.length !== deckCount
    || ids.length !== cardCount || indices.length !== cardCount || positions.length !== cardCount
    || indices.some((index) => index >= deckCount)) {
    return null;
  }
  return { names, statuses, ids, indices, positions };
}

function readyQuestDecks(values) {
  if (values.cardCount < 1) return [];
  const lists = readDeckLists(values);
  if (!lists) return [];
  const { names, statuses, ids, indices, positions } = lists;
  const deckChoices = new Set();
  for (let card = 0; card < ids.length; card += 1) {
    const index = indices[card];
    // The original start action requires a character in the selected deck's first position.
    if (index > 0 && positions[card] === 0 && ids[card] > 0 && ids[card] <= MAX_INT32 && statuses[index] === 0) {
      deckChoices.add(index);
    }
  }
  return names.flatMap((name, index) => deckChoices.has(index) ? [{ index, name }] : []);
}

function readOwnedCardLists(values) {
  const lists = readDeckLists(values);
  if (!lists || values.cardInventoryIds === undefined) return null;
  const inventoryIds = integerList(values.cardInventoryIds);
  if (inventoryIds.length !== lists.ids.length || new Set(inventoryIds).size !== lists.ids.length
    || inventoryIds.some((id) => id <= 0 || id > MAX_INT32)
    || lists.ids.some((id) => id <= 0 || id > MAX_INT32)) {
    return null;
  }
  return { ...lists, inventoryIds };
}

function ownedDeckCards({ ids, indices, positions, inventoryIds }, index) {
  const cards = [];
  const deckPositions = new Set();
  for (let i = 0; i < ids.length; i += 1) {
    if (indices[i] !== index) continue;
    const position = positions[i];
    if (position < 0 || position > MAX_INT32 || deckPositions.has(position)) return null;
    deckPositions.add(position);
    cards.push(Object.freeze({ inventoryId: inventoryIds[i], cardId: ids[i], position }));
  }
  cards.sort((left, right) => left.position - right.position);
  return Object.freeze(cards);
}

function ownedDeckCollection(values) {
  const lists = readOwnedCardLists(values);
  if (!lists || lists.statuses[1] > MAX_INT32) return null;
  const cards = ownedDeckCards(lists, 1);
  if (!cards) return null;
  const binder = lists.inventoryIds.flatMap((inventoryId, i) => lists.indices[i] === 0
    ? [Object.freeze({ inventoryId, cardId: lists.ids[i] })] : []);
  return Object.freeze({
    binder: Object.freeze(binder),
    deck: Object.freeze({ index: 1, name: lists.names[1], status: lists.statuses[1], cards }),
  });
}

function selectedDeck(values) {
  const index = values.currentDeck;
  if (!Number.isInteger(index) || index < 1) return null;
  const lists = readOwnedCardLists(values);
  if (!lists || index >= lists.names.length) return null;
  const cards = ownedDeckCards(lists, index);
  return cards ? Object.freeze({ index, name: lists.names[index], cards }) : null;
}

function physicalDecks(values) {
  const lists = readOwnedCardLists(values);
  if (!lists || lists.statuses.some((status) => status > MAX_INT32)) return null;
  const decks = [];
  for (let index = 1; index < lists.names.length; index += 1) {
    const cards = ownedDeckCards(lists, index);
    if (!cards) return null;
    decks.push(Object.freeze({ index, name: lists.names[index], status: lists.statuses[index], cards }));
  }
  return Object.freeze(decks);
}

export function readQuestMapReply(reply, region) {
  if (reply.command !== QUEST_MAP_REPLY || reply.int() !== region) {
    throw new Error('Unexpected quest map reply.');
  }
  const ids = integerList(reply.string(MAX_ID_LIST_BYTES));
  reply.done();
  if (ids.some((id) => id === 0 || id > MAX_INT32)) throw new Error('Invalid quest map ID.');
  return ids;
}

function questInventoryRow(inventoryId, questId, status) {
  if (inventoryId <= 0 || questId < 0 || status < 0 || status > 6) {
    throw new Error('Invalid quest inventory data.');
  }
  return { inventoryId, questId, status };
}

function readQuestGetReply(reply, includeSender = false) {
  if (reply.command !== QUEST_INVENTORY_REPLY) throw new Error('Unexpected quest inventory reply.');
  const inventoryId = reply.int();
  const questId = reply.int();
  const timer = reply.int();
  const power = reply.int();
  const status = reply.byte();
  const row = questInventoryRow(inventoryId, questId, status);
  if (includeSender) {
    // The original inventory strips the rename suffix and hides the sentinel “n”.
    const senderName = reply.string(MAX_SENDER_NAME_BYTES, true).replace('_rename', '');
    if (senderName && senderName !== 'n') row.senderName = senderName;
  } else {
    reply.discardString(MAX_SENDER_NAME_BYTES, true);
  }
  reply.done();
  return { row, timer, power };
}

export function readQuestInventoryReply(reply, { loginReplay = false, includeSender = false } = {}) {
  const { row, timer, power } = readQuestGetReply(reply, includeSender);
  if (loginReplay && (timer !== 0 || power !== 100 || row.status === PENDING_STATUS)) {
    throw new Error('Invalid Quest login replay.');
  }
  return row;
}

export function readQuestSearchReply(reply, timerIndex = QUEST_SEARCH_TIMER) {
  const { row, timer, power } = readQuestGetReply(reply);
  // Capacity rejections can resend untimed inventory rows before the error.
  if (timer === 0) return timerIndex === 0 && row.questId > 0 && row.status === NEW_STATUS && power === 100 ? row : null;
  const baseSeconds = SEARCH_BASE_SECONDS[timer];
  if (!baseSeconds || timer !== timerIndex || row.questId !== 0 || row.status !== NEW_STATUS || power < 1) {
    throw new Error('Invalid quest search reply.');
  }
  const findSeconds = Math.floor(baseSeconds * power / 100);
  if (findSeconds > MAX_INT32) throw new Error('Invalid quest search reply.');
  return { ...row, status: PENDING_STATUS, findSeconds };
}

export function readQuestEnergyReply(reply) {
  if (reply.command !== QUEST_ENERGY_REPLY) throw new Error('Unexpected quest energy reply.');
  const energy = reply.int();
  const remainingSeconds = reply.int();
  reply.done();
  if (energy < 0 || remainingSeconds < 0) throw new Error('Invalid quest energy reply.');
  return { energy, remainingSeconds };
}

export function readQuestSettlementValueReply(reply) {
  const field = settlementFields[reply.command];
  if (!field) throw new Error('Unexpected quest settlement value reply.');
  const value = reply.int();
  reply.done();
  if (value < 0 || (field === 'level' && value === 0)) throw new Error('Invalid quest settlement value.');
  return { field, value };
}

export function readQuestCharacterAwardReply(reply) {
  if (reply.command !== QUEST_CHARACTER_AWARD_REPLY) throw new Error('Unexpected quest character award reply.');
  const inventoryId = reply.int();
  const cardId = reply.int();
  reply.done();
  if (inventoryId <= 0 || cardId <= 0) throw new Error('Invalid quest character award.');
  return { inventoryId, cardId };
}

export function readQuestErrorReply(reply) {
  if (reply.command !== QUEST_ERROR_REPLY) throw new Error('Unexpected quest error reply.');
  const code = reply.int();
  reply.done();
  if (code <= 0) throw new Error('Invalid quest error reply.');
  return code;
}

export function readQuestDeletedReply(reply) {
  if (reply.command !== QUEST_DELETED_REPLY) throw new Error('Unexpected quest deletion reply.');
  const inventoryId = reply.int();
  reply.done();
  if (inventoryId <= 0) throw new Error('Invalid quest deletion reply.');
  return inventoryId;
}

export function readQuestDiscoveryReply(reply) {
  if (reply.command !== QUEST_DISCOVERY_REPLY) throw new Error('Unexpected quest discovery reply.');
  const inventoryId = reply.int();
  const status = reply.byte();
  const questId = reply.int();
  reply.done();
  return questInventoryRow(inventoryId, questId, status);
}

export function readQuestNextLandReply(reply, expectedSlot) {
  if (reply.command !== QUEST_NEXT_LAND_REPLY) throw new Error('Unexpected quest land reply.');
  const slot = reply.byte();
  reply.done();
  if (slot < 0 || slot >= LAND_SLOT_COUNT || slot !== expectedSlot) throw new Error('Invalid quest land slot.');
  return slot;
}

export function readQuestProgressReply(reply) {
  if (reply.command !== QUEST_PROGRESS_REPLY) throw new Error('Unexpected quest progress reply.');
  const inventoryId = reply.int();
  const progress = reply.int();
  reply.done();
  if (inventoryId <= 0 || progress < 0 || progress > MAX_LAND_PROGRESS) {
    throw new Error('Invalid quest progress reply.');
  }
  return { inventoryId, progress };
}

export function readQuestDeckStateReply(reply) {
  if (reply.command !== QUEST_DECK_STATE_REPLY) throw new Error('Unexpected quest deck state reply.');
  const deckIndex = reply.byte();
  const status = reply.byte();
  const damage = [reply.byte(), reply.byte(), reply.byte()];
  reply.done();
  if (deckIndex < 0 || status < 0 || status > 6) throw new Error('Invalid quest deck state reply.');
  return { deckIndex, status, damage };
}

export function readQuestFinishReply(reply) {
  if (reply.command !== QUEST_FINISH_REPLY) throw new Error('Unexpected quest finish reply.');
  const result = reply.byte();
  const inventoryId = reply.int();
  reply.done();
  if (inventoryId <= 0 || result < 0 || result > 6) throw new Error('Invalid quest finish reply.');
  return { inventoryId, result };
}

export function readQuestTreasureReply(reply) {
  if (reply.command !== QUEST_TREASURE_REPLY) throw new Error('Unexpected quest treasure reply.');
  const type = reply.byte();
  const slotType = reply.int();
  const value = reply.int();
  reply.done();
  if (type < 0 || type > 7) throw new Error('Invalid quest treasure reply.');
  return { type, slotType, value };
}

export function readQuestEncounterReply(reply) {
  if (reply.command !== QUEST_ENCOUNTER_REPLY) throw new Error('Unexpected quest encounter reply.');
  // The original Quest controller assigns CPU encounters the session ID -1.
  if (reply.int() !== -1 || reply.string(3) !== 'CPU') throw new Error('Invalid quest opponent.');
  const playerCardIds = integerList(reply.string(MAX_ID_LIST_BYTES));
  const opponentCardIds = integerList(reply.string(MAX_ID_LIST_BYTES));
  reply.discardString(MAX_DIALOGUE_BYTES, true);
  reply.discardString(MAX_DIALOGUE_BYTES, true);
  const stage = reply.byte();
  const playerDamage = [reply.byte(), reply.byte(), reply.byte()];
  const opponentDamage = [reply.byte(), reply.byte(), reply.byte()];
  reply.done();
  if (stage < 0 || [...playerCardIds, ...opponentCardIds].some((id) => id === 0 || id > MAX_INT32)) {
    throw new Error('Invalid quest encounter reply.');
  }
  return { playerCardIds, opponentCardIds, stage, playerDamage, opponentDamage };
}

export function readQuestDuelStartReply(reply) {
  if (reply.command !== QUEST_DUEL_START_REPLY) throw new Error('Unexpected quest duel start reply.');
  const deckSize = reply.byte();
  const playerEventDeckSize = reply.byte();
  const opponentEventDeckSize = reply.byte();
  const distance = reply.byte();
  const multi = reply.byte();
  reply.done();
  if (deckSize < 0 || playerEventDeckSize < 0 || opponentEventDeckSize < 0
    || distance < 1 || distance > 3 || (multi !== 0 && multi !== 1)) {
    throw new Error('Invalid quest duel start reply.');
  }
  return { deckSize, playerEventDeckSize, opponentEventDeckSize, distance, multi: multi === 1 };
}

export function readQuestDuelFinishReply(reply, { awards = false } = {}) {
  if (reply.command !== QUEST_DUEL_FINISH_REPLY) throw new Error('Unexpected quest duel finish reply.');
  const result = reply.byte();
  const [gems, exp, expBonus, gemsPow, expPow, totalGems, totalExp] = Array.from({ length: 7 }, () => reply.int());
  const bonus = readDuelBoolean(reply);
  reply.done();
  if (result < 0 || result > 2) throw new Error('Invalid quest duel result.');
  return awards ? { result, gems, exp, expBonus, gemsPow, expPow, totalGems, totalExp, bonus } : { result, bonus };
}

function readQuestRewardCandidate(reply) {
  const values = integerList(reply.string(36, true));
  if (values.length === 0) return null;
  const [genre, id, amount] = values;
  if (values.length !== 3 || genre > 7 || id > MAX_INT32 || amount < 1 || amount > MAX_INT32
      || (genre < 2 ? id !== 0 : id === 0)) throw new Error('Invalid quest reward candidate.');
  return Object.freeze({ genre, id, amount });
}

export function readQuestRewardReply(reply) {
  let data;
  switch (reply.command) {
    case QUEST_REWARD_CANDIDATES_REPLY:
      data = { choices: Array.from({ length: 4 }, () => readQuestRewardCandidate(reply)), rank: reply.int() };
      if (data.rank < 0 || data.rank > 197) throw new Error('Invalid quest reward rank.');
      break;
    case QUEST_REWARD_BASE_DICE_REPLY:
    case QUEST_REWARD_ROLLED_DICE_REPLY: {
      data = integerList(reply.string(3));
      if (data.length !== 2 || data.some((eye) => eye < 1 || eye > 6)) throw new Error('Invalid quest reward dice.');
      Object.freeze(data);
      break;
    }
    case QUEST_REWARD_DECISION_REPLY:
      data = { won: readDuelBoolean(reply), current: readQuestRewardCandidate(reply),
        next: readQuestRewardCandidate(reply), bonus: reply.int() };
      if (data.bonus < 0 || data.bonus > 197 || data.won !== Boolean(data.current) || data.won !== Boolean(data.next)) {
        throw new Error('Invalid quest reward decision.');
      }
      break;
    case QUEST_REWARD_AWARD_REPLY: {
      const inventoryIds = readDuelCardIds(reply);
      const reward = readQuestRewardCandidate(reply);
      const isCharacter = reward && reward.genre >= 3 && reward.genre <= 5;
      if (new Set(inventoryIds).size !== inventoryIds.length || inventoryIds.length !== (isCharacter ? reward.amount : 0)) {
        throw new Error('Invalid quest reward inventory.');
      }
      data = { inventoryIds: Object.freeze(inventoryIds), reward };
      break;
    }
    case QUEST_REWARD_FINAL_REPLY:
      data = { reward: readQuestRewardCandidate(reply), totalGems: reply.int(), totalExp: reply.int(), addPoint: reply.int() };
      break;
    default:
      throw new Error('Unexpected quest reward reply.');
  }
  reply.done();
  return Object.freeze(data);
}

export function readQuestItemReply(reply) {
  const granted = reply.command === QUEST_ITEM_GRANTED_REPLY;
  if (!granted && reply.command !== QUEST_ITEM_CONSUMED_REPLY) throw new Error('Unexpected quest item reply.');
  const inventoryId = reply.int();
  const itemId = granted ? reply.int() : null;
  reply.done();
  if (inventoryId < 1 || (granted && itemId < 1)) throw new Error('Invalid quest item reply.');
  return { inventoryId, itemId };
}

export function readAvatarPartGrantReply(reply) {
  const inventoryId = reply.int();
  const partId = reply.int();
  reply.done();
  if (inventoryId < 1 || partId < 1) throw new Error('Invalid part grant.');
  return { inventoryId, partId };
}

export function readAvatarPartEquipReply(reply) {
  const inventoryId = reply.int();
  const unequipped = integerList(reply.string(MAX_PART_LIST_BYTES, true));
  const remainingSeconds = reply.int();
  const used = reply.byte();
  reply.done();
  if (inventoryId < 0 || used < 0 || used > 3
    || unequipped.some(id => id < 1 || id > MAX_INT32 || id === inventoryId)
    || new Set(unequipped).size !== unequipped.length
    || (inventoryId === 0 && (used !== 0 || remainingSeconds !== 0))) throw new Error('Invalid part equipment update.');
  return { inventoryId, unequipped, remainingSeconds, used };
}

export function readAvatarPartVanishReply(reply) {
  const inventoryId = reply.int();
  const alert = readDuelBoolean(reply);
  reply.done();
  if (inventoryId < 1) throw new Error('Invalid removed part.');
  return { inventoryId, alert };
}

function readDuelCardIds(reply) {
  const ids = integerList(reply.string(MAX_ID_LIST_BYTES, true));
  if (ids.some((id) => id === 0 || id > MAX_INT32)) throw new Error('Invalid duel card ID.');
  return ids;
}

function readDuelBoolean(reply) {
  const value = reply.byte();
  if (value !== 0 && value !== 1) throw new Error('Invalid duel boolean.');
  return value === 1;
}

function readPlayedCards(reply) {
  const ids = readDuelCardIds(reply);
  const orientation = reply.string(MAX_ID_LIST_BYTES, true);
  const faces = orientation === '' ? [] : orientation.split(',');
  if (faces.length !== ids.length || faces.some((face) => face !== 'true' && face !== 'false')) {
    throw new Error('Invalid played-card orientation.');
  }
  return ids.map((id, index) => ({ id, up: faces[index] === 'true' }));
}

export function readQuestTurnReply(reply) {
  if (reply.command !== QUEST_TURN_REPLY) throw new Error('Unexpected quest turn reply.');
  const turn = reply.byte();
  reply.done();
  if (turn < 1) throw new Error('Invalid quest turn.');
  return turn;
}

export function readQuestRefillReply(reply) {
  if (reply.command !== QUEST_ACTION_REFILL_REPLY && reply.command !== QUEST_EVENT_REFILL_REPLY) {
    throw new Error('Unexpected quest refill reply.');
  }
  const ids = readDuelCardIds(reply);
  const orientation = reply.uint();
  const opponentDrawCount = reply.byte();
  reply.done();
  if (ids.length > REFILL_ORIENTATION_BITS || opponentDrawCount < 0
    || (ids.length < REFILL_ORIENTATION_BITS && (orientation >>> ids.length) !== 0)) {
    throw new Error('Invalid quest refill reply.');
  }
  const cards = ids.map((id, index) => ({ id, up: ((orientation >>> index) & 1) === 1 }));
  return { cards, opponentDrawCount };
}

export function readQuestMovePhaseReply(reply) {
  if (reply.command !== QUEST_MOVE_PHASE_START_REPLY && reply.command !== QUEST_MOVE_PHASE_FINISH_REPLY) {
    throw new Error('Unexpected quest move phase reply.');
  }
  reply.done();
  return reply.command === QUEST_MOVE_PHASE_START_REPLY ? 'start' : 'finish';
}

export function readQuestDirectionReply(reply) {
  if (reply.command !== QUEST_DIRECTION_REPLY) throw new Error('Unexpected quest direction reply.');
  const player = readDuelBoolean(reply);
  const direction = reply.byte();
  reply.done();
  if (direction < -1 || direction > 3) throw new Error('Invalid quest direction.');
  return { player, direction };
}

export function readQuestFeatReply(reply) {
  if (!QUEST_FEAT_REPLIES.includes(reply.command)) throw new Error('Unexpected quest feat reply.');
  if (reply.command === QUEST_FEAT_SEALED_REPLY) {
    const player = readDuelBoolean(reply);
    reply.done();
    return { kind: 'sealed', player };
  }
  const used = reply.command === QUEST_FEAT_USED_REPLY;
  const player = used ? readDuelBoolean(reply) : true;
  const featId = reply.int();
  reply.done();
  if (featId <= 0) throw new Error('Invalid quest feat ID.');
  const kind = used ? 'used' : (reply.command === QUEST_FEAT_ON_REPLY ? 'on' : 'off');
  return { kind, player, featId };
}

export function readQuestPointRewriteReply(reply) {
  if (reply.command !== QUEST_POINT_REWRITE_REPLY) throw new Error('Unexpected quest point rewrite reply.');
  const player = readDuelBoolean(reply);
  const value = reply.int();
  reply.done();
  return { player, value };
}

function readQuestRosterFeatSlot(reply) {
  const player = readDuelBoolean(reply);
  const rosterIndex = reply.int();
  const featIndex = reply.int();
  if (rosterIndex < 0 || rosterIndex >= ROSTER_SLOT_COUNT || featIndex < 0 || featIndex >= FEAT_SLOT_COUNT) {
    throw new Error('Invalid quest feat slot.');
  }
  return { player, rosterIndex, featIndex };
}

export function readQuestFeatReplacementReply(reply) {
  if (reply.command !== QUEST_FEAT_REPLACEMENT_REPLY) throw new Error('Unexpected quest feat replacement reply.');
  const slot = readQuestRosterFeatSlot(reply);
  const featId = reply.int();
  const featNo = reply.int();
  reply.done();
  if (featId <= 0 || featNo <= 0 || featNo > MAX_FEAT_EFFECT_NUMBER) throw new Error('Invalid replacement quest feat.');
  return { ...slot, featId, featNo };
}

export function readQuestFeatConditionReply(reply) {
  if (reply.command !== QUEST_FEAT_CONDITION_REPLY) throw new Error('Unexpected quest feat condition reply.');
  const slot = readQuestRosterFeatSlot(reply);
  const condition = reply.string(MAX_FEAT_CONDITION_BYTES, true);
  reply.done();
  if (/[\u0000-\u001f\u007f]/u.test(condition)) throw new Error('Invalid quest feat condition.');
  return { ...slot, condition };
}

export function readQuestMoveCardReply(reply) {
  if (reply.command !== QUEST_MOVE_CARD_ADD_REPLY && reply.command !== QUEST_MOVE_CARD_REMOVE_REPLY) {
    throw new Error('Unexpected quest move card reply.');
  }
  const player = readDuelBoolean(reply);
  const index = reply.byte();
  const id = reply.int();
  reply.done();
  // Opponent notices hide the card ID. A failed move uses index -1 and ID 0.
  if (index < -1 || (player && index >= 0 ? id <= 0 : id !== 0)) {
    throw new Error('Invalid quest move card reply.');
  }
  return { player, index, id };
}

export function readQuestMoveResultReply(reply) {
  if (reply.command !== QUEST_MOVE_RESULT_REPLY) throw new Error('Unexpected quest move result.');
  const playerInitiative = readDuelBoolean(reply);
  const distance = reply.byte();
  const playerCards = readPlayedCards(reply);
  const opponentCards = readPlayedCards(reply);
  const playerPower = reply.byte();
  const opponentPower = reply.byte();
  const playerLocked = readDuelBoolean(reply);
  const opponentLocked = readDuelBoolean(reply);
  reply.done();
  // The original distance_appearance returns 4 when fog hides the distance.
  if (distance < 1 || distance > 4) throw new Error('Invalid quest move distance.');
  return { playerInitiative, distance, playerCards, opponentCards, playerPower, opponentPower, playerLocked, opponentLocked };
}

export function readQuestAttackPhaseReply(reply) {
  if (reply.command !== QUEST_ATTACK_PHASE_START_REPLY) throw new Error('Unexpected quest attack phase reply.');
  const playerAttacks = readDuelBoolean(reply);
  reply.done();
  return playerAttacks;
}

export function readQuestDefencePhaseReply(reply) {
  if (reply.command !== QUEST_DEFENCE_PHASE_START_REPLY) throw new Error('Unexpected quest defence phase reply.');
  const playerDefends = readDuelBoolean(reply);
  reply.done();
  return playerDefends;
}

export function readQuestBattleCardReply(reply) {
  if (reply.command !== QUEST_BATTLE_CARD_ADD_REPLY && reply.command !== QUEST_BATTLE_CARD_REMOVE_REPLY) {
    throw new Error('Unexpected quest battle card reply.');
  }
  const player = readDuelBoolean(reply);
  const index = reply.byte();
  const id = reply.int();
  reply.done();
  // Battle actions use index 0 on success. Failed actions use -1 and opponent IDs stay hidden.
  if ((index !== 0 && index !== -1) || (player && index === 0 ? id <= 0 : id !== 0)) {
    throw new Error('Invalid quest battle card reply.');
  }
  return { player, index, id };
}

export function readQuestBattleCardsReply(reply) {
  if (reply.command !== QUEST_ATTACK_PHASE_FINISH_REPLY && reply.command !== QUEST_DEFENCE_PHASE_FINISH_REPLY
    && reply.command !== QUEST_BATTLE_CARDS_REPLY) {
    throw new Error('Unexpected quest battle cards reply.');
  }
  const playerCards = readPlayedCards(reply);
  const opponentCards = readPlayedCards(reply);
  const playerLocked = readDuelBoolean(reply);
  const opponentLocked = readDuelBoolean(reply);
  reply.done();
  return { playerCards, opponentCards, playerLocked, opponentLocked };
}

export function readQuestBattleDiceReply(reply) {
  if (reply.command !== QUEST_BATTLE_DICE_REPLY) throw new Error('Unexpected quest battle dice reply.');
  const playerAttacks = readDuelBoolean(reply);
  const attackDice = integerList(reply.string(MAX_ID_LIST_BYTES, true));
  const defenceDice = integerList(reply.string(MAX_ID_LIST_BYTES, true));
  reply.done();
  if (attackDice.some((face) => face > 5) || defenceDice.some((face) => face > 5)) {
    throw new Error('Invalid quest die face.');
  }
  return { playerAttacks, attackDice, defenceDice };
}

export function readQuestCharaChangeReply(reply) {
  if (reply.command !== QUEST_CHARA_CHANGE_REPLY) throw new Error('Unexpected quest character change reply.');
  const player = readDuelBoolean(reply);
  const index = reply.byte();
  const cardId = reply.int();
  reply.discardString(MAX_ID_LIST_BYTES, true); // Original weapon modifiers and passives.
  reply.done();
  if (index < 0 || index >= ROSTER_SLOT_COUNT || cardId <= 0) throw new Error('Invalid quest character change reply.');
  return { player, index, cardId };
}

export function readQuestCharaTransformReply(reply) {
  if (reply.command !== QUEST_CHARA_TRANSFORM_REPLY) throw new Error('Unexpected quest character transform reply.');
  const player = readDuelBoolean(reply);
  const cardId = reply.int();
  reply.done();
  if (cardId <= 0) throw new Error('Invalid quest character transform reply.');
  return { player, cardId };
}

export function readQuestDamageReply(reply) {
  if (reply.command !== QUEST_DAMAGE_REPLY) throw new Error('Unexpected quest damage reply.');
  const player = readDuelBoolean(reply);
  const damage = reply.int();
  const nonHostile = readDuelBoolean(reply);
  reply.done();
  return { player, damage, nonHostile };
}

export function readQuestHitPointReply(reply) {
  if (reply.command !== QUEST_HIT_POINT_REPLY) throw new Error('Unexpected quest hit point reply.');
  const player = readDuelBoolean(reply);
  const hp = reply.int();
  reply.done();
  return { player, hp };
}

export function readQuestRosterHpReply(reply) {
  const { command } = reply;
  if (command === QUEST_DAMAGE_REPLY) {
    const { player, damage, nonHostile } = readQuestDamageReply(reply);
    return { player, index: null, kind: 'damage', value: damage, nonHostile };
  }
  if (command === QUEST_HIT_POINT_REPLY) {
    const { player, hp } = readQuestHitPointReply(reply);
    return { player, index: null, kind: 'absolute', value: hp };
  }
  if (!QUEST_ROSTER_HP_REPLIES.includes(command)) throw new Error('Unexpected quest roster HP reply.');
  const player = readDuelBoolean(reply);
  const index = command === HEAL_REPLY ? null : reply.int();
  if (index !== null && (index < 0 || index >= ROSTER_SLOT_COUNT)) throw new Error('Invalid quest character slot.');
  if (command === PARTY_DAMAGE_REPLY) {
    const value = reply.int();
    const nonHostile = readDuelBoolean(reply);
    reply.done();
    return { player, index, kind: 'damage', value, nonHostile };
  }
  const kind = command === QUEST_CHARA_REVIVE_REPLY ? 'absolute' : 'heal';
  const value = command === QUEST_CHARA_REVIVE_REPLY ? reply.int() : reply.byte();
  reply.done();
  return { player, index, kind, value };
}

export function readQuestCombatBoundaryReply(reply, { includeOpponentCards = false } = {}) {
  if (reply.command === QUEST_CHARA_CHANGE_START_REPLY || reply.command === QUEST_DEAD_CHARA_CHANGE_REPLY) {
    const change = { playerDone: readDuelBoolean(reply), opponentDone: readDuelBoolean(reply) };
    if (reply.command === QUEST_DEAD_CHARA_CHANGE_REPLY) {
      change.playerCards = readDuelCardIds(reply);
      if (includeOpponentCards) change.opponentCards = readDuelCardIds(reply);
      else reply.discardString(MAX_ID_LIST_BYTES, true);
    }
    reply.done();
    return change;
  }
  if (reply.command !== QUEST_CHARA_CHANGE_FINISH_REPLY && reply.command !== QUEST_DEAD_CHARA_CHANGE_FINISH_REPLY
    && reply.command !== QUEST_TURN_FINISH_REPLY) {
    throw new Error('Unexpected quest combat boundary reply.');
  }
  reply.done();
  return null;
}

export function readQuestHandEffectReply(reply) {
  if (!QUEST_HAND_EFFECT_REPLIES.includes(reply.command)) throw new Error('Unexpected quest hand effect reply.');
  const player = readDuelBoolean(reply);
  if (CARD_ROTATE_REPLIES.includes(reply.command)) {
    const table = reply.byte();
    reply.byte(); // Original source position.
    const id = reply.int();
    readDuelBoolean(reply);
    reply.done();
    if (table < 0 || table > 2 || id < 0) throw new Error('Invalid quest rotation reply.');
    return player && id > 0;
  }
  if (CARD_REMOVE_REPLIES.includes(reply.command)) {
    const id = reply.int();
    reply.done();
    if (id < 0) throw new Error('Invalid quest card removal reply.');
    return player && id > 0;
  }
  const ids = readDuelCardIds(reply);
  reply.uint(); // Card orientation bitmask.
  const count = reply.int();
  reply.done();
  if (count < 0) throw new Error('Invalid quest card deal reply.');
  // A steal transfers cards between hands whichever side receives them.
  return (player || reply.command === CARD_STEAL_REPLY) && (ids.length > 0 || count > 0);
}

export function createQuestDataReader() {
  const values = Object.create(null);
  let fieldIndex = 0;
  let left = 0;
  let buffer = null;
  let readingLength = false;

  function beginField() {
    const field = fields[fieldIndex];
    if (typeof field === 'number') {
      left = field;
      return;
    }
    left = field.width ?? 4;
    buffer = new Uint8Array(left);
    readingLength = !field.width;
  }

  function finishField() {
    const field = fields[fieldIndex];
    if (readingLength) {
      const length = new DataView(buffer.buffer).getUint32(0);
      buffer.fill(0);
      readingLength = false;
      const limit = field.limit ?? MAX_ID_LIST_BYTES;
      if (field.key && length > limit && !field.optional) throw new Error('Quest list is too large.');
      buffer = field.key && length <= limit ? new Uint8Array(length) : null;
      left = length;
      if (left) return;
    }

    if (buffer) {
      const view = new DataView(buffer.buffer);
      if (field.width === 1) values[field.key] = view.getInt8(0);
      else if (field.width === 4) values[field.key] = view.getInt32(0);
      else if (field.optional) {
        try {
          values[field.key] = text.decode(buffer);
        } catch {
          // Invalid optional metadata does not invalidate the quest inventory.
        }
      } else values[field.key] = integerList(text.decode(buffer), field.signed);
    }
    buffer?.fill(0);
    buffer = null;
    fieldIndex += 1;
  }

  return {
    push(bytes) {
      let offset = 0;
      while (offset < bytes.length && fieldIndex < fields.length) {
        if (left === 0) beginField();
        const length = Math.min(left, bytes.length - offset);
        if (buffer) buffer.set(bytes.subarray(offset, offset + length), buffer.length - left);
        offset += length;
        left -= length;
        if (left === 0) finishField();
      }
    },
    equippedPartIds() {
      try {
        const parts = readPhysicalParts(values);
        return parts ? Object.freeze(parts.ids.filter((_, index) => (parts.usage[index] & EQUIPPED_PART) !== 0)) : null;
      } catch {
        return null;
      }
    },
    partInventory(receivedAt) {
      try {
        return readAvatarPartRows(values, receivedAt);
      } catch {
        return null;
      }
    },
    freeDuelCount() {
      const count = values.freeDuelCount;
      return count >= 0 && count <= MAX_FREE_DUEL_COUNT ? count : null;
    },
    friendMax() {
      const total = values.friendMax;
      return total >= 0 ? total : null;
    },
    partMax() {
      const total = values.partMax;
      return total >= 0 ? total : null;
    },
    deckChoices() {
      try {
        return readyQuestDecks(values);
      } catch {
        return [];
      }
    },
    deckCollection() {
      if (fieldIndex < questFields.length) return null;
      try {
        return ownedDeckCollection(values);
      } catch {
        return null;
      }
    },
    selectedDeck() {
      try {
        return selectedDeck(values);
      } catch {
        return null;
      }
    },
    physicalDecks() {
      try {
        return physicalDecks(values);
      } catch {
        return null;
      }
    },
    tutorialQuestProgress() {
      const { tutorialQuestFlag, tutorialQuestClearNum } = values;
      // The original tutorial uses map IDs starting above the tutorial flag 2008.
      if (!(tutorialQuestFlag >= 2008 && tutorialQuestClearNum >= 0)) return null;
      return Object.freeze({ tutorialQuestFlag, tutorialQuestClearNum });
    },
    itemInventory() {
      return readOwnedItems(values);
    },
    result(itemInventory = readOwnedItems(values)) {
      if (fieldIndex < questFields.length) throw new Error('Incomplete quest data.');
      const { capacity, count, inventoryIds, questIds, statuses, findTimes, questFlag, questClearNum } = values;
      if (capacity < 0 || count < 0 || questFlag < 0 || questClearNum < 0
        || inventoryIds.length !== count || questIds.length !== count || statuses.length !== count
        || findTimes.length !== count || findTimes.some((seconds) => seconds < MIN_INT32 || seconds > MAX_INT32)
        || inventoryIds.some((id) => id === 0)
        || new Set(inventoryIds).size !== count || statuses.some((status) => status > 6)) {
        throw new Error('Invalid quest data.');
      }
      // Data reports inventory status per row and quest progress at the map level.
      const result = {
        capacity,
        questFlag,
        questClearNum,
        rows: inventoryIds.map((inventoryId, index) => {
          const status = statuses[index];
          const row = { inventoryId, questId: questIds[index], status };
          if (status === PENDING_STATUS) row.findSeconds = findTimes[index];
          return row;
        }),
      };
      // The session uses this separately from the ordinary Quest inventory snapshot.
      return Object.defineProperty(result, 'itemInventory', { value: itemInventory });
    },
    dispose() {
      buffer?.fill(0);
      buffer = null;
    },
  };
}
