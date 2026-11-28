import { battleStands } from './battle-card.js';

const resultArt = new URL('./quest-result-art/', import.meta.url);
const standArt = new URL('./battle-card-art/', import.meta.url);
const resultNames = ['win', 'lose', 'draw'];
const resultText = ['勝利', '敗北', '平手'];
const awardNames = ['gems', 'exp', 'expBonus', 'gemsPow', 'expPow', 'totalGems', 'totalExp'];
const sineOut = 'linear(0,.1951,.3827,.5556,.7071,.8315,.9239,.9808,1)';
const bitmaps = new Map();
let artwork;

function loadArt() {
  artwork ??= fetch(new URL('index.json', resultArt), { redirect: 'error', signal: AbortSignal.timeout(3500) }).then(response => {
    if (!response.ok) throw new Error('Original quest battle result unavailable');
    return response.json();
  }).catch(() => {
    artwork = undefined;
    return null;
  });
  return artwork;
}

function decode(root, frame) {
  if (typeof frame?.file !== 'string' || !/^[a-zA-Z0-9_-]+\.png$/.test(frame.file)
      || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0) {
    return Promise.resolve(null);
  }
  const url = new URL(frame.file, root).href;
  if (!bitmaps.has(url)) {
    const image = new Image();
    image.src = url;
    bitmaps.set(url, image.decode().then(() => url).catch(() => {
      bitmaps.delete(url);
      return null;
    }));
  }
  return bitmaps.get(url).then(src => src && { ...frame, src });
}

function untilAbort(promise, signal) {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise(resolve => {
    function finish(value) {
      signal.removeEventListener('abort', cancel);
      resolve(value);
    }
    function cancel() { finish(null); }
    signal.addEventListener('abort', cancel, { once: true });
    void promise.then(finish, cancel);
  });
}

function put(node, { x, y, width, height }) {
  Object.assign(node.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
}

function nodeIn(parent, tag, id) {
  const node = parent.ownerDocument.createElement(tag);
  if (id) node.id = id;
  parent.append(node);
  return node;
}

function paint(node, layer) {
  node.hidden = !layer;
  if (!layer) return;
  if (node.src !== layer.src) node.src = layer.src;
  put(node, layer);
}

function graphic(parent, layer, id) {
  const node = nodeIn(parent, 'img', id);
  node.alt = '';
  node.style.pointerEvents = 'none';
  paint(node, layer);
  return node;
}

function wait(ms, signal) {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const id = setTimeout(finish, ms);
    function finish() {
      clearTimeout(id);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish, { once: true });
  });
}

async function tween(node, frames, duration, signal) {
  if (signal.aborted) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    Object.assign(node.style, frames.at(-1));
    return;
  }
  const animation = node.animate(frames, { duration, easing: sineOut, fill: 'both' });
  const cancel = () => animation.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await animation.finished;
    Object.assign(node.style, frames.at(-1));
  } catch {
    // A scene exit cancels the tween.
  } finally {
    signal.removeEventListener('abort', cancel);
    animation.cancel();
  }
}

function fade(node, from, to, duration, signal) {
  return tween(node, [{ opacity: String(from) }, { opacity: String(to) }], duration, signal);
}

function slide(node, axis, from, duration, signal) {
  return tween(node, [{ transform: `translate${axis}(${from}px)` }, { transform: 'none' }], duration, signal);
}

async function playTrack(node, track, duration, signal) {
  if (!Array.isArray(track?.frames) || !track.frames.length || !Number.isFinite(track.framesPerSecond)
      || track.framesPerSecond <= 0 || signal.aborted) return false;
  const frames = await untilAbort(Promise.all(track.frames.map(frame => decode(resultArt, frame))), signal);
  if (!frames?.some(Boolean) || signal.aborted) return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    paint(node, frames.findLast(Boolean));
    return true;
  }
  const start = performance.now();
  const step = 1000 / track.framesPerSecond;
  for (let index = 0; index < frames.length && !signal.aborted; index += 1) {
    await wait(index * step - (performance.now() - start), signal);
    if (signal.aborted) return false;
    if (performance.now() - start >= duration) break;
    paint(node, frames[index]);
  }
  if (signal.aborted) return false;
  paint(node, track.holdLast ? frames.at(-1) : null);
  await wait(duration - (performance.now() - start), signal);
  return !signal.aborted;
}

function levelFrom(receipt) {
  const level = receipt?.avatar?.level;
  const delta = receipt?.deltas?.level;
  return Number.isSafeInteger(level) && Number.isSafeInteger(delta) && delta > 0 && level >= delta
    ? level - delta + 1 : null;
}

function scoreNodes(parent, rewards, outcome) {
  const columns = [83, 161, 225, 305, 378];
  const values = {
    gems: [['gems', outcome.gems], ['gemsBonus', 0], ['gemsPow', outcome.gemsPow],
      ['gemsCardPower', 100], ['totalGems', outcome.totalGems]],
    exp: [['exp', outcome.exp], ['expBonus', outcome.expBonus], ['expPow', outcome.expPow],
      ['expCardPower', 100], ['totalExp', outcome.totalExp]],
  };
  return Object.entries(values).map(([key, row], rowIndex) => row.map(([field, value], index) => {
    const total = index === 4;
    const geometry = rewards?.labels?.[key]?.[index] ?? {
      x: columns[index], y: 597 + 45 * rowIndex - (total ? 10 : 0), width: total ? 170 : 60, height: 40,
    };
    const node = nodeIn(parent, 'span');
    node.dataset.award = field;
    node.textContent = String(value);
    node.dataset.value = node.textContent;
    Object.assign(node.style, {
      font: `${total ? 40 : 30}px/40px "Bradley Gratis", Georgia, serif`, textAlign: 'right', letterSpacing: '2px',
      color: '#e0e0e0', textShadow: '0 0 2px #000, 0 0 2px #000', opacity: index < 2 ? '1' : '0',
    });
    put(node, geometry);
    return { node, y: geometry.y };
  }));
}

async function portraitLayer(playerCardId, signal) {
  const stands = await battleStands(signal);
  const pose = stands?.[playerCardId]?.opening;
  const frame = pose?.frames?.[pose.settledFrame - 1];
  if (!frame || signal.aborted) return null;
  const [sx, sy, dx, dy] = frame;
  const [cx, cy] = pose.origin;
  return decode(standArt, { file: pose.file, x: cx + dx + pose.x * sx, y: cy + dy + pose.y * sy,
    width: pose.width * sx, height: pose.height * sy });
}

/** Show the original no-bonus Quest battle awards before returning to the retained Quest map. */
export function mountQuestDuelResult(battle, {
  outcome, playerCardId, signal, canReturn = false, receipt, onReturn, onSound,
}) {
  const controller = new AbortController();
  const visual = controller.signal;
  const valid = Number.isInteger(outcome?.result) && outcome.result >= 0 && outcome.result < resultNames.length
    && outcome.bonus === false && awardNames.every(key => Number.isSafeInteger(outcome[key]));
  if (signal?.aborted || !valid) return { ready: Promise.resolve(false), setCanReturn() {}, setLevelUp() {}, dispose() {} };

  const originalChildren = Array.from(battle.children)
    .filter(node => !node.querySelector('#quest-battle-settlement-status')).map(node => [node, node.inert]);
  for (const [node] of originalChildren) node.inert = true;
  const overlay = nodeIn(battle, 'section', 'quest-battle-result');
  overlay.dataset.result = String(outcome.result);
  overlay.dataset.state = 'loading';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'quest-battle-result-title');
  overlay.tabIndex = -1;
  Object.assign(overlay.style, { position: 'absolute', inset: '0', zIndex: '40', overflow: 'hidden' });
  const heading = nodeIn(overlay, 'h2', 'quest-battle-result-title');
  heading.className = 'sr-only';
  heading.textContent = `對戰結果 ${resultText[outcome.result]}`;
  const shade = nodeIn(overlay, 'div');
  Object.assign(shade.style, { position: 'absolute', inset: '0', background: '#000', opacity: '0' });
  const portrait = graphic(overlay, null, 'quest-battle-result-portrait');
  const destination = graphic(overlay, null, 'quest-battle-result-call');
  const rewards = nodeIn(overlay, 'div', 'quest-battle-result-awards');
  rewards.hidden = true;
  rewards.setAttribute('role', 'group');
  rewards.setAttribute('aria-label', 'Gem 和 EXP');
  const levelLayer = nodeIn(overlay, 'div', 'quest-battle-result-level');
  levelLayer.hidden = true;
  const button = nodeIn(overlay, 'button', 'quest-battle-result-ok');
  button.type = 'button';
  button.textContent = 'OK';
  button.hidden = true;
  button.disabled = true;
  button.setAttribute('aria-label', 'OK');
  put(button, { x: 576, y: 600, width: 136, height: 51 });
  overlay.focus({ preventScroll: true });

  let returnAllowed = canReturn === true;
  let ready = false;
  let leaving = false;
  let awardsShown = false;
  let assets;
  let missingArt = false;
  let level = levelFrom(receipt);
  let levelTask;
  let levelPlaying = false;

  function sound(cue) {
    try { void Promise.resolve(onSound?.(cue)).catch(() => {}); } catch { /* Audio is independent of the result. */ }
  }

  function gate() {
    const enable = ready && returnAllowed && !leaving && !levelPlaying && typeof onReturn === 'function';
    const focus = enable && button.disabled && overlay.ownerDocument.activeElement === overlay;
    button.disabled = !enable;
    if (focus) button.focus({ preventScroll: true });
  }

  function stableState() {
    overlay.dataset.state = missingArt ? 'unavailable' : 'ready';
    gate();
  }

  function showLevel() {
    if (!level || !awardsShown || leaving || visual.aborted) return levelTask;
    if (levelTask) return levelTask;
    levelPlaying = true;
    overlay.dataset.state = 'level-up';
    gate();
    levelTask = (async () => {
      levelLayer.hidden = false;
      const animation = assets?.levelUp;
      const decoration = graphic(levelLayer, null);
      const label = nodeIn(levelLayer, 'div');
      label.textContent = `虛擬人物的等級提升為${level}。${level === 2 ? '\n增加1點AP' : ''}`;
      put(label, { x: 192, y: 500, width: 380, height: 80 });
      Object.assign(label.style, { color: '#fff', textAlign: 'center', whiteSpace: 'pre-line', opacity: '0',
        font: '14px "Noto Serif TC", serif', letterSpacing: '1px' });
      if (animation) await playTrack(decoration, animation, animation.waitMs ?? animation.frames.length * 42, visual);
      if (visual.aborted) return;
      await fade(label, 0, 1, 500, visual);
    })().catch(() => {}).finally(() => {
      levelPlaying = false;
      if (ready && !visual.aborted && !leaving) stableState();
    });
    return levelTask;
  }

  function setCanReturn(value) { returnAllowed = value === true; gate(); }
  function setLevelUp(next) {
    if (!levelTask) level = levelFrom(next) ?? level;
    void showLevel();
  }

  button.addEventListener('click', async () => {
    if (button.disabled || leaving || visual.aborted) return;
    leaving = true;
    overlay.dataset.state = 'leaving';
    gate();
    sound('confirm');
    try {
      if (await onReturn() !== false) return;
    } catch { /* Allow another local attempt while the retained result remains authoritative. */ }
    if (visual.aborted) return;
    leaving = false;
    stableState();
    if (!button.disabled) button.focus({ preventScroll: true });
  }, { signal: visual });

  function dispose() {
    if (visual.aborted) return;
    controller.abort();
    signal?.removeEventListener('abort', dispose);
    overlay.remove();
    for (const [node, inert] of originalChildren) node.inert = inert;
  }
  signal?.addEventListener('abort', dispose, { once: true });

  async function present() {
    sound(outcome.result === 0 ? 'win' : 'lose');
    const assetRequest = loadArt();
    const character = portraitLayer(playerCardId, visual).catch(() => null);
    await fade(shade, 0, .5, 500, visual);
    assets = await untilAbort(assetRequest, visual);
    if (visual.aborted) return false;

    overlay.dataset.state = 'outcome';
    const outcomeTrack = assets?.outcomes?.[resultNames[outcome.result]];
    const call = await playTrack(destination, outcomeTrack, 2000, visual);
    if (visual.aborted) return false;
    if (!call) {
      missingArt = true;
      heading.className = '';
      Object.assign(heading.style, { position: 'absolute', top: '220px', width: '100%', textAlign: 'center', color: '#fff' });
    }
    if (!outcomeTrack?.holdLast) destination.hidden = true;

    overlay.dataset.state = 'awards';
    const rewardPlate = await untilAbort(decode(resultArt, assets?.rewards?.plate), visual);
    if (visual.aborted) return false;
    missingArt ||= !rewardPlate;
    const plate = graphic(rewards, rewardPlate);
    if (!rewardPlate) {
      for (const [key, y] of [['Gem', 597], ['EXP', 642]]) {
        const label = nodeIn(rewards, 'span');
        label.textContent = key;
        Object.assign(label.style, { position: 'absolute', left: '16px', top: `${y}px`, color: '#fff' });
      }
    }
    const rows = scoreNodes(rewards, assets?.rewards, outcome);
    rewards.hidden = false;
    await Promise.all([slide(plate, 'Y', 220, 300, visual),
      ...rows.flatMap(row => row.slice(0, 2).map(({ node, y }) => slide(node, 'Y', 805 - y, 300, visual)))]);
    for (const index of [2, 3, 4]) await Promise.all(rows.map(row => fade(row[index].node, 0, 1, 300, visual)));
    if (visual.aborted) return false;

    awardsShown = true;
    const buttonLayers = await untilAbort(Promise.all(['up', 'over', 'down'].map(key => decode(resultArt, assets?.ok?.[key]))), visual);
    if (visual.aborted) return false;
    await showLevel();
    if (visual.aborted) return false;
    const [up, over, down] = buttonLayers;
    const area = assets?.ok?.hit;
    if (up && Array.isArray(area) && area.length === 4 && area.every(Number.isFinite)) {
      const [x, y, width, height] = area;
      put(button, { x, y, width, height });
      button.textContent = '';
      Object.assign(button.style, { background: 'none', border: '0', padding: '0' });
      const relative = layer => ({ ...layer, x: layer.x - x, y: layer.y - y });
      const skin = graphic(button, relative(up));
      for (const [event, layer] of [['pointerenter', over], ['pointerdown', down], ['pointerup', over], ['pointerleave', up],
        ['pointercancel', up]]) button.addEventListener(event, () => paint(skin, relative(button.disabled ? up : layer ?? up)), { signal: visual });
    } else missingArt = true;
    button.hidden = false;
    await fade(button, 0, 1, 500 / 1.7, visual);
    if (visual.aborted) return false;
    ready = true;
    if (!levelPlaying) stableState();
    void untilAbort(character, visual).then(layer => {
      if (!layer || visual.aborted || leaving) return;
      paint(portrait, layer);
      return slide(portrait, 'X', -500, 1000, visual);
    });
    return true;
  }

  return { ready: present(), setCanReturn, setLevelUp, dispose };
}
