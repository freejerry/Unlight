import { startSession, SessionError } from './session.js';

const ui = {
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
};

const errors = {
  credentials: ['登入被拒絕', '請確認帳號與密碼，再重新登入。'],
  network: ['連線失敗', '請確認認證、大廳、資料與全域聊天服務可用，再重新登入。'],
  protocol: ['登入驗證失敗', '伺服器的登入回覆不符合原版規格。'],
  timeout: ['登入逾時', '未在時限內收到完整回覆，請重新登入。'],
  cancelled: ['登入已取消', '你可以重新登入。'],
};

let pending = null;
let active = null;

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
  if (!signedIn) {
    ui.id.textContent = '—';
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
    if (!Number.isSafeInteger(session.playerId) || session.lobbyVerified !== true || session.dataVerified !== true || session.chatVerified !== true) {
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
    show('signed-in', '登入成功');
    void session.closed.then((reason) => handleDisconnect(session, reason), () => handleDisconnect(session, 'network'));
  } catch (error) {
    if (pending === controller) showFailure(error);
  } finally {
    if (pending === controller) pending = null;
  }
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
