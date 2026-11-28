import { renderCharacterCard } from './character-card.js';

const art = new URL('./lobby-achievement-art/', import.meta.url);
const resultArt = new URL('./quest-result-art/', import.meta.url);
const noticeTypes = { achievement: 1, 'new-achievement': 2, 'selectable-achievement': 26 };

function add(parent, tag, name) {
  const node = parent.ownerDocument.createElement(tag);
  if (name) node.id = `lobby-achievement-notice${name === true ? '' : `-${name}`}`;
  parent.append(node);
  return node;
}

function place(node, x, y, width, height) {
  Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
}

async function decode(layer) {
  if (!layer || !/^[\w-]+\.png$/.test(layer.file) ||
      ![layer.x, layer.y, layer.width, layer.height].every(Number.isFinite)) return null;
  const image = new Image();
  const directory = layer.url === `/source-login/quest-result-art/${layer.file}` ? resultArt : art;
  image.src = new URL(layer.file, directory).href;
  try {
    await image.decode();
    return { ...layer, src: image.src };
  } catch {
    return null;
  }
}

function draw(parent, layer, offsetX = 0, offsetY = 0) {
  const image = add(parent, 'img');
  image.alt = '';
  image.src = layer.src;
  place(image, layer.x - offsetX, layer.y - offsetY, layer.width, layer.height);
  return image;
}

function animate(duration, signal, drawFrame) {
  if (signal.aborted) return Promise.resolve(false);
  if (duration === 0) {
    drawFrame(1);
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    const start = performance.now();
    let frame;
    function finish(visible) {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', cancel);
      resolve(visible);
    }
    function cancel() { finish(false); }
    function step(now) {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      drawFrame(progress);
      if (progress === 1) finish(true);
      else frame = requestAnimationFrame(step);
    }
    drawFrame(0);
    signal.addEventListener('abort', cancel, { once: true });
    frame = requestAnimationFrame(step);
  });
}

function wait(ms, signal) {
  if (!ms || signal.aborted) return Promise.resolve(!signal.aborted);
  return new Promise(resolve => {
    const timer = setTimeout(() => finish(true), ms);
    function finish(visible) {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(visible);
    }
    function cancel() { finish(false); }
    signal.addEventListener('abort', cancel, { once: true });
  });
}

async function loadArtwork(signal) {
  const response = await fetch(new URL('index.json', art), { redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]) });
  if (!response.ok) return null;
  const source = await response.json();
  const [panel, portrait, up, over, down, back] = await Promise.all([
    decode(source.panel), decode(source.portrait), decode(source.ok?.up), decode(source.ok?.over),
    decode(source.ok?.down), decode(source.card?.back),
  ]);
  const hit = source.ok?.hit;
  if (![panel, portrait, up, over, down, back].every(Boolean) || hit?.length !== 4 || !hit.every(Number.isFinite) ||
      source.title?.text !== 'Record' || !source.card?.motion || source.card?.quantity?.length !== 4) return null;
  return { ...source, panel, portrait, ok: { up, over, down, hit }, back };
}

function isAchievementReward(receipt) {
  return receipt?.kind === 'achievement' &&
    [receipt.achievementId, receipt.treasureType, receipt.amount].every(value => Number.isSafeInteger(value) && value > 0) &&
    [receipt.itemId, receipt.slotType].every(value => Number.isSafeInteger(value) && value >= 0);
}

function isNewAchievement(receipt) {
  return receipt?.kind === 'new-achievement' && Number.isSafeInteger(receipt.achievementId) && receipt.achievementId > 0;
}

function isSelectableAchievement(receipt) {
  return receipt?.kind === 'selectable-achievement' && Number.isSafeInteger(receipt.achievementId) && receipt.achievementId > 0;
}

function isNotice(receipt) {
  return isAchievementReward(receipt) || isNewAchievement(receipt) || isSelectableAchievement(receipt);
}

function follows(first, next) {
  return first.kind === next.kind ? first.achievementId > next.achievementId : noticeTypes[first.kind] > noticeTypes[next.kind];
}

// LobbyNotice.as:545–565 returns -1 on ties. Ruffle 0.8.0's Vector.sort uses array.rs:qsort,
// so a stable Array.sort by ID would lose the observed order when new notices share the same list.
function sortNoticeList(list, start = 0, end = list.length) {
  const length = end - start;
  if (length < 2) return;
  const swap = (left, right) => { [list[left], list[right]] = [list[right], list[left]]; };
  if (length <= 3) {
    if (follows(list[start], list[start + 1])) swap(start, start + 1);
    if (length === 3 && follows(list[start + 1], list[start + 2])) {
      swap(start + 1, start + 2);
      if (follows(list[start], list[start + 1])) swap(start, start + 1);
    }
    return;
  }
  swap(start, start + Math.floor(length / 2));
  const pivot = list[start];
  let left = start;
  let right = end;
  for (;;) {
    do { left += 1; } while (left < end && !follows(list[left], pivot));
    do { right -= 1; } while (right > start && follows(list[right], pivot));
    if (right < left) break;
    swap(left, right);
  }
  swap(start, right);
  sortNoticeList(list, start, right);
  sortNoticeList(list, left, end);
}

// Direct receipt fields contain the master IDs. The authored manifest supplies names and card faces.
async function makeFace(doc, artSource, receipt, signal) {
  const { achievementId, treasureType, itemId, amount } = receipt;
  const caption = artSource.achievements?.[achievementId];
  const gem = treasureType === 5 && itemId === 0;
  const character = treasureType === 1;
  const card = gem ? artSource.card.gem
    : treasureType === 3 ? artSource.card.items?.[itemId]
    : character ? artSource.card.characters?.[itemId] : null;
  if (!caption || !card) return null;
  const face = doc.createElement('div');
  face.className = 'lobby-achievement-card-face';
  if (character) {
    const canvas = add(face, 'canvas');
    if (!await renderCharacterCard(canvas, card, { signal })) return null;
  } else {
    const [frame, icon] = await Promise.all([decode(card.frame), decode(card.icon)]);
    if (!frame || !icon || !card.title || !card.caption) return null;
    draw(face, frame);
    const description = add(face, 'div');
    description.className = gem ? 'lobby-achievement-gem' : 'lobby-achievement-card-description';
    const bounds = card.caption;
    place(description, bounds.x, bounds.y, bounds.width, bounds.height);
    if (gem) {
      description.append('\u00a0');
      add(description, 'span').textContent = String(amount);
      description.append('Gem');
    } else description.textContent = bounds.text;
    draw(face, icon);
    const title = add(face, 'div');
    title.className = gem ? 'lobby-achievement-card-title lobby-achievement-gem-title' : 'lobby-achievement-card-title';
    place(title, card.title.x, card.title.y, card.title.width, card.title.height);
    title.textContent = card.title.text;
  }
  const name = gem ? `${amount} Gem` : card.name ?? card.title?.text;
  return { caption, face, name };
}

async function makePresentation(doc, source, receipt, signal, options) {
  if (receipt.kind === 'achievement') return makeFace(doc, source, receipt, signal);
  const caption = source.achievements?.[receipt.achievementId];
  if (!caption) return null;
  if (isSelectableAchievement(receipt)) {
    const selectable = source.selectable;
    const authored = selectable?.choices?.[receipt.achievementId];
    if (!Array.isArray(authored) || !Array.isArray(options) || !options.length || typeof selectable.messageTemplate !== 'string') return null;
    const choices = options.map(option => {
      const definition = source.card.characters?.[option.itemId];
      if (option.type !== 1 || option.amount !== 1 || option.slotType !== 0 || authored[option.index] !== option.itemId || !definition) return null;
      return { ...option, name: `${definition.name} Lv.${definition.level}` };
    });
    if (choices.some(choice => !choice) || new Set(choices.map(({ index }) => index)).size !== choices.length) return null;
    return { caption, choices };
  }
  const challenge = source.newChallenge;
  if (typeof challenge?.messageTemplate !== 'string') return null;
  const artLayer = challenge.beginnerIds.includes(receipt.achievementId) ? challenge.beginnerArt : challenge.art;
  const artwork = await decode(artLayer);
  if (!artwork) return null;
  return { caption, artwork };
}

function noticeMessage(receipt, source, caption) {
  const layout = isNewAchievement(receipt) ? source.newChallenge : isSelectableAchievement(receipt) ? source.selectable : null;
  if (layout) return layout.messageTemplate.replace('__ARCHIEVEMENT_CAPTION__', caption);
  return `恭喜。您達成了「${caption}」的成就。請收下紀念道具。`;
}

function rewardChoice(parent, options, layout, signal, onSelect) {
  const holder = add(parent, 'div', 'choice-container');
  const { x, y, width, height, dropdownWidth, rowCount, prompt } = layout;
  place(holder, x, y, width, height);
  const combo = add(holder, 'button', 'choice');
  const menu = add(holder, 'ul', 'choice-list');
  combo.type = 'button';
  combo.textContent = prompt;
  combo.setAttribute('role', 'combobox');
  combo.setAttribute('aria-label', '選擇獎勵');
  combo.setAttribute('aria-controls', menu.id);
  combo.setAttribute('aria-expanded', 'false');
  combo.setAttribute('aria-haspopup', 'listbox');
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  menu.style.width = `${dropdownWidth}px`;
  menu.style.setProperty('--achievement-choice-rows', String(rowCount));
  let cursor = 0;
  let selected = -1;

  const rows = options.map((option, position) => {
    const row = add(menu, 'li', `choice-option-${option.index}`);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    row.dataset.index = String(option.index);
    row.dataset.itemId = String(option.itemId);
    row.textContent = option.name;
    row.addEventListener('pointermove', () => highlight(position), { signal });
    row.addEventListener('mousedown', event => event.preventDefault(), { signal });
    row.addEventListener('click', () => choose(position), { signal });
    return row;
  });

  function highlight(position) {
    cursor = Math.min(rows.length - 1, Math.max(0, position));
    const current = rows[cursor];
    for (const row of rows) row.dataset.active = String(row === current);
    combo.setAttribute('aria-activedescendant', current.id);
    if (current.offsetTop < menu.scrollTop) menu.scrollTop = current.offsetTop;
    else if (current.offsetTop + current.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = current.offsetTop + current.offsetHeight - menu.clientHeight;
    }
  }

  function open(position) {
    if (combo.disabled) return;
    menu.hidden = false;
    combo.setAttribute('aria-expanded', 'true');
    if (position !== undefined) highlight(position);
    else {
      cursor = Math.max(0, selected);
      for (const row of rows) delete row.dataset.active;
      menu.scrollTop = selected < 0 ? 0 : Math.max(0, rows[selected].offsetTop - menu.clientHeight + rows[selected].offsetHeight);
    }
  }

  function close() {
    menu.hidden = true;
    combo.setAttribute('aria-expanded', 'false');
    combo.removeAttribute('aria-activedescendant');
  }

  function choose(position) {
    if (combo.disabled || menu.hidden) return;
    close();
    combo.focus({ preventScroll: true });
    if (position === selected) return;
    selected = position;
    for (const [rowIndex, row] of rows.entries()) row.setAttribute('aria-selected', String(rowIndex === position));
    combo.textContent = options[position].name;
    onSelect(options[position]);
  }

  combo.addEventListener('click', () => menu.hidden ? open() : close(), { signal });
  combo.addEventListener('keydown', event => {
    combo.dataset.keyboard = '';
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (menu.hidden) open(selected < 0 && event.key === 'ArrowUp' ? rows.length - 1 : Math.max(0, selected));
        else highlight(cursor + (event.key === 'ArrowDown' ? 1 : -1));
        break;
      case 'Home':
      case 'End':
      case 'PageUp':
      case 'PageDown':
        if (menu.hidden) break;
        event.preventDefault();
        highlight(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : cursor + (event.key === 'PageDown' ? rowCount : -rowCount));
        break;
      case 'Enter':
      case ' ':
        if (!menu.hidden) { event.preventDefault(); choose(cursor); }
        break;
      case 'Escape':
      case 'Tab':
        if (!menu.hidden) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
          close();
        }
        break;
    }
  }, { signal });
  parent.addEventListener('pointerdown', event => {
    if (!holder.contains(event.target)) close();
  }, { signal });
  return { combo, dispose: () => holder.remove(), lock(locked) {
    close();
    combo.disabled = locked;
  } };
}

/** Present same-session server achievement receipts. OK only acknowledges the visible receipt. */
export function mountLobbyAchievementNotices(view, {
  signal, getSelectableOptions, getSelectableState, onFlip, onChoice, onAcknowledge, onClaimSelectable, onSelectableClaimed,
  onIdle, returnFocus,
} = {}) {
  const controller = new AbortController();
  const visual = controller.signal;
  const doc = view.ownerDocument;
  const win = doc.defaultView;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const received = new WeakSet();
  const queue = [];
  let artwork;
  let modal;
  let current;
  let processing = false;

  function position() {
    if (!modal) return;
    const { left, top } = view.getBoundingClientRect();
    place(modal.dialog, left, top, 780, 680);
  }

  function slide(panel, to, duration, ease) {
    panel.slide?.abort();
    panel.slide = new AbortController();
    const from = panel.y;
    return animate(reduced.matches ? 0 : duration, AbortSignal.any([visual, panel.slide.signal]), progress => {
      panel.y = from + (to - from) * ease(progress);
      panel.content.style.transform = `translateY(${panel.y}px)`;
    });
  }

  function open(source) {
    const dialog = add(view, 'dialog', true);
    dialog.tabIndex = -1;
    const content = add(dialog, 'div');
    content.className = 'lobby-achievement-content';
    const title = add(content, 'h2', 'title');
    const message = add(content, 'p', 'message');
    const reward = add(content, 'div', 'reward');
    const status = add(content, 'p', 'status');
    status.hidden = true;
    status.setAttribute('role', 'status');
    const ok = add(content, 'button', 'ok');
    const heading = source.title;
    title.textContent = heading.text;
    place(title, heading.x, heading.y, heading.width, heading.height);
    title.lang = 'en';
    ok.type = 'button';
    ok.setAttribute('aria-label', 'OK');
    ok.setAttribute('aria-describedby', reward.id);
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.setAttribute('aria-describedby', message.id);
    dialog.dataset.state = 'entering';
    draw(content, source.panel);
    const portrait = draw(content, source.portrait);
    const [x, y, width, height] = source.ok.hit;
    place(ok, x, y, width, height);
    for (const key of ['up', 'over', 'down']) draw(ok, source.ok[key], x, y).dataset.buttonState = key;
    ok.addEventListener('click', activateOK, { signal: visual });
    dialog.addEventListener('cancel', event => event.preventDefault(), { signal: visual });
    modal = { dialog, content, message, reward, ok, portrait, status, y: -120 };
    position();
    return modal;
  }

  function finishClose() {
    modal?.dialog.close();
    modal?.dialog.remove();
    modal = undefined;
  }

  function removeReceipt(receipt) {
    const index = queue.indexOf(receipt);
    if (index >= 0) queue.splice(index, 1);
  }

  function show(entering, focus = modal.ok) {
    const { dialog } = modal;
    let arrival;
    if (entering) {
      dialog.dataset.state = 'entering';
      dialog.showModal();
      arrival = slide(modal, 0, 300, ratio => 1 - (1 - ratio) ** 2);
    } else dialog.dataset.state = 'waiting';
    focus.focus({ preventScroll: true });
    return arrival;
  }

  function drawCardBack(source, layout) {
    return draw(modal.reward, { ...source.back, x: source.back.x + layout.pivot[0] - source.card.pivot[0],
      y: source.back.y + layout.pivot[1] - source.card.pivot[1] });
  }

  async function reveal(receipt, source, face, signal, { layout = source.card, selected, shown = false } = {}) {
    const { dialog, reward } = modal;
    const { width, height, quantity: quantityBounds } = source.card;
    const { pivot, face: faceOrigin } = layout;
    const { backHoldMs, flipDurationMs, flipDegrees, showFaceAtDeg } = source.card.motion;
    reward.replaceChildren();
    const back = drawCardBack(source, layout);
    const quantity = add(reward, 'span', 'quantity');
    quantity.className = 'lobby-achievement-quantity';
    const [quantityX, quantityY, quantityWidth, quantityHeight] = quantityBounds;
    place(quantity, pivot[0] + quantityX, pivot[1] + quantityY, quantityWidth, quantityHeight);
    quantity.append('x');
    add(quantity, 'span').textContent = String(selected?.amount ?? receipt.amount);
    quantity.hidden = true;
    reward.append(face);
    face.hidden = true;
    place(face, 2 * pivot[0] - faceOrigin[0] - width, faceOrigin[1], width, height);
    reward.style.transformOrigin = `${pivot[0]}px ${pivot[1]}px`;
    face.style.transform = 'scaleX(-1)';
    if (!await wait(reduced.matches || selected ? 0 : backHoldMs, signal)) return;
    if (!shown) {
      if (!current?.claiming && !current?.blocked) dialog.dataset.state = 'flipping';
      try { void Promise.resolve(onFlip?.(receipt, selected)).catch(() => {}); } catch { /* The receipt remains visible without audio. */ }
      const settled = await animate(reduced.matches ? 0 : flipDurationMs, signal, ratio => {
        const angle = ratio === 1 ? flipDegrees : flipDegrees * (1 - 2 ** (-10 * ratio));
        reward.style.transform = `rotateY(${angle}deg)`;
        face.hidden = angle < showFaceAtDeg;
        back.hidden = !face.hidden;
      });
      if (!settled || signal.aborted) return;
    }
    reward.style.transform = face.style.transform = '';
    place(face, ...faceOrigin, width, height);
    back.hidden = true;
    face.hidden = false;
    quantity.hidden = (selected?.type ?? receipt.treasureType) === 5 || (selected?.amount ?? receipt.amount) === 1;
    if (!current?.claiming && !current?.blocked) dialog.dataset.state = 'ready';
  }

  async function showChallenge(artwork, signal, entering) {
    const { dialog, reward, ok } = modal;
    draw(reward, artwork).id = 'lobby-achievement-notice-challenge';
    ok.disabled = false;
    await show(entering);
    if (!signal.aborted) dialog.dataset.state = 'ready';
  }

  async function showSelectable(entry, source, choices, signal, entering) {
    const { dialog, content, ok } = modal;
    const { selectable } = source;
    drawCardBack(source, selectable);
    ok.disabled = true;
    entry.faces = new Map();
    entry.revealed = new Set();
    entry.choiceControl = rewardChoice(content, choices, selectable.dropdown, signal, choice => {
      void selectReward(entry, source, choice, signal);
    });
    const { combo } = entry.choiceControl;
    const resumed = getSelectableState?.(entry.receipt);
    if (resumed === 'uncertain' || resumed === 'claiming' || resumed === 'unavailable') {
      entry.choiceControl.lock(true);
      await show(entering, dialog);
      if (!signal.aborted) showClaimFailure(entry, resumed === 'unavailable' ? 'unavailable' : 'uncertain');
      return;
    }
    await show(entering, combo);
    if (!signal.aborted && !entry.selection) dialog.dataset.state = 'ready';
  }

  async function selectReward(entry, source, choice, signal) {
    if (signal.aborted || entry.claiming || entry.blocked || current !== entry) return;
    const { dialog, reward, ok, status } = modal;
    entry.preview?.abort();
    entry.preview = new AbortController();
    const preview = AbortSignal.any([signal, entry.preview.signal]);
    entry.selection = choice;
    dialog.dataset.selectionIndex = String(choice.index);
    dialog.dataset.selectionItemId = String(choice.itemId);
    dialog.dataset.state = 'selection-loading';
    status.hidden = true;
    ok.disabled = false;
    reward.replaceChildren();
    reward.style.transform = '';
    reward.setAttribute('aria-label', choice.name);
    drawCardBack(source, source.selectable);
    try { void Promise.resolve(onChoice?.(entry.receipt, choice)).catch(() => {}); } catch { /* A muted choice still stays selected. */ }
    if (!entry.faces.has(choice.index)) {
      const proof = { ...entry.receipt, treasureType: choice.type, itemId: choice.itemId, amount: choice.amount };
      entry.faces.set(choice.index, makeFace(doc, source, proof, signal).catch(() => null));
    }
    const card = await entry.faces.get(choice.index);
    if (preview.aborted || current !== entry) return;
    if (!card) {
      entry.faces.delete(choice.index);
      if (!entry.claiming && !entry.blocked) dialog.dataset.state = 'ready';
      return;
    }
    const shown = entry.revealed.has(choice.index);
    entry.revealed.add(choice.index);
    await reveal(entry.receipt, source, card.face, preview, { layout: source.selectable, selected: choice, shown });
  }

  function showClaimFailure(entry, outcome) {
    const { dialog, status, ok } = modal;
    entry.claiming = false;
    entry.blocked = outcome !== 'retry';
    dialog.dataset.state = entry.blocked ? outcome : 'ready';
    status.textContent = {
      retry: '無法領取獎勵。請重新選擇或重試。',
      unavailable: '這項獎勵目前無法領取。',
      uncertain: '無法確認獎勵是否已領取。請重新登入後查看。',
    }[outcome];
    status.hidden = false;
    ok.disabled = entry.blocked;
    entry.choiceControl.lock(entry.blocked);
    if (!entry.blocked) ok.focus({ preventScroll: true });
  }

  async function closeNotice() {
    modal.dialog.dataset.state = 'leaving';
    await slide(modal, -120, 150, ratio => Math.sin(Math.PI * ratio / 2));
    if (visual.aborted) return;
    finishClose();
    (returnFocus ?? view.querySelector('#lobby-title'))?.focus({ preventScroll: true });
  }

  async function claimSelectable(entry) {
    const { receipt, selection, alive, confirmation } = entry;
    if (!selection || entry.claiming || entry.blocked || alive.aborted) return;
    entry.claiming = true;
    const { dialog, ok, status } = modal;
    dialog.dataset.state = 'claiming';
    ok.disabled = true;
    status.hidden = true;
    entry.choiceControl.lock(true);
    const startedAt = performance.now();
    let result;
    try {
      result = await onClaimSelectable(receipt, selection.index, { signal: alive });
    } catch (error) {
      if (alive.aborted) return;
      const retry = error?.kind === 'busy' || error?.kind === 'cancelled' ||
        (error?.kind === 'lobby-reward-rejected' && error.code === 1);
      const unavailable = error?.kind === 'lobby-reward-unavailable' ||
        (error?.kind === 'lobby-reward-rejected' && error.code === 2);
      showClaimFailure(entry, retry ? 'retry' : unavailable ? 'unavailable' : 'uncertain');
      return;
    }
    if (alive.aborted) return;
    if (result?.achievementId !== receipt.achievementId || result.selectionIndex !== selection.index ||
        !Array.isArray(result.grants) || result.grants.length !== selection.amount ||
        !result.grants.every(grant => grant.cardId === selection.itemId && Number.isSafeInteger(grant.inventoryId) && grant.inventoryId > 0) ||
        new Set(result.grants.map(({ inventoryId }) => inventoryId)).size !== result.grants.length) {
      showClaimFailure(entry, 'uncertain');
      return;
    }
    removeReceipt(receipt);
    entry.revealLifetime.abort();
    await closeNotice();
    const delay = Math.max(0, confirmation.delayMs - (performance.now() - startedAt));
    if (!await wait(delay, visual)) return;
    // The original alert is scheduled after OK. Display it only after the matched physical grant has committed.
    try { await onSelectableClaimed?.({ receipt, choice: selection, name: selection.name, grants: result.grants }); }
    finally {
      current = undefined;
      if (!visual.aborted) void advance();
    }
  }

  async function advance() {
    if (processing || current || visual.aborted) return;
    processing = true;
    try {
      if (queue.length) artwork ??= loadArtwork(visual).catch(() => null);
      const source = artwork ? await artwork : null;
      while (!visual.aborted && queue.length) {
        sortNoticeList(queue);
        const receipt = queue[0];
        const options = isSelectableAchievement(receipt) && typeof onClaimSelectable === 'function' ? getSelectableOptions?.(receipt) : null;
        const card = source ? await makePresentation(doc, source, receipt, visual, options).catch(() => null) : null;
        if (visual.aborted) return;
        if (!card) {
          removeReceipt(receipt);
          continue;
        }
        const entering = !modal;
        const { dialog, message, reward, portrait, status, ok } = modal ?? open(source);
        const { achievementId, treasureType, itemId, amount, slotType } = receipt;
        Object.assign(dialog.dataset, { kind: receipt.kind, achievementId: String(achievementId) });
        for (const key of ['treasureType', 'itemId', 'amount', 'slotType']) delete dialog.dataset[key];
        delete dialog.dataset.selectionIndex;
        delete dialog.dataset.selectionItemId;
        status.hidden = true;
        if (receipt.kind === 'achievement') Object.assign(dialog.dataset, { treasureType: String(treasureType),
          itemId: String(itemId), amount: String(amount), slotType: String(slotType) });
        message.textContent = noticeMessage(receipt, source, card.caption);
        reward.replaceChildren();
        reward.style.transform = '';
        portrait.hidden = receipt.kind === 'new-achievement';
        if (!isNewAchievement(receipt)) {
          reward.setAttribute('role', 'img');
          const name = isSelectableAchievement(receipt) ? source.selectable.dropdown.prompt :
            treasureType !== 5 && amount > 1 ? `${card.name} ×${amount}` : card.name;
          reward.setAttribute('aria-label', name);
        } else {
          reward.removeAttribute('role');
          reward.removeAttribute('aria-label');
        }
        const revealLifetime = new AbortController();
        const alive = AbortSignal.any([visual, revealLifetime.signal]);
        current = { receipt, revealLifetime, alive };
        if (isAchievementReward(receipt)) {
          ok.disabled = false;
          show(entering);
          void reveal(receipt, source, card.face, alive);
        } else if (isNewAchievement(receipt)) void showChallenge(card.artwork, alive, entering);
        else {
          current.confirmation = source.selectable.confirmation;
          void showSelectable(current, source, card.choices, alive, entering);
        }
        return;
      }
      if (visual.aborted) return;
      if (modal) await closeNotice();
    } finally {
      processing = false;
    }
    if (visual.aborted) return;
    if (queue.length) void advance();
    else onIdle?.();
  }

  function activateOK() {
    if (!current || visual.aborted || modal.ok.disabled) return;
    if (isSelectableAchievement(current.receipt)) {
      void claimSelectable(current);
      return;
    }
    const { receipt, revealLifetime } = current;
    current = undefined;
    revealLifetime.abort();
    modal.ok.disabled = true;
    modal.dialog.dataset.state = 'loading';
    modal.reward.replaceChildren();
    removeReceipt(receipt);
    onAcknowledge?.(receipt);
    void advance();
  }

  function dispose() {
    controller.abort();
    queue.length = 0;
    finishClose();
    signal?.removeEventListener('abort', dispose);
  }

  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort', dispose, { once: true });
  win.addEventListener('resize', position, { signal: visual });
  win.addEventListener('scroll', position, { signal: visual, passive: true });
  return {
    enqueue(receipts) {
      if (visual.aborted) return;
      let inserted = false;
      for (const receipt of receipts) {
        if (!isNotice(receipt) || received.has(receipt)) continue;
        received.add(receipt);
        const prior = queue.findIndex(row => row.achievementId === receipt.achievementId);
        if (isNewAchievement(queue[prior])) queue[prior] = receipt;
        else queue.push(receipt);
        sortNoticeList(queue);
        inserted = true;
      }
      if (inserted) void advance();
    },
    hasPending: () => !!(processing || modal || queue.length),
    dispose,
  };
}
