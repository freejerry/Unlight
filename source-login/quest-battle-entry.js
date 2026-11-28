import { playQuestBattleEffect } from './bgm.js';
import { BATTLE_CARD_ART, battleCardControls, battleCharacterReverse, battleExchangeArt, battleStands, formatBattleSkill, renderActionCard } from './battle-card.js';
import { renderCharacterCard } from './character-card.js';
import { createQuestBattleExchange } from './quest-battle-exchange.js';
import { createQuestBattleChange } from './quest-battle-change.js';
import { createQuestBattleReserve } from './quest-battle-reserve.js';
import { createQuestFeatPlayback } from './quest-battle-feat.js';
import {
  animateInitialDeckCount, createCoveredOpponentCards, createQuestBattleMove, sweepQuestTableCards,
} from './quest-battle-move.js';
import { mountQuestDuelResult } from './quest-battle-result.js';
import { playQuestDiceRoll } from './quest-dice-roll.js';
import { playQuestAttackPose, playQuestHitEffect } from './quest-hit-effect.js';

const art = new URL('./quest-art/', import.meta.url);
const deckArt = new URL('./quest-deck-stock-art/', import.meta.url);
const decodedStages = new WeakMap();
const sineOut = 'linear(0, .1951, .3827, .5556, .7071, .8315, .9239, .9808, 1)';
const quadIn = 'linear(0, .015625, .0625, .140625, .25, .390625, .5625, .765625, 1)';
const characterFlipTime = 300;
const characterFlipSwap = -Math.log2(1 - 94 / 180) * characterFlipTime / 10;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function prepareQuestBattleStage(layers) {
  if (!decodedStages.has(layers)) {
    const media = new Map(layers.map(layer => [layer.file, layer]));
    const decoding = Promise.all(Array.from(media.values(), layer => {
      const image = new Image(layer.width, layer.height);
      image.src = new URL(layer.file, art);
      return image.decode();
    })).then(() => true, () => false);
    decodedStages.set(layers, decoding);
  }
  return decodedStages.get(layers);
}

function wait(milliseconds, signal) {
  if (milliseconds <= 0 || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(finish, milliseconds);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish, { once: true });
  });
}

// Transition.as thresholds a seeded grayscale fractal noise field over the outgoing scene.
function makeNoise(width, height, { baseX, baseY, octaves, seedUpperBound }) {
  const seed = Math.floor(Math.random() * seedUpperBound);
  const values = new Uint8Array(width * height);
  const smooth = t => t * t * (3 - 2 * t);
  const interpolate = (a, b, t) => a + (b - a) * t;
  function gradient(column, row, dx, dy) {
    let hash = Math.imul(column, 374761393) + Math.imul(row, 668265263) + seed;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    return ((hash & 1) ? dx : -dx) + ((hash & 2) ? dy : -dy);
  }
  for (let y = 0, pixel = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, pixel += 1) {
      let total = 0;
      for (let octave = 0, frequency = 1; octave < octaves; octave += 1, frequency *= 2) {
        const u = x * frequency / baseX;
        const v = y * frequency / baseY;
        const column = Math.floor(u);
        const row = Math.floor(v);
        const dx = u - column;
        const dy = v - row;
        const sx = smooth(dx);
        const sy = smooth(dy);
        const top = interpolate(gradient(column, row, dx, dy), gradient(column + 1, row, dx - 1, dy), sx);
        const bottom = interpolate(gradient(column, row + 1, dx, dy - 1), gradient(column + 1, row + 1, dx - 1, dy - 1), sx);
        total += interpolate(top, bottom, sy) / frequency;
      }
      values[pixel] = Math.max(0, Math.min(255, Math.round(128 + total * 100)));
    }
  }
  return values;
}

function dissolve(board, battle, timing, signal) {
  function settle() {
    board.hidden = true;
    board.style.maskImage = '';
    battle.dataset.burn = 'settled';
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || signal.aborted) { settle(); return; }
  const canvas = document.createElement('canvas');
  // Sample the mask at half resolution; its coordinates remain those of the authored scene.
  canvas.width = timing.width / 2;
  canvas.height = timing.height / 2;
  const context = canvas.getContext('2d');
  if (!context) { settle(); return; }
  const pixels = context.createImageData(canvas.width, canvas.height);
  const noise = makeNoise(canvas.width, canvas.height, {
    ...timing.mask, baseX: timing.mask.baseX / 2, baseY: timing.mask.baseY / 2,
  });
  const frameMs = 1000 / timing.framesPerSecond;
  let frame = 0;
  let threshold = 0;
  let animation;
  const started = performance.now();
  function stop() {
    if (animation) cancelAnimationFrame(animation);
    signal.removeEventListener('abort', stop);
    settle();
  }
  function advance(now) {
    if (reducedMotion.matches || signal.aborted) { stop(); return; }
    const reached = Math.floor((now - started) / frameMs);
    if (reached >= timing.thresholdUpdates) { stop(); return; }
    if (frame < reached) {
      while (frame < reached) {
        threshold = Math.floor(threshold + (timing.thresholdMax - threshold) * timing.thresholdFactor);
        frame += 1;
      }
      const gray = threshold / 0x010101;
      for (let pixel = 0; pixel < noise.length; pixel += 1) pixels.data[pixel * 4 + 3] = noise[pixel] > gray ? 255 : 0;
      context.putImageData(pixels, 0, 0);
      board.style.maskImage = `url("${canvas.toDataURL()}")`;
    }
    animation = requestAnimationFrame(advance);
  }
  battle.dataset.burn = 'burning';
  signal.addEventListener('abort', stop, { once: true });
  animation = requestAnimationFrame(advance);
}

function layer(parent, className, depth, id) {
  const node = document.createElement('div');
  node.className = `quest-battle-layer ${className}`;
  node.style.zIndex = depth;
  if (id) node.id = id;
  parent.append(node);
  return node;
}

function place(node, x, y, width, height) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  if (width !== undefined) node.style.width = `${width}px`;
  if (height !== undefined) node.style.height = `${height}px`;
  return node;
}

function sprite(parent, artLayer, root = art) {
  if (!artLayer?.file) return null;
  const { file, x, y, width, height, depth } = artLayer;
  const image = new Image(width, height);
  image.src = root instanceof URL ? new URL(file, root) : root + file;
  image.alt = '';
  place(image, x, y, width, height);
  if (depth !== undefined) image.style.zIndex = depth;
  parent.append(image);
  return image;
}

function drawStageLayer(battle, source, signal, tracks) {
  if (source.animation) {
    const { x, y, width, height, depth, animation } = source;
    const { frameCount, columns, framesPerSecond } = animation;
    const clip = layer(battle, 'quest-battle-stage-animation', depth);
    place(clip, x, y, width, height);
    clip.style.overflow = 'clip';
    clip.dataset.frame = '0';
    const sheet = sprite(clip, { file: source.file, x: 0, y: 0, width: columns * width, height: Math.ceil(frameCount / columns) * height });
    tracks.push({ clip, sheet, width, height, frameCount, columns, framesPerSecond, frame: 0 });
    return;
  }
  if (!source.scroll || reduced()) {
    sprite(battle, source);
    return;
  }
  const { x, y, width, height, depth, scroll: { direction, stepsPerSecond } } = source;
  const band = layer(battle, 'quest-battle-far-band', depth);
  place(band, x, y, width, height);
  const tile = { file: source.file, x: 0, y: 0, width, height };
  sprite(band, tile);
  sprite(band, { ...tile, x: -direction * width });
  // FarBG ScrollThread copies the cached bitmap twice, advancing one whole pixel every two source frames.
  const animation = band.animate([
    { transform: 'translateX(0px)' },
    { transform: `translateX(${direction * width}px)` },
  ], { duration: 1000 * width / stepsPerSecond, iterations: Infinity, easing: `steps(${width}, end)` });
  signal.addEventListener('abort', () => animation.cancel(), { once: true });
}

function drawStageLayers(battle, layers, signal) {
  const tracks = [];
  for (const source of layers) drawStageLayer(battle, source, signal, tracks);
  if (!tracks.length || reduced() || signal.aborted) return;
  const started = performance.now();
  let animation;
  function advance(now) {
    if (signal.aborted) return;
    for (const track of tracks) {
      const frame = Math.floor(Math.max(0, now - started) * track.framesPerSecond / 1000) % track.frameCount;
      if (frame === track.frame) continue;
      track.frame = frame;
      track.clip.dataset.frame = String(frame);
      const x = -(frame % track.columns) * track.width;
      const y = -Math.floor(frame / track.columns) * track.height;
      track.sheet.style.transform = `translate(${x}px, ${y}px)`;
    }
    animation = requestAnimationFrame(advance);
  }
  signal.addEventListener('abort', () => cancelAnimationFrame(animation), { once: true });
  animation = requestAnimationFrame(advance);
}

async function animate(node, frames, duration, signal, delay = 0, easing = sineOut) {
  if (!node || reduced() || signal.aborted) return;
  const animation = node.animate(frames, { duration, delay, easing, fill: 'both' });
  const cancel = () => animation.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try { await animation.finished; } catch { /* Scene exit aborts the queued tween. */ }
  finally { signal.removeEventListener('abort', cancel); animation.cancel(); }
}

function output(parent, id, className, x, y, width, height) {
  const node = document.createElement('output');
  node.id = id;
  node.className = className;
  place(node, x, y, width, height);
  parent.append(node);
  return node;
}

function mountDeckStock(battle, initialCount, signal) {
  const root = layer(battle, 'quest-battle-deck', 6, 'quest-battle-deck');
  const label = output(root, 'quest-battle-deck-count', 'quest-battle-deck-count', -6, 53);
  label.setAttribute('aria-label', '剩餘行動牌');
  // The displayed buildup is cosmetic. Card deals always use the confirmed stock count.
  let count = initialCount;
  let displayed;
  let draw;
  function paint(value) {
    if (signal.aborted) return;
    displayed = value;
    label.value = String(value);
    draw?.(value);
  }

  let cancelInitial = animateInitialDeckCount(count, paint, signal);
  void fetch(new URL('index.json', deckArt), { signal, redirect: 'error' }).then(async response => {
    if (!response.ok) return;
    const { atlas, frame, minCount, maxCount } = await response.json();
    if (atlas.file !== 'deck-stock.png' || signal.aborted) return;
    const image = new Image();
    image.src = new URL(atlas.file, deckArt);
    await image.decode();
    if (signal.aborted || image.naturalWidth !== atlas.width || image.naturalHeight !== atlas.height) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'quest-battle-deck-stock';
    canvas.setAttribute('aria-hidden', 'true');
    const { x, y, width, height } = frame;
    canvas.width = width;
    canvas.height = height;
    place(canvas, x, y, width, height);
    const context = canvas.getContext('2d');
    if (!context) return;
    root.prepend(canvas);
    draw = value => {
      context.clearRect(0, 0, width, height);
      delete canvas.dataset.count;
      if (value < minCount || value > maxCount) return;
      const index = value - minCount;
      const sx = index % atlas.columns * width;
      const sy = Math.floor(index / atlas.columns) * height;
      context.drawImage(image, sx, sy, width, height, 0, 0, width, height);
      canvas.dataset.count = String(value);
    };
    if (Number.isInteger(displayed)) draw(displayed);
  }).catch(() => { /* The count stays readable if the stock artwork cannot be loaded. */ });

  return {
    root,
    startDeal() {
      if (!cancelInitial) return;
      cancelInitial();
      cancelInitial = undefined;
      if (displayed !== count) paint(count);
    },
    deal() { if (count > 0 && !signal.aborted) paint(--count); },
  };
}

function character(parent, definition, id, damage, x, y, scale, signal) {
  const canvas = document.createElement('canvas');
  canvas.width = 168;
  canvas.height = 240;
  canvas.dataset.cardId = String(id);
  canvas.className = 'quest-battle-character-card';
  canvas.setAttribute('aria-label', definition?.name || `角色卡 ${id}`);
  place(canvas, x, y, 168 * scale, 240 * scale);
  canvas.hidden = true;
  parent.append(canvas);
  const ready = renderCharacterCard(canvas, definition, { signal, damage }).then(painted => {
    if (painted && !signal.aborted) canvas.hidden = false;
  });
  return { canvas, ready };
}

const reverseChipTypes = { 近: 'swd', 遠: 'gun', 移: 'mov', 特: 'str', 防: 'shd', 無: 'wld' };

function rewrittenCardCondition(raw) {
  if (raw === '') return raw;
  if (typeof raw !== 'string') return;
  // Ruby supplies already-localized range characters, which may be concatenated. Flash keeps the original range icons.
  const [range, cards, excess] = raw.split(':');
  if (typeof cards === 'string' && excess === undefined && /^[近中遠]*$/.test(range)) return cards;
}

function battleSkillChips(raw) {
  return raw.split(',').flatMap(token => {
    const set = /\[([^\]]+)\]/.exec(token);
    const symbol = Object.keys(reverseChipTypes).find(value => token.includes(value));
    const type = set ? set[1].length > 1 && 'wld3' : reverseChipTypes[symbol];
    const number = token.match(/[0-9]/)?.[0];
    if (!type || number === undefined) return [];
    const category = token.includes('+') ? 1 : token.includes('-') ? 2 : 0;
    return [{ type, frame: category * 10 + (Number(number) || 10) }];
  });
}

function mountCharacterTurnCue(button, artwork, signal, canShow) {
  if (!artwork?.file) return;
  const [left, top] = artwork.hit;
  place(button, ...artwork.hit);
  const cue = sprite(button, { ...artwork, x: artwork.x - left, y: artwork.y - top }, BATTLE_CARD_ART);
  cue.className = 'quest-battle-character-turn-cue';
  cue.style.pointerEvents = 'none';
  cue.setAttribute('aria-hidden', 'true');
  cue.hidden = true;
  const frames = artwork.alphaSteps256.map(alpha => ({ opacity: alpha / 256, easing: 'steps(1, end)' }));
  const duration = (frames.length - 1) * 1000 / artwork.framesPerSecond;
  let hovered = false;
  let loaded = false;
  let reveal;
  function refresh() {
    if (signal.aborted || !loaded || !hovered || !canShow()) {
      reveal?.cancel();
      reveal = undefined;
      cue.hidden = true;
    } else if (cue.hidden) {
      cue.hidden = false;
      if (!reduced()) reveal = cue.animate(frames, { duration, fill: 'both' });
    }
  }
  function leave() {
    hovered = false;
    refresh();
  }
  button.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    refresh();
  }, { signal });
  button.addEventListener('pointerleave', leave, { signal });
  button.addEventListener('pointercancel', leave, { signal });
  signal.addEventListener('abort', refresh, { once: true });
  void cue.decode().then(() => {
    loaded = true;
    refresh();
  }).catch(() => {});
  return refresh;
}

function inspectCharacter(parent, definition, id, damage, signal, rosterIndex = 0, elementId = 'quest-battle-player-character') {
  const card = document.createElement('div');
  card.id = elementId;
  card.className = 'quest-battle-character-inspect';
  card.dataset.cardId = String(id);
  card.dataset.rosterIndex = String(rosterIndex);
  card.dataset.face = 'front';
  place(card, 0, 440, 168, 240);
  parent.append(card);

  const { canvas, ready } = character(card, definition, id, damage, 0, 0, 1, signal);
  const flip = document.createElement('button');
  flip.className = 'quest-battle-character-flip';
  flip.type = 'button';
  flip.hidden = true;
  flip.setAttribute('aria-label', definition?.name ? `翻轉${definition.name}的角色卡` : '翻轉角色卡');
  flip.setAttribute('aria-pressed', 'false');
  place(flip, 0, 0, 168, 240);
  card.append(flip);

  const rear = document.createElement('div');
  rear.className = 'quest-battle-character-review';
  rear.hidden = true;
  card.append(rear);
  const requirementsId = elementId === 'quest-battle-player-character' ? 'quest-battle-character-requirements' : `${elementId}-requirements`;
  let flipping = false;
  let refreshTurnCue;
  let overrides;
  let refreshConditions = () => {};
  function updateConditions(row) {
    if (signal.aborted || row?.index !== rosterIndex) return;
    const next = row.cardId === id ? row.featConditions : undefined;
    if (next === overrides) return;
    overrides = next;
    refreshConditions();
  }
  const skills = (definition?.skills ?? []).slice(0, 4).map(skill => ({ ...skill, detail: formatBattleSkill(skill) }));
  void Promise.all([ready, battleCharacterReverse(signal)]).then(([, art]) => {
    if (!art || signal.aborted || canvas.hidden) return;
    sprite(rear, art.plate, BATTLE_CARD_ART);
    const content = document.createElement('div');
    rear.append(content);
    const groups = [];
    const atlas = art.requirementChips;
    refreshConditions = () => {
      for (const { i, skill, label, holder, selected } of groups) {
        const change = rewrittenCardCondition(overrides?.[i]);
        const cards = change ?? skill.detail?.cardCondition ?? '';
        const changed = String(change !== undefined);
        if (holder.dataset.cards === cards && label.dataset.conditionChanged === changed) continue;
        holder.dataset.cards = cards;
        label.dataset.conditionChanged = changed;
        holder.replaceChildren();
        if (!atlas) {
          if (selected) holder.textContent = change ?? skill.detail?.requirements.find(([name]) => name === '卡片')?.[1] ?? '';
          continue;
        }
        battleSkillChips(cards).forEach(({ type, frame }, index) => {
          const source = atlas.sources[type];
          if (!source) return;
          const chip = document.createElement('span');
          chip.className = 'quest-battle-character-chip';
          chip.dataset.type = type;
          chip.dataset.frame = String(frame);
          chip.setAttribute('aria-hidden', 'true');
          const sx = (frame - 1) % atlas.columns * atlas.width;
          const sy = (source.row + Math.floor((frame - 1) / atlas.columns)) * atlas.height;
          chip.style.backgroundImage = `url("${BATTLE_CARD_ART}${atlas.file}")`;
          chip.style.backgroundPosition = `-${sx}px -${sy}px`;
          place(chip, atlas.origin[0] + atlas.offset[0] + atlas.stepX * index,
            atlas.origin[1] + atlas.offset[1] + atlas.stepY * i, atlas.width, atlas.height);
          holder.append(chip);
        });
        const readable = document.createElement('span');
        readable.className = 'sr-only';
        readable.textContent = cards.replace(/近/g, '劍').replace(/遠/g, '槍').replace(/\+/g, '以上').replace(/-/g, '以下');
        holder.append(readable);
      }
    };
    function select(index) {
      content.replaceChildren();
      groups.length = 0;
      skills.forEach((skill, i) => {
        const y = 24 + i * 30;
        const selected = i === index;
        const put = layer => {
          if (layer) sprite(content, { ...layer, x: layer.x + 5, y: layer.y + y }, BATTLE_CARD_ART);
        };
        put(selected ? art.tab.selected : art.tab.up);
        put(art.tab.phases[skill.kind]);
        const range = skill.detail?.requirements.find(([name]) => name === '距離')?.[1] ?? '';
        for (const [key, frames] of Object.entries(art.tab.ranges)) put(frames[Number(range.startsWith('全') || range.includes(key))]);
        const feat = document.createElement('button');
        feat.type = 'button';
        feat.className = 'quest-battle-character-feat';
        feat.textContent = skill.name;
        feat.dataset.featIndex = String(i);
        if (Number.isInteger(skill.id)) feat.dataset.featId = String(skill.id);
        feat.setAttribute('aria-pressed', String(selected));
        place(feat, 4, 22 + i * 30, 154, 18);
        feat.addEventListener('click', () => {
          if (flipping || selected) return;
          select(i);
          content.querySelectorAll('button')[i].focus({ preventScroll: true });
        });
        const holder = document.createElement('div');
        holder.id = `${requirementsId}-${i}`;
        feat.setAttribute('aria-describedby', holder.id);
        if (!atlas) {
          holder.className = 'quest-battle-character-requirements';
          place(holder, 64, 25 + i * 30, 95);
        }
        groups.push({ i, skill, label: feat, holder, selected });
        content.append(feat, holder);
        if (!selected || !skill.detail) return;
        const description = document.createElement('p');
        description.className = 'quest-battle-character-description';
        description.textContent = skill.detail.description;
        place(description, 4, 146, 160, 90);
        content.append(description);
      });
      refreshConditions();
    }
    select(0);
    refreshTurnCue = mountCharacterTurnCue(flip, art.frontTurn, signal, () => !flipping && card.dataset.face === 'front');
    canvas.setAttribute('aria-hidden', 'true');
    flip.hidden = false;
  });

  flip.addEventListener('click', async () => {
    if (flipping || signal.aborted) return;
    flipping = true;
    refreshTurnCue?.();
    flip.setAttribute('aria-disabled', 'true');
    const showRear = card.dataset.face === 'front';
    const start = showRear ? 0 : 180;
    playQuestBattleEffect('flip', signal);
    let animation;
    if (!reduced()) {
      if (!showRear) rear.style.transform = 'scaleX(-1)';
      const frames = Array.from({ length: 31 }, (_, index) => {
        const part = index / 30;
        const angle = part < 1 ? 1 - 2 ** (-10 * part) : 1;
        return { transform: `rotateY(${start + angle * 180}deg)` };
      });
      animation = card.animate(frames, { duration: characterFlipTime, fill: 'both' });
      await wait(characterFlipSwap, signal);
    }
    if (!signal.aborted) {
      canvas.hidden = showRear;
      rear.hidden = !showRear;
      rear.style.transform = animation && showRear ? 'scaleX(-1)' : '';
      card.dataset.face = showRear ? 'back' : 'front';
      flip.setAttribute('aria-pressed', String(showRear));
      if (animation) await wait(characterFlipTime - characterFlipSwap, signal);
    }
    animation?.cancel();
    rear.style.transform = '';
    flip.removeAttribute('aria-disabled');
    flipping = false;
    refreshTurnCue?.();
  });
  return { card, canvas, ready, updateConditions };
}

function createDamageScopes(standees, signal, activeRoster) {
  const scopes = new Map();
  function target(side) {
    const actor = standees.querySelector(`.quest-battle-stand[data-side="${side}"]`);
    const roster = activeRoster()?.[side];
    const index = roster?.activeIndex;
    if (!actor || (roster && roster.cards[index]?.cardId !== Number(actor.dataset.cardId))) return null;
    return { actor, index };
  }
  function clear() {
    for (const scope of scopes.values()) scope.controller.abort();
    scopes.clear();
  }
  function sync() {
    for (const [side, scope] of scopes) {
      const current = target(side);
      if (current?.actor === scope.actor && current.index === scope.index) continue;
      scope.controller.abort();
      scopes.delete(side);
    }
  }
  return {
    get(side) {
      sync();
      if (signal.aborted) return null;
      const current = target(side);
      if (!current) return null;
      if (!scopes.has(side)) {
        const controller = new AbortController();
        scopes.set(side, { ...current, controller, signal: AbortSignal.any([signal, controller.signal]) });
      }
      return scopes.get(side).signal;
    },
    sync,
    clear,
  };
}

function renderHealth(layerNode, assets, encounter, definitions, signal) {
  const health = assets.hud.health;
  const indicators = new Map();
  sprite(layerNode, health?.base);
  for (const [index, [side, cardIds, damage, x]] of [
    ['player', encounter.playerCardIds, encounter.playerDamage, 10],
    ['opponent', encounter.opponentCardIds, encounter.opponentDamage, 600],
  ].entries()) {
    const gauge = health?.gauges?.[index];
    let line;
    if (gauge) {
      line = gaugeLine(layerNode, gauge);
      line.style.background = health.color;
    }
    const label = health?.labels?.[side === 'player' ? 'player' : 'foe'];
    const healthValue = output(layerNode, `quest-battle-${side}-hp`, 'quest-battle-hp', label?.x ?? x, label?.y ?? 397);
    healthValue.setAttribute('aria-label', side === 'player' ? '我方生命值' : '對手生命值');
    const current = document.createElement('strong');
    const total = document.createTextNode('');
    healthValue.append(current, total);
    indicators.set(side, { current, total, healthValue, line });
    const card = definitions.get(cardIds[0]);
    const hp = Number.isInteger(card?.hp) && Number.isInteger(damage[0]) ? Math.max(0, card.hp - damage[0]) : null;
    setActor(side, { index: 0, cardId: cardIds[0], hp });
  }

  function scale(hp, max) {
    return `scaleX(${Math.max(0, Math.min(1, hp / max))})`;
  }

  function setActor(side, row) {
    const record = indicators.get(side);
    const { current, total, healthValue, line } = record;
    const max = definitions.get(row.cardId)?.hp;
    const hp = Number.isInteger(row.hp) ? row.hp : null;
    record.row = row;
    record.maximum = max;
    healthValue.dataset.cardId = String(row.cardId);
    healthValue.dataset.rosterIndex = String(row.index);
    healthValue.hidden = !Number.isInteger(max);
    if (Number.isInteger(max)) healthValue.dataset.max = String(max);
    else delete healthValue.dataset.max;
    if (hp !== null) healthValue.dataset.hp = String(hp);
    else delete healthValue.dataset.hp;
    current.textContent = hp === null ? '?' : String(hp);
    total.data = Number.isInteger(max) ? `/${max}` : '';
    if (line) {
      for (const animation of line.getAnimations()) animation.cancel();
      line.hidden = !(Number.isInteger(max) && max > 0 && hp !== null);
      line.style.transform = line.hidden ? 'scaleX(0)' : scale(hp, max);
    }
  }

  async function update(hitPoints) {
    const changes = [];
    for (const [side, record] of indicators) {
      const { current, healthValue, line, maximum, row } = record;
      const hp = hitPoints[side];
      if (!Number.isInteger(hp) || !Number.isInteger(maximum) || hp === Number(healthValue.dataset.hp)) continue;
      const previous = line?.style.transform;
      const next = maximum > 0 ? scale(hp, maximum) : 'scaleX(0)';
      if (line) {
        line.hidden = maximum <= 0;
        line.style.transform = next;
      }
      changes.push((async () => {
        if (line) await animate(line, [{ transform: previous }, { transform: next }], 100, signal);
        if (signal.aborted || record.row !== row) return;
        healthValue.dataset.hp = String(hp);
        current.textContent = String(hp);
      })());
    }
    await Promise.all(changes);
  }
  return { setActor, update };
}

async function actionCards(ids, signal) {
  if (!ids.length || signal.aborted) return new Map();
  const query = new URLSearchParams();
  for (const id of new Set(ids)) query.append('id', String(id));
  try {
    const response = await fetch(`/api/action-card-catalog?${query}`, {
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (response.ok) return new Map((await response.json()).cards.map(card => [card.id, card]));
  } catch { /* Only the server-confirmed ID/orientation are necessary for a fallback. */ }
  return new Map();
}

function playerCard(parent, entry, index, count) {
  const card = document.createElement('li');
  card.className = 'quest-battle-hand-card';
  card.dataset.cardId = String(entry.id);
  card.dataset.up = String(entry.up);
  card.dataset.kind = entry.kind;
  const label = `${entry.kind === 'event' ? '事件牌' : '行動牌'} ${entry.id}，${entry.up ? '正向' : '反向'}`;
  card.setAttribute('aria-label', label);
  const detail = document.createElement('span');
  detail.textContent = `#${entry.id}`;
  card.append(detail);
  const spacing = 60 * Math.max(.68, Math.min(1, 560 / count / 60));
  place(card, 202 + index * spacing, 512);
  parent.append(card);
  return card;
}

async function revealHand(hands, ready, signal, { onDeal, onEvent, opponentHandCount, covered }) {
  const entries = [
    ...ready.action.cards.map(card => ({ ...card, kind: 'action' })),
    ...ready.event.cards.map(card => ({ ...card, kind: 'event' })),
  ];
  const metadata = actionCards(entries.map(card => card.id), signal);
  const newlyDrawn = ready.action.opponentDrawCount + ready.event.opponentDrawCount;
  const count = Number.isInteger(opponentHandCount) ? opponentHandCount : newlyDrawn;
  const survivors = hands.player.children.length;
  const players = entries.map((entry, index) => playerCard(hands.player, entry, survivors + index, survivors + entries.length));
  const opponents = covered.draw(count, 0, false).slice(Math.max(0, count - newlyDrawn));
  if (ready.turn > 1 && !Number.isInteger(opponentHandCount)) {
    delete hands.opponent.dataset.count;
    hands.opponent.setAttribute('aria-label', `對手本次補牌 ${newlyDrawn} 張`);
  }

  const faceRendering = metadata.then(cards => {
    if (signal.aborted) return;
    return Promise.all(players.map(async (node, index) => {
      const entry = entries[index];
      const definition = cards.get(entry.id);
      if (!definition) return;
      const face = entry.up ? definition.upper : definition.lower;
      if (face) {
        node.dataset.faceType = String(face.type);
        node.dataset.faceValue = String(face.value);
      }
      const canvas = document.createElement('canvas');
      if (await renderActionCard(canvas, definition, { signal, reversed: !entry.up }) && !signal.aborted) {
        node.replaceChildren(canvas);
      }
    }));
  });

  const deal = (node, i) => {
    const delay = 20 + i * 300;
    if (!reduced()) void wait(delay * .9, signal).then(() => playQuestBattleEffect('deal', signal));
    if (reduced()) onDeal();
    else void wait(10 + i * 330, signal).then(() => { if (!signal.aborted) onDeal(); });
    const x = 40 - Number.parseFloat(node.style.left);
    const y = 105 - Number.parseFloat(node.style.top);
    return Promise.all([
      animate(node, [{ opacity: 0 }, { opacity: 1 }], 100 / 1.7, signal, delay),
      animate(node, [{ transform: `translate(${x}px,${y}px)` }, { transform: 'none' }], 300 / 1.7, signal, delay),
    ]);
  };
  const playerActions = players.slice(0, ready.action.cards.length);
  const foeActions = opponents.slice(0, ready.action.opponentDrawCount);
  const interleaved = [];
  for (let index = 0; index < Math.max(playerActions.length, foeActions.length); index += 1) {
    if (playerActions[index]) interleaved.push(playerActions[index]);
    if (foeActions[index]) interleaved.push(foeActions[index]);
  }
  const eventCards = [...players.slice(playerActions.length), ...opponents.slice(foeActions.length)];
  for (const card of eventCards) card.hidden = true;
  await Promise.all(interleaved.map(deal));
  if (signal.aborted) return;
  if (eventCards.length) onEvent();
  await Promise.all(eventCards.map(card => {
    card.hidden = false;
    return animate(card, [{ opacity: 0 }, { opacity: 1 }], 400 / 1.7, signal, 100 / 1.7);
  }));
  await faceRendering;
  return metadata;
}

function assetAt(parent, part, x, y, flip = false) {
  const image = sprite(parent, part && { ...part, x: x + part.x, y: y + part.y }, BATTLE_CARD_ART);
  if (image && flip) image.style.transform = 'scaleX(-1)';
  return image;
}

const standPosition = {
  player: [288, 184, 80, 184],
  opponent: [472, 576, 680, 576],
};

function drawStand(parent, stands, side, id, distance, opening, distanceArt) {
  const pose = stands?.[id];
  const foe = side === 'opponent';
  const part = opening ? pose?.opening : pose?.stand;
  if (!part) return;
  const xs = (foe ? distanceArt?.foeX : distanceArt?.playerX) ?? standPosition[side];
  const [x, y] = opening ? part.origin : [xs[distance - 1], distanceArt?.y ?? 416];
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const standNode = artwork => {
    const originX = foe ? x - artwork.width - artwork.x * 2 : x;
    const node = assetAt(parent, artwork, originX, y, foe);
    node.dataset.side = side;
    node.dataset.standOffsetX = String(Number.parseFloat(node.style.left) - x);
    node.dataset.distance = String(distance);
    return node;
  };
  if (!opening && pose.shadow) standNode(pose.shadow);
  const image = standNode(part);
  image.dataset.cardId = String(id);
  image.dataset.standSourceCardId = String(pose.sourceCardId ?? id);
  image.classList.add('quest-battle-stand');
  return { image, part, foe };
}

function drawStands(parent, stands, encounter, opening = false, distanceArt) {
  const { playerCardIds, opponentCardIds, duel } = encounter;
  return [
    drawStand(parent, stands, 'player', playerCardIds[0], duel.distance, opening, distanceArt),
    drawStand(parent, stands, 'opponent', opening ? opponentCardIds.at(-1) : opponentCardIds[0], duel.distance, opening, distanceArt),
  ].filter(Boolean);
}

function moveStands(parent, distance, signal, distanceArt) {
  const anchors = { player: distanceArt?.playerX ?? standPosition.player, opponent: distanceArt?.foeX ?? standPosition.opponent };
  const shifts = [];
  for (const actor of parent.querySelectorAll('[data-stand-offset-x]')) {
    const x = anchors[actor.dataset.side]?.[distance - 1] + Number(actor.dataset.standOffsetX);
    if (!Number.isFinite(x)) continue;
    const nextLeft = `${x}px`;
    const oldLeft = actor.style.left;
    actor.style.left = nextLeft;
    actor.dataset.distance = String(distance);
    if (oldLeft !== nextLeft) shifts.push(animate(actor, [{ left: oldLeft }, { left: nextLeft }],
      distanceArt?.durationMs ?? 300, signal, 0, quadIn));
  }
  return Promise.all(shifts);
}

function confirmedBattleActors(snapshot) {
  const { roster, characterChange } = snapshot;
  const applied = characterChange?.closed && ['movement', 'defeated'].includes(characterChange.kind) ? characterChange.applied : null;
  const actors = {};
  for (const side of ['player', 'opponent']) {
    const party = roster?.[side];
    const change = applied?.[side];
    const index = change?.index ?? party?.activeIndex;
    const row = party?.cards?.[index];
    if (!row || row.index !== index || !Number.isSafeInteger(row.cardId) || (change && row.cardId !== change.cardId)) return null;
    actors[side] = row;
  }
  return actors;
}

function openingNames(parent, encounter, definitions, signal) {
  const names = layer(parent, 'quest-battle-opening-names', 8);
  const single = encounter.playerCardIds.length === 1 && encounter.opponentCardIds.length === 1;
  for (const [ids, x, step] of [[encounter.playerCardIds, 104, 12], [encounter.opponentCardIds, 432, -12]]) {
    ids.forEach((id, index) => {
      const definition = definitions.get(id);
      if (!definition?.name) return;
      const name = document.createElement('div');
      name.className = 'quest-battle-opening-name';
      name.textContent = definition.name;
      const abbreviation = definition.abName ?? '';
      const first = abbreviation.indexOf('-');
      const title = first === -1 ? abbreviation : abbreviation.slice(first + 1, abbreviation.lastIndexOf('-')).trim();
      if (title) {
        const short = document.createElement('small');
        short.textContent = title;
        name.append(short);
      }
      place(name, x + (single ? step : step * index), 598 + (single ? 24 : 24 * index));
      names.append(name);
    });
  }
  return animate(names, [{ opacity: 0 }, { opacity: 1 }], 1000 / 1.7, signal, 500 / 1.7);
}

function bringOnStands(nodes, signal, framesPerSecond) {
  return Promise.all(nodes.map(({ image, part, foe }) => {
    const frames = part.frames.slice(0, part.settledFrame);
    const rawTransform = (value) => {
      if (!value) return { visibility: 'hidden' };
      const [scaleX, scaleY, tx, ty] = value;
      return { visibility: 'visible',
        transform: `translate(${foe ? -tx : tx}px,${ty}px) scale(${foe ? -scaleX : scaleX},${scaleY})` };
    };
    const pose = rawTransform(frames.at(-1));
    image.style.transform = pose.transform;
    if (reduced() || signal.aborted) return;
    const animation = image.animate(frames.map((value, index) => ({
      ...rawTransform(value), offset: index / Math.max(1, frames.length - 1), easing: 'steps(1, end)',
    })), { duration: 1000 * frames.length / framesPerSecond });
    const abort = () => animation.cancel();
    signal.addEventListener('abort', abort, { once: true });
    return animation.finished.catch(() => {}).finally(() => signal.removeEventListener('abort', abort));
  }));
}

function cloneAvatar(parent, source, x, y) {
  if (!source || !['ready', 'partial'].includes(source.dataset.avatarState)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(source, 0, 0);
  canvas.className = 'quest-battle-avatar';
  canvas.setAttribute('aria-hidden', 'true');
  place(canvas, x, y);
  parent.append(canvas);
  return canvas;
}

async function runFrames(parent, timeline, signal) {
  if (!timeline?.frames?.length) return null;
  const { frames, framesPerSecond } = timeline;
  const frame = sprite(parent, frames.find(Boolean));
  if (!frame) return null;
  const show = next => {
    frame.hidden = !next;
    if (!next) return;
    place(frame, next.x, next.y, next.width, next.height);
    frame.src = new URL(next.file, art);
  };
  if (reduced()) { show(frames.at(-1)); return frame; }
  show(frames[0]);
  const frameMs = 1000 / framesPerSecond;
  const start = performance.now();
  for (let index = 1; index < frames.length && !signal.aborted; index += 1) {
    await wait(frameMs * index - (performance.now() - start), signal);
    if (!signal.aborted) show(frames[index]);
  }
  return frame;
}

async function runOpening(battle, sourceAvatar, { assets, encounter, definitions, stands, signal }) {
  const { opening } = assets;
  const scene = layer(battle, 'quest-battle-opening', 20, 'quest-battle-intro');
  const interval = ms => reduced() ? Promise.resolve() : wait(ms, signal);
  battle.dataset.intro = 'place';
  await interval(1000);
  if (signal.aborted) return;

  battle.dataset.intro = 'banner';
  await Promise.all([runFrames(scene, opening.up, signal), runFrames(scene, opening.down, signal)]);
  if (signal.aborted) return;

  const avatar = cloneAvatar(scene, sourceAvatar, 200, 230);
  await animate(avatar, [{ transform: 'translateX(-380px) scaleX(-1)' }, { transform: 'scaleX(-1)' }], 900 / 1.7, signal);
  if (avatar) avatar.style.transform = 'scaleX(-1)';
  const single = encounter.playerCardIds.length === 1 && encounter.opponentCardIds.length === 1;
  const namesArt = sprite(scene, opening.names?.[single ? '1on1' : '3on3']);
  await animate(namesArt, [{ opacity: 0 }, { opacity: 1 }], 500 / 1.7, signal);

  battle.dataset.intro = 'roster';
  const names = openingNames(scene, encounter, definitions, signal);
  await interval(1600);
  if (signal.aborted) return;
  const lineup = [];
  for (const [ids, damage, x, step] of [
    [encounter.playerCardIds, encounter.playerDamage, 272, -56],
    [encounter.opponentCardIds, encounter.opponentDamage, 404, 56],
  ]) {
    ids.forEach((id, index) => {
      const { canvas, ready } = character(scene, definitions.get(id), id, damage[index], x + index * step, 456, .5, signal);
      lineup.push(ready, animate(canvas, [{ transform: 'translateY(224px)' }, { transform: 'none' }], 500 / 1.7, signal,
        (600 - 200 * index) / 1.7));
    });
  }
  await Promise.all([names, ...lineup]);
  await interval(1000);
  if (signal.aborted) return;

  battle.dataset.intro = 'characters';
  const openingStands = drawStands(scene, stands, encounter, true);
  await Promise.all([bringOnStands(openingStands, signal, assets.transition.framesPerSecond), interval(1000 / 1.7)]);
  await interval(2000);
  if (signal.aborted) return;
  battle.dataset.intro = 'exit';
  await Promise.all([
    animate(scene, [{ opacity: 1 }, { opacity: 0 }], 900 / 1.7, signal),
    animate(avatar, [{ transform: 'scaleX(-1)' }, { transform: 'translateX(-380px) scaleX(-1)' }], 900 / 1.7, signal),
  ]);
  scene.remove();
}

function gaugeLine(parent, { x, y, width, height, direction }) {
  const line = document.createElement('span');
  line.className = 'quest-battle-time-gauge';
  line.style.transformOrigin = direction === -1 ? 'right center' : 'left center';
  place(line, direction === -1 ? x - width : x, y, width, height);
  parent.append(line);
  return line;
}

function startMoveTimer(parent, time, signal, onTimeout, combat = false) {
  if (!time) return () => {};
  const base = sprite(parent, time.base);
  const meter = output(parent, combat ? 'quest-battle-combat-time' : 'quest-battle-move-time', 'sr-only', 0, 0);
  meter.setAttribute('role', 'timer');
  meter.setAttribute('aria-live', 'off');
  meter.setAttribute('aria-label', combat ? '攻防階段時間' : '移動階段時間');
  const gauges = time.gauges.map(position => gaugeLine(parent, position));
  const started = performance.now();
  const { colors, colorStops, warningAt } = time;
  let timerArt = time.base?.file;
  meter.dataset.durationMs = String(time.durationMs);
  let frame;
  function freeze() {
    if (frame) cancelAnimationFrame(frame);
    frame = undefined;
    if (base && timerArt !== time.base.file) base.src = new URL(time.base.file, art);
    meter.remove();
  }
  function cancel() {
    freeze();
    signal.removeEventListener('abort', cancel);
    base?.remove();
    for (const line of gauges) line.remove();
  }
  cancel.freeze = freeze;
  function draw(now) {
    const remaining = Math.max(0, time.durationMs - (now - started));
    const ratio = remaining / time.durationMs;
    const seconds = String(Math.ceil(remaining / 1000));
    if (meter.value !== seconds) meter.value = seconds;
    meter.dataset.warning = String(ratio < warningAt);
    if (base && time.warning?.frames.length) {
      const { frames, framesPerSecond } = time.warning;
      const warningSince = time.durationMs * (1 - warningAt);
      const index = Math.floor((now - started - warningSince) * framesPerSecond / 1000);
      const source = index >= 0 ? frames[reduced() ? 0 : index % frames.length] : time.base;
      if (source.file !== timerArt) {
        timerArt = source.file;
        base.src = new URL(timerArt, art);
      }
    }
    const elapsed = 1 - ratio;
    const first = elapsed < colorStops[1] ? 0 : 1;
    const weight = Math.min(100, (elapsed - colorStops[first]) / (colorStops[first + 1] - colorStops[first]) * 100);
    for (const line of gauges) {
      line.style.transform = `scaleX(${ratio})`;
      line.style.background = `color-mix(in srgb, ${colors[first]} ${100 - weight}%, ${colors[first + 1]})`;
    }
    if (signal.aborted) return;
    if (remaining > 0) frame = requestAnimationFrame(draw);
    else onTimeout?.();
  }
  signal.addEventListener('abort', cancel, { once: true });
  draw(started);
  return cancel;
}

function createHands(battle) {
  const root = layer(battle, 'quest-battle-hands', 25);
  const player = document.createElement('ol');
  player.id = 'quest-battle-player-hand';
  player.setAttribute('aria-label', '我方手牌');
  const playerTable = document.createElement('ol');
  playerTable.id = 'quest-battle-player-table';
  playerTable.setAttribute('aria-label', '我方已放置的牌');
  const opponent = document.createElement('div');
  opponent.id = 'quest-battle-opponent-hand';
  opponent.setAttribute('role', 'img');
  const opponentTable = document.createElement('div');
  opponentTable.id = 'quest-battle-opponent-table';
  opponentTable.setAttribute('role', 'img');
  root.append(opponent, opponentTable, playerTable, player);
  return { root, player, opponent, opponentTable, playerTable };
}

function renderChatDecoration(battle, chat) {
  if (!chat?.base) return;
  const decoration = layer(battle, 'quest-battle-chat-decoration', 16, 'quest-battle-chat-decoration');
  decoration.setAttribute('aria-hidden', 'true');
  sprite(decoration, chat.base);
  if (chat.log) {
    const { x, y, width, height, color, opacity } = chat.log;
    const log = document.createElement('div');
    log.className = 'quest-battle-chat-log';
    place(log, x, y, width, height);
    log.style.background = color;
    log.style.opacity = opacity;
    decoration.append(log);
  }
  for (const { text, x, y, width, height, color } of chat.labels) {
    const label = document.createElement('span');
    label.className = 'quest-battle-chat-label';
    label.textContent = text;
    label.style.color = color;
    place(label, x, y, width, height);
    decoration.append(label);
  }
  return decoration;
}

function renderSkills(battle, skills, player, foe, { signal, definitions } = {}) {
  if (!skills?.base) return;
  const strip = layer(battle, 'quest-battle-skills', 5, 'quest-battle-skills');
  const detailLayer = layer(battle, 'quest-battle-skill-detail-layer', 31);
  const detail = document.createElement('div');
  detail.id = 'quest-battle-skill-detail';
  detail.setAttribute('role', 'tooltip');
  detail.setAttribute('aria-hidden', 'true');
  detailLayer.append(detail);
  const byId = new Map();
  for (const card of definitions?.values() ?? [player, foe]) {
    for (const skill of card?.skills ?? []) byId.set(skill.id, skill);
  }
  const requests = new Map();
  const rows = { player: [], opponent: [] };
  const defaults = { player, opponent: foe };
  let roster;
  let replacementRoster;
  let ready = new Set();
  let activeLabel;
  strip.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeLabel) hideDetails(activeLabel);
  });
  function hideDetails(target) {
    if (target !== activeLabel) return;
    activeLabel.removeAttribute('aria-describedby');
    activeLabel = null;
    detail.setAttribute('aria-hidden', 'true');
  }
  function showDetails(target, data, x, y, side, id) {
    if (activeLabel && activeLabel !== target) hideDetails(activeLabel);
    activeLabel = target;
    target.setAttribute('aria-describedby', detail.id);
    detail.dataset.side = side;
    detail.dataset.skillId = String(id);
    place(detail, x, y, 150);
    const heading = title => {
      const label = document.createElement('strong');
      label.textContent = title;
      return label;
    };
    const list = document.createElement('dl');
    for (const [name, value] of data.requirements) {
      const term = document.createElement('dt');
      term.textContent = `${name} :`;
      const description = document.createElement('dd');
      description.textContent = value;
      list.append(term, description);
    }
    const effect = document.createElement('div');
    effect.className = 'quest-battle-skill-effect';
    effect.append(heading('[效果]'), data.effect);
    detail.replaceChildren(heading('[條件]'), list, effect);
    detail.setAttribute('aria-hidden', 'false');
  }
  function addRow(side, index) {
    const position = side === 'player' ? skills.player : skills.foe;
    const x = position.x + position.step * index;
    const y = position.y;
    const base = sprite(strip, { ...skills.base, x: x + skills.base.x, y: y + skills.base.y });
    const phase = new Image();
    phase.alt = '';
    const name = document.createElement('span');
    name.className = 'quest-battle-skill-name';
    name.dataset.side = side;
    name.dataset.featIndex = String(index);
    const label = skills.labelOffset;
    const labelX = x + label.x;
    const labelY = y + label.y;
    place(name, labelX, labelY, label.width, label.height);
    const row = { base, phase, name, x, y };
    const own = side === 'player';
    const show = () => {
      if (row.caption) showDetails(name, row.caption, labelX - (own ? 12 : 5),
        labelY + (own ? 0 : 26), side, row.definition.id);
    };
    name.addEventListener('pointerenter', show);
    name.addEventListener('pointerleave', () => {
      if (!name.matches(':focus-visible')) hideDetails(name);
    });
    name.addEventListener('focus', () => {
      if (name.matches(':focus-visible')) show();
    });
    name.addEventListener('blur', () => {
      if (!name.matches(':hover')) hideDetails(name);
    });
    strip.append(phase, name);
    return row;
  }

  function requestDefinition(featId) {
    if (requests.has(featId) || signal?.aborted) return;
    requests.set(featId, 'loading');
    const deadline = AbortSignal.timeout(5000);
    void fetch(`/api/quest-feat-catalog?ids=${featId}`, {
      redirect: 'error', signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    }).then(async response => {
      if (!response.ok) return;
      const { feats } = await response.json();
      const definition = feats?.find(item => item.id === featId && Number.isInteger(item.featNo));
      if (definition && !signal?.aborted) byId.set(featId, definition);
    }).catch(() => {}).finally(() => {
      requests.set(featId, 'unavailable');
      if (!signal?.aborted) paint();
    });
  }

  function paint() {
    for (const side of ['player', 'opponent']) {
      const current = roster?.[side];
      const index = current?.activeIndex ?? 0;
      const actor = current?.cards?.find(card => card.index === index);
      const replacementActor = replacementRoster?.[side]?.cards?.find(card => card.index === index && card.cardId === actor?.cardId);
      const fallback = defaults[side];
      const card = current ? definitions?.get(actor?.cardId) ?? (actor?.cardId === fallback?.id ? fallback : null) : fallback;
      const count = Math.min(4, card?.skills?.length ?? 0);
      for (let slot = 0; slot < Math.max(count, rows[side].length); slot += 1) {
        const row = rows[side][slot] ??= addRow(side, slot);
        const baseSkill = slot < count ? card.skills[slot] : undefined;
        const replacement = baseSkill && replacementActor?.featReplacements?.[slot];
        const featId = replacement?.featId ?? baseSkill?.id;
        const original = replacement ? byId.get(featId) : baseSkill;
        const matches = !replacement || original?.featNo === replacement.featNo;
        const definition = matches ? original : undefined;
        if (replacement && !definition && !Number.isInteger(original?.featNo)) requestDefinition(featId);
        const marker = definition && skills.types[definition.kind];
        const key = `${index}:${card?.id}:${replacement?.featId}:${replacement?.featNo}`;
        if (row.key !== key || row.definition !== definition) {
          hideDetails(row.name);
          row.key = key;
          row.definition = definition;
          // Only a new rendered skill refreshes the source caption cache. SC120 changes the canonical card separately.
          const cardCondition = definition && definition.id === baseSkill.id
            ? rewrittenCardCondition(actor?.featConditions?.[slot]) : undefined;
          row.caption = formatBattleSkill(definition, cardCondition);
          row.name.textContent = definition?.name ?? '';
          if (definition) row.name.dataset.skillKind = definition.kind;
          else delete row.name.dataset.skillKind;
          if (row.caption) row.name.tabIndex = 0;
          else row.name.removeAttribute('tabindex');
          if (marker) {
            row.phase.src = new URL(marker.file, art);
            place(row.phase, row.x + marker.x, row.y + marker.y, marker.width, marker.height);
          }
        }
        row.base.hidden = !baseSkill;
        row.phase.hidden = !marker;
        row.name.hidden = !marker;
        row.name.dataset.rosterIndex = String(index);
        row.name.dataset.definitionState = definition ? 'ready' : requests.get(featId) ?? 'unavailable';
        if (Number.isInteger(featId)) row.name.dataset.skillId = String(featId);
        else delete row.name.dataset.skillId;
        row.name.dataset.ready = String(side === 'player' && Boolean(definition) && ready.has(featId));
      }
    }
  }
  paint();
  return { strip, detailLayer, update(feats, parties, presentedReplacements = parties) {
    ready = new Set(feats?.readyIds);
    roster = parties;
    replacementRoster = presentedReplacements;
    paint();
  } };
}

function createSkillPresentation(skills) {
  const queued = [];
  let feats;
  let roster;
  let presented = null;
  const paint = () => skills?.update(feats, roster, presented);
  return {
    observe(next, exchange) {
      const { roster: nextRoster } = next;
      const changed = ['player', 'opponent'].some(side => nextRoster?.[side]?.cards?.some(card =>
        card.featReplacements !== roster?.[side]?.cards?.[card.index]?.featReplacements));
      ({ feats, roster } = next);
      if (changed) {
        const after = exchange?.cards ? exchange.key : queued.at(-1)?.after;
        if (after) queued.push({ after, roster });
        else presented = roster;
      }
      paint();
    },
    waiting(after) { return queued[0]?.after === after; },
    release(after) {
      while (queued[0]?.after === after) {
        presented = queued.shift().roster;
        paint();
      }
    },
  };
}

function showMoveCutIns(battle, manifest, actors, signal, onlySide, stands) {
  const cutIn = layer(battle, 'quest-battle-cut-ins', 17, onlySide ? undefined : 'quest-battle-cut-ins');
  const poses = [];
  for (const [id, foe] of [[actors.player.cardId, false], [actors.opponent.cardId, true]]) {
    if (onlySide && onlySide !== (foe ? 'opponent' : 'player')) continue;
    const source = manifest?.cutIns?.[id] ?? manifest?.cutIns?.[stands?.[id]?.sourceCardId];
    if (!source?.image) continue;
    const actor = sprite(cutIn, source.image);
    actor.dataset.side = foe ? 'opponent' : 'player';
    actor.dataset.cardId = String(id);
    if (foe) actor.style.transform = 'scaleX(-1)';
    const { image, pivot, framesPerSecond } = source;
    async function play(frames) {
      if (!frames?.length) return;
      const start = performance.now();
      for (const [i, offset] of (reduced() ? [frames.at(-1)] : frames).entries()) {
        if (signal.aborted) return;
        if (i) await wait(i * 1000 / framesPerSecond - (performance.now() - start), signal);
        if (signal.aborted) return;
        actor.hidden = !offset;
        if (!offset) continue;
        const x = pivot[0] + offset.x + image.x;
        const y = pivot[1] + offset.y + image.y;
        place(actor, foe ? 760 - x - image.width : x, y);
      }
    }
    const entered = play(source.enter);
    poses.push(async () => { await entered; await play(source.exit); });
  }
  return async () => { await Promise.all(poses.map(exit => exit())); cutIn.remove(); };
}

function revealMoveCards(hands, result, signal) {
  const rows = [
    [hands.playerTable, result.playerCards, false, 380, 389, false],
    [hands.opponentTable, result.opponentCards, result.opponentLocked, 378, 127, true],
  ];
  const definitions = actionCards(rows.flatMap(([, cards, locked]) => locked ? [] : cards.map(card => card.id)), signal);
  return Promise.all(rows.map(async ([parent, cards, locked, cx, cy, side]) => {
    const backs = side ? Array.from(parent.children).filter(node => node.classList.contains('quest-battle-dealt-back')) : [];
    parent.replaceChildren();
    parent.dataset.count = String(cards.length);
    parent.dataset.locked = String(side ? result.opponentLocked : result.playerLocked);
    if (side) parent.setAttribute('aria-label', `對手${locked ? '封鎖' : '亮出'} ${cards.length} 張牌`);
    const nodes = cards.map(({ id, up }, index) => {
      const card = document.createElement(side ? 'div' : 'li');
      card.className = 'quest-battle-hand-card quest-battle-reveal-card';
      if (!locked) {
        card.dataset.cardId = String(id);
        card.dataset.up = String(up);
      }
      card.dataset.locked = String(locked);
      const x = cx + (index - (cards.length - 1) / 2) * (side ? -60 : 60);
      place(card, x, cy);
      parent.append(card);
      const back = backs[index];
      if (back) {
        const dx = Number.parseFloat(back.style.left) - x;
        back.classList.remove('quest-battle-dealt-back');
        back.removeAttribute('style');
        card.append(back);
        if (dx) void animate(card, [{ translate: `${dx}px 0` }, { translate: '0 0' }], 200 / 1.7, signal);
      }
      return { card, back };
    });
    const known = await definitions;
    for (const [i, { card, back }] of nodes.entries()) {
      if (signal.aborted) return;
      const { id, up } = cards[i];
      const canvas = document.createElement('canvas');
      const painted = await renderActionCard(canvas, known.get(id), { signal, reversed: !up, back: locked, large: locked, locked });
      if (signal.aborted) return;
      if (side) playQuestBattleEffect(locked ? 'reveal-locked' : 'reveal', signal);
      if (back && !locked) await animate(back, [{ scale: '1 1' }, { scale: '.02 1' }], 50, signal);
      if (signal.aborted) return;
      if (painted) card.replaceChildren(canvas);
      else if (!locked) card.textContent = `#${id}`;
      const duration = back && !locked ? 50 : 100;
      if (side && painted && !locked) await animate(canvas, [{ scale: '.02 1' }, { scale: '1 1' }], duration, signal);
      else if (side && !reduced()) await wait(duration, signal);
    }
    if (side && nodes.length && !reduced()) await wait(300, signal);
  }));
}

function showMoveArrows(battle, assets, result, signal) {
  const from = assets?.arrows;
  if (!from || reduced()) return Promise.resolve();
  const { playerX, foeX, y, step, staggerMs, showMs, holdMs, hideMs, cancelTargetX } = assets.arrowLayout;
  const graphics = layer(battle, 'quest-battle-move-arrows', 31, 'quest-battle-move-arrows');
  const pairs = [];
  const shown = [];
  for (const [power, x, dx] of [[result.playerPower, playerX, step], [-result.opponentPower, foeX, -step]]) {
    const source = power > 0 ? from.left : from.right;
    if (!source) continue;
    const side = [];
    for (let i = 0; i < Math.abs(power); i += 1) {
      const image = sprite(graphics, { ...source, x: x + i * dx + source.x, y: y + source.y });
      side.push(image);
      shown.push(animate(image, [{ opacity: 0 }, { opacity: 1 }], showMs, signal, i * staggerMs));
    }
    pairs.push(side);
  }
  if (!shown.length) { graphics.remove(); return Promise.resolve(); }
  return Promise.all([wait(holdMs, signal), ...shown]).then(async () => {
    if (result.playerPower * result.opponentPower < 0 && pairs.length === 2) {
      const pairsToCancel = Math.min(...pairs.map(side => side.length));
      const canceled = pairs.flatMap(side => side.slice(-pairsToCancel).reverse());
      await Promise.all(canceled.map(async (arrow, i) => {
        const dx = cancelTargetX - Number.parseFloat(arrow.style.left);
        await animate(arrow, [{ opacity: 1 }, { opacity: 0, translate: `${dx}px 0` }], hideMs, signal, i % pairsToCancel * staggerMs);
        arrow.remove();
      }));
      await wait(holdMs, signal);
    }
    await animate(graphics, [{ opacity: 1 }, { opacity: 0 }], hideMs, signal);
    graphics.remove();
  });
}

async function renderBattleHud(battle, sourceAvatar, {
  assets, encounter, scene, definitions, stands, signal, isCurrent, loadCards, onBattleFinish, onBattleSound, onAlert, mapIndex,
  returnToMap,
}) {
  const { hud } = assets;
  const standees = layer(battle, 'quest-battle-standees', 2);
  const distanceArt = hud.movePresentation?.distance;
  drawStands(standees, stands, encounter, false, distanceArt);
  const base = layer(battle, 'quest-battle-base', 4);
  for (const common of assets.common) sprite(base, common);
  const handPlate = layer(battle, 'quest-battle-hand-plate', 7);
  sprite(handPlate, hud.hand?.base);
  if (hud.hand?.slot) {
    for (let index = 0; index < 5; index += 1) {
      const slot = hud.hand.slot;
      sprite(handPlate, { ...slot, x: slot.x + 202 + index * 60, y: slot.y + 512 });
    }
  }
  const avatar = layer(battle, 'quest-battle-avatar-layer', 11);
  if (hud.movePresentation?.avatarBase) sprite(avatar, { ...hud.movePresentation.avatarBase, depth: undefined });
  cloneAvatar(avatar, sourceAvatar, 590, 473);
  const main = layer(battle, 'quest-battle-hud', 14, 'quest-battle-hud');
  const player = encounter.playerCardIds[0];
  const skills = renderSkills(battle, hud.skills, definitions.get(player), definitions.get(encounter.opponentCardIds[0]),
    { signal, definitions });
  const skillPresentation = createSkillPresentation(skills);
  const chat = renderChatDecoration(battle, hud.chat);
  const health = renderHealth(main, assets, encounter, definitions, signal);
  const opponentHealth = main.querySelector('#quest-battle-opponent-hp');
  const healthIndicators = [
    ['player', main.querySelector('#quest-battle-player-hp')],
    ['opponent', opponentHealth],
  ];
  const rangeNames = ['short', 'middle', 'long', 'hiding'];
  let range = sprite(main, hud.range?.[rangeNames[encounter.duel.distance - 1]]);
  const phaseSprites = layer(main, 'quest-battle-phase', 0);
  const table = layer(main, 'quest-battle-table', 1);
  const controls = layer(main, 'quest-battle-move-controls', 2, 'quest-battle-move-controls');
  controls.hidden = true;
  sprite(controls, hud.done?.plate);
  const combatControls = layer(main, 'quest-battle-combat-controls', 2, 'quest-battle-combat-controls');
  combatControls.hidden = true;
  sprite(combatControls, hud.done?.plate);
  const turn = output(main, 'quest-battle-turn', 'sr-only', 0, 0);
  turn.setAttribute('aria-label', '回合');
  if (hud.bonus) {
    const { initial, x, y, width, height, color, fontSize, letterSpacing } = hud.bonus;
    const bonus = output(main, 'quest-battle-bonus-meter', 'quest-battle-bonus', x, y, width, height);
    bonus.value = `Bonus ${initial}`;
    bonus.style.color = color;
    bonus.style.fontSize = `${fontSize}px`;
    bonus.style.letterSpacing = `${letterSpacing}px`;
  }
  const deck = mountDeckStock(battle, encounter.duel.deckSize, signal);
  const roster = layer(battle, 'quest-battle-roster', 30);
  const status = output(main, 'quest-battle-status', 'sr-only', 178, 24);
  status.setAttribute('role', 'status');
  status.tabIndex = -1;
  const reserveTabs = createQuestBattleReserve(battle, {
    artwork: hud.characterChange?.reserveTab, definitions, signal,
    inspect: (parent, definition, row, damage, cardSignal) => inspectCharacter(
      parent, definition, row.cardId, damage, cardSignal, row.index, `quest-battle-reserve-character-${row.index}`,
    ),
    restoreFocus: () => status.focus({ preventScroll: true }),
  });
  const { opponentCardIds } = encounter;
  const knownOpponentCard = id => Number.isSafeInteger(id) && id > 0 && definitions.has(id);
  const ordinaryMap = Number.isInteger(mapIndex) && mapIndex >= 0 && mapIndex < 36;
  const opponentTab = ordinaryMap && opponentCardIds.some(knownOpponentCard) ? createQuestBattleReserve(battle, {
      artwork: hud.characterChange?.reserveTab, definitions, signal, side: 'opponent',
      inspect: (parent, definition, row, damage, cardSignal, elementId) => inspectCharacter(
        parent, definition, row.cardId, damage, cardSignal, row.index, elementId,
      ),
      restoreFocus: () => status.focus({ preventScroll: true }),
    }) : null;
  const actors = {
    player: { index: 0, cardId: player }, opponent: { index: 0, cardId: encounter.opponentCardIds[0] },
  };
  for (const side of ['player', 'opponent']) battle.dataset[`${side}ActiveCardId`] = String(actors[side].cardId);
  let faceScope = new AbortController();
  let activeFace = inspectCharacter(roster, definitions.get(player), player, encounter.playerDamage[0],
    AbortSignal.any([signal, faceScope.signal]));
  const hands = createHands(battle);
  const covered = createCoveredOpponentCards(hands, signal);
  const battleChrome = [standees, base, deck.root, skills?.strip, skills?.detailLayer, handPlate, avatar, main, chat,
    roster, reserveTabs?.root, opponentTab?.root].filter(Boolean);
  const move = createQuestBattleMove({ battle, scene, encounterKey: encounter.key, hud, hands, controls, combatControls, status,
    multi: encounter.duel.multi, signal, isCurrent });
  const changeView = createQuestBattleChange(battle, { scene, encounterKey: encounter.key, signal, isCurrent, assets: hud, definitions,
    animate, startTimer: onTimeout => startMoveTimer(main, hud.time, signal, onTimeout, true), status });
  void battleCardControls(signal).then(move.installCardArt);
  const distance = encounter.duel.distance;
  battle.dataset.distance = String(distance);
  let visibleTurn = 0;
  let turnArt;
  let drawingTurn;
  let latest;
  const observedExchanges = new Map();
  const observedMoves = new Map();
  const archivedCombat = [];
  let stopTimer;
  let drawn = false;
  let renderedState;
  let endCutIns;
  let moveCutInExit;
  let presentedMove = false;
  let tableLoop;
  let combatView;
  let terminalTask;
  let duelResult;
  let resultStatus;
  let characterPresentation;
  let defeatedChange;
  let opponentInspectionEnabled = false;
  const featPlayback = createQuestFeatPlayback(battle, { signal, isCurrent, onSound: onBattleSound, wait });
  const damageScopes = createDamageScopes(standees, signal, visualRoster);
  signal.addEventListener('abort', () => tableLoop?.cancel(), { once: true });

  async function updateHp(hitPoints) {
    if (signal.aborted || !isCurrent()) return;
    const face = activeFace;
    const card = definitions.get(actors.player.cardId);
    await health.update(hitPoints);
    if (signal.aborted || !isCurrent()) return;
    updateOpponentInspection();
    if (face !== activeFace) return;
    const hp = hitPoints.player;
    if (card && Number.isInteger(hp) && hp <= card.hp) {
      await renderCharacterCard(face.canvas, card, { signal: AbortSignal.any([signal, faceScope.signal]), damage: card.hp - hp });
    }
  }

  function visualRoster() {
    const roster = latest?.roster;
    if (!roster) return;
    return {
      player: { ...roster.player, activeIndex: actors.player.index },
      opponent: { ...roster.opponent, activeIndex: actors.opponent.index },
    };
  }

  function updateOpponentInspection() {
    if (!opponentTab) return;
    const party = visualRoster()?.opponent;
    const active = party?.cards?.[party.activeIndex];
    const shown = opponentHealth?.dataset;
    if (!active || party.cards.length !== opponentCardIds.length || !knownOpponentCard(active.cardId)
      || active.index !== party.activeIndex || active.cardId !== opponentCardIds[active.index]
      || Number(shown?.cardId) !== active.cardId || Number(shown?.rosterIndex) !== active.index) {
      opponentTab.update(undefined, true, { enabled: false });
      return;
    }
    // Follow the presented gauge so an early Ruby damage receipt cannot expose HP ahead of its animation.
    const gaugeHp = Number(shown.hp);
    const hp = Number.isInteger(gaugeHp) ? gaugeHp : null;
    // A CPU deck can use the same character definition in different roster slots.
    const cards = party.cards.map((row, index) => {
      if (row?.index !== index || row.cardId !== opponentCardIds[index] || !knownOpponentCard(row.cardId)) {
        return { index, cardId: 0 };
      }
      return index === active.index ? { ...row, hp, alive: hp === null ? null : hp > 0 } : row;
    });
    opponentTab.update({ ...party, cards }, false, { enabled: opponentInspectionEnabled });
  }

  function observeCurrentSkills() {
    const roster = visualRoster();
    skillPresentation.observe({ ...latest, roster }, latest.exchange ?? (combatView && latest.exchangeHistory?.at(-1)));
    activeFace.updateConditions(roster?.player?.cards[actors.player.index]);
  }

  async function presentChangedActors() {
    const next = confirmedBattleActors(latest);
    if (!next) return false;
    const shifts = [];
    const distance = Number(battle.dataset.distance);
    for (const side of ['player', 'opponent']) {
      const actor = next[side];
      if (actor.index === actors[side].index && actor.cardId === actors[side].cardId) continue;
      const holder = document.createDocumentFragment();
      if (!drawStand(holder, stands, side, actor.cardId, distance, false, distanceArt)) return false;
      const outgoing = standees.querySelectorAll(`img[data-side="${side}"][data-stand-offset-x]`);
      shifts.push({ side, actor, entering: Array.from(holder.children), outgoing });
    }
    await Promise.all(shifts.flatMap(({ entering }) => entering.map(image => image.decode())));
    if (signal.aborted || !isCurrent()) return false;
    await Promise.all(shifts.flatMap(({ outgoing }) => Array.from(outgoing, image =>
      animate(image, [{ opacity: 1 }, { opacity: 0 }], 500, signal))));
    if (signal.aborted || !isCurrent()) return false;
    const now = confirmedBattleActors(latest);
    if (!now || shifts.some(({ side, actor }) => now[side].index !== actor.index || now[side].cardId !== actor.cardId)) return false;
    for (const { side, outgoing, entering } of shifts) {
      for (const image of outgoing) image.remove();
      const before = side === 'player' ? standees.querySelector('img[data-side="opponent"]') : null;
      for (const image of entering) standees.insertBefore(image, before);
      const actor = now[side];
      actors[side] = actor;
      battle.dataset[`${side}ActiveCardId`] = String(actor.cardId);
      health.setActor(side, actor);
      if (side === 'opponent') {
        updateOpponentInspection();
        continue;
      }
      faceScope.abort();
      faceScope = new AbortController();
      const focus = activeFace.card.contains(document.activeElement);
      activeFace.card.remove();
      const card = definitions.get(actor.cardId);
      const damage = card && Number.isInteger(actor.hp) ? Math.max(0, card.hp - actor.hp) : undefined;
      activeFace = inspectCharacter(roster, card, actor.cardId, damage, AbortSignal.any([signal, faceScope.signal]), actor.index);
      if (focus) status.focus({ preventScroll: true });
    }
    damageScopes.sync();
    observeCurrentSkills();
    await Promise.all([
      activeFace.ready,
      changeView.settled(),
      ...shifts.flatMap(({ entering }) => entering.map(image => animate(image, [{ opacity: 0 }, { opacity: 1 }], 500, signal))),
    ]);
    return !signal.aborted && isCurrent();
  }

  function startCharacterPresentation(turn, kind) {
    if (characterPresentation?.turn === turn && characterPresentation.kind === kind) return;
    const presentation = { turn, kind, settled: false };
    characterPresentation = presentation;
    battle.dataset.characterChangeKind = kind;
    battle.dataset.characterChangePresentation = 'changing';
    void Promise.all([presentChangedActors(), closeMoveCutIns()]).then(([settled]) => settled, () => false).then(settled => {
      if (signal.aborted || !isCurrent() || characterPresentation !== presentation) return;
      presentation.settled = settled;
      battle.dataset.characterChangePresentation = settled ? 'settled' : 'unavailable';
      if (settled) advance();
      else {
        status.value = '無法顯示已確認的出戰角色。';
        status.className = 'quest-battle-status';
      }
    });
  }

  function rememberDefeatedChange(snapshot) {
    const change = snapshot.characterChange;
    if (change?.kind !== 'defeated' || !change.sweep || typeof change.exchangeKey !== 'string') return;
    if (defeatedChange?.change.exchangeKey === change.exchangeKey) {
      defeatedChange.change = change;
      return;
    }
    const player = snapshot.roster?.player;
    const outgoing = player?.cards[player.activeIndex];
    defeatedChange = { change, outgoing, sweepState: 'pending' };
  }

  async function finishDefeatedSweep(state) {
    const { playerCardIds, opponentCardIds, opponentCardCount } = state.change.sweep;
    const ownIds = new Set(playerCardIds);
    for (const node of Array.from(hands.player.children)) if (ownIds.has(Number(node.dataset.cardId))) node.remove();
    await sweepQuestTableCards(hands, {
      playerCards: playerCardIds.map(id => ({ id })),
      opponentCards: (opponentCardIds ?? []).map(id => ({ id })),
      opponentBackCount: opponentCardIds === null ? opponentCardCount : 0,
    }, { signal, isCurrent, animate, wait, retained: true });
    if (signal.aborted || !isCurrent() || defeatedChange !== state) return;
    const { outgoing } = state;
    if (!state.change.playerDone && outgoing?.cardId === actors.player.cardId && outgoing.index === actors.player.index &&
        (outgoing.alive === false || (Number.isInteger(outgoing.hp) && outgoing.hp <= 0))) {
      activeFace.card.dataset.defeated = 'true';
      activeFace.canvas.style.filter = 'brightness(.5)';
      void animate(activeFace.canvas, [{ filter: 'brightness(1)' }, { filter: 'brightness(.5)' }], 500, signal, 0, 'linear');
    }
    state.sweepState = 'settled';
    battle.dataset.characterChangePresentation = 'choosing';
    showTable('change');
    advance();
  }

  function advanceDefeatedChange(exchange) {
    const state = defeatedChange;
    if (state?.change.exchangeKey !== exchange.key) return false;
    if (state.sweepState === 'pending') {
      state.sweepState = 'sweeping';
      battle.dataset.characterChangeKind = 'defeated';
      battle.dataset.characterChangePresentation = 'sweeping';
      void finishDefeatedSweep(state);
    }
    if (state.sweepState !== 'settled') return false;
    const complete = latest.lastCharacterChange;
    if (!state.change.closed && (complete?.kind !== 'defeated' || complete.turn !== exchange.turn)) return false;
    startCharacterPresentation(exchange.turn, 'defeated');
    return characterPresentation.settled && latest.turn === exchange.turn + 1;
  }

  function closeMoveCutIns() {
    if (!endCutIns) return moveCutInExit;
    const leave = endCutIns;
    endCutIns = undefined;
    const exit = leave().finally(() => {
      if (moveCutInExit === exit) moveCutInExit = undefined;
    });
    moveCutInExit = exit;
    return exit;
  }

  function queueChangeCutInExit() {
    const leave = endCutIns;
    if (!leave) return;
    // The original selection cards rise before DropTable plays both face_out timelines.
    const delay = reduced() ? 0 : hud.characterChange?.animation?.openMs ?? 500;
    void wait(delay, signal).then(() => {
      if (!signal.aborted && isCurrent() && endCutIns === leave) void closeMoveCutIns();
    });
  }

  async function presentMove(result) {
    if (presentedMove) return;
    presentedMove = true;
    battle.dataset.moveResult = 'revealing';
    main.querySelector('#quest-battle-move-result')?.remove();
    const receipt = output(main, 'quest-battle-move-result', 'sr-only', 0, 0);
    receipt.dataset.turn = String(visibleTurn);
    receipt.dataset.distance = String(result.distance);
    receipt.dataset.playerInitiative = String(result.playerInitiative);
    receipt.dataset.playerPower = String(result.playerPower);
    receipt.dataset.opponentPower = String(result.opponentPower);
    receipt.dataset.playerLocked = String(result.playerLocked);
    receipt.dataset.opponentLocked = String(result.opponentLocked);
    receipt.value = `${['近距離', '中距離', '遠距離', '距離不明'][result.distance - 1] ?? ''}，${result.playerInitiative ? '我方先攻' : '對手先攻'}`;
    status.value = receipt.value;
    if (result.healing) {
      const healed = {};
      for (const [side, indicator] of healthIndicators) {
        const amount = result.healing[side];
        if (!Number.isInteger(amount) || amount <= 0) continue;
        receipt.dataset[`${side}Healing`] = String(amount);
        if (indicator) healed[side] = Math.min(Number(indicator.dataset.max), Number(indicator.dataset.hp) + amount);
      }
      await updateHp(healed);
      if (signal.aborted || !isCurrent()) return;
    }
    await covered.settled();
    if (signal.aborted || !isCurrent()) return;
    hands.opponentTable.hidden = false;
    await Promise.all([revealMoveCards(hands, result, signal), featPlayback.play(latest.feats?.used, visibleTurn, null)]);
    if (signal.aborted || !isCurrent()) return;
    await showMoveArrows(battle, hud.movePresentation, result, signal);
    if (signal.aborted || !isCurrent()) return;
    battle.dataset.moveResult = 'sweeping';
    await sweepQuestTableCards(hands, result, { signal, isCurrent, animate, wait });
    if (signal.aborted || !isCurrent()) return;
    range?.remove();
    range = sprite(main, hud.range?.[rangeNames[result.distance - 1]]);
    const shift = moveStands(standees, result.distance, signal, distanceArt);
    battle.dataset.distance = String(result.distance);
    battle.dataset.initiative = result.playerInitiative ? 'player' : 'opponent';
    const change = latest.characterChange ?? latest.lastCharacterChange;
    const approachingChange = latest.direction === 3 || (change?.kind === 'movement' && change.turn === visibleTurn);
    await Promise.all([shift, approachingChange ? undefined : closeMoveCutIns()]);
    if (!signal.aborted && isCurrent()) {
      hands.playerTable.hidden = true;
      hands.opponentTable.hidden = true;
      controls.hidden = true;
      showTable('blank');
      battle.dataset.moveResult = 'settled';
      advance();
    }
  }

  function showTable(state) {
    tableLoop?.cancel();
    table.replaceChildren();
    const { layers = [], animation } = hud.table?.[state] ?? {};
    for (const [index, tableArt] of layers.entries()) {
      const image = sprite(table, tableArt);
      if (tableArt.blend) image.style.mixBlendMode = tableArt.blend;
      if (!animation || index !== animation.layerIndex || reduced()) continue;
      const { x, y, width, height, columns, frameCount, framesPerSecond, loop, file } = animation;
      const mask = document.createElement('div');
      mask.className = 'quest-battle-table-loop';
      place(mask, x, y, width, height);
      table.append(mask);
      const sheet = sprite(mask, { file, x: 0, y: 0 });
      sheet.decode().then(() => {
        if (signal.aborted || mask.parentElement !== table) return;
        image.hidden = true;
        const rows = Math.ceil(frameCount / columns);
        place(sheet, 0, 0, width * columns, height * rows);
        const frames = Array.from({ length: frameCount }, (_, i) => ({
          translate: `${-(i % columns) * width}px ${-Math.floor(i / columns) * height}px`, easing: 'steps(1, end)',
        }));
        frames.push(frames[0]);
        tableLoop = sheet.animate(frames, { duration: frameCount * 1000 / framesPerSecond, iterations: loop ? Infinity : 1 });
      }).catch(() => mask.remove());
    }
  }

  function showPhase(key) {
    phaseSprites.replaceChildren();
    sprite(phaseSprites, hud.phase?.[key]);
    if (hud.phaseAnimation?.[key]) void runFrames(phaseSprites, hud.phaseAnimation[key], signal).then(frame => frame?.remove());
  }

  function updateCombat(source) {
    if (!source || !isCurrent()) return;
    const key = source.key ?? `${source.turn}:${source.index}`;
    if (typeof source.playerAttacks === 'boolean') {
      stopTimer?.();
      stopTimer = undefined;
    }
    if (!combatView) {
      const active = { key, turn: source.turn, index: source.index, settled: false };
      combatView = active;
      active.view = createQuestBattleExchange(battle, {
        signal, isCurrent, assets: hud.combat, status, hands, move, combatControls, showTable, showPhase, layer, sprite, place, animate, wait,
        cutIn: side => showMoveCutIns(battle, hud.movePresentation, actors, signal, side, stands),
        startTimer: onTimeout => startMoveTimer(main, hud.time, signal, onTimeout, true),
        loadDiceArt: () => battleExchangeArt(signal), playDiceRoll: playQuestDiceRoll,
        playFeats: exchange => featPlayback.play(latest.feats?.used, exchange.turn, key),
        playHit: playQuestHitEffect, getHitSignal: damageScopes.get, playAttackPose: playQuestAttackPose,
        onSettled() {
          if (combatView !== active) return;
          active.settled = true;
          advance();
        },
        updateHp,
        initialHp: Object.fromEntries(healthIndicators.map(([side, indicator]) => [side, Number(indicator?.dataset.hp)])),
        drawOpponent: count => {
          hands.opponentTable.hidden = false;
          const current = latest.exchange;
          const currentKey = current?.key ?? `${current?.turn}:${current?.index}`;
          covered.draw(currentKey === key ? latest.opponentHandCount : null, count);
        },
        revealCards: async reveal => {
          await covered.settled();
          if (signal.aborted || combatView !== active || !isCurrent()) return;
          hands.opponentTable.hidden = false;
          const spent = new Set(reveal.playerCards.map(({ id }) => id));
          for (const card of Array.from(hands.player.children)) if (spent.has(Number(card.dataset.cardId))) card.remove();
          await revealMoveCards(hands, reveal, signal);
        },
      });
      covered.draw(null, 0, false);
      move.beginCombat(key);
    }
    const active = combatView;
    active.view.update({ ...latest, exchange: source, result: observedMoves.get(source.turn) ?? latest.result });
    if (!active.settled && !active.waitingForSkills && skillPresentation.waiting(active.key)) {
      active.waitingForSkills = true;
      void active.view.whenPresented().then(presented => {
        active.waitingForSkills = false;
        if (presented && combatView === active && !signal.aborted && isCurrent()) skillPresentation.release(active.key);
      });
    }
  }

  function archiveCombat() {
    const { view, key, turn: oldTurn, index } = combatView;
    archivedCombat.push(view.archive(oldTurn, index));
    if (archivedCombat.length > 2) archivedCombat.shift().remove();
    observedExchanges.delete(key);
    combatView = undefined;
  }

  function updateDuelOutcome(outcome) {
    battle.dataset.outcomeState = outcome.state;
    duelResult?.setLevelUp?.(outcome.receipt);
    duelResult?.setReward(latest.reward);
    duelResult?.setCanReturn(outcome.canReturn === true);
    if (!resultStatus) return;
    resultStatus.value = {
      'awaiting-settlement': '正在等待任務結算確認。',
      uncertain: '無法確認任務結算。',
      'bonus-pending': '正在等待獎勵結算。',
    }[outcome.state] ?? '';
    resultStatus.className = outcome.state === 'uncertain' ? 'quest-battle-status' : 'sr-only';
  }

  async function presentDuelResult() {
    onBattleFinish?.();
    void closeMoveCutIns();
    const { duel, receipt, canReturn } = latest.outcome;
    renderedState = 'terminal';
    battle.dataset.phase = 'terminal';
    stopTimer?.();
    combatControls.hidden = controls.hidden = true;
    move.setCombatRole(undefined);
    if (!reduced()) await wait(1500, signal);
    if (signal.aborted || !isCurrent()) return;
    damageScopes.clear();
    const pieces = [...battleChrome, hands.root];
    for (const node of pieces) node.inert = true;
    await Promise.all(pieces.map(node => animate(node, [{ opacity: 1 }, { opacity: 0 }], 500 / 1.7, signal)));
    if (signal.aborted || !isCurrent()) return;
    for (const node of pieces) node.hidden = true;
    showTable('blank');
    duelResult = mountQuestDuelResult(battle, {
      outcome: duel, receipt, playerCardId: actors.player.cardId, signal, canReturn, onSound: onBattleSound, reward: latest.reward, loadCards, onAlert,
      onReturn: () => !signal.aborted && isCurrent() && latest.outcome?.canReturn === true && returnToMap?.(),
      runRewardAction(action, rewardRound, inventoryId) {
        if (signal.aborted || !isCurrent()) return false;
        const options = { signal, encounterKey: encounter.key, rewardRound };
        if (action === 'next') return scene.nextBattleReward(options);
        if (action === 'high' || action === 'low') return scene.guessBattleReward(action, options);
        if (action === 'item-use') return scene.useBattleRewardItem(inventoryId, { ...options, mapIndex });
        return scene.takeBattleReward(options);
      },
    });
    resultStatus = output(layer(battle, 'quest-battle-settlement-message', 50), 'quest-battle-settlement-status', 'sr-only', 178, 24);
    resultStatus.setAttribute('role', 'status');
    battle.querySelector('#quest-battle-result')?.setAttribute('aria-describedby', resultStatus.id);
    signal.addEventListener('abort', () => duelResult.dispose(), { once: true });
    updateDuelOutcome(latest.outcome);
  }

  function paint(phase) {
    if (phase === renderedState || signal.aborted) return;
    renderedState = phase;
    battle.dataset.phase = phase;
    status.value = { preparing: '正在等待戰鬥確認。', draw: '抽牌階段', move: '移動階段',
      committing: '正在等待移動確認。', settling: '正在結算移動。', moved: '移動已結算。',
      uncertain: drawn ? '無法確認移動操作。' : '無法確認就緒結果。', closed: '戰鬥連線已結束。' }[phase] ?? '';
    status.className = phase === 'uncertain' ? 'quest-battle-status' : 'sr-only';
    controls.hidden = !['move', 'committing', 'settling', 'moved'].includes(phase);
    phaseSprites.replaceChildren();
    const phaseArt = { draw: 'drw', move: 'mov', committing: 'mov', settling: 'mov', moved: 'mov' }[phase];
    sprite(phaseSprites, hud.phase?.[phaseArt ?? 'blk']);
    if ((phase === 'draw' || (phase === 'move' && !stopTimer)) && hud.phaseAnimation?.[phaseArt]) {
      void runFrames(phaseSprites, hud.phaseAnimation[phaseArt], signal).then(frame => frame?.remove());
    }
    const showsMove = ['move', 'committing', 'settling', 'moved'].includes(phase);
    const tableState = showsMove ? encounter.duel.multi ? 'mov3on3' : 'mov'
      : phase === 'draw' ? 'drw_act' : 'blank';
    showTable(tableState);
    if (phase === 'settling' || phase === 'moved') stopTimer?.freeze?.();
    else if (!['move', 'committing'].includes(phase)) {
      stopTimer?.();
      stopTimer = undefined;
    } else if (phase === 'move' && !stopTimer) {
      move.beginMove(visibleTurn);
      endCutIns = showMoveCutIns(battle, hud.movePresentation, actors, signal, undefined, stands);
      stopTimer = startMoveTimer(main, hud.time, signal, move.onTimeout);
      playQuestBattleEffect('phase', signal);
    }
    if (phase === 'draw') playQuestBattleEffect('phase', signal);
  }

  function startDraw(turnNumber) {
    visibleTurn = turnNumber;
    for (const [key, exchange] of observedExchanges) if (exchange.turn < turnNumber) observedExchanges.delete(key);
    for (const priorTurn of observedMoves.keys()) if (priorTurn < turnNumber) observedMoves.delete(priorTurn);
    drawn = false;
    presentedMove = false;
    endCutIns = undefined;
    delete battle.dataset.moveResult;
    delete battle.dataset.moveStartedAt;
    delete battle.dataset.initiative;
    delete battle.dataset.exchangeIndex;
    delete battle.dataset.exchangePhase;
    delete battle.dataset.combatRole;
    delete battle.dataset.playerAttacks;
    delete battle.dataset.characterChangeKind;
    delete battle.dataset.characterChangePresentation;
    main.querySelector('#quest-battle-move-result')?.remove();
    battle.dataset.turn = String(turnNumber);
    battle.dataset.drawState = 'awaiting-cards';
    turn.value = String(turnNumber);
    turnArt?.remove();
    turnArt = sprite(main, hud.turn?.[turnNumber]);
    const draw = latest.ready?.turn === turnNumber ? latest.ready : null;
    const incoming = new Set(draw ? [...draw.action.cards, ...draw.event.cards].map(({ id }) => id) : []);
    move.beginDraw(turnNumber, (latest.hand ?? []).filter(({ id }) => !incoming.has(id)));
    paint('draw');
  }

  function advance() {
    if (!latest || signal.aborted || !isCurrent()) return;
    const change = latest.characterChange;
    const presentable = change?.kind === 'defeated'
      ? defeatedChange?.change.exchangeKey === change.exchangeKey && defeatedChange?.sweepState === 'settled'
      : battle.dataset.moveResult === 'settled';
    changeView.update(latest, { presentable });
    const pickerActive = presentable && (change?.kind === 'movement' || change?.kind === 'defeated');
    const actorChanging = characterPresentation?.turn === visibleTurn && !characterPresentation.settled;
    const outcome = latest.outcome;
    const inspectionEnabled = !outcome?.duel && !['uncertain', 'closed', 'terminal'].includes(latest.phase)
      && latest.exchange?.phase !== 'uncertain';
    reserveTabs?.update(visualRoster()?.player, pickerActive || actorChanging, { enabled: inspectionEnabled });
    opponentInspectionEnabled = inspectionEnabled;
    updateOpponentInspection();
    if (outcome) updateDuelOutcome(outcome);
    if (terminalTask) return;
    if (!combatView && latest.phase === 'terminal' && outcome?.duel) {
      terminalTask = presentDuelResult();
      return;
    }
    if (combatView) {
      const active = combatView;
      const source = observedExchanges.get(active.key);
      updateCombat(source);
      if (!active.settled) return;
      skillPresentation.release(active.key);
      if (source?.boundary === 'terminal' && outcome?.duel) {
        terminalTask = presentDuelResult();
        return;
      }
      const nextExchange = source?.boundary === 'next-attack' && observedExchanges.get(`${active.turn}:2`);
      if (nextExchange) {
        archiveCombat();
        updateCombat(nextExchange);
        return;
      }
      if (source?.boundary === 'character-change') {
        if (['uncertain', 'closed'].includes(latest.phase)) { paint(latest.phase); return; }
        if (!advanceDefeatedChange(active)) return;
      } else if (source?.boundary !== 'next-turn' || latest.turn !== visibleTurn + 1) return;
      archiveCombat();
      startDraw(latest.turn);
    }
    if (!visibleTurn && Number.isInteger(latest.turn)) startDraw(latest.turn);
    if (['uncertain', 'closed'].includes(latest.phase)) {
      void closeMoveCutIns();
      paint(latest.phase);
      return;
    }

    const ready = latest.ready;
    if (ready?.turn === visibleTurn && drawingTurn !== visibleTurn) {
      drawingTurn = visibleTurn;
      battle.dataset.readyTurn = String(ready.turn);
      battle.dataset.drawState = 'dealing';
      deck.startDeal();
      void revealHand(hands, ready, signal, {
        opponentHandCount: latest.opponentHandCount, covered,
        onDeal: deck.deal,
        onEvent() { if (renderedState === 'draw') showTable('drw_evt'); },
      }).then(metadata => {
        if (signal.aborted || !isCurrent() || ready.turn !== visibleTurn) return;
        move.attach(metadata);
        drawn = true;
        battle.dataset.drawState = 'settled';
        advance();
      });
    }
    if (!drawn) return;
    const result = observedMoves.get(visibleTurn);
    if (result) {
      if (!presentedMove) {
        paint('moved');
        void presentMove(result);
      } else if (battle.dataset.moveResult === 'settled') {
        const source = observedExchanges.get(`${visibleTurn}:1`);
        if (source?.boundary === 'terminal' && outcome?.duel) updateCombat(source);
        else {
          const { characterChange, lastCharacterChange } = latest;
          const change = characterChange ?? lastCharacterChange;
          if (change?.kind === 'movement' && change.turn === visibleTurn) {
            if (characterChange && !characterChange.closed) {
              if (battle.dataset.characterChangePresentation !== 'choosing') {
                battle.dataset.characterChangePresentation = 'choosing';
                showTable('change');
                queueChangeCutInExit();
              }
              return;
            }
            startCharacterPresentation(visibleTurn, 'movement');
            if (characterChange || !characterPresentation.settled) return;
          }
          if (latest.phase === 'character-change' || source?.boundary === 'character-change') {
            status.value = '等待角色更換。';
            return;
          }
          if (endCutIns && typeof source?.playerAttacks === 'boolean') void closeMoveCutIns()?.then(advance);
          if (moveCutInExit) return;
          const current = confirmedBattleActors(latest);
          if (current && ['player', 'opponent'].every(side => current[side].cardId === actors[side].cardId
            && current[side].index === actors[side].index)) updateCombat(source);
        }
      }
      return;
    }
    if (['move', 'committing', 'settling'].includes(latest.phase) && Number.isSafeInteger(latest.opponentMoveCount)) {
      hands.opponentTable.hidden = false;
      covered.draw(latest.opponentHandCount, latest.opponentMoveCount);
    }
    if (['move', 'committing', 'settling'].includes(latest.phase)) paint(latest.phase);
    if (Number.isFinite(latest.moveStartedAt)) battle.dataset.moveStartedAt = String(latest.moveStartedAt);
  }

  function receive(next) {
    if (signal.aborted || !isCurrent() || !next.adventure?.battle) return;
    latest = next.adventure.battle;
    rememberDefeatedChange(latest);
    damageScopes.sync();
    featPlayback.preload(latest.feats?.used);
    observeCurrentSkills();
    if (battle.dataset.moveResult === 'settled') void featPlayback.play(latest.feats?.used, visibleTurn, null);
    const moveTurn = latest.ready?.turn ?? latest.turn;
    if (latest.result && Number.isInteger(moveTurn) && !observedMoves.has(moveTurn)) observedMoves.set(moveTurn, latest.result);
    for (const source of [...(latest.exchangeHistory ?? []), latest.exchange]) {
      if (!source || source.turn < visibleTurn || (source.turn === visibleTurn && source.index < combatView?.index)) continue;
      observedExchanges.set(source.key ?? `${source.turn}:${source.index}`, source);
    }
    move.update(latest);
    advance();
  }

  paint('opening');
  battle.dataset.intro = 'bring-on';
  const bringOn = battleChrome.map(node => animate(node,
    [{ opacity: 0 }, { opacity: 1 }], 500 / 1.7, signal));
  await Promise.all([activeFace.ready, ...bringOn]);
  if (signal.aborted || !isCurrent()) return;
  battle.dataset.intro = 'complete';
  paint('preparing');
  scene.subscribe(receive, { signal });
  void scene.readyBattle({ signal, encounterKey: encounter.key }).then(() => receive(scene.snapshot)).catch(() => {
    if (signal.aborted || !isCurrent()) return;
    reserveTabs?.update(visualRoster()?.player, false, { enabled: false });
    opponentInspectionEnabled = false;
    updateOpponentInspection();
    paint('uncertain');
  });
}

export async function mountQuestBattleEntry(view, board, {
  encounter, landSlot, layers, assets, signal, scene, loadCards, isCurrent, onEncounter, onBattleFinish, onBattleSound, onAlert, returnToMap,
}) {
  const mapIndex = view.dataset.mapType === 'normal' ? Number(view.dataset.mapId) - 1 : undefined;
  const { transition: timing } = assets;
  const delay = timing.delayAfterDetermineMs - (performance.now() - encounter.receivedAt);
  await wait(delay, signal);
  if (signal.aborted || view.inert || !isCurrent()) return;

  const battle = document.createElement('section');
  battle.id = 'quest-map-battle';
  battle.dataset.stage = String(encounter.stage);
  if (Number.isInteger(landSlot)) battle.dataset.landSlot = String(landSlot);
  if (encounter.key) battle.dataset.encounterKey = encounter.key;
  battle.dataset.phase = 'opening';
  battle.setAttribute('aria-labelledby', 'quest-map-battle-title');
  const title = document.createElement('h2');
  title.id = 'quest-map-battle-title';
  title.className = 'sr-only';
  title.tabIndex = -1;
  title.textContent = '戰鬥開場';
  battle.append(title);
  drawStageLayers(battle, layers, signal);
  const moveFocus = board.contains(document.activeElement) || document.activeElement === document.body;
  view.append(battle);
  board.inert = true;
  if (moveFocus) title.focus({ preventScroll: true });
  onEncounter?.(encounter.stage);
  try {
    dissolve(board, battle, timing, signal);
  } catch {
    board.hidden = true;
    battle.dataset.burn = 'settled';
  }
  if (!assets.opening || !assets.hud || !scene?.readyBattle) return;
  const cards = [...new Set([...encounter.playerCardIds, ...encounter.opponentCardIds])];
  const { up, down, names } = assets.opening;
  const openingLayers = new Map([...assets.common, ...(up?.frames ?? []), ...(down?.frames ?? []),
    ...Object.values(names ?? {})].filter(Boolean).map(item => [item.file, item]));
  const definitionsTask = loadCards(cards);
  const [definitions, stands] = await Promise.all([definitionsTask, definitionsTask.then(definitions => battleStands(signal, definitions)),
    prepareQuestBattleStage([...openingLayers.values()])]);
  if (signal.aborted || view.inert || !isCurrent()) return;
  const sourceAvatar = board.querySelector('#quest-map-avatar');
  await runOpening(battle, sourceAvatar, { assets, encounter, definitions, stands, signal });
  if (signal.aborted || view.inert || !isCurrent()) return;
  await renderBattleHud(battle, sourceAvatar, {
    assets, encounter, scene, definitions, stands, signal, isCurrent, loadCards, onBattleFinish, onBattleSound, onAlert, mapIndex,
    returnToMap,
  });
}
