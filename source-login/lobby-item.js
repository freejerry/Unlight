const art = new URL('./lobby-item-art/', import.meta.url);
const listStates = new WeakMap();
const empty = { status: 'unknown', rows: [] };

function add(parent, tag, name, className) {
  const node = parent.ownerDocument.createElement(tag);
  if (name) node.id = `lobby-item${name === true ? '' : `-${name}`}`;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function place(node, x, y, width, height) {
  Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
}

function sprite(parent, layer, { skin, anchor, dx = 0, dy = 0 } = {}) {
  if (!layer) return;
  const image = add(parent, 'img', null, 'lobby-item-art');
  image.alt = '';
  image.src = layer.url ?? new URL(layer.file, art).href;
  if (skin) image.dataset.skin = skin;
  const { x = 0, y = 0, scale = 1 } = anchor ?? {};
  place(image, dx + x + layer.x * scale, dy + y + layer.y * scale, layer.width * scale, layer.height * scale);
}

function artButton(parent, id, label, source, dx = 0, dy = 0) {
  const [x, y, width, height] = source.hit;
  const button = add(parent, 'button', id, 'lobby-item-button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  place(button, dx + x, dy + y, width, height);
  for (const skin of ['up', 'over', 'down', 'selected']) sprite(button, source[skin], { skin, dx: -x, dy: -y });
  return button;
}

// ItemListView slides between x798 and x498 with separate source eases.
function slide(panel, from, to, duration, easing, signal) {
  return new Promise(resolve => {
    let frame;
    const start = performance.now();
    const move = value => { panel.style.transform = `translateX(${value}px)`; };
    function finish(completed) {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', cancel);
      resolve(completed);
    }
    function cancel() { finish(false); }
    function step(now) {
      const time = Math.min(1, Math.max(0, (now - start) / duration));
      move(from + (to - from) * easing(time));
      if (time === 1) finish(true);
      else frame = requestAnimationFrame(step);
    }
    if (signal.aborted) return resolve(false);
    if (panel.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      move(to);
      return resolve(true);
    }
    move(from);
    signal.addEventListener('abort', cancel, { once: true });
    frame = requestAnimationFrame(step);
  });
}

function groupItems(snapshot, definitions) {
  const groups = new Map();
  // Source sorts by master item ID and looks up the first matching physical copy.
  for (const row of [...snapshot.rows].sort((a, b) => a.itemId - b.itemId)) {
    const definition = definitions[row.itemId];
    if (definition?.kind !== 0) continue;
    const group = groups.get(row.itemId);
    if (group) group.count++;
    else groups.set(row.itemId, { row, definition, count: 1 });
  }
  return groups;
}

export function mountLobbyItem(view, { session, trigger, signal, canOpen, onOpen, onClose, onRowClick, onUse } = {}) {
  const lifetime = new AbortController();
  const saved = listStates.get(session) ?? { page: 0, unconfirmed: new Set(), lastUseAt: -Infinity };
  if (session) listStates.set(session, saved);
  let current = null;
  let manifest;
  let loading = false;
  let using = false;
  const isOpen = () => loading || current !== null;

  function dispose() {
    lifetime.abort();
    current?.controller.abort();
    current?.shell.remove();
    current = null;
    loading = false;
    trigger?.setAttribute('aria-expanded', 'false');
    signal?.removeEventListener('abort', dispose);
  }

  async function close() {
    const instance = current;
    if (!instance || instance.panel.dataset.state === 'closing') return false;
    const { shell, panel, controller, opening, x, start } = instance;
    const xOffset = panel.getBoundingClientRect().left - shell.getBoundingClientRect().left - x;
    panel.dataset.state = 'closing';
    panel.inert = true;
    opening.abort();
    if (!await slide(panel, xOffset, start, manifest.motion.closeMs, time => Math.sin(time * Math.PI / 2), controller.signal)) return false;
    controller.abort();
    shell.remove();
    current = null;
    trigger?.setAttribute('aria-expanded', 'false');
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    onClose?.();
    return true;
  }

  async function open() {
    if (isOpen() || lifetime.signal.aborted || !view.isConnected || canOpen?.() === false) return false;
    if (!manifest) {
      loading = true;
      try {
        const response = await fetch(new URL('index.json', art), { signal: lifetime.signal });
        if (!response.ok) return false;
        manifest = await response.json();
      } catch {
        return false;
      } finally {
        loading = false;
      }
    }
    if (lifetime.signal.aborted || !view.isConnected || canOpen?.() === false) return false;

    const [x, y] = manifest.origin;
    const { initialX, openMs } = manifest.motion;
    const { step, maxRows, x: listX, y: listY } = manifest.list;
    const start = initialX - x;
    const controller = new AbortController();
    const opening = new AbortController();
    const scope = controller.signal;
    scope.addEventListener('abort', () => opening.abort(), { once: true });
    const shell = add(view, 'dialog', 'shell');
    shell.setAttribute('aria-label', '道具');
    const panel = add(shell, 'section', true);
    panel.dataset.state = 'opening';
    panel.style.transform = `translateX(${start}px)`;
    place(panel, x, y, manifest.plate.width, manifest.plate.height);
    const stage = view.closest('#stage') ?? view;
    const window = view.ownerDocument.defaultView;
    function position() {
      const box = stage.getBoundingClientRect();
      place(shell, box.left, box.top, 780, 680);
    }
    window.addEventListener('resize', position, { signal: scope });
    window.addEventListener('scroll', position, { capture: true, signal: scope });
    position();

    sprite(panel, manifest.plate);
    const rows = add(panel, 'div', 'rows');
    rows.setAttribute('role', 'group');
    rows.setAttribute('aria-label', '持有道具');
    const detail = add(panel, 'div', 'detail');
    const icon = add(detail, 'div');
    const fields = {};
    for (const key of ['name', 'count', 'duration', 'caption', 'page']) {
      const field = add(key === 'page' ? panel : detail, 'span', key, 'lobby-item-label');
      place(field, ...manifest.labels[key]);
      fields[key] = field;
    }
    const closeButton = artButton(panel, 'close', '關閉道具', manifest.controls.close);
    const use = artButton(panel, 'use', '使用', manifest.controls.use);
    const prev = artButton(panel, 'prev', '上一頁', manifest.controls.back);
    const next = artButton(panel, 'next', '下一頁', manifest.controls.next);
    let selected = null;
    let snapshot = session?.readAvatarItems?.() ?? empty;
    let groups = groupItems(snapshot, manifest.items);
    let cooldown = 0;
    let pointerUsed = false;
    const instance = { shell, panel, controller, opening, x, start, refreshSelection };
    current = instance;

    function canUse(group) {
      return !!onUse && snapshot.status === 'ready' && group?.row.state === 0 &&
        !saved.unconfirmed.has(group.row.inventoryId) && session?.canUseLobbyAvatarItem?.(group.row.inventoryId) === true;
    }

    function refreshSelection() {
      const group = groups.get(selected);
      const uncertain = !!group && saved.unconfirmed.has(group.row.inventoryId);
      panel.dataset.useState = using ? 'using' : uncertain ? 'uncertain' : 'idle';
      for (const button of rows.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.itemId) === selected));
      }
      detail.hidden = !group;
      if (group) detail.dataset.itemId = String(selected);
      else delete detail.dataset.itemId;
      icon.replaceChildren();
      fields.name.textContent = group?.definition.name ?? '';
      fields.count.textContent = group ? String(group.count) : '';
      fields.duration.textContent = group ? manifest.wording.duration : '';
      fields.caption.textContent = group?.definition.caption ?? '';
      sprite(icon, group?.definition.icon, { anchor: manifest.iconAnchors.detail });
      use.hidden = !group;
      const available = canUse(group);
      use.dataset.available = String(available);
      use.disabled = panel.dataset.state !== 'open' || using || !available || performance.now() - saved.lastUseAt < 2000;
      use.setAttribute('aria-busy', String(using));
    }

    function paint() {
      panel.dataset.status = snapshot.status;
      const items = [...groups];
      const pageCount = Math.ceil(items.length / maxRows);
      if (pageCount > 0 || snapshot.status === 'ready') saved.page = Math.min(saved.page, Math.max(0, pageCount - 1));
      const focused = rows.contains(view.ownerDocument.activeElement) ? view.ownerDocument.activeElement.dataset.itemId : undefined;
      rows.replaceChildren();
      let focusedRow;
      for (const [index, [itemId, group]] of items.slice(saved.page * maxRows, (saved.page + 1) * maxRows).entries()) {
        const [hitX, hitY] = manifest.row.hit;
        const button = artButton(rows, null, `${group.definition.name} x${group.count}`, manifest.row, listX, listY + step * index);
        const id = String(itemId);
        button.dataset.itemId = id;
        button.dataset.inventoryId = String(group.row.inventoryId);
        button.dataset.count = String(group.count);
        sprite(button, group.definition.icon, { anchor: manifest.iconAnchors.row, dx: -hitX, dy: -hitY });
        const quantity = add(button, 'span', null, 'lobby-item-label lobby-item-row-count');
        const [countX, countY, countWidth, countHeight] = manifest.labels.rowCount;
        place(quantity, countX - hitX, countY - hitY, countWidth, countHeight);
        quantity.textContent = `x${group.count}`;
        button.addEventListener('click', () => {
          onRowClick?.();
          selected = itemId;
          refreshSelection();
        });
        if (id === focused) focusedRow = button;
      }
      if (focused) (focusedRow ?? closeButton).focus({ preventScroll: true });
      if (!groups.has(selected)) selected = null;
      prev.hidden = next.hidden = pageCount <= 1;
      fields.page.textContent = pageCount > 1 ? `${saved.page + 1}/${pageCount}` : '';
      refreshSelection();
    }

    function changePage(delta) {
      const pages = Math.ceil(groups.size / maxRows);
      if (pages <= 1) return;
      saved.page = (saved.page + delta + pages) % pages;
      paint();
    }

    function releaseCooldown() {
      clearTimeout(cooldown);
      const remaining = 2000 - (performance.now() - saved.lastUseAt);
      if (remaining > 0) cooldown = setTimeout(refreshSelection, remaining);
    }

    async function useItem(event) {
      const group = groups.get(selected);
      const byPointer = event.detail > 0;
      if (use.disabled || using || !canUse(group) || (byPointer && pointerUsed)) return;
      if (byPointer) pointerUsed = true;
      const { row } = group;
      saved.lastUseAt = performance.now();
      using = true;
      refreshSelection();
      releaseCooldown();
      try {
        const proof = await onUse(row, { signal: lifetime.signal });
        if (!lifetime.signal.aborted && (proof?.inventoryId !== row.inventoryId || proof.itemId !== row.itemId)) {
          saved.unconfirmed.add(row.inventoryId);
        }
      } catch (error) {
        if (error?.kind === 'lobby-item-uncertain') saved.unconfirmed.add(row.inventoryId);
      } finally {
        using = false;
        current?.refreshSelection();
      }
    }

    const listen = (node, event, handler) => node.addEventListener(event, handler, { signal: scope });
    listen(closeButton, 'click', () => { void close(); });
    listen(use, 'click', event => { void useItem(event); });
    listen(use, 'pointerleave', () => { pointerUsed = false; });
    listen(prev, 'click', () => changePage(-1));
    listen(next, 'click', () => changePage(1));
    listen(shell, 'cancel', event => {
      event.preventDefault();
      void close();
    });
    scope.addEventListener('abort', () => clearTimeout(cooldown), { once: true });
    paint();
    releaseCooldown();
    session?.subscribeAvatarItems?.(nextSnapshot => {
      snapshot = nextSnapshot;
      groups = groupItems(snapshot, manifest.items);
      paint();
    }, { signal: scope });
    shell.showModal();
    trigger?.setAttribute('aria-expanded', 'true');
    onOpen?.();
    if (!await slide(panel, start, 0, openMs, time => 1 - (1 - time) ** 2, opening.signal)) return false;
    panel.dataset.state = 'open';
    refreshSelection();
    closeButton.focus({ preventScroll: true });
    return true;
  }

  trigger?.setAttribute('aria-haspopup', 'dialog');
  trigger?.setAttribute('aria-expanded', 'false');
  trigger?.addEventListener('click', () => { void open(); }, { signal: lifetime.signal });
  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort', dispose, { once: true });
  return { open, close, isOpen, dispose };
}
