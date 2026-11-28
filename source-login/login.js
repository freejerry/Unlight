import { registerAccount, SessionError, startSession } from '/session.js';
import { fadeTitleMusic, playBackClick, playLobbyClick, playQuestBattleEffect, playTitleAlert, selectQuestDuelMusic } from './bgm.js';
import { mountLobby } from './lobby.js';
import { mountLobbyMainItem } from './lobby-main-item.js';
import { mountOnboarding } from './onboarding.js';
import { mountOptions } from './options.js';
import { mountQuestMap } from './quest-map.js';
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
const friendConfirm = document.querySelector('#lobby-friend-confirm');
const friendConfirmForm = friendConfirm.querySelector('form');
const friendConfirmMessage = document.querySelector('#lobby-friend-confirm-message');
const friendConfirmNo = document.querySelector('#lobby-friend-confirm-no');

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

const friendPrompts = {
  apply: name => `要向${name}\n申請成為朋友嗎？`,
  accept: name => `要同意${name}\n成為您的朋友嗎？`,
  remove: (name, status) => status === 3 ? `要解除對${name}的封鎖嗎？` : `要把${name}\n從朋友名單中刪除嗎？`,
  block: name => `確定要封鎖 ${name} 嗎？`,
};

// BaseCtrl.errorAlert uses the Traditional Chinese Const.ERROR_STR values directly.
const friendWarnings = {
  60: '無法向此玩家申請好友',
  61: '玩家拒絕您的申請',
  62: '無法刪除此玩家',
  63: '朋友數已到達最大值,無法再申請了(包含等待認證中的)',
  64: '對方好友數已達到最大值無法申請',
  65: '無法封鎖此玩家',
  66: '已達到最大封鎖人數',
};

let currentAttempt = null;
let alertReturnFocus = null;
let activeSession = null;
let cleanupScreen;
let optionExit;
let itemRoute;
let questRoute;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const lobbyFadeMs = 800 / 1.7;
const sineOut = CSS.supports('animation-timing-function', 'linear(0, .7071, 1)')
  ? 'linear(0, .1951, .3827, .5556, .7071, .8315, .9239, .9808, 1)'
  : 'cubic-bezier(.39, .575, .565, 1)';

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
  loginAlertTitle.lang = heading === 'Error' ? 'en' : 'zh-Hant-TW';
  loginAlertMessage.textContent = message;
  alertReturnFocus = field;
  loginAlert.showModal();
  playTitleAlert();
}

function showError(kind, message, field, alertKind = 'error') {
  showStatus('error', '', kind);
  openAlert(alertKind, 'Error', message, field);
}

function showScopedAlert(kind, heading, message, field, signal) {
  if (signal.aborted || loginAlert.open || friendConfirm.open) return;
  openAlert(kind, heading, message, field);
  loginAlertOK.focus({ preventScroll: true });
  const listeners = new AbortController();
  loginAlert.addEventListener('close', () => {
    if (!loginAlert.open) listeners.abort();
  }, { signal: listeners.signal });
  const closeOnAbort = () => {
    listeners.abort();
    if (loginAlert.open && loginAlert.dataset.kind === kind) {
      alertReturnFocus = null;
      loginAlert.close();
    }
  };
  signal.addEventListener('abort', closeOnAbort, { once: true, signal: listeners.signal });
}

function showFriendSearchError(field, signal) {
  showScopedAlert('lobby-friend-search-error', 'Error', '最少需要3個字', field, signal);
}

function showFriendWarning(code, { focus, signal }) {
  if (Number.isInteger(code) && Object.hasOwn(friendWarnings, code)) {
    showScopedAlert('lobby-friend-warning', '警告', friendWarnings[code], focus, signal);
  }
}

function confirmLobbyFriend(action, { name, status, focus, signal }) {
  if (signal.aborted || loginAlert.open || friendConfirm.open || !Object.hasOwn(friendPrompts, action) ||
      typeof name !== 'string' || !name) return Promise.resolve(false);

  friendConfirm.dataset.action = action;
  friendConfirmMessage.textContent = friendPrompts[action](name, status);
  friendConfirm.showModal();
  friendConfirmNo.focus({ preventScroll: true });
  return new Promise(resolve => {
    const listeners = new AbortController();
    function finish(answer, clicked) {
      listeners.abort();
      friendConfirm.close();
      delete friendConfirm.dataset.action;
      friendConfirmMessage.textContent = '';
      if (clicked) playBackClick();
      if (!signal.aborted && focus?.isConnected) focus.focus({ preventScroll: true });
      resolve(answer && !signal.aborted);
    }
    friendConfirmForm.addEventListener('submit', event => {
      event.preventDefault();
      finish(event.submitter?.value === 'yes', true);
    }, { signal: listeners.signal });
    friendConfirm.addEventListener('cancel', event => {
      event.preventDefault();
      finish(false, true);
    }, { signal: listeners.signal });
    friendConfirm.addEventListener('close', () => {
      if (!friendConfirm.open) finish(false, false);
    }, { signal: listeners.signal });
    signal.addEventListener('abort', () => finish(false, false), { once: true, signal: listeners.signal });
  });
}

function confirmLobbyReward({ name }, signal) {
  if (signal.aborted || loginAlert.open) return Promise.resolve();
  openAlert('lobby-selectable-reward', '情報', `獲得了${name}。`);
  loginAlertOK.focus({ preventScroll: true });
  return new Promise(resolve => {
    const listeners = new AbortController();
    function finish() {
      listeners.abort();
      resolve();
    }
    loginAlert.addEventListener('close', finish, { once: true, signal: listeners.signal });
    signal.addEventListener('abort', () => {
      if (loginAlert.dataset.kind === 'lobby-selectable-reward') loginAlert.close();
      finish();
    }, { once: true, signal: listeners.signal });
  });
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

function changeScreen(screen, soundscape = screen) {
  optionExit?.cancel();
  optionExit = undefined;
  delete stage.dataset.optionTransition;
  delete stage.dataset.itemTransition;
  delete stage.dataset.questTransition;
  cleanupScreen?.();
  cleanupScreen = undefined;
  postLogin.replaceChildren();
  postLogin.hidden = screen === 'title';
  postLogin.dataset.screen = screen;
  stage.dataset.screen = screen;
  changeSoundscape(soundscape);
}

function returnToTitle(session, reason, focus = true) {
  if (activeSession !== session) return;
  activeSession = null;
  itemRoute?.controller.abort();
  itemRoute?.animation?.cancel();
  itemRoute = undefined;
  questRoute?.controller.abort();
  questRoute?.animation?.cancel();
  questRoute = undefined;
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

function showLobby(session, returnFocus) {
  if (activeSession !== session || !session.initialData?.avatar) return;
  changeScreen('lobby');
  const fadeIn = returnFocus && !reducedMotion.matches
    ? view => view.animate([{ opacity: 0 }, { opacity: 1 }], { duration: lobbyFadeMs, easing: sineOut })
    : undefined;
  cleanupScreen = mountLobby(postLogin, {
    session,
    fadeIn,
    returnFocus,
    onOptions: () => switchOptions(session, true),
    onMainItem: () => switchMainItem(session, true),
    onQuest: () => openQuest(session),
    onSelectableClaimed: confirmLobbyReward,
    onFriendSearchInvalid: showFriendSearchError,
    onFriendConfirm: confirmLobbyFriend,
    onFriendError: showFriendWarning,
  });
}

async function switchOptions(session, opening) {
  const current = opening ? 'lobby' : 'options';
  const view = postLogin.firstElementChild;
  if (!view || activeSession !== session || stage.dataset.screen !== current || optionExit || itemRoute || questRoute) return;
  if (opening) session.refreshLobbyAvatar?.();

  if (!reducedMotion.matches) {
    view.inert = true;
    stage.dataset.optionTransition = opening ? 'to-options' : 'to-lobby';
    const duration = opening ? lobbyFadeMs : 1000;
    // OptionView.hide2 removes the avatar after the scene has faded to black.
    const total = duration + (opening ? 0 : 500 / 1.7);
    const frames = [{ opacity: 1, easing: sineOut }, { opacity: 0, offset: duration / total }];
    if (!opening) frames.push({ opacity: 0 });
    const animation = view.animate(frames, { duration: total, fill: 'forwards' });
    optionExit = animation;
    await animation.finished.catch(() => {});
    if (optionExit !== animation || activeSession !== session) return;
  }

  if (opening) {
    changeScreen('options', 'lobby');
    cleanupScreen = mountOptions(postLogin, {
      session,
      onBack: () => switchOptions(session, false),
      onFriendSearchInvalid: showFriendSearchError,
      onFriendConfirm: confirmLobbyFriend,
      onFriendError: showFriendWarning,
    });
  } else {
    showLobby(session, '#lobby-option-open');
  }
}

async function switchMainItem(session, opening) {
  const current = opening ? 'lobby' : 'main-item';
  const view = postLogin.firstElementChild;
  if (!view || activeSession !== session || stage.dataset.screen !== current || optionExit || questRoute) return;
  if (opening ? Boolean(itemRoute) : !itemRoute || itemRoute.leaving) return;

  if (opening) {
    itemRoute = { controller: new AbortController() };
    playLobbyClick();
    session.checkLobbyItemEntry({ signal: itemRoute.controller.signal });
  } else {
    itemRoute.leaving = true;
  }
  const route = itemRoute;
  const { signal } = route.controller;
  view.inert = true;
  stage.dataset.itemTransition = opening ? 'to-item' : 'from-item';
  if (!reducedMotion.matches) {
    const duration = lobbyFadeMs + (opening ? 0 : 500 / 1.7);
    const frames = [{ opacity: 1, easing: sineOut }, { opacity: 0, offset: lobbyFadeMs / duration }];
    // The ItemView exits through the AvatarView hide thread while the container is already black.
    if (!opening) frames.push({ opacity: 0 });
    route.animation = view.animate(frames, { duration, fill: 'forwards' });
    await route.animation.finished.catch(() => {});
    if (itemRoute !== route || signal.aborted) return;
  }
  if (!opening) {
    itemRoute = undefined;
    route.controller.abort();
    showLobby(session, '#lobby-main-item-open');
    return;
  }

  changeScreen('main-item', 'lobby');
  stage.dataset.itemTransition = 'joining';
  const scene = mountLobbyMainItem(postLogin, {
    session,
    signal,
    onBack: () => switchMainItem(session, false),
    onItemUsed({ name }, focus) {
      showScopedAlert('lobby-main-item-used', '訊息', `使用了${name}`, focus, signal);
    },
  });
  cleanupScreen = scene.dispose;
  const itemView = postLogin.firstElementChild;
  itemView.inert = true;
  if (!reducedMotion.matches) {
    // ItemView joins the avatar and the title animations before attaching its container to the stage.
    const joinMs = (0.2 + 1.5 + 0.8) * 1000 / 1.7;
    route.animation = itemView.animate([{ opacity: 0 }, { opacity: 0 }], { duration: joinMs, fill: 'both' });
  }
  await Promise.allSettled([scene.ready, route.animation?.finished]);
  if (itemRoute !== route || signal.aborted) return;
  route.animation?.cancel();
  route.animation = undefined;
  itemView.inert = false;
  delete stage.dataset.itemTransition;
  itemView.querySelector('h1[tabindex="-1"]')?.focus({ preventScroll: true });
}

async function fadeQuestRoute(route, transition) {
  const view = postLogin.firstElementChild;
  if (!view) return;
  view.inert = true;
  stage.dataset.questTransition = transition;
  if (reducedMotion.matches) return;
  route.animation = view.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: lobbyFadeMs, easing: sineOut, fill: 'forwards',
  });
  await route.animation.finished.catch(() => {});
  route.animation = undefined;
}

function mountQuestWait(route) {
  const view = document.createElement('section');
  view.id = 'quest-pending-view';
  view.innerHTML = `
    <p class="sr-only" role="status">正在連線至任務。</p>
    <button id="quest-pending-back" type="button" aria-label="返回大廳">
      <img src="/source-login/option-art/back.png" width="48" height="32" alt="">
      <img class="quest-pending-back-over" src="/source-login/option-art/back-over.png" width="48" height="32" alt="">
    </button>`;
  const back = view.querySelector('button');
  back.addEventListener('click', () => {
    back.disabled = true;
    playBackClick();
    route.controller.abort();
  }, { once: true });
  view.addEventListener('keydown', event => {
    if (event.key === 'Escape') back.click();
  });
  postLogin.append(view);
  back.focus({ preventScroll: true });
  return () => view.remove();
}

function returnFromQuest(route, message = '') {
  if (questRoute !== route) return;
  questRoute = undefined;
  route.controller.abort();
  showLobby(route.session, '#lobby-quest-load');
  if (message) openAlert('quest-error', 'Error', message, postLogin.querySelector('#lobby-quest-load'));
}

async function leaveQuest(route) {
  if (questRoute !== route || route.leaving) return;
  route.leaving = true;
  await fadeQuestRoute(route, 'to-lobby');
  if (questRoute !== route) return;
  changeScreen('quest-exiting', 'silent');
  try {
    await route.scene.close();
    returnFromQuest(route);
  } catch {
    returnFromQuest(route, '無法確認任務連線已關閉。請重新整理並登入後再試。');
  }
}

async function openQuest(session) {
  if (activeSession !== session || stage.dataset.screen !== 'lobby' || questRoute || optionExit || itemRoute) return;
  const route = { session, controller: new AbortController() };
  const { signal } = route.controller;
  questRoute = route;
  session.refreshLobbyAvatar?.();
  playLobbyClick();
  changeSoundscape('silent');
  await fadeQuestRoute(route, 'to-quest');
  if (questRoute !== route) return;
  changeScreen('quest-pending', 'quest');
  cleanupScreen = mountQuestWait(route);
  try {
    route.scene = await session.openQuestScene({ signal });
    if (questRoute !== route || signal.aborted) {
      await route.scene.close();
      returnFromQuest(route);
      return;
    }
    changeScreen('quest-map', 'quest');
    cleanupScreen = mountQuestMap(postLogin, {
      session,
      snapshot: route.scene.snapshot,
      scene: route.scene,
      onBack: () => leaveQuest(route),
      onEncounter({ stage: duelStage, isBoss = false }) {
        if (questRoute !== route || route.leaving || stage.dataset.soundscape === 'quest-duel') return;
        selectQuestDuelMusic(duelStage, isBoss);
        changeSoundscape('quest-duel');
      },
      onBattleFinish() {
        if (questRoute === route && !route.leaving) changeSoundscape('silent');
      },
      onBattleReturn() {
        if (questRoute !== route || route.leaving) return;
        session.refreshLobbyAvatar?.();
        changeSoundscape('quest');
      },
      onBattleSound(cue) {
        if (questRoute !== route || route.leaving) return;
        if (cue === 'confirm') playBackClick();
        else playQuestBattleEffect(cue, signal);
      },
      onAlert(kind, message, focus) {
        if (questRoute !== route || route.leaving || loginAlert.open) return;
        const warning = ['quest-search-rejected', 'quest-empty-deck', 'quest-start-rejected', 'quest-land-rejected'];
        let heading = warning.includes(kind) ? '警告' : 'Error';
        if (kind === 'quest-reward-item-used') heading = '信息';
        openAlert(kind, heading, message, focus?.isConnected ? focus : postLogin.querySelector('#quest-map-back'));
        if (kind === 'quest-reward-item-used') loginAlertOK.focus({ preventScroll: true });
      },
    });
    void route.scene.closed.then(() => {
      if (!route.leaving) returnFromQuest(route, '任務連線已中斷。請重新整理並登入後再試。');
    });
  } catch (error) {
    try {
      await route.scene?.close();
    } catch (closeError) {
      error = closeError;
    }
    const message = error?.kind === 'quest-return-uncertain'
      ? '無法確認任務連線已關閉。請重新整理並登入後再試。'
      : signal.aborted ? '' : '任務連線未完成。請再試一次。';
    returnFromQuest(route, message);
  }
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
