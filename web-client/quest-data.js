const MAX_ID_LIST_BYTES = 4096;
const MAX_MAP_ID = 0x7fffffff;
const MAX_SENDER_NAME_BYTES = 128;
const text = new TextDecoder('utf-8', { fatal: true });

export const QUEST_MAP_REQUEST = 6;
export const QUEST_MAP_REPLY = 14;
export const QUEST_INVENTORY_REPLY = 6;

const skipString = {};
const skipStrings = (count) => Array(count).fill(skipString);
const skipGroup = (count) => [4, ...skipStrings(count)];

// Order from DataCommand.scAvatarInfo. Length-prefixed fields can span inflated chunks.
const fields = [
  4, skipString, 12 * 4, ...skipStrings(4), // Avatar header and parts.
  ...skipGroup(3), // Items.
  ...skipGroup(7), // Decks.
  ...skipGroup(4), // Cards.
  ...skipGroup(8), // Equipped slots.
  { key: 'capacity', width: 1 },
  { key: 'count', width: 1 },
  { key: 'inventoryIds' },
  { key: 'questIds' },
  { key: 'statuses' },
  skipString, // Search times.
  skipString, // Sender names.
  { key: 'questFlag', width: 4 },
  { key: 'questClearNum', width: 4 },
];

function integerList(csv) {
  if (csv === '') return [];
  if (!/^\d+(?:,\d+)*$/.test(csv)) throw new Error('Invalid quest list.');
  const list = csv.split(',').map(Number);
  if (!list.every(Number.isSafeInteger)) throw new Error('Quest list value exceeds bounds.');
  return list;
}

export function readQuestMapReply(reply, region) {
  if (reply.command !== QUEST_MAP_REPLY || reply.int() !== region) {
    throw new Error('Unexpected quest map reply.');
  }
  const ids = integerList(reply.string(MAX_ID_LIST_BYTES));
  reply.done();
  if (ids.some((id) => id === 0 || id > MAX_MAP_ID)) throw new Error('Invalid quest map ID.');
  return ids;
}

export function readQuestInventoryReply(reply) {
  if (reply.command !== QUEST_INVENTORY_REPLY) throw new Error('Unexpected quest inventory reply.');
  const inventoryId = reply.int();
  const questId = reply.int();
  reply.int(); // Find time.
  reply.int(); // Search power.
  const status = reply.byte();
  reply.discardString(MAX_SENDER_NAME_BYTES, true);
  reply.done();
  if (inventoryId <= 0 || questId < 0 || status < 0 || status > 6) {
    throw new Error('Invalid quest inventory data.');
  }
  return { inventoryId, questId, status };
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
      if (field.key && length > MAX_ID_LIST_BYTES) throw new Error('Quest list is too large.');
      buffer = field.key ? new Uint8Array(length) : null;
      left = length;
      if (left) return;
    }

    if (field.key) {
      const view = new DataView(buffer.buffer);
      if (field.width === 1) values[field.key] = view.getInt8(0);
      else if (field.width === 4) values[field.key] = view.getInt32(0);
      else values[field.key] = integerList(text.decode(buffer));
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
    result() {
      if (fieldIndex !== fields.length) throw new Error('Incomplete quest data.');
      const { capacity, count, inventoryIds, questIds, statuses, questFlag, questClearNum } = values;
      if (capacity < 0 || count < 0 || questFlag < 0 || questClearNum < 0
        || inventoryIds.length !== count || questIds.length !== count || statuses.length !== count
        || inventoryIds.some((id) => id === 0)
        || new Set(inventoryIds).size !== count || statuses.some((status) => status > 6)) {
        throw new Error('Invalid quest data.');
      }
      // Data reports inventory status per row and quest progress at the map level.
      return {
        capacity,
        questFlag,
        questClearNum,
        rows: inventoryIds.map((inventoryId, index) => ({
          inventoryId,
          questId: questIds[index],
          status: statuses[index],
        })),
      };
    },
    dispose() {
      buffer?.fill(0);
      buffer = null;
    },
  };
}
