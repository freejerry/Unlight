import { mountAvatarLayer } from './avatar-layer.js';
import { playBackClick } from './bgm.js';
import { formatPartDuration, loadItemInventoryData, projectMainItemInventory } from './item-inventory-data.js';

const art = new URL('./lobby-main-item-art/', import.meta.url);
const categoryLabels = { items: '道具', body: '身體', clothes: '服飾', accessories: '裝飾品' };
const actionLabels = { use: '使用', remove: '卸下', drop: '丟棄', sell: '出售' };
const detailPositions = {
  name: [106, 424, 200, 30], count: [-10, 526, 135, 30], duration: [-10, 462, 135, 30],
  timing: [-10, 494, 135, 30], caption: [145, 463, 165, 100],
};
const empty = { status: 'unknown', rows: [] };

function add(parent, tag, id, className) {
  const node = parent.ownerDocument.createElement(tag);
  if (id) node.id = `lobby-main-item-${id}`;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function place(node, x, y, width, height) {
  Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
}

function sourceURL(layer) {
  return layer.url ?? new URL(layer.file, art).href;
}

function sprite(parent, layer, { skin, dx = 0, dy = 0, scale = 1 } = {}) {
  if (!layer) return null;
  const { atlas } = layer;
  const image = add(parent, atlas ? 'span' : 'img', null, 'lobby-main-item-art');
  const url = sourceURL(layer);
  if (atlas) {
    const sx = layer.width * scale / atlas.width;
    const sy = layer.height * scale / atlas.height;
    image.setAttribute('aria-hidden', 'true');
    image.dataset.atlasSource = url;
    image.style.backgroundImage = `url("${url}")`;
    image.style.backgroundSize = `${atlas.sheetWidth * sx}px ${atlas.sheetHeight * sy}px`;
    image.style.backgroundPosition = `${-atlas.x * sx}px ${-atlas.y * sy}px`;
    image.style.backgroundRepeat = 'no-repeat';
  } else {
    image.alt = '';
    image.draggable = false;
    image.src = url;
  }
  if (skin) image.dataset.skin = skin;
  place(image, dx + layer.x * scale, dy + layer.y * scale, layer.width * scale, layer.height * scale);
  return image;
}

function artButton(parent, id, label, source, dx = 0, dy = 0) {
  const [x, y, width, height] = source.hit;
  const button = add(parent, 'button', id, 'lobby-main-item-button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  place(button, dx + x, dy + y, width, height);
  const skins = {};
  for (const skin of ['up', 'over', 'down', 'selected']) {
    skins[skin] = sprite(button, source[skin], { skin, dx: -x, dy: -y });
  }
  return { button, skins };
}

function animateTabHover(button, image, hover, signal) {
  if (!image || !hover?.frames.length) return;
  let frame;
  let last;
  function draw(index) {
    if (index === last) return;
    last = index;
    image.src = sourceURL(hover.frames[index]);
  }
  function stop() {
    cancelAnimationFrame(frame);
    draw(0);
  }
  function play() {
    if (button.getAttribute('aria-pressed') === 'true') return;
    stop();
    if (button.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    function step(now) {
      const index = Math.min(hover.frames.length - 1, Math.floor((now - start) / hover.frameMs));
      draw(index);
      if (index < hover.frames.length - 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
  }
  button.addEventListener('pointerenter', play, { signal });
  button.addEventListener('pointerleave', stop, { signal });
  button.addEventListener('click', stop, { signal });
  signal.addEventListener('abort', stop, { once: true });
}

async function loadArt(signal) {
  const response = await fetch(new URL('index.json', art), {
    redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) throw new Error('ItemView art unavailable');
  return response.json();
}

async function preloadStageArt(view, manifest, images, signal) {
  function addImage(url, image) {
    if (images.has(url)) return;
    if (!image) {
      image = new Image();
      image.src = url;
    }
    images.set(url, image);
  }
  for (const image of view.querySelectorAll('.lobby-main-item-art')) {
    if (image.dataset.atlasSource) addImage(image.dataset.atlasSource);
    else addImage(image.src, image);
  }
  for (const tab of manifest.inner.tabs) {
    for (const layer of tab.hover.frames) addImage(sourceURL(layer));
  }
  const scope = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  scope.throwIfAborted();
  let cancel;
  const interrupted = new Promise((resolve, reject) => {
    cancel = () => reject(scope.reason);
    scope.addEventListener('abort', cancel, { once: true });
  });
  try {
    await Promise.race([Promise.all([...images.values()].map(image => image.decode())), interrupted]);
  } finally {
    scope.removeEventListener('abort', cancel);
  }
}

export function mountLobbyMainItem(host, { session, signal, onBack } = {}) {
  const scope = new AbortController();
  const lifetime = scope.signal;
  const images = new Map();
  const view = add(host, 'section', 'view');
  view.dataset.state = 'loading';
  view.setAttribute('aria-labelledby', 'lobby-main-item-title');
  const chrome = add(view, 'div', 'chrome');
  const avatar = add(view, 'div', null, 'avatar-layer');
  const heading = add(view, 'h1', 'title');
  heading.tabIndex = -1;
  heading.textContent = 'ItemList';
  const subtitle = add(view, 'p', 'subtitle');
  subtitle.textContent = '所持品訊息';
  const error = add(view, 'p', 'error');
  error.hidden = true;
  error.setAttribute('role', 'status');
  const up = { url: new URL('./option-art/back.png', import.meta.url).href, x: 712, y: 0, width: 48, height: 32 };
  const over = { ...up, url: new URL('./option-art/back-over.png', import.meta.url).href };
  const { button: back } = artButton(view, 'back', '返回大廳', { hit: [712, 0, 48, 32], up, over, down: over });
  let durationTimer;
  let leaving = false;

  function dispose() {
    if (lifetime.aborted) return;
    scope.abort();
    clearInterval(durationTimer);
    images.clear();
    signal?.removeEventListener('abort', dispose);
    view.remove();
  }
  function listen(element, event, handler) {
    element.addEventListener(event, handler, { signal: lifetime });
  }
  listen(back, 'click', () => {
    if (leaving || lifetime.aborted || !onBack) return;
    leaving = true;
    playBackClick();
    onBack();
  });
  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort', dispose, { once: true });

  async function initialize() {
    if (lifetime.aborted) return false;
    try {
      const avatarReady = mountAvatarLayer(avatar, { session, signal: lifetime, idPrefix: 'lobby-main-item' });
      const [manifest, metadata] = await Promise.all([loadArt(lifetime), loadItemInventoryData(lifetime), avatarReady.catch(() => {})]);
      if (lifetime.aborted) return false;
      build(manifest, metadata);
      await preloadStageArt(view, manifest, images, lifetime);
      if (lifetime.aborted) return false;
      view.dataset.state = 'ready';
      return true;
    } catch {
      if (!lifetime.aborted) {
        view.dataset.state = 'unavailable';
        error.textContent = '無法載入所持品資料。';
        error.hidden = false;
      }
      return false;
    }
  }

  function build(manifest, metadata) {
    const { grid, tile, inner } = manifest;
    const pageSize = grid.columns * grid.rows;
    const categories = Object.fromEntries(manifest.outerTabs.map(({ key }) => [key, { inner: 0, pages: [], selected: null }]));
    let category = 'items';
    let inventory;
    let itemsSnapshot = session?.readAvatarItems?.() ?? empty;
    let partsSnapshot = session?.readAvatarParts?.() ?? empty;

    sprite(chrome, manifest.background);
    sprite(chrome, {
      url: new URL('./lobby-art/header.png', import.meta.url).href,
      x: 0, y: 0, width: 760, height: 32,
    });
    if (manifest.backgroundRect) {
      const { x, y, width, height, color } = manifest.backgroundRect;
      const fill = add(chrome, 'div', 'capacity-extension');
      fill.setAttribute('aria-hidden', 'true');
      fill.style.backgroundColor = color;
      place(fill, x, y, width, height);
    }
    sprite(chrome, manifest.capacityPlate);
    sprite(chrome, inner.panel);
    const outerButtons = new Map();
    for (const tab of manifest.outerTabs) {
      const { button } = artButton(chrome, `tab-${tab.key}`, categoryLabels[tab.key], tab);
      outerButtons.set(tab.key, button);
      listen(button, 'click', () => {
        if (leaving || category === tab.key) return;
        playBackClick();
        category = tab.key;
        render();
      });
    }

    const innerButtons = inner.tabs.map((tab, index) => {
      const { button, skins } = artButton(chrome, `inner-tab-${index}`, '', tab);
      const label = add(button, 'span', null, 'lobby-main-item-inner-label');
      const [x, y, width, height] = tab.label;
      place(label, x - tab.hit[0], y - tab.hit[1], width, height);
      animateTabHover(button, skins.over, tab.hover, lifetime);
      listen(button, 'click', () => {
        const pane = categories[category];
        if (leaving || button.hidden || pane.inner === index) return;
        pane.inner = index;
        pane.selected = null;
        render();
      });
      return { button, label };
    });

    const rows = add(chrome, 'div', 'rows');
    rows.setAttribute('role', 'group');
    rows.setAttribute('aria-label', '所持品');
    listen(rows, 'click', event => {
      const button = event.target.closest('.lobby-main-item-tile');
      if (leaving || !button || !rows.contains(button)) return;
      playBackClick();
      const pane = categories[category];
      pane.selected = Number(button.dataset.groupId);
      paintSelection(currentGroups(pane));
    });
    const page = add(chrome, 'span', 'page');
    place(page, ...manifest.page);
    const capacity = add(chrome, 'span', 'capacity');
    place(capacity, ...manifest.capacity);
    const first = artButton(chrome, 'first', '第一頁', inner.pager.first).button;
    const previous = artButton(chrome, 'prev', '上一頁', inner.pager.previous).button;
    const next = artButton(chrome, 'next', '下一頁', inner.pager.next).button;
    const last = artButton(chrome, 'last', '最後一頁', inner.pager.last).button;
    const pagers = [first, previous, next, last];
    listen(first, 'click', () => changePage(() => 0));
    listen(previous, 'click', () => changePage((current, count) => (current + count - 1) % count));
    listen(next, 'click', () => changePage((current, count) => (current + 1) % count));
    listen(last, 'click', () => changePage((current, count) => count - 1));

    const details = add(chrome, 'section', 'detail');
    const selectedIcon = add(details, 'div', 'detail-icon');
    const fields = {};
    for (const [key, bounds] of Object.entries(detailPositions)) {
      const field = add(details, 'span', key, 'lobby-main-item-detail-field');
      place(field, ...bounds);
      fields[key] = field;
    }
    const actions = {};
    for (const [key, label] of Object.entries(actionLabels)) {
      const { button } = artButton(chrome, key, label, inner.actions[key]);
      button.disabled = true;
      actions[key] = button;
    }

    function currentGroups(pane) {
      const kind = metadata.tabs[category][pane.inner].kind;
      return (category === 'items' ? inventory.items[kind] : inventory.parts[kind]) ?? [];
    }

    function changePage(projection) {
      const pane = categories[category];
      const count = Math.ceil(currentGroups(pane).length / pageSize);
      if (leaving || count < 2) return;
      pane.pages[pane.inner] = projection(pane.pages[pane.inner] ?? 0, count);
      render();
    }

    function paintSelection(groups) {
      const pane = categories[category];
      const selected = groups.find(group => group.id === pane.selected);
      if (!selected) pane.selected = null;
      details.hidden = !selected;
      delete details.dataset.itemId;
      delete details.dataset.partId;
      delete details.dataset.inventoryId;
      for (const field of Object.values(fields)) field.textContent = '';
      selectedIcon.replaceChildren();
      for (const button of Object.values(actions)) button.hidden = true;
      clearInterval(durationTimer);
      durationTimer = undefined;
      for (const button of rows.children) button.setAttribute('aria-pressed', String(Number(button.dataset.groupId) === pane.selected));
      if (!selected) return;

      const { id, definition, row, count, equipped, activated } = selected;
      const part = category !== 'items';
      details.dataset[part ? 'partId' : 'itemId'] = String(id);
      details.dataset.inventoryId = String(row.inventoryId);
      fields.name.textContent = definition.name;
      fields.count.textContent = String(count);
      fields.timing.textContent = '-';
      fields.caption.textContent = definition.caption;
      const paintDuration = () => { fields.duration.textContent = part ? formatPartDuration(definition, row) : '-'; };
      paintDuration();
      if (part && activated) durationTimer = setInterval(paintDuration, 1000);
      sprite(selectedIcon, definition.icon, part ? { dx: 328, dy: 436, scale: .5 } : { dx: 384, dy: 480 });

      if (!part) {
        actions.use.hidden = definition.kind !== 0;
        return;
      }
      const { count: partCount, capacity: max } = inventory.partCapacity;
      const overCapacity = Number.isInteger(partCount) && Number.isInteger(max) && partCount > max;
      actions.use.hidden = equipped;
      actions.remove.hidden = category === 'body' || !equipped;
      actions.drop.hidden = !overCapacity || (category === 'body' && (equipped || groups.reduce((n, group) => n + group.ownedCount, 0) <= 1));
    }

    function render() {
      const pane = categories[category];
      const groups = currentGroups(pane);
      const tabDefinitions = metadata.tabs[category];
      const tab = tabDefinitions[pane.inner];
      const part = category !== 'items';
      const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
      const index = Math.min(pane.pages[pane.inner] ?? 0, pageCount - 1);
      pane.pages[pane.inner] = index;
      view.dataset.category = category;
      view.dataset.innerTab = String(pane.inner);
      view.dataset.kind = String(tab.kind);
      view.dataset.inventoryStatus = part ? inventory.partsStatus : inventory.itemsStatus;
      for (const [key, button] of outerButtons) button.setAttribute('aria-pressed', String(key === category));
      for (const [tabIndex, { button, label }] of innerButtons.entries()) {
        const definition = tabDefinitions[tabIndex];
        button.hidden = !definition;
        button.setAttribute('aria-pressed', String(tabIndex === pane.inner));
        if (!definition) continue;
        label.textContent = definition.label;
        button.setAttribute('aria-label', definition.label);
        button.dataset.kind = String(definition.kind);
      }

      const focused = view.ownerDocument.activeElement;
      const prior = rows.contains(focused) ? focused.dataset.groupId : null;
      rows.replaceChildren();
      groups.slice(index * pageSize, (index + 1) * pageSize).forEach((group, slot) => {
        const x = grid.x + slot % grid.columns * grid.stepX;
        const y = grid.y + Math.floor(slot / grid.columns) * grid.stepY;
        const { button } = artButton(rows, null, `${group.definition.name} x${group.count}`, tile, x, y);
        button.classList.add('lobby-main-item-tile');
        Object.assign(button.dataset, {
          groupId: String(group.id), inventoryId: String(group.row.inventoryId), count: String(group.count),
          ownedCount: String(group.ownedCount ?? group.count), [part ? 'partId' : 'itemId']: String(group.id),
        });
        if (part) button.dataset.equipped = String(group.equipped);
        const [hitX, hitY] = tile.hit;
        if (group.equipped) sprite(button, tile.equip, { dx: -hitX, dy: -hitY });
        const xy = part ? 12 : 44;
        sprite(button, group.definition.icon, { dx: xy - hitX, dy: xy - hitY, scale: .5 });
        const amount = add(button, 'span', null, 'lobby-main-item-tile-count');
        place(amount, 7 - hitX, 72 - hitY, 80, 30);
        amount.textContent = `x${group.count}`;
        if (prior === button.dataset.groupId) button.focus({ preventScroll: true });
      });
      if (prior && !rows.contains(view.ownerDocument.activeElement)) innerButtons[pane.inner].button.focus({ preventScroll: true });
      for (const control of pagers) control.hidden = pageCount < 2;
      page.textContent = pageCount > 1 ? `${index + 1}/${pageCount}` : '';
      const { count, capacity: max } = inventory.partCapacity;
      capacity.textContent = Number.isInteger(count) && Number.isInteger(max) ? `${count}/${max}` : '';
      capacity.classList.toggle('lobby-main-item-over-capacity', Number.isInteger(count) && Number.isInteger(max) && count > max);
      paintSelection(groups);
    }

    function update() {
      inventory = projectMainItemInventory({ itemsSnapshot, partsSnapshot, metadata });
      render();
    }
    update();
    session?.subscribeAvatarItems?.(snapshot => {
      if (snapshot === itemsSnapshot) return;
      itemsSnapshot = snapshot;
      update();
    }, { signal: lifetime });
    session?.subscribeAvatarParts?.(snapshot => {
      if (snapshot === partsSnapshot) return;
      partsSnapshot = snapshot;
      update();
    }, { signal: lifetime });
  }

  return { dispose, ready: initialize() };
}
