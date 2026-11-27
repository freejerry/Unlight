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
const detailStatuses = new Set([0, 1, 2, 6]);
const detailColumns = [88, 184, 280];
const detailRows = [100, 180, 260, 340, 420];
const outerPassFrames = [0, 0, 0, 2, 0, 1, 3, 4];
const centerPassFrames = [0, 0, 0, 3, 0, 1, 10, 5, 0, 2, 8, 6, 9, 4, 11, 7];
const searchRejections = new Map([
  [1, 'AP不足'],
  [30, '因任務數量已達到上限，所以不能再取得任務'],
  [31, '錯誤的任務地圖編號'],
  [32, '你的等級不足以取得地圖'],
]);

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
    <div class="quest-map-detail-copy" hidden>
      <div class="quest-map-detail-heading">
        <h2 id="quest-map-detail-title"></h2>
        <p id="quest-map-detail-region"></p>
        <p id="quest-map-detail-points"></p>
      </div>
      <p id="quest-map-detail-sender" hidden></p>
      <p id="quest-map-detail-caption"></p>
    </div>
    <button id="quest-map-region-open" class="quest-map-art-button" type="button" aria-label="選擇地圖" aria-haspopup="dialog" aria-controls="quest-map-region-picker">
      <img src="${art}quest-select-map-up.png" width="56" height="56" alt="">
      <img class="quest-map-art-over" src="${art}quest-select-map-over.png" width="56" height="56" alt="">
    </button>
    <button id="quest-map-deck-previous" class="quest-map-art-button" type="button" aria-label="上一個牌組" aria-disabled="true">
      <img src="${art}quest-deck-back-up.png" width="16" height="24" alt="">
      <img class="quest-map-art-over" src="${art}quest-deck-back-over.png" width="16" height="24" alt="">
    </button>
    <button id="quest-map-deck-next" class="quest-map-art-button" type="button" aria-label="下一個牌組" aria-disabled="true">
      <img src="${art}quest-deck-next-up.png" width="16" height="24" alt="">
      <img class="quest-map-art-over" src="${art}quest-deck-next-over.png" width="16" height="24" alt="">
    </button>
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
      <span id="quest-map-active-deck-name"></span>
      <ol id="quest-map-deck-cards"></ol>
    </section>
    <section id="quest-map-detail" aria-labelledby="quest-map-detail-title" hidden>
      <button id="quest-map-detail-back" class="quest-map-art-button" type="button" aria-label="返回地圖"><span>返回地圖</span></button>
      <div class="quest-map-detail-route"></div>
      <div class="quest-map-detail-data-art" aria-hidden="true"></div>
      <div class="quest-map-detail-commands"></div>
      <section id="quest-map-detail-land-data" aria-labelledby="quest-map-detail-land-name" hidden>
        <div class="quest-map-detail-land-art"></div>
        <h3 id="quest-map-detail-land-name"></h3>
        <p id="quest-map-detail-land-caption"></p>
      </section>
      <p id="quest-map-detail-status" class="sr-only" role="status"></p>
    </section>
    <img class="quest-map-item-art" src="/source-login/lobby-art/hover/item-up.png" width="48" height="32" alt="">
    <p id="quest-map-status" role="status" hidden></p>
    <p id="quest-map-search-status" class="sr-only" role="status"></p>
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
    <dialog id="quest-map-search-preview" class="quest-map-dialog" aria-labelledby="quest-map-search-title">
      <h2 id="quest-map-search-title" class="sr-only">開始搜索</h2>
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
        <img class="quest-map-art-over" src="${art}quest-search-ok-over.png" width="160" height="40" alt="">
      </button>
    </dialog>
    <dialog id="quest-map-search-result" class="quest-map-dialog stage-panel" aria-labelledby="quest-map-search-result-title" aria-describedby="quest-map-search-result-name quest-map-search-result-message">
      <h2 id="quest-map-search-result-title" class="stage-panel-title">確認</h2>
      <p id="quest-map-search-result-name"></p>
      <p id="quest-map-search-result-message">取得</p>
      <button id="quest-map-search-result-ok" type="button" lang="en" autofocus>OK</button>
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

function appendDetailArt(parent, layer, x = 0, y = 0) {
  if (!layer) return;
  const node = image(layer.file, 'quest-map-detail-sprite');
  place(node, [x + layer.x, y + layer.y, layer.width, layer.height]);
  parent.append(node);
}

// QuestPassClip.judgeType selects each authored path frame from the three original next masks.
function detailPathFrames(left, center, right) {
  const leftBits = (left & 4 ? 5 : 0) | (left & 3 ? 3 : 0) | ((center | right) & 4 ? 6 : 0);
  const rightBits = (right & 1 ? 5 : 0) | (right & 6 ? 3 : 0) | ((center | left) & 1 ? 6 : 0);
  const centerBits = (center & 2 ? 5 : 0) | (center & 4 ? 9 : 0) | (center & 1 ? 3 : 0) |
    (left & 2 ? 12 : 0) | (right & 2 ? 6 : 0) | (left & 1 || right & 4 ? 10 : 0);
  return [outerPassFrames[leftBits], centerPassFrames[centerBits], outerPassFrames[rightBits]];
}

function appendTerrainArt(parent, assets, land, x, y) {
  const terrain = assets.terrain?.[land.stage]?.dis;
  appendDetailArt(parent, terrain, x, y);
  if (land.enemyId > 0) {
    appendDetailArt(parent, assets.events[land.treasureType === 7 ? 'enemy_hl' : 'enemy'], x, y);
    if (land.treasureType > 0) appendDetailArt(parent, assets.subEvents[assets.subEventByTreasure[land.treasureType]], x, y);
  } else if (land.treasureType > 0 && land.treasureType !== 7) {
    appendDetailArt(parent, assets.events[assets.eventByTreasure[land.treasureType]], x, y);
  }
  return terrain;
}

function paintDetailRoute(route, positions, assets, setHover) {
  route.replaceChildren();
  if (!Array.isArray(positions) || !assets) return;
  const bySlot = new Map(positions.map(land => [land.slot, land]));
  const lanes = ['left', 'center', 'right'];
  for (let column = 0; column < 4; column += 1) {
    const index = column * 3;
    const frames = detailPathFrames(bySlot.get(index)?.nextMask ?? 0, bySlot.get(index + 1)?.nextMask ?? 0,
      bySlot.get(index + 2)?.nextMask ?? 0);
    for (const [lane, frame] of frames.entries()) {
      if (frame) appendDetailArt(route, assets.paths?.[lanes[lane]]?.[frame], 80 + 96 * lane, 156 + 80 * column);
    }
  }

  const start = [2, 1, 0].find(slot => bySlot.has(slot)) ?? 0;
  appendDetailArt(route, assets.bases?.[4], detailColumns[start], 36);
  for (const land of positions) {
    const { id, slot, nextMask } = land;
    if (!Number.isInteger(slot) || slot < 0 || slot > 14) continue;
    const x = detailColumns[slot % 3];
    const y = detailRows[Math.floor(slot / 3)];
    const goal = slot >= 12 || nextMask === 0;
    appendDetailArt(route, assets.bases?.[goal ? 5 : 2], x, y);
    const terrain = appendTerrainArt(route, assets, land, x + 40, y + 56);
    if (!terrain) continue;

    const hit = document.createElement('span');
    hit.className = 'quest-map-detail-land';
    hit.dataset.slot = String(slot);
    hit.dataset.landId = String(id);
    hit.tabIndex = 0;
    hit.setAttribute('role', 'img');
    hit.setAttribute('aria-label', land.name || `地形 ${id}`);
    if (land.caption) hit.setAttribute('aria-description', land.caption);
    place(hit, [x + 40 + terrain.x, y + 56 + terrain.y, terrain.width, terrain.height]);
    const activate = () => setHover(land);
    const deactivate = () => { if (!hit.matches(':hover, :focus')) setHover(null); };
    hit.addEventListener('mouseenter', activate);
    hit.addEventListener('mouseleave', deactivate);
    hit.addEventListener('focus', activate);
    hit.addEventListener('blur', deactivate);
    route.append(hit);
  }
}

function setupQuestDetails(view, { scene, signal, definitions, loadDefinitions, current }) {
  const get = selector => view.querySelector(selector);
  const detail = get('#quest-map-detail');
  const world = get('#quest-map-world');
  const picker = get('#quest-map-region-open');
  const copy = get('.quest-map-detail-copy');
  const localBack = get('#quest-map-detail-back');
  const route = get('.quest-map-detail-route');
  const commands = get('.quest-map-detail-commands');
  const panel = get('#quest-map-detail-land-data');
  const panelArt = get('.quest-map-detail-land-art');
  const notice = get('#quest-map-detail-status');
  let assets;
  let selectedId;
  let acknowledging;
  let rendered;

  function setHover(land) {
    panelArt.replaceChildren();
    panel.hidden = !land;
    if (!land) {
      delete panel.dataset.landId;
      delete panel.dataset.slot;
      get('#quest-map-detail-land-name').textContent = '';
      get('#quest-map-detail-land-caption').textContent = '';
      return;
    }
    panel.dataset.landId = String(land.id);
    panel.dataset.slot = String(land.slot);
    get('#quest-map-detail-land-name').textContent = land.name;
    get('#quest-map-detail-land-caption').textContent = land.caption;
    appendTerrainArt(panelArt, assets, land, 512, 403);
  }

  function close() {
    const closed = selectedId;
    selectedId = undefined;
    rendered = undefined;
    detail.hidden = copy.hidden = true;
    world.inert = false;
    picker.hidden = false;
    delete view.dataset.detailOpen;
    delete detail.dataset.inventoryId;
    delete detail.dataset.questStatus;
    delete detail.dataset.confirmationState;
    setHover(null);
    route.replaceChildren();
    const row = get(`#quest-map-inventory > li[data-inventory-id="${closed}"]`);
    row?.querySelector('.quest-map-row-open')?.removeAttribute('aria-current');
    (row?.querySelector('.quest-map-row-open') ?? picker).focus({ preventScroll: true });
  }

  function refresh() {
    if (!selectedId || signal.aborted) return;
    const { rows, energy } = current();
    const row = rows.find(item => item.inventoryId === selectedId);
    if (!row || !detailStatuses.has(row.status)) {
      close();
      return;
    }
    const definition = definitions.get(row.questId);
    detail.dataset.inventoryId = String(row.inventoryId);
    detail.dataset.questStatus = String(row.status);
    detail.dataset.confirmationState = row.confirmationState ?? (acknowledging === row.inventoryId ? 'busy' : 'ready');
    notice.textContent = detail.dataset.confirmationState === 'uncertain' ? '無法確認任務已讀狀態。' : '';
    get('#quest-map-detail-title').textContent = definition?.name || `任務 ${row.questId}`;
    get('#quest-map-detail-region').textContent = definition?.map ? `[地區]${definition.map}` : '';
    get('#quest-map-detail-points').textContent = Number.isInteger(definition?.difficulty) ? `[QuestPoint]: ＋${definition.difficulty}` : '';
    get('#quest-map-detail-caption').textContent = definition?.caption || '';
    const sender = get('#quest-map-detail-sender');
    sender.hidden = !row.senderName;
    sender.textContent = row.senderName ? `[送礼来的大小姐]：${row.senderName}` : '';
    for (const button of commands.children) {
      const command = button.dataset.questCommand;
      button.hidden = row.status === 2 ? command !== 'quit' : command === 'quit' ||
        (command === 'present' && Number.isInteger(energy) && definition?.ap > energy);
    }
    if (rendered?.definition !== definition || rendered?.assets !== assets) {
      rendered = { definition, assets };
      setHover(null);
      paintDetailRoute(route, definition?.positions, assets, setHover);
    }
  }

  localBack.addEventListener('click', close, { signal });
  void getCatalog(`${art}sources.json`, null, signal).then(({ detail: source }) => {
    if (signal.aborted || !source) return;
    assets = source;
    function applyButtonArt(button, { up, over, hit }) {
      place(button, hit);
      appendDetailArt(button, up, -hit[0], -hit[1]);
      if (over) {
        appendDetailArt(button, over, -hit[0], -hit[1]);
        button.lastElementChild.classList.add('quest-map-art-over');
      }
    }
    if (assets.back) {
      localBack.replaceChildren();
      applyButtonArt(localBack, assets.back);
    }
    for (const [key, label] of [['start', '開始'], ['drop', '丟棄'], ['present', '贈送'], ['quit', '放棄']]) {
      if (!assets.commands?.[key]) continue;
      const command = document.createElement('button');
      command.className = 'quest-map-art-button';
      command.type = 'button';
      command.disabled = true;
      command.dataset.questCommand = key;
      command.setAttribute('aria-label', label);
      applyButtonArt(command, assets.commands[key]);
      commands.append(command);
    }
    for (const layer of assets.data ?? []) appendDetailArt(get('.quest-map-detail-data-art'), layer);
    refresh();
  }).catch(() => {
    // Authoritative names and captions remain available when art cannot be loaded.
  });

  return {
    get inventoryId() { return selectedId; },
    refresh,
    async open(id) {
      const row = current().rows.find(item => item.inventoryId === id);
      if (!row || !detailStatuses.has(row.status) || row.questId <= 0) return;
      get(`#quest-map-inventory > li[data-inventory-id="${selectedId}"] .quest-map-row-open`)?.removeAttribute('aria-current');
      selectedId = id;
      get(`#quest-map-inventory > li[data-inventory-id="${id}"] .quest-map-row-open`)?.setAttribute('aria-current', 'true');
      detail.hidden = copy.hidden = false;
      world.inert = true;
      picker.hidden = true;
      view.dataset.detailOpen = '';
      refresh();
      playBackClick();
      localBack.focus({ preventScroll: true });
      void loadDefinitions([row.questId]);
      if (!scene || row.status !== 0 || row.confirmationState === 'uncertain' || acknowledging) return;
      acknowledging = id;
      refresh();
      try {
        await scene.acknowledge(id);
      } catch {
        // A later snapshot carries any uncertainty about an already-sent request.
      } finally {
        acknowledging = undefined;
        if (!signal.aborted) refresh();
      }
    },
  };
}

function setupSearchPreview(view, thumbnails, signal, { scene, onAlert, definitions, loadDefinitions }) {
  const dialog = view.querySelector('#quest-map-search-preview');
  const name = dialog.querySelector('#quest-map-search-name');
  const thumbnail = dialog.querySelector('#quest-map-search-thumbnail');
  const slider = dialog.querySelector('#quest-map-search-time');
  const time = dialog.querySelector('#quest-map-search-time-value');
  const ap = dialog.querySelector('#quest-map-search-ap');
  const confirm = dialog.querySelector('#quest-map-search-confirm');
  const obtained = view.querySelector('#quest-map-search-result');
  const obtainedName = obtained.querySelector('#quest-map-search-result-name');
  const result = setupDialog(obtained, view, [270, 280], signal, { onDismiss: playBackClick });
  const panel = setupDialog(dialog, view, [270, 280], signal, { onDismiss: playBackClick });
  const uncertainMessage = '無法確認搜尋結果。重新登入後請先查看任務清單。';
  let selected;
  let submitting = false;

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

  function canSearch() {
    return !!scene && scene.snapshot.searchState === 'ready' && !submitting;
  }

  function updateConfirm() {
    confirm.disabled = !canSearch();
  }

  scene?.subscribe(updateConfirm, { signal });
  confirm.addEventListener('click', async () => {
    if (!selected || !dialog.open || !canSearch()) return;
    const { map, opener } = selected;
    const timerIndex = slider.valueAsNumber;
    const focusTarget = () => opener.isConnected ? opener : view.querySelector('#quest-map-region-open');
    submitting = true;
    updateConfirm();
    try {
      const request = scene.search(map.id, timerIndex);
      void panel.dismiss();
      const { row } = await request;
      if (signal.aborted || view.inert || timerIndex !== 0 || row.status !== 0 || row.questId <= 0) return;

      await loadDefinitions([row.questId]);
      if (signal.aborted || view.inert) return;
      obtained.dataset.inventoryId = String(row.inventoryId);
      obtainedName.textContent = definitions.get(row.questId)?.name || `任務 ${row.questId}`;
      result.show(focusTarget());
    } catch (error) {
      if (signal.aborted || view.inert) return;
      const kind = error?.kind;
      if (kind === 'search-rejected') {
        onAlert?.('quest-search-rejected', searchRejections.get(error.code) ?? '搜尋失敗。', focusTarget());
      } else if (kind === 'search-uncertain') {
        onAlert?.('quest-search-uncertain', uncertainMessage, focusTarget());
      } else {
        onAlert?.('quest-search-error', '無法開始搜尋。', focusTarget());
      }
    } finally {
      submitting = false;
      if (!signal.aborted) updateConfirm();
    }
  }, { signal });

  return (map, opener) => {
    const state = scene?.snapshot.searchState;
    if (signal.aborted || view.inert || submitting || state === 'busy') return;
    if (state === 'uncertain') {
      onAlert?.('quest-search-uncertain', uncertainMessage, opener);
      return;
    }
    selected = { map, opener };
    updateConfirm();
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

async function mountQuestRegions(view, snapshot, signal, search) {
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
  const openPreview = setupSearchPreview(view, geography.searchThumbnails ?? {}, signal, search);
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
      if (view.dataset.searchState === 'busy') button.setAttribute('aria-disabled', 'true');
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

function createQuestRow(item, definitions, receiptTime, timers, showHelp, selectedId) {
  const row = document.createElement('li');
  row.dataset.inventoryId = String(item.inventoryId);
  row.dataset.questId = String(item.questId);
  row.dataset.questStatus = String(item.status);
  const status = rowStatus[item.status];
  if (status) row.append(image(`quest-row-state-${status}.png`, 'quest-map-row-state'));
  const statusLabel = rowText(row, 'sr-only', rowStatusNames[item.status] ?? '');
  statusLabel.id = `quest-map-row-status-${item.inventoryId}`;

  const definition = definitions.get(item.questId);
  const undiscovered = item.questId === 0;
  const kind = undiscovered ? 'adventure' : rowKind[definition?.kind];
  if (kind) row.append(image(`quest-row-kind-${kind}.png`, 'quest-map-row-kind'));
  if (undiscovered || Number.isInteger(definition?.difficulty)) {
    rowText(row, 'quest-map-row-level', undiscovered ? 'Lv ?' : `Lv ${definition.difficulty}`);
  }
  const name = definition?.name || (undiscovered ? '搜索中' : `任務 ${item.questId}`);
  rowText(row, 'quest-map-row-name', name);
  if (undiscovered || Number.isInteger(definition?.rarity)) {
    row.append(image('quest-row-rarity.png', 'quest-map-row-rarity-art'));
    rowText(row, 'quest-map-row-rarity', undiscovered ? '?' : String(definition.rarity));
  }
  if (undiscovered || Number.isInteger(definition?.ap)) {
    row.append(image('quest-row-ap.png', 'quest-map-row-ap-art'));
    rowText(row, 'quest-map-row-ap', undiscovered ? '?' : `x${definition.ap}`);
  }
  let helpId;
  if (showHelp && definition && (definition.caption || name)) {
    const tooltip = rowText(row, 'quest-map-row-tooltip', definition?.caption || name);
    helpId = tooltip.id = `quest-map-row-help-${item.inventoryId}`;
    tooltip.setAttribute('role', 'tooltip');
  }
  if (!undiscovered && detailStatuses.has(item.status)) {
    const button = document.createElement('button');
    button.className = 'quest-map-row-open';
    button.type = 'button';
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-controls', 'quest-map-detail');
    button.setAttribute('aria-describedby', helpId ? `${statusLabel.id} ${helpId}` : statusLabel.id);
    if (item.inventoryId === selectedId) button.setAttribute('aria-current', 'true');
    row.append(button);
  } else if (helpId) {
    row.setAttribute('aria-describedby', helpId);
    row.tabIndex = 0;
  }
  const expiry = (item.receivedAt ?? receiptTime) + Math.max(0, item.findSeconds) * 1000;
  if (item.status === 4 && Number.isFinite(expiry)) {
    const remaining = rowText(row, 'quest-map-row-timer', '');
    remaining.setAttribute('role', 'timer');
    remaining.setAttribute('aria-live', 'off');
    timers.push({ remaining, expiry });
  }
  return row;
}

async function paintDeck(view, selected, signal) {
  const deck = view.querySelector('#quest-map-deck');
  const name = deck.querySelector('#quest-map-active-deck-name');
  const cards = deck.querySelector('#quest-map-deck-cards');
  cards.replaceChildren();
  if (!selected) {
    delete deck.dataset.deckIndex;
    name.textContent = '';
    return;
  }
  deck.dataset.deckIndex = String(selected.index);
  name.textContent = `${selected.index}. ${selected.name}`;

  const entries = selected.cards.filter(({ position }) => position >= 0 && position < 3);
  if (!entries.length) return;
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

export function mountQuestMap(host, { session, snapshot, scene, onBack, onAlert }) {
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
  const capacity = get('#quest-map-capacity');
  const searchStatus = get('#quest-map-search-status');
  const deckControls = [[get('#quest-map-deck-previous'), -1], [get('#quest-map-deck-next'), 1]];
  const definitions = new Map();
  const definitionRequests = new Map();
  const timers = [];
  let latest = snapshot;
  let page = 0;
  let timer;
  let selectingDeck = false;
  const details = setupQuestDetails(view, { scene, signal, definitions, loadDefinitions, current: () => latest });

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
    const pages = Math.max(1, Math.ceil(latest.rows.length / pageSize));
    page = Math.min(page, pages - 1);
    const pageRows = latest.rows.slice(page * pageSize, (page + 1) * pageSize);
    const showHelp = getPreferences().toolTip;
    const focused = document.activeElement;
    const rowFocus = inventory.contains(focused) ? focused.closest('li')?.dataset.inventoryId : null;
    const items = pageRows.map(row => createQuestRow(row, definitions, latest.receivedAt, timers, showHelp, details.inventoryId));
    inventory.replaceChildren(...items);
    if (rowFocus) {
      const restored = items.find(item => item.dataset.inventoryId === rowFocus);
      (restored?.querySelector('.quest-map-row-open') ?? restored)?.focus({ preventScroll: true });
    }
    capacity.textContent = `${latest.rows.length}/${latest.capacity}`;
    capacity.classList.toggle('quest-map-capacity-full', latest.rows.length >= latest.capacity);
    get('#quest-map-list-page').textContent = `${page + 1}/${pages}`;
    prevPage.hidden = page === 0;
    nextPage.hidden = page + 1 === pages;
    pageControls.hidden = pages === 1;
    if (updateTimers()) timer = setInterval(updateTimers, 1000);
  };

  function loadDefinitions(ids) {
    const requested = new Set(ids.filter(id => id > 0));
    const missing = Array.from(requested).filter(id => !definitionRequests.has(id));
    if (missing.length) {
      const query = new URLSearchParams();
      for (const id of missing) query.append('id', String(id));
      const reading = getCatalog('/api/quest-catalog', query, signal).then(({ quests }) => {
        if (signal.aborted) return;
        for (const quest of quests) if (requested.has(quest.id)) definitions.set(quest.id, quest);
        paintRows();
        details.refresh();
      }).catch(() => {
        for (const id of missing) definitionRequests.delete(id);
      });
      for (const id of missing) definitionRequests.set(id, reading);
    }
    return Promise.all(Array.from(requested, id => definitionRequests.get(id)));
  }

  function displayDeckControls() {
    const state = latest.deckSelectionState ?? 'unavailable';
    view.dataset.deckSelectionState = state;
    for (const [button] of deckControls) {
      button.setAttribute('aria-disabled', String(state !== 'ready' || latest.searchState === 'busy' || selectingDeck || !scene));
    }
  }

  function displaySnapshot(next) {
    if (signal.aborted) return;
    const previous = latest;
    latest = next;
    displayDeckControls();
    if (previous.selectedDeck !== next.selectedDeck) void paintDeck(view, next.selectedDeck, signal);
    if (view.dataset.searchState !== next.searchState) {
      view.dataset.searchState = next.searchState;
      searchStatus.textContent = next.searchState === 'busy' ? '正在等待伺服器回覆。' : '';
      for (const button of view.querySelectorAll('.quest-map-landmark-hit:not(:disabled)')) {
        if (next.searchState === 'busy') button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
      }
    }
    const changed = previous.capacity !== next.capacity || previous.rows.length !== next.rows.length ||
      next.rows.some((item, index) => {
        const old = previous.rows[index];
        return item.inventoryId !== old.inventoryId || item.questId !== old.questId || item.status !== old.status ||
          item.findSeconds !== old.findSeconds || item.receivedAt !== old.receivedAt || item.dueAt !== old.dueAt ||
          item.senderName !== old.senderName || item.confirmationState !== old.confirmationState;
      });
    if (changed) {
      paintRows();
      void loadDefinitions(next.rows.map(row => row.questId));
    }
    details.refresh();
  }

  const changePage = delta => {
    page += delta;
    paintRows();
    const focused = delta < 0 ? prevPage : nextPage;
    if (focused.hidden) (delta < 0 ? nextPage : prevPage).focus({ preventScroll: true });
  };
  prevPage.addEventListener('click', () => changePage(-1), { signal });
  nextPage.addEventListener('click', () => changePage(1), { signal });
  inventory.addEventListener('click', event => {
    const button = event.target.closest('.quest-map-row-open');
    if (button) void details.open(Number(button.closest('li').dataset.inventoryId));
  }, { signal });
  for (const [button, delta] of deckControls) {
    button.addEventListener('click', async () => {
      if (!scene || selectingDeck || latest.deckSelectionState !== 'ready' || latest.searchState === 'busy') return;
      selectingDeck = true;
      displayDeckControls();
      try {
        await scene.selectDeck(delta);
      } catch (error) {
        if (!signal.aborted && !view.inert && error?.kind === 'deck-select-uncertain') {
          onAlert?.('quest-deck-uncertain', '無法確認牌組切換。', button);
        }
      } finally {
        selectingDeck = false;
        if (!signal.aborted) displayDeckControls();
      }
    }, { signal });
  }
  back.addEventListener('click', () => {
    back.disabled = true;
    playBackClick();
    onBack();
  }, { signal });

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
  displaySnapshot(scene?.snapshot ?? snapshot);
  scene?.subscribe(displaySnapshot, { signal });
  void mountQuestRegions(view, snapshot, signal, { scene, onAlert, definitions, loadDefinitions });
  void loadDefinitions(latest.rows.map(row => row.questId));

  return () => {
    lifetime.abort();
    clearInterval(timer);
    view.remove();
  };
}
