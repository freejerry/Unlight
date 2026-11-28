import { renderCharacterCard } from './character-card.js';
import { playQuestBonusDiceRoll } from './quest-dice-roll.js';

const art = new URL('./quest-result-art/', import.meta.url);
const resultSpeed = 5; // ResultScene.as truncates Unlight.SPEED + 4 to an int.
const sineOut = 'linear(0,.1951,.3827,.5556,.7071,.8315,.9239,.9808,1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const names = { next: 'Next', get: 'Get', high: 'High', low: 'Low', exit: 'Exit', item: 'Item' };
const areas = {
  next: [272, 149, 80, 80], get: [408, 149, 80, 80], high: [340, 80, 80, 80], low: [340, 218, 80, 80],
  exit: [408, 149, 80, 80], item: [272, 149, 80, 80],
};
const kinds = ['EXP', 'Gem', '道具', '角色卡', '角色卡', '稀有角色卡', '事件卡', '裝備卡'];
const character = new Set([3, 4, 5]);
const equalCard = (a, b) => a === b || !!(a && b && a.genre === b.genre && a.id === b.id && a.amount === b.amount);

function append(parent, tag, id) {
  const node = parent.ownerDocument.createElement(tag);
  if (id) node.id = `quest-battle-bonus-${id}`;
  parent.append(node);
  return node;
}

function place(node, x, y, width, height) {
  Object.assign(node.style, { position: 'absolute', left: `${x}px`, top: `${y}px` });
  if (width !== undefined) node.style.width = `${width}px`;
  if (height !== undefined) node.style.height = `${height}px`;
}

function image(node, layer, dx = 0, dy = 0) {
  const valid = /^[\w-]+\.png$/.test(layer?.file ?? '') &&
    [layer.x, layer.y, layer.width, layer.height].every(Number.isFinite);
  node.hidden = !valid;
  if (valid) {
    const src = new URL(layer.file, art).href;
    if (node.src !== src) node.src = src;
    place(node, layer.x + dx, layer.y + dy, layer.width, layer.height);
  }
  return valid;
}

function draw(parent, layer, id) {
  const node = append(parent, 'img', id);
  node.alt = '';
  image(node, layer);
  return node;
}

function pause(ms, signal) {
  if (reduced() || signal.aborted || ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

async function motion(node, frames, duration, signal) {
  if (reduced() || signal.aborted) return;
  const animation = node.animate(frames, { duration, easing: sineOut });
  const cancel = () => animation.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try { await animation.finished; } catch { /* The enclosing battle can be left mid-animation. */ }
  finally { signal.removeEventListener('abort', cancel); }
}

async function playTrack(node, frames, fps, signal, stop = frames?.length) {
  if (!(fps > 0) || !(stop > 0) || !frames?.length || signal.aborted) return;
  const start = performance.now();
  const last = Math.min(stop, frames.length) - 1;
  for (let i = reduced() ? last : 0; i <= last; i += 1) {
    await pause(i * 1000 / fps - (performance.now() - start), signal);
    if (signal.aborted) return;
    image(node, frames[i]);
  }
}

function createButton(parent, key, source, select, signal, label = names[key]) {
  const node = append(parent, 'button', key);
  const [x, y, width, height] = source?.hit ?? areas[key];
  node.type = 'button';
  node.hidden = true;
  node.disabled = true;
  node.dataset.action = key;
  node.setAttribute('aria-label', label);
  place(node, x, y, width, height);
  if (source?.up) {
    const states = ['up', 'over', 'down'];
    for (const state of states) {
      const skin = draw(node, null);
      skin.dataset.skin = state;
      image(skin, source[state] ?? source.up, -x, -y);
    }
  } else {
    node.classList.add('quest-battle-bonus-fallback-button');
    node.textContent = label;
  }
  node.addEventListener('click', () => select(key), { signal });
  return node;
}

function cardName(card) {
  if (card.genre < 2) return `${card.genre === 0 ? 'EXP' : 'GEM'} x ${card.amount}%`;
  return `${kinds[card.genre] ?? '獎勵'} #${card.id}`;
}

function createCard(parent, source, assets, loadCards, signal) {
  const node = append(parent, 'div');
  node.className = 'quest-battle-bonus-card';
  node.setAttribute('role', 'img');
  Object.assign(node.dataset, { genre: String(source.genre), id: String(source.id), amount: String(source.amount) });
  const face = append(node, 'div');
  face.className = 'quest-battle-bonus-card-face';
  const skin = source.genre < 2 ? (source.genre === 0 ? assets.cards.exp : assets.cards.gem) :
    source.genre === 2 ? assets.items?.[source.id] : null;
  if (skin) draw(face, skin.frame);
  const caption = append(face, 'span');
  caption.className = 'quest-battle-bonus-card-caption';
  if (skin) draw(face, skin.icon);
  const quantity = append(parent, 'span');
  quantity.className = 'quest-battle-bonus-quantity';
  quantity.textContent = source.genre > 1 ? `x${source.amount}` : '';
  let name = cardName(source);
  function setName(text) {
    name = text;
    node.setAttribute('aria-label', source.genre > 1 ? `${name} x${source.amount}` : name);
  }
  setName(name);
  caption.textContent = source.genre < 2 ? name : skin?.caption?.text ?? name;
  if (source.genre < 2) {
    const title = append(face, 'span');
    title.className = 'quest-battle-bonus-card-title';
    title.textContent = source.genre === 0 ? '獲得EXP增加' : '獲得GEM增加';
    place(title, 0, 5, 164, 100);
    place(caption, source.genre === 0 ? -62 : -56, 185, 200, 100);
  } else if (skin?.title?.text) {
    const title = append(face, 'span');
    title.className = 'quest-battle-bonus-card-title';
    title.textContent = skin.title.text;
    place(title, skin.title.x, skin.title.y, skin.title.width, skin.title.height);
    if (skin.caption) {
      caption.classList.add('quest-battle-bonus-item-caption');
      place(caption, skin.caption.x, skin.caption.y, skin.caption.width, skin.caption.height);
    }
    setName(skin.title.text);
  }
  if (character.has(source.genre) && source.id > 0) {
    const canvas = append(face, 'canvas');
    canvas.hidden = true;
    place(canvas, 0, 0, 168, 240);
    void loadCards?.([source.id]).then(async known => {
      const card = known.get(source.id);
      if (!card || signal.aborted) return;
      setName(card.name ?? name);
      caption.textContent = card.name ?? name;
      if (await renderCharacterCard(canvas, card, { signal }) && !signal.aborted) {
        canvas.hidden = false;
        caption.hidden = true;
      }
    }).catch(() => {});
  }
  return { node, quantity, source };
}

function cardPosition(zone, index, size) {
  switch (zone) {
    case 'current': return [296, 335, 1, 296, 293];
    case 'claimed': return [296, 190, 1, 315, 408];
    case 'next': return [480 + index * 86, 455, .5, 393 + index * 86, 432];
    default: {
      const distance = (size - 1 - index) * 86;
      return [195 - distance, 455, .5, 107 - distance, 432];
    }
  }
}

function positionCard(card, zone, index, size, signal, duration = 0, incoming = false) {
  const [x, y, scale, labelX, labelY] = cardPosition(zone, index, size);
  const { node, quantity, pose } = card;
  const transform = (a, b, s = 1) => `translate(${a}px,${b}px) scale(${s})`;
  const target = transform(x, y, scale);
  const labelTarget = transform(labelX, labelY);
  node.style.transform = target;
  quantity.style.transform = labelTarget;
  node.dataset.zone = zone;
  node.dataset.index = String(index);
  card.pose = [x, y, scale, labelX, labelY];
  if (!duration) return Promise.resolve();
  const before = pose ?? (incoming ? [x + 1024, y, scale, labelX + 1024, labelY] : card.pose);
  return Promise.all([
    motion(node, [{ transform: transform(...before.slice(0, 3)), opacity: pose || incoming ? 1 : 0 }, { transform: target, opacity: 1 }], duration, signal),
    motion(quantity, [{ transform: transform(...before.slice(3)), opacity: pose || incoming ? 1 : 0 }, { transform: labelTarget, opacity: 1 }], duration, signal),
  ]);
}

function mountRewardItems(board, source, { launcher, onUse, onSound, signal }) {
  if (!source) return null;
  const panel = append(board, 'section', 'item-panel');
  panel.hidden = true;
  panel.dataset.state = 'closed';
  panel.setAttribute('aria-label', '道具');
  launcher.setAttribute('aria-controls', panel.id);
  launcher.setAttribute('aria-expanded', 'false');
  const [x, y] = source.origin;
  const { durationMs, initialX, hiddenX } = source.motion;
  const { maxRows, step, x: listX, y: listY } = source.list;
  place(panel, x, y, source.plate.width, source.plate.height);
  draw(panel, source.plate);
  const rows = append(panel, 'div', 'item-list');
  rows.setAttribute('role', 'group');
  rows.setAttribute('aria-label', '持有道具');
  const details = {};
  for (const key of ['name', 'count', 'duration', 'caption', 'page']) {
    const text = append(panel, 'span', `item-${key === 'duration' ? 'time' : key}`);
    place(text, ...source.labels[key]);
    details[key] = text;
  }
  const detailIcon = draw(panel, null, 'item-icon');
  const closeButton = createButton(panel, 'item-close', source.controls.close, () => {
    onSound?.('confirm');
    void setOpen(false);
  }, signal, 'Close');
  const useButton = createButton(panel, 'item-use', source.controls.use, () => {
    if (selected && !useButton.disabled) onUse(groups.get(selected).first);
  }, signal, 'Use');
  const backButton = createButton(panel, 'item-page-back', source.controls.back, () => changePage(-1), signal, '上一頁');
  const nextButton = createButton(panel, 'item-page-next', source.controls.next, () => changePage(1), signal, '下一頁');
  let open = false;
  let openedBefore = false;
  let motionRevision = 0;
  let locked = false;
  let canUse = false;
  let page = 0;
  let selected;
  let groups = new Map();
  let currentRows = new Map();
  let itemSignature;

  function drawIcon(node, id, anchor) {
    const art = source.items[id]?.icon;
    if (!art) return image(node, null);
    const { x, y, scale } = anchor;
    return image(node, { ...art, x: x + art.x * scale, y: y + art.y * scale, width: art.width * scale, height: art.height * scale });
  }

  function refreshSelection() {
    const group = groups.get(selected);
    const definition = source.items[selected];
    for (const [id, tile] of currentRows) {
      tile.disabled = locked;
      tile.setAttribute('aria-pressed', String(id === selected));
    }
    panel.dataset.state = open ? locked ? 'using' : 'open' : 'closed';
    panel.dataset.selectedItemId = group ? String(selected) : '';
    details.name.textContent = group ? definition.name : '';
    details.count.textContent = group ? String(group.count) : '';
    details.duration.textContent = group ? '-' : '';
    details.caption.textContent = group ? definition.caption : '';
    drawIcon(detailIcon, selected, source.iconAnchors.detail);
    closeButton.hidden = false;
    closeButton.disabled = locked;
    useButton.hidden = !group;
    useButton.disabled = !open || locked || !canUse || !group?.first.usable;
    backButton.disabled = nextButton.disabled = locked;
  }

  function paintRows() {
    const items = Array.from(groups);
    const pages = Math.ceil(items.length / maxRows);
    page = Math.min(page, Math.max(0, pages - 1));
    rows.replaceChildren();
    currentRows = new Map();
    items.slice(page * maxRows, (page + 1) * maxRows).forEach(([id, group], index) => {
      const { row } = source;
      const rowOffset = listY + index * step;
      const tile = createButton(rows, `item-${id}`, row, () => {
        if (!open || locked) return;
        onSound?.('confirm');
        selected = id;
        refreshSelection();
      }, signal, `${source.items[id].name} x${group.count}`);
      const [hitX, hitY, width, height] = row.hit;
      place(tile, listX + hitX, rowOffset + hitY, width, height);
      tile.className = 'quest-battle-bonus-item-row';
      tile.hidden = false;
      Object.assign(tile.dataset, { itemId: String(id), inventoryId: String(group.first.inventoryId),
        count: String(group.count), usable: String(group.first.usable) });
      const selectedArt = draw(tile, null);
      selectedArt.dataset.skin = 'selected';
      image(selectedArt, row.selected ?? row.up, -hitX, -hitY);
      drawIcon(draw(tile, null), id, source.iconAnchors.row);
      const quantity = append(tile, 'span');
      quantity.className = 'quest-battle-bonus-item-row-count';
      place(quantity, ...source.labels.rowCount);
      quantity.textContent = `x${group.count}`;
      currentRows.set(id, tile);
    });
    backButton.hidden = nextButton.hidden = pages <= 1;
    details.page.textContent = pages > 1 ? `${page + 1}/${pages}` : '';
    refreshSelection();
  }

  function changePage(delta) {
    const count = Math.ceil(groups.size / maxRows);
    if (locked || count < 2) return;
    page = (page + delta + count) % count;
    paintRows();
  }

  function update(items, canUseItem, busy) {
    canUse = canUseItem;
    locked = busy;
    const signature = Array.from(items ?? [], item => `${item.itemId}:${item.inventoryId}:${item.usable}`).join();
    if (itemSignature === signature) {
      refreshSelection();
      return;
    }
    itemSignature = signature;
    groups = new Map();
    // Flash sorts by the master ID then selects the first physical entry in its linked inventory.
    for (const item of [...(items ?? [])].sort((first, next) => first.itemId - next.itemId)) {
      if (!source.items[item.itemId]) continue;
      const group = groups.get(item.itemId);
      if (group) group.count += 1;
      else groups.set(item.itemId, { count: 1, first: item });
    }
    if (!groups.has(selected)) selected = undefined;
    paintRows();
  }

  async function setOpen(show, { focus = true } = {}) {
    if (show === open || signal.aborted) return;
    open = show;
    const revision = ++motionRevision;
    launcher.setAttribute('aria-expanded', String(open));
    panel.inert = !show;
    refreshSelection();
    if (show) {
      panel.hidden = false;
      const offset = (openedBefore ? hiddenX : initialX) - x;
      openedBefore = true;
      if (focus) (currentRows.get(selected) ?? currentRows.values().next().value ?? closeButton).focus({ preventScroll: true });
      await motion(panel, [{ opacity: 0, translate: `${offset}px 0` }, { opacity: 1, translate: '0 0' }], durationMs, signal);
    } else {
      if (focus && !launcher.disabled && !launcher.hidden) launcher.focus({ preventScroll: true });
      await motion(panel, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${hiddenX - x}px 0` }], durationMs, signal);
      if (!signal.aborted && revision === motionRevision) panel.hidden = true;
    }
  }

  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open && !locked) {
      event.preventDefault();
      onSound?.('confirm');
      void setOpen(false);
    }
  }, { signal });
  return { update, close: options => setOpen(false, options), toggle: () => setOpen(!open), get open() { return open; } };
}

export function mountQuestBattleBonus(parent, { assets, reward, runAction, loadCards, signal, onSound, onClaim, onAlert }) {
  const frame = assets?.bonus ?? {};
  const board = append(parent, 'section');
  board.id = 'quest-battle-bonus';
  board.dataset.state = 'loading';
  board.setAttribute('aria-label', 'High／Low');
  board.tabIndex = -1;
  const panel = draw(board, frame.panel);
  const rank = append(board, 'div', 'rank');
  draw(rank, frame.rank?.plate);
  const stars = draw(rank, frame.rank?.stars);
  const targets = append(board, 'output', 'target');
  targets.hidden = true;
  targets.setAttribute('aria-label', '比較骰點');
  const number = draw(board, null);
  const cardFrame = draw(board, frame.cards?.frame);
  const cards = append(board, 'div');
  const display = append(board, 'output', 'status');
  display.className = 'sr-only';
  display.setAttribute('role', 'status');
  const selectedArt = draw(board, null, 'selected');
  const controls = append(board, 'div');
  controls.className = 'quest-battle-bonus-controls';
  const buttons = Object.fromEntries(Object.keys(names).map(key => [key, createButton(controls, key, frame.controls?.[key], act, signal)]));
  const itemPanel = mountRewardItems(board, frame.itemPanel, { launcher: buttons.item,
    onUse: item => void submit('item-use', item.inventoryId), onSound, signal });
  const failedControls = itemPanel && frame.controls?.item ? ['item', 'exit'] : ['exit'];
  const dice = append(board, 'canvas', 'dice');
  dice.hidden = true;
  dice.setAttribute('role', 'img');
  const verdict = draw(board, null, 'decision');
  const claimOutput = append(board, 'output', 'claim');
  claimOutput.className = 'sr-only';
  claimOutput.hidden = true;
  claimOutput.setAttribute('aria-label', '已確認的獎勵');
  let latest = reward;
  let entered = false;
  let pending;
  let pendingItemId;
  let selected;
  let shownRound;
  let rollTask;
  let verdictTask;
  let claimTask;
  let dicePainted;
  let reportedItem;
  let presentedItem;
  let appliedItem;
  let resultReady = false;
  let current;
  let upcoming = [];
  let discarded = [];

  function state(next, exposed = [], enabled = []) {
    const changed = board.dataset.state !== next;
    const active = board.ownerDocument.activeElement;
    const arriving = [];
    board.dataset.state = next;
    for (const [key, button] of Object.entries(buttons)) {
      const show = button.hidden && exposed.includes(key);
      button.hidden = !exposed.includes(key);
      button.disabled = !!pending || !enabled.includes(key);
      if (show) arriving.push(motion(button, [{ opacity: 0 }, { opacity: 1 }], 200, signal));
    }
    if (changed && (active === board || active === board.ownerDocument.body || controls.contains(active)) &&
        !enabled.includes(active?.dataset?.action)) {
      const focus = enabled.map(key => buttons[key]).find(button => !button.disabled) ?? board;
      focus.focus({ preventScroll: true });
    }
    return Promise.all(arriving);
  }

  function rankValue(value) {
    if (!Number.isInteger(value) || value < 0) return;
    rank.dataset.rank = String(value);
    const mask = frame.rank?.mask;
    const layer = frame.rank?.stars;
    if (!mask || !layer) return;
    const [x, y, width, height] = mask;
    const filled = width * ((value < 100 ? value : value - 100) + 4) / 100;
    const inset = [y - layer.y, layer.x + layer.width - x - filled, layer.y + layer.height - y - height, x - layer.x];
    stars.style.clipPath = `inset(${inset.map(size => `${Math.max(0, size)}px`).join(' ')})`;
  }

  function target(values) {
    if (!values?.length) return;
    const total = values.reduce((sum, value) => sum + value, 0);
    const shown = image(number, frame.numbers?.[total]);
    targets.hidden = false;
    targets.className = shown ? 'sr-only' : 'quest-battle-bonus-numeric';
    targets.dataset.dice = values.join(',');
    targets.dataset.total = String(total);
    targets.value = String(total);
  }

  function make(source) {
    return createCard(cards, source, { cards: { gem: assets?.treasure?.gem, ...frame.cards }, items: frame.items }, loadCards, signal);
  }

  async function bringOn(snapshot) {
    current = make(snapshot.choices[0]);
    upcoming = snapshot.choices.slice(1).map(make);
    rankValue(snapshot.rank);
    await Promise.all([
      motion(panel, [{ opacity: 0 }, { opacity: 1 }], 300, signal),
      motion(rank, [{ opacity: 0 }, { opacity: 1 }], 2000 / resultSpeed, signal),
      motion(cardFrame, [{ opacity: 0 }, { opacity: 1 }], 2000 / resultSpeed, signal),
      positionCard(current, 'current', 0, 1, signal, 2000 / resultSpeed),
      ...upcoming.map((card, index) => positionCard(card, 'next', index, upcoming.length, signal, 2000 / resultSpeed, true)),
    ]);
    entered = true;
    advance();
  }

  function act(key) {
    const button = buttons[key];
    if (signal.aborted || pending || button.hidden || button.disabled) return;
    if (key === 'item') {
      onSound?.('bonus-select');
      return itemPanel?.toggle();
    }
    return submit(key);
  }

  async function submit(key, inventoryId) {
    if (signal.aborted || pending) return;
    pending = key;
    pendingItemId = inventoryId;
    board.dataset.pending = key;
    display.value = '';
    if (key === 'high' || key === 'low') {
      selected = key;
      verdict.hidden = true;
      selectedArt.dataset.choice = key;
      image(selectedArt, frame.selected?.[key]);
    }
    advance();
    if (key !== 'item-use') onSound?.('bonus-select');
    try { await runAction(key, latest.round, inventoryId); }
    catch (error) {
      if (!signal.aborted && latest?.phase !== 'uncertain' && error?.kind !== 'quest-reward-item-insufficient') {
        display.value = '無法確認獎勵操作。';
      }
    } finally {
      if (!signal.aborted) {
        pending = pendingItemId = undefined;
        delete board.dataset.pending;
        if (latest?.phase === 'guess' && !latest.rolledDice) {
          selected = undefined;
          selectedArt.hidden = true;
        }
        advance();
      }
    }
  }

  async function roll(values) {
    const [x, y] = frame.dice?.viewport ?? [60, 35];
    place(dice, x, y);
    dice.hidden = false;
    dice.dataset.dice = values.join(',');
    dice.dataset.total = String(values.reduce((sum, value) => sum + value, 0));
    dice.setAttribute('aria-label', `骰點 ${values.join('、')}`);
    await playQuestBonusDiceRoll(dice, values, frame.dice, { signal, onThrow: () => onSound?.('dice') });
  }

  async function decide(snapshot) {
    const { decision } = snapshot;
    await rollTask;
    if (signal.aborted || latest?.phase === 'uncertain') return;
    onSound?.(decision.won ? 'bonus-success' : 'bonus-failure');
    await pause(100, signal);
    if (signal.aborted) return;
    verdict.dataset.won = String(decision.won);
    verdict.alt = display.value = decision.won ? '成功' : '失敗';
    const frames = frame.roll?.[decision.won ? 'success' : 'failure'];
    const hold = pause(frame.roll?.leadInMs ?? 2000 / 6, signal);
    await Promise.all([hold, playTrack(verdict, frames, frame.roll?.framesPerSecond, signal, frame.roll?.stopFrame)]);
    if (signal.aborted || latest?.phase === 'uncertain') return;
    selected = undefined;
    await motion(selectedArt, [{ opacity: 1 }, { opacity: 0 }], 200, signal);
    selectedArt.hidden = true;
    if (decision.won && decision.current) {
      rankValue(snapshot.rank);
      if (current) discarded.push(current);
      if (discarded.length > 3) {
        const removed = discarded.shift();
        removed.node.remove();
        removed.quantity.remove();
      }
      current = upcoming.shift();
      if (!equalCard(current?.source, decision.current)) {
        current?.node.remove();
        current?.quantity.remove();
        current = make(decision.current);
      }
      if (decision.next) upcoming.push(make(decision.next));
      await Promise.all([
        positionCard(current, 'current', 0, 1, signal, 1000 / resultSpeed),
        ...upcoming.map((card, index) => positionCard(card, 'next', index, upcoming.length, signal, 1000 / resultSpeed)),
        ...discarded.map((card, index) => positionCard(card, 'previous', index, discarded.length, signal, 1000 / resultSpeed)),
      ]);
    }
    resultReady = true;
    advance();
  }

  async function finish(claim) {
    claimOutput.hidden = false;
    Object.assign(claimOutput.dataset, { totalGems: String(claim.totalGems), totalExp: String(claim.totalExp),
      addPoint: String(claim.addPoint), inventoryIds: claim.inventoryIds.join(',') });
    if (claim.reward) Object.assign(claimOutput.dataset, {
      genre: String(claim.reward.genre), id: String(claim.reward.id), amount: String(claim.reward.amount),
    });
    claimOutput.value = claim.reward ? cardName(claim.reward) : '未獲得額外獎勵';
    if (!claim.reward) board.dataset.claimTransition = 'rank';
    await motion(rank, [{ opacity: 1 }, { opacity: 0 }], 200 / resultSpeed, signal);
    rank.hidden = true;
    if (claim.reward) {
      const hold = pause(1000, signal);
      await Promise.all([hold, playTrack(cardFrame, frame.cards?.get?.frames, frame.cards?.get?.framesPerSecond, signal)]);
    }
    if (signal.aborted) return;
    const remaining = [...upcoming, ...discarded];
    if (!equalCard(current?.source, claim.reward)) {
      if (current) remaining.push(current);
      current = claim.reward ? make(claim.reward) : undefined;
    }
    const slideOff = nodes => nodes.map(node =>
      motion(node, [{ transform: 'translateX(0)' }, { transform: 'translateX(-1024px)' }], 200, signal));
    if (!claim.reward) {
      // The original empty receipt hides the verdict, finishes the dice, then clears the cards and buttons.
      board.dataset.claimTransition = 'verdict';
      if (!verdict.hidden) await motion(verdict, [{ opacity: 1 }, { opacity: 0 }], 200, signal);
      if (signal.aborted) return;
      verdict.hidden = dice.hidden = true;
      board.dataset.claimTransition = 'cards';
    }
    async function fadeOut(node, duration) {
      await motion(node, [{ opacity: 1 }, { opacity: 0 }], duration, signal);
      if (!signal.aborted) node.hidden = true;
    }
    await Promise.all([
      ...remaining.flatMap(({ node, quantity }) => [fadeOut(node, 500 / (claim.reward ? 1.7 : resultSpeed)),
        fadeOut(quantity, 500 / 1.7)]),
      ...(claim.reward ? slideOff([number, dice, verdict, controls]) : []),
      fadeOut(cardFrame, 500 / resultSpeed),
    ]);
    if (signal.aborted) return;
    for (const { node, quantity } of remaining) {
      node.remove();
      quantity.remove();
    }
    if (!claim.reward) {
      board.dataset.claimTransition = 'controls';
      await Promise.all(slideOff([number, controls]));
      if (signal.aborted) return;
      delete board.dataset.claimTransition;
    }
    for (const layer of [number, targets, dice, verdict, controls, cardFrame]) layer.hidden = true;
    if (current) await positionCard(current, 'claimed', 0, 1, signal, 500 / resultSpeed);
    if (signal.aborted) return;
    state('claimed');
    await onClaim(claim);
  }

  async function presentItemReturn(inventoryId, values) {
    // ResultScene.getBottomDiceThread changes the target and runs both button fades before closing Item.
    presentedItem = inventoryId;
    board.dataset.itemTransition = 'outgoing';
    target(values);
    state('using-item', ['item', 'exit']);
    await Promise.all([buttons.item, buttons.exit].map(button =>
      motion(button, [{ opacity: 1 }, { opacity: 0 }], 200, signal)));
    if (signal.aborted || latest?.phase === 'uncertain') return;
    board.dataset.itemTransition = 'incoming';
    await state('using-item', ['high', 'low']);
    if (signal.aborted || latest?.phase === 'uncertain') return;
    board.dataset.itemTransition = 'drawer';
    await itemPanel?.close({ focus: false });
    if (signal.aborted) return;
    delete board.dataset.itemTransition;
    advance();
  }

  function advance() {
    if (!latest || signal.aborted) return;
    const { phase, choices, round, decision, baseDice, rolledDice, claim, canNext, canTake, canGuess, itemUse } = latest;
    const newItemTarget = itemUse && latest.itemBaseDiceReceived && presentedItem !== itemUse.inventoryId;
    if (Number.isInteger(round)) board.dataset.round = String(round);
    itemPanel?.update(latest.items, latest.canUseItem,
      !!pending || phase === 'using-item' || phase === 'claiming' || !!claim || newItemTarget || !!board.dataset.itemTransition);
    if (itemUse && reportedItem !== itemUse.inventoryId) {
      reportedItem = itemUse.inventoryId;
      board.dataset.itemInventoryId = String(reportedItem);
      board.dataset.itemId = String(itemUse.itemId);
      const name = frame.itemPanel?.items[itemUse.itemId]?.name;
      if (name) onAlert?.('quest-reward-item-used', `使用${name}`, board);
    }
    if (phase === 'uncertain') {
      delete board.dataset.itemTransition;
      void itemPanel?.close({ focus: false });
      state(phase);
      display.value = '無法確認獎勵結算。';
      return;
    }
    if (newItemTarget) {
      // While an amendment waits for SC124, its matching SC123 is the verified prior roll.
      void presentItemReturn(itemUse.inventoryId, phase === 'using-item' ? rolledDice : baseDice);
      return;
    }
    if (board.dataset.itemTransition) return;
    if (claimTask) return;
    if (!entered) {
      if (!current && choices?.length) void bringOn(latest);
      return;
    }
    if (shownRound !== round) {
      shownRound = round;
      rollTask = verdictTask = dicePainted = undefined;
      resultReady = false;
    }
    if (itemUse && appliedItem !== itemUse.inventoryId && phase !== 'using-item') {
      appliedItem = itemUse.inventoryId;
      if (itemUse.kind === 'amend' && decision?.won) {
        verdictTask = undefined;
        resultReady = false;
      }
    }
    const waitingAfterItemDice = latest.itemBaseDiceReceived && itemUse?.inventoryId === pendingItemId;
    target(phase === 'using-item' && waitingAfterItemDice ? rolledDice : baseDice);
    if (rolledDice?.length && !dicePainted) {
      dicePainted = true;
      rollTask = roll(rolledDice);
    }
    if (decision && !verdictTask) verdictTask = decide(latest);
    if (claim && !claimTask) {
      state('claiming', claim.reward ? [] : failedControls);
      claimTask = Promise.resolve(verdictTask).then(() => !signal.aborted && finish(claim));
      return;
    }
    if (phase === 'using-item' || pending === 'item-use') {
      state('using-item', waitingAfterItemDice ? ['high', 'low'] : failedControls);
    } else if (phase === 'claiming' || pending === 'get' || pending === 'exit') {
      state('claiming', decision?.won === false ? failedControls : ['get']);
    } else if (phase === 'rolling' || selected || (verdictTask && !resultReady)) {
      state('rolling', ['high', 'low'].filter(key => key !== selected || selectedArt.hidden));
    } else if (phase === 'opening' || pending === 'next') {
      state('opening', ['next', 'get']);
    } else if (phase === 'guess') {
      state('guess', ['high', 'low'], canGuess ? ['high', 'low'] : []);
    } else if (phase === 'offer') {
      const failed = decision?.won === false;
      const showItem = !!itemPanel && !!frame.controls?.item;
      const exposed = failed ? [showItem && 'item', 'exit'].filter(Boolean) : ['next', 'get'];
      state(decision ? (failed ? 'failure' : 'success') : 'offer', exposed,
        [failed && canTake && showItem && 'item', canNext && 'next', canTake && (failed ? 'exit' : 'get')].filter(Boolean));
    }
  }

  board.focus({ preventScroll: true });
  advance();
  return {
    update(snapshot) { latest = snapshot; advance(); },
    async hideClaimCard() {
      if (!current || signal.aborted) return;
      const { node, quantity } = current;
      await Promise.all([node, quantity].map(layer =>
        motion(layer, [{ opacity: 1 }, { opacity: 0 }], 500 / 1.7, signal)));
      if (!signal.aborted) node.hidden = quantity.hidden = true;
    },
  };
}
