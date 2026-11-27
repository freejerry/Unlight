import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeClientFrame, relayURL, ServerFrameDecoder } from "./protocol.mjs";

test("uses the matching WebSocket scheme on the page's origin", () => {
  assert.equal(relayURL(12001, "http://127.0.0.1:4332"), "ws://127.0.0.1:4332/socket/12001");
  assert.equal(relayURL(12001, "https://preview.example"), "wss://preview.example/socket/12001");
});

test("encodes a client command with a big-endian length and newline", () => {
  assert.deepEqual(encodeClientFrame(Uint8Array.of(0, 6)), Uint8Array.of(0, 2, 0, 6, 10));
  assert.throws(() => encodeClientFrame(Uint8Array.of(0)), RangeError);
  assert.throws(() => encodeClientFrame(new Uint8Array(0x10000)), RangeError);
});

test("decodes split and coalesced frames, including a newline inside the payload", () => {
  const decoder = new ServerFrameDecoder();
  assert.deepEqual(decoder.push(Uint8Array.of(0, 0)), []);
  assert.deepEqual(decoder.push(Uint8Array.of(0, 3, 0, 7, 10)), []);
  assert.deepEqual(decoder.push(Uint8Array.of(10, 0, 0, 0, 2, 0, 35, 10, 0)), [
    Uint8Array.of(0, 7, 10),
    Uint8Array.of(0, 35),
  ]);
  assert.deepEqual(decoder.push(Uint8Array.of(0, 0, 2, 0, 3, 10)), [Uint8Array.of(0, 3)]);
});

test("rejects malformed server frames", () => {
  assert.throws(() => new ServerFrameDecoder().push(Uint8Array.of(0, 0, 0, 1, 0, 10)), RangeError);
  assert.throws(() => new ServerFrameDecoder().push(Uint8Array.of(0, 0, 0, 2, 0, 7, 0)), /terminator/);
});
