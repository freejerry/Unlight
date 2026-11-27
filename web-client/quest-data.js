const MAX_ID_LIST_BYTES = 4096;
const MAX_CARD_LIST_BYTES = 1024 * 1024;
const MIN_INT32 = -0x80000000;
const MAX_INT32 = 0x7fffffff;
const MAX_SENDER_NAME_BYTES = 128;
const MAX_DIALOGUE_BYTES = 64 * 1024;
const MAX_DECK_INDEX = 127;
const LAND_SLOT_COUNT = 15;
const MAX_LAND_PROGRESS = (1 << LAND_SLOT_COUNT) - 1;
const REFILL_ORIENTATION_BITS = 32;
const NEW_STATUS = 0;
const PENDING_STATUS = 4;
const SEARCH_BASE_SECONDS = 3 * 60; // QFT_SET[1] in the original Quest service.
const text = new TextDecoder('utf-8', { fatal: true });

export const QUEST_MAP_REQUEST = 6;
export const QUEST_MAP_REPLY = 14;
export const QUEST_INVENTORY_REPLY = 6;
export const QUEST_DISCOVERY_REQUEST = 17;
export const QUEST_DISCOVERY_REPLY = 17;
export const QUEST_SEARCH_REQUEST = 5;
export const QUEST_SEARCH_REPLY = QUEST_INVENTORY_REPLY;
export const QUEST_SEARCH_TIMER = 1;
export const QUEST_ENERGY_REPLY = 4;
export const QUEST_ERROR_REPLY = 29;
export const QUEST_START_REQUEST = 13;
export const QUEST_DELETED_REPLY = 22;
export const QUEST_NEXT_LAND_REQUEST = 16;
export const QUEST_NEXT_LAND_REPLY = 128;
export const QUEST_PROGRESS_REPLY = 19;
export const QUEST_FINISH_REPLY = 24;
export const QUEST_ENCOUNTER_REPLY = 37;
export const QUEST_DUEL_START_REPLY = 40;
export const QUEST_READY_REQUEST = 22;
export const QUEST_DIRECTION_REQUEST = 23;
export const QUEST_MOVE_CARD_ADD_REQUEST = 24;
export const QUEST_MOVE_CARD_REMOVE_REQUEST = 25;
export const QUEST_MOVE_COMMIT_REQUEST = 26;
export const QUEST_TURN_REPLY = 43;
export const QUEST_ACTION_REFILL_REPLY = 44;
export const QUEST_EVENT_REFILL_REPLY = 45;
export const QUEST_MOVE_PHASE_START_REPLY = 46;
export const QUEST_MOVE_PHASE_FINISH_REPLY = 47;
export const QUEST_MOVE_RESULT_REPLY = 48;
export const QUEST_ATTACK_PHASE_START_REPLY = 51;
export const QUEST_DIRECTION_REPLY = 60;
export const QUEST_MOVE_CARD_ADD_REPLY = 61;
export const QUEST_MOVE_CARD_REMOVE_REPLY = 62;

const skipString = {};
const skipStrings = (count) => Array(count).fill(skipString);
const skipGroup = (count) => [4, ...skipStrings(count)];
const optionalList = (key, limit = MAX_ID_LIST_BYTES) => ({ key, limit, optional: true });

// Order from DataCommand.scAvatarInfo. Length-prefixed fields can span inflated chunks.
const fields = [
  4, skipString, 12 * 4, ...skipStrings(4), // Avatar header and parts.
  ...skipGroup(3), // Items.
  { key: 'deckCount', width: 4 }, optionalList('deckNames'), ...skipStrings(3),
  optionalList('deckStatuses'), ...skipStrings(2),
  { key: 'cardCount', width: 4 }, skipString, optionalList('cardIds', MAX_CARD_LIST_BYTES),
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

function integerList(csv, signed = false) {
  if (csv === '') return [];
  const pattern = signed ? /^-?\d+(?:,-?\d+)*$/ : /^\d+(?:,\d+)*$/;
  if (!pattern.test(csv)) throw new Error('Invalid quest list.');
  const list = csv.split(',').map(Number);
  if (!list.every(Number.isSafeInteger)) throw new Error('Quest list value exceeds bounds.');
  return list;
}

function readyQuestDecks(values) {
  const { deckCount, deckNames, deckStatuses, cardCount, cardIds, cardDeckIndices, cardPositions } = values;
  if (deckCount < 2 || deckCount > MAX_DECK_INDEX + 1 || cardCount < 1
    || [deckNames, deckStatuses, cardIds, cardDeckIndices, cardPositions].some((list) => list === undefined)) {
    return [];
  }
  const names = deckNames.split(',');
  const statuses = integerList(deckStatuses);
  const ids = integerList(cardIds);
  const indices = integerList(cardDeckIndices);
  const positions = integerList(cardPositions, true);
  if (names.length !== deckCount || statuses.length !== deckCount
    || ids.length !== cardCount || indices.length !== cardCount || positions.length !== cardCount
    || indices.some((index) => index >= deckCount)) {
    return [];
  }

  const deckChoices = new Set();
  for (let card = 0; card < cardCount; card += 1) {
    const index = indices[card];
    // The original start action requires a character in the selected deck's first position.
    if (index > 0 && positions[card] === 0 && ids[card] > 0 && ids[card] <= MAX_INT32 && statuses[index] === 0) {
      deckChoices.add(index);
    }
  }
  return names.flatMap((name, index) => deckChoices.has(index) ? [{ index, name }] : []);
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

function readQuestGetReply(reply) {
  if (reply.command !== QUEST_INVENTORY_REPLY) throw new Error('Unexpected quest inventory reply.');
  const inventoryId = reply.int();
  const questId = reply.int();
  const timer = reply.int();
  const power = reply.int();
  const status = reply.byte();
  reply.discardString(MAX_SENDER_NAME_BYTES, true);
  reply.done();
  return { row: questInventoryRow(inventoryId, questId, status), timer, power };
}

export function readQuestInventoryReply(reply) {
  return readQuestGetReply(reply).row;
}

export function readQuestSearchReply(reply) {
  const { row, timer, power } = readQuestGetReply(reply);
  if (timer === 0) return null; // Quest login and inventory-limit rejections may resend existing rows.
  const findSeconds = Math.floor(SEARCH_BASE_SECONDS * power / 100);
  if (timer !== QUEST_SEARCH_TIMER || row.questId !== 0 || row.status !== NEW_STATUS
    || power < 1 || findSeconds > MAX_INT32) {
    throw new Error('Invalid quest search reply.');
  }
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

export function readQuestFinishReply(reply) {
  if (reply.command !== QUEST_FINISH_REPLY) throw new Error('Unexpected quest finish reply.');
  const result = reply.byte();
  const inventoryId = reply.int();
  reply.done();
  if (inventoryId <= 0 || result < 0 || result > 6) throw new Error('Invalid quest finish reply.');
  return { inventoryId, result };
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
          // Invalid optional deck metadata does not invalidate the quest inventory.
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
    deckChoices() {
      try {
        return readyQuestDecks(values);
      } catch {
        return [];
      }
    },
    result() {
      if (fieldIndex !== fields.length) throw new Error('Incomplete quest data.');
      const { capacity, count, inventoryIds, questIds, statuses, findTimes, questFlag, questClearNum } = values;
      if (capacity < 0 || count < 0 || questFlag < 0 || questClearNum < 0
        || inventoryIds.length !== count || questIds.length !== count || statuses.length !== count
        || findTimes.length !== count || findTimes.some((seconds) => seconds < MIN_INT32 || seconds > MAX_INT32)
        || inventoryIds.some((id) => id === 0)
        || new Set(inventoryIds).size !== count || statuses.some((status) => status > 6)) {
        throw new Error('Invalid quest data.');
      }
      // Data reports inventory status per row and quest progress at the map level.
      return {
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
    },
    dispose() {
      buffer?.fill(0);
      buffer = null;
    },
  };
}
