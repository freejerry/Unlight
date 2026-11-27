const MAX_PAYLOAD = 1024 * 1024;
const U16_MAX = 65535;
const U32_MAX = 4294967295;
const NEWLINE = 10;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function applySessionKey(bytes, key) {
  if (!key) return;
  for (let offset = 0; offset < bytes.length; offset += 1) {
    bytes[offset] ^= key[offset % key.length];
  }
}

export function encodeCommand(command, fields = [], key = null) {
  if (!Number.isInteger(command) || command < 0 || command > U16_MAX) {
    throw new Error('Invalid command.');
  }
  const values = fields.map((field) => typeof field === 'string' ? encoder.encode(field) : field);
  let size = 2;
  for (const value of values) {
    if (value instanceof Uint8Array) size += 2 + value.length;
    else if (Number.isInteger(value) && value >= 0 && value <= U32_MAX) size += 4;
    else throw new Error('Invalid command field.');
  }
  if (size > U16_MAX) throw new Error('Command is too large.');

  const frame = new Uint8Array(2 + size + 1);
  const view = new DataView(frame.buffer);
  view.setUint16(0, size);
  view.setUint16(2, command);
  let offset = 4;
  for (const value of values) {
    if (value instanceof Uint8Array) {
      view.setUint16(offset, value.length);
      frame.set(value, offset + 2);
      offset += 2 + value.length;
    } else {
      view.setUint32(offset, value);
      offset += 4;
    }
  }
  applySessionKey(frame.subarray(2, offset), key);
  frame[offset] = NEWLINE;
  return frame;
}

export function createFrameParser() {
  const header = new Uint8Array(4);
  const headerView = new DataView(header.buffer);
  let headerRead = 0;
  let payload = null;
  let payloadRead = 0;

  return {
    push(chunk, receive) {
      if (!(chunk instanceof ArrayBuffer)) throw new Error('Expected a binary frame.');
      const bytes = new Uint8Array(chunk);
      let offset = 0;
      while (offset < bytes.length) {
        if (!payload) {
          const length = Math.min(header.length - headerRead, bytes.length - offset);
          header.set(bytes.subarray(offset, offset + length), headerRead);
          offset += length;
          headerRead += length;
          if (headerRead < header.length) continue;
          const payloadLength = headerView.getUint32(0);
          if (payloadLength < 2 || payloadLength > MAX_PAYLOAD) throw new Error('Invalid frame length.');
          payload = new Uint8Array(payloadLength + 1);
        }
        const length = Math.min(payload.length - payloadRead, bytes.length - offset);
        payload.set(bytes.subarray(offset, offset + length), payloadRead);
        offset += length;
        payloadRead += length;
        if (payloadRead === payload.length) {
          if (payload[payload.length - 1] !== NEWLINE) throw new Error('Invalid frame terminator.');
          const body = payload.subarray(0, payload.length - 1);
          this.reset();
          receive(body);
        }
      }
    },
    reset() {
      headerRead = 0;
      payload = null;
      payloadRead = 0;
    },
  };
}

export function readFields(body, offset = 0) {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);

  function integer(signed) {
    const value = signed ? view.getInt32(offset) : view.getUint32(offset);
    offset += 4;
    return value;
  }

  function stringBytes(limit, allowEmpty = false) {
    const length = integer(false);
    if ((!allowEmpty && length === 0) || length > limit || length > body.length - offset) {
      throw new Error('Invalid string length.');
    }
    const value = body.subarray(offset, offset + length);
    offset += length;
    return value;
  }

  return {
    uint: () => integer(false),
    int: () => integer(true),
    byte() {
      const value = view.getInt8(offset);
      offset += 1;
      return value;
    },
    string: (limit, allowEmpty) => decoder.decode(stringBytes(limit, allowEmpty)),
    discardString: (limit, allowEmpty) => stringBytes(limit, allowEmpty).fill(0),
    takeRest(limit) {
      const value = body.subarray(offset);
      if (value.length === 0 || value.length > limit) throw new Error('Invalid body length.');
      offset = body.length;
      return value;
    },
    done() {
      if (offset !== body.length) throw new Error('Unexpected response fields.');
    },
  };
}

export function readReply(body) {
  return {
    command: new DataView(body.buffer, body.byteOffset, body.byteLength).getUint16(0),
    ...readFields(body, 2),
  };
}
