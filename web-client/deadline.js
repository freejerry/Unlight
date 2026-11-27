const SEARCH_DURATION_MS = 8000;
const STORAGE_KEY = 'unlight.deadline.search-id';
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

function renderRecord() {
  ui.id.textContent = searchId ?? '—';
  ui.findAt.hidden = snapshot === null;
  ui.findAtEmpty.hidden = snapshot !== null;
  ui.findAt.textContent = snapshot ? deadlineFormat.format(snapshot.find_at_ms) : '';
  if (snapshot) {
    ui.findAt.dateTime = new Date(snapshot.find_at_ms).toISOString();
    ui.findAt.dataset.timestamp = String(snapshot.find_at_ms);
  } else {
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
  const id = searchId;
  if (method === 'PUT') setState('starting', '正在向伺服器啟動這筆搜尋。');
  else setState('checking', '正在向伺服器確認這筆搜尋。');

  try {
    let response = await requestSearch(id, method);
    if (method === 'GET' && response.status === 404 && snapshot === null) {
      retryMethod = 'PUT';
      setState('starting', '正在用已保存的編號接續搜尋。');
      response = await requestSearch(id, 'PUT');
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    acceptSnapshot(validateSnapshot(await response.json(), id));
  } catch {
    setState('failed', '保留原本的搜尋編號。連線恢復後可重試。');
  } finally {
    requestPending = false;
    renderActions();
    updateClock();
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

ui.start.addEventListener('click', startSearch);
ui.refresh.addEventListener('click', resumeSearch);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(clockTimer);
  else resumeSearch();
});
window.addEventListener('online', resumeSearch);
window.addEventListener('pagehide', () => clearTimeout(clockTimer));
window.addEventListener('pageshow', (event) => { if (event.persisted) resumeSearch(); });

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && UUID.test(saved)) {
    searchId = saved;
    renderRecord();
    void querySearch('GET');
  }
} catch {
  setState('failed', '瀏覽器無法讀取已保存的搜尋編號。請確認網站可以使用本機儲存後再試。');
}
