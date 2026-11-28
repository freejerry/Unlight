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

function createButton(parent, key, source, select, signal) {
  const node = append(parent, 'button', key);
  const [x, y, width, height] = source?.hit ?? areas[key];
  node.type = 'button';
  node.hidden = true;
  node.disabled = true;
  node.dataset.action = key;
  node.setAttribute('aria-label', names[key]);
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
    node.textContent = names[key];
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

export function mountQuestBattleBonus(parent, { assets, reward, runAction, loadCards, signal, onSound, onClaim }) {
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
  let selected;
  let shownRound;
  let rollTask;
  let verdictTask;
  let claimTask;
  let dicePainted;
  let resultReady = false;
  let current;
  let upcoming = [];
  let discarded = [];

  function state(next, exposed = [], enabled = []) {
    const changed = board.dataset.state !== next;
    const active = board.ownerDocument.activeElement;
    board.dataset.state = next;
    for (const [key, button] of Object.entries(buttons)) {
      const arriving = button.hidden && exposed.includes(key);
      button.hidden = !exposed.includes(key);
      button.disabled = !!pending || !enabled.includes(key);
      if (arriving) void motion(button, [{ opacity: 0 }, { opacity: 1 }], 200, signal);
    }
    if (changed && (active === board || active === board.ownerDocument.body || controls.contains(active)) &&
        !enabled.includes(active?.dataset?.action)) {
      const focus = enabled.map(key => buttons[key]).find(button => !button.disabled) ?? board;
      focus.focus({ preventScroll: true });
    }
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

  async function act(key) {
    const button = buttons[key];
    if (signal.aborted || pending || button.hidden || button.disabled) return;
    pending = key;
    board.dataset.pending = key;
    display.value = '';
    if (key === 'high' || key === 'low') {
      selected = key;
      verdict.hidden = true;
      selectedArt.dataset.choice = key;
      image(selectedArt, frame.selected?.[key]);
    }
    advance();
    onSound?.('bonus-select');
    try { await runAction(key, latest.round); }
    catch {
      if (!signal.aborted && latest?.phase !== 'uncertain') display.value = '無法確認獎勵操作。';
    } finally {
      if (!signal.aborted) {
        pending = undefined;
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
    await Promise.all([
      ...remaining.map(({ node, quantity }) => Promise.all([node, quantity].map(layer =>
        motion(layer, [{ opacity: 1 }, { opacity: 0 }], 500 / 1.7, signal)))),
      ...[number, dice, verdict, controls].map(layer =>
        motion(layer, [{ transform: 'translateX(0)' }, { transform: 'translateX(-1024px)' }], 200, signal)),
      motion(cardFrame, [{ opacity: 1 }, { opacity: 0 }], 500 / resultSpeed, signal),
    ]);
    if (signal.aborted) return;
    for (const { node, quantity } of remaining) {
      node.remove();
      quantity.remove();
    }
    for (const layer of [number, targets, dice, verdict, controls, cardFrame]) layer.hidden = true;
    if (current) await positionCard(current, 'claimed', 0, 1, signal, 500 / resultSpeed);
    if (signal.aborted) return;
    state('claimed');
    await onClaim(claim);
  }

  function advance() {
    if (!latest || signal.aborted) return;
    const { phase, choices, round, decision, baseDice, rolledDice, claim, canNext, canTake, canGuess } = latest;
    if (Number.isInteger(round)) board.dataset.round = String(round);
    if (phase === 'uncertain') {
      state(phase);
      display.value = '無法確認獎勵結算。';
      return;
    }
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
    target(baseDice);
    if (rolledDice?.length && !dicePainted) {
      dicePainted = true;
      rollTask = roll(rolledDice);
    }
    if (decision && !verdictTask) verdictTask = decide(latest);
    if (claim && !claimTask) {
      state('claiming');
      claimTask = Promise.resolve(verdictTask).then(() => !signal.aborted && finish(claim));
      return;
    }
    if (phase === 'claiming' || pending === 'get' || pending === 'exit') {
      state('claiming', [decision?.won === false ? 'exit' : 'get']);
    } else if (phase === 'rolling' || selected || (verdictTask && !resultReady)) {
      state('rolling', ['high', 'low'].filter(key => key !== selected || selectedArt.hidden));
    } else if (phase === 'opening' || pending === 'next') {
      state('opening', ['next', 'get']);
    } else if (phase === 'guess') {
      state('guess', ['high', 'low'], canGuess ? ['high', 'low'] : []);
    } else if (phase === 'offer') {
      const failed = decision?.won === false;
      const exposed = failed ? [frame.controls?.item && 'item', 'exit'].filter(Boolean) : ['next', 'get'];
      state(decision ? (failed ? 'failure' : 'success') : 'offer', exposed,
        [canNext && 'next', canTake && (failed ? 'exit' : 'get')].filter(Boolean));
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
