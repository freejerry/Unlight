const WIDTH = 290;
const HEIGHT = 450;
const ORIGIN_X = 130;
const ORIGIN_Y = 410;
const PART_FILE = /^public\/image\/avatar_parts\/([A-Za-z0-9_]+_p(\d{1,3}))\.swf$/;
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
    readIndex("avatar-loadouts.json"),
    readIndex("avatar-rendered/index.json"),
  ]).catch(error => {
    manifest = undefined;
    throw error;
  });
  return manifest;
}

function layout(catalogue, raster, loadoutId) {
  const loadout = catalogue.loadouts.find(entry => entry.id === loadoutId);
  if (!loadout || !Array.isArray(loadout.partIds) || !loadout.partIds.length) {
    throw new Error("Unknown avatar loadout");
  }
  const layers = [];
  for (const partId of loadout.partIds) {
    const part = catalogue.parts[partId];
    if (!part || !Array.isArray(part.color) || part.color.length !== 4 || part.color[3] !== 1 ||
        part.color.some(value => !Number.isFinite(value) || value < 0 || value >= 10)) {
      throw new Error("Invalid avatar part colour");
    }
    for (const layer of part.layers) {
      const file = PART_FILE.exec(layer.path);
      if (!file || Number(file[2]) !== layer.depth || !catalogue.assets[layer.path] ||
          catalogue.depthAnchors[layer.depth] !== layer.anchor) throw new Error("Invalid avatar layer");
      const name = file[1];
      const clip = raster.parts[name];
      const anchor = layer.anchor === null ? [0, 0] : raster.anchors[layer.anchor];
      if (!clip || !Array.isArray(anchor) || anchor.length !== 2 || !anchor.every(Number.isFinite) ||
          ![clip.x, clip.y, clip.width, clip.height].every(Number.isInteger)) {
        throw new Error(`Incomplete avatar raster for ${name}`);
      }
      if (clip.width === 0 && clip.height === 0 && clip.src === null) continue;
      const url = new URL(`avatar-rendered/parts/${name}.png`, import.meta.url);
      if (typeof clip.src !== "string" || new URL(clip.src, import.meta.url).href !== url.href ||
          clip.width < 1 || clip.width > 512 || clip.height < 1 || clip.height > 512) {
        throw new Error(`Invalid avatar raster for ${name}`);
      }
      layers.push({
        depth: layer.depth, order: layers.length, url, width: clip.width, height: clip.height,
        x: ORIGIN_X + anchor[0] + clip.x, y: ORIGIN_Y + anchor[1] + clip.y, color: part.color,
      });
    }
  }
  // At equal depth the original inserts later attachments below earlier ones.
  layers.sort((a, b) => a.depth - b.depth || b.order - a.order);
  return { partIds: loadout.partIds, layers };
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

function tint(image, [red, green, blue]) {
  if (red === 1 && green === 1 && blue === 1) return image;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] *= red;
    pixels.data[i + 1] *= green;
    pixels.data[i + 2] *= blue;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export async function renderLobbyAvatar(canvas, loadoutId = "starter") {
  const request = {};
  previews.set(canvas, request);
  canvas.dataset.avatarState = "loading";
  try {
    const [catalogue, raster] = await loadManifest();
    const { partIds, layers } = layout(catalogue, raster, loadoutId);
    const artwork = await Promise.all(layers.map(async layer => {
      const image = await loadImage(layer.url);
      if (image.naturalWidth !== layer.width || image.naturalHeight !== layer.height) {
        throw new Error("Unexpected avatar raster dimensions");
      }
      return image;
    }));
    if (previews.get(canvas) !== request) return null;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Avatar canvas unavailable");
    for (const [index, { x, y, color }] of layers.entries()) {
      context.drawImage(tint(artwork[index], color), x, y);
    }
    canvas.dataset.avatarLoadout = loadoutId;
    canvas.dataset.avatarParts = partIds.join(",");
    canvas.dataset.avatarLayers = String(layers.length);
    canvas.dataset.avatarState = "ready";
    return { loadoutId, partIds: partIds.slice(), layerCount: layers.length };
  } catch (error) {
    if (previews.get(canvas) !== request) return null;
    canvas.width = WIDTH;
    delete canvas.dataset.avatarLoadout;
    delete canvas.dataset.avatarParts;
    delete canvas.dataset.avatarLayers;
    canvas.dataset.avatarState = "error";
    throw error;
  }
}
