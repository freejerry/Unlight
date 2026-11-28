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

export async function battleStands(signal, definitions) {
  if (signal?.aborted) return null;
  try {
    const { stands, provenance } = await loadManifest();
    if (signal?.aborted) return null;
    if (!definitions) return stands;
    const bySource = new Map();
    for (const [id, pose] of Object.entries(stands)) {
      const source = provenance?.[pose.stand.file]?.source;
      if (source && !bySource.has(source)) bySource.set(source, { ...pose, sourceCardId: Number(id) });
    }
    const resolved = { ...stands };
    for (const [id, card] of definitions) {
      // StandCharaImage loads the stand image name, shared by levels of the same character.
      const pose = bySource.get(`public/image/standchara/${card.standImage}.swf`);
      if (pose) resolved[id] = pose;
    }
    return resolved;
  } catch {
    return null;
  }
}

const conditionSymbols = { S: '近', A: '遠', E: '特', D: '防', M: '移', W: '無' };
const rangeNames = { S: '近', M: '中', L: '遠' };

// Feat.condition_str_gen builds the localized caption before FeatInfo parses it.
function skillCondition(condition) {
  const [prefix, input] = condition.includes(':') ? condition.split(':', 2) : ['', condition];
  const range = [...'SML'].filter(letter => prefix.includes(letter)).map(letter => rangeNames[letter]).join(',');
  const cards = [];
  const types = Object.keys(conditionSymbols);
  const append = (types, pattern, format) => {
    for (const type of types) {
      for (const match of input.matchAll(new RegExp(pattern.replace('@', type), 'g'))) cards.push(format(match, type));
    }
  };
  for (const operator of ['+', '-']) {
    append(types.slice(0, 5), `@([1-9])\\${operator}`, ([, value], type) => conditionSymbols[type] + value + operator);
    if (operator === '+') append([''], '(\\[[SAEDM]+\\])([1-9])\\+', ([, set, value]) => set + value + '+');
  }
  append(types, '@([1-9])(?:[^+\\-*]|$)', ([, value], type) => conditionSymbols[type] + value);
  append(types, '@([1-9])[^+\\-]([1-9])', ([, value, count], type) => Array(Number(count)).fill(conditionSymbols[type] + value).join(','));
  append(['W'], '@\\*([1-9])', ([, count]) => Array(Number(count)).fill('無1+').join(','));
  append(types.slice(0, 5), '@0', (_, type) => conditionSymbols[type] + '0');
  return [range, cards.join(',')].filter((value, index) => index || value).join(':');
}

/** Localized source feat requirements, effect, and reverse-side description. */
export function formatBattleSkill(skill, cardCondition) {
  if (typeof skill?.caption !== 'string' || !skill.caption.startsWith('[')) return null;
  const source = skill.caption
    .replaceAll('__CONDITION__', () => skillCondition(skill.condition ?? ''))
    .replaceAll('__POW__', () => String(skill.power ?? ''));
  // A combined card requirement can contain its own brackets, e.g. [SA]3+.
  let depth = 1;
  let end = 1;
  while (end < source.length && depth) {
    if (source[end] === '[') depth += 1;
    if (source[end] === ']') depth -= 1;
    end += 1;
  }
  if (depth) return null;
  const [phase, range, baseCards] = source.slice(1, end - 1).split(':');
  const cards = cardCondition ?? baseCards;
  const [effect, ...story] = source.slice(end).split('|');
  const requirements = [
    ['階段', phase.replace(/攻撃/g, '攻擊').replace(/防御/g, '防禦')],
  ];
  if (range !== undefined) requirements.push(['距離', `${range.replace('近,中,遠', '全')}距離`]);
  if (cards !== undefined) requirements.push(['卡片', cards
    .replace(/(.)\+/g, '合計$1以上').replace(/(.)-/g, '合計$1以下')
    .replace(/[近遠SA]/g, symbol => ({ 近: '劍', 遠: '槍', S: '劍', A: ',槍' })[symbol])
    .replace(/D/g, ',防')]);
  return {
    requirements,
    cardCondition: cards ?? '',
    effect: effect.replace(/,\s?/g, '\n').replace(/ATK/g, '攻擊力').replace(/DEF/g, '防禦力').replace(/MOV/g, '移動力'),
    description: [effect, ...story].join('\n'),
  };
}

export async function battleCharacterReverse(signal) {
  try {
    if (signal?.aborted) return null;
    const { characterReverse } = await loadManifest();
    if (!characterReverse) return null;
    const { plate, tab, requirementChips } = characterReverse;
    const layers = [plate, tab.up, tab.selected, ...Object.values(tab.phases), ...Object.values(tab.ranges).flat()];
    const optionalChips = requirementChips
      ? Promise.resolve().then(() => loadImage(requirementChips.file)).then(() => true, () => false)
      : false;
    const [chipsReady] = await Promise.all([optionalChips, ...layers.map(layer => loadImage(layer.file))]);
    if (signal?.aborted) return null;
    return chipsReady ? characterReverse : { ...characterReverse, requirementChips: undefined };
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

/** Original first-exchange dice and result artwork. */
export async function battleExchangeArt(signal) {
  if (signal?.aborted) return null;
  try {
    const { exchange } = await loadManifest();
    return signal?.aborted ? null : exchange ?? null;
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
