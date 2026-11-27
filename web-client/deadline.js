const SEARCH_DURATION_MS = 8000;
const STORAGE_KEY = 'unlight.deadline.search-id';
const HISTORY_STORAGE_KEY = 'unlight.deadline.search-history';
const HISTORY_LIMIT = 16;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const deadlineFormat = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Taipei',
});
const ui = {
  main: document.querySelector('#deadline'),
  start: document.querySelector('#deadline-start'),
  refresh: document.querySelector('#deadline-refresh'),
  status: document.querySelector('#deadline-status'),
  countdown: document.querySelector('#deadline-countdown'),
  progress: document.querySelector('#deadline-progress'),
  detail: document.querySelector('#deadline-detail'),
  id: document.querySelector('#deadline-search-id'),
  findAt: document.querySelector('#deadline-find-at'),
  findAtEmpty: document.querySelector('#deadline-find-at-empty'),
  result: document.querySelector('#deadline-result'),
  resultId: document.querySelector('#deadline-result-id'),
  history: document.querySelector('#deadline-history'),
  historyStatus: document.querySelector('#deadline-history-status'),
  historyRefresh: document.querySelector('#deadline-history-refresh'),
  historyList: document.querySelector('#deadline-history-list'),
  historyTemplate: document.querySelector('#deadline-history-template'),
};
const labels = {
  idle: '尚未開始',
  starting: '正在啟動',
  checking: '正在查詢',
  pending: '搜尋中',
  ready: '搜尋完成',
  failed: '暫時無法確認',
};

let searchId = null;
let snapshot = null;
let requestPending = false;
let retryMethod = 'GET';
let localDeadline = 0;
let nextDeadlineCheck = Infinity;
let clockTimer;
let historyIds = [];
let historyRequest = null;

function renderActions() {
  ui.start.hidden = searchId !== null && snapshot?.status !== 'ready';
  ui.start.disabled = requestPending;
  ui.start.textContent = searchId === null ? '開始搜尋' : '開始下一次搜尋';
  ui.refresh.hidden = searchId === null;
  ui.refresh.disabled = requestPending;
  ui.refresh.textContent = ui.main.dataset.state === 'failed' ? '重試連線' : '查詢狀態';
}

function setState(state, detail) {
  ui.main.dataset.state = state;
  ui.status.textContent = labels[state];
  ui.detail.textContent = detail;
  renderActions();
}

function renderTime(element, timestamp) {
  element.textContent = deadlineFormat.format(timestamp);
  element.dateTime = new Date(timestamp).toISOString();
  element.dataset.timestamp = String(timestamp);
}

function renderRecord() {
  ui.id.textContent = searchId ?? '—';
  ui.findAt.hidden = snapshot === null;
  ui.findAtEmpty.hidden = snapshot !== null;
  if (snapshot) {
    renderTime(ui.findAt, snapshot.find_at_ms);
  } else {
    ui.findAt.textContent = '';
    ui.findAt.removeAttribute('datetime');
    delete ui.findAt.dataset.timestamp;
  }
  const ready = snapshot?.status === 'ready';
  ui.result.hidden = !ready;
  ui.resultId.textContent = ready ? snapshot.result.id : '';
}

function renderRemaining(remaining) {
  ui.countdown.textContent = (Math.ceil(remaining / 100) / 10).toFixed(1);
  ui.progress.value = Math.max(0, SEARCH_DURATION_MS - remaining);
}

function updateClock() {
  clearTimeout(clockTimer);
  if (snapshot?.status !== 'pending') {
    renderRemaining(snapshot?.status === 'ready' ? 0 : SEARCH_DURATION_MS);
    return;
  }

  const now = performance.now();
  const remaining = Math.max(0, localDeadline - now);
  renderRemaining(remaining);
  if (document.hidden) return;
  if (now >= nextDeadlineCheck && !requestPending) {
    nextDeadlineCheck = Infinity;
    void querySearch('GET');
  } else if (remaining > 0 || Number.isFinite(nextDeadlineCheck)) {
    clockTimer = setTimeout(updateClock, remaining > 0 ? Math.min(100, remaining) : 100);
  }
}

function validateSnapshot(data, id) {
  const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
  if (data?.id !== id || !timestamp(data.find_at_ms) || !timestamp(data.server_now_ms)
      || !['pending', 'ready'].includes(data.status)
      || (data.status === 'ready' && (typeof data.result?.id !== 'string' || !data.result.id))) {
    throw new Error('Invalid search snapshot');
  }
  return data;
}

function normalizeHistory(values) {
  const ids = new Set();
  for (const value of values) {
    const id = typeof value === 'string' ? value.toLowerCase() : '';
    if (UUID.test(id)) ids.add(id);
    if (ids.size === HISTORY_LIMIT) break;
  }
  return [...ids];
}

function historyFromStorage() {
  try {
    const values = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY));
    return Array.isArray(values) ? normalizeHistory(values) : [];
  } catch {
    return [];
  }
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyIds));
  } catch {
    // Keep the session's list available if history storage is unavailable.
  }
}

function rememberSearch(id) {
  historyIds = normalizeHistory([id, ...historyFromStorage(), ...historyIds]);
  persistHistory();
}

function setHistoryState(state, message) {
  ui.history.dataset.state = state;
  ui.historyStatus.textContent = message;
  ui.historyRefresh.disabled = historyIds.length === 0 || state === 'loading';
}

function renderHistory(searches) {
  const openIds = new Set([...ui.historyList.querySelectorAll('details[open]')]
    .map(details => details.closest('[data-search-id]').dataset.searchId));
  const focusedId = document.activeElement?.closest('#deadline-history-list [data-search-id]')?.dataset.searchId;
  let nextFocus;
  const rows = searches.map(search => {
    const row = ui.historyTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.searchId = search.id;
    row.dataset.state = search.status;
    row.querySelector('details').open = openIds.has(search.id);
    row.querySelector('.history-label').textContent = `搜尋 ${search.id.slice(0, 8)}`;
    row.querySelector('.history-current').hidden = search.id !== searchId;
    row.querySelector('.history-row-status').textContent = labels[search.status];
    row.querySelector('.history-search-id').textContent = search.id;
    renderTime(row.querySelector('.history-time'), search.find_at_ms);
    if (search.status === 'ready') row.querySelector('.history-result-id').textContent = search.result.id;
    else row.querySelector('.history-row-result').remove();
    if (search.id === focusedId) nextFocus = row.querySelector('summary');
    return row;
  });
  ui.historyList.replaceChildren(...rows);
  ui.historyList.hidden = rows.length === 0;
  nextFocus?.focus({ preventScroll: true });
}

function cancelHistoryRefresh() {
  historyRequest?.abort();
  historyRequest = null;
}

async function refreshHistory() {
  cancelHistoryRefresh();
  const ids = [...historyIds];
  if (!ids.length) {
    setHistoryState('empty', '尚無搜尋紀錄。');
    return;
  }

  const controller = new AbortController();
  historyRequest = controller;
  setHistoryState('loading', '正在查詢最近搜尋…');
  try {
    const response = await fetch('/api/searches/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4500)]),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { searches } = await response.json();
    if (historyRequest !== controller) return;
    const byId = new Map();
    if (!Array.isArray(searches)) throw new Error('Invalid search history');
    for (const search of searches) {
      if (!ids.includes(search?.id) || byId.has(search.id)) throw new Error('Unexpected search in history');
      byId.set(search.id, validateSnapshot(search, search.id));
    }
    const confirmed = ids.filter(id => byId.has(id)).map(id => byId.get(id));
    renderHistory(confirmed);
    if (confirmed.length) setHistoryState('ready', `已讀取 ${confirmed.length} 筆搜尋紀錄。`);
    else setHistoryState('empty', '尚無搜尋紀錄。');
  } catch {
    if (historyRequest === controller) setHistoryState('failed', '暫時無法更新搜尋紀錄。');
  } finally {
    if (historyRequest === controller) historyRequest = null;
  }
}

function acceptSnapshot(data) {
  snapshot = data;
  retryMethod = 'GET';
  const receivedAt = performance.now();
  localDeadline = receivedAt + Math.max(0, data.find_at_ms - data.server_now_ms);
  // Repeated pending replies near the deadline must not spin an immediate request loop.
  nextDeadlineCheck = data.status === 'pending' ? Math.max(localDeadline, receivedAt + 250) : Infinity;
  renderRecord();
  if (data.status === 'ready') setState('ready', '伺服器已確認這筆搜尋的結果。');
  else setState('pending', '倒數依伺服器送回的截止時間計算。');
}

function requestSearch(id, method) {
  return fetch(`/api/searches/${id}`, { method, cache: 'no-store', signal: AbortSignal.timeout(4500) });
}

async function querySearch(method) {
  if (requestPending || searchId === null) return;
  requestPending = true;
  retryMethod = method;
  let refreshRecent = method === 'PUT';
  const id = searchId;
  if (method === 'PUT') setState('starting', '正在向伺服器啟動這筆搜尋。');
  else setState('checking', '正在向伺服器確認這筆搜尋。');

  try {
    let response = await requestSearch(id, method);
    if (method === 'GET' && response.status === 404 && snapshot === null) {
      retryMethod = 'PUT';
      refreshRecent = true;
      setState('starting', '正在用已保存的編號接續搜尋。');
      response = await requestSearch(id, 'PUT');
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = validateSnapshot(await response.json(), id);
    refreshRecent ||= data.status === 'ready' && snapshot?.status !== 'ready';
    acceptSnapshot(data);
  } catch {
    setState('failed', '保留原本的搜尋編號。連線恢復後可重試。');
  } finally {
    requestPending = false;
    renderActions();
    updateClock();
    if (refreshRecent) void refreshHistory();
  }
}

function startSearch() {
  if (requestPending || (searchId !== null && snapshot?.status !== 'ready')) return;
  let id;
  try {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    setState('failed', '瀏覽器無法建立或保存搜尋編號。請確認網站可以使用本機儲存後再試。');
    return;
  }

  clearTimeout(clockTimer);
  cancelHistoryRefresh();
  rememberSearch(id);
  const previousCurrent = ui.historyList.querySelector('.history-current:not([hidden])');
  if (previousCurrent) previousCurrent.hidden = true;
  searchId = id;
  snapshot = null;
  nextDeadlineCheck = Infinity;
  renderRecord();
  updateClock();
  void querySearch('PUT');
}

function resumeSearch() {
  if (!document.hidden) void querySearch(retryMethod);
}

function resumePage() {
  if (document.hidden) return;
  resumeSearch();
  void refreshHistory();
}

ui.start.addEventListener('click', startSearch);
ui.refresh.addEventListener('click', resumeSearch);
ui.historyRefresh.addEventListener('click', () => void refreshHistory());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(clockTimer);
  else resumePage();
});
window.addEventListener('online', resumePage);
window.addEventListener('pagehide', () => {
  clearTimeout(clockTimer);
  cancelHistoryRefresh();
});
window.addEventListener('pageshow', (event) => { if (event.persisted) resumePage(); });

try {
  const saved = localStorage.getItem(STORAGE_KEY)?.toLowerCase();
  if (saved && UUID.test(saved)) {
    searchId = saved;
    renderRecord();
    void querySearch('GET');
  }
} catch {
  setState('failed', '瀏覽器無法讀取已保存的搜尋編號。請確認網站可以使用本機儲存後再試。');
}

historyIds = historyFromStorage();
if (searchId && !historyIds.includes(searchId)) rememberSearch(searchId);
else if (historyIds.length) persistHistory();
void refreshHistory();
