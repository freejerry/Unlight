const WIDTH = 290;
const HEIGHT = 450;
const ORIGIN_X = 130;
const ORIGIN_Y = 410;
const PART_FILE = /^public\/image\/avatar_parts\/([A-Za-z0-9_]+_p(\d{1,3}))\.swf$/;
const WARDROBE = new URL("avatar-wardrobe/", import.meta.url);
const previews = new WeakMap();
const images = new Map();
let manifest;

async function readIndex(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`Avatar index unavailable (${response.status})`);
  return response.json();
}

function loadManifest() {
  manifest ??= Promise.all([
    readIndex("avatar-catalog.json"),
    readIndex(new URL("index.json", WARDROBE)),
  ]).catch(error => {
    manifest = undefined;
    throw error;
  });
  return manifest;
}

function sourceSheet(raster, index) {
  const sheet = raster.sheets[index];
  if (!Number.isInteger(index) || !sheet || !/^sheet-\d+\.png$/.test(sheet.file) ||
      ![sheet.width, sheet.height].every(value => Number.isInteger(value) && value > 0 && value <= 4096)) return null;
  return { ...sheet, url: new URL(sheet.file, WARDROBE) };
}

function sourceLayer(catalogue, raster, layer) {
  const file = PART_FILE.exec(layer.path);
  if (layer.availability !== "present" || !file || Number(file[2]) !== layer.depth ||
      !catalogue.assets[layer.path] || catalogue.depthAnchors[layer.depth] !== layer.anchor) return null;
  const clip = raster.parts[file[1]];
  const anchor = layer.anchor === null ? [0, 0] : raster.anchors[layer.anchor];
  if (!clip || !Array.isArray(anchor) || anchor.length !== 2 || !anchor.every(Number.isFinite) ||
      ![clip.x, clip.y, clip.width, clip.height].every(Number.isInteger)) return null;
  if (clip.width === 0 && clip.height === 0) return { blank: true };
  const sheet = sourceSheet(raster, clip.sheet);
  if (!sheet || ![clip.sx, clip.sy].every(value => Number.isInteger(value) && value >= 0) ||
      clip.width < 1 || clip.width > 512 || clip.height < 1 || clip.height > 512 ||
      clip.sx + clip.width > sheet.width || clip.sy + clip.height > sheet.height) return null;
  return { ...clip, sheet, x: ORIGIN_X + anchor[0] + clip.x, y: ORIGIN_Y + anchor[1] + clip.y };
}

function layout(catalogue, raster, partIds) {
  const ordered = partIds.map(id => ({ id, part: catalogue.parts[id] }));
  // AvatarPartInventory sorts equipped parts by descending part type before attaching them.
  ordered.sort((a, b) => (b.part?.type ?? -1) - (a.part?.type ?? -1));
  const missing = new Set();
  const layers = [];
  for (const { id, part } of ordered) {
    if (!part || !Array.isArray(part.layers) || !Array.isArray(part.color) || part.color.length !== 4 || part.color[3] !== 1 ||
        part.color.some(value => !Number.isFinite(value) || value < 0 || value >= 10)) {
      missing.add(id);
      continue;
    }
    if (part.emptyImageReference) missing.add(id);
    for (const layer of part.layers) {
      const clip = sourceLayer(catalogue, raster, layer);
      if (!clip) missing.add(id);
      else if (!clip.blank) layers.push({ ...clip, id, depth: layer.depth, order: layers.length, color: part.color });
    }
  }
  // At equal depth the original inserts later attachments below earlier ones.
  layers.sort((a, b) => a.depth - b.depth || b.order - a.order);
  return { layers, missing };
}

function loadImage(url) {
  if (!images.has(url.href)) {
    const image = new Image();
    image.src = url.href;
    images.set(url.href, image.decode().then(() => image).catch(error => {
      images.delete(url.href);
      throw error;
    }));
  }
  return images.get(url.href);
}

function drawLayer(context, image, { sx, sy, x, y, width, height, color: [red, green, blue] }) {
  if (red === 1 && green === 1 && blue === 1) {
    context.drawImage(image, sx, sy, width, height, x, y, width, height);
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const scratch = canvas.getContext("2d");
  scratch.drawImage(image, sx, sy, width, height, 0, 0, width, height);
  const pixels = scratch.getImageData(0, 0, width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] *= red;
    pixels.data[i + 1] *= green;
    pixels.data[i + 2] *= blue;
  }
  scratch.putImageData(pixels, 0, 0);
  context.drawImage(canvas, x, y);
}

function showAvatarArrival(canvas, request, signal) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof canvas.animate !== "function") return;
  // AvatarClip slides and fades into place using a sine ease-in.
  const frames = Array.from({ length: 13 }, (_, step) => {
    const opacity = 1 - Math.cos(step * Math.PI / 24);
    return { opacity, transform: `translateX(${200 * (1 - opacity)}px)` };
  });
  const animation = canvas.animate(frames, 2100 / 1.7);
  request.animation = animation;
  const stop = () => animation.cancel();
  signal?.addEventListener("abort", stop, { once: true });
  const cleanup = () => signal?.removeEventListener("abort", stop);
  void animation.finished.then(cleanup, cleanup);
}

export async function renderLobbyAvatar(canvas, equippedPartIds, { signal } = {}) {
  if (signal?.aborted) return null;
  const partIds = Array.isArray(equippedPartIds) && equippedPartIds.every(id => Number.isSafeInteger(id) && id > 0)
    ? equippedPartIds.slice() : [];
  const request = {};
  previews.get(canvas)?.animation?.cancel();
  previews.set(canvas, request);
  const current = () => previews.get(canvas) === request && !signal?.aborted;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.dataset.avatarParts = partIds.join(",");
  canvas.dataset.avatarLayers = "0";
  delete canvas.dataset.avatarMissingParts;
  if (!partIds.length) {
    canvas.dataset.avatarState = "unavailable";
    return { partIds, missingPartIds: [], layerCount: 0 };
  }
  canvas.dataset.avatarState = "loading";
  try {
    const [catalogue, raster] = await loadManifest();
    if (!current()) return null;
    const { layers, missing } = layout(catalogue, raster, partIds);
    const artwork = await Promise.all(layers.map(async layer => {
      try {
        const { url, width, height } = layer.sheet;
        const image = await loadImage(url);
        if (image.naturalWidth === width && image.naturalHeight === height) return image;
      } catch {
        // A failed raster sheet must not hide available equipment from other sheets.
      }
      missing.add(layer.id);
      return null;
    }));
    if (!current()) return null;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Avatar canvas unavailable");
    let layerCount = 0;
    for (const [index, layer] of layers.entries()) {
      if (!artwork[index]) continue;
      drawLayer(context, artwork[index], layer);
      layerCount += 1;
    }
    const missingPartIds = [...new Set(partIds.filter(id => missing.has(id)))];
    if (missingPartIds.length) canvas.dataset.avatarMissingParts = missingPartIds.join(",");
    canvas.dataset.avatarLayers = String(layerCount);
    canvas.dataset.avatarState = !layerCount ? "unavailable" : missingPartIds.length ? "partial" : "ready";
    if (layerCount) showAvatarArrival(canvas, request, signal);
    return { partIds, missingPartIds, layerCount };
  } catch (error) {
    if (!current()) return null;
    canvas.width = WIDTH;
    canvas.dataset.avatarState = "error";
    throw error;
  }
}
