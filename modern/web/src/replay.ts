type ReplayExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  allocate(length: number): number;
  deallocate(pointer: number, length: number): void;
  replay(pointer: number, length: number): bigint;
};

async function readReplayModule(): Promise<ReplayExports> {
  const controller = new AbortController();
  const deadline = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}naval_engine.wasm`, { signal: controller.signal });
    if (!response.ok) throw new Error('無法載入回放引擎，請稍後再試。');

    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
    return instance.exports as ReplayExports;
  } catch {
    throw new Error('無法載入回放引擎，請稍後再試。');
  } finally {
    window.clearTimeout(deadline);
  }
}

export async function replay<T>(input: unknown): Promise<T> {
  const engine = await readReplayModule();
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const inputPointer = engine.allocate(bytes.length);
  let result = 0n;
  try {
    new Uint8Array(engine.memory.buffer, inputPointer, bytes.length).set(bytes);
    result = engine.replay(inputPointer, bytes.length);
  } finally {
    engine.deallocate(inputPointer, bytes.length);
  }

  const outputPointer = Number((result >> 32n) & 0xffffffffn);
  const outputLength = Number(result & 0xffffffffn);
  try {
    if (!outputPointer || !outputLength) throw new Error('回放引擎沒有傳回結果。');
    const output = new Uint8Array(engine.memory.buffer, outputPointer, outputLength);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output)) as T;
  } finally {
    if (outputPointer && outputLength) engine.deallocate(outputPointer, outputLength);
  }
}

export function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) {
    return Array.isArray(right) && left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(right)) return false;

  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}
