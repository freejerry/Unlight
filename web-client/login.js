import { startSession, SessionError } from './session.js';
import { readNews } from './news.js';

const ui = {
  title: document.querySelector('#session-title'),
  form: document.querySelector('#session-form'),
  fields: document.querySelector('#session-fields'),
  username: document.querySelector('#session-username'),
  password: document.querySelector('#session-password'),
  status: document.querySelector('#session-status'),
  detail: document.querySelector('#session-detail'),
  result: document.querySelector('#session-result'),
  id: document.querySelector('#session-player-id'),
  lobby: document.querySelector('#session-lobby'),
  data: document.querySelector('#session-data'),
  chat: document.querySelector('#session-chat'),
  signOut: document.querySelector('#session-signout'),
  bootstrap: document.querySelector('#session-bootstrap'),
  bootstrapTitle: document.querySelector('#session-bootstrap-title'),
  avatarData: document.querySelector('#session-avatar-data'),
  registrationData: document.querySelector('#session-registration-data'),
  avatarFields: ['name', 'id', 'level', 'gems', 'exp'].map(field => document.querySelector(`#session-avatar-${field}`)),
  avatarEnergy: document.querySelector('#session-avatar-energy'),
  registrationFields: ['parts', 'cards'].map(field => document.querySelector(`#session-starter-${field}`)),
};

const questUi = {
  section: document.querySelector('#session-quest'),
  load: document.querySelector('#session-quest-load'),
  status: document.querySelector('#session-quest-status'),
  progress: document.querySelector('#session-quest-progress'),
  mapProgress: document.querySelector('#session-quest-map-progress'),
  mapName: document.querySelector('#session-quest-map-name'),
  mapCount: document.querySelector('#session-quest-map-count'),
  mapCaption: document.querySelector('#session-quest-map-caption'),
  inventory: document.querySelector('#session-quest-inventory'),
  rows: document.querySelector('#session-quest-rows'),
  details: document.querySelector('#session-quest-details'),
  detailList: document.querySelector('#session-quest-detail-list'),
  detailTemplate: document.querySelector('#session-quest-detail-template'),
  fields: ['count', 'capacity', 'flag', 'clear-count'].map(field => document.querySelector(`#session-quest-${field}`)),
};

const searchUi = {
  section: document.querySelector('#session-quest-search'),
  cost: document.querySelector('#session-quest-search-cost'),
  start: document.querySelector('#session-quest-search-start'),
  status: document.querySelector('#session-quest-search-status'),
};

const questDeckUi = {
  group: document.querySelector('#session-quest-deck-group'),
  select: document.querySelector('#session-quest-deck'),
  status: document.querySelector('#session-quest-deck-status'),
  entryNote: document.querySelector('#session-quest-entry-note'),
};

const questLandUi = {
  section: document.querySelector('#session-quest-land'),
  status: document.querySelector('#session-quest-land-status'),
  result: document.querySelector('#session-quest-land-result'),
  name: document.querySelector('#session-quest-land-name'),
  caption: document.querySelector('#session-quest-land-caption'),
  inventoryId: document.querySelector('#session-quest-land-inventory-id'),
  id: document.querySelector('#session-quest-land-id'),
  slot: document.querySelector('#session-quest-land-slot'),
  progress: document.querySelector('#session-quest-land-progress'),
  finish: document.querySelector('#session-quest-land-finish'),
  encounter: document.querySelector('#session-quest-land-encounter'),
  battleFields: document.querySelectorAll('#session-quest-land-duel [data-field]'),
};

const mapsUi = {
  load: document.querySelector('#session-quest-maps-load'),
  status: document.querySelector('#session-quest-maps-status'),
  result: document.querySelector('#session-quest-maps-result'),
  count: document.querySelector('#session-quest-maps-count'),
  rows: document.querySelector('#session-quest-maps-list'),
  labels: {
    idle: '尚未讀取地圖清單。',
    loading: '正在向任務服務查詢…',
    success: '已讀取伺服器回傳的地圖清單。',
    empty: '伺服器沒有回傳地圖。',
    failed: '無法讀取區域地圖，請重試。',
  },
};

const serviceInventoryUi = {
  load: document.querySelector('#session-quest-service-load'),
  status: document.querySelector('#session-quest-service-status'),
  result: document.querySelector('#session-quest-service-result'),
  count: document.querySelector('#session-quest-service-count'),
  table: document.querySelector('#session-quest-service-table'),
  rows: document.querySelector('#session-quest-service-rows'),
  labels: {
    idle: '尚未讀取任務服務清單。',
    loading: '正在讀取任務服務清單…',
    success: '已讀取任務服務清單。',
    empty: '任務服務沒有重送紀錄。',
    failed: '無法讀取任務服務清單，請重試。',
  },
};

const newsUi = {
  details: document.querySelector('#session-news'),
  summary: document.querySelector('#session-news-summary'),
  status: document.querySelector('#session-news-status'),
  content: document.querySelector('#session-news-content'),
  retry: document.querySelector('#session-news-retry'),
};

const errors = {
  credentials: ['登入被拒絕', '請確認帳號與密碼，再重新登入。'],
  network: ['連線失敗', '請確認認證、大廳、資料與全域聊天服務可用，再重新登入。'],
  protocol: ['登入驗證失敗', '伺服器的登入回覆不符合原版規格。'],
  timeout: ['登入逾時', '未在時限內收到完整回覆，請重新登入。'],
  cancelled: ['登入已取消', '你可以重新登入。'],
};

const questStatuses = {
  idle: '可查看任務清單與進度。',
  loading: '正在讀取任務資料…',
  empty: '目前的任務清單沒有項目。',
  success: '已讀取任務資料。',
  failed: '無法讀取任務資料，請重試。',
};
const questSearchRejected = {
  1: 'AP不足',
  30: '因任務數量已達到上限，所以不能再取得任務',
  31: '錯誤的任務地圖編號',
  32: '你的等級不足以取得地圖',
};
const questStartRejected = {
  1: 'AP不足',
  16: '牌組不存在',
  40: '任務不存在',
  41: '無法開始任務',
  42: '此牌組已在任務中',
};
const questLandRejected = {
  ...questStartRejected,
  15: '牌組裡沒有角色卡',
  43: '無法進入此地區',
};
const MAX_CATALOG_ID = 0x7fffffff;
const QUEST_PENDING = 4;
const QUEST_IN_PROGRESS = 2;
const questCountdowns = [];
const questDeckNames = new Map();
const confirmedQuestStarts = new Set();
const questFirstLands = new Map();

let pending = null;
let active = null;
let questRequest = null;
let liveQuestRequest = null;
let newsRequest = null;
let questCountdownTimer;

for (const [field, label] of [[ui.username, '帳號'], [ui.password, '密碼']]) {
  field.addEventListener('input', () => field.setCustomValidity(''));
  field.addEventListener('invalid', () => {
    if (field.validity.valueMissing) field.setCustomValidity(`請輸入${label}。`);
    else if (field.validity.patternMismatch || field.validity.tooLong) {
      field.setCustomValidity(`${label}限 1 至 16 個英文字母、數字、底線、句點或連字號。`);
    }
  });
}

function clearField(field) {
  field.value = '';
  field.setCustomValidity('');
}

function displayBootstrap(initialData) {
  const avatar = initialData?.avatar;
  const registration = initialData?.registration;
  ui.bootstrap.hidden = !initialData;
  ui.bootstrap.dataset.state = avatar ? 'avatar' : registration ? 'registration' : 'idle';
  ui.bootstrapTitle.textContent = avatar ? '角色資料' : registration ? '尚未建立角色' : '登入初始資料';
  ui.avatarData.hidden = !avatar;
  ui.registrationData.hidden = !registration;

  const avatarValues = avatar
    ? [avatar.name, avatar.id, avatar.level, avatar.gems, avatar.exp]
    : [];
  ui.avatarFields.forEach((field, index) => { field.textContent = avatarValues[index] ?? ''; });
  ui.avatarEnergy.textContent = avatar ? `${avatar.energy} / ${avatar.energyMax}` : '';
  const registrationValues = registration ? [registration.partCount, registration.cardCount] : [];
  ui.registrationFields.forEach((field, index) => { field.textContent = registrationValues[index] ?? ''; });
}

function showQuestStatus(state, kind) {
  questUi.status.dataset.state = state;
  questUi.status.textContent = questStatuses[state];
  if (kind) questUi.status.dataset.errorKind = kind;
  else delete questUi.status.dataset.errorKind;
  updateLiveQuestButtons();
}

function showLiveQuestStatus(view, state, kind) {
  view.status.dataset.state = state;
  view.status.textContent = view.labels[state];
  if (kind) view.status.dataset.errorKind = kind;
  else delete view.status.dataset.errorKind;
}

function showQuestActionStatus(element, state, message = '', kind, code) {
  element.dataset.state = state;
  element.textContent = message;
  if (kind) element.dataset.errorKind = kind;
  else delete element.dataset.errorKind;
  if (Number.isSafeInteger(code)) element.dataset.errorCode = String(code);
  else delete element.dataset.errorCode;
}

function clearLiveQuestResults(view) {
  view.result.hidden = true;
  view.count.textContent = '';
  (view.table ?? view.rows).hidden = true;
  view.rows.replaceChildren();
}

function questLandLocked() {
  return ['encounter', 'ready', 'uncertain', 'lost'].includes(questLandUi.status.dataset.state);
}

function updateLiveQuestButtons() {
  const busy = liveQuestRequest !== null;
  const networkBlocked = busy || questLandLocked();
  mapsUi.load.disabled = networkBlocked;
  serviceInventoryUi.load.disabled = networkBlocked;
  questUi.load.disabled = questUi.status.dataset.state === 'loading' || (busy && liveQuestRequest.kind !== 'read');
  searchUi.start.disabled = networkBlocked || searchUi.section.hidden || searchUi.status.dataset.state === 'uncertain';
  questDeckUi.select.disabled = networkBlocked || questDeckUi.group.hidden || questDeckUi.select.options.length <= 1
    || questDeckUi.status.dataset.state === 'uncertain';
  for (const button of questUi.rows.querySelectorAll('.quest-start')) {
    button.disabled = questDeckUi.select.disabled || !questDeckUi.select.value;
  }
  for (const { button } of questCountdowns) button.disabled = networkBlocked;
  for (const button of questUi.rows.querySelectorAll('.quest-land-enter')) button.disabled = networkBlocked;
}

function beginLiveQuestRequest(kind) {
  const session = active;
  if (!session?.initialData?.avatar || liveQuestRequest || questLandLocked()) return null;
  liveQuestRequest = { kind, session, controller: new AbortController() };
  updateLiveQuestButtons();
  return liveQuestRequest;
}

function isCurrentLiveQuestRequest(request) {
  return liveQuestRequest === request && active === request.session && request.session.initialData;
}

function finishLiveQuestRequest(request) {
  if (liveQuestRequest !== request) return;
  liveQuestRequest = null;
  updateLiveQuestButtons();
}

function clearLiveQuest() {
  liveQuestRequest?.controller.abort();
  liveQuestRequest = null;
  for (const view of [mapsUi, serviceInventoryUi]) {
    clearLiveQuestResults(view);
    showLiveQuestStatus(view, 'idle');
  }
  showQuestActionStatus(searchUi.status, 'idle');
  showQuestActionStatus(questDeckUi.status, 'idle');
  clearQuestLand();
  questDeckNames.clear();
  questDeckUi.select.replaceChildren();
  updateLiveQuestButtons();
}

function setOriginalText(element, text) {
  const hasText = typeof text === 'string' && Boolean(text.trim());
  element.hidden = !hasText;
  element.textContent = hasText ? text : '';
}

function clearQuestResults() {
  clearTimeout(questCountdownTimer);
  questCountdownTimer = undefined;
  questCountdowns.length = 0;
  questUi.progress.hidden = true;
  questUi.mapProgress.hidden = true;
  delete questUi.mapProgress.dataset.mapId;
  questUi.mapName.textContent = '';
  questUi.mapCount.textContent = '';
  setOriginalText(questUi.mapCaption, '');
  searchUi.section.hidden = true;
  delete searchUi.section.dataset.mapId;
  searchUi.cost.textContent = '行動力（AP）';
  questDeckUi.group.hidden = true;
  questDeckUi.entryNote.hidden = true;
  questUi.inventory.hidden = true;
  questUi.rows.replaceChildren();
  questUi.details.hidden = true;
  questUi.detailList.replaceChildren();
  for (const field of questUi.fields) field.textContent = '';
}

function appendQuestRow(tableBody, { inventoryId, questId, status }) {
  const row = tableBody.insertRow();
  row.dataset.inventoryId = String(inventoryId);
  row.dataset.questId = String(questId);
  row.dataset.questStatus = String(status);
  for (const value of [inventoryId, questId, status]) row.insertCell().textContent = String(value);
  return row;
}

function findServiceQuestRow(inventoryId, questId) {
  return serviceInventoryUi.rows.querySelector(`[data-inventory-id="${inventoryId}"][data-quest-id="${questId}"]`);
}

function clearQuestLand() {
  confirmedQuestStarts.clear();
  questFirstLands.clear();
  questLandUi.section.hidden = true;
  questLandUi.result.hidden = true;
  questLandUi.encounter.hidden = true;
  for (const item of [questLandUi.progress, questLandUi.finish]) {
    item.hidden = true;
    item.lastElementChild.textContent = '';
  }
  delete questLandUi.result.dataset.slot;
  delete questLandUi.result.dataset.inventoryId;
  delete questLandUi.result.dataset.landId;
  setOriginalText(questLandUi.caption, '');
  for (const field of [questLandUi.name, questLandUi.inventoryId, questLandUi.id, questLandUi.slot, ...questLandUi.battleFields]) {
    field.textContent = '';
  }
  showQuestActionStatus(questLandUi.status, 'idle');
}

function appendQuestLandOption(row) {
  const inventoryId = Number(row.dataset.inventoryId);
  const land = questFirstLands.get(Number(row.dataset.questId));
  if (!land || !confirmedQuestStarts.has(inventoryId) || Number(row.dataset.questStatus) !== QUEST_IN_PROGRESS
      || !(Number(row.dataset.deckIndex) > 0) || row.querySelector('.quest-land-option')) return;

  const option = document.createElement('div');
  option.className = 'quest-land-option';
  option.dataset.slot = String(land.slot);
  option.dataset.landId = String(land.id);
  const name = document.createElement('span');
  name.className = 'quest-land-name';
  name.id = `quest-land-option-name-${inventoryId}`;
  name.textContent = land.name;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary quest-land-enter';
  button.textContent = '進入首格地形';
  button.setAttribute('aria-controls', 'session-quest-land');
  button.setAttribute('aria-describedby', `${name.id} session-quest-entry-note`);
  option.append(name, button);
  row.cells[3].append(option);
  button.addEventListener('click', () => void enterQuestLand(row, inventoryId, land, button));
}

function displayQuestLand(inventoryId, land, { slot, encounter, progress, finish }) {
  const battleFields = encounter?.duel ? { ...encounter, ...encounter.duel } : null;
  const battleValues = battleFields && [...questLandUi.battleFields].map(field => battleFields[field.dataset.field]);
  const validBattle = battleValues?.every(value => typeof value === 'boolean' || Number.isSafeInteger(value)
    || (Array.isArray(value) && value.every(Number.isSafeInteger)));
  if (slot !== land.slot || (encounter && !validBattle) || (!encounter && progress == null && !finish)
      || (progress != null && !Number.isSafeInteger(progress))
      || (finish && (finish.inventoryId !== inventoryId || !Number.isSafeInteger(finish.result)))) {
    throw new SessionError('quest-land-uncertain');
  }

  questLandUi.name.textContent = land.name;
  setOriginalText(questLandUi.caption, land.caption);
  questLandUi.inventoryId.textContent = String(inventoryId);
  questLandUi.id.textContent = String(land.id);
  questLandUi.slot.textContent = String(slot);
  questLandUi.result.dataset.inventoryId = String(inventoryId);
  questLandUi.result.dataset.landId = String(land.id);
  questLandUi.result.dataset.slot = String(slot);
  questLandUi.progress.hidden = progress == null;
  questLandUi.progress.lastElementChild.textContent = progress ?? '';
  questLandUi.finish.hidden = !finish;
  questLandUi.finish.lastElementChild.textContent = finish?.result ?? '';
  if (battleValues) {
    questLandUi.battleFields.forEach((field, index) => {
      const value = battleValues[index];
      field.textContent = Array.isArray(value) ? value.join('、') : String(value);
    });
  }
  questLandUi.encounter.hidden = !encounter;
  questLandUi.result.hidden = false;
  showQuestActionStatus(questLandUi.status, encounter ? 'encounter' : 'ready', encounter
    ? '伺服器已確認進入地形與戰鬥開場。回合操作尚未接通，其他任務服務操作已暫停。'
    : '伺服器已確認進入地形，並回傳任務進度或結算。其他任務服務操作已暫停。');
}

function watchQuestLandConnection(session) {
  const closed = session.questAdventure?.closed;
  if (!closed) return;
  const showLost = () => {
    if (active !== session || !session.initialData) return;
    const message = questLandUi.result.hidden
      ? '任務連線已中斷。未能確認本次進入結果，請勿重送。'
      : '任務連線已中斷。已確認的資料仍可查看，本次登入的任務服務操作已暫停。';
    showQuestActionStatus(questLandUi.status, 'lost', message, 'network');
    updateLiveQuestButtons();
  };
  void closed.then(showLost, showLost);
}

async function reconcileFinishedQuest(row, inventoryId, request) {
  const { session, controller } = request;
  const snapshot = await session.readQuestInventory({ signal: controller.signal }).catch(() => null);
  if (!snapshot || !isCurrentLiveQuestRequest(request) || !row.isConnected
      || snapshot.rows.some(entry => entry.inventoryId === inventoryId)) return;

  const serviceRow = findServiceQuestRow(inventoryId, row.dataset.questId);
  if (serviceRow) {
    serviceRow.remove();
    const count = serviceInventoryUi.rows.rows.length;
    serviceInventoryUi.count.textContent = String(count);
    serviceInventoryUi.table.hidden = count === 0;
  }
  row.remove();
  questUi.fields[0].textContent = String(snapshot.rows.length);
  questUi.inventory.hidden = snapshot.rows.length === 0;
  displayQuestDecks();
}

async function enterQuestLand(row, inventoryId, land, button) {
  if (button.disabled || !row.isConnected) return;
  const restoreFocus = document.activeElement === button;
  const request = beginLiveQuestRequest('land');
  if (!request) return;
  const { session, controller } = request;
  questLandUi.section.hidden = false;
  showQuestActionStatus(questLandUi.status, 'entering', '正在向伺服器確認首格地形…');

  try {
    const result = await session.enterQuestLand(inventoryId, land.slot, { signal: controller.signal });
    if (!isCurrentLiveQuestRequest(request) || !row.isConnected) return;
    displayQuestLand(inventoryId, land, result);
    if (result.finish) await reconcileFinishedQuest(row, inventoryId, request);
    else watchQuestLandConnection(session);
  } catch (error) {
    if (!isCurrentLiveQuestRequest(request) || !row.isConnected) return;
    const kind = error instanceof SessionError ? error.kind : 'quest-land-uncertain';
    if (kind === 'quest-land-rejected') {
      const reason = questLandRejected[error.code];
      showQuestActionStatus(questLandUi.status, 'rejected', reason ? `${reason}。` : '伺服器拒絕進入地形。', kind, error.code);
    } else if (kind === 'quest-land-uncertain' || kind === 'quest-adventure-active') {
      showQuestActionStatus(questLandUi.status, 'uncertain', '未能確認本次進入結果。本次登入已暫停任務服務操作。', kind);
      watchQuestLandConnection(session);
    } else {
      const message = kind === 'quest-land-unavailable' ? '伺服器尚未確認這筆任務可進入。' : '無法進入首格地形，請重試。';
      showQuestActionStatus(questLandUi.status, 'failed', message, kind);
    }
  } finally {
    finishLiveQuestRequest(request);
    if (restoreFocus && active === session && (document.activeElement === document.body || document.activeElement === button)) {
      questLandUi.status.focus();
    }
  }
}

function deckLabel(index) {
  const name = questDeckNames.get(index);
  return name?.trim() ? `${index}　${name}` : `牌組 ${index}`;
}

function updateQuestSearchRecovery() {
  if (searchUi.status.dataset.state !== 'uncertain') return;
  const caution = !questDeckUi.entryNote.hidden || questDeckUi.status.dataset.state === 'uncertain'
    ? ' 重新登入會清除進行中的任務。' : '';
  showQuestActionStatus(searchUi.status, 'uncertain',
    `無法確認搜尋是否已開始。請重新登入後查看任務清單。${caution}`, 'search-uncertain');
}

function displayQuestDecks() {
  const decks = active?.initialData?.avatar?.questDecks ?? [];
  const selected = questDeckUi.select.value;
  const options = [new Option(decks.length ? '請選擇牌組' : '目前沒有可用的牌組', '')];
  for (const { index, name } of decks) {
    questDeckNames.set(index, name);
    options.push(new Option(deckLabel(index), String(index)));
  }
  questDeckUi.select.replaceChildren(...options);
  if (options.some(option => option.value === selected)) questDeckUi.select.value = selected;
  questDeckUi.group.hidden = !questUi.rows.querySelector('.quest-start') && questDeckUi.status.dataset.state !== 'uncertain';
  questDeckUi.entryNote.hidden = !questUi.rows.querySelector(`[data-quest-status="${QUEST_IN_PROGRESS}"]`);
  updateQuestSearchRecovery();
  updateLiveQuestButtons();
}

function updateQuestRowStatus(row, status) {
  row.dataset.questStatus = String(status);
  row.cells[2].textContent = String(status);
}

function displayStartedQuest(row, statusElement, deckIndex) {
  updateQuestRowStatus(row, QUEST_IN_PROGRESS);
  row.dataset.deckIndex = String(deckIndex);
  showQuestActionStatus(statusElement, 'started', `伺服器已開始任務。使用 ${deckLabel(deckIndex)}。`);
}

function appendQuestStart(row, { inventoryId, questId, status, deckIndex }) {
  const startable = questId > 0 && (status === 0 || status === 1);
  const assigned = status === QUEST_IN_PROGRESS && Number.isSafeInteger(deckIndex) && deckIndex > 0;
  if (!startable && !assigned) return;
  const description = row.cells[3];
  const statusElement = document.createElement('span');
  statusElement.className = 'quest-start-status';
  statusElement.setAttribute('role', 'status');
  statusElement.tabIndex = -1;
  if (assigned) {
    description.append(statusElement);
    displayStartedQuest(row, statusElement, deckIndex);
    appendQuestLandOption(row);
    return;
  }

  const cost = document.createElement('span');
  cost.className = 'quest-start-cost';
  cost.id = `quest-start-cost-${inventoryId}`;
  cost.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary quest-start';
  button.textContent = '開始任務';
  button.disabled = true;
  button.setAttribute('aria-describedby', `quest-name-${inventoryId} ${cost.id}`);
  statusElement.dataset.state = 'idle';
  description.append(cost, button, statusElement);
  button.addEventListener('click', () => void startQuest(row, inventoryId, questId, button, statusElement));
}

async function startQuest(row, inventoryId, questId, button, statusElement) {
  if (button.disabled || !row.isConnected) return;
  const index = Number(questDeckUi.select.value);
  if (!active?.initialData?.avatar?.questDecks?.some(deck => deck.index === index)) return;
  const restoreFocus = document.activeElement === button;
  const request = beginLiveQuestRequest('start');
  if (!request) return;
  const { session, controller } = request;

  showQuestActionStatus(statusElement, 'starting', '正在向伺服器開始任務…');
  try {
    const { row: reply, energy, deckIndex } = await session.startQuest(inventoryId, index, { signal: controller.signal });
    if (!isCurrentLiveQuestRequest(request) || !row.isConnected) return;
    if (reply?.inventoryId !== inventoryId || reply.questId !== questId || reply.status !== QUEST_IN_PROGRESS
        || reply.deckIndex !== index || deckIndex !== index || !Number.isSafeInteger(energy) || energy < 0) {
      throw new SessionError('quest-start-uncertain');
    }

    ui.avatarEnergy.textContent = `${energy} / ${session.initialData.avatar.energyMax}`;
    displayStartedQuest(row, statusElement, deckIndex);
    confirmedQuestStarts.add(inventoryId);
    appendQuestLandOption(row);
    const serviceRow = findServiceQuestRow(inventoryId, questId);
    if (serviceRow) updateQuestRowStatus(serviceRow, reply.status);
    button.remove();
    row.querySelector('.quest-start-cost')?.remove();
    displayQuestDecks();
  } catch (error) {
    if (!isCurrentLiveQuestRequest(request) || !row.isConnected) return;
    const kind = error instanceof SessionError ? error.kind : 'quest-start-uncertain';
    if (kind === 'quest-start-rejected') {
      const reason = questStartRejected[error.code];
      showQuestActionStatus(statusElement, 'rejected', reason ? `${reason}。` : '伺服器拒絕開始任務。', kind, error.code);
    } else if (kind === 'quest-start-uncertain') {
      showQuestActionStatus(statusElement, 'uncertain', '無法確認任務是否已開始。', kind);
      showQuestActionStatus(questDeckUi.status, 'uncertain', '本次登入已暫停開始任務。可讀取任務服務清單查看伺服器狀態。', kind);
      updateQuestSearchRecovery();
    } else {
      const message = kind === 'quest-start-unavailable' ? '任務服務未確認這筆任務可開始。' : '無法開始任務，請重試。';
      showQuestActionStatus(statusElement, 'failed', message, kind);
    }
  } finally {
    finishLiveQuestRequest(request);
    if (restoreFocus && row.isConnected && (document.activeElement === document.body || document.activeElement === button)) {
      const target = button.isConnected && !button.disabled ? button : statusElement;
      target.focus({ preventScroll: true });
    }
  }
}

function formatQuestTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const minutesAndSeconds = `${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${minutesAndSeconds}` : minutesAndSeconds;
}

function updateQuestCountdowns() {
  clearTimeout(questCountdownTimer);
  questCountdownTimer = undefined;
  if (document.hidden || !active?.initialData) return;

  const now = performance.now();
  let nextUpdate = Infinity;
  for (const { element, deadline, button } of questCountdowns) {
    const remaining = Math.max(0, deadline - now);
    const seconds = Math.ceil(remaining / 1000);
    if (element.dataset.remainingSeconds !== String(seconds)) {
      element.dataset.remainingSeconds = String(seconds);
      element.dataset.state = seconds > 0 ? 'counting' : 'elapsed';
      element.textContent = seconds > 0 ? `預估剩餘 ${formatQuestTime(seconds)}` : '預估已到期，待伺服器確認';
      button.hidden = seconds > 0;
    }
    if (seconds > 0) nextUpdate = Math.min(nextUpdate, remaining - (seconds - 1) * 1000);
  }
  if (Number.isFinite(nextUpdate)) questCountdownTimer = setTimeout(updateQuestCountdowns, Math.ceil(nextUpdate));
}

async function confirmQuestDiscovery(row, inventoryId, countdown, statusElement) {
  if (!row.isConnected || countdown.element.dataset.state !== 'elapsed') return;
  const request = beginLiveQuestRequest('discovery');
  if (!request) return;
  const { session, controller } = request;

  showQuestActionStatus(statusElement, 'checking', '正在確認搜尋結果…');
  try {
    const result = await session.checkQuestDiscovery(inventoryId, { signal: controller.signal });
    if (!isCurrentLiveQuestRequest(request) || !row.isConnected) return;
    if (result === null) {
      showQuestActionStatus(statusElement, 'unconfirmed', '伺服器尚未確認搜尋結果，請重試。');
      return;
    }
    if (result?.inventoryId !== inventoryId || !Number.isSafeInteger(result.questId) || result.questId <= 0
        || !Number.isSafeInteger(result.status) || result.status < 0 || result.status === QUEST_PENDING) {
      throw new SessionError('protocol');
    }

    if (row.dataset.questId !== String(result.questId)) {
      row.querySelector('.quest-name').textContent = '未取得名稱';
      const map = row.querySelector('.quest-map');
      map.textContent = '';
      map.hidden = true;
    }
    row.dataset.questId = String(result.questId);
    row.dataset.questStatus = String(result.status);
    row.cells[1].textContent = String(result.questId);
    row.cells[2].textContent = String(result.status);
    questCountdowns.splice(questCountdowns.indexOf(countdown), 1);
    countdown.element.remove();
    countdown.button.remove();
    showQuestActionStatus(statusElement, 'confirmed', '伺服器已確認搜尋結果。');
    appendQuestStart(row, result);
    displayQuestDecks();

    try {
      const snapshot = await session.readQuestInventory({ signal: controller.signal });
      if (snapshot && isCurrentLiveQuestRequest(request)) {
        await enrichQuestSnapshot(snapshot, controller.signal, session);
      }
    } catch {
      // Catalog metadata is optional once the server has confirmed the row.
    }
  } catch (error) {
    if (isCurrentLiveQuestRequest(request) && row.isConnected) {
      const kind = error instanceof SessionError ? error.kind : 'protocol';
      showQuestActionStatus(statusElement, 'failed', '無法確認搜尋結果，請重試。', kind);
    }
  } finally {
    finishLiveQuestRequest(request);
  }
}

function displayQuestSnapshot({ capacity, questFlag, questClearNum, rows, receivedAt }, newestEntry) {
  const values = [rows.length, capacity, questFlag, questClearNum];
  questUi.fields.forEach((field, index) => { field.textContent = String(values[index]); });

  for (const entry of newestEntry ? [newestEntry] : rows) {
    const row = appendQuestRow(questUi.rows, entry);
    const name = document.createElement('span');
    name.className = 'quest-name';
    name.id = `quest-name-${entry.inventoryId}`;
    name.textContent = entry.questId === 0 ? '尚未發現' : '未取得名稱';
    const map = document.createElement('span');
    map.className = 'quest-map';
    map.hidden = true;
    const description = row.insertCell();
    description.append(name, map);
    const rowReceivedAt = entry.receivedAt ?? receivedAt;
    if (entry.status === QUEST_PENDING && Number.isSafeInteger(entry.findSeconds)
        && Number.isFinite(rowReceivedAt) && rowReceivedAt >= 0) {
      const element = document.createElement('span');
      element.className = 'quest-countdown';
      element.setAttribute('role', 'timer');
      element.setAttribute('aria-live', 'off');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary quest-discovery-check';
      button.textContent = '確認搜尋結果';
      button.hidden = true;
      const statusElement = document.createElement('span');
      statusElement.className = 'quest-discovery-status';
      statusElement.setAttribute('role', 'status');
      statusElement.dataset.state = 'idle';
      description.append(element, button, statusElement);
      // Data reports truncated remaining seconds. A new Quest row has the exact duration.
      const tolerance = entry.receivedAt === undefined ? 1 : 0;
      const deadline = entry.findSeconds < 0 ? 0 : rowReceivedAt + (entry.findSeconds + tolerance) * 1000;
      const countdown = { element, deadline, button };
      questCountdowns.push(countdown);
      button.addEventListener('click', () => void confirmQuestDiscovery(row, entry.inventoryId, countdown, statusElement));
    }
    appendQuestStart(row, entry);
  }

  questUi.progress.hidden = false;
  questUi.inventory.hidden = rows.length === 0;
  displayQuestDecks();
  showQuestStatus(rows.length ? 'success' : 'empty');
  updateQuestCountdowns();
}

function showQuestDetails(quests) {
  const known = new Set([...questUi.detailList.children].map(detail => Number(detail.dataset.questId)));
  for (const quest of quests) {
    if (known.has(quest.id)) continue;
    const detail = questUi.detailTemplate.content.firstElementChild.cloneNode(true);
    const caption = detail.querySelector('.quest-caption');
    const lands = detail.querySelector('.quest-lands');
    setOriginalText(caption, quest.caption);

    for (const land of Array.isArray(quest.lands) ? quest.lands : []) {
      if (!Number.isSafeInteger(land?.id) || land.id <= 0) continue;
      const name = document.createElement('strong');
      name.className = 'quest-land-name';
      setOriginalText(name, land.name);
      const description = document.createElement('p');
      description.className = 'quest-land-caption quest-original-text';
      setOriginalText(description, land.caption);
      if (name.hidden && description.hidden) continue;
      const item = document.createElement('li');
      item.dataset.landId = String(land.id);
      item.append(name, description);
      lands.append(item);
    }

    lands.hidden = !lands.childElementCount;
    if (caption.hidden && lands.hidden) continue;
    detail.dataset.questId = String(quest.id);
    detail.querySelector('summary').textContent = typeof quest.name === 'string' && quest.name.trim()
      ? quest.name : `任務 ${quest.id}`;
    questUi.detailList.append(detail);
  }
  questUi.details.hidden = !questUi.detailList.childElementCount;
}

async function enrichQuestSnapshot({ rows, questFlag, questClearNum }, signal, session) {
  const ids = new Set(rows.map(({ questId }) => questId).filter(id => id > 0 && id <= MAX_CATALOG_ID));
  const mapId = questFlag + 1;
  const params = new URLSearchParams();
  if (Number.isInteger(mapId) && mapId > 0 && mapId <= MAX_CATALOG_ID) params.set('map', String(mapId));
  for (const id of ids) params.append('id', String(id));
  if (!params.size) return;

  const timeout = AbortSignal.timeout(3500);
  const response = await fetch(`/api/quest-catalog?${params}`, { signal: AbortSignal.any([signal, timeout]) });
  if (!response.ok) return;
  const { quests, map } = await response.json();
  if (signal.aborted || active !== session || !session.initialData) return;

  if (map?.id === mapId && Number.isSafeInteger(map.clearTarget) && map.clearTarget > 0) {
    const completed = Math.min(questClearNum, map.clearTarget);
    questUi.mapName.textContent = typeof map.name === 'string' && map.name ? map.name : `地圖 ${mapId}`;
    questUi.mapCount.textContent = `${completed} / ${map.clearTarget}`;
    questUi.mapProgress.dataset.mapId = String(mapId);
    questUi.mapProgress.hidden = false;
    searchUi.section.dataset.mapId = String(mapId);
    searchUi.cost.textContent = Number.isSafeInteger(map.ap) && map.ap >= 0 ? `${map.ap} 點行動力（AP）` : '行動力（AP）';
    searchUi.section.hidden = false;
    updateLiveQuestButtons();
  }
  if (map?.id === mapId) setOriginalText(questUi.mapCaption, map.caption);

  if (!Array.isArray(quests)) return;
  const catalog = new Map(quests.filter(quest => ids.has(quest?.id)).map(quest => [quest.id, quest]));
  for (const row of questUi.rows.rows) {
    const quest = catalog.get(Number(row.dataset.questId));
    if (!quest) continue;
    if (typeof quest.name === 'string' && quest.name) row.querySelector('.quest-name').textContent = quest.name;
    if (typeof quest.map === 'string' && quest.map) {
      const map = row.querySelector('.quest-map');
      map.textContent = quest.map;
      map.hidden = false;
    }
    const cost = row.querySelector('.quest-start-cost');
    if (cost && Number.isSafeInteger(quest.ap) && quest.ap >= 0) {
      cost.textContent = `消耗 ${quest.ap} 點行動力（AP）`;
      cost.hidden = false;
    }
    const land = quest.firstLand;
    if (Number.isInteger(land?.slot) && land.slot >= 0 && land.slot <= 2 && Number.isSafeInteger(land.id) && land.id > 0
        && Number.isSafeInteger(land.enemyId) && land.enemyId > 0 && typeof land.name === 'string' && land.name.trim()) {
      questFirstLands.set(quest.id, land);
      appendQuestLandOption(row);
    }
  }
  showQuestDetails(catalog.values());
  updateLiveQuestButtons();
}

async function startQuestSearch() {
  if (searchUi.start.disabled) return;
  const request = beginLiveQuestRequest('search');
  if (!request) return;
  const { session, controller } = request;
  const { signal } = controller;
  showQuestActionStatus(searchUi.status, 'starting', '正在向伺服器開始搜尋…');

  try {
    const { row, energy } = await session.startQuestSearch({ signal });
    if (!isCurrentLiveQuestRequest(request)) return;
    if (!Number.isSafeInteger(row?.inventoryId) || row.inventoryId <= 0 || row.questId !== 0
        || row.status !== QUEST_PENDING || !Number.isSafeInteger(row.findSeconds)
        || !Number.isFinite(row.receivedAt) || row.receivedAt < 0 || !Number.isSafeInteger(energy) || energy < 0) {
      throw new SessionError('search-uncertain');
    }

    ui.avatarEnergy.textContent = `${energy} / ${session.initialData.avatar.energyMax}`;
    showQuestActionStatus(searchUi.status, 'started', '伺服器已開始搜尋。');
    try {
      const snapshot = await session.readQuestInventory({ signal });
      if (!isCurrentLiveQuestRequest(request)) return;
      const newestEntry = snapshot?.rows.find(entry => entry.inventoryId === row.inventoryId);
      if (!newestEntry || questUi.rows.querySelector(`[data-inventory-id="${row.inventoryId}"]`)) {
        throw new SessionError('protocol');
      }
      displayQuestSnapshot(snapshot, { ...newestEntry, receivedAt: row.receivedAt });
    } catch {
      if (isCurrentLiveQuestRequest(request)) {
        showQuestActionStatus(searchUi.status, 'started', '伺服器已開始搜尋。請重新讀取任務資料以查看倒數。');
      }
    }
  } catch (error) {
    if (!isCurrentLiveQuestRequest(request)) return;
    const kind = error instanceof SessionError ? error.kind : 'search-uncertain';
    if (kind === 'search-rejected') {
      const reason = questSearchRejected[error.code];
      showQuestActionStatus(searchUi.status, 'rejected', reason ? `${reason}。` : '伺服器拒絕開始搜尋。', kind, error.code);
    } else if (kind === 'search-uncertain') {
      searchUi.status.dataset.state = 'uncertain';
      updateQuestSearchRecovery();
    } else {
      showQuestActionStatus(searchUi.status, 'failed', '無法開始搜尋，請重試。', kind);
    }
  } finally {
    finishLiveQuestRequest(request);
  }
}

function showNewsState(state, message = '') {
  newsUi.details.dataset.state = state;
  newsUi.status.textContent = message;
  newsUi.status.hidden = !message;
  newsUi.content.hidden = state !== 'ready';
  newsUi.retry.hidden = state !== 'failed';
}

function clearNews() {
  newsRequest?.abort();
  newsRequest = null;
  newsUi.details.open = false;
  newsUi.content.replaceChildren();
  showNewsState('idle');
}

async function loadNews() {
  const session = active;
  if (!session?.initialData || newsRequest) return;

  const controller = new AbortController();
  newsRequest = controller;
  const isCurrent = () => newsRequest === controller && active === session && session.initialData;
  showNewsState('loading', '正在讀取最新消息…');
  try {
    const timeout = AbortSignal.timeout(3500);
    const response = await fetch('/public/news.xml', {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([controller.signal, timeout]),
    });
    if (!isCurrent()) return;
    if (response.status === 404) {
      if (newsUi.details.contains(document.activeElement)) ui.title.focus({ preventScroll: true });
      newsUi.details.hidden = true;
      newsUi.details.open = false;
      showNewsState('unavailable');
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = await response.text();
    if (!isCurrent()) return;
    const content = readNews(source);
    const hasText = Boolean(content.textContent.trim());
    newsUi.content.replaceChildren(content);
    if (hasText) showNewsState('ready');
    else showNewsState('empty', '目前沒有公告。');
  } catch {
    if (isCurrent()) showNewsState('failed', '暫時無法讀取最新消息。請重試。');
  } finally {
    if (newsRequest === controller) newsRequest = null;
  }
}

function show(state, label, detail = '', kind) {
  const signedIn = state === 'signed-in';
  ui.status.dataset.state = state;
  if (kind) ui.status.dataset.errorKind = kind;
  else delete ui.status.dataset.errorKind;
  ui.status.textContent = label;
  ui.detail.textContent = detail;
  ui.form.hidden = signedIn;
  ui.fields.disabled = state === 'working' || signedIn;
  ui.result.hidden = !signedIn;
  ui.signOut.hidden = !signedIn;
  questUi.section.hidden = !signedIn || !active?.initialData?.avatar;
  newsUi.details.hidden = !signedIn;
  if (!signedIn) {
    clearNews();
    clearLiveQuest();
    questRequest?.abort();
    questRequest = null;
    clearQuestResults();
    showQuestStatus('idle');
    ui.id.textContent = '—';
    displayBootstrap(null);
    for (const field of [ui.lobby, ui.data, ui.chat]) {
      field.textContent = '—';
      delete field.dataset.verified;
    }
  }
}

function showFailure(error) {
  const kind = error instanceof SessionError && Object.hasOwn(errors, error.kind) ? error.kind : 'protocol';
  const [label, detail] = errors[kind];
  show('failed', label, detail, kind);
}

function startExchange(signal) {
  try {
    return startSession(ui.username.value, ui.password.value, { signal });
  } finally {
    clearField(ui.password);
  }
}

function handleDisconnect(connection, reason) {
  if (active !== connection) return;
  active = null;
  clearField(ui.password);
  if (reason === 'expired') {
    show('failed', '工作階段已逾時', '請重新登入。', 'expired');
  } else {
    show('failed', '連線已中斷', '請確認服務連線後重新登入。', 'network');
  }
}

ui.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending || active || !ui.form.checkValidity()) return;

  const controller = new AbortController();
  pending = controller;
  show('working', '正在驗證登入', '正在連線認證、大廳、資料與全域聊天。');

  try {
    const session = await startExchange(controller.signal);
    if (pending !== controller) {
      await session.close();
      return;
    }
    const initialData = session.initialData;
    if (!Number.isSafeInteger(session.playerId) || session.lobbyVerified !== true
      || session.dataVerified !== true || session.chatVerified !== true || !initialData) {
      await session.close();
      if (pending === controller) showFailure();
      return;
    }

    active = session;
    clearField(ui.username);
    ui.id.textContent = String(session.playerId);
    for (const field of [ui.lobby, ui.data, ui.chat]) {
      field.textContent = '已驗證';
      field.dataset.verified = 'true';
    }
    displayBootstrap(initialData);
    show('signed-in', '登入成功');
    void session.closed.then((reason) => handleDisconnect(session, reason), () => handleDisconnect(session, 'network'));
  } catch (error) {
    if (pending === controller) showFailure(error);
  } finally {
    if (pending === controller) pending = null;
  }
});

questUi.load.addEventListener('click', async () => {
  const session = active;
  if (!session?.initialData?.avatar || questUi.load.disabled) return;

  questRequest?.abort();
  const controller = new AbortController();
  questRequest = controller;
  clearQuestResults();
  showQuestStatus('loading');
  try {
    const snapshot = await session.readQuestInventory({ signal: controller.signal });
    if (questRequest !== controller || active !== session || !session.initialData) return;
    if (!snapshot) throw new SessionError('protocol');
    displayQuestSnapshot(snapshot);
    await enrichQuestSnapshot(snapshot, controller.signal, session).catch(() => {});
  } catch (error) {
    if (questRequest === controller) {
      clearQuestResults();
      const kind = error instanceof SessionError && Object.hasOwn(errors, error.kind) ? error.kind : 'protocol';
      showQuestStatus('failed', kind);
    }
  } finally {
    if (questRequest === controller) questRequest = null;
  }
});

function appendMapEntries(list, ids) {
  if (!ids.every(Number.isSafeInteger)) throw new SessionError('protocol');
  for (const id of ids) {
    const entry = document.createElement('li');
    entry.dataset.mapId = String(id);
    entry.textContent = String(id);
    list.append(entry);
  }
}

function appendServiceInventory(tableBody, rows) {
  if (!rows.every(row => [row?.inventoryId, row?.questId, row?.status].every(Number.isSafeInteger))) {
    throw new SessionError('protocol');
  }
  for (const row of rows) appendQuestRow(tableBody, row);
}

async function readLiveQuest(view, method, appendRows) {
  const request = beginLiveQuestRequest('read');
  if (!request) return;

  clearLiveQuestResults(view);
  showLiveQuestStatus(view, 'loading');
  try {
    const entries = await request.session[method]({ signal: request.controller.signal });
    if (!isCurrentLiveQuestRequest(request)) return;
    if (!Array.isArray(entries)) throw new SessionError('protocol');
    appendRows(view.rows, entries);
    view.count.textContent = String(entries.length);
    (view.table ?? view.rows).hidden = entries.length === 0;
    view.result.hidden = false;
    showLiveQuestStatus(view, entries.length ? 'success' : 'empty');
  } catch (error) {
    if (isCurrentLiveQuestRequest(request)) {
      showLiveQuestStatus(view, 'failed', error instanceof SessionError ? error.kind : 'protocol');
    }
  } finally {
    finishLiveQuestRequest(request);
  }
}

mapsUi.load.addEventListener('click', () => {
  void readLiveQuest(mapsUi, 'readQuestMaps', appendMapEntries);
});
serviceInventoryUi.load.addEventListener('click', () => {
  void readLiveQuest(serviceInventoryUi, 'readQuestServiceInventory', appendServiceInventory);
});
searchUi.start.addEventListener('click', () => void startQuestSearch());
questDeckUi.select.addEventListener('change', updateLiveQuestButtons);

document.addEventListener('visibilitychange', updateQuestCountdowns);

newsUi.details.addEventListener('toggle', () => {
  if (newsUi.details.open && newsUi.details.dataset.state === 'idle') void loadNews();
});
newsUi.retry.addEventListener('click', () => {
  if (document.activeElement === newsUi.retry) newsUi.summary.focus({ preventScroll: true });
  void loadNews();
});

ui.signOut.addEventListener('click', async () => {
  if (!active || pending) return;
  const session = active;
  const controller = new AbortController();
  pending = controller;
  active = null;
  clearField(ui.username);
  clearField(ui.password);
  show('working', '正在登出');

  try {
    await session.close();
    if (pending === controller) {
      show('idle', '尚未登入', '已關閉工作階段連線。');
      ui.username.focus({ preventScroll: true });
    }
  } catch {
    if (pending === controller) show('failed', '登出確認失敗', '連線結束時發生錯誤，請重新登入。', 'network');
  } finally {
    if (pending === controller) pending = null;
  }
});

window.addEventListener('pagehide', () => {
  pending?.abort();
  pending = null;
  const session = active;
  active = null;
  if (session) void session.close().catch(() => {});
  clearField(ui.username);
  clearField(ui.password);
  show('idle', '尚未登入');
});

show('idle', '尚未登入');
