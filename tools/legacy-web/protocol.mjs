const NEWLINE = 0x0a;
const COMMAND_SIZE = 2;
const CLIENT_HEADER_SIZE = 2;
const SERVER_HEADER_SIZE = 4;

export function relayURL(port, origin = globalThis.location.origin) {
  const url = new URL(`/socket/${port}`, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

// Frames carry the raw command bytes. The session layer owns payload encryption.
export function encodeClientFrame(payload) {
  if (payload.length < COMMAND_SIZE || payload.length > 0xffff) {
    throw new RangeError("Invalid client command length");
  }
  const frame = new Uint8Array(CLIENT_HEADER_SIZE + payload.length + 1);
  new DataView(frame.buffer).setUint16(0, payload.length);
  frame.set(payload, CLIENT_HEADER_SIZE);
  frame[frame.length - 1] = NEWLINE;
  return frame;
}

export class ServerFrameDecoder {
  #pending = new Uint8Array();

  push(chunk) {
    const bytes = new Uint8Array(this.#pending.length + chunk.length);
    bytes.set(this.#pending);
    bytes.set(chunk, this.#pending.length);
    const view = new DataView(bytes.buffer);
    const payloads = [];
    let offset = 0;

    while (offset + SERVER_HEADER_SIZE <= bytes.length) {
      const size = view.getUint32(offset);
      if (size < COMMAND_SIZE) {
        throw new RangeError("Invalid server command length");
      }
      const payloadStart = offset + SERVER_HEADER_SIZE;
      const marker = payloadStart + size;
      if (marker >= bytes.length) break;
      if (bytes[marker] !== NEWLINE) {
        throw new Error("Invalid server frame terminator");
      }
      payloads.push(bytes.subarray(payloadStart, marker));
      offset = marker + 1;
    }

    this.#pending = bytes.slice(offset);
    return payloads;
  }
}
