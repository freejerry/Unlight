const TWIPS_PER_PIXEL = 20;
const MAX_BYTES = 1024 * 1024;
const MAX_FRAMES = 128;
const MAX_DEPTH = 16;
const MAX_PLACEMENTS = 4096;
const MAX_PIXELS = 4_000_000;
const IDENTITY = [1, 0, 0, 1, 0, 0];

class Bits {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  bits(count) {
    if (this.offset + count > this.bytes.length * 8) throw new Error("Incomplete SWF field");
    let value = 0;
    for (let bit = 0; bit < count; bit += 1, this.offset += 1) {
      value = value * 2 + ((this.bytes[this.offset >> 3] >> (7 - (this.offset & 7))) & 1);
    }
    return value;
  }

  signed(count) {
    const value = this.bits(count);
    return count && value >= 2 ** (count - 1) ? value - 2 ** count : value;
  }

  little(count) {
    let value = 0;
    for (let byte = 0; byte < count; byte += 1) value += this.bits(8) * 256 ** byte;
    return value;
  }

  align() {
    this.offset = (this.offset + 7) & ~7;
  }

  take(length) {
    const start = this.offset / 8;
    const end = start + length;
    if (!Number.isInteger(start) || end > this.bytes.length) throw new Error("Invalid SWF tag length");
    this.offset = end * 8;
    return this.bytes.subarray(start, end);
  }

  get done() { return this.offset === this.bytes.length * 8; }
}

function rectangle(reader) {
  const bits = reader.bits(5);
  const bounds = Array.from({ length: 4 }, () => reader.signed(bits));
  reader.align();
  return bounds;
}

function placementMatrix(reader) {
  let scaleX = 1;
  let scaleY = 1;
  let skewX = 0;
  let skewY = 0;
  if (reader.bits(1)) {
    const bits = reader.bits(5);
    scaleX = reader.signed(bits) / 65536;
    scaleY = reader.signed(bits) / 65536;
  }
  if (reader.bits(1)) {
    const bits = reader.bits(5);
    skewY = reader.signed(bits) / 65536;
    skewX = reader.signed(bits) / 65536;
  }
  const bits = reader.bits(5);
  const matrix = [scaleX, skewY, skewX, scaleY, reader.signed(bits), reader.signed(bits)];
  reader.align();
  return matrix;
}

function placementAlpha(reader) {
  const hasAddition = reader.bits(1);
  const hasMultiplier = reader.bits(1);
  const bits = reader.bits(4);
  const multipliers = Array.from({ length: 4 }, () => hasMultiplier ? reader.signed(bits) : 256);
  const additions = Array.from({ length: 4 }, () => hasAddition ? reader.signed(bits) : 0);
  reader.align();
  const alpha = multipliers[3];
  if (multipliers.slice(0, 3).some(value => value !== 256) || additions.some(value => value !== 0)
      || alpha < 0 || alpha > 256) throw new Error("Unsupported SWF color transform");
  return alpha / 256;
}

function styleCount(reader, extended) {
  const count = reader.bits(8);
  return count === 255 && extended ? reader.little(2) : count;
}

function readStyles(reader, extended, fills) {
  const count = styleCount(reader, extended);
  const offset = fills.length;
  for (let index = 0; index < count; index += 1) {
    if (reader.bits(8) !== 0) throw new Error("Unsupported SWF fill style");
    const color = reader.bits(24).toString(16).padStart(6, "0");
    fills.push(`#${color}`);
  }
  if (styleCount(reader, extended) !== 0) throw new Error("Unsupported SWF stroke style");
  return { offset, count, fillBits: reader.bits(4), lineBits: reader.bits(4) };
}

function recordEdge(edgesByFill, fill, start, end, control) {
  if (fill === null) return;
  if (!edgesByFill.has(fill)) edgesByFill.set(fill, []);
  edgesByFill.get(fill).push({ start, end, control });
}

function filledPath(edges) {
  const path = new Path2D();
  const starts = new Map();
  const key = ([x, y]) => `${x},${y}`;
  for (const [index, edge] of edges.entries()) {
    const position = key(edge.start);
    if (!starts.has(position)) starts.set(position, []);
    starts.get(position).push(index);
  }
  for (const group of starts.values()) group.reverse();
  const used = new Set();
  for (const [index, edge] of edges.entries()) {
    if (used.has(index)) continue;
    path.moveTo(...edge.start);
    const origin = key(edge.start);
    let next = index;
    while (next !== undefined) {
      used.add(next);
      const segment = edges[next];
      if (segment.control) path.quadraticCurveTo(...segment.control, ...segment.end);
      else path.lineTo(...segment.end);
      const end = key(segment.end);
      if (end === origin) break;
      const candidates = starts.get(end);
      while (candidates && used.has(candidates.at(-1))) candidates.pop();
      next = candidates?.pop();
    }
    path.closePath();
  }
  return path;
}

function readShape(reader, extended) {
  const bounds = rectangle(reader);
  const fills = [];
  const layers = [];
  let edges = new Map();
  let styles = readStyles(reader, extended, fills);
  let start = [0, 0];
  let left = null;
  let right = null;
  const readFill = () => {
    const index = reader.bits(styles.fillBits);
    if (!index) return null;
    if (index > styles.count) throw new Error("Invalid SWF fill index");
    return styles.offset + index - 1;
  };

  while (true) {
    if (!reader.bits(1)) {
      const flags = reader.bits(5);
      if (!flags) break;
      if (flags & 1) {
        const bits = reader.bits(5);
        start = [reader.signed(bits), reader.signed(bits)];
      }
      if (flags & 2) left = readFill();
      if (flags & 4) right = readFill();
      if ((flags & 8) && reader.bits(styles.lineBits)) throw new Error("Invalid SWF stroke index");
      if (flags & 16) {
        // New style tables begin a new paint layer on the authored shape.
        layers.push(edges);
        edges = new Map();
        reader.align();
        styles = readStyles(reader, extended, fills);
      }
      continue;
    }
    const straight = reader.bits(1);
    const bits = reader.bits(4) + 2;
    let end;
    let control = null;
    if (!straight) {
      control = [start[0] + reader.signed(bits), start[1] + reader.signed(bits)];
      end = [control[0] + reader.signed(bits), control[1] + reader.signed(bits)];
    } else if (reader.bits(1)) {
      end = [start[0] + reader.signed(bits), start[1] + reader.signed(bits)];
    } else if (reader.bits(1)) {
      end = [start[0], start[1] + reader.signed(bits)];
    } else {
      end = [start[0] + reader.signed(bits), start[1]];
    }
    recordEdge(edges, right, start, end, control);
    recordEdge(edges, left, end, start, control);
    start = end;
  }
  reader.align();
  if (!reader.done) throw new Error("Unexpected bytes after SWF shape");
  layers.push(edges);
  const paths = layers.flatMap(layer => [...layer.keys()].sort((a, b) => a - b)
    .map(fill => ({ color: fills[fill], path: filledPath(layer.get(fill)) })));
  return { bounds, paths };
}

function place(reader, display, frame) {
  const flags = reader.bits(8);
  if (flags & 0xd0) throw new Error("Unsupported SWF placement effect");
  const depth = reader.little(2);
  const previous = flags & 1 ? display.get(depth) : undefined;
  const id = flags & 2 ? reader.little(2) : previous?.id;
  const matrix = flags & 4 ? placementMatrix(reader) : previous?.matrix ?? IDENTITY;
  const alpha = flags & 8 ? placementAlpha(reader) : previous?.alpha ?? 1;
  if (flags & 32) while (reader.bits(8) !== 0) { /* The instance name has no visual effect. */ }
  if (!id || !depth || !reader.done) throw new Error("Invalid SWF placement");
  if (display.size >= MAX_PLACEMENTS && !display.has(depth)) throw new Error("SWF display list exceeds bounds");
  display.set(depth, { id, matrix, alpha, start: previous?.id === id ? previous.start : frame });
}

function readTimeline(reader, count, dictionary, depth = 0) {
  if (count < 1 || count > MAX_FRAMES || depth > MAX_DEPTH) throw new Error("Invalid SWF timeline extent");
  const display = new Map();
  const frames = [];
  while (!reader.done) {
    const header = reader.little(2);
    const kind = header >> 6;
    const size = (header & 63) === 63 ? reader.little(4) : header & 63;
    const tag = new Bits(reader.take(size));
    if (kind === 0) {
      if (size || !reader.done || frames.length !== count) throw new Error("Invalid SWF timeline end");
      return { frames };
    }
    if (kind === 1) {
      if (size || frames.length >= count) throw new Error("Invalid SWF frame");
      frames.push([...display].sort(([a], [b]) => a - b).map(([, entry]) => entry));
    } else if (kind === 2 || kind === 22 || kind === 39) {
      const id = tag.little(2);
      if (!id || dictionary.has(id)) throw new Error("Invalid SWF character ID");
      const symbol = kind === 39
        ? readTimeline(tag, tag.little(2), dictionary, depth + 1)
        : readShape(tag, kind === 22);
      if (dictionary.has(id)) throw new Error("Duplicate SWF character ID");
      dictionary.set(id, symbol);
    } else if (kind === 26) {
      place(tag, display, frames.length);
    } else if (kind === 28) {
      if (size !== 2) throw new Error("Invalid SWF removal");
      display.delete(tag.little(2));
    } else if (![9, 43, 69, 76, 82, 86].includes(kind)) {
      throw new Error(`Unsupported SWF tag ${kind}`);
    }
  }
  throw new Error("Missing SWF timeline end");
}

function matrixProduct([a, b, c, d, x, y], [e, f, g, h, u, v]) {
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h,
    a * u + c * v + x, b * u + d * v + y];
}

function cycleLength(timeline, dictionary, periods = new Map(), depth = 0) {
  if (depth > MAX_DEPTH) throw new Error("Cyclic SWF timeline");
  if (periods.has(timeline)) return periods.get(timeline);
  const { frames } = timeline;
  if (frames.length > 1) return frames.length;
  let cycle = 1;
  for (const { id } of frames[0]) {
    const child = dictionary.get(id);
    if (!child) throw new Error("Unknown SWF symbol");
    if (!child.frames) continue;
    const length = cycleLength(child, dictionary, periods, depth + 1);
    let combined = cycle;
    while (combined % length) combined += cycle;
    if (combined > MAX_FRAMES) throw new Error("SWF cycle is too long");
    cycle = combined;
  }
  periods.set(timeline, cycle);
  return cycle;
}

function frameShapes(timeline, dictionary, tick) {
  const shapes = [];
  let placements = 0;
  function visit(symbol, frame, matrix, alpha, depth) {
    if (++placements > MAX_PLACEMENTS || depth > MAX_DEPTH) throw new Error("SWF display list exceeds bounds");
    if (!symbol.frames) {
      if (symbol.paths.length) shapes.push({ symbol, matrix, alpha });
      return;
    }
    for (const entry of symbol.frames[frame % symbol.frames.length]) {
      const child = dictionary.get(entry.id);
      if (!child) throw new Error("Unknown SWF symbol");
      visit(child, frame - entry.start, matrixProduct(matrix, entry.matrix), alpha * entry.alpha, depth + 1);
    }
  }
  visit(timeline, tick, IDENTITY, 1, 0);
  return shapes;
}

function frameBounds(shapes) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const { symbol, matrix: [a, b, c, d, x, y] } of shapes) {
    const [xmin, xmax, ymin, ymax] = symbol.bounds;
    for (const u of [xmin, xmax]) {
      for (const v of [ymin, ymax]) {
        const px = (a * u + c * v + x) / TWIPS_PER_PIXEL;
        const py = (b * u + d * v + y) / TWIPS_PER_PIXEL;
        left = Math.min(left, px);
        top = Math.min(top, py);
        right = Math.max(right, px);
        bottom = Math.max(bottom, py);
      }
    }
  }
  const x = Math.floor(left);
  const y = Math.floor(top);
  return { x, y, width: Math.ceil(right) - x, height: Math.ceil(bottom) - y };
}

function drawFrame(shapes, { x, y, width, height }) {
  const image = document.createElement("canvas");
  image.width = width;
  image.height = height;
  const context = image.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  for (const { symbol, matrix: [a, b, c, d, u, v], alpha } of shapes) {
    context.setTransform(a / TWIPS_PER_PIXEL, b / TWIPS_PER_PIXEL, c / TWIPS_PER_PIXEL,
      d / TWIPS_PER_PIXEL, u / TWIPS_PER_PIXEL - x, v / TWIPS_PER_PIXEL - y);
    context.globalAlpha = alpha;
    for (const { color, path } of symbol.paths) {
      context.fillStyle = color;
      context.fill(path, "evenodd");
    }
  }
  return { image, x, y, width, height };
}

// Reads the authored solid vector shapes and display list without running SWF bytecode.
export function parseVectorMovie(fws) {
  if (!(fws instanceof Uint8Array) || fws.length < 12 || fws.length > MAX_BYTES
      || fws[0] !== 0x46 || fws[1] !== 0x57 || fws[2] !== 0x53
      || new DataView(fws.buffer, fws.byteOffset, fws.byteLength).getUint32(4, true) !== fws.length) {
    throw new Error("Invalid decoded SWF header");
  }
  const reader = new Bits(fws.subarray(8));
  rectangle(reader);
  const frameRate = reader.little(2) / 256;
  if (frameRate <= 0) throw new Error("Invalid SWF frame rate");
  const dictionary = new Map();
  const root = readTimeline(reader, reader.little(2), dictionary);
  const frameCount = cycleLength(root, dictionary);
  const rasterize = index => {
    if (!Number.isInteger(index) || index < 0 || index >= frameCount) throw new Error("Invalid SWF frame index");
    const shapes = frameShapes(root, dictionary, index);
    const bounds = frameBounds(shapes);
    if (!Number.isSafeInteger(bounds.x) || !Number.isSafeInteger(bounds.y)
        || bounds.width < 1 || bounds.height < 1 || bounds.width > 2048 || bounds.height > 2048) {
      throw new Error("SWF canvas exceeds bounds");
    }
    return drawFrame(shapes, bounds);
  };
  return { frameRate, frameCount, rasterize };
}

export function decodeVectorMovie(fws) {
  const { frameRate, frameCount, rasterize } = parseVectorMovie(fws);
  let pixels = 0;
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const frame = rasterize(index);
    pixels += frame.width * frame.height;
    if (pixels > MAX_PIXELS) throw new Error("SWF frame pixels exceed bounds");
    return frame;
  });
  return { frameRate, frames };
}
