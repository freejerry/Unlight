import { renderCharacterCard } from './character-card.js';

const art = new URL('./lobby-achievement-art/', import.meta.url);
const resultArt = new URL('./quest-result-art/', import.meta.url);

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

function follows(first, next) {
  return first.kind === next.kind ? first.achievementId > next.achievementId : first.kind === 'new-achievement';
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

/** Present same-session server achievement receipts. OK only acknowledges the visible receipt. */
export function mountLobbyAchievementNotices(view, { signal, onFlip, onAcknowledge, onIdle, returnFocus } = {}) {
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
    const content = add(dialog, 'div');
    content.className = 'lobby-achievement-content';
    const title = add(content, 'h2', 'title');
    const message = add(content, 'p', 'message');
    const reward = add(content, 'div', 'reward');
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
    draw(content, source.portrait);
    const [x, y, width, height] = source.ok.hit;
    place(ok, x, y, width, height);
    for (const key of ['up', 'over', 'down']) draw(ok, source.ok[key], x, y).dataset.buttonState = key;
    ok.addEventListener('click', acknowledge, { signal: visual });
    dialog.addEventListener('cancel', event => event.preventDefault(), { signal: visual });
    modal = { dialog, content, message, reward, ok, y: -120 };
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

  async function reveal(receipt, source, face, signal, entering) {
    const { dialog, reward, ok } = modal;
    const { pivot, face: faceOrigin, width, height, quantity: quantityBounds } = source.card;
    const { backHoldMs, flipDurationMs, flipDegrees, showFaceAtDeg } = source.card.motion;
    const back = draw(reward, source.back);
    const quantity = add(reward, 'span', 'quantity');
    quantity.className = 'lobby-achievement-quantity';
    const [quantityX, quantityY, quantityWidth, quantityHeight] = quantityBounds;
    place(quantity, pivot[0] + quantityX, pivot[1] + quantityY, quantityWidth, quantityHeight);
    quantity.append('x');
    add(quantity, 'span').textContent = String(receipt.amount);
    quantity.hidden = true;
    reward.append(face);
    face.hidden = true;
    place(face, 2 * pivot[0] - faceOrigin[0] - width, faceOrigin[1], width, height);
    reward.style.transformOrigin = `${pivot[0]}px ${pivot[1]}px`;
    face.style.transform = 'scaleX(-1)';
    if (entering) {
      dialog.showModal();
      void slide(modal, 0, 300, ratio => 1 - (1 - ratio) ** 2);
    } else dialog.dataset.state = 'waiting';
    ok.disabled = false;
    ok.focus({ preventScroll: true });
    if (!await wait(reduced.matches ? 0 : backHoldMs, signal)) return;
    dialog.dataset.state = 'flipping';
    try { void Promise.resolve(onFlip?.(receipt)).catch(() => {}); } catch { /* The receipt remains visible without audio. */ }
    const settled = await animate(reduced.matches ? 0 : flipDurationMs, signal, ratio => {
      const angle = ratio === 1 ? flipDegrees : flipDegrees * (1 - 2 ** (-10 * ratio));
      reward.style.transform = `rotateY(${angle}deg)`;
      face.hidden = angle < showFaceAtDeg;
      back.hidden = !face.hidden;
    });
    if (!settled || signal.aborted) return;
    reward.style.transform = face.style.transform = '';
    place(face, ...faceOrigin, width, height);
    back.hidden = true;
    face.hidden = false;
    quantity.hidden = receipt.treasureType === 5 || receipt.amount === 1;
    dialog.dataset.state = 'ready';
  }

  async function advance() {
    if (processing || current || visual.aborted) return;
    processing = true;
    try {
      if (queue.some(isAchievementReward)) artwork ??= loadArtwork(visual).catch(() => null);
      const source = artwork ? await artwork : null;
      while (!visual.aborted && queue.length) {
        sortNoticeList(queue);
        const receipt = queue.find(isAchievementReward);
        if (!receipt) break;
        const card = source ? await makeFace(doc, source, receipt, visual).catch(() => null) : null;
        if (visual.aborted) return;
        if (!card) {
          removeReceipt(receipt);
          continue;
        }
        const entering = !modal;
        const { dialog, message, reward } = modal ?? open(source);
        const { achievementId, treasureType, itemId, amount, slotType } = receipt;
        Object.assign(dialog.dataset, { achievementId: String(achievementId), treasureType: String(treasureType),
          itemId: String(itemId), amount: String(amount), slotType: String(slotType) });
        message.textContent = `恭喜。您達成了「${card.caption}」的成就。請收下紀念道具。`;
        reward.replaceChildren();
        reward.style.transform = '';
        reward.setAttribute('role', 'img');
        reward.setAttribute('aria-label', treasureType !== 5 && amount > 1 ? `${card.name} ×${amount}` : card.name);
        const revealLifetime = new AbortController();
        current = { receipt, revealLifetime };
        void reveal(receipt, source, card.face, AbortSignal.any([visual, revealLifetime.signal]), entering);
        return;
      }
      if (visual.aborted) return;
      if (modal) {
        modal.dialog.dataset.state = 'leaving';
        await slide(modal, -120, 150, ratio => Math.sin(Math.PI * ratio / 2));
        if (visual.aborted) return;
        finishClose();
        (returnFocus ?? view.querySelector('#lobby-title'))?.focus({ preventScroll: true });
      }
    } finally {
      processing = false;
    }
    if (visual.aborted) return;
    if (queue.some(isAchievementReward)) void advance();
    else onIdle?.();
  }

  function acknowledge() {
    if (!current || visual.aborted) return;
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
        if (!(isAchievementReward(receipt) || isNewAchievement(receipt)) || received.has(receipt)) continue;
        received.add(receipt);
        const prior = queue.findIndex(row => row.achievementId === receipt.achievementId);
        if (isNewAchievement(queue[prior])) queue[prior] = receipt;
        else queue.push(receipt);
        sortNoticeList(queue);
        inserted = true;
      }
      if (inserted) void advance();
    },
    hasPending: () => !!(processing || modal || queue.some(isAchievementReward)),
    dispose,
  };
}
