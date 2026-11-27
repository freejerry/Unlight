import { readFields } from './wire.js';
import { createQuestDataReader } from './quest-data.js';

export const VERSION_COMMAND = 5;
export const AVATAR_COMMAND = 6;
export const REGISTRATION_COMMAND = 8;
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

function countIds(list) {
  if (list === '') return 0;
  if (!/^\d+(?:,\d+)*$/.test(list)) throw new Error('Invalid registration data.');
  return list.split(',').length;
}

async function readAvatar(compressed, signal) {
  // Keep the fixed-size avatar header and selected quest fields only.
  const prefix = new Uint8Array(4 + 4 + MAX_NAME_BYTES + 5 * 4);
  let prefixLength = 0;
  let total = 0;
  let reader;
  let quests = createQuestDataReader();
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
          quests?.dispose();
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
    };
    if (avatar.id < 1) throw new Error('Invalid avatar ID.');
    let questData = null;
    try {
      questData = quests?.result() ?? null;
    } catch {
      // A quest schema mismatch leaves the independently validated avatar available.
    }
    return { avatar, questData };
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
    const profile = await readAvatar(reply.takeRest(MAX_COMPRESSED_BYTES), signal);
    return { ...profile, registration: null };
  }
  if (reply.command !== REGISTRATION_COMMAND) throw new Error('Invalid data profile command.');
  const partCount = countIds(reply.string(MAX_REGISTRATION_BYTES, true));
  const cardCount = countIds(reply.string(MAX_REGISTRATION_BYTES, true));
  reply.done();
  return { avatar: null, registration: { partCount, cardCount }, questData: null };
}
