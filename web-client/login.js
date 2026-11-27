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
  avatarFields: ['name', 'id', 'level', 'gems', 'exp', 'energy'].map(field => document.querySelector(`#session-avatar-${field}`)),
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
  inventory: document.querySelector('#session-quest-inventory'),
  rows: document.querySelector('#session-quest-rows'),
  fields: ['count', 'capacity', 'flag', 'clear-count'].map(field => document.querySelector(`#session-quest-${field}`)),
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
  idle: '可查看登入時取得的任務清單與進度。',
  loading: '正在讀取任務資料…',
  empty: '登入時的任務清單沒有項目。',
  success: '已讀取登入時的任務資料。',
  failed: '無法讀取任務資料，請重試。',
};
const MAX_CATALOG_ID = 0x7fffffff;

let pending = null;
let active = null;
let questRequest = null;
let newsRequest = null;

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
    ? [avatar.name, avatar.id, avatar.level, avatar.gems, avatar.exp, `${avatar.energy} / ${avatar.energyMax}`]
    : [];
  ui.avatarFields.forEach((field, index) => { field.textContent = avatarValues[index] ?? ''; });
  const registrationValues = registration ? [registration.partCount, registration.cardCount] : [];
  ui.registrationFields.forEach((field, index) => { field.textContent = registrationValues[index] ?? ''; });
}

function showQuestStatus(state, kind) {
  questUi.status.dataset.state = state;
  questUi.status.textContent = questStatuses[state];
  if (kind) questUi.status.dataset.errorKind = kind;
  else delete questUi.status.dataset.errorKind;
  questUi.load.disabled = state === 'loading';
}

function clearQuestResults() {
  questUi.progress.hidden = true;
  questUi.mapProgress.hidden = true;
  delete questUi.mapProgress.dataset.mapId;
  questUi.mapName.textContent = '';
  questUi.mapCount.textContent = '';
  questUi.inventory.hidden = true;
  questUi.rows.replaceChildren();
  for (const field of questUi.fields) field.textContent = '';
}

function displayQuestSnapshot({ capacity, questFlag, questClearNum, rows }) {
  const values = [rows.length, capacity, questFlag, questClearNum];
  questUi.fields.forEach((field, index) => { field.textContent = String(values[index]); });

  for (const { inventoryId, questId, status } of rows) {
    const row = questUi.rows.insertRow();
    row.dataset.inventoryId = String(inventoryId);
    row.dataset.questId = String(questId);
    row.dataset.questStatus = String(status);
    for (const value of [inventoryId, questId, status]) row.insertCell().textContent = String(value);

    const name = document.createElement('span');
    name.className = 'quest-name';
    name.textContent = questId === 0 ? '尚未發現' : '未取得名稱';
    const map = document.createElement('span');
    map.className = 'quest-map';
    map.hidden = true;
    row.insertCell().append(name, map);
  }

  questUi.progress.hidden = false;
  questUi.inventory.hidden = rows.length === 0;
  showQuestStatus(rows.length ? 'success' : 'empty');
}

async function enrichQuestSnapshot({ rows, questFlag, questClearNum }, signal) {
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
  if (signal.aborted) return;

  if (map?.id === mapId && Number.isSafeInteger(map.clearTarget) && map.clearTarget > 0) {
    const completed = Math.min(questClearNum, map.clearTarget);
    questUi.mapName.textContent = typeof map.name === 'string' && map.name ? map.name : `地圖 ${mapId}`;
    questUi.mapCount.textContent = `${completed} / ${map.clearTarget}`;
    questUi.mapProgress.dataset.mapId = String(mapId);
    questUi.mapProgress.hidden = false;
  }

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
    if (questRequest !== controller) return;
    if (!snapshot) throw new SessionError('protocol');
    displayQuestSnapshot(snapshot);
    await enrichQuestSnapshot(snapshot, controller.signal).catch(() => {});
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
