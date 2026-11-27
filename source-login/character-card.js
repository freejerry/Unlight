// The authored card face uses the CharaCardClip layer order at its 168 × 240 asset size.
const ART = new URL('./card-art/', import.meta.url);
const WIDTH = 168;
const HEIGHT = 240;
const NAME_FONT = 'Unlight Card Mincho';
const NUMBER_FONT = 'Unlight Card Bradley';
const images = new Map();
const pending = new WeakMap();
const cardFrames = { 2: 7, 3: 8, 4: 9, 5: 9, 9: 9, 10: 9 };
const starX = [56, 45, 34, 23, 12, 1];
let artwork;
let fonts;

function loadArtwork() {
  artwork ??= fetch(new URL('index.json', ART), { redirect: 'error' }).then(async response => {
    if (!response.ok) throw new Error('Card artwork index unavailable.');
    const index = await response.json();
    if (index.width !== WIDTH || index.height !== HEIGHT) throw new Error('Unexpected card artwork dimensions.');
    return index;
  }).catch(error => {
    artwork = undefined;
    throw error;
  });
  return artwork;
}

function cardImage(url) {
  if (!images.has(url.href)) {
    const image = new Image();
    image.src = url.href;
    const request = image.decode().then(() => image).catch(error => {
      if (images.get(url.href) === request) images.delete(url.href);
      throw error;
    });
    if (images.size >= 96) images.delete(images.keys().next().value);
    images.set(url.href, request);
  }
  return images.get(url.href);
}

function originalLayer(file) {
  if (typeof file !== 'string' || !/^[a-z0-9-]+\.png$/.test(file)) {
    throw new Error('Unrecognized original card layer.');
  }
  return cardImage(new URL(file, ART));
}

function loadFonts(index) {
  if (index.font?.file !== 'card-names.woff') throw new Error('Unrecognized original card font.');
  fonts ??= Promise.all([
    new FontFace(NAME_FONT, `url("${new URL(index.font.file, ART)}")`),
    new FontFace(NUMBER_FONT, `url("${new URL('./fonts/bradley-gratis.ttf', import.meta.url)}")`),
  ].map(face => face.load())).then(loaded => {
    for (const face of loaded) document.fonts.add(face);
  }).catch(error => {
    fonts = undefined;
    throw error;
  });
  return fonts;
}

function number(context, value, x, y, color = '#fff') {
  context.font = `24px "${NUMBER_FONT}"`;
  context.letterSpacing = '2px';
  context.fillStyle = color;
  context.strokeText(String(value), x, y);
  context.fillText(String(value), x, y);
}

function nameLabel(context, name) {
  context.fillStyle = '#fff';
  context.letterSpacing = '1px';
  let size = 12;
  do {
    context.font = `${size}px "${NAME_FONT}", serif`;
    if (context.measureText(name).width <= 110) break;
    size -= 1;
  } while (size > 6);
  context.strokeText(name, 87, 23, 110);
  context.fillText(name, 87, 23, 110);
}

function completeCard(card) {
  return Number.isInteger(card?.id) && card.id > 0 && card.id <= 0x7fffffff
    && typeof card.name === 'string' && card.name.trim().length > 0
    && [card.kind, card.level, card.slot, card.hp, card.ap, card.dp].every(value => Number.isSafeInteger(value) && value >= 0)
    && /^[0-7]{1,6}$/.test(String(card.slot));
}

/**
 * Paint the original face using the authenticated card definition and optional deck damage.
 * A false result leaves the caller's verified card label available.
 */
export async function renderCharacterCard(canvas, card, { signal, damage = 0 } = {}) {
  const request = {};
  pending.set(canvas, request);
  if (signal?.aborted || !completeCard(card) || !Number.isSafeInteger(damage) || damage < 0) return false;
  const current = () => !signal?.aborted && pending.get(canvas) === request;
  try {
    const index = await loadArtwork();
    if (!current()) return false;
    const frameNumber = cardFrames[card.kind] ?? 2;
    const group = card.kind === 8 ? 'reborn' : card.kind === 13 ? 'episode' : 'normal';
    const level = Math.min(card.level, 5);
    const tail = card.id % 10;
    const overlayNumber = [0, 8, 11].includes(card.kind) ? level + (tail === 0 || tail > 5 ? 6 : 0) : level + 11;
    const colors = String(card.slot).split('').filter(color => color !== '0').sort();
    const localArt = index.illustrations?.[card.id];
    const illustration = localArt
      ? originalLayer(localArt)
      : cardImage(new URL(`./card-illustration/${card.id}.png`, import.meta.url));
    const [base, portrait, overlay, emptySlots, stars] = await Promise.all([
      originalLayer(index.base?.[frameNumber]),
      illustration,
      frameNumber === 2 ? originalLayer(index.overlays?.[group]?.[overlayNumber]) : null,
      frameNumber === 2 ? originalLayer(index.emptySlots?.[group]) : null,
      frameNumber === 2 ? Promise.all(colors.map(color => originalLayer(index.stars?.[color]))) : [],
      loadFonts(index),
    ]);
    if (!current()) return false;
    if (portrait.naturalWidth !== WIDTH || portrait.naturalHeight !== HEIGHT) throw new Error('Unexpected card illustration dimensions.');

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return false;
    context.drawImage(base, 0, 0);
    context.drawImage(portrait, 0, 0);
    context.lineJoin = 'round';
    context.lineWidth = 2;

    const hp = card.hp - damage;
    if (overlay) {
      context.drawImage(overlay, 0, 0);
      context.drawImage(emptySlots, 96, 24);
      stars.forEach((star, position) => context.drawImage(star, 96 + starX[position], 24));
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      context.strokeStyle = '#000';
      context.shadowColor = '#000';
      context.shadowBlur = 2;
      const hpColor = hp >= card.hp ? '#fff' : hp >= card.hp / 2 ? '#ffff30' : '#ff7070';
      number(context, hp < 100 ? hp : '@', 33, 235, hpColor);
      number(context, card.ap, 81, 235);
      number(context, card.dp, 142, 235);
      number(context, card.level, 30, 34);
    }
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.strokeStyle = '#111';
    context.shadowColor = '#111';
    context.shadowBlur = 2;
    nameLabel(context, card.name);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${card.name} Lv.${card.level} · HP ${hp} · ATK ${card.ap} · DEF ${card.dp}`);
    return true;
  } catch {
    return false;
  }
}
