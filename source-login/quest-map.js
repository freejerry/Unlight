import { mountAvatarLayer } from './avatar-layer.js';
import { playBackClick } from './bgm.js';
import { getPreferences } from './preferences.js';
import {
  DEFAULT_QUEST_SEARCH_TIME, QUEST_SEARCH_TIMES, ordinaryQuestProgressMap, ordinaryQuestRegions,
  tutorialQuestProgressMap, tutorialQuestRegion,
} from './quest-preview-data.js';

const art = '/source-login/quest-art/';
const rowStatus = ['new', '', 'active', '', 'wait', '', 'present'];
const rowStatusNames = ['新任務', '未完成', '進行中', '已完成', '搜尋中', '失敗', '受贈'];
const rowKind = ['adventure', 'treasure', 'boss'];
const pageSize = 10;
const pickerPositions = [[64, 128], [144, 128], [224, 128], [304, 128], [64, 208], [144, 208]];

const layout = `
  <section id="quest-map-view" class="source-quest-map" aria-labelledby="quest-map-title">
    <h1 id="quest-map-title" class="sr-only">任務地圖</h1>
    <div id="quest-map-world" class="quest-map-world" hidden>
      <div class="quest-map-world-art"></div>
      <div id="quest-map-progress" hidden>
        <progress aria-label="當前攻略地區的任務完成度"></progress>
        <span aria-hidden="true"></span>
      </div>
    </div>
    <img class="quest-map-frame" src="${art}quest-base.png" width="760" height="680" alt="">
    <button id="quest-map-region-open" class="quest-map-art-button" type="button" aria-label="選擇地圖" aria-haspopup="dialog" aria-controls="quest-map-region-picker">
      <img src="${art}quest-select-map-up.png" width="56" height="56" alt="">
      <img class="quest-map-art-over" src="${art}quest-select-map-over.png" width="56" height="56" alt="">
    </button>
    <img class="quest-map-deck-back-art" src="${art}quest-deck-back-up.png" width="16" height="24" alt="">
    <img class="quest-map-deck-next-art" src="${art}quest-deck-next-up.png" width="16" height="24" alt="">
    <div class="avatar-layer"></div>
    <section class="quest-map-list" aria-label="目前持有的任務">
      <img class="quest-map-list-art" alt="" hidden>
      <ol id="quest-map-inventory"></ol>
      <span id="quest-map-capacity"></span>
      <div class="quest-map-pages" hidden>
        <button class="quest-map-page-prev" type="button" aria-label="上一頁"></button>
        <output id="quest-map-list-page" aria-live="polite"></output>
        <button class="quest-map-page-next" type="button" aria-label="下一頁"></button>
      </div>
    </section>
    <section id="quest-map-deck" aria-label="在任務中使用的牌組">
      <img class="quest-map-deck-case" src="${art}quest-deck-case.png" width="329" height="156" alt="">
      <span id="quest-map-deck-name"></span>
      <ol id="quest-map-deck-cards"></ol>
    </section>
    <img class="quest-map-item-art" src="/source-login/lobby-art/hover/item-up.png" width="48" height="32" alt="">
    <p id="quest-map-status" role="status" hidden></p>
    <button id="quest-map-back" type="button" aria-label="返回大廳">
      <img src="/source-login/option-art/back.png" width="48" height="32" alt="">
      <img class="quest-map-back-over" src="/source-login/option-art/back-over.png" width="48" height="32" alt="">
    </button>
    <dialog id="quest-map-region-picker" class="quest-map-dialog" aria-labelledby="quest-map-region-title">
      <h2 id="quest-map-region-title" class="sr-only">選擇地圖</h2>
      <img src="${art}quest-picker-plate.png" width="384" height="384" alt="">
      <button id="quest-map-region-close" class="quest-map-art-button" type="button" aria-label="關閉地圖選單" autofocus>
        <img src="${art}quest-picker-close-up.png" width="24" height="24" alt="">
        <img class="quest-map-art-over" src="${art}quest-picker-close-over.png" width="24" height="24" alt="">
      </button>
      <div class="quest-map-region-options"></div>
    </dialog>
    <dialog id="quest-map-search-preview" class="quest-map-dialog" aria-labelledby="quest-map-search-title" aria-describedby="quest-map-search-scope">
      <h2 id="quest-map-search-title" class="sr-only">開始搜索</h2>
      <p id="quest-map-search-scope" class="sr-only">搜尋預覽。可試選時間。</p>
      <img src="${art}quest-search-plate.png" width="368" height="152" alt="">
      <button id="quest-map-search-close" class="quest-map-art-button" type="button" aria-label="關閉搜尋預覽" autofocus>
        <img src="${art}quest-search-close-up.png" width="24" height="24" alt="">
        <img class="quest-map-art-over" src="${art}quest-search-close-over.png" width="24" height="24" alt="">
      </button>
      <p id="quest-map-search-name"></p>
      <img id="quest-map-search-thumbnail" width="88" height="44" alt="" hidden>
      <label class="sr-only" for="quest-map-search-time">決定搜索時的消費時間</label>
      <output id="quest-map-search-time-value" for="quest-map-search-time" aria-hidden="true"></output>
      <span class="quest-map-search-ticks" aria-hidden="true"></span>
      <input id="quest-map-search-time" type="range" min="0" max="10" step="1">
      <output id="quest-map-search-ap" aria-label="搜尋消耗 AP"></output>
      <button id="quest-map-search-confirm" class="quest-map-art-button" type="button" aria-label="確認搜尋" disabled>
        <img src="${art}quest-search-ok-up.png" width="160" height="40" alt="">
      </button>
    </dialog>
  </section>`;

function place(node, [x, y, width, height]) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  if (width !== undefined) node.style.width = `${width}px`;
  if (height !== undefined) node.style.height = `${height}px`;
}

function image(file, className) {
  const img = document.createElement('img');
  img.className = className;
  img.src = art + file;
  img.alt = '';
  return img;
}

function setupDialog(dialog, view, origin, signal, { slide = false, onDismiss } = {}) {
  const closeButton = dialog.querySelector('button');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sineOut = 'linear(0, .1951, .3827, .5556, .7071, .8315, .9239, .9808, 1)';
  let opener;
  let animation;
  let closing = false;

  function position() {
    if (!dialog.open) return;
    const { left, top } = view.getBoundingClientRect();
    place(dialog, [left + origin[0], top + origin[1]]);
  }

  function animate(from, to) {
    animation?.cancel();
    animation = dialog.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }], {
      duration: 300, easing: sineOut, fill: 'both',
    });
    return animation;
  }

  async function dismiss() {
    if (!dialog.open || closing) return;
    closing = true;
    onDismiss?.();
    if (slide && !reducedMotion.matches) {
      const offset = dialog.getBoundingClientRect().top - Number.parseFloat(dialog.style.top);
      const leaving = animate(offset, -500);
      await leaving.finished.catch(() => {});
      if (signal.aborted) return;
    }
    dialog.close();
    animation?.cancel();
    opener?.focus({ preventScroll: true });
    closing = false;
  }

  closeButton.addEventListener('click', dismiss, { signal });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    void dismiss();
  }, { signal });
  window.addEventListener('resize', position, { signal });
  window.addEventListener('scroll', position, { signal, passive: true });
  signal.addEventListener('abort', () => {
    animation?.cancel();
    dialog.close();
  }, { once: true });

  return {
    show(target) {
      if (dialog.open) return;
      opener = target;
      dialog.showModal();
      position();
      if (slide && !reducedMotion.matches) animate(-500, 0);
      closeButton.focus({ preventScroll: true });
    },
    dismiss,
  };
}

function placeWorldImage(layer, className) {
  const node = image(layer.file, className);
  place(node, [layer.x, layer.y, layer.width, layer.height]);
  node.style.zIndex = String(layer.depth);
  return node;
}

function appendLandmarks(world, { geography, mapIds, type }, signal, openPreview) {
  world.replaceChildren(...geography.layers.map(layer => placeWorldImage(layer, 'quest-map-world-layer')));
  const areas = new Map();
  for (const { id, base, up, over, hit } of geography.landmarks) {
    const unlocked = mapIds.includes(id);
    if (!unlocked && type !== 'tutorial') continue;
    const landmark = document.createElement('div');
    landmark.className = 'quest-map-landmark';
    landmark.append(placeWorldImage(base, 'quest-map-landmark-base'), placeWorldImage(up, 'quest-map-landmark-up'));
    world.append(landmark);
    // MemoryLand's locked ribbons are painted in the original, without interactive hit areas.
    if (!unlocked) continue;
    landmark.append(placeWorldImage(over, 'quest-map-landmark-over'));
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'quest-map-landmark-hit';
    target.dataset.mapId = String(id);
    target.disabled = true;
    target.style.zIndex = String(up.depth);
    target.setAttribute('aria-label', `地圖 ${id}`);
    target.setAttribute('aria-haspopup', 'dialog');
    target.setAttribute('aria-controls', 'quest-map-search-preview');
    target.addEventListener('click', () => openPreview(id, target), { signal });
    place(target, hit);
    landmark.append(target);
    areas.set(id, target);
  }
  return areas;
}

async function getCatalog(path, query, signal) {
  const response = await fetch(query?.size ? `${path}?${query}` : path, {
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) throw new Error('Quest map catalogue unavailable.');
  return response.json();
}

function paintProgress(progress, clearNum, map, position) {
  if (!position || !Number.isInteger(clearNum) || typeof map?.name !== 'string' || !map.name ||
      !Number.isInteger(map.clearTarget) || map.clearTarget <= 0) return;
  const gauge = progress.querySelector('progress');
  const clear = Math.min(clearNum, map.clearTarget);
  gauge.max = map.clearTarget;
  gauge.value = clear;
  progress.querySelector('span').textContent = `${clear}/${map.clearTarget}`;
  place(progress, position);
  progress.hidden = false;
}

function setupSearchPreview(view, thumbnails, signal) {
  const dialog = view.querySelector('#quest-map-search-preview');
  const name = dialog.querySelector('#quest-map-search-name');
  const thumbnail = dialog.querySelector('#quest-map-search-thumbnail');
  const slider = dialog.querySelector('#quest-map-search-time');
  const time = dialog.querySelector('#quest-map-search-time-value');
  const ap = dialog.querySelector('#quest-map-search-ap');
  const panel = setupDialog(dialog, view, [270, 280], signal, { onDismiss: playBackClick });

  function showTime() {
    const { index, label, seconds } = QUEST_SEARCH_TIMES[slider.valueAsNumber];
    time.textContent = label;
    time.dataset.seconds = String(seconds);
    slider.setAttribute('aria-valuetext', label);
    slider.style.setProperty('--quest-time-complete', `${100 * index / slider.max}%`);
  }

  slider.valueAsNumber = DEFAULT_QUEST_SEARCH_TIME;
  slider.addEventListener('input', showTime, { signal });
  showTime();

  return (map, opener) => {
    dialog.dataset.mapId = String(map.id);
    name.textContent = map.name;
    ap.textContent = map.ap > 0 ? String(map.ap) : '';
    ap.setAttribute('aria-label', `搜尋消耗 ${map.ap} AP`);
    const file = thumbnails[map.id];
    if (file) thumbnail.src = art + file;
    else thumbnail.removeAttribute('src');
    thumbnail.hidden = !file;
    panel.show(opener);
  };
}

function addPickerButton(options, region, slot, type, signal, choose) {
  const button = document.createElement('button');
  const tutorial = type === 'tutorial';
  const page = tutorial ? 'tutorial' : String(region.index + 1);
  const stem = tutorial ? 'tutorial' : `normal-${page}`;
  const name = region.geography?.name ?? (tutorial ? 'MemoryLand' : `區域 ${page}`);
  const [x, y] = tutorial ? [304, 208] : pickerPositions[slot];
  button.className = 'quest-map-art-button quest-map-region-option';
  button.type = 'button';
  button.dataset.regionPage = page;
  button.dataset.regionType = type;
  button.disabled = !region.geography || !region.mapIds.length;
  button.setAttribute('aria-label', name);
  place(button, [x - 32 + 12, y - 64 + 8, 56, 60]);
  button.append(image(`quest-picker-${stem}-up.png`, ''), image(`quest-picker-${stem}-over.png`, 'quest-map-art-over'));
  button.addEventListener('click', () => choose(region), { signal });
  options.append(button);
  return button;
}

function addWorldArrow(world, direction, states, signal, choose) {
  if (!states) return null;
  const { up, over, hit } = states;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = `quest-map-region-${direction}`;
  button.className = 'quest-map-art-button quest-map-world-arrow';
  button.setAttribute('aria-label', direction === 'previous' ? '上一個地圖區域' : '下一個地圖區域');
  button.style.zIndex = String(up.depth);
  place(button, hit);
  for (const [layer, className] of [[up, ''], [over, 'quest-map-art-over']]) {
    const visual = image(layer.file, className);
    place(visual, [layer.x - hit[0], layer.y - hit[1], layer.width, layer.height]);
    button.append(visual);
  }
  button.addEventListener('click', choose, { signal });
  world.append(button);
  return button;
}

async function mountQuestRegions(view, snapshot, signal) {
  const get = selector => view.querySelector(selector);
  const world = get('#quest-map-world');
  const worldArt = world.querySelector('.quest-map-world-art');
  const progress = get('#quest-map-progress');
  const status = get('#quest-map-status');
  const opener = get('#quest-map-region-open');
  const picker = get('#quest-map-region-picker');
  const options = picker.querySelector('.quest-map-region-options');
  const loadedMaps = new Map();
  let activeRegion;
  let arrows = {};
  view.dataset.state = 'loading';
  opener.disabled = true;

  function updateState(value, message = '') {
    view.dataset.state = value;
    status.textContent = message;
    status.hidden = !message;
  }

  function readMap(id) {
    if (!loadedMaps.has(id)) {
      loadedMaps.set(id, getCatalog('/api/quest-catalog', new URLSearchParams({ map: id }), signal)
        .then(({ map }) => {
          if (map?.id !== id || typeof map.name !== 'string' || !map.name || !Number.isInteger(map.ap) || map.ap < 0) {
            throw new Error('Invalid quest map metadata.');
          }
          return map;
        }).catch(() => {
          loadedMaps.delete(id);
          return null;
        }));
    }
    return loadedMaps.get(id);
  }

  let geography;
  try {
    geography = await getCatalog(`${art}worlds.json`, null, signal);
    if (!Array.isArray(geography?.normal)) throw new Error('Invalid quest world asset manifest.');
  } catch {
    if (!signal.aborted) updateState('partial', '無法讀取地圖素材。');
    return;
  }
  if (signal.aborted) return;

  const normal = ordinaryQuestRegions(snapshot.questFlag).map(region => ({
    ...region, type: 'normal', geography: geography.normal.find(page => page.index === region.index),
  }));
  const tutorial = { ...tutorialQuestRegion(snapshot.tutorialQuestFlag), type: 'tutorial', geography: geography.tutorial };
  tutorial.mapIds ??= [];

  const pickerPanel = setupDialog(picker, view, [32, 64], signal, { slide: true });
  const openPreview = setupSearchPreview(view, geography.searchThumbnails ?? {}, signal);
  opener.addEventListener('click', () => pickerPanel.show(opener), { signal });
  opener.disabled = false;

  const menu = new Map();
  function pick(region) {
    if (region !== activeRegion) void showRegion(region);
    void pickerPanel.dismiss();
  }
  for (const region of normal) menu.set(region, addPickerButton(options, region, region.index, 'normal', signal, pick));
  menu.set(tutorial, addPickerButton(options, tutorial, 0, 'tutorial', signal, pick));

  function changeRegion(region, direction) {
    void showRegion(region);
    (arrows[direction] ?? opener).focus({ preventScroll: true });
  }

  async function showRegion(region) {
    activeRegion = region;
    const selection = menu.get(region);
    for (const button of menu.values()) button.removeAttribute('aria-current');
    selection?.setAttribute('aria-current', 'true');
    world.hidden = true;
    progress.hidden = true;
    arrows = {};
    if (!region?.geography || !region.mapIds.length) {
      delete view.dataset.mapId;
      delete view.dataset.regionPage;
      delete view.dataset.mapType;
      updateState('unsupported', '這個區域的地圖尚未開放檢視。');
      return;
    }
    const { geography: artPage, index, mapIds, type } = region;
    view.dataset.mapId = String(mapIds.at(-1));
    view.dataset.regionPage = selection.dataset.regionPage;
    view.dataset.mapType = type;
    updateState('loading');

    const areas = appendLandmarks(worldArt, region, signal, async (id, target) => {
      const map = await readMap(id);
      if (map && activeRegion === region && !signal.aborted) openPreview(map, target);
    });
    if (type === 'normal') {
      const previous = normal[index - 1];
      const next = normal[index + 1];
      if (previous?.geography) arrows.previous = addWorldArrow(worldArt, 'previous', artPage.previous, signal,
        () => changeRegion(previous, 'previous'));
      if (next?.geography) arrows.next = addWorldArrow(worldArt, 'next', artPage.next, signal,
        () => changeRegion(next, 'next'));
    }
    world.hidden = false;

    const progressId = type === 'tutorial' ? tutorialQuestProgressMap(snapshot.tutorialQuestFlag)
      : ordinaryQuestProgressMap(snapshot.questFlag);
    const count = type === 'tutorial' ? snapshot.tutorialQuestClearNum : snapshot.questClearNum;
    const mapped = await Promise.all(Array.from(areas, async ([id, button]) => {
      const map = await readMap(id);
      if (signal.aborted || activeRegion !== region) return false;
      if (!map) return false;
      button.setAttribute('aria-label', map.name);
      button.disabled = false;
      if (id === progressId) {
        const marker = artPage.landmarks.find(entry => entry.id === id);
        paintProgress(progress, count, map, marker.progress);
      }
      return true;
    }));
    if (signal.aborted || activeRegion !== region) return;
    if (!mapped.length || mapped.some(valid => !valid)) updateState('partial', '無法讀取部分地圖資料。');
    else updateState('ready');
  }

  await showRegion(normal.at(-1));
}

function formatTimer(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  const pad = number => String(number).padStart(2, '0');
  const minutes = pad(Math.floor(seconds / 60) % 60);
  const hours = pad(Math.floor(seconds / 3600) % 24);
  if (seconds >= 86400) return `[${Math.floor(seconds / 86400)}d${hours}h${minutes}m]`;
  return `[${seconds >= 3600 ? `${hours}:` : ''}${minutes}:${pad(seconds % 60)}]`;
}

function rowText(row, className, value) {
  const label = document.createElement('span');
  label.className = className;
  label.textContent = value;
  row.append(label);
  return label;
}

function createQuestRow(item, definitions, receiptTime, timers, showHelp) {
  const row = document.createElement('li');
  row.dataset.inventoryId = String(item.inventoryId);
  row.dataset.questId = String(item.questId);
  row.dataset.questStatus = String(item.status);
  const status = rowStatus[item.status];
  if (status) row.append(image(`quest-row-state-${status}.png`, 'quest-map-row-state'));
  rowText(row, 'sr-only', rowStatusNames[item.status] ?? '');

  const definition = definitions.get(item.questId);
  const kind = rowKind[definition?.kind];
  if (kind) row.append(image(`quest-row-kind-${kind}.png`, 'quest-map-row-kind'));
  const undiscovered = item.questId === 0;
  if (undiscovered || Number.isInteger(definition?.difficulty)) {
    rowText(row, 'quest-map-row-level', undiscovered ? 'Lv ?' : `Lv ${definition.difficulty}`);
  }
  const name = definition?.name || (undiscovered ? '' : `任務 ${item.questId}`);
  if (name) rowText(row, 'quest-map-row-name', name);
  if (undiscovered || Number.isInteger(definition?.rarity)) {
    row.append(image('quest-row-rarity.png', 'quest-map-row-rarity-art'));
    rowText(row, 'quest-map-row-rarity', undiscovered ? '?' : String(definition.rarity));
  }
  if (undiscovered || Number.isInteger(definition?.ap)) {
    row.append(image('quest-row-ap.png', 'quest-map-row-ap-art'));
    rowText(row, 'quest-map-row-ap', undiscovered ? '?' : `x${definition.ap}`);
  }
  if (showHelp && definition && (definition.caption || name)) {
    const tooltip = rowText(row, 'quest-map-row-tooltip', definition?.caption || name);
    tooltip.id = `quest-map-row-help-${item.inventoryId}`;
    tooltip.setAttribute('role', 'tooltip');
    row.setAttribute('aria-describedby', tooltip.id);
    row.tabIndex = 0;
  }
  if (item.status === 4 && Number.isInteger(item.findSeconds) && Number.isFinite(item.receivedAt ?? receiptTime)) {
    const remaining = rowText(row, 'quest-map-row-timer', '');
    remaining.setAttribute('role', 'timer');
    remaining.setAttribute('aria-live', 'off');
    timers.push({ remaining, expiry: (item.receivedAt ?? receiptTime) + Math.max(0, item.findSeconds) * 1000 });
  }
  return row;
}

async function paintDeck(view, selected, signal) {
  if (!selected) return;
  const deck = view.querySelector('#quest-map-deck');
  deck.dataset.deckIndex = String(selected.index);
  deck.querySelector('#quest-map-deck-name').textContent = `${selected.index}. ${selected.name}`;

  const entries = selected.cards.filter(({ position }) => position >= 0 && position < 3);
  if (!entries.length) return;
  const cards = deck.querySelector('#quest-map-deck-cards');
  const slots = new Map();
  for (const { cardId, inventoryId, position } of entries) {
    const slot = document.createElement('li');
    slot.dataset.cardId = String(cardId);
    slot.dataset.inventoryId = String(inventoryId);
    slot.dataset.position = String(position);
    slot.textContent = `#${cardId}`;
    place(slot, [53 + 89 * position, 495]);
    cards.append(slot);
    if (!slots.has(cardId)) slots.set(cardId, []);
    slots.get(cardId).push(slot);
  }
  try {
    const ids = Array.from(slots.keys()).join(',');
    const metadata = await getCatalog('/api/quest-character-cards', new URLSearchParams({ ids }), signal);
    if (signal.aborted) return;
    for (const { id, name } of metadata.cards) {
      if (typeof name !== 'string' || !name) continue;
      for (const slot of slots.get(id) ?? []) slot.textContent = name;
    }
  } catch {
    // The verified deck name and slots remain available if card names cannot be fetched.
  }
}

export function mountQuestMap(host, { session, snapshot, onBack }) {
  const template = document.createElement('template');
  template.innerHTML = layout;
  const view = template.content.firstElementChild;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const get = selector => view.querySelector(selector);
  const back = get('#quest-map-back');
  const inventory = get('#quest-map-inventory');
  const pageControls = get('.quest-map-pages');
  const prevPage = get('.quest-map-page-prev');
  const nextPage = get('.quest-map-page-next');
  const definitions = new Map();
  const timers = [];
  const pages = Math.max(1, Math.ceil(snapshot.rows.length / pageSize));
  let page = 0;
  let timer;

  const updateTimers = () => {
    let running = false;
    const now = performance.now();
    for (const { remaining, expiry } of timers) {
      const milliseconds = Math.max(0, expiry - now);
      remaining.textContent = formatTimer(milliseconds);
      running ||= milliseconds > 0;
    }
    if (!running) clearInterval(timer);
    return running;
  };

  const paintRows = () => {
    clearInterval(timer);
    timers.length = 0;
    const pageRows = snapshot.rows.slice(page * pageSize, (page + 1) * pageSize);
    const showHelp = getPreferences().toolTip;
    inventory.replaceChildren(...pageRows.map(row => createQuestRow(row, definitions, snapshot.receivedAt, timers, showHelp)));
    get('#quest-map-list-page').textContent = `${page + 1}/${pages}`;
    prevPage.hidden = page === 0;
    nextPage.hidden = page + 1 === pages;
    pageControls.hidden = pages === 1;
    if (updateTimers()) timer = setInterval(updateTimers, 1000);
  };

  const changePage = delta => {
    page += delta;
    paintRows();
    const focused = delta < 0 ? prevPage : nextPage;
    if (focused.hidden) (delta < 0 ? nextPage : prevPage).focus({ preventScroll: true });
  };
  prevPage.addEventListener('click', () => changePage(-1), { signal });
  nextPage.addEventListener('click', () => changePage(1), { signal });
  back.addEventListener('click', () => {
    back.disabled = true;
    playBackClick();
    onBack();
  }, { signal });

  get('#quest-map-capacity').textContent = `${snapshot.rows.length}/${snapshot.capacity}`;
  get('#quest-map-capacity').classList.toggle('quest-map-capacity-full', snapshot.rows.length >= snapshot.capacity);
  if (snapshot.capacity > 0) {
    const plate = get('.quest-map-list-art');
    plate.src = `${art}quest-list-${String(Math.min(snapshot.capacity, pageSize)).padStart(2, '0')}.png`;
    plate.hidden = false;
  }
  paintRows();
  void mountAvatarLayer(get('.avatar-layer'), { session, signal, idPrefix: 'quest-map' });
  void paintDeck(view, snapshot.selectedDeck, signal);
  host.append(view);
  back.focus({ preventScroll: true });
  void mountQuestRegions(view, snapshot, signal);

  const ids = new Set(snapshot.rows.map(row => row.questId).filter(id => id > 0));
  const queries = new URLSearchParams();
  for (const id of ids) queries.append('id', String(id));
  if (queries.size) {
    void getCatalog('/api/quest-catalog', queries, signal).then(({ quests }) => {
      if (signal.aborted) return;
      for (const quest of quests) if (ids.has(quest.id)) definitions.set(quest.id, quest);
      paintRows();
    }).catch(() => {
      // Verified inventory rows remain available without localized metadata.
    });
  }

  return () => {
    lifetime.abort();
    clearInterval(timer);
    view.remove();
  };
}
