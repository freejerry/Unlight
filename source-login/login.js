import { SessionError, startSession } from '/session.js';

const form = document.querySelector('#login');
const fields = document.querySelector('#login-fields');
const username = document.querySelector('#username');
const password = document.querySelector('#password');
const status = document.querySelector('#login-status');

const failureMessages = {
  credentials: '登入失敗。請確認帳號和密碼。',
  network: '無法連線至遊戲服務。請稍後再試。',
  timeout: '遊戲服務未及時回覆。請再試一次。',
  protocol: '無法驗證遊戲服務的回覆。請再試一次。',
  cancelled: '登入已取消。',
};

let currentAttempt = null;

function showStatus(state, message = '', kind) {
  status.dataset.state = state;
  status.textContent = message;
  if (kind) status.dataset.errorKind = kind;
  else delete status.dataset.errorKind;
}

function authenticate(signal) {
  const secret = password.value;
  password.value = '';
  return startSession(username.value, secret, { signal });
}

function closeSession(attempt) {
  if (!attempt.session) return Promise.resolve();
  attempt.closing ??= Promise.resolve().then(() => attempt.session.close());
  return attempt.closing;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (currentAttempt || !form.reportValidity()) return;

  const attempt = { controller: new AbortController(), session: null, closing: null };
  currentAttempt = attempt;
  const restoreFocus = form.contains(document.activeElement);
  let target = password;
  fields.disabled = true;
  showStatus('working', '正在登入…');
  if (restoreFocus) status.focus({ preventScroll: true });

  try {
    const session = await authenticate(attempt.controller.signal);
    attempt.session = session;
    if (currentAttempt !== attempt) return;
    if (!Number.isSafeInteger(session?.playerId) || session.playerId < 1 || !session.initialData
        || session.lobbyVerified !== true || session.dataVerified !== true || session.chatVerified !== true) {
      throw new SessionError('protocol');
    }
    await closeSession(attempt);
    if (currentAttempt !== attempt) return;
    username.value = '';
    target = username;
    showStatus('success', '登入成功。');
  } catch (error) {
    if (currentAttempt !== attempt) return;
    const kind = error instanceof SessionError && Object.hasOwn(failureMessages, error.kind) ? error.kind : 'network';
    showStatus('error', failureMessages[kind], kind);
  } finally {
    await closeSession(attempt).catch(() => {});
    if (currentAttempt === attempt) {
      currentAttempt = null;
      fields.disabled = false;
      if (restoreFocus && document.activeElement === status) target.focus({ preventScroll: true });
    }
  }
});

window.addEventListener('pagehide', () => {
  const attempt = currentAttempt;
  currentAttempt = null;
  if (attempt) {
    attempt.controller.abort();
    void closeSession(attempt).catch(() => {});
  }
  password.value = '';
  fields.disabled = false;
  showStatus('idle');
});

fields.disabled = false;
