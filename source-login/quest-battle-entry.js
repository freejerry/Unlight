const art = new URL('./quest-art/', import.meta.url);
const decodedStages = new WeakMap();

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

export async function mountQuestBattleEntry(view, board, { encounter, layers, timing, signal, isCurrent, onEncounter }) {
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
  for (const { file, x, y, width, height } of layers) {
    const image = new Image(width, height);
    image.src = new URL(file, art);
    image.alt = '';
    image.style.left = `${x}px`;
    image.style.top = `${y}px`;
    battle.append(image);
  }
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
}
