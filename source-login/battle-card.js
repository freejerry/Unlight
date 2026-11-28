export const BATTLE_CARD_ART = '/source-login/battle-card-art/';
const art = new URL('./battle-card-art/', import.meta.url);
const SMALL_CARD = [56, 86];
const images = new Map();
const pending = new WeakMap();
let manifest;

function loadManifest() {
  manifest ??= fetch(new URL('index.json', art), { redirect: 'error' }).then(response => {
    if (!response.ok) throw new Error('Original battle art unavailable.');
    return response.json();
  }).catch(error => {
    manifest = undefined;
    throw error;
  });
  return manifest;
}

export async function battleStands(signal) {
  if (signal?.aborted) return null;
  try {
    const { stands } = await loadManifest();
    return signal?.aborted ? null : stands;
  } catch {
    return null;
  }
}

/** Original guidance arrow and rotate button, positioned about the authored card centre. */
export async function battleCardControls(signal) {
  if (signal?.aborted) return null;
  try {
    const { actionControls } = await loadManifest();
    return signal?.aborted ? null : actionControls ?? null;
  } catch {
    return null;
  }
}

function loadImage(file) {
  if (typeof file !== 'string' || !/^[a-z0-9_-]+\.png$/.test(file)) throw new Error('Invalid original battle asset path.');
  if (!images.has(file)) {
    const image = new Image();
    image.src = new URL(file, art).href;
    images.set(file, image.decode().then(() => image).catch(error => {
      images.delete(file);
      throw error;
    }));
  }
  return images.get(file);
}

function validateSide(side) {
  return side && Number.isInteger(side.type) && 0 <= side.type && side.type <= 6 && Number.isInteger(side.value);
}

function valueFrame(value) {
  return value > 9 ? 9 : value < 1 ? 9 + Math.abs(value) : value;
}

async function loadSide(value, source) {
  if (value.type === 0) return null;
  const metadata = source?.[value.type];
  const frame = valueFrame(value.value);
  if (!metadata || frame > metadata.frameCount) throw new Error('Unsupported original action card value.');
  return { image: await loadImage(metadata.file), frame, columns: metadata.columns };
}

function paintSide(context, side) {
  if (!side) return;
  const { image, frame, columns } = side;
  const [w, h] = SMALL_CARD;
  context.drawImage(image, (frame - 1) % columns * w, Math.floor((frame - 1) / columns) * h, w, h, 0, 0, w, h);
}

/** Paint a verified action/event card or the real face-down art when the protocol hides it. */
export async function renderActionCard(canvas, card, {
  signal, back = false, reversed = card?.up === false, large = false, locked = false,
} = {}) {
  const request = {};
  pending.set(canvas, request);
  if (signal?.aborted) return false;
  if (!back && (!Number.isSafeInteger(card?.id) || card.id < 1 || typeof card.image !== 'string'
      || !validateSide(card.upper) || !validateSide(card.lower))) return false;
  try {
    const index = await loadManifest();
    if (signal?.aborted || pending.get(canvas) !== request) return false;
    const state = back ? `back${large ? '-large' : ''}${locked ? '-locked' : ''}` : 'front';
    const base = index.actionFrames?.[state];
    if (!base) return false;
    let upper = null;
    let lower = null;
    let event = null;
    if (!back) {
      if (card.image) {
        const metadata = index.eventValues?.[card.image];
        if (!metadata || metadata.frame !== valueFrame(card.upper.value)) return false;
        event = loadImage(metadata.file);
      } else {
        upper = loadSide(card.upper, index.actionValues);
        lower = loadSide(card.lower, index.actionValues);
      }
    }
    const [background, top, bottom, eventImage] = await Promise.all([loadImage(base.file), upper, lower, event]);
    if (signal?.aborted || pending.get(canvas) !== request) return false;
    canvas.width = base.width;
    canvas.height = base.height;
    const context = canvas.getContext('2d');
    if (!context) return false;
    // Base and both asymmetric faces share the original card centre as their rotation origin.
    if (reversed && !back) {
      context.translate(canvas.width, canvas.height);
      context.rotate(Math.PI);
    }
    context.drawImage(background, 0, 0);
    if (eventImage) context.drawImage(eventImage, 0, 0);
    else if (!back) {
      paintSide(context, top);
      context.translate(canvas.width, canvas.height);
      context.rotate(Math.PI);
      paintSide(context, bottom);
    }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', back ? '背面卡片' : (card.caption || `行動卡 ${card.id}`));
    return true;
  } catch {
    return false;
  }
}
