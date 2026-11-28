import { battleStands } from './battle-card.js';

const hitArt = new URL('./quest-hit-art/', import.meta.url);
const standArt = new URL('./battle-card-art/', import.meta.url);
const stageWidth = 780;
const stageHeight = 680;
const standY = 416;
const standX = { player: [288, 184, 80, 184], opponent: [472, 576, 680, 576] };
const images = new Map();
const shakes = new WeakMap();
const poses = new WeakSet();
let artwork;

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function imageFor(root, file) {
  if (typeof file !== 'string' || !/^[a-zA-Z0-9_-]+\.png$/.test(file)) return Promise.resolve(null);
  const url = new URL(file, root).href;
  if (!images.has(url)) {
    const image = new Image();
    image.src = url;
    images.set(url, image.decode().then(() => image).catch(() => {
      images.delete(url);
      return null;
    }));
  }
  return images.get(url);
}

async function loadTrack(track) {
  if (!track?.frames?.length || !Number.isFinite(track.framesPerSecond) || track.framesPerSecond <= 0) return null;
  const frames = await Promise.all(track.frames.map(async frame => {
    if (!frame || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)) return null;
    if (frame.width <= 0 || frame.height <= 0) return null;
    const image = await imageFor(hitArt, frame.file);
    return image ? { ...frame, image } : null;
  }));
  if (!frames.some(Boolean)) return null;
  return { ...track, frames };
}

function loadHitArt() {
  artwork ??= fetch(new URL('index.json', hitArt), { redirect: 'error' }).then(response => {
    if (!response.ok) throw new Error('Original quest impact art unavailable');
    return response.json();
  }).then(async ({ effects }) => Object.fromEntries(await Promise.all(
    ['slash', 'bullet', 'bulletOver', 'blood'].map(async key => [key, await loadTrack(effects?.[key])]),
  ))).catch(() => {
    artwork = undefined;
    return null;
  });
  return artwork;
}

function runFrames(duration, signal, update) {
  if (signal?.aborted) return Promise.resolve(false);
  const start = performance.now();
  return new Promise(resolve => {
    let frame;
    function finish(result) {
      cancelAnimationFrame(frame);
      signal?.removeEventListener('abort', cancel);
      resolve(result);
    }
    function cancel() {
      finish(false);
    }
    function tick(now) {
      if (signal?.aborted) return finish(false);
      const time = Math.max(0, Math.min(duration, now - start));
      try {
        if (update(time) === false || time >= duration) return finish(true);
      } catch {
        return finish(false);
      }
      if (signal?.aborted) return finish(false);
      frame = requestAnimationFrame(tick);
    }
    signal?.addEventListener('abort', cancel, { once: true });
    frame = requestAnimationFrame(tick);
  });
}

function waitForPose(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve(null);
  return new Promise(resolve => {
    function finish(value) {
      signal.removeEventListener('abort', cancel);
      resolve(value);
    }
    function cancel() {
      finish(null);
    }
    signal.addEventListener('abort', cancel, { once: true });
    void promise.then(finish, cancel);
  });
}

function sineIn(time) {
  return 1 - Math.cos(Math.PI * time / 2);
}

function shakeAt(time) {
  if (time <= 200 || time >= 320) return 0;
  const interval = (time - 200) / 40;
  const step = Math.floor(interval);
  const stops = [0, 5, -1, 0];
  return stops[step] + (stops[step + 1] - stops[step]) * sineIn(interval - step);
}

function effectPlacement() {
  return { x: Math.random() * 30, y: Math.random() * 50, angle: Math.random() * Math.PI * 2, scale: 1 };
}

function bloodPlacement(power) {
  const scale = Math.random() * .7 + .1 * power;
  const range = 2 / scale + .7 / scale + .7;
  return { x: (Math.random() - .5) * Math.trunc(60 * range), y: (Math.random() - .5) * Math.trunc(50 * range),
    angle: Math.random() * Math.PI * 2, scale };
}

function paint(context, track, elapsed) {
  if (!track || elapsed < 0) return false;
  const index = Math.floor(elapsed * track.framesPerSecond / 1000);
  const frame = track.frames[track.holdLast ? Math.min(index, track.frames.length - 1) : index];
  if (!frame) return false;
  context.drawImage(frame.image, frame.x, frame.y, frame.width, frame.height);
  return true;
}

function transform(context, placement, anchorX = 0, anchorY = 0) {
  context.translate(anchorX + placement.x, anchorY + placement.y);
  context.rotate(placement.angle);
  context.scale(placement.scale, placement.scale);
}

function nearFade(time) {
  return time <= 2000 ? 1 : Math.cos((time - 2000) * Math.PI / 1000);
}

function farFade(time) {
  return time <= 500 ? 1 : 1 - Math.sin((time - 500) * Math.PI / 1000);
}

/** Start the authored target effect for a genuine positive Quest SC73 hit. */
export async function playQuestHitEffect({ hit, distance, battle, signal }) {
  if (signal?.aborted || reducedMotion() || typeof hit?.player !== 'boolean'
      || !Number.isSafeInteger(hit.damage) || hit.damage <= 0 || !Number.isInteger(distance)) return false;
  const side = hit.player ? 'player' : 'opponent';
  const x = standX[side][distance - 1];
  const bounds = battle?.querySelector('.quest-battle-standees');
  if (x === undefined || !bounds) return false;
  const targets = Array.from(bounds.children).filter(node => node.tagName === 'IMG' && node.dataset.side === side);
  const canvas = bounds.ownerDocument.createElement('canvas');
  canvas.className = 'quest-battle-hit-effect';
  canvas.dataset.side = side;
  canvas.dataset.effect = distance === 1 ? 'slash' : 'bullet';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = stageWidth;
  canvas.height = stageHeight;
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
  const context = canvas.getContext('2d');
  if (context) bounds.insertBefore(canvas, targets.at(-1)?.nextSibling ?? null);

  const token = {};
  for (const node of targets) shakes.set(node, { token, translate: shakes.get(node)?.translate ?? node.style.translate });
  const impact = effectPlacement();
  const close = distance === 1;
  const over = close ? null : effectPlacement();
  const power = Math.min(hit.damage, 15);
  const blood = Array.from({ length: power + 2 }, () => bloodPlacement(power));
  let tracks;
  let artSettled = !context;
  let painted = false;
  if (context) void loadHitArt().then(value => {
    if (value?.blood || (close ? value?.slash : value?.bullet || value?.bulletOver)) tracks = value;
    artSettled = true;
  });

  try {
    const completed = await runFrames(2500, signal, time => {
      const shake = shakeAt(time);
      for (const node of targets) {
        const state = shakes.get(node);
        if (state?.token !== token) continue;
        node.style.translate = shake ? `${shake}px 0` : state.translate;
      }
      if (!tracks) return !artSettled || time < 320;
      context.clearRect(0, 0, stageWidth, stageHeight);
      if (close || time < 1000) {
        context.save();
        context.globalAlpha = close ? nearFade(time) : farFade(time);
        transform(context, impact, x + shake, standY - 100);
        painted = paint(context, close ? tracks.slash : tracks.bullet, time) || painted;
        if (over) {
          transform(context, over);
          painted = paint(context, tracks.bulletOver, time) || painted;
        }
        context.restore();
      }
      if (time >= 500) {
        for (const spot of blood) {
          context.save();
          context.globalAlpha = nearFade(time);
          transform(context, spot, x + shake, standY - 200);
          painted = paint(context, tracks.blood, time - 500) || painted;
          context.restore();
        }
      }
      return true;
    });
    return completed && (painted || targets.length > 0);
  } finally {
    for (const node of targets) {
      const state = shakes.get(node);
      if (state?.token !== token) continue;
      node.style.translate = state.translate;
      shakes.delete(node);
    }
    canvas.remove();
  }
}

/** The original attacker opens the held frame of its up clip during a real SC56 roll. */
export async function playQuestAttackPose({ battle, playerAttacks, signal }) {
  if (signal?.aborted || !battle || typeof playerAttacks !== 'boolean') return false;
  const side = playerAttacks ? 'player' : 'opponent';
  const actor = battle.querySelector(`.quest-battle-standees > .quest-battle-stand[data-side="${side}"]`);
  if (!actor?.dataset.cardId || poses.has(actor)) return false;
  poses.add(actor);
  void loadHitArt();
  let node;
  try {
    const art = (await waitForPose(battleStands(signal), signal))?.[actor.dataset.cardId]?.opening;
    const frame = art?.frames?.[art.settledFrame - 1];
    if (!frame || signal?.aborted) return false;
    const picture = await waitForPose(imageFor(standArt, art.file), signal);
    if (!picture || signal?.aborted || !actor.parentElement) return false;
    const [sx, sy, dx, dy] = frame;
    const [cx, cy] = art.origin;
    const sign = playerAttacks ? 1 : -1;
    const width = art.width * sx;
    const left = cx + sign * (dx + art.x * sx) - (playerAttacks ? 0 : width);
    node = actor.ownerDocument.createElement('img');
    node.className = 'quest-battle-attack-pose';
    node.dataset.side = side;
    node.dataset.cardId = actor.dataset.cardId;
    node.alt = '';
    node.setAttribute('aria-hidden', 'true');
    node.src = picture.src;
    Object.assign(node.style, { position: 'absolute', left: `${left}px`, top: `${cy + dy + art.y * sy}px`,
      width: `${width}px`, height: `${art.height * sy}px`, pointerEvents: 'none',
      transform: `scaleX(${sign})` });
    const motionless = reducedMotion();
    if (!motionless) node.style.translate = `${-sign * 300}px 0`;
    actor.parentElement.insertBefore(node, actor.nextSibling);
    // StandCharaImage calls twOut and removes this same MovieClip in the next queue closure.
    return await runFrames(4500, signal, time => {
      if (!motionless) {
        const slide = time < 300 ? -sign * 300 * (1 - sineIn(time / 300)) : 0;
        node.style.translate = `${slide}px 0`;
      }
      return true;
    });
  } finally {
    node?.remove();
    poses.delete(actor);
  }
}
