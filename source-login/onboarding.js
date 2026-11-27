import { SessionError } from '/session.js';

const catalogUrl = '/api/avatar-starter-catalog';
const partLabels = ['素體', '眼睛', '嘴型', '髮型'];
const titles = {
  intro: '序幕',
  name: '設定名字',
  appearance: '選擇外觀',
  starter: '選擇起始角色卡',
};
// The original first-run TutorialView advances from the opening to Quest, then
// battle and the lobby. These native instructions do not play the original films.
const chapters = [
  ['遊戲教學', '在大廳可查看角色、行動力與 Gem，也能讀取最新消息和目前持有的任務。'],
  ['任務', '探索時，在任務地圖選擇區域並搜尋。取得任務後，打開任務卡、選擇牌組，再進入關卡。'],
  ['戰鬥', '每回合依序進行移動、攻擊與防禦。選擇手牌後確認操作。攻防的擲骰結果會影響造成的傷害。'],
  ['進入大廳', '準備好後，進入大廳查看剛建立的角色與任務資料。'],
];
const failureMessages = {
  'avatar-name-invalid': '此虛擬人物名無法使用。',
  'avatar-name-taken': '此名稱已存在。請輸入其他名稱。',
  'avatar-name-uncertain': '尚未確認名稱是否可用。請登出後重新登入。',
  'avatar-starter-invalid': '請重新選擇外觀部件及起始角色卡。',
  'avatar-create-rejected': '伺服器拒絕建立角色。請確認名稱與選項後再試。',
  'avatar-create-uncertain': '尚未確認角色是否已建立。請登出後重新登入。',
  'avatar-registration-unavailable': '目前無法建立角色。請登出後重新登入。',
  'avatar-tutorial-uncertain': '角色已建立。請登出後重新登入以讀取角色資料。',
};

function fillOptions(select, choices, placeholder) {
  select.replaceChildren(new Option(placeholder, ''), ...choices.map(({ id, name }) => new Option(name, String(id))));
}

async function readCatalog(options, signal) {
  const response = await fetch(catalogUrl, {
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
  });
  if (!response.ok) throw new Error('Starter catalog unavailable');
  const { parts, cards } = await response.json();
  const named = ({ id, name }) => Number.isSafeInteger(id) && id > 0 && typeof name === 'string' && name.trim();
  const partsById = new Map(parts.filter(named).map(part => [part.id, part]));
  const cardsById = new Map(cards.filter(named).map(card => [card.id, card]));
  const appearance = options.partGroups.map((group, type) => group.map(id => partsById.get(id))
    .filter(part => part?.type === type));
  const starterCards = options.cardIds.map(id => cardsById.get(id)).filter(Boolean);
  if (appearance.some(group => !group.length) || !starterCards.length) throw new Error('Missing starter choices');
  return { appearance, starterCards };
}

function bindPreview(select, preview, collection) {
  function updateVisibility() {
    preview.hidden = !preview.complete || preview.naturalWidth === 0;
  }

  function refresh() {
    preview.hidden = true;
    if (select.value) {
      preview.src = `/source-login/assets/${collection}/${select.value}`;
      updateVisibility();
    } else preview.removeAttribute('src');
  }

  select.addEventListener('change', refresh);
  preview.addEventListener('load', updateVisibility);
  preview.addEventListener('error', () => { preview.hidden = true; });
  return refresh;
}

export function mountOnboarding(host, { session, onComplete, onLogout, onTutorialStart }) {
  const controller = new AbortController();
  const { signal } = controller;
  const root = document.createElement('section');
  root.id = 'onboarding';
  root.setAttribute('aria-labelledby', 'onboarding-title');
  root.innerHTML = `
    <header class="onboarding-header">
      <h1 id="onboarding-title" tabindex="-1"></h1>
      <button id="onboarding-logout" type="button">登出</button>
    </header>
    <div class="onboarding-content">
      <ol class="onboarding-steps" aria-label="創角進度">
        <li data-marker="name">名字</li>
        <li data-marker="appearance">外觀</li>
        <li data-marker="starter">起始角色卡</li>
      </ol>
      <form id="onboarding-form" autocomplete="off" novalidate>
        <fieldset class="onboarding-fields">
          <legend class="sr-only">建立角色</legend>
          <div data-page="intro">
            <p>建立角色後，就能帶著起始角色卡從大廳出發。</p>
            <button class="onboarding-primary" id="onboarding-start" type="button">開始建立角色</button>
          </div>
          <div data-page="name" hidden>
            <label for="onboarding-name">角色名稱</label>
            <input id="onboarding-name" type="text" minlength="3" maxlength="12" spellcheck="false" required aria-describedby="onboarding-name-help">
            <p id="onboarding-name-help">請輸入 3 至 12 個字。名稱不能含空白、逗號、雙引號或連續三個星號。</p>
          </div>
          <div class="onboarding-parts" data-page="appearance" hidden>
            ${partLabels.map((label, index) => `
              <div class="onboarding-part">
                <label for="onboarding-part-${index}">${label}</label>
                <select id="onboarding-part-${index}" required></select>
                <img id="onboarding-preview-${index}" width="42" height="42" alt="" hidden>
              </div>`).join('')}
          </div>
          <div class="onboarding-starter" data-page="starter" hidden>
            <div class="onboarding-starter-choice">
              <label for="onboarding-card">起始角色卡</label>
              <select id="onboarding-card" required></select>
              <p>請選擇一張卡片。</p>
            </div>
            <img id="onboarding-card-portrait" alt="" hidden>
          </div>
          <div data-page="tutorial" hidden>
            <p id="onboarding-chapter-copy"></p>
            <div class="onboarding-actions">
              <button id="onboarding-tutorial-skip" type="button">略過教學</button>
              <button class="onboarding-primary" id="onboarding-tutorial-next" type="button">下一段</button>
            </div>
          </div>
          <div class="onboarding-actions" data-wizard-actions hidden>
            <button id="onboarding-back" type="button">上一步</button>
            <button class="onboarding-primary" id="onboarding-next" type="button">下一步</button>
            <button class="onboarding-primary" id="onboarding-create" type="button" hidden>建立角色</button>
          </div>
        </fieldset>
      </form>
      <p id="onboarding-status" role="status" aria-atomic="true" tabindex="-1" data-state="idle"></p>
      <button id="onboarding-retry" type="button" hidden>重試</button>
    </div>`;
  host.replaceChildren(root);

  const find = selector => root.querySelector(selector);
  const form = find('#onboarding-form');
  const fields = find('.onboarding-fields');
  const title = find('#onboarding-title');
  const name = find('#onboarding-name');
  const parts = partLabels.map((_, index) => find(`#onboarding-part-${index}`));
  const refreshPartPreviews = parts.map((select, index) =>
    bindPreview(select, find(`#onboarding-preview-${index}`), 'starter-parts'));
  const card = find('#onboarding-card');
  bindPreview(card, find('#onboarding-card-portrait'), 'starter-cards');
  const start = find('#onboarding-start');
  const next = find('#onboarding-next');
  const create = find('#onboarding-create');
  const status = find('#onboarding-status');
  const retry = find('#onboarding-retry');
  const logout = find('#onboarding-logout');
  const tutorialNext = find('#onboarding-tutorial-next');
  const tutorialSkip = find('#onboarding-tutorial-skip');
  const options = session.avatarRegistrationOptions;

  let retryAction;
  let catalogReady = false;
  let checkedName;
  let receipt;
  let chapter = 0;
  let completed = false;

  function showStatus(state = 'idle', message = '', kind, action) {
    status.dataset.state = state;
    status.textContent = message;
    if (kind) status.dataset.errorKind = kind;
    else delete status.dataset.errorKind;
    retryAction = action;
    retry.hidden = !action;
  }

  function showStep(step, focus = title) {
    root.dataset.step = step;
    if (step !== 'tutorial') title.textContent = titles[step];
    for (const page of root.querySelectorAll('[data-page]')) page.hidden = page.dataset.page !== step;
    for (const marker of root.querySelectorAll('[data-marker]')) {
      if (marker.dataset.marker === step) marker.setAttribute('aria-current', 'step');
      else marker.removeAttribute('aria-current');
    }
    const wizard = step === 'name' || step === 'appearance' || step === 'starter';
    find('.onboarding-steps').hidden = !wizard;
    find('[data-wizard-actions]').hidden = !wizard;
    find('#onboarding-back').hidden = step === 'name';
    const finalStep = step === 'starter';
    next.hidden = finalStep;
    next.type = finalStep ? 'button' : 'submit';
    create.hidden = !finalStep;
    create.type = finalStep ? 'submit' : 'button';
    showStatus();
    focus.focus();
  }

  function pending(message) {
    fields.disabled = true;
    showStatus('working', message);
    status.focus();
  }

  function showFailure(error, fallback) {
    const kind = error instanceof SessionError && Object.hasOwn(failureMessages, error.kind) ? error.kind : fallback;
    const available = session.avatarRegistrationState === 'available';
    const badName = kind === 'avatar-name-invalid' || kind === 'avatar-name-taken';
    fields.disabled = !available;
    if (available && badName) showStep('name', name);
    showStatus(available ? 'rejected' : 'uncertain', failureMessages[kind], kind);
    if (!available) logout.focus();
    else if (!badName) status.focus();
  }

  async function confirmName() {
    const value = name.value;
    const message = value.length < 3 ? '最少需要3個字' : failureMessages['avatar-name-invalid'];
    if (value.length < 3 || value.length > 12 || /[ ",\u3000]|\*{3}|\p{Cc}|\p{Cs}/u.test(value)) {
      showStatus('rejected', message, 'avatar-name-invalid');
      name.focus();
      return;
    }

    pending('正在確認名稱與讀取起始選項…');
    try {
      if (checkedName !== value) await session.checkAvatarName(value, { signal });
      checkedName = value;
    } catch (error) {
      if (!signal.aborted) showFailure(error, 'avatar-registration-unavailable');
      return;
    }
    if (signal.aborted) return;

    try {
      if (!catalogReady) {
        const { appearance, starterCards } = await readCatalog(options, signal);
        if (signal.aborted) return;
        parts.forEach((select, index) => fillOptions(select, appearance[index], '請選擇'));
        if (appearance[0].some(({ id }) => id === 1)) parts[0].value = '1';
        refreshPartPreviews.forEach(refresh => refresh());
        fillOptions(card, starterCards, '請選擇起始角色卡');
        catalogReady = true;
      }
      fields.disabled = false;
      showStep('appearance', parts[0]);
    } catch {
      if (signal.aborted) return;
      fields.disabled = false;
      showStatus('failed', '暫時無法讀取起始選項。', 'catalog-unavailable', confirmName);
      retry.focus();
    }
  }

  function confirmAppearance() {
    const unselected = parts.find(select => !select.value);
    if (unselected) {
      showStatus('rejected', '有未選擇的項目', 'avatar-starter-invalid');
      unselected.focus();
      return;
    }
    showStep('starter', card);
  }

  function showChapter() {
    const [heading, content] = chapters[chapter];
    const last = chapter === chapters.length - 1;
    title.textContent = heading;
    find('#onboarding-chapter-copy').textContent = content;
    root.dataset.chapter = String(chapter);
    tutorialNext.textContent = last ? '進入大廳' : '下一段';
    tutorialSkip.hidden = last;
    showStep('tutorial');
  }

  async function enterTutorial() {
    pending('角色已建立，正在讀取資料…');
    try {
      const avatar = await session.enterAvatarTutorial({ signal });
      if (signal.aborted) return;
      const published = session.initialData?.avatar;
      if (avatar?.id !== receipt.avatarId || avatar.name !== receipt.name || published?.id !== receipt.avatarId
          || published.name !== receipt.name || session.initialData.registration) {
        throw new SessionError('avatar-tutorial-uncertain');
      }
    } catch {
      if (signal.aborted) return;
      const safeRetry = session.avatarRegistrationState === 'confirmed';
      const message = safeRetry ? '角色已建立。請重試讀取角色資料。' : failureMessages['avatar-tutorial-uncertain'];
      showStatus(safeRetry ? 'failed' : 'uncertain', message,
        'avatar-tutorial-uncertain', safeRetry ? enterTutorial : undefined);
      (safeRetry ? retry : logout).focus();
      return;
    }
    fields.disabled = false;
    showChapter();
    onTutorialStart?.();
  }

  async function confirmStarter() {
    if (!card.value) {
      showStatus('rejected', '未選擇卡片', 'avatar-starter-invalid');
      card.focus();
      return;
    }
    const choice = { name: name.value, partIds: parts.map(select => Number(select.value)), cardId: Number(card.value) };
    pending('正在建立角色…');
    try {
      receipt = await session.createAvatar(choice, { signal });
      if (signal.aborted) return;
      if (!Number.isSafeInteger(receipt?.avatarId) || receipt.avatarId <= 0 || receipt.name !== choice.name) {
        throw new SessionError('avatar-create-uncertain');
      }
    } catch (error) {
      if (!signal.aborted) showFailure(error, 'avatar-registration-unavailable');
      return;
    }
    await enterTutorial();
  }

  function finish() {
    if (completed || signal.aborted) return;
    completed = true;
    onComplete(session, receipt);
  }

  start.addEventListener('click', () => showStep('name', name));
  find('#onboarding-back').addEventListener('click', () => {
    if (root.dataset.step === 'starter') showStep('appearance', parts[0]);
    else if (root.dataset.step === 'appearance') showStep('name', name);
    else showStep('intro', start);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (signal.aborted || fields.disabled) return;
    if (root.dataset.step === 'name') void confirmName();
    else if (root.dataset.step === 'appearance') confirmAppearance();
    else if (root.dataset.step === 'starter') void confirmStarter();
  });
  retry.addEventListener('click', () => { void retryAction?.(); });
  tutorialSkip.addEventListener('click', finish);
  tutorialNext.addEventListener('click', () => {
    if (chapter === chapters.length - 1) finish();
    else {
      chapter += 1;
      showChapter();
    }
  });
  logout.addEventListener('click', onLogout);

  showStep('intro', start);
  if (!session.initialData?.registration || session.avatarRegistrationState !== 'available' || !options) {
    fields.disabled = true;
    showStatus('uncertain', failureMessages['avatar-registration-unavailable'], 'avatar-registration-unavailable');
    logout.focus();
  }
  return () => {
    controller.abort();
    root.remove();
  };
}
