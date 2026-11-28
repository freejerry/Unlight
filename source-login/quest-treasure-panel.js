import { renderCharacterCard } from './character-card.js';

const art = new URL('./quest-result-art/', import.meta.url);
const width = 780;
const height = 680;
const focalLength = width / (2 * Math.tan(15 * Math.PI / 360));
const presentations = new WeakMap();
const alreadyShown = { ready: Promise.resolve(true), dispose() {} };
const unavailable = { ready: Promise.resolve(false), dispose() {} };

function add(parent, tag, id) {
  const node = parent.ownerDocument.createElement(tag);
  if (id) node.id = id;
  parent.append(node);
  return node;
}

function put(node, { x, y, width, height }) {
  Object.assign(node.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
}

function validArea(layer) {
  return Boolean(layer && [layer.x, layer.y, layer.width, layer.height].every(Number.isFinite)
    && layer.width > 0 && layer.height > 0);
}

function layerSource(layer) {
  return validArea(layer) && typeof layer.file === 'string' && /^[a-zA-Z0-9_-]+\.png$/.test(layer.file)
    ? new URL(layer.file, art).href : null;
}

async function prepareLayer(layer) {
  const src = layerSource(layer);
  if (!src) return null;
  const image = new Image();
  image.src = src;
  await image.decode();
  return { ...layer, src };
}

function graphic(parent, layer, id) {
  const node = add(parent, 'img', id);
  node.alt = '';
  node.src = layer.src;
  node.style.pointerEvents = 'none';
  put(node, layer);
  return node;
}

function liveResult(promise, signal) {
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

function wait(ms, signal) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const timer = setTimeout(() => done(true), ms);
    function done(value) {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      resolve(value);
    }
    function stop() { done(false); }
    signal.addEventListener('abort', stop, { once: true });
  });
}

function tween(ms, signal, render) {
  if (signal.aborted) return Promise.resolve(false);
  const start = performance.now();
  return new Promise(resolve => {
    let request;
    function done(value) {
      cancelAnimationFrame(request);
      signal.removeEventListener('abort', stop);
      resolve(value);
    }
    function stop() { done(false); }
    function frame(now) {
      if (signal.aborted) return done(false);
      const ratio = Math.max(0, Math.min(1, (now - start) / ms));
      render(ratio);
      if (ratio >= 1) return done(true);
      request = requestAnimationFrame(frame);
    }
    signal.addEventListener('abort', stop, { once: true });
    request = requestAnimationFrame(frame);
  });
}

async function loadArt(assets, signal) {
  if (assets?.treasure) return assets.treasure;
  const response = await fetch(new URL('index.json', art), { redirect: 'error', signal });
  return response.ok ? (await response.json()).treasure : null;
}

function sameReward(treasure, card) {
  return treasure?.type === 1 && treasure.slotType === 1 && card && treasure.value === card.id
    && treasure.card?.cardId === card.id && [treasure.treasureId, card.id, treasure.card.inventoryId]
      .every(value => Number.isSafeInteger(value) && value > 0);
}

/** Present a confirmed fixed character-card treasure. Acknowledge it locally before Quest Clear. */
export function mountQuestTreasurePanel(view, { treasure, card, assets, signal, onConfirm, onSound }) {
  if (!view || signal?.aborted || !sameReward(treasure, card) || typeof onConfirm !== 'function') return unavailable;
  const inventoryId = treasure.card.inventoryId;
  const state = presentations.get(view) ?? { active: null, acknowledged: new Set() };
  if (state.acknowledged.has(inventoryId)) return alreadyShown;
  if (state.active) return state.active.inventoryId === inventoryId ? state.active.handle : unavailable;
  presentations.set(view, state);

  const controller = new AbortController();
  const visual = controller.signal;
  const dialog = add(view, 'dialog', 'quest-map-treasure');
  dialog.className = 'quest-map-dialog';
  dialog.setAttribute('aria-labelledby', 'quest-map-treasure-title');
  Object.assign(dialog.style, { width: `${width}px`, height: `${height}px`, overflow: 'hidden' });
  Object.assign(dialog.dataset, { state: 'loading', treasureId: String(treasure.treasureId), type: String(treasure.type),
    slotType: String(treasure.slotType), value: String(treasure.value), cardId: String(card.id), cardInventoryId: String(inventoryId) });
  const title = add(dialog, 'h2', 'quest-map-treasure-title');
  title.className = 'sr-only';
  title.tabIndex = -1;
  title.textContent = '獲得寶箱';
  const content = add(dialog, 'div');
  Object.assign(content.style, { position: 'absolute', inset: '0', pointerEvents: 'none',
    perspective: `${focalLength}px`, perspectiveOrigin: `${width / 2}px ${height / 2}px` });
  const face = view.ownerDocument.createElement('canvas');
  face.id = 'quest-map-treasure-card';
  face.dataset.cardId = String(card.id);

  function dispose() {
    if (visual.aborted) return;
    controller.abort();
    signal?.removeEventListener('abort', dispose);
    if (dialog.open) dialog.close();
    dialog.remove();
    if (state.active?.inventoryId === inventoryId) state.active = null;
  }

  signal?.addEventListener('abort', dispose, { once: true });
  dialog.addEventListener('cancel', event => event.preventDefault(), { signal: visual });

  function position() {
    const { left, top } = view.getBoundingClientRect();
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }

  async function show() {
    const source = await liveResult(loadArt(assets, visual), visual);
    if (!source?.motion || !validArea(source.card?.face)) return false;
    const { panel, ok, card: layers, motion } = source;
    const [pivotX, pivotY] = layers.pivot ?? [];
    if (![pivotX, pivotY, motion.slideFromY, motion.flipDegrees, motion.showFaceAtDeg].every(Number.isFinite)
        || ![motion.slideDelayMs, motion.slideDurationMs, motion.holdMs, motion.flipDurationMs].every(ms => Number.isFinite(ms) && ms > 0)
        || !Array.isArray(ok?.hit) || ok.hit.length !== 4 || !ok.hit.every(Number.isFinite)) return false;

    const loaded = await liveResult(Promise.all([
      prepareLayer(panel), prepareLayer(layers.back), prepareLayer(ok.up), prepareLayer(ok.over), prepareLayer(ok.down),
      renderCharacterCard(face, card, { signal: visual }),
    ]), visual);
    if (!loaded || visual.aborted || !loaded[0] || !loaded[1] || !loaded[2] || !loaded[5]) return false;
    const [plate, backArt, up, over, down] = loaded;
    graphic(content, plate, 'quest-map-treasure-plate');

    const button = add(content, 'button', 'quest-map-treasure-ok');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-label', 'OK');
    Object.assign(button.style, { border: '0', padding: '0', background: 'transparent', pointerEvents: 'auto' });
    const [x, y, buttonWidth, buttonHeight] = ok.hit;
    put(button, { x, y, width: buttonWidth, height: buttonHeight });
    const buttons = layer => ({ ...layer, x: layer.x - x, y: layer.y - y });
    const skin = graphic(button, buttons(up));
    for (const [event, layer] of [['pointerenter', over], ['pointerdown', down], ['pointerup', over], ['pointerleave', up],
      ['pointercancel', up]]) {
      button.addEventListener(event, () => {
        const selected = buttons(button.disabled ? up : layer ?? up);
        skin.src = selected.src;
        put(skin, selected);
      }, { signal: visual });
    }
    button.addEventListener('click', () => {
      if (button.disabled || dialog.dataset.state !== 'ready' || visual.aborted) return;
      button.disabled = true;
      state.acknowledged.add(inventoryId);
      dispose();
      onConfirm();
    }, { signal: visual });

    const pivot = add(content, 'div');
    Object.assign(pivot.style, { position: 'absolute', inset: '0', transformOrigin: `${pivotX}px ${pivotY}px` });
    const back = graphic(pivot, backArt, 'quest-map-treasure-back');
    pivot.append(face);
    const reverse = { ...layers.face, x: 2 * pivotX - layers.face.x - layers.face.width };
    put(face, reverse);
    face.style.transform = 'scaleX(-1)';
    face.hidden = true;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    content.style.transform = reduced ? 'none' : `translateY(${motion.slideFromY}px)`;
    dialog.dataset.state = 'entering';
    position();
    dialog.showModal();
    title.focus({ preventScroll: true });
    const window = view.ownerDocument.defaultView;
    window?.addEventListener('resize', position, { signal: visual });
    window?.addEventListener('scroll', position, { signal: visual, passive: true });

    if (!reduced) {
      if (!await wait(motion.slideDelayMs, visual) || !await tween(motion.slideDurationMs, visual, ratio => {
        const y = ratio < 1 ? motion.slideFromY * (1 - Math.sin(Math.PI * ratio / 2)) : 0;
        content.style.transform = `translateY(${y}px)`;
      })) return false;
      content.style.transform = 'none';
      dialog.dataset.state = 'holding';
      if (!await wait(motion.holdMs, visual)) return false;
    }
    if (visual.aborted) return false;
    dialog.dataset.state = 'flipping';
    try { void Promise.resolve(onSound?.('flip')).catch(() => {}); } catch { /* A sound failure doesn't delay the displayed receipt. */ }
    if (!reduced && !await tween(motion.flipDurationMs, visual, ratio => {
      const angle = motion.flipDegrees * (ratio === 1 ? 1 : 1 - 2 ** (-10 * ratio));
      pivot.style.transform = `rotateY(${angle}deg)`;
      face.hidden = angle < motion.showFaceAtDeg;
      back.hidden = !face.hidden;
    })) return false;
    if (visual.aborted) return false;

    pivot.style.transform = face.style.transform = 'none';
    put(face, layers.face);
    back.hidden = true;
    face.hidden = false;
    dialog.dataset.state = 'ready';
    button.disabled = false;
    button.style.cursor = 'pointer';
    if (over && button.matches(':hover')) {
      const selected = buttons(over);
      skin.src = selected.src;
      put(skin, selected);
    }
    button.focus({ preventScroll: true });
    return true;
  }

  const handle = { dispose, ready: show().catch(() => false).then(ready => {
    if (!ready) dispose();
    return ready;
  }) };
  state.active = { inventoryId, handle };
  return handle;
}
