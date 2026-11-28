import { playQuestBattleEffect } from './bgm.js';
import { BATTLE_CARD_ART, battleCardControls, battleExchangeArt, battleStands, renderActionCard } from './battle-card.js';
import { renderCharacterCard } from './character-card.js';
import { createQuestBattleExchange } from './quest-battle-exchange.js';
import { createQuestBattleMove } from './quest-battle-move.js';
import { mountQuestDuelResult } from './quest-battle-result.js';
import { playQuestDiceRoll } from './quest-dice-roll.js';
import { playQuestAttackPose, playQuestHitEffect } from './quest-hit-effect.js';

const art = new URL('./quest-art/', import.meta.url);
const decodedStages = new WeakMap();
const sineOut = 'linear(0, .1951, .3827, .5556, .7071, .8315, .9239, .9808, 1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function prepareQuestBattleStage(layers) {
  if (!decodedStages.has(layers)) {
    const decoding = Promise.all(layers.map(layer => {
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

async function animate(node, frames, duration, signal, delay = 0) {
  if (!node || reduced() || signal.aborted) return;
  const animation = node.animate(frames, { duration, delay, easing: sineOut, fill: 'both' });
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

function renderHealth(layerNode, assets, encounter, definitions, signal) {
  const health = assets.hud.health;
  const indicators = new Map();
  sprite(layerNode, health?.base);
  for (const [index, [side, cardIds, damage, x]] of [
    ['player', encounter.playerCardIds, encounter.playerDamage, 10],
    ['opponent', encounter.opponentCardIds, encounter.opponentDamage, 600],
  ].entries()) {
    const card = definitions.get(cardIds[0]);
    if (!Number.isInteger(card?.hp) || !Number.isInteger(damage[0])) continue;
    const hp = Math.max(0, card.hp - damage[0]);
    const gauge = health?.gauges?.[index];
    let line;
    if (gauge && card.hp > 0) {
      line = gaugeLine(layerNode, gauge);
      line.style.background = health.color;
      line.style.transform = `scaleX(${hp / card.hp})`;
    }
    const label = health?.labels?.[side === 'player' ? 'player' : 'foe'];
    const healthValue = output(layerNode, `quest-battle-${side}-hp`, 'quest-battle-hp', label?.x ?? x, label?.y ?? 397);
    healthValue.dataset.hp = String(hp);
    healthValue.dataset.max = String(card.hp);
    healthValue.setAttribute('aria-label', side === 'player' ? '我方生命值' : '對手生命值');
    const current = document.createElement('strong');
    current.textContent = healthValue.dataset.hp;
    healthValue.append(current, `/${card.hp}`);
    indicators.set(side, { current, healthValue, line, maximum: card.hp });
  }
  return async hitPoints => {
    const changes = [];
    for (const [side, { current, healthValue, line, maximum }] of indicators) {
      const hp = hitPoints[side];
      if (!Number.isInteger(hp) || hp === Number(healthValue.dataset.hp)) continue;
      const previous = line?.style.transform;
      const next = `scaleX(${Math.max(0, Math.min(1, hp / maximum))})`;
      if (line) line.style.transform = next;
      changes.push((async () => {
        if (line) await animate(line, [{ transform: previous }, { transform: next }], 100, signal);
        if (signal.aborted) return;
        healthValue.dataset.hp = String(hp);
        current.textContent = String(hp);
      })());
    }
    await Promise.all(changes);
  };
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

function faceDownCards(parent, count, position, signal) {
  if (parent.dataset.count === String(count)) return Array.from(parent.children);
  const nodes = [];
  parent.replaceChildren();
  parent.dataset.count = String(count);
  for (let index = 0; index < count; index += 1) {
    const canvas = document.createElement('canvas');
    canvas.className = 'quest-battle-dealt-back';
    canvas.setAttribute('aria-hidden', 'true');
    place(canvas, ...position(index, count));
    parent.append(canvas);
    nodes.push(canvas);
    void renderActionCard(canvas, null, { signal, back: true });
  }
  return nodes;
}

const opponentHandPosition = index => [730 - index * 20, -6];
const opponentTablePosition = (index, count) => [378 + (count / 2 - .5 - index) * 60, 127];

function drawOpponentCards(hands, handCount, tableCount, signal) {
  hands.opponent.setAttribute('aria-label', `對手手牌 ${handCount} 張`);
  hands.opponentTable.setAttribute('aria-label', `對手已放置 ${tableCount} 張牌`);
  faceDownCards(hands.opponentTable, tableCount, opponentTablePosition, signal);
  return faceDownCards(hands.opponent, handCount, opponentHandPosition, signal);
}

async function revealHand(hands, ready, signal, { onDeal, onEvent, opponentHandCount }) {
  const entries = [
    ...ready.action.cards.map(card => ({ ...card, kind: 'action' })),
    ...ready.event.cards.map(card => ({ ...card, kind: 'event' })),
  ];
  const metadata = actionCards(entries.map(card => card.id), signal);
  const newlyDrawn = ready.action.opponentDrawCount + ready.event.opponentDrawCount;
  const count = Number.isInteger(opponentHandCount) ? opponentHandCount : newlyDrawn;
  const survivors = hands.player.children.length;
  const players = entries.map((entry, index) => playerCard(hands.player, entry, survivors + index, survivors + entries.length));
  const opponents = drawOpponentCards(hands, count, 0, signal).slice(Math.max(0, count - newlyDrawn));
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
    return animate(node, [{ opacity: 0, transform: `translate(${x}px,${y}px) scale(.5)` },
      { opacity: 1, transform: 'none' }], 300 / 1.7, signal, delay);
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

function drawStands(parent, stands, encounter, opening = false) {
  const distance = encounter.duel.distance;
  const nodes = [];
  for (const [side, ids, xs] of [
    ['player', encounter.playerCardIds, [288, 184, 80]],
    ['opponent', encounter.opponentCardIds, [472, 576, 680]],
  ]) {
    const id = opening && side === 'opponent' ? ids.at(-1) : ids[0];
    const pose = stands?.[id];
    const foe = side === 'opponent';
    const part = opening ? pose?.opening : pose?.stand;
    if (!part) continue;
    const [x, y] = opening ? part.origin : [xs[distance - 1], 416];
    const flipOrigin = art => foe ? x - art.width - art.x * 2 : x;
    if (!opening && pose.shadow) {
      const shadow = assetAt(parent, pose.shadow, flipOrigin(pose.shadow), y, foe);
      if (shadow) shadow.dataset.side = side;
    }
    const image = assetAt(parent, part, flipOrigin(part), y, foe);
    if (!image) continue;
    image.dataset.cardId = String(id);
    image.dataset.side = side;
    image.classList.add('quest-battle-stand');
    nodes.push({ image, part, foe });
  }
  return nodes;
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

function renderSkills(battle, skills, player, foe) {
  if (!skills?.base) return;
  const strip = layer(battle, 'quest-battle-skills', 5, 'quest-battle-skills');
  const label = skills.labelOffset;
  for (const [card, position] of [[player, skills.player], [foe, skills.foe]]) {
    for (const [index, { name, kind }] of (card?.skills ?? []).entries()) {
      const art = skills.types[kind];
      if (!art) continue;
      const x = position.x + position.step * index;
      const y = position.y;
      for (const part of [skills.base, art]) sprite(strip, { ...part, x: x + part.x, y: y + part.y });
      const nameLabel = document.createElement('span');
      nameLabel.className = 'quest-battle-skill-name';
      nameLabel.textContent = name;
      place(nameLabel, x + label.x, y + label.y, label.width, label.height);
      strip.append(nameLabel);
    }
  }
  return strip;
}

function showMoveCutIns(battle, manifest, encounter, signal, onlySide) {
  const cutIn = layer(battle, 'quest-battle-cut-ins', 17, onlySide ? undefined : 'quest-battle-cut-ins');
  const poses = [];
  for (const [id, foe] of [[encounter.playerCardIds[0], false], [encounter.opponentCardIds[0], true]]) {
    if (onlySide && onlySide !== (foe ? 'opponent' : 'player')) continue;
    const source = manifest?.cutIns?.[id];
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

function revealMoveCards(hands, result, signal, { player = true, opponent = true } = {}) {
  const rows = [
    [hands.playerTable, result.playerCards, false, 380, 389, false],
    [hands.opponentTable, result.opponentCards, result.opponentLocked, 378, 127, true],
  ].filter(row => row[5] ? opponent : player);
  const definitions = actionCards(rows.flatMap(([, cards, locked]) => locked ? [] : cards.map(card => card.id)), signal);
  return Promise.all(rows.map(async ([parent, cards, locked, cx, cy, side]) => {
    parent.replaceChildren();
    parent.dataset.count = String(cards.length);
    parent.dataset.locked = String(side ? result.opponentLocked : result.playerLocked);
    const nodes = cards.map(({ id, up }, index) => {
      const card = document.createElement(side ? 'div' : 'li');
      card.className = 'quest-battle-hand-card quest-battle-reveal-card';
      if (!locked) {
        card.dataset.cardId = String(id);
        card.dataset.up = String(up);
      }
      card.dataset.locked = String(locked);
      place(card, cx + (index - (cards.length - 1) / 2) * (side ? -60 : 60), cy);
      card.textContent = locked ? '' : `#${id}`;
      parent.append(card);
      return card;
    });
    const known = await definitions;
    for (const [i, card] of nodes.entries()) {
      if (signal.aborted) return;
      const { id, up } = cards[i];
      const canvas = document.createElement('canvas');
      if (await renderActionCard(canvas, known.get(id), { signal, reversed: !up, back: locked, large: locked, locked }) && !signal.aborted) {
        card.replaceChildren(canvas);
        if (side && !locked) void animate(canvas, [{ scale: '.02 1' }, { scale: '1 1' }], 100, signal);
      }
      if (side) {
        playQuestBattleEffect(locked ? 'reveal-locked' : 'reveal', signal);
        if (!reduced()) await wait(100, signal);
      }
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
  assets, encounter, scene, definitions, stands, signal, isCurrent, onBattleFinish, onBattleSound, returnToMap,
}) {
  const { hud } = assets;
  const standees = layer(battle, 'quest-battle-standees', 2);
  drawStands(standees, stands, encounter);
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
  const skills = renderSkills(battle, hud.skills, definitions.get(player), definitions.get(encounter.opponentCardIds[0]));
  const chat = renderChatDecoration(battle, hud.chat);
  const updateHealth = renderHealth(main, assets, encounter, definitions, signal);
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
    const bonus = output(main, 'quest-battle-bonus', 'quest-battle-bonus', x, y, width, height);
    bonus.value = `Bonus ${initial}`;
    bonus.style.color = color;
    bonus.style.fontSize = `${fontSize}px`;
    bonus.style.letterSpacing = `${letterSpacing}px`;
  }
  const deck = output(main, 'quest-battle-deck-count', 'quest-battle-deck-count', -6, 53);
  deck.setAttribute('aria-label', '剩餘行動牌');
  let deckSize = encounter.duel.deckSize;
  if (Number.isInteger(deckSize)) deck.value = String(deckSize);
  const roster = layer(battle, 'quest-battle-roster', 30);
  const activeFace = character(roster, definitions.get(player), player, encounter.playerDamage[0], 0, 440, 1, signal);
  const hands = createHands(battle);
  const battleChrome = [standees, base, skills, handPlate, avatar, main, chat, roster].filter(Boolean);
  const status = output(main, 'quest-battle-status', 'sr-only', 178, 24);
  status.setAttribute('role', 'status');
  status.tabIndex = -1;
  const move = createQuestBattleMove({ battle, scene, encounterKey: encounter.key, hud, hands, controls, combatControls, status,
    multi: encounter.duel.multi, signal, isCurrent });
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
  let presentedMove = false;
  let tableLoop;
  let combatView;
  let opponentRevealKey;
  let terminalTask;
  let duelResult;
  let resultStatus;
  signal.addEventListener('abort', () => tableLoop?.cancel(), { once: true });

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
    await revealMoveCards(hands, result, signal);
    if (signal.aborted || !isCurrent()) return;
    await showMoveArrows(battle, hud.movePresentation, result, signal);
    if (signal.aborted || !isCurrent()) return;
    range?.remove();
    range = sprite(main, hud.range?.[rangeNames[result.distance - 1]]);
    const config = hud.movePresentation?.distance;
    const anchors = { player: config?.playerX ?? [288, 184, 80, 184], opponent: config?.foeX ?? [472, 576, 680, 576] };
    const priorDistance = Number(battle.dataset.distance);
    const shifts = [];
    for (const actor of standees.children) {
      const x = anchors[actor.dataset.side];
      const delta = x?.[result.distance - 1] - x?.[priorDistance - 1];
      if (!Number.isFinite(delta) || !delta) continue;
      actor.style.left = `${Number.parseFloat(actor.style.left) + delta}px`;
      shifts.push(animate(actor, [{ translate: `${-delta}px 0` }, { translate: '0 0' }], config?.durationMs ?? 300, signal));
    }
    battle.dataset.distance = String(result.distance);
    battle.dataset.initiative = result.playerInitiative ? 'player' : 'opponent';
    await Promise.all([...shifts, endCutIns?.()]);
    if (!signal.aborted) {
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
        cutIn: side => showMoveCutIns(battle, hud.movePresentation, encounter, signal, side),
        startTimer: onTimeout => startMoveTimer(main, hud.time, signal, onTimeout, true),
        loadDiceArt: () => battleExchangeArt(signal), playDiceRoll: playQuestDiceRoll,
        playHit: playQuestHitEffect, playAttackPose: playQuestAttackPose,
        onSettled() {
          if (combatView !== active) return;
          active.settled = true;
          advance();
        },
        async updateHp(hitPoints) {
          await updateHealth(hitPoints);
          if (signal.aborted || !isCurrent()) return;
          const card = definitions.get(player);
          const hp = hitPoints.player;
          if (card && Number.isInteger(hp) && hp <= card.hp) {
            void renderCharacterCard(activeFace.canvas, card, { signal, damage: card.hp - hp });
          }
        },
        initialHp: {
          player: Number(main.querySelector('#quest-battle-player-hp')?.dataset.hp),
          opponent: Number(main.querySelector('#quest-battle-opponent-hp')?.dataset.hp),
        },
        drawOpponent: count => {
          hands.opponentTable.hidden = false;
          if (opponentRevealKey) {
            delete hands.opponentTable.dataset.count;
            opponentRevealKey = undefined;
          }
          faceDownCards(hands.opponentTable, count, opponentTablePosition, signal);
        },
        revealCards: (reveal, boundary) => {
          const key = JSON.stringify([reveal.opponentLocked, reveal.opponentCards]);
          const opponent = reveal.opponentCards.length > 0 && key !== opponentRevealKey;
          if (opponent) {
            hands.opponentTable.hidden = false;
            opponentRevealKey = key;
          }
          const player = boundary === 'final';
          if (player) {
            const spent = new Set(reveal.playerCards.map(({ id }) => id));
            for (const card of Array.from(hands.player.children)) if (spent.has(Number(card.dataset.cardId))) card.remove();
          }
          return revealMoveCards(hands, reveal, signal, { player, opponent });
        },
      });
      opponentRevealKey = undefined;
      hands.opponentTable.replaceChildren();
      delete hands.opponentTable.dataset.count;
      move.beginCombat(key);
    }
    combatView.view.update({ ...latest, exchange: source, result: observedMoves.get(source.turn) ?? latest.result });
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
    duelResult?.setCanReturn(outcome.canReturn === true);
    if (!resultStatus) return;
    resultStatus.value = {
      'awaiting-settlement': '正在等待任務結算確認。',
      uncertain: '無法確認任務結算。',
      'bonus-pending': '正在等待獎勵結算。',
    }[outcome.state] ?? '';
    resultStatus.className = ['uncertain', 'bonus-pending'].includes(outcome.state) ? 'quest-battle-status' : 'sr-only';
  }

  async function presentDuelResult() {
    onBattleFinish?.();
    const { duel, receipt, canReturn } = latest.outcome;
    renderedState = 'terminal';
    battle.dataset.phase = 'terminal';
    stopTimer?.();
    combatControls.hidden = controls.hidden = true;
    move.setCombatRole(undefined);
    if (!reduced()) await wait(1500, signal);
    if (signal.aborted || !isCurrent()) return;
    const pieces = [...battleChrome, hands.root];
    for (const node of pieces) node.inert = true;
    await Promise.all(pieces.map(node => animate(node, [{ opacity: 1 }, { opacity: 0 }], 500 / 1.7, signal)));
    if (signal.aborted || !isCurrent()) return;
    for (const node of pieces) node.hidden = true;
    showTable('blank');
    duelResult = mountQuestDuelResult(battle, {
      outcome: duel, receipt, playerCardId: player, signal, canReturn, onSound: onBattleSound,
      onReturn: () => !signal.aborted && isCurrent() && latest.outcome?.canReturn === true && returnToMap?.(),
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
      endCutIns = showMoveCutIns(battle, hud.movePresentation, encounter, signal);
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
    const outcome = latest.outcome;
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
      if (source?.boundary !== 'next-turn' || latest.turn !== visibleTurn + 1) return;
      archiveCombat();
      startDraw(latest.turn);
    }
    if (!visibleTurn && Number.isInteger(latest.turn)) startDraw(latest.turn);
    if (['uncertain', 'closed'].includes(latest.phase)) { paint(latest.phase); return; }

    const ready = latest.ready;
    if (ready?.turn === visibleTurn && drawingTurn !== visibleTurn) {
      drawingTurn = visibleTurn;
      battle.dataset.readyTurn = String(ready.turn);
      battle.dataset.drawState = 'dealing';
      void revealHand(hands, ready, signal, {
        opponentHandCount: latest.opponentHandCount,
        onDeal() { if (deckSize > 0) deck.value = String(--deckSize); },
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
        else if (latest.phase === 'character-change' || source?.boundary === 'character-change') {
          status.value = '等待角色更換。';
        } else {
          const changed = ['player', 'opponent'].some(side => {
            const roster = latest.roster?.[side];
            const actual = roster?.cards[roster.activeIndex]?.cardId;
            return Number.isInteger(actual) && actual !== encounter[`${side}CardIds`][0];
          });
          if (!changed) updateCombat(source);
        }
      }
      return;
    }
    if (['move', 'committing', 'settling'].includes(latest.phase) && Number.isSafeInteger(latest.opponentHandCount) &&
        Number.isSafeInteger(latest.opponentMoveCount)) {
      hands.opponentTable.hidden = false;
      drawOpponentCards(hands, latest.opponentHandCount, latest.opponentMoveCount, signal);
    }
    if (['move', 'committing', 'settling'].includes(latest.phase)) paint(latest.phase);
    if (Number.isFinite(latest.moveStartedAt)) battle.dataset.moveStartedAt = String(latest.moveStartedAt);
  }

  function receive(next) {
    if (signal.aborted || !isCurrent() || !next.adventure?.battle) return;
    latest = next.adventure.battle;
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
    if (!signal.aborted && isCurrent()) paint('uncertain');
  });
}

export async function mountQuestBattleEntry(view, board, {
  encounter, landSlot, layers, assets, signal, scene, loadCards, isCurrent, onEncounter, onBattleFinish, onBattleSound, returnToMap,
}) {
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
  for (const source of layers) sprite(battle, source);
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
  const [definitions, stands] = await Promise.all([loadCards(cards), battleStands(signal),
    prepareQuestBattleStage([...openingLayers.values()])]);
  if (signal.aborted || view.inert || !isCurrent()) return;
  const sourceAvatar = board.querySelector('#quest-map-avatar');
  await runOpening(battle, sourceAvatar, { assets, encounter, definitions, stands, signal });
  if (signal.aborted || view.inert || !isCurrent()) return;
  await renderBattleHud(battle, sourceAvatar, {
    assets, encounter, scene, definitions, stands, signal, isCurrent, onBattleFinish, onBattleSound, returnToMap,
  });
}
