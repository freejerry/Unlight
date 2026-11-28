export const FRIEND_PAGE_SIZE = 10;
export const FRIEND_WRITES = {
  apply: { request: 27, reply: 36, from: [7], status: 0, errors: [60, 63, 64] },
  accept: { request: 28, reply: 37, from: [1], status: 2, errors: [61] },
  remove: { request: 29, reply: 38, from: [0, 1, 2, 3, 6], status: null, errors: [62] },
  block: { request: 41, reply: 62, from: [7], status: 3, errors: [65, 66] },
};

const FRIEND_WRITE_REPLIES = new Set(Object.values(FRIEND_WRITES).map(({ reply }) => reply));

const MAX_INT32 = 0x7fffffff;
const MAX_WIRE_STRING_BYTES = 1024 * 1024 - 6;
const MAX_PAGE_VECTOR_BYTES = 11 * FRIEND_PAGE_SIZE;

export function readFriendWriteReply(reply, errorCommand) {
  if (reply.command === errorCommand) {
    const friendCode = reply.int();
    if (friendCode < 60 || friendCode > 66) return null;
    reply.done();
    return { kind: 'friend-write', friendCode };
  }
  if (!FRIEND_WRITE_REPLIES.has(reply.command)) return null;
  const playerId = reply.int();
  reply.done();
  if (playerId < 1) throw new Error('Invalid friend write receipt.');
  return { kind: 'friend-write', command: reply.command, playerId };
}

function readIdList(value, minimum, maximum = MAX_INT32) {
  if (!value) return [];
  return value.split(',').map(field => {
    const value = Number(field);
    if (!/^(0|[1-9]\d{0,9})$/.test(field) || value < minimum || value > maximum) {
      throw new Error('Invalid friend list field.');
    }
    return value;
  });
}

export function readFriendPageReply(reply) {
  const playerIds = readIdList(reply.string(MAX_PAGE_VECTOR_BYTES, true), 1);
  const avatarIds = readIdList(reply.string(MAX_PAGE_VECTOR_BYTES, true), 0);
  const statuses = readIdList(reply.string(MAX_PAGE_VECTOR_BYTES, true), 0, 6);
  // The fourth vector is the account name, not the displayed avatar name.
  reply.discardString(MAX_WIRE_STRING_BYTES, true);
  const type = reply.int();
  const offset = reply.int();
  const friendCount = reply.int();
  const blockCount = reply.int();
  const requestCount = reply.int();
  reply.done();
  if (type < 0 || type > 2 || offset < 0 || friendCount < 0 || blockCount < 0 || requestCount < 0
    || playerIds.length > FRIEND_PAGE_SIZE || avatarIds.length !== playerIds.length || statuses.length !== playerIds.length) {
    throw new Error('Invalid friend page.');
  }
  const rows = playerIds.map((playerId, index) => Object.freeze({ playerId, avatarId: avatarIds[index], status: statuses[index] }));
  return Object.freeze({ type, offset, friendCount, blockCount, requestCount, rows: Object.freeze(rows) });
}

export function readFriendSearchReply(reply) {
  const ids = readIdList(reply.string(MAX_WIRE_STRING_BYTES, true), 1);
  reply.done();
  if (ids.length % 2 !== 0) throw new Error('Invalid friend search result.');
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 2) {
    rows.push(Object.freeze({ playerId: ids[offset], avatarId: ids[offset + 1], status: 7 }));
  }
  return rows;
}

export function readFriendAvatarReply(reply) {
  const avatarId = reply.int();
  const name = reply.string(128).replace('_rename', '');
  const level = reply.int();
  const equippedPartIds = readIdList(reply.string(4096, true), 1);
  const bp = reply.int();
  reply.done();
  if (avatarId < 1 || !name || level < 1) throw new Error('Invalid friend avatar.');
  return Object.freeze({ avatarId, name, level, equippedPartIds: Object.freeze(equippedPartIds), bp });
}
