import { readFields } from './wire.js';
import { createQuestDataReader } from './quest-data.js';

export const VERSION_COMMAND = 5;
export const AVATAR_COMMAND = 6;
export const REGISTRATION_COMMAND = 8;
export const LOBBY_AVATAR_COMMAND = 4;
const VERSION_FIELDS = [
  'actionCard', 'charaCard', 'feat', 'dialogue', 'story', 'questLog', 'avatarItem',
  'avatarPart', 'eventCard', 'weaponCard', 'equipCard', 'quest', 'questMap',
  'questLand', 'growthTree',
];
const MAX_NAME_BYTES = 128;
const MAX_INFLATED_BYTES = 4 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 1024 * 1024 - 2;
const MAX_REGISTRATION_BYTES = 4096;
const COMPRESSED_CHUNK_BYTES = 1024;

export function readVersions(reply) {
  const versions = Object.fromEntries(VERSION_FIELDS.map((field) => [field, reply.int()]));
  reply.done();
  return versions;
}

function starterIds(list) {
  if (list === '') return Object.freeze([]);
  const fields = list.split(',');
  if (fields.some((field) => !field || /\D/.test(field))) throw new Error('Invalid registration data.');
  const ids = fields.map(Number);
  if (new Set(ids).size !== ids.length || ids.some((id) => !Number.isInteger(id) || id < 1 || id > 0x7fffffff)) {
    throw new Error('Invalid registration data.');
  }
  return Object.freeze(ids);
}

async function readAvatar(compressed, signal, includeDeckCollection = false) {
  const receivedAt = performance.now();
  // Keep the fixed-size avatar header and selected appearance, deck and quest fields only.
  const prefix = new Uint8Array(4 + 4 + MAX_NAME_BYTES + 7 * 4);
  let prefixLength = 0;
  let total = 0;
  let reader;
  let quests = createQuestDataReader();
  let equippedPartIds = null;
  const cancel = () => {
    void reader?.cancel().catch(() => {});
  };
  try {
    signal.throwIfAborted();
    let compressedOffset = 0;
    const source = new ReadableStream({
      pull(controller) {
        if (compressedOffset === compressed.length) {
          controller.close();
          return;
        }
        const end = Math.min(compressedOffset + COMPRESSED_CHUNK_BYTES, compressed.length);
        controller.enqueue(compressed.subarray(compressedOffset, end));
        compressedOffset = end;
      },
    });
    reader = source.pipeThrough(new DecompressionStream('deflate')).getReader();
    signal.addEventListener('abort', cancel, { once: true });
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.length;
      try {
        if (total > MAX_INFLATED_BYTES) throw new Error('Avatar data is too large.');
        const part = value.subarray(0, prefix.length - prefixLength);
        prefix.set(part, prefixLength);
        prefixLength += part.length;
        try {
          quests?.push(value);
        } catch {
          equippedPartIds = quests.equippedPartIds();
          quests.dispose();
          quests = null;
        }
      } finally {
        value.fill(0);
      }
    }

    const fields = readFields(prefix.subarray(0, prefixLength));
    const avatar = {
      id: fields.int(),
      name: fields.string(MAX_NAME_BYTES),
      gems: fields.int(),
      exp: fields.int(),
      level: fields.int(),
      energy: fields.int(),
      energyMax: fields.int(),
      energyRecoveryInterval: null,
      energyRemainingSeconds: null,
      energyReceivedAt: null,
      freeDuelCount: quests?.freeDuelCount() ?? null,
      equippedPartIds: quests?.equippedPartIds() ?? equippedPartIds,
      questDecks: quests?.deckChoices() ?? [],
    };
    if (avatar.id < 1) throw new Error('Invalid avatar ID.');
    try {
      const interval = fields.int();
      const remaining = fields.int();
      if (interval > 0) avatar.energyRecoveryInterval = interval;
      if (remaining >= 0) {
        avatar.energyRemainingSeconds = remaining;
        avatar.energyReceivedAt = receivedAt;
      }
    } catch {
      // A shorter legacy header still provides the existing avatar snapshot.
    }
    let questData = null;
    try {
      questData = quests?.result() ?? null;
    } catch {
      // A quest schema mismatch leaves the independently validated avatar available.
    }
    const profile = { avatar, questData };
    if (includeDeckCollection) {
      profile.deckCollection = quests?.deckCollection() ?? null;
      profile.selectedDeck = quests?.selectedDeck() ?? null;
    }
    return profile;
  } finally {
    signal.removeEventListener('abort', cancel);
    prefix.fill(0);
    compressed.fill(0);
    quests?.dispose();
    if (reader) {
      cancel();
      reader.releaseLock();
    }
  }
}

export async function readDataProfile(reply, signal) {
  if (reply.command === AVATAR_COMMAND) {
    const profile = await readAvatar(reply.takeRest(MAX_COMPRESSED_BYTES), signal, true);
    return { ...profile, registration: null };
  }
  if (reply.command !== REGISTRATION_COMMAND) throw new Error('Invalid data profile command.');
  const partIds = starterIds(reply.string(MAX_REGISTRATION_BYTES, true));
  const cardIds = starterIds(reply.string(MAX_REGISTRATION_BYTES, true));
  reply.done();
  const registration = Object.freeze({ partCount: partIds.length, cardCount: cardIds.length, partIds, cardIds });
  return { avatar: null, registration, questData: null, deckCollection: null };
}

export function readLobbyAvatar(reply, signal) {
  if (reply.command !== LOBBY_AVATAR_COMMAND) throw new Error('Invalid Lobby avatar command.');
  return readAvatar(reply.takeRest(MAX_COMPRESSED_BYTES), signal, true);
}
