import { playQuestBattleEffect } from './bgm.js';
import { BATTLE_CARD_ART, battleStands, renderActionCard } from './battle-card.js';
import { renderCharacterCard } from './character-card.js';

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

function renderHealth(layerNode, assets, encounter, definitions) {
  const health = assets.hud.health;
  sprite(layerNode, health?.base);
  for (const [index, [side, cardIds, damage, x]] of [
    ['player', encounter.playerCardIds, encounter.playerDamage, 10],
    ['opponent', encounter.opponentCardIds, encounter.opponentDamage, 600],
  ].entries()) {
    const card = definitions.get(cardIds[0]);
    if (!Number.isInteger(card?.hp) || !Number.isInteger(damage[0])) continue;
    const hp = Math.max(0, card.hp - damage[0]);
    const gauge = health?.gauges?.[index];
    if (gauge && card.hp > 0) {
      const line = gaugeLine(layerNode, gauge);
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
  }
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

async function revealHand(hands, ready, signal, { onDeal, onEvent }) {
  const entries = [
    ...ready.action.cards.map(card => ({ ...card, kind: 'action' })),
    ...ready.event.cards.map(card => ({ ...card, kind: 'event' })),
  ];
  const metadata = actionCards(entries.map(card => card.id), signal);
  const count = ready.action.opponentDrawCount + ready.event.opponentDrawCount;
  const players = entries.map((entry, index) => playerCard(hands.player, entry, index, entries.length));
  const opponents = drawOpponentCards(hands, count, 0, signal);

  void metadata.then(cards => {
    if (signal.aborted) return;
    players.forEach((node, index) => {
      const entry = entries[index];
      const definition = cards.get(entry.id);
      if (!definition) return;
      const face = entry.up ? definition.upper : definition.lower;
      if (face) {
        node.dataset.faceType = String(face.type);
        node.dataset.faceValue = String(face.value);
      }
      const canvas = document.createElement('canvas');
      void renderActionCard(canvas, definition, { signal, reversed: !entry.up }).then(painted => {
        if (painted && !signal.aborted) node.replaceChildren(canvas);
      });
    });
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
    if (!opening && pose.shadow) assetAt(parent, pose.shadow, flipOrigin(pose.shadow), y, foe);
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

function startMoveTimer(parent, time, signal) {
  if (!time) return () => {};
  const base = sprite(parent, time.base);
  const meter = output(parent, 'quest-battle-move-time', 'sr-only', 0, 0);
  meter.setAttribute('role', 'timer');
  meter.setAttribute('aria-live', 'off');
  meter.setAttribute('aria-label', '移動階段時間');
  const gauges = time.gauges.map(position => gaugeLine(parent, position));
  const started = performance.now();
  const { colors, colorStops, warningAt } = time;
  meter.dataset.durationMs = String(time.durationMs);
  let frame;
  function cancel() {
    if (frame) cancelAnimationFrame(frame);
    signal.removeEventListener('abort', cancel);
    base?.remove();
    for (const line of gauges) line.remove();
    meter.remove();
  }
  function draw(now) {
    const remaining = Math.max(0, time.durationMs - (now - started));
    const ratio = remaining / time.durationMs;
    const seconds = String(Math.ceil(remaining / 1000));
    if (meter.value !== seconds) meter.value = seconds;
    meter.dataset.warning = String(ratio < warningAt);
    const elapsed = 1 - ratio;
    const first = elapsed < colorStops[1] ? 0 : 1;
    const weight = Math.min(100, (elapsed - colorStops[first]) / (colorStops[first + 1] - colorStops[first]) * 100);
    for (const line of gauges) {
      line.style.transform = `scaleX(${ratio})`;
      line.style.background = `color-mix(in srgb, ${colors[first]} ${100 - weight}%, ${colors[first + 1]})`;
    }
    if (remaining > 0 && !signal.aborted) frame = requestAnimationFrame(draw);
  }
  signal.addEventListener('abort', cancel, { once: true });
  draw(started);
  return cancel;
}

function createHands(battle) {
  const hands = layer(battle, 'quest-battle-hands', 25);
  const player = document.createElement('ol');
  player.id = 'quest-battle-player-hand';
  player.setAttribute('aria-label', '我方手牌');
  const opponent = document.createElement('div');
  opponent.id = 'quest-battle-opponent-hand';
  opponent.setAttribute('role', 'img');
  const opponentTable = document.createElement('div');
  opponentTable.id = 'quest-battle-opponent-table';
  opponentTable.setAttribute('role', 'img');
  hands.append(opponent, opponentTable, player);
  return { player, opponent, opponentTable };
}

function readOnlyMoveControls(parent, hud, multi) {
  const commands = hud.moveButtons;
  sprite(parent, hud.done?.plate);
  for (const [key, name] of [['back', '後退一格'], ['stay', '原地待機'], ['change', '更換角色'], ['forward', '前進一格'], ['done', '完成']]) {
    if (key === 'change' && !multi) continue;
    const command = key === 'done' ? hud.done : commands?.[key];
    if (!command?.up) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = true;
    button.dataset.moveCommand = key;
    button.setAttribute('aria-label', name);
    const { up } = command;
    const x = key === 'done' ? up.x : command[multi ? 'x3v3' : 'x1v1'] + up.x;
    const y = key === 'done' ? up.y : command.y + up.y;
    place(button, x, y, up.width, up.height);
    sprite(button, { ...up, x: 0, y: 0 });
    parent.append(button);
  }
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

async function renderBattleHud(battle, sourceAvatar, { assets, encounter, scene, definitions, stands, signal, isCurrent }) {
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
  cloneAvatar(avatar, sourceAvatar, 590, 473);
  const main = layer(battle, 'quest-battle-hud', 14, 'quest-battle-hud');
  const player = encounter.playerCardIds[0];
  const skills = renderSkills(battle, hud.skills, definitions.get(player), definitions.get(encounter.opponentCardIds[0]));
  const chat = renderChatDecoration(battle, hud.chat);
  renderHealth(main, assets, encounter, definitions);
  sprite(main, hud.range?.[['short', 'middle', 'long', 'hiding'][encounter.duel.distance - 1]]);
  const phaseSprites = layer(main, 'quest-battle-phase', 0);
  const table = layer(main, 'quest-battle-table', 1);
  const controls = layer(main, 'quest-battle-move-controls', 2, 'quest-battle-move-controls');
  controls.hidden = true;
  readOnlyMoveControls(controls, hud, encounter.duel.multi);
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
  const status = output(main, 'quest-battle-status', 'sr-only', 178, 24);
  status.setAttribute('role', 'status');
  const distance = encounter.duel.distance;
  battle.dataset.distance = String(distance);
  let confirmedDraw;
  let stopTimer;
  let drawn = false;
  let renderedState;

  function showTable(state) {
    table.replaceChildren();
    for (const tableArt of hud.table?.[state]?.layers ?? []) {
      const image = sprite(table, tableArt);
      if (tableArt.blend) image.style.mixBlendMode = tableArt.blend;
    }
  }

  function paint(phase) {
    if (phase === renderedState || signal.aborted) return;
    renderedState = phase;
    battle.dataset.phase = phase;
    status.value = { preparing: '正在等待戰鬥確認。', draw: '抽牌階段', move: '移動階段',
      uncertain: '無法確認就緒結果。', closed: '戰鬥連線已結束。' }[phase] ?? '';
    status.className = phase === 'uncertain' ? 'quest-battle-status' : 'sr-only';
    controls.hidden = phase !== 'move';
    phaseSprites.replaceChildren();
    const phaseArt = { draw: 'drw', move: 'mov' }[phase];
    sprite(phaseSprites, hud.phase?.[phaseArt ?? 'blk']);
    if (phaseArt && hud.phaseAnimation?.[phaseArt]) {
      void runFrames(phaseSprites, hud.phaseAnimation[phaseArt], signal).then(frame => frame?.remove());
    }
    const tableState = phase === 'move' ? encounter.duel.multi ? 'mov3on3' : 'mov'
      : phase === 'draw' ? 'drw_act' : 'blank';
    showTable(tableState);
    stopTimer?.();
    stopTimer = phase === 'move' ? startMoveTimer(main, hud.time, signal) : undefined;
    if (phase === 'draw' || phase === 'move') playQuestBattleEffect('phase', signal);
  }

  function receive(next) {
    if (signal.aborted || !isCurrent()) return;
    const result = next.adventure?.battle;
    if (!result) return;
    if (result.turn === 1 && !battle.dataset.turn) {
      battle.dataset.turn = '1';
      turn.value = '1';
      sprite(main, hud.turn?.['1']);
      paint('draw');
    }
    if (result.ready?.turn === 1 && !confirmedDraw) {
      confirmedDraw = result.ready;
      void revealHand(hands, confirmedDraw, signal, {
        onDeal() { if (deckSize > 0) deck.value = String(--deckSize); },
        onEvent() { if (renderedState === 'draw') showTable('drw_evt'); },
      }).then(() => {
        drawn = true;
        receive(scene.snapshot);
      });
    }
    if (drawn && result.phase === 'move' && Number.isSafeInteger(result.opponentHandCount) && Number.isSafeInteger(result.opponentMoveCount)) {
      drawOpponentCards(hands, result.opponentHandCount, result.opponentMoveCount, signal);
    }
    if (Number.isFinite(result.moveStartedAt)) battle.dataset.moveStartedAt = String(result.moveStartedAt);
    if (result.phase === 'uncertain' || result.phase === 'closed') paint(result.phase);
    else if (result.phase === 'move' && drawn) paint('move');
    else if (!['encounter', 'preparing', 'move'].includes(result.phase)) paint('waiting');
  }

  paint('opening');
  battle.dataset.intro = 'bring-on';
  const bringOn = [standees, base, skills, handPlate, avatar, main, chat, roster].map(node => animate(node,
    [{ opacity: 0 }, { opacity: 1 }], 500 / 1.7, signal));
  await Promise.all([activeFace.ready, ...bringOn]);
  if (signal.aborted || !isCurrent()) return;
  battle.dataset.intro = 'complete';
  paint('preparing');
  scene.subscribe(receive, { signal });
  void scene.readyBattle({ signal }).then(() => receive(scene.snapshot)).catch(() => {
    if (!signal.aborted && isCurrent()) paint('uncertain');
  });
}

export async function mountQuestBattleEntry(view, board, { encounter, layers, assets, signal, scene, loadCards, isCurrent, onEncounter }) {
  const { transition: timing } = assets;
  const delay = timing.delayAfterDetermineMs - (performance.now() - encounter.receivedAt);
  await wait(delay, signal);
  if (signal.aborted || view.inert || !isCurrent()) return;

  const battle = document.createElement('section');
  battle.id = 'quest-map-battle';
  battle.dataset.stage = String(encounter.stage);
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
  await renderBattleHud(battle, sourceAvatar, { assets, encounter, scene, definitions, stands, signal, isCurrent });
}
