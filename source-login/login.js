import { registerAccount, SessionError, startSession } from '/session.js';
import { playTitleAlert } from './bgm.js';

const form = document.querySelector('#login');
const fields = document.querySelector('#login-fields');
const title = document.querySelector('#login-title');
const submit = document.querySelector('#login-submit');
const accountMode = document.querySelector('#account-mode');
const username = document.querySelector('#username');
const password = document.querySelector('#password');
const confirmation = document.querySelector('#confirm-password');
const email = document.querySelector('#email');
const status = document.querySelector('#login-status');
const loginAlert = document.querySelector('#login-alert');
const loginAlertMessage = document.querySelector('#login-alert-message');

const failureMessages = {
  credentials: '認證失敗',
  network: '無法連線至遊戲服務。請稍後再試。',
  timeout: '遊戲服務未及時回覆。請再試一次。',
  protocol: '無法驗證遊戲服務的回覆。請再試一次。',
  cancelled: '登入已取消。',
};

const registrationFailures = {
  ...failureMessages,
  cancelled: '建立帳號已取消。',
  'account-register-invalid': '請確認帳號和密碼的格式。',
  'account-name-taken': '此帳號名稱已有人使用。',
  'account-register-rejected': '遊戲服務未接受這次建立帳號。',
  'account-register-uncertain': '尚未確認帳號是否已建立。請先嘗試登入。',
};

let currentAttempt = null;
let alertReturnFocus = null;

function showStatus(state, message = '', kind) {
  status.dataset.state = state;
  status.textContent = message;
  if (kind) status.dataset.errorKind = kind;
  else delete status.dataset.errorKind;
}

function showError(kind, message, field) {
  showStatus('error', '', kind);
  loginAlertMessage.textContent = message;
  alertReturnFocus = field;
  loginAlert.showModal();
  playTitleAlert();
}

function showInputError(registering) {
  if (!username.validity.valid) {
    if (username.validity.valueMissing) showError('name-required', '請輸入名字。', username);
    else showError('name-invalid', '請確認帳號格式。', username);
    return true;
  }
  if (!password.validity.valid) {
    const kind = password.validity.valueMissing ? 'password-required' : 'password-invalid';
    const message = registering ? '請確認密碼欄位。' : failureMessages.credentials;
    showError(kind, message, password);
    return true;
  }
  if (registering && !email.validity.valid) {
    if (email.validity.valueMissing) showError('email-required', '請輸入 Email。', email);
    else showError('email-invalid', '請確認 Email 格式。', email);
    return true;
  }
  if (registering && confirmation.value !== password.value) {
    showError('password-mismatch', '兩次輸入的密碼不一致。', confirmation);
    return true;
  }
  return false;
}

function clearPasswords() {
  password.value = '';
  confirmation.value = '';
}

function setMode(mode) {
  const registering = mode === 'register';
  form.dataset.mode = mode;
  title.textContent = registering ? 'Register' : 'Login';
  submit.textContent = title.textContent;
  accountMode.textContent = registering ? 'Login Form' : 'Create New Account';
  password.autocomplete = registering ? 'new-password' : 'current-password';
  for (const field of [email, confirmation]) {
    field.closest('label').hidden = !registering;
    field.disabled = !registering;
    field.required = registering;
  }
  clearPasswords();
  if (!registering) email.value = '';
}

function closeSession(attempt) {
  if (!attempt.session) return Promise.resolve();
  attempt.closing ??= Promise.resolve().then(() => attempt.session.close());
  return attempt.closing;
}

accountMode.addEventListener('click', () => {
  if (currentAttempt || loginAlert.open) return;
  const restoreFocus = document.activeElement === accountMode;
  setMode(form.dataset.mode === 'register' ? 'login' : 'register');
  showStatus('idle');
  if (restoreFocus) username.focus({ preventScroll: true });
});

loginAlert.addEventListener('close', () => {
  if (loginAlert.open) return;
  alertReturnFocus?.focus({ preventScroll: true });
  alertReturnFocus = null;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (currentAttempt || loginAlert.open) return;

  const registering = form.dataset.mode === 'register';
  if (showInputError(registering)) return;
  const accountName = username.value;
  const secret = password.value;

  const attempt = { controller: new AbortController(), session: null, closing: null };
  currentAttempt = attempt;
  const restoreFocus = form.contains(document.activeElement);
  let target = password;
  let loginFailure;
  clearPasswords();
  fields.disabled = true;
  accountMode.disabled = true;
  showStatus('working', registering ? '正在建立帳號…' : '正在登入…');
  if (restoreFocus) status.focus({ preventScroll: true });

  try {
    const options = { signal: attempt.controller.signal };
    if (registering) {
      await registerAccount(accountName, secret, options);
      if (currentAttempt !== attempt) return;
      setMode('login');
      showStatus('success', '帳號建立成功。請輸入密碼登入。');
      return;
    }

    const session = await startSession(accountName, secret, options);
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
    const messages = registering ? registrationFailures : failureMessages;
    const kind = error instanceof SessionError && Object.hasOwn(messages, error.kind) ? error.kind : 'network';
    if (kind === 'account-name-taken') target = username;
    if (registering) showStatus('error', messages[kind], kind);
    else loginFailure = kind;
  } finally {
    await closeSession(attempt).catch(() => {});
    if (currentAttempt === attempt) {
      currentAttempt = null;
      fields.disabled = false;
      accountMode.disabled = false;
      if (loginFailure) {
        showError(loginFailure, failureMessages[loginFailure], target);
      } else if (restoreFocus && document.activeElement === status) {
        target.focus({ preventScroll: true });
      }
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
  alertReturnFocus = null;
  if (loginAlert.open) loginAlert.close();
  loginAlertMessage.textContent = '';
  clearPasswords();
  email.value = '';
  fields.disabled = false;
  accountMode.disabled = false;
  showStatus('idle');
});

fields.disabled = false;
