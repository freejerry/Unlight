import { registerAccount, SessionError, startSession } from '/session.js';
import { fadeTitleMusic, playTitleAlert } from './bgm.js';
import { mountLobby } from './lobby.js';
import { mountOnboarding } from './onboarding.js';
import { startLoginTransition } from './stage.js';

const stage = document.querySelector('#stage');
const postLogin = document.querySelector('#post-login');
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
const loginAlertTitle = document.querySelector('#login-alert-title');
const loginAlertMessage = document.querySelector('#login-alert-message');
const loginAlertOK = document.querySelector('#login-alert-ok');

const failureMessages = {
  credentials: '認證失敗',
  network: '無法連線至遊戲服務。請稍後再試。',
  timeout: '遊戲服務未及時回覆。請再試一次。',
  protocol: '無法驗證遊戲服務的回覆。請再試一次。',
  cancelled: '登入已取消。',
  expired: '工作階段已逾時。請重新登入。',
};

const registrationFailures = {
  ...failureMessages,
  cancelled: '建立帳號已取消。',
  'account-register-invalid': '請確認帳號和密碼的格式。',
  'account-name-taken': '此帳號名稱已有人使用。',
  'account-register-rejected': '遊戲服務未接受這次建立帳號。',
  'account-register-uncertain': '尚未確認帳號是否已建立。請先嘗試登入。',
};
const registrationRejectionDetails = [
  '「名字無效」',
  '「郵件地址無效」',
  '無法與伺服器連線。請按下更新鈕,重新登錄。',
];

let currentAttempt = null;
let alertReturnFocus = null;
let activeSession = null;
let cleanupScreen;

function showStatus(state, message = '', kind) {
  const authenticating = state === 'working' && form.dataset.mode === 'login';
  status.dataset.state = state;
  status.textContent = message;
  status.classList.toggle('sr-only', authenticating);
  status.ariaLabel = authenticating ? '正在登入' : null;
  if (kind) status.dataset.errorKind = kind;
  else delete status.dataset.errorKind;
}

function openAlert(kind, heading, message, field = null) {
  loginAlert.dataset.kind = kind;
  loginAlertTitle.textContent = heading;
  loginAlertTitle.lang = kind === 'registration-success' ? 'zh-Hant-TW' : 'en';
  loginAlertMessage.textContent = message;
  alertReturnFocus = field;
  loginAlert.showModal();
  playTitleAlert();
}

function showError(kind, message, field, alertKind = 'error') {
  showStatus('error', '', kind);
  openAlert(alertKind, 'Error', message, field);
}

function confirmRegistration(signal) {
  if (signal.aborted) return Promise.resolve(false);
  showStatus('success');
  openAlert('registration-success', '登錄完畢', '登錄成功');
  return new Promise(resolve => {
    const listeners = new AbortController();
    function finish(confirmed) {
      listeners.abort();
      resolve(confirmed);
    }
    function acknowledge(event) {
      event.preventDefault();
      finish(true);
      loginAlert.close();
    }
    loginAlertOK.addEventListener('click', acknowledge, { signal: listeners.signal });
    // An OK-only Flex Alert calls the original completion handler on Escape too.
    loginAlert.addEventListener('cancel', acknowledge, { signal: listeners.signal });
    loginAlert.addEventListener('close', () => finish(false), { signal: listeners.signal });
    signal.addEventListener('abort', () => finish(false), { signal: listeners.signal });
  });
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

function changeSoundscape(soundscape) {
  stage.dataset.soundscape = soundscape;
  stage.dispatchEvent(new Event('game-screen-change'));
}

function changeScreen(screen) {
  cleanupScreen?.();
  cleanupScreen = undefined;
  postLogin.replaceChildren();
  postLogin.hidden = screen === 'title';
  postLogin.dataset.screen = screen;
  stage.dataset.screen = screen;
  changeSoundscape(screen);
}

function returnToTitle(session, reason, focus = true) {
  if (activeSession !== session) return;
  activeSession = null;
  currentAttempt?.transition?.cancel();
  currentAttempt?.restoreTitleMusic?.();
  changeScreen('title');
  showStatus('idle');
  if (reason && reason !== 'closed') {
    const kind = reason === 'expired' ? 'expired' : 'network';
    showError(kind, failureMessages[kind], username);
  } else if (focus) {
    username.focus({ preventScroll: true });
  }
}

function requestLogout(session) {
  if (activeSession !== session) return;
  void session.close().catch(() => returnToTitle(session, 'network'));
}

function showLobby(session) {
  if (activeSession !== session || !session.initialData?.avatar) return;
  changeScreen('lobby');
  cleanupScreen = mountLobby(postLogin, { session });
}

function showPostLogin(session) {
  if (session.initialData.avatar) {
    showLobby(session);
  } else if (session.initialData.registration) {
    changeScreen('onboarding');
    cleanupScreen = mountOnboarding(postLogin, {
      session,
      onTutorialStart: () => {
        if (activeSession === session) changeSoundscape('tutorial');
      },
      onComplete: () => showLobby(session),
      onLogout: () => requestLogout(session),
    });
  } else {
    throw new SessionError('protocol');
  }
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
  delete loginAlert.dataset.kind;
  alertReturnFocus?.focus({ preventScroll: true });
  alertReturnFocus = null;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (currentAttempt || loginAlert.open) return;

  let registering = form.dataset.mode === 'register';
  if (showInputError(registering)) return;
  const accountName = username.value;
  let secret = password.value;

  const attempt = { controller: new AbortController(), session: null, closing: null, transition: null };
  const forgetSecret = () => { secret = ''; };
  attempt.controller.signal.addEventListener('abort', forgetSecret, { once: true });
  currentAttempt = attempt;
  const restoreFocus = form.contains(document.activeElement);
  let target = password;
  let failure;
  let focusAfterDismissal = false;
  clearPasswords();
  fields.disabled = true;
  accountMode.disabled = true;
  showStatus('working', registering ? '正在建立帳號…' : '');
  if (restoreFocus) status.focus({ preventScroll: true });

  try {
    const options = { signal: attempt.controller.signal };
    if (registering) {
      await registerAccount(accountName, secret, options);
      if (currentAttempt !== attempt) return;
      const confirmed = await confirmRegistration(options.signal);
      if (currentAttempt !== attempt) return;
      setMode('login');
      if (!confirmed) {
        forgetSecret();
        showStatus('idle');
        focusAfterDismissal = true;
        return;
      }
      registering = false;
      showStatus('working');
    }

    const authentication = startSession(accountName, secret, {
      ...options,
      onAuthenticated() {
        if (currentAttempt === attempt && !attempt.transition) {
          attempt.restoreTitleMusic = fadeTitleMusic();
          attempt.transition = startLoginTransition(options);
        }
      },
    });
    forgetSecret();
    const session = await authentication;
    attempt.session = session;
    if (currentAttempt !== attempt) return;
    if (!Number.isSafeInteger(session?.playerId) || session.playerId < 1 || !session.initialData
        || session.lobbyVerified !== true || session.dataVerified !== true || session.chatVerified !== true) {
      throw new SessionError('protocol');
    }
    activeSession = session;
    void session.closed.then(reason => returnToTitle(session, reason), () => returnToTitle(session, 'network'));
    try {
      if (attempt.transition) {
        const revealed = await attempt.transition.reveal(() => {
          if (currentAttempt === attempt && activeSession === session) showPostLogin(session);
        });
        if (!revealed || currentAttempt !== attempt || activeSession !== session) return;
      } else {
        showPostLogin(session);
      }
    } catch (error) {
      returnToTitle(session, null, false);
      throw error;
    }
    attempt.session = null;
    username.value = '';
    showStatus('idle');
  } catch (error) {
    if (currentAttempt !== attempt) return;
    const messages = registering ? registrationFailures : failureMessages;
    const kind = error instanceof SessionError && Object.hasOwn(messages, error.kind) ? error.kind : 'network';
    if (kind === 'account-name-taken') target = username;
    let message = messages[kind];
    let alertKind = 'error';
    if ((kind === 'account-name-taken' || kind === 'account-register-rejected')
        && Number.isInteger(error.code) && error.code > 0 && error.code <= 7) {
      const details = registrationRejectionDetails.filter((_, index) => error.code & (1 << index));
      message = ['在以下的註冊項目裏有錯誤', ...details].join('\n');
      alertKind = 'registration-error';
    }
    attempt.transition?.cancel();
    attempt.restoreTitleMusic?.();
    failure = { kind, message, alertKind };
  } finally {
    forgetSecret();
    attempt.controller.signal.removeEventListener('abort', forgetSecret);
    await closeSession(attempt).catch(() => {});
    if (currentAttempt === attempt) {
      currentAttempt = null;
      fields.disabled = false;
      accountMode.disabled = false;
      if (failure) {
        showError(failure.kind, failure.message, target, failure.alertKind);
      } else if (focusAfterDismissal || (restoreFocus && document.activeElement === status)) {
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
  const session = activeSession;
  if (session) {
    returnToTitle(session, null, false);
    if (attempt?.session !== session) void session.close().catch(() => {});
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
