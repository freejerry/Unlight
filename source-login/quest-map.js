import { mountAvatarLayer } from './avatar-layer.js';
import { playBackClick } from './bgm.js';
import { getPreferences } from './preferences.js';

const art = '/source-login/quest-art/';
const landmarks = [
  { key: 'a', base: [239, 214], up: [266, 315], over: [239, 214], hit: [266.5, 314.5, 141, 38], progress: [333, 338] },
  { key: 'b', base: [83, 210], up: [70, 312], over: [70, 210], hit: [69.5, 310.5, 142, 39], progress: [134, 334] },
  { key: 'c', base: [107, 119], up: [86, 152], over: [86, 119], hit: [85.5, 150.5, 144, 40], progress: [153, 176] },
];
const rowStatus = ['new', '', 'active', '', 'wait', '', 'present'];
const rowStatusNames = ['新任務', '未完成', '進行中', '已完成', '搜尋中', '失敗', '受贈'];
const rowKind = ['adventure', 'treasure', 'boss'];
const pageSize = 10;

const layout = `
  <section id="quest-map-view" class="source-quest-map" aria-labelledby="quest-map-title">
    <h1 id="quest-map-title" class="sr-only">任務地圖</h1>
    <div id="quest-map-world" class="quest-map-world" hidden>
      <img class="quest-map-landscape" src="${art}map01.jpg" width="760" height="444" alt="">
      <img class="quest-map-badge" src="${art}map01-badge.png" width="36" height="39" alt="">
      <div id="quest-map-progress" hidden>
        <progress aria-label="當前攻略地區的任務完成度"></progress>
        <span aria-hidden="true"></span>
      </div>
    </div>
    <img class="quest-map-frame" src="${art}quest-base.png" width="760" height="680" alt="">
    <img class="quest-map-select-art" src="${art}quest-select-map-up.png" width="56" height="56" alt="">
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

function appendLandmarks(world, flag) {
  if (!Number.isInteger(flag) || flag < 0 || flag >= landmarks.length) return [];
  const areas = [];
  for (const { key, base, up, over, hit } of landmarks.slice(0, flag + 1)) {
    const region = document.createElement('div');
    region.className = 'quest-map-landmark';
    for (const [state, position] of [['base', base], ['up', up], ['over', over]]) {
      const visual = image(`map01-landmark-${key}-${state}.png`, `quest-map-landmark-${state}`);
      place(visual, position);
      region.append(visual);
    }
    const target = document.createElement('span');
    target.className = 'quest-map-landmark-hit';
    target.dataset.mapId = String(areas.length + 1);
    place(target, hit);
    region.append(target);
    world.append(region);
    areas.push(target);
  }
  world.hidden = false;
  return areas;
}

async function getCatalog(path, query, signal) {
  const response = await fetch(`${path}?${query}`, {
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) throw new Error('Quest map catalogue unavailable.');
  return response.json();
}

function paintProgress(progress, snapshot, map) {
  if (map?.id !== snapshot.questFlag + 1 || typeof map.name !== 'string' || !map.name ||
      !Number.isInteger(map.clearTarget) || map.clearTarget <= 0) return;
  const gauge = progress.querySelector('progress');
  const clear = Math.min(snapshot.questClearNum, map.clearTarget);
  gauge.max = map.clearTarget;
  gauge.value = clear;
  progress.querySelector('span').textContent = `${clear}/${map.clearTarget}`;
  place(progress, landmarks[snapshot.questFlag].progress);
  progress.hidden = false;
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
  const progress = get('#quest-map-progress');
  const status = get('#quest-map-status');
  const inventory = get('#quest-map-inventory');
  const pageControls = get('.quest-map-pages');
  const prevPage = get('.quest-map-page-prev');
  const nextPage = get('.quest-map-page-next');
  const areas = appendLandmarks(get('#quest-map-world'), snapshot.questFlag);
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

  const ids = new Set(snapshot.rows.map(row => row.questId).filter(id => id > 0));
  const queries = new URLSearchParams();
  if (areas.length) queries.set('map', String(areas.length));
  for (const id of ids) queries.append('id', String(id));

  if (!areas.length) {
    view.dataset.state = 'unsupported';
    status.textContent = '這個區域的地圖尚未開放檢視。';
    status.hidden = false;
  } else {
    view.dataset.mapId = String(areas.length);
    view.dataset.state = 'loading';
  }
  if (queries.size) {
    void getCatalog('/api/quest-catalog', queries, signal).then(({ map, quests }) => {
      if (signal.aborted) return;
      for (const quest of quests) if (ids.has(quest.id)) definitions.set(quest.id, quest);
      if (areas.length) {
        paintProgress(progress, snapshot, map);
        if (!progress.hidden) {
          view.dataset.state = 'ready';
          const currentArea = areas.at(-1);
          currentArea.setAttribute('role', 'img');
          currentArea.setAttribute('aria-label', map.name);
          currentArea.tabIndex = 0;
        } else {
          view.dataset.state = 'partial';
          status.textContent = '無法讀取地區進度。';
          status.hidden = false;
        }
      }
      paintRows();
    }).catch(() => {
      if (signal.aborted || !areas.length) return;
      view.dataset.state = 'partial';
      status.textContent = '無法讀取地區與任務名稱。';
      status.hidden = false;
    });
  }

  return () => {
    lifetime.abort();
    clearInterval(timer);
    view.remove();
  };
}
