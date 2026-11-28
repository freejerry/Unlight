import { renderCharacterCard } from './character-card.js';

const art = new URL('./quest-art/', import.meta.url);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function place(node, x, y, width, height) {
  Object.assign(node.style, {
    position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`,
  });
}

function placeArt(image, source, originX = 0, originY = 0) {
  image.src = new URL(source.file, art);
  place(image, source.x - originX, source.y - originY, source.width, source.height);
}

function image(parent, source) {
  const node = new Image();
  node.alt = '';
  placeArt(node, source);
  parent.append(node);
  return node;
}

function button(parent, id, label, source, action, signal) {
  if (!source?.up || !source.hit) return null;
  const [x, y, width, height] = source.hit;
  const node = document.createElement('button');
  node.type = 'button';
  node.id = `quest-battle-change-${id}`;
  node.dataset.characterChangeAction = id;
  node.setAttribute('aria-label', label);
  node.style.pointerEvents = 'auto';
  place(node, x, y, width, height);
  for (const pose of ['up', 'over', 'down']) {
    if (!source[pose]) continue;
    const skin = new Image();
    skin.alt = '';
    skin.className = `quest-battle-control-art quest-battle-art-${pose}`;
    placeArt(skin, source[pose], x, y);
    node.append(skin);
  }
  node.addEventListener('click', action, { signal });
  parent.append(node);
  return node;
}

function showThinker(parent, source, side, distance) {
  if (!source?.frames?.length) return;
  const x = (side === 'player' ? source.position.playerX : source.position.foeX)[distance - 1];
  if (!Number.isFinite(x)) return;
  const { frames, loopFrom, framesPerSecond } = source;
  const node = new Image();
  node.alt = '';
  node.dataset.characterChangeThinker = side;
  parent.append(node);
  function draw(ref) {
    node.hidden = !ref;
    if (ref) placeArt(node, { ...ref, x: x + ref.x, y: source.position.y + ref.y });
  }
  draw(reduced() ? frames[loopFrom] ?? frames.find(Boolean) : frames[0]);
  if (reduced()) return { node, stop() {} };
  const started = performance.now();
  let frame;
  let previous;
  function paint(now) {
    const elapsed = Math.floor((now - started) * framesPerSecond / 1000);
    const selected = elapsed < loopFrom ? elapsed : loopFrom + (elapsed - loopFrom) % (frames.length - loopFrom);
    if (selected !== previous) {
      previous = selected;
      draw(frames[selected]);
    }
    frame = requestAnimationFrame(paint);
  }
  frame = requestAnimationFrame(paint);
  return { node, stop() { cancelAnimationFrame(frame); } };
}

/** Original voluntary chooser, once Move has settled and SC49 has made the selection available. */
export function createQuestBattleChange(battle, {
  scene, encounterKey, signal, isCurrent, assets, definitions, animate, startTimer, status,
}) {
  const artSet = assets.characterChange;
  let snapshot;
  let current;
  let closing;
  let settled = Promise.resolve();
  let disposed = false;
  const live = () => !disposed && !signal.aborted && isCurrent();

  function choiceFor(view, index) {
    const change = snapshot?.characterChange;
    if (!live() || view !== current || snapshot.phase !== 'character-change' || change?.kind !== 'movement' ||
        change.turn !== view.turn || change.playerDone || change.closed || change.canSelect !== true ||
        snapshot.operation || view.request || typeof scene.chooseCharacter !== 'function') return;
    const card = snapshot.roster?.player?.cards?.find(row => row.index === index);
    return change.choices?.find(row => row.index === index && row.cardId === card?.cardId);
  }

  function paint(view) {
    for (const { node, index, cardId } of view.controls) {
      const choice = choiceFor(view, index);
      node.disabled = !choice || choice.cardId !== cardId;
      node.setAttribute('aria-disabled', String(node.disabled));
    }
    view.root.dataset.state = view.request || Number.isInteger(snapshot.characterChange?.requestedIndex)
      ? 'submitting' : 'open';
  }

  async function choose(view, index, cardId) {
    const choice = choiceFor(view, index);
    if (!choice || choice.cardId !== cardId) return;
    view.request = choice;
    paint(view);
    if (status) status.value = '正在等待角色更換確認。';
    try {
      await scene.chooseCharacter(index, { encounterKey, moveTurn: view.turn, signal });
    } catch (error) {
      if (!live() || view !== current || !status) return;
      status.value = error?.kind === 'quest-battle-uncertain' ? '無法確認角色更換。' : '無法選擇這名角色。';
    } finally {
      if (live() && view === current) {
        snapshot = scene.snapshot?.adventure?.battle ?? snapshot;
        view.request = undefined;
        paint(view);
      }
    }
  }

  function open(change) {
    const player = snapshot.roster?.player;
    const activeCard = player?.cards?.find(row => row.index === player.activeIndex);
    const root = document.createElement('section');
    root.id = 'quest-battle-character-change';
    root.className = 'quest-battle-layer';
    root.style.zIndex = '30'; // DuelCharaCards depth.
    root.dataset.turn = String(change.turn);
    root.setAttribute('aria-label', '更換角色');
    const panel = document.createElement('div');
    panel.className = 'quest-battle-layer';
    root.append(panel);
    const thinkerLayer = document.createElement('div');
    thinkerLayer.className = 'quest-battle-layer';
    thinkerLayer.style.zIndex = '2'; // The think sprite belongs to StandChara, behind the selector.
    const view = { root, panel, thinkerLayer, turn: change.turn, controls: [], previews: [], thinkers: [] };
    current = view;
    const startedFromKeyboard = document.activeElement === status || document.activeElement?.matches(':focus-visible');
    if (!change.playerDone && activeCard) {
      image(panel, artSet.panel);
      if (assets.done?.plate) image(panel, assets.done.plate);
      const stay = () => choose(view, activeCard.index, activeCard.cardId);
      for (const [id, label, source] of [['close', '保留出戰角色', artSet.close], ['done', '完成並保留出戰角色', assets.done]]) {
        const node = button(panel, id, label, source, stay, signal);
        if (node) view.controls.push({ node, index: activeCard.index, cardId: activeCard.cardId });
      }
      const reserves = player.cards.filter(row => row.index !== player.activeIndex);
      reserves.forEach((row, index) => {
        const definition = definitions.get(row.cardId);
        const x = 200 + index * 192;
        const y = 144;
        const fromX = 168 * (index + 1);
        const canvas = document.createElement('canvas');
        canvas.dataset.characterChangeCard = '';
        canvas.dataset.slot = String(row.index);
        canvas.dataset.cardId = String(row.cardId);
        canvas.hidden = true;
        if (row.alive === false) canvas.style.filter = 'brightness(.5)';
        if (definition?.name) canvas.setAttribute('aria-label', definition.name);
        place(canvas, x, y, 168, 240);
        root.append(canvas);
        view.previews.push({ row, canvas, x, y, fromX });
        const damage = Number.isInteger(row.hp) && definition?.hp ? Math.max(0, definition.hp - row.hp) : row.seedDamage ?? 0;
        void renderCharacterCard(canvas, definition, { signal, damage }).then(painted => {
          if (painted && live() && current === view) canvas.hidden = false;
        });
        const side = index === 0 ? 'left' : 'right';
        const node = button(panel, side, definition?.name ? `更換為${definition.name}` : '更換角色',
          artSet[side], () => choose(view, row.index, row.cardId), signal);
        if (node) {
          node.dataset.slot = String(row.index);
          node.dataset.cardId = String(row.cardId);
          view.controls.push({ node, index: row.index, cardId: row.cardId });
        }
      });
    }
    const distance = snapshot.result?.distance ?? Number(battle.dataset.distance);
    for (const [side, done] of [['player', change.playerDone], ['opponent', change.opponentDone]]) {
      if (!done) {
        const thinker = showThinker(thinkerLayer, artSet.think, side, distance);
        if (thinker) {
          view.thinkers.push(thinker);
          void animate(thinker.node, [{ opacity: 0 }, { opacity: 1 }], artSet.think.fadeInMs ?? 500,
            signal, 0, 'cubic-bezier(.12, 0, .39, 0)');
        }
      }
    }
    if (view.thinkers.length) battle.append(thinkerLayer);
    battle.append(root);
    if (status) status.value = change.playerDone ? '等待對手更換角色。' : '選擇出戰角色。';
    paint(view);
    if (startedFromKeyboard) (view.controls.find(({ node }) => !node.disabled && node.dataset.slot)
      ?? view.controls.find(({ node }) => !node.disabled))?.node.focus({ preventScroll: true });
    const duration = artSet.animation?.openMs ?? 500;
    void animate(panel, [{ opacity: 0 }, { opacity: 1 }], duration, signal);
    for (const { canvas, x, y, fromX } of view.previews) {
      void animate(canvas, [{ transform: `translate(${fromX - x}px, ${680 - y}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 }], duration, signal);
    }
    view.stopTimer = startTimer?.(!change.playerDone && activeCard
      ? () => choose(view, activeCard.index, activeCard.cardId) : undefined);
  }

  function close() {
    const view = current;
    if (!view) return;
    current = undefined;
    closing = view;
    view.root.dataset.state = 'closing';
    for (const { node } of view.controls) {
      node.disabled = true;
      node.setAttribute('aria-disabled', 'true');
    }
    view.stopTimer?.();
    const change = snapshot.characterChange ?? snapshot.lastCharacterChange;
    const applied = change?.turn === view.turn ? (change.applied?.player ?? change.player) : null;
    const duration = artSet.animation?.closeMs ?? 500;
    const tweens = [animate(view.panel, [{ opacity: 1 }, { opacity: 0 }], duration, signal)];
    for (const { canvas, row, x, y, fromX } of view.previews) {
      const selected = applied?.index === row.index && applied.cardId === row.cardId;
      const dx = (selected ? 0 : fromX) - x;
      const dy = (selected ? 440 : 680) - y;
      tweens.push(animate(canvas, [{ transform: 'none', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px)`, opacity: selected ? 1 : 0 }], duration, signal));
    }
    for (const { node, stop } of view.thinkers) {
      stop();
      tweens.push(animate(node, [{ opacity: 1 }, { opacity: 0 }], artSet.think.fadeOutMs ?? duration, signal));
    }
    settled = Promise.all(tweens).then(() => {
      view.root.remove();
      view.thinkerLayer.remove();
      if (closing === view) closing = undefined;
    });
  }

  function dispose() {
    disposed = true;
    current?.stopTimer?.();
    for (const thinker of current?.thinkers ?? []) thinker.stop();
    current?.root.remove();
    current?.thinkerLayer.remove();
    closing?.root.remove();
    closing?.thinkerLayer.remove();
    current = undefined;
    closing = undefined;
  }
  signal.addEventListener('abort', dispose, { once: true });
  return {
    update(next, { presentable = true } = {}) {
      if (!live() || !artSet?.panel || !next) return;
      snapshot = next;
      const change = snapshot.characterChange;
      if (!presentable || snapshot.phase !== 'character-change' || change?.kind !== 'movement' || change.closed) {
        close();
      } else if (current) {
        paint(current);
      } else if (!closing) open(change);
    },
    settled() { return settled; },
    dispose,
  };
}
