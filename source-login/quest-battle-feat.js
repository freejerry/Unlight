const art = new URL('./quest-feat-art/', import.meta.url);
let catalog;
const loaded = new Map();
const decodedFrames = new Map();

function loadCatalog() {
  catalog ??= fetch(new URL('index.json', art), {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  }).then(response => {
    if (!response.ok) throw new Error('Original feat artwork unavailable.');
    return response.json();
  }).catch(error => {
    catalog = undefined;
    throw error;
  });
  return catalog;
}

function loadClip(id) {
  if (!loaded.has(id)) loaded.set(id, loadCatalog().then(async source => {
    const clip = source.feats?.[id];
    if (!clip?.frames?.some(Boolean) || !(clip.framesPerSecond > 0)) return null;
    const files = [...new Set(clip.frames.filter(Boolean).map(frame => frame.file))];
    const drawings = await Promise.all(files.map(async file => {
      if (!decodedFrames.has(file)) {
        const image = new Image();
        image.src = new URL(file, art);
        decodedFrames.set(file, image.decode().then(() => image).catch(error => {
          decodedFrames.delete(file);
          throw error;
        }));
      }
      return [file, await decodedFrames.get(file)];
    }));
    return { ...clip, mirror: source.otherMirrorX ?? 760, images: new Map(drawings) };
  }).catch(() => {
    loaded.delete(id);
    return null;
  }));
  return loaded.get(id);
}

/** Play only scene-confirmed feat receipts. The queue waits for insertion, as FeatScene does. */
export function createQuestFeatPlayback(battle, { signal, isCurrent, onSound, wait }) {
  const active = new Map();
  const observed = new Map();
  let insertion = Promise.resolve();
  let preloadedThrough = 0;
  const live = () => !signal.aborted && isCurrent();
  signal.addEventListener('abort', () => {
    for (const node of active.values()) node.remove();
    active.clear();
  }, { once: true });

  function prepare(id) {
    let stopWaiting;
    return Promise.race([
      loadClip(id),
      new Promise(resolve => {
        const finish = () => resolve(null);
        const timer = setTimeout(finish, 5000);
        signal.addEventListener('abort', finish, { once: true });
        stopWaiting = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', finish);
        };
      }),
    ]).finally(stopWaiting);
  }

  function mount(event, clip) {
    if (!clip || !live()) return;
    const node = document.createElement('div');
    node.className = 'quest-battle-layer quest-battle-feat';
    node.style.zIndex = '33';
    node.dataset.activatedSkillId = String(event.featId);
    node.dataset.featSequence = String(event.sequence);
    node.dataset.side = event.player ? 'player' : 'opponent';
    node.setAttribute('aria-hidden', 'true');
    const picture = new Image();
    picture.alt = '';
    node.append(picture);
    active.get(event.featId)?.remove();
    active.set(event.featId, node);
    battle.append(node);
    const setFrame = frame => {
      picture.hidden = !frame;
      if (!frame) return;
      picture.src = clip.images.get(frame.file).src;
      Object.assign(picture.style, {
        left: `${event.player ? frame.x : clip.mirror - frame.x - frame.width}px`,
        top: `${frame.y}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
        transform: event.player ? '' : 'scaleX(-1)',
      });
    };
    const play = async () => {
      const { frames, framesPerSecond } = clip;
      const frameMs = 1000 / framesPerSecond;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setFrame(frames[Math.floor(frames.length / 2)] ?? frames.find(Boolean));
        await wait(frameMs * frames.length, signal);
        return;
      }
      const startedAt = performance.now();
      for (let index = 0; index < frames.length; index += 1) {
        if (!live() || active.get(event.featId) !== node) return;
        setFrame(frames[index]);
        await wait(frameMs * (index + 1) - (performance.now() - startedAt), signal);
      }
    };
    void play().finally(() => {
      if (active.get(event.featId) === node) active.delete(event.featId);
      node.remove();
    });
    onSound?.('feat');
  }

  function preload(events) {
    if (!live()) return;
    for (const { featId, sequence } of events ?? []) {
      if (sequence <= preloadedThrough) continue;
      preloadedThrough = sequence;
      void loadClip(featId);
    }
  }

  function play(events, turn, exchangeKey) {
    if (!live()) return Promise.resolve();
    const pending = (events ?? []).filter(event => event.turn === turn && event.exchangeKey === exchangeKey)
      .sort((left, right) => left.sequence - right.sequence);
    for (const event of pending) {
      if (observed.has(event.sequence)) continue;
      const prepared = prepare(event.featId);
      insertion = insertion.then(async () => mount(event, await prepared)).catch(() => undefined);
      observed.set(event.sequence, insertion);
    }
    return Promise.all(pending.map(event => observed.get(event.sequence)));
  }
  return { preload, play };
}
