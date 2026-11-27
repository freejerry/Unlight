import { startSession, SessionError } from './session.js';
import { readNews } from './news.js';

const ui = {
  title: document.querySelector('#session-title'),
  description: document.querySelector('#session-description'),
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

const avatarCreateUi = {
  form: document.querySelector('#session-avatar-create'),
  fields: document.querySelector('#session-avatar-create-fields'),
  name: document.querySelector('#session-avatar-create-name'),
  parts: [0, 1, 2, 3].map(type => document.querySelector(`#session-avatar-create-part-${type}`)),
  card: document.querySelector('#session-avatar-create-card'),
  status: document.querySelector('#session-avatar-create-status'),
  retry: document.querySelector('#session-avatar-create-retry'),
};

const questUi = {
  section: document.querySelector('#session-quest'),
  load: document.querySelector('#session-quest-load'),
  status: document.querySelector('#session-quest-status'),
  progress: document.querySelector('#session-quest-progress'),
  mapProgress: document.querySelector('#session-quest-map-progress'),
  mapName: document.querySelector('#session-quest-map-name'),
  mapCount: document.querySelector('#session-quest-map-count'),
  mapMeter: document.querySelector('#session-quest-map-meter'),
  mapCaption: document.querySelector('#session-quest-map-caption'),
  inventory: document.querySelector('#session-quest-inventory'),
  rows: document.querySelector('#session-quest-rows'),
  cardTemplate: document.querySelector('#session-quest-card-template'),
  sourceDetails: document.querySelector('#session-quest-source-details'),
  details: document.querySelector('#session-quest-details'),
  detailList: document.querySelector('#session-quest-detail-list'),
  detailTemplate: document.querySelector('#session-quest-detail-template'),
  fields: ['count', 'capacity', 'flag', 'clear-count'].map(field => document.querySelector(`#session-quest-${field}`)),
};

const searchUi = {
  section: document.querySelector('#session-quest-search'),
  cost: document.querySelector('#session-quest-search-cost'),
  balance: document.querySelector('#session-quest-search-balance'),
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
  reward: document.querySelector('#session-quest-land-reward'),
  rewardGems: document.querySelector('#session-quest-land-reward-gems'),
  gemBalance: document.querySelector('#session-quest-land-gem-balance'),
  details: document.querySelector('#session-quest-land-details'),
  encounter: document.querySelector('#session-quest-land-encounter'),
  battleFields: document.querySelectorAll('#session-quest-land-duel [data-field]'),
};

const questNextLandUi = {
  section: document.querySelector('#session-quest-next-land'),
  status: document.querySelector('#session-quest-next-land-status'),
  options: document.querySelector('#session-quest-next-land-options'),
};

const questBattleUi = {
  section: document.querySelector('#session-quest-battle'),
  status: document.querySelector('#session-quest-battle-status'),
  start: document.querySelector('#session-quest-battle-ready'),
  turn: document.querySelector('#session-quest-battle-turn'),
  turnNumber: document.querySelector('#session-quest-battle-turn-number'),
  phase: document.querySelector('#session-quest-battle-phase'),
  hand: document.querySelector('#session-quest-battle-hand'),
  piles: ['action', 'event'].map(kind => ({
    section: document.querySelector(`#session-quest-${kind}-pile`),
    cards: document.querySelector(`#session-quest-${kind}-cards`),
    refillCount: document.querySelector(`#session-quest-${kind}-refill-count`),
    opponentDrawCount: document.querySelector(`#session-quest-opponent-${kind}-count`),
  })),
  move: document.querySelector('#session-quest-move'),
  select: document.querySelector('#session-quest-move-direction'),
  changeDirection: document.querySelector('#session-quest-move-direction option[value="3"]'),
  choose: document.querySelector('#session-quest-move-choose'),
  direction: document.querySelector('#session-quest-move-confirmed-direction'),
  moveTable: document.querySelector('#session-quest-move-table'),
  moveCards: document.querySelector('#session-quest-move-cards'),
  emptyMove: document.querySelector('#session-quest-move-cards-empty'),
  commit: document.querySelector('#session-quest-move-commit'),
  result: document.querySelector('#session-quest-move-result'),
  resultTitle: document.querySelector('#session-quest-move-result-title'),
  before: document.querySelector('#session-quest-move-distance-before'),
  after: document.querySelector('#session-quest-move-distance-after'),
  initiative: document.querySelector('#session-quest-move-initiative'),
  playerPower: document.querySelector('#session-quest-move-player-power'),
  opponentPower: document.querySelector('#session-quest-move-opponent-power'),
  committed: document.querySelector('#session-quest-committed'),
  committedCards: document.querySelector('#session-quest-committed-cards'),
  emptyCommitted: document.querySelector('#session-quest-committed-empty'),
};

const questCharacterUi = {
  active: document.querySelector('#session-quest-active-character'),
  slot: document.querySelector('#session-quest-active-slot'),
  card: document.querySelector('#session-quest-active-card'),
  hp: document.querySelector('#session-quest-active-hp'),
  last: document.querySelector('#session-quest-character-last'),
  section: document.querySelector('#session-quest-character-change'),
  status: document.querySelector('#session-quest-character-status'),
  choices: document.querySelector('#session-quest-character-choices'),
};

function questExchangeFields(kind) {
  const selector = `#session-quest-${kind}`;
  return {
    reveal: document.querySelector(`${selector}-reveal`),
    revealedCards: ['player', 'opponent'].map(side => ({
      cards: document.querySelector(`${selector}-${side}-cards`),
      empty: document.querySelector(`${selector}-${side}-cards-empty`),
    })),
    dice: document.querySelector(`${selector}-dice`),
    diceRows: ['attack', 'defense'].map(role => ({
      label: document.querySelector(`${selector}-${role}-label`),
      values: document.querySelector(`${selector}-${role}-dice`),
      empty: document.querySelector(`${selector}-${role}-dice-empty`),
    })),
    damageDetail: document.querySelector(`${selector}-damage-detail`),
    damage: document.querySelector(`${selector}-damage`),
    emptyDamage: document.querySelector(`${selector}-damage-empty`),
  };
}

const questCombatUi = {
  ...questExchangeFields('combat'),
  section: document.querySelector('#session-quest-combat'),
  title: document.querySelector('#session-quest-combat-title'),
  status: document.querySelector('#session-quest-combat-status'),
  controls: document.querySelector('#session-quest-combat-controls'),
  table: document.querySelector('#session-quest-combat-cards'),
  emptyTable: document.querySelector('#session-quest-combat-cards-empty'),
  commit: document.querySelector('#session-quest-combat-commit'),
  values: document.querySelector('#session-quest-combat-values'),
  playerHp: document.querySelector('#session-quest-combat-player-hp'),
  opponentHp: document.querySelector('#session-quest-combat-opponent-hp'),
  duelFinish: document.querySelector('#session-quest-combat-duel-finish'),
  questFinish: document.querySelector('#session-quest-combat-quest-finish'),
};

const questPreviousUi = {
  ...questExchangeFields('previous'),
  section: document.querySelector('#session-quest-previous-exchange'),
  heading: document.querySelector('#session-quest-previous-exchange-label'),
};

const questSettlementUi = {
  section: document.querySelector('#session-quest-settlement'),
  status: document.querySelector('#session-quest-settlement-status'),
  returnButton: document.querySelector('#session-quest-return'),
  fields: [...document.querySelectorAll('#session-quest-settlement [data-field]')],
  cards: document.querySelector('#session-quest-settlement-cards'),
  cardList: document.querySelector('#session-quest-settlement-card-list'),
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
  returned: '已返回任務清單。',
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
const questLandConfirmations = {
  encounter: '伺服器已確認進入地形與戰鬥開場。其他任務服務操作已暫停。',
  empty: '伺服器已確認通過這格。本格沒有戰鬥、寶箱或事件。',
  treasure: '伺服器已確認寶箱的 Gem 獎勵。',
  ready: '伺服器已確認進入地形，並回傳任務進度或結算。其他任務服務操作已暫停。',
};
const questBattlePhases = {
  encounter: ['待就緒', '可向伺服器送出就緒。'],
  preparing: ['補牌階段', '等待伺服器補牌並開放移動。'],
  move: ['移動階段', '可選取卡片、確認移動方向或空手送出。'],
  committing: ['已送出移動', '等待伺服器確認送出的移動。'],
  settling: ['移動結算', '伺服器已關閉移動階段，正在等待結算。'],
  moved: ['移動完成', '伺服器已結算本回合移動。'],
  'between-turns': ['回合結束', '等待伺服器開始下一回合。'],
  'character-change': ['換角階段', '等待原版伺服器完成換角。'],
  uncertain: ['結果待確認', '未能確認本次操作結果。本次任務無法重送。'],
  closed: ['任務連線中斷', '任務連線已中斷，已確認的回合資料仍可查看。'],
};
const questMoveDirections = { '-1': '前進', 0: '原地待機', 1: '後退', 3: '換角' };
const questBattleDistances = { 1: '近距離', 2: '中距離', 3: '遠距離', 4: '距離不明' };
const questCardTypes = { 0: '空白', 1: '劍', 2: '槍', 3: '防禦', 4: '移動', 5: '特殊', 6: '事件' };
const QUEST_BATTLE_CARD_SELECTOR = 'li[data-card-id][data-up]';
const questBattleRejections = {
  'quest-direction-rejected': '伺服器未接受這個移動方向。',
  'quest-card-rejected': '伺服器未接受這次卡片操作。',
  'quest-card-unavailable': '目前無法操作這張卡片。',
  'quest-battle-unavailable': '伺服器目前無法接受這項操作。',
  'quest-character-unavailable': '目前無法選擇這個角色。',
  'quest-character-overridden': '伺服器回覆了不同的出戰角色。',
  busy: '伺服器目前無法接受這項操作。',
};
const questCombatPhases = {
  'awaiting-attack': '等待伺服器開放攻擊操作。',
  attack: '輪到我方攻擊。可選取卡片或空手送出。',
  'awaiting-defense': '等待對手或伺服器回覆。',
  defense: '輪到我方防禦。可選取卡片或空手送出。',
  committing: '已送出卡片，等待伺服器確認。',
  resolving: '等待伺服器結算本次攻防。',
  complete: '伺服器已完成本段攻防。',
  terminal: '已收到原版戰鬥或任務的結算回覆。',
  uncertain: '未能確認本次攻防結果。本次任務無法重送。',
  closed: '任務連線已中斷，已確認的攻防資料仍可查看。',
};
const questCombatStageLabels = {
  'awaiting-attack': '等待攻擊',
  attack: '攻擊階段',
  'awaiting-defense': '等待防禦',
  defense: '防禦階段',
  committing: '等待確認',
  resolving: '攻防結算',
  complete: '攻防完成',
  terminal: '戰鬥結束',
  uncertain: '結果未確認',
  closed: '連線中斷',
};
const questResultLabels = { 0: '勝利', 1: '敗北', 2: '平手' };
const MAX_CATALOG_ID = 0x7fffffff;
const NORMAL_QUEST_MAP_COUNT = 35;
const QUEST_PENDING = 4;
const QUEST_IN_PROGRESS = 2;
const questCardStages = ['新任務', '未完成', '進行中', '已完成', '搜尋中', '失敗', '獲贈任務'];
const questCountdowns = [];
const questDeckNames = new Map();
const confirmedQuestStarts = new Set();
const questFirstLands = new Map();
const questCardCatalog = new Map();
const questCardCatalogRequested = new Set();
const questReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const questBoardAnimations = new Set();

let pending = null;
let active = null;
let avatarCreateRequest = null;
let questRequest = null;
let liveQuestRequest = null;
let newsRequest = null;
let questCountdownTimer;
let questBattleTimer;
let questBattleCatalogRequest;
let questSettlementKey;
let questProgressRequest;

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

function formatAvatarEnergy(energy, maximum) {
  if (!Number.isSafeInteger(energy)) return '—';
  return Number.isSafeInteger(maximum) && energy <= maximum ? `${energy} / ${maximum}` : String(energy);
}

function displayAvatarEnergy(energy, maximum) {
  const known = Number.isSafeInteger(energy) && energy >= 0;
  const value = known ? formatAvatarEnergy(energy, maximum) : '';
  ui.avatarEnergy.textContent = value;
  searchUi.balance.textContent = value;
  searchUi.balance.parentElement.hidden = !known;
}

function displayBootstrap(initialData) {
  const avatar = initialData?.avatar;
  const registration = initialData?.registration;
  ui.bootstrap.hidden = !initialData;
  ui.bootstrap.dataset.state = avatar ? 'avatar' : registration ? 'registration' : 'idle';
  ui.bootstrapTitle.textContent = avatar ? '角色資料' : registration ? '建立角色' : '登入初始資料';
  ui.avatarData.hidden = !avatar;
  ui.registrationData.hidden = !registration;

  const avatarValues = avatar
    ? [avatar.name, avatar.id, avatar.level, avatar.gems, avatar.exp]
    : [];
  ui.avatarFields.forEach((field, index) => { field.textContent = avatarValues[index] ?? ''; });
  displayAvatarEnergy(avatar?.energy, avatar?.energyMax);
  const registrationValues = registration ? [registration.partCount, registration.cardCount] : [];
  ui.registrationFields.forEach((field, index) => { field.textContent = registrationValues[index] ?? ''; });
}

function showAvatarCreate(state, message = '', kind) {
  const { status, fields, retry } = avatarCreateUi;
  status.dataset.state = state;
  status.textContent = message;
  if (kind) status.dataset.errorKind = kind;
  else delete status.dataset.errorKind;
  fields.disabled = !['ready', 'rejected'].includes(state);
  fields.hidden = fields.disabled && state !== 'checking';
  retry.hidden = state !== 'failed';
}

function clearAvatarCreate() {
  avatarCreateRequest?.abort();
  avatarCreateRequest = null;
  avatarCreateUi.form.hidden = true;
  clearField(avatarCreateUi.name);
  avatarCreateUi.name.removeAttribute('aria-invalid');
  for (const select of [...avatarCreateUi.parts, avatarCreateUi.card]) select.replaceChildren();
  showAvatarCreate('idle');
}

function displayAvatarStarterOptions({ partIds, cardIds }, { parts, cards }) {
  const named = ({ id, name }) => Number.isSafeInteger(id) && id > 0 && typeof name === 'string' && name.trim();
  const partCatalog = new Map(parts.filter(named).map(part => [part.id, part]));
  const cardCatalog = new Map(cards.filter(named).map(card => [card.id, card]));
  const groupOptions = avatarCreateUi.parts.map((_, type) => partIds.map(id => partCatalog.get(id))
    .filter(part => part?.type === type));
  const cardOptions = cardIds.map(id => cardCatalog.get(id)).filter(Boolean);
  if (groupOptions.some(group => !group.length) || !cardOptions.length) throw new Error('Missing starter choices.');

  function setOptions(select, options, placeholder) {
    select.replaceChildren(new Option(placeholder, ''), ...options.map(({ id, name }) => new Option(name, String(id))));
  }

  avatarCreateUi.parts.forEach((select, index) => setOptions(select, groupOptions[index], '請選擇'));
  if (groupOptions[0].some(({ id }) => id === 1)) avatarCreateUi.parts[0].value = '1';
  setOptions(avatarCreateUi.card, cardOptions, '請選擇起始角色卡');
}

async function loadAvatarStarterOptions(session, focusFrom) {
  const registration = session?.initialData?.registration;
  if (!registration || session.avatarRegistrationState !== 'available' || avatarCreateRequest) return;
  const controller = new AbortController();
  avatarCreateRequest = controller;
  const isCurrent = () => avatarCreateRequest === controller && active === session && session.initialData?.registration;
  avatarCreateUi.form.hidden = false;
  showAvatarCreate('loading', '正在讀取起始選項…');
  if (focusFrom === avatarCreateUi.retry) avatarCreateUi.status.focus();
  try {
    const response = await fetch('/api/avatar-starter-catalog', {
      redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3500)]),
    });
    if (!response.ok) throw new Error('Unavailable starter choices.');
    const catalog = await response.json();
    if (!isCurrent()) return;
    displayAvatarStarterOptions(registration, catalog);
    showAvatarCreate('ready');
    if (document.activeElement === (focusFrom === avatarCreateUi.retry ? avatarCreateUi.status : focusFrom)) {
      avatarCreateUi.name.focus();
    }
  } catch {
    if (isCurrent()) {
      showAvatarCreate('failed', '暫時無法讀取起始選項。請重試。');
      if (document.activeElement === avatarCreateUi.status || document.activeElement === focusFrom) {
        avatarCreateUi.retry.focus();
      }
    }
  } finally {
    if (avatarCreateRequest === controller) avatarCreateRequest = null;
  }
}

const avatarCreateErrors = {
  'avatar-name-invalid': '這個角色名稱無法使用。請修改名稱。',
  'avatar-name-taken': '這個角色名稱已有人使用。請換一個名稱。',
  'avatar-starter-invalid': '請重新選擇外觀部件與起始角色卡。',
  'avatar-create-rejected': '伺服器拒絕建立角色。請確認名稱與起始選項後再試。',
  'avatar-create-uncertain': '尚未確認角色是否已建立。請登出後重新登入，查看角色資料。',
  'avatar-name-uncertain': '未能完成名稱確認。請登出後重新登入再試。',
  'avatar-registration-unavailable': '本次登入無法建立角色。請登出後重新登入。',
};

function createAvatarNameError(message) {
  avatarCreateUi.name.setCustomValidity(message);
  avatarCreateUi.name.setAttribute('aria-invalid', 'true');
}

async function submitAvatarCreate(event) {
  event.preventDefault();
  const { form, fields, name, parts, card, status } = avatarCreateUi;
  const session = active;
  if (!session?.initialData?.registration || session.avatarRegistrationState !== 'available'
      || avatarCreateRequest || form.hidden || fields.disabled || !form.checkValidity()) return;
  const nameValue = name.value;
  if (nameValue.length < name.minLength || nameValue.length > name.maxLength
      || /[\x00-\x1f\x7f 　",]|\*\*\*/u.test(nameValue) || !nameValue.isWellFormed()) {
    const message = '請使用符合格式的角色名稱。';
    createAvatarNameError(message);
    showAvatarCreate('rejected', message, 'avatar-name-invalid');
    name.focus();
    return;
  }

  const choice = { name: nameValue, partIds: parts.map(select => Number(select.value)), cardId: Number(card.value) };
  const controller = new AbortController();
  avatarCreateRequest = controller;
  const isCurrent = () => avatarCreateRequest === controller && active === session && session.initialData?.registration;
  const restoreFocus = fields.contains(document.activeElement);
  showAvatarCreate('checking', '正在向伺服器確認名稱與建立角色…');
  if (restoreFocus) status.focus();
  try {
    const receipt = await session.createAvatar(choice, { signal: controller.signal });
    if (!isCurrent()) return;
    if (!Number.isSafeInteger(receipt?.avatarId) || receipt.avatarId <= 0 || receipt.name !== nameValue) {
      throw new SessionError('avatar-create-uncertain');
    }
    ui.bootstrapTitle.textContent = '角色已建立';
    ui.registrationData.hidden = true;
    showAvatarCreate('confirmed', `伺服器已建立角色「${receipt.name}」。請登出後重新登入，讀取角色資料。`);
    if (document.activeElement === status) ui.signOut.focus();
  } catch (error) {
    if (!isCurrent()) return;
    const kind = error instanceof SessionError && Object.hasOwn(avatarCreateErrors, error.kind)
      ? error.kind : 'avatar-registration-unavailable';
    const message = avatarCreateErrors[kind];
    const invalidName = kind === 'avatar-name-invalid' || kind === 'avatar-name-taken';
    if (invalidName) createAvatarNameError(message);
    const retryable = session.avatarRegistrationState === 'available'
      && (invalidName || kind === 'avatar-starter-invalid' || kind === 'avatar-create-rejected');
    showAvatarCreate(retryable ? 'rejected' : 'uncertain', message, kind);
    if (document.activeElement === status) {
      if (retryable) (kind === 'avatar-starter-invalid' ? parts[0] : name).focus();
      else ui.signOut.focus();
    }
  } finally {
    if (avatarCreateRequest === controller) avatarCreateRequest = null;
  }
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
  return ['encounter', 'empty', 'treasure', 'ready', 'uncertain', 'lost'].includes(questLandUi.status.dataset.state);
}

function updateLiveQuestButtons() {
  const busy = liveQuestRequest !== null;
  const networkBlocked = busy || questLandLocked();
  mapsUi.load.disabled = networkBlocked;
  serviceInventoryUi.load.disabled = networkBlocked;
  questUi.load.disabled = questUi.status.dataset.state === 'loading'
    || (busy && liveQuestRequest.kind !== 'read' && liveQuestRequest.kind !== 'battle');
  searchUi.start.disabled = networkBlocked || searchUi.section.hidden || searchUi.status.dataset.state === 'uncertain';
  questDeckUi.select.disabled = networkBlocked || questDeckUi.group.hidden || questDeckUi.select.options.length <= 1
    || questDeckUi.status.dataset.state === 'uncertain';
  for (const button of questUi.rows.querySelectorAll('.quest-start')) {
    button.disabled = questDeckUi.select.disabled || !questDeckUi.select.value;
  }
  for (const { button } of questCountdowns) button.disabled = networkBlocked;
  for (const button of questUi.rows.querySelectorAll('.quest-land-enter')) button.disabled = networkBlocked;
  const nextLandBlocked = busy || active?.questAdventure?.state !== 'between-lands'
    || !['ready', 'rejected'].includes(questNextLandUi.status.dataset.state);
  for (const button of questNextLandUi.options.querySelectorAll('button')) button.disabled = nextLandBlocked;
  questSettlementUi.returnButton.disabled = busy || questSettlementUi.section.hidden
    || questSettlementUi.status.dataset.state !== 'ready';
  updateQuestBattleButtons();
}

function beginLiveQuestRequest(kind) {
  const session = active;
  const blocked = kind === 'return' ? questSettlementUi.returnButton.disabled
    : kind === 'next-land' ? session?.questAdventure?.state !== 'between-lands'
    : kind === 'battle' ? questLandUi.status.dataset.state !== 'encounter' : questLandLocked();
  if (!session?.initialData?.avatar || liveQuestRequest || blocked) return null;
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
  questProgressRequest?.abort();
  questProgressRequest = undefined;
  confirmedQuestStarts.clear();
  questFirstLands.clear();
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

function clearQuestRegionProgress() {
  questUi.mapProgress.hidden = true;
  delete questUi.mapProgress.dataset.mapId;
  delete questUi.mapProgress.dataset.clearTarget;
  questUi.mapName.textContent = '';
  questUi.mapCount.textContent = '';
  questUi.mapMeter.hidden = true;
  questUi.mapMeter.value = 0;
  setOriginalText(questUi.mapCaption, '');
  searchUi.section.hidden = true;
  delete searchUi.section.dataset.mapId;
  searchUi.cost.textContent = '行動力（AP）';
}

function displayQuestMapCount(count, target) {
  const completed = Math.min(count, target);
  questUi.mapCount.textContent = `${completed} / ${target}`;
  questUi.mapMeter.max = target;
  questUi.mapMeter.value = completed;
  questUi.mapMeter.hidden = false;
}

function clearQuestResults() {
  clearTimeout(questCountdownTimer);
  questCountdownTimer = undefined;
  questCountdowns.length = 0;
  questUi.progress.hidden = true;
  clearQuestRegionProgress();
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

function updateQuestCardStatus(card, status) {
  card.dataset.questStatus = String(status);
  card.querySelector('[data-quest-field="status"]').textContent = String(status);
  const stage = card.querySelector('.quest-stage-label');
  stage.textContent = questCardStages[status] ?? '';
  stage.hidden = !stage.textContent;
}

function appendQuestCard({ inventoryId, questId, status }) {
  const card = questUi.cardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.inventoryId = String(inventoryId);
  card.dataset.questId = String(questId);
  const name = card.querySelector('.quest-name');
  name.id = `quest-name-${inventoryId}`;
  name.tabIndex = -1;
  name.textContent = questId === 0 ? '尚未發現' : '未取得名稱';
  card.querySelector('[data-quest-field="inventoryId"]').textContent = String(inventoryId);
  card.querySelector('[data-quest-field="questId"]').textContent = String(questId);
  updateQuestCardStatus(card, status);
  questUi.rows.append(card);
  return card;
}

function findServiceQuestRow(inventoryId, questId) {
  return serviceInventoryUi.rows.querySelector(`[data-inventory-id="${inventoryId}"][data-quest-id="${questId}"]`);
}

function updateQuestBattleButtons() {
  const phase = questBattleUi.section.dataset.phase;
  const locked = questBattleUi.section.hidden || !questNextLandUi.section.hidden || liveQuestRequest !== null
    || questLandUi.status.dataset.state !== 'encounter'
    || questBattleUi.status.dataset.state === 'uncertain';
  questBattleUi.start.disabled = locked || phase !== 'encounter';
  questBattleUi.select.disabled = locked || phase !== 'move';
  const selection = questBattleUi.select.value;
  questBattleUi.choose.disabled = questBattleUi.select.disabled || selection === '' || selection === questBattleUi.direction.dataset.direction
    || (selection === '3' && questBattleUi.changeDirection.disabled);
  questBattleUi.commit.disabled = questBattleUi.select.disabled;
  const combatOpen = phase === 'moved' && ['attack', 'defense'].includes(questCombatUi.section.dataset.role)
    && !questCombatUi.section.hidden;
  questCombatUi.commit.disabled = locked || !combatOpen || questCombatUi.status.dataset.state === 'uncertain';
  for (const control of questBattleUi.section.querySelectorAll('.quest-card-action, .quest-move-card-face')) {
    const combat = control.closest('[data-card-zone^="combat-"]');
    control.disabled = combat ? questCombatUi.commit.disabled : questBattleUi.select.disabled;
  }
  const canSelectCharacter = phase === 'character-change' && ['ready', 'rejected'].includes(questCharacterUi.status.dataset.state);
  for (const button of questCharacterUi.choices.querySelectorAll('button')) button.disabled = locked || !canSelectCharacter;
}

function clearQuestMoveResult() {
  const { result, resultTitle, before, after, initiative, playerPower, opponentPower, committed, committedCards } = questBattleUi;
  result.hidden = true;
  resultTitle.textContent = '移動結果';
  for (const key of ['turn', 'distanceBefore', 'distanceAfter', 'playerInitiative']) delete result.dataset[key];
  for (const field of [before, after, initiative, playerPower, opponentPower]) field.textContent = '';
  committed.hidden = true;
  committedCards.replaceChildren();
}

function animateQuestBoard(element, offset) {
  if (document.hidden || questReducedMotion.matches || element.closest('[hidden]') || typeof element.animate !== 'function') return;
  const animation = element.animate([
    { transform: `translateY(${offset}px)`, opacity: 0.8 },
    { transform: 'translateY(0)', opacity: 1 },
  ], { duration: 160, easing: 'ease-out' });
  questBoardAnimations.add(animation);
  const forget = () => questBoardAnimations.delete(animation);
  void animation.finished.then(forget, forget);
}

function cancelQuestBoardAnimations(scope) {
  for (const animation of questBoardAnimations) {
    if (scope && !scope.contains(animation.effect.target)) continue;
    animation.cancel();
    questBoardAnimations.delete(animation);
  }
}

function clearQuestBattle() {
  clearTimeout(questBattleTimer);
  cancelQuestBoardAnimations();
  questBattleCatalogRequest?.abort();
  questBattleCatalogRequest = undefined;
  questCardCatalog.clear();
  questCardCatalogRequested.clear();
  clearQuestSettlement();
  clearQuestCombat();
  clearQuestPreviousExchange();
  clearQuestCharacterChange();
  for (const field of [questCharacterUi.active, questCharacterUi.last]) {
    field.hidden = true;
    for (const key of ['kind', 'turn', 'slot', 'cardId']) delete field.dataset[key];
  }
  for (const field of [questCharacterUi.slot, questCharacterUi.card, questCharacterUi.last]) field.textContent = '';
  questCharacterUi.hp.parentElement.hidden = true;
  questCharacterUi.hp.textContent = '';
  clearQuestMoveResult();
  for (const section of [questBattleUi.section, questBattleUi.turn, questBattleUi.hand, questBattleUi.move, questBattleUi.moveTable,
    questBattleUi.playerPower.parentElement, questBattleUi.opponentPower.parentElement]) {
    section.hidden = true;
  }
  questBattleUi.start.hidden = false;
  delete questBattleUi.section.dataset.phase;
  delete questBattleUi.section.dataset.initialDistance;
  delete questBattleUi.section.dataset.moveStartDistance;
  delete questBattleUi.section.dataset.turn;
  delete questBattleUi.section.dataset.readyTurn;
  delete questBattleUi.direction.dataset.direction;
  questBattleUi.direction.textContent = '尚未選擇';
  questBattleUi.select.value = '';
  questBattleUi.changeDirection.hidden = true;
  questBattleUi.changeDirection.disabled = true;
  questBattleUi.commit.hidden = false;
  questBattleUi.commit.textContent = '不出牌並送出移動';
  questBattleUi.moveCards.replaceChildren();
  for (const field of [questBattleUi.turnNumber, questBattleUi.phase]) {
    field.textContent = '';
  }
  for (const pile of questBattleUi.piles) {
    pile.section.hidden = true;
    pile.cards.replaceChildren();
    pile.refillCount.textContent = '';
    pile.opponentDrawCount.textContent = '';
  }
  showQuestActionStatus(questBattleUi.status, 'idle');
}

function showQuestBattlePhase(phase, characterChange) {
  const [label, standard] = questBattlePhases[phase];
  const message = phase === 'character-change' && characterChange?.playerDone === false
    ? '原版伺服器要求我方換角。' : standard;
  questBattleUi.section.dataset.phase = phase;
  questBattleUi.phase.textContent = label;
  const preparingFirstTurn = phase === 'preparing' && Number(questBattleUi.section.dataset.turn ?? 1) === 1;
  questBattleUi.start.hidden = phase !== 'encounter' && !preparingFirstTurn;
  if (phase === 'moved') questBattleUi.commit.hidden = true;
  if (phase === 'move') questBattleUi.move.hidden = false;
  showQuestActionStatus(questBattleUi.status, phase, message, phase === 'closed' ? 'network' : undefined);
}

function clearQuestCharacterChange() {
  const { section, status, choices } = questCharacterUi;
  section.hidden = true;
  choices.hidden = true;
  choices.replaceChildren();
  for (const key of ['kind', 'turn', 'playerDone', 'opponentDone']) delete section.dataset[key];
  delete choices.dataset.options;
  showQuestActionStatus(status, 'idle');
}

function displayQuestActiveCharacter(roster, lastChange) {
  const { active, slot, card, hp, last } = questCharacterUi;
  const player = roster?.player;
  const current = player?.cards?.find(choice => choice.index === player.activeIndex);
  const healthKnown = Number.isSafeInteger(current?.hp) && current.hp >= 0;
  hp.parentElement.hidden = !healthKnown;
  hp.textContent = healthKnown ? String(current.hp) : '';
  active.hidden = !current;
  if (current) {
    active.dataset.slot = String(current.index);
    active.dataset.cardId = String(current.cardId);
    slot.textContent = String(current.index);
    card.textContent = String(current.cardId);
  } else {
    delete active.dataset.slot;
    delete active.dataset.cardId;
    slot.textContent = '';
    card.textContent = '';
  }
  const applied = lastChange?.player;
  const confirmed = applied && current && current.index === applied.index && current.cardId === applied.cardId;
  last.hidden = !confirmed;
  if (confirmed) {
    last.dataset.kind = lastChange.kind;
    last.dataset.turn = String(lastChange.turn);
    last.dataset.slot = String(applied.index);
    last.dataset.cardId = String(applied.cardId);
    const message = lastChange.kind === 'defeated' ? '已確認倒下後的出戰角色。' : '已確認移動後的出戰角色。';
    if (last.textContent !== message) last.textContent = message;
  } else {
    for (const key of ['kind', 'turn', 'slot', 'cardId']) delete last.dataset[key];
    last.textContent = '';
  }
}

function appendQuestCharacterChoice(choice, activeIndex) {
  const { index, cardId, hp } = choice;
  const item = document.createElement('li');
  const current = index === activeIndex;
  item.dataset.slot = String(index);
  item.dataset.cardId = String(cardId);
  item.dataset.current = String(current);
  const label = document.createElement('span');
  label.textContent = `欄位 ${index} · 角色卡 ${cardId}${Number.isSafeInteger(hp) ? ` · 生命值 ${hp}` : ''}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary quest-character-select';
  button.textContent = current ? '保留出戰角色' : '選擇此角色';
  button.setAttribute('aria-label', `${button.textContent}，欄位 ${index}，角色卡 ${cardId}`);
  button.disabled = true;
  button.addEventListener('click', () => void runQuestBattleAction(
    button, 'choosing', '正在等待伺服器完成換角…',
    (session, options) => session.chooseQuestCharacter(index, options), { character: true },
  ));
  item.append(label, button);
  questCharacterUi.choices.append(item);
}

function syncQuestCharacterChange(snapshot, force) {
  const { phase, characterChange: change, roster, lastCharacterChange, canRequestCharacterChange, turn } = snapshot;
  const directionAllowed = phase === 'move' && canRequestCharacterChange === true;
  questBattleUi.changeDirection.hidden = !directionAllowed;
  questBattleUi.changeDirection.disabled = !directionAllowed;
  if (phase === 'move' && !directionAllowed && questBattleUi.select.value === '3') questBattleUi.select.value = '';
  displayQuestActiveCharacter(roster, lastCharacterChange);

  const { section, status, choices } = questCharacterUi;
  if (phase !== 'character-change' || !change) {
    if (!section.hidden) clearQuestCharacterChange();
    return;
  }
  if (section.dataset.kind !== change.kind || section.dataset.turn !== String(turn)) clearQuestCharacterChange();
  section.hidden = false;
  section.dataset.kind = change.kind;
  section.dataset.turn = String(turn);
  section.dataset.playerDone = String(change.playerDone);
  section.dataset.opponentDone = String(change.opponentDone);

  const options = change.canSelect === true && change.playerDone === false && Array.isArray(change.choices) ? change.choices : [];
  const activeIndex = roster?.player?.activeIndex;
  const version = JSON.stringify([activeIndex, options]);
  if (choices.dataset.options !== version) {
    choices.dataset.options = version;
    choices.replaceChildren();
    for (const choice of options) appendQuestCharacterChoice(choice, activeIndex);
  }
  choices.hidden = options.length === 0;
  const previousState = status.dataset.state;
  if (previousState === 'uncertain' || (!force && ['choosing', 'rejected'].includes(previousState))) return;
  const state = options.length ? 'ready' : 'waiting';
  const message = options.length ? (change.kind === 'defeated' ? '請選擇接替出戰的角色。' : '請選擇出戰角色。')
    : change.playerDone || change.applied?.player ? '等待伺服器完成換角。' : '伺服器尚未確認可選的角色。';
  if (previousState !== state || status.textContent !== message) showQuestActionStatus(status, state, message);
}

function getQuestCardFace(id, up) {
  const card = questCardCatalog.get(id);
  const face = up ? card?.upper : card?.lower;
  if (Number.isSafeInteger(face?.type) && Number.isSafeInteger(face?.value)) return face;
  return null;
}

function describeQuestCardFace({ type, value }) {
  return `${questCardTypes[type] ?? `類型 ${type}`} ${value}`;
}

function showQuestCardMetadata(element) {
  const { cardId, up } = element.dataset;
  const face = getQuestCardFace(cardId, up === 'true');
  if (face && !element.querySelector('.quest-card-face')) {
    element.dataset.cardType = String(face.type);
    element.dataset.cardValue = String(face.value);
    const detail = document.createElement('span');
    detail.className = 'quest-card-face';
    detail.textContent = ` · ${describeQuestCardFace(face)}`;
    element.querySelector('.quest-card-label').append(detail);
  }
  const select = element.querySelector('.quest-move-card-face');
  if (!select) return;
  for (const [index, option] of [...select.options].entries()) {
    const offered = getQuestCardFace(cardId, index === 0);
    const orientation = index === 0 ? '上半面' : '下半面';
    option.textContent = offered ? `${orientation} · ${describeQuestCardFace(offered)}` : orientation;
  }
}

function createQuestBattleCard({ id, up, event = false }, zone = '') {
  const element = document.createElement('li');
  element.dataset.cardId = String(id);
  element.dataset.up = String(up);
  element.dataset.cardZone = zone;
  element.dataset.cardKind = event ? 'event' : 'action';
  const label = document.createElement('span');
  label.className = 'quest-card-label';
  label.textContent = `#${id} · ${up ? '上半面' : '下半面'}`;
  element.append(label);

  if (zone) {
    element.className = 'quest-move-card-item';
    const button = document.createElement('button');
    const adding = zone === 'hand' || zone === 'combat-hand';
    const combat = zone === 'combat-hand' || zone === 'combat-table';
    const context = combat ? 'combat' : 'move';
    button.type = 'button';
    button.disabled = true;
    button.className = `button secondary quest-card-action quest-${context}-card-${adding ? 'add' : 'remove'}`;
    button.textContent = adding ? (combat ? '加入攻防區' : '加入移動區') : '退回手牌';
    button.setAttribute('aria-label', `${button.textContent}，卡片 ${id}`);
    const select = adding ? document.createElement('select') : null;
    if (select) {
      select.className = 'quest-move-card-face';
      select.disabled = true;
      select.setAttribute('aria-label', `卡片 ${id} 的牌面`);
      select.append(new Option('上半面', 'true'), new Option('下半面', 'false'));
      select.value = String(up);
      element.append(select);
    }
    element.append(button);
    button.addEventListener('click', () => {
      const perform = combat ? (adding ? 'addQuestBattleCard' : 'removeQuestBattleCard')
        : (adding ? 'addQuestMoveCard' : 'removeQuestMoveCard');
      const action = adding ? (session, options) => session[perform](id, select.value === 'true', options)
        : (session, options) => session[perform](id, options);
      const destination = adding ? (combat ? questCombatUi.table : questBattleUi.moveCards)
        : questBattleUi.piles[event ? 1 : 0].cards;
      const focus = () => destination.querySelector(`[data-card-id="${id}"] button`);
      void runQuestBattleAction(button, adding ? 'adding-card' : 'returning-card',
        adding ? '正在等待伺服器確認選卡…' : '正在等待伺服器確認退回卡片…', action, { focusAfter: focus, combat });
    });
  }
  showQuestCardMetadata(element);
  return element;
}

async function enrichQuestBattleCards(session) {
  if (questBattleCatalogRequest) return;
  const ids = new Set([...questBattleUi.section.querySelectorAll(QUEST_BATTLE_CARD_SELECTOR)].map(element => element.dataset.cardId)
    .filter(id => !questCardCatalogRequested.has(id)).slice(0, 64));
  if (!ids.size) return;
  for (const id of ids) questCardCatalogRequested.add(id);
  const controller = new AbortController();
  questBattleCatalogRequest = controller;
  const params = new URLSearchParams([...ids].map(id => ['id', id]));
  try {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(3500)]);
    const response = await fetch(`/api/action-card-catalog?${params}`, { signal });
    if (!response.ok) return;
    const { cards } = await response.json();
    if (active !== session || signal.aborted || !Array.isArray(cards)) return;
    for (const card of cards) if (ids.has(String(card?.id))) questCardCatalog.set(String(card.id), card);
    for (const element of questBattleUi.section.querySelectorAll(QUEST_BATTLE_CARD_SELECTOR)) showQuestCardMetadata(element);
  } catch {
    // The server's hand IDs and orientations remain available without the optional catalog.
  } finally {
    if (questBattleCatalogRequest === controller) {
      questBattleCatalogRequest = undefined;
      if (active === session) void enrichQuestBattleCards(session);
    }
  }
}

function openQuestRound({ turn, action, event }, startDistance) {
  cancelQuestBoardAnimations();
  questBattleUi.section.dataset.readyTurn = String(turn);
  const before = startDistance ?? (turn === 1 ? questBattleUi.section.dataset.initialDistance : undefined);
  if (Object.hasOwn(questBattleDistances, before)) questBattleUi.section.dataset.moveStartDistance = String(before);
  else delete questBattleUi.section.dataset.moveStartDistance;
  questBattleUi.select.value = '';
  questBattleUi.direction.dataset.direction = '';
  questBattleUi.direction.textContent = '尚未選擇';
  questBattleUi.commit.hidden = false;
  clearQuestMoveResult();
  for (const [index, draw] of [action, event].entries()) {
    if (!draw) continue;
    const pile = questBattleUi.piles[index];
    pile.refillCount.textContent = String(draw.cards.length);
    pile.opponentDrawCount.textContent = String(draw.opponentDrawCount);
    pile.section.hidden = false;
  }
  questBattleUi.hand.hidden = false;
}

function displayQuestBattleHand(ready, actionHand, eventHand, zone, turn, animateRefill) {
  const fresh = ready.turn === turn;
  for (const [index, cards] of [actionHand, eventHand].entries()) {
    const draw = index === 0 ? ready.action : ready.event;
    if (!draw) continue;
    const pile = questBattleUi.piles[index];
    const hand = cards ?? draw.cards;
    syncQuestCardList(pile.cards, index === 0 ? hand : hand.map(card => ({ ...card, event: true })), zone);
    pile.refillCount.parentElement.hidden = !fresh;
    pile.opponentDrawCount.parentElement.hidden = !fresh;
    const refilled = new Set(fresh ? draw.cards.map(card => String(card.id)) : []);
    for (const element of pile.cards.children) {
      const isNew = refilled.has(element.dataset.cardId);
      if (element.dataset.refilled === String(isNew)) continue;
      element.dataset.refilled = String(isNew);
      if (isNew && turn > 1) {
        const badge = document.createElement('span');
        badge.className = 'quest-refilled';
        badge.textContent = '新補';
        element.querySelector('.quest-card-label').append(badge);
      } else element.querySelector('.quest-refilled')?.remove();
    }
    if (animateRefill) {
      // Each confirmed draw appends to its pile after the surviving cards.
      const first = pile.cards.childElementCount - draw.cards.length;
      for (const [index, { id, up }] of draw.cards.entries()) {
        const element = pile.cards.children[first + index];
        if (element?.dataset.cardId === String(id) && element.dataset.up === String(up)) animateQuestBoard(element, 6);
      }
    }
  }
}

function syncQuestCardList(list, cards, zone = '') {
  const remaining = [...list.children];
  const fromHand = zone === 'hand' || zone === 'combat-hand';
  const interactionZone = card => fromHand && card.event && card.playable !== true ? '' : zone;
  const matches = (node, card) => node.dataset.cardZone === interactionZone(card) && node.dataset.cardId === String(card.id)
    && node.dataset.up === String(card.up) && node.dataset.cardKind === (card.event ? 'event' : 'action');
  if (remaining.length === cards.length && remaining.every((node, index) => matches(node, cards[index]))) return;

  const ordered = cards.map(card => {
    const index = remaining.findIndex(node => matches(node, card));
    return index === -1 ? createQuestBattleCard(card, interactionZone(card)) : remaining.splice(index, 1)[0];
  });
  for (const node of remaining) node.remove();
  let cursor = list.firstElementChild;
  for (const element of ordered) {
    if (element !== cursor) list.insertBefore(element, cursor);
    cursor = element.nextElementSibling;
  }
}

function animateQuestCardTransfers(table, previousIds) {
  for (const element of table.children) {
    if (!previousIds.delete(element.dataset.cardId)) animateQuestBoard(element, 4);
  }
  if (!previousIds.size) return;
  for (const pile of questBattleUi.piles) {
    for (const element of pile.cards.children) {
      if (previousIds.delete(element.dataset.cardId)) animateQuestBoard(element, -4);
    }
  }
}

function displayQuestMoveResult({ distance, playerInitiative, playerCards, playerPower, opponentPower }, animateResult) {
  const { readyTurn, moveStartDistance: before } = questBattleUi.section.dataset;
  questBattleUi.before.parentElement.hidden = before === undefined;
  questBattleUi.before.textContent = before === undefined ? '' : `${questBattleDistances[before]}（${before}）`;
  questBattleUi.after.textContent = `${questBattleDistances[distance]}（${distance}）`;
  questBattleUi.initiative.textContent = playerInitiative ? '我方先攻' : '對手先攻';
  questBattleUi.result.dataset.turn = readyTurn;
  questBattleUi.resultTitle.textContent = `第 ${readyTurn} 回合移動結果`;
  if (before !== undefined) questBattleUi.result.dataset.distanceBefore = before;
  questBattleUi.result.dataset.distanceAfter = String(distance);
  questBattleUi.result.dataset.playerInitiative = String(playerInitiative);
  for (const [field, value] of [[questBattleUi.playerPower, playerPower], [questBattleUi.opponentPower, opponentPower]]) {
    field.parentElement.hidden = !Number.isSafeInteger(value);
    field.textContent = Number.isSafeInteger(value) ? String(value) : '';
  }
  if (Array.isArray(playerCards)) {
    questBattleUi.committedCards.replaceChildren(...playerCards.map(card => createQuestBattleCard(card)));
    questBattleUi.committed.hidden = false;
    questBattleUi.emptyCommitted.hidden = playerCards.length !== 0;
  }
  questBattleUi.result.hidden = false;
  cancelQuestBoardAnimations();
  if (animateResult) animateQuestBoard(questBattleUi.result, 5);
}

function questCombatRole(phase) {
  return phase === 'attack' || phase === 'defense' ? phase : 'waiting';
}

function clearQuestExchangeResult(view) {
  const { reveal, revealedCards, dice, diceRows, damageDetail, damage } = view;
  for (const element of [reveal, dice, damageDetail]) element.hidden = true;
  delete reveal.dataset.sourceCommand;
  for (const list of [damage, ...revealedCards.map(row => row.cards), ...diceRows.map(row => row.values)]) list.replaceChildren();
  for (const row of diceRows) delete row.values.dataset.player;
}

function clearQuestCombat() {
  const { section, title, status, controls, table, commit, values } = questCombatUi;
  cancelQuestBoardAnimations(section);
  clearQuestExchangeResult(questCombatUi);
  for (const element of [section, controls, values]) element.hidden = true;
  delete section.dataset.phase;
  delete section.dataset.role;
  delete section.dataset.turn;
  delete section.dataset.index;
  delete section.dataset.playerAttacks;
  title.textContent = '攻防';
  table.replaceChildren();
  for (const field of [questCombatUi.playerHp, questCombatUi.opponentHp, questCombatUi.duelFinish, questCombatUi.questFinish]) {
    field.textContent = '';
    field.parentElement.hidden = true;
    delete field.dataset.result;
  }
  delete questCombatUi.questFinish.dataset.inventoryId;
  commit.textContent = '空手送出';
  showQuestActionStatus(status, 'idle');
}

function showQuestCombatPhase(phase, force = false, controlsAvailable = true) {
  const { section, status, controls } = questCombatUi;
  const changed = section.dataset.phase !== phase;
  const role = controlsAvailable ? questCombatRole(phase) : 'waiting';
  section.dataset.phase = phase;
  section.dataset.role = role;
  controls.hidden = role === 'waiting';
  const uncertain = status.dataset.state === 'uncertain';
  if ((changed || force) && (!uncertain || ['complete', 'terminal', 'closed'].includes(phase))) {
    showQuestActionStatus(status, phase, questCombatPhases[phase], phase === 'closed' ? 'network' : undefined);
  }
}

function displayQuestCombatReveal(exchange, view, motion = false) {
  const reveal = exchange.cards ?? exchange.defenceCards ?? exchange.attackCards;
  if (!reveal) return;
  const command = exchange.cards ? '55' : exchange.defenceCards ? '54' : '52';
  const shown = view.reveal.dataset.sourceCommand;
  if (command === shown) return;

  view.reveal.dataset.sourceCommand = command;
  for (const [index, cards] of [reveal.playerCards, reveal.opponentCards].entries()) {
    const side = view.revealedCards[index];
    syncQuestCardList(side.cards, cards);
    side.empty.hidden = cards.length !== 0;
  }
  view.reveal.hidden = false;
  if (motion) animateQuestBoard(view.reveal, 4);
}

function displayQuestCombatDice({ playerAttacks, attackDice, defenceDice }, view, motion = false) {
  for (const [index, values] of [attackDice, defenceDice].entries()) {
    const row = view.diceRows[index];
    const player = index === 0 ? playerAttacks : !playerAttacks;
    row.label.textContent = `${index === 0 ? '攻擊方' : '防禦方'}（${player ? '我方' : '對手'}）`;
    row.values.dataset.player = String(player);
    row.values.replaceChildren(...values.map(value => {
      const item = document.createElement('li');
      item.dataset.value = String(value);
      item.textContent = String(value);
      return item;
    }));
    row.empty.hidden = values.length !== 0;
  }
  view.dice.hidden = false;
  if (motion) animateQuestBoard(view.dice, 6);
}

function displayQuestCombatDamage(damage, concluded, view, motion = false) {
  const list = view.damage;
  const latest = [];
  for (const { player, damage: value, nonHostile } of damage.slice(list.childElementCount)) {
    const item = document.createElement('li');
    item.dataset.player = String(player);
    item.dataset.damage = String(value);
    item.dataset.nonHostile = String(nonHostile);
    const side = player ? '我方' : '對手';
    item.textContent = value > 0 ? `${side}受到 ${value} 點傷害` : `${side}傷害回覆 ${value}`;
    list.append(item);
    if (motion && value > 0) latest.push(item);
  }
  view.damageDetail.hidden = !list.childElementCount && !concluded;
  view.emptyDamage.hidden = !concluded || list.childElementCount !== 0;
  for (const item of latest) animateQuestBoard(item, 4);
}

function clearQuestPreviousExchange() {
  const { section, heading } = questPreviousUi;
  clearQuestExchangeResult(questPreviousUi);
  section.hidden = true;
  section.open = true;
  heading.textContent = '';
  for (const key of ['turn', 'index', 'playerAttacks']) delete section.dataset[key];
}

function displayQuestPreviousExchange(exchange) {
  if (!exchange || !Number.isSafeInteger(exchange.turn) || !Number.isSafeInteger(exchange.index)) return;
  const { section, heading } = questPreviousUi;
  const turn = String(exchange.turn);
  const index = String(exchange.index);
  if (section.dataset.turn === turn && section.dataset.index === index) return;

  clearQuestExchangeResult(questPreviousUi);
  section.dataset.turn = turn;
  section.dataset.index = index;
  if (typeof exchange.playerAttacks === 'boolean') section.dataset.playerAttacks = String(exchange.playerAttacks);
  else delete section.dataset.playerAttacks;
  heading.textContent = `第 ${turn} 回合，第 ${index} 段`;
  displayQuestCombatReveal(exchange, questPreviousUi);
  if (exchange.dice) displayQuestCombatDice(exchange.dice, questPreviousUi);
  displayQuestCombatDamage(exchange.damage, true, questPreviousUi);
  section.hidden = false;
}

function displayQuestCombatValues({ hitPoints, duelFinish, questFinish }, motion) {
  for (const [field, value] of [[questCombatUi.playerHp, hitPoints?.player], [questCombatUi.opponentHp, hitPoints?.opponent]]) {
    if (!Number.isSafeInteger(value)) continue;
    field.parentElement.hidden = false;
    field.textContent = String(value);
  }
  const latest = [];
  const matchedFinish = questFinish?.inventoryId === Number(questLandUi.result.dataset.inventoryId);
  for (const [field, finish] of [[questCombatUi.duelFinish, duelFinish], [questCombatUi.questFinish, matchedFinish ? questFinish : null]]) {
    if (!Number.isSafeInteger(finish?.result)) continue;
    const original = questResultLabels[finish.result];
    field.parentElement.hidden = false;
    const result = String(finish.result);
    if (field.dataset.result !== result) {
      field.dataset.result = result;
      field.textContent = original ? `${original}（${result}）` : result;
      if (motion) latest.push(field.parentElement);
    }
    if (field === questCombatUi.questFinish) field.dataset.inventoryId = String(finish.inventoryId);
  }
  questCombatUi.values.hidden = ![...questCombatUi.values.children].some(node => !node.hidden);
  for (const row of latest) animateQuestBoard(row, 4);
}

function syncQuestCombat(exchange, force, session, controlsAvailable) {
  if (!Object.hasOwn(questCombatPhases, exchange.phase)) return;
  const { phase, turn, index, playerAttacks, battleTable, dice, damage } = exchange;
  const { section, title, table, commit, emptyTable, status } = questCombatUi;
  if (Number.isSafeInteger(turn) && Number.isSafeInteger(index)) {
    if (section.dataset.turn !== String(turn) || section.dataset.index !== String(index)) clearQuestCombat();
    section.dataset.turn = String(turn);
    section.dataset.index = String(index);
  }
  const motion = controlsAvailable && !['uncertain', 'closed'].includes(phase) && status.dataset.state !== 'uncertain';
  if (!motion) cancelQuestBoardAnimations(section);
  const previousIds = motion && questCombatRole(phase) !== 'waiting' && section.dataset.phase === phase
    ? new Set([...table.children].map(element => element.dataset.cardId)) : null;
  section.hidden = false;
  showQuestCombatPhase(phase, force, controlsAvailable);
  if (controlsAvailable && questBattleUi.phase.textContent !== questCombatStageLabels[phase]) {
    questBattleUi.phase.textContent = questCombatStageLabels[phase];
  }
  if (typeof playerAttacks === 'boolean') {
    section.dataset.playerAttacks = String(playerAttacks);
    const localDefense = phase === 'defense' || phase === 'committing' || exchange.defenceCards;
    const heading = playerAttacks ? '我方攻擊' : localDefense ? '我方防禦' : '對手攻擊';
    if (title.textContent !== heading) {
      title.textContent = heading;
      if (motion) animateQuestBoard(title, 4);
    }
  }
  syncQuestCardList(table, battleTable, 'combat-table');
  if (previousIds) animateQuestCardTransfers(table, previousIds);
  emptyTable.hidden = battleTable.length !== 0;
  commit.textContent = battleTable.length ? '送出已選卡片' : '空手送出';
  displayQuestCombatReveal(exchange, questCombatUi, motion);
  if (dice && questCombatUi.dice.hidden) displayQuestCombatDice(dice, questCombatUi, motion);
  displayQuestCombatDamage(damage, phase === 'complete' || phase === 'terminal', questCombatUi, motion);
  const questFinishId = questCombatUi.questFinish.dataset.inventoryId;
  displayQuestCombatValues(exchange, motion);
  const finishedId = questCombatUi.questFinish.dataset.inventoryId;
  if (finishedId && finishedId !== questFinishId) {
    const row = questUi.rows.querySelector(`[data-inventory-id="${finishedId}"]`);
    if (row && !exchange.settlement) void reconcileFinishedQuest(Number(finishedId), Number(row.dataset.questId), session);
  }
}

function clearQuestSettlement() {
  questSettlementKey = undefined;
  const { section, status, returnButton, fields, cards, cardList } = questSettlementUi;
  section.hidden = true;
  delete section.dataset.inventoryId;
  cards.hidden = true;
  cardList.replaceChildren();
  returnButton.hidden = true;
  for (const field of fields) {
    field.textContent = '';
    delete field.dataset.value;
  }
  showQuestActionStatus(status, 'idle');
}

function displayQuestSettlement(settlement, session) {
  if (settlement?.inventoryId !== Number(questLandUi.result.dataset.inventoryId)) return;
  const { section, status, returnButton, fields, cards, cardList } = questSettlementUi;
  const currentState = status.dataset.state;
  const canReturn = settlement.canReturn === true && session.questAdventure?.state !== 'closed';
  returnButton.hidden = !canReturn || currentState === 'uncertain';
  if (!['returning', 'uncertain'].includes(currentState)) {
    const state = canReturn ? 'ready' : 'waiting';
    const message = canReturn ? '已確認任務結算，可以返回清單。'
      : settlement.bonusPending === true ? '原版伺服器仍有追加獎勵待處理。'
        : '原版伺服器尚未確認可以返回清單。';
    if (currentState !== state) showQuestActionStatus(status, state, message);
  }
  const key = JSON.stringify(settlement);
  if (key === questSettlementKey) return;
  questSettlementKey = key;

  const { inventoryId, questId, result, avatar, deltas, map, deckRestored } = settlement;
  if (!questLandUi.progress.hidden && Number.isSafeInteger(map.progress)) displayQuestLandProgress(map.progress);
  section.dataset.inventoryId = String(inventoryId);
  section.hidden = false;
  const resultLabel = questResultLabels[result];
  const values = {
    result: resultLabel ? `${resultLabel}（${result}）` : result,
    ...avatar,
    gemsDelta: deltas.gems,
    expDelta: deltas.exp,
    levelDelta: deltas.level,
    ...map,
    deckRestored: deckRestored ? (deckRestored.name || `牌組 ${deckRestored.index}`) : null,
  };
  for (const field of fields) {
    const key = field.dataset.field;
    const value = values[key];
    field.parentElement.hidden = value == null;
    field.textContent = value == null ? '' : String(value);
    if (Number.isSafeInteger(value) || key === 'result' || key === 'deckRestored' && deckRestored) {
      field.dataset.value = String(key === 'result' ? result : key === 'deckRestored' ? deckRestored.index : value);
    } else delete field.dataset.value;
  }
  cardList.replaceChildren(...settlement.cards.map(({ inventoryId, cardId }) => {
    const item = document.createElement('li');
    item.dataset.inventoryId = String(inventoryId);
    item.dataset.cardId = String(cardId);
    item.textContent = `角色卡 ID ${cardId}，持有紀錄 ID ${inventoryId}`;
    return item;
  }));
  cards.hidden = !settlement.cards.length;
  displayBootstrap(session.initialData);
  void reconcileFinishedQuest(inventoryId, questId, session, undefined, true);
}

async function returnFromQuest() {
  const { status, section, returnButton } = questSettlementUi;
  const restoreFocus = document.activeElement === returnButton;
  const request = beginLiveQuestRequest('return');
  if (!request) return;
  const { session, controller } = request;
  const inventoryId = Number(section.dataset.inventoryId);
  showQuestActionStatus(status, 'returning', '正在關閉本次任務連線…');
  try {
    const settlement = await session.returnFromQuest({ signal: controller.signal });
    if (!isCurrentLiveQuestRequest(request)) return;
    if (settlement?.inventoryId !== inventoryId || session.questAdventure) throw new SessionError('quest-return-uncertain');
    await reconcileFinishedQuest(inventoryId, settlement.questId, session, controller.signal, true);
    if (!isCurrentLiveQuestRequest(request)) return;
    clearQuestLand();
    displayBootstrap(session.initialData);
    displayQuestDecks();
    showQuestStatus('returned');
  } catch (error) {
    if (!isCurrentLiveQuestRequest(request)) return;
    const kind = error instanceof SessionError ? error.kind : 'quest-return-uncertain';
    const uncertain = kind !== 'busy' && kind !== 'quest-return-unavailable';
    const message = uncertain ? '未能確認任務連線已關閉。本次登入不會重送返回要求。'
      : '目前無法返回任務清單。';
    showQuestActionStatus(status, uncertain ? 'uncertain' : 'waiting', message, kind);
    returnButton.hidden = true;
  } finally {
    finishLiveQuestRequest(request);
    if (restoreFocus && active === session && [document.body, returnButton].includes(document.activeElement)) {
      (section.hidden ? questUi.load : status).focus();
    }
  }
}

function syncQuestBattle(session, force = false) {
  clearTimeout(questBattleTimer);
  if (active !== session || questBattleUi.section.hidden || questLandUi.status.dataset.state !== 'encounter') return;
  const adventure = session.questAdventure;
  if (Number.isInteger(adventure?.slot) && adventure.slot !== Number(questLandUi.result.dataset.slot)) return;
  if (adventure?.state === 'between-lands') displayQuestNextLands(adventure);
  const snapshot = session.questBattle;
  if (!snapshot || !Object.hasOwn(questBattlePhases, snapshot.phase)) return;
  const focused = document.activeElement;
  const restoringFocus = questBattleUi.section.contains(focused);
  const { phase, direction, ready, result, actionHand, eventHand, moveTable, exchange, previousExchange, startDistance, characterChange } = snapshot;
  const turn = snapshot.turn ?? ready?.turn;
  const opensRound = ready && questBattleUi.section.dataset.readyTurn !== String(ready.turn);
  const sameMovePhase = phase === 'move' && questBattleUi.section.dataset.phase === 'move' && !opensRound;
  const previousMoveIds = sameMovePhase ? new Set([...questBattleUi.moveCards.children].map(element => element.dataset.cardId)) : null;
  const canAnimateResult = phase !== 'uncertain' && phase !== 'closed';
  if (!canAnimateResult) cancelQuestBoardAnimations();
  if (Number.isSafeInteger(turn)) {
    questBattleUi.section.dataset.turn = String(turn);
    questBattleUi.turnNumber.textContent = String(turn);
    questBattleUi.turn.hidden = false;
  }
  if (opensRound) {
    openQuestRound(ready, startDistance);
    clearQuestCombat();
  }
  if (ready) {
    const combatOpen = phase === 'moved' && exchange && questCombatRole(exchange.phase) !== 'waiting';
    const zone = Array.isArray(actionHand) ? phase === 'move' ? 'hand' : combatOpen ? 'combat-hand' : '' : '';
    displayQuestBattleHand(ready, actionHand, eventHand, zone, turn, opensRound && phase === 'move');
  }
  if (Array.isArray(moveTable)) {
    syncQuestCardList(questBattleUi.moveCards, moveTable, 'table');
    questBattleUi.moveTable.hidden = Boolean(result);
    questBattleUi.emptyMove.hidden = moveTable.length !== 0;
    questBattleUi.commit.textContent = moveTable.length ? '送出移動' : '不出牌並送出移動';
    if (previousMoveIds) animateQuestCardTransfers(questBattleUi.moveCards, previousMoveIds);
  }
  if (result && questBattleUi.result.hidden) displayQuestMoveResult(result, canAnimateResult);

  if (ready?.turn === turn) {
    const confirmed = Object.hasOwn(questMoveDirections, direction) ? String(direction) : '';
    if (questBattleUi.direction.dataset.direction !== confirmed) {
      questBattleUi.direction.dataset.direction = confirmed;
      questBattleUi.direction.textContent = confirmed === '' ? '尚未選擇' : questMoveDirections[confirmed];
    }
  }
  const locallyUncertain = questBattleUi.status.dataset.state === 'uncertain';
  if ((force || phase !== questBattleUi.section.dataset.phase)
      && (!locallyUncertain || phase === 'moved' || phase === 'closed')) showQuestBattlePhase(phase, characterChange);
  syncQuestCharacterChange(snapshot, force);
  if (exchange && result) syncQuestCombat(exchange, force, session, phase === 'moved');
  displayQuestPreviousExchange(previousExchange);
  const settlement = exchange?.settlement ?? session.questSettlement;
  if (settlement) displayQuestSettlement(settlement, session);
  if (ready) void enrichQuestBattleCards(session);
  updateQuestBattleButtons();
  if (restoringFocus && !liveQuestRequest && (!focused.isConnected || focused.disabled || focused.closest('[hidden]'))) {
    const status = !questCharacterUi.section.hidden ? questCharacterUi.status
      : phase === 'moved' && !questCombatUi.section.hidden ? questCombatUi.status : questBattleUi.status;
    status.focus({ preventScroll: true });
  }
  const exchangePending = adventure?.state !== 'between-lands' && exchange && !['uncertain', 'closed'].includes(exchange.phase)
    && (!exchange.questFinish || !settlement || !settlement.canReturn);
  if (!document.hidden && (['encounter', 'preparing', 'move', 'committing', 'settling', 'between-turns', 'character-change'].includes(phase)
      || exchangePending)) {
    const delay = phase === 'character-change' || ['complete', 'terminal'].includes(exchange?.phase) ? 1000 : 250;
    questBattleTimer = setTimeout(() => syncQuestBattle(session), delay);
  }
}

async function runQuestBattleAction(button, state, message, action, { focusAfter, combat = false, character = false } = {}) {
  if (button.disabled || !button.isConnected) return;
  const restoreFocus = document.activeElement === button;
  const request = beginLiveQuestRequest('battle');
  if (!request) return;
  const { session, controller } = request;
  const isCurrent = () => isCurrentLiveQuestRequest(request) && questLandUi.status.dataset.state === 'encounter';
  const status = character ? questCharacterUi.status : combat ? questCombatUi.status : questBattleUi.status;
  const { readyTurn } = questBattleUi.section.dataset;
  const { turn, index } = questCombatUi.section.dataset;
  showQuestActionStatus(status, state, message);

  try {
    const result = action(session, { signal: controller.signal });
    syncQuestBattle(session);
    await result;
    if (isCurrent()) syncQuestBattle(session, true);
  } catch (error) {
    if (!isCurrent()) return;
    syncQuestBattle(session, true);
    if (readyTurn !== questBattleUi.section.dataset.readyTurn || (combat && (turn !== questCombatUi.section.dataset.turn
      || index !== questCombatUi.section.dataset.index))) return;
    const finished = character ? questBattleUi.section.dataset.phase !== 'character-change'
      : combat ? ['complete', 'terminal', 'closed'].includes(questCombatUi.section.dataset.phase)
        : questBattleUi.section.dataset.phase === 'moved';
    if (finished) return;
    const kind = error instanceof SessionError ? error.kind : 'quest-battle-uncertain';
    if (Object.hasOwn(questBattleRejections, kind)) {
      showQuestActionStatus(status, 'rejected', questBattleRejections[kind], kind, error.code);
    } else {
      showQuestActionStatus(status, 'uncertain', combat ? questCombatPhases.uncertain : questBattlePhases.uncertain[1], kind);
    }
  } finally {
    finishLiveQuestRequest(request);
    if (restoreFocus && active === session && (document.activeElement === document.body || document.activeElement === button)) {
      let target = button.disabled ? status : button;
      const counterpart = focusAfter?.();
      if (counterpart && !counterpart.disabled) target = counterpart;
      if (button === questBattleUi.start && !questBattleUi.select.disabled) target = questBattleUi.select;
      if (button === questBattleUi.choose && button.disabled && !questBattleUi.commit.disabled) target = questBattleUi.commit;
      if (button === questBattleUi.commit && !questCombatUi.section.hidden) target = questCombatUi.status;
      if (button === questBattleUi.commit && !questCharacterUi.section.hidden) target = questCharacterUi.status;
      if (character && questCharacterUi.section.hidden) target = questCombatUi.section.hidden ? questBattleUi.status : questCombatUi.status;
      target.focus();
    }
  }
}

function clearQuestLand() {
  clearQuestBattle();
  clearQuestNextLand();
  questLandUi.section.hidden = true;
  questLandUi.result.hidden = true;
  questLandUi.details.open = false;
  questLandUi.encounter.hidden = true;
  for (const item of [questLandUi.progress, questLandUi.finish]) {
    item.hidden = true;
    item.lastElementChild.textContent = '';
  }
  delete questLandUi.result.dataset.slot;
  delete questLandUi.result.dataset.inventoryId;
  delete questLandUi.result.dataset.landId;
  delete questLandUi.result.dataset.kind;
  setOriginalText(questLandUi.caption, '');
  for (const field of [questLandUi.name, questLandUi.inventoryId, questLandUi.id, questLandUi.slot, ...questLandUi.battleFields]) {
    field.textContent = '';
  }
  displayQuestLandReward(null);
  showQuestActionStatus(questLandUi.status, 'idle');
}

function clearQuestNextLand() {
  const { section, status, options } = questNextLandUi;
  section.hidden = true;
  for (const key of ['inventoryId', 'fromSlot', 'progress']) delete section.dataset[key];
  options.replaceChildren();
  showQuestActionStatus(status, 'idle');
}

function displayQuestNextLands({ inventoryId, slot, progress, nextLands }) {
  const { section, status, options } = questNextLandUi;
  if (!section.hidden || inventoryId !== Number(questLandUi.result.dataset.inventoryId)
      || !Number.isSafeInteger(progress) || !nextLands?.length) return;

  section.dataset.inventoryId = String(inventoryId);
  section.dataset.fromSlot = String(slot);
  section.dataset.progress = String(progress);
  displayQuestLandProgress(progress);
  options.replaceChildren(...nextLands.map(land => {
    const item = document.createElement('li');
    item.dataset.slot = String(land.slot);
    item.dataset.landId = String(land.id);
    const description = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'quest-land-name';
    name.id = `quest-next-land-name-${land.slot}`;
    name.textContent = land.name;
    const caption = document.createElement('p');
    caption.className = 'quest-land-caption quest-original-text';
    setOriginalText(caption, land.caption);
    description.append(name, caption);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button primary quest-next-land-enter';
    button.textContent = '進入地形';
    button.setAttribute('aria-controls', 'session-quest-land-result');
    button.setAttribute('aria-describedby', name.id);
    button.addEventListener('click', () => void enterNextQuestLand(land.slot, button));
    item.append(description, button);
    return item;
  }));
  section.hidden = false;
  showQuestActionStatus(status, 'ready', '已通過本格，可以選擇下一格。');
  updateLiveQuestButtons();
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
  row.querySelector('.quest-card-actions').append(option);
  button.addEventListener('click', () => void enterQuestLand(row, inventoryId, land, button));
}

function displayQuestLandProgress(progress) {
  questLandUi.progress.hidden = progress == null;
  questLandUi.progress.lastElementChild.textContent = progress ?? '';
}

function displayQuestLandReward(receipt) {
  const { reward, rewardGems, gemBalance } = questLandUi;
  reward.hidden = !receipt;
  rewardGems.textContent = receipt?.amount ?? '';
  gemBalance.textContent = receipt?.balance ?? '';
  if (receipt) reward.dataset.treasureId = String(receipt.treasureId);
  else delete reward.dataset.treasureId;
}

function displayQuestLand(inventoryId, land, { slot, encounter, progress, finish, emptyTerrain = false, fixedGemTreasure = null }) {
  questLandUi.details.open = false;
  const battleFields = encounter?.duel ? { ...encounter, ...encounter.duel } : null;
  const battleValues = battleFields && [...questLandUi.battleFields].map(field => battleFields[field.dataset.field]);
  const validBattle = battleValues?.every(value => typeof value === 'boolean' || Number.isSafeInteger(value)
    || (Array.isArray(value) && value.every(Number.isSafeInteger)));
  const nonbattle = emptyTerrain || fixedGemTreasure;
  if (slot !== land.slot || (encounter && !validBattle) || (!encounter && progress == null && !finish)
      || (progress != null && !Number.isSafeInteger(progress))
      || (nonbattle && (encounter || finish || (progress & (1 << slot)) === 0))
      || (emptyTerrain && land.emptyTerrain !== true) || (fixedGemTreasure && (!land.fixedGemTreasure || emptyTerrain))
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
  const state = encounter ? 'encounter' : fixedGemTreasure ? 'treasure' : emptyTerrain ? 'empty' : 'ready';
  questLandUi.result.dataset.kind = state === 'ready' ? (finish ? 'finished' : 'progress') : state;
  displayQuestLandProgress(progress);
  displayQuestLandReward(fixedGemTreasure);
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
  showQuestActionStatus(questLandUi.status, state, questLandConfirmations[state]);
}

function openQuestBattle(session, encounter) {
  if (!encounter || typeof session.readyQuestBattle !== 'function') return;
  questBattleUi.section.hidden = false;
  questBattleUi.section.dataset.initialDistance = String(encounter.duel.distance);
  syncQuestBattle(session);
}

function watchQuestLandConnection(session) {
  const closed = session.questAdventure?.closed;
  if (!closed) return;
  const showLost = () => {
    if (active !== session || !session.initialData || session.questAdventure?.closed !== closed) return;
    if (session.questBattle?.exchange?.questFinish?.inventoryId === Number(questLandUi.result.dataset.inventoryId)) {
      syncQuestBattle(session, true);
      return;
    }
    const message = questLandUi.result.hidden
      ? '任務連線已中斷。未能確認本次進入結果，請勿重送。'
      : '任務連線已中斷。已確認的資料仍可查看，本次登入的任務服務操作已暫停。';
    showQuestActionStatus(questLandUi.status, 'lost', message, 'network');
    if (!questNextLandUi.section.hidden) {
      showQuestActionStatus(questNextLandUi.status, 'lost', '任務連線已中斷。已確認的地形與進度仍可查看。', 'network');
    }
    if (!questBattleUi.section.hidden) {
      clearTimeout(questBattleTimer);
      cancelQuestBoardAnimations();
      showQuestBattlePhase('closed');
      clearQuestCharacterChange();
      if (!questCombatUi.section.hidden) showQuestCombatPhase('closed');
    }
    updateLiveQuestButtons();
  };
  void closed.then(showLost, showLost);
}

function refreshSettledQuestProgress(snapshot, session) {
  displayQuestProgress(snapshot);
  const mapId = String(snapshot.questFlag + 1);
  const target = Number(questUi.mapProgress.dataset.clearTarget);
  if (questUi.mapProgress.dataset.mapId === mapId && Number.isSafeInteger(target) && target > 0) {
    displayQuestMapCount(snapshot.questClearNum, target);
    return;
  }

  clearQuestRegionProgress();
  questProgressRequest?.abort();
  const controller = new AbortController();
  questProgressRequest = controller;
  void enrichQuestSnapshot(snapshot, controller.signal, session).catch(() => {}).finally(() => {
    if (questProgressRequest === controller) questProgressRequest = undefined;
  });
}

async function reconcileFinishedQuest(inventoryId, questId, session, signal, refreshProgress = false) {
  const snapshot = await session.readQuestInventory({ signal }).catch(() => null);
  if (!snapshot || active !== session || signal?.aborted || snapshot.rows.some(entry => entry.inventoryId === inventoryId)) return;

  const serviceRow = findServiceQuestRow(inventoryId, questId);
  if (serviceRow) {
    serviceRow.remove();
    const count = serviceInventoryUi.rows.rows.length;
    serviceInventoryUi.count.textContent = String(count);
    serviceInventoryUi.table.hidden = count === 0;
  }
  confirmedQuestStarts.delete(inventoryId);
  questUi.rows.querySelector(`[data-inventory-id="${inventoryId}"][data-quest-id="${questId}"]`)?.remove();
  if (refreshProgress) refreshSettledQuestProgress(snapshot, session);
  else questUi.fields[0].textContent = String(snapshot.rows.length);
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
    const options = { signal: controller.signal };
    if (land.emptyTerrain === true) options.emptyTerrain = true;
    else if (land.fixedGemTreasure) options.fixedGemTreasure = true;
    const result = await session.enterQuestLand(inventoryId, land.slot, options);
    if (!isCurrentLiveQuestRequest(request) || !row.isConnected) return;
    const adventure = session.questAdventure;
    const sameProgress = adventure?.inventoryId === inventoryId && adventure.slot === land.slot
      && adventure.progress === result?.progress;
    if (options.emptyTerrain && (!sameProgress || result?.emptyTerrain !== true || adventure.emptyTerrain !== true)) {
      throw new SessionError('quest-land-uncertain');
    }
    if (options.fixedGemTreasure && (!sameProgress || !matchesQuestGemReward(result?.fixedGemTreasure,
      land.fixedGemTreasure, adventure.fixedGemTreasure, session.initialData.avatar))) {
      throw new SessionError('quest-land-uncertain');
    }
    displayQuestLand(inventoryId, land, result);
    openQuestBattle(session, result.encounter);
    if (result.fixedGemTreasure) displayBootstrap(session.initialData);
    if ((result.emptyTerrain || result.fixedGemTreasure) && adventure.state === 'between-lands') displayQuestNextLands(adventure);
    if (result.finish) await reconcileFinishedQuest(inventoryId, Number(row.dataset.questId), session, controller.signal);
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
      const start = questBattleUi.start;
      const next = questNextLandUi.options.querySelector('button:not(:disabled)');
      const ready = !questBattleUi.section.hidden && !start.hidden && !start.disabled;
      (ready ? start : next ?? questLandUi.status).focus();
    }
  }
}

function matchesQuestGemReward(receipt, source, confirmed, avatar) {
  return Number.isSafeInteger(receipt?.treasureId) && receipt.treasureId === source.treasureId
    && Number.isSafeInteger(receipt.amount) && receipt.amount > 0 && receipt.amount === source.value
    && Number.isSafeInteger(receipt.balance) && receipt.balance >= 0
    && confirmed?.treasureId === receipt.treasureId && confirmed.amount === receipt.amount
    && confirmed.balance === receipt.balance && avatar.gems === receipt.balance;
}

async function enterNextQuestLand(slot, button) {
  if (button.disabled || !button.isConnected) return;
  const adventure = active?.questAdventure;
  if (adventure?.inventoryId !== Number(questLandUi.result.dataset.inventoryId)
      || adventure.slot !== Number(questLandUi.result.dataset.slot)) return;
  const restoreFocus = document.activeElement === button;
  const { status, section } = questNextLandUi;
  if (adventure.state === 'uncertain') {
    showQuestActionStatus(status, 'uncertain', '目前無法確認任務進度。本次登入已暫停前往下一格。', 'quest-land-uncertain');
    updateLiveQuestButtons();
    if (restoreFocus) status.focus();
    return;
  }
  const land = adventure.nextLands?.find(option => option.slot === slot);
  if (!land) return;
  const request = beginLiveQuestRequest('next-land');
  if (!request) return;
  const { session, controller } = request;
  showQuestActionStatus(status, 'entering', '正在等待伺服器確認下一格地形…');
  try {
    const result = await session.enterNextQuestLand(slot, { signal: controller.signal });
    if (!isCurrentLiveQuestRequest(request)) return;
    const current = session.questAdventure;
    if (current?.inventoryId !== adventure.inventoryId || current.slot !== slot || current.state !== 'encounter'
        || current.closed !== adventure.closed || !result?.encounter || result.finish) {
      throw new SessionError('quest-land-uncertain');
    }
    displayQuestLand(adventure.inventoryId, land, { ...result, progress: current.progress ?? adventure.progress });
    clearQuestNextLand();
    clearQuestBattle();
    openQuestBattle(session, result.encounter);
  } catch (error) {
    if (!isCurrentLiveQuestRequest(request) || status.dataset.state === 'lost') return;
    const kind = error instanceof SessionError ? error.kind : 'quest-land-uncertain';
    if (kind === 'quest-land-rejected') {
      const reason = questLandRejected[error.code];
      showQuestActionStatus(status, 'rejected', reason ? `${reason}。` : '伺服器拒絕進入這格地形。', kind, error.code);
    } else if (kind === 'quest-land-unavailable' || kind === 'busy') {
      showQuestActionStatus(status, 'rejected', '目前無法進入這格地形。', kind);
    } else {
      showQuestActionStatus(status, 'uncertain', '未能確認是否進入下一格。已確認的地形可查看，本次登入無法重送。', kind);
    }
  } finally {
    finishLiveQuestRequest(request);
    if (restoreFocus && active === session && [document.body, button].includes(document.activeElement)) {
      (section.hidden ? questBattleUi.start : status).focus();
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
  updateQuestCardStatus(row, QUEST_IN_PROGRESS);
  row.dataset.deckIndex = String(deckIndex);
  showQuestActionStatus(statusElement, 'started', `伺服器已開始任務。使用 ${deckLabel(deckIndex)}。`);
}

function appendQuestStart(row, { inventoryId, questId, status, deckIndex }) {
  const startable = questId > 0 && (status === 0 || status === 1);
  const assigned = status === QUEST_IN_PROGRESS && Number.isSafeInteger(deckIndex) && deckIndex > 0;
  if (!startable && !assigned) return;
  const description = row.querySelector('.quest-card-actions');
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

    displayAvatarEnergy(energy, session.initialData.avatar.energyMax);
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
      const land = row.querySelector('.quest-land-enter:not(:disabled)');
      const target = button.isConnected && !button.disabled ? button : land ?? statusElement;
      target.focus();
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
  const restoreFocus = document.activeElement === countdown.button;
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
    row.querySelector('[data-quest-field="questId"]').textContent = String(result.questId);
    updateQuestCardStatus(row, result.status);
    questCountdowns.splice(questCountdowns.indexOf(countdown), 1);
    countdown.element.remove();
    countdown.button.remove();
    showQuestActionStatus(statusElement, 'confirmed', '伺服器已確認搜尋結果。');
    if (restoreFocus && [document.body, countdown.button].includes(document.activeElement)) statusElement.focus();
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
    if (restoreFocus && active === session && row.isConnected) {
      if (document.activeElement === statusElement) row.querySelector('.quest-start:not(:disabled)')?.focus();
      else if (document.activeElement === document.body && countdown.button.isConnected && !countdown.button.disabled) {
        countdown.button.focus();
      }
    }
  }
}

function displayQuestProgress({ capacity, questFlag, questClearNum, rows }) {
  const values = [rows.length, capacity, questFlag, questClearNum];
  questUi.fields.forEach((field, index) => { field.textContent = String(values[index]); });
  questUi.progress.hidden = false;
}

function displayQuestSnapshot(snapshot, newestEntry) {
  const { rows, receivedAt } = snapshot;
  displayQuestProgress(snapshot);

  for (const entry of newestEntry ? [newestEntry] : rows) {
    const row = appendQuestCard(entry);
    const actions = row.querySelector('.quest-card-actions');
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
      statusElement.tabIndex = -1;
      statusElement.dataset.state = 'idle';
      actions.append(element, button, statusElement);
      // Data reports truncated remaining seconds. A new Quest row has the exact duration.
      const tolerance = entry.receivedAt === undefined ? 1 : 0;
      const deadline = entry.findSeconds < 0 ? 0 : rowReceivedAt + (entry.findSeconds + tolerance) * 1000;
      const countdown = { element, deadline, button };
      questCountdowns.push(countdown);
      button.addEventListener('click', () => void confirmQuestDiscovery(row, entry.inventoryId, countdown, statusElement));
    }
    appendQuestStart(row, entry);
  }

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

  const currentProgress = questUi.fields[2].textContent === String(questFlag) && questUi.fields[3].textContent === String(questClearNum);
  if (currentProgress && map?.id === mapId && Number.isSafeInteger(map.clearTarget) && map.clearTarget > 0) {
    questUi.mapName.textContent = typeof map.name === 'string' && map.name ? map.name : `地圖 ${mapId}`;
    displayQuestMapCount(questClearNum, map.clearTarget);
    questUi.mapProgress.dataset.mapId = String(mapId);
    questUi.mapProgress.dataset.clearTarget = String(map.clearTarget);
    questUi.mapProgress.hidden = false;
    searchUi.section.dataset.mapId = String(mapId);
    searchUi.cost.textContent = Number.isSafeInteger(map.ap) && map.ap >= 0 ? `${map.ap} 點行動力（AP）` : '行動力（AP）';
    searchUi.section.hidden = false;
    updateLiveQuestButtons();
  }
  if (currentProgress && map?.id === mapId) setOriginalText(questUi.mapCaption, map.caption);

  if (!Array.isArray(quests)) return;
  const catalog = new Map(quests.filter(quest => ids.has(quest?.id)).map(quest => [quest.id, quest]));
  for (const row of questUi.rows.children) {
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
    const land = supportedFirstQuestLand(quest);
    if (land) {
      questFirstLands.set(quest.id, land);
      appendQuestLandOption(row);
    }
  }
  showQuestDetails(catalog.values());
  updateLiveQuestButtons();
}

function supportedFirstQuestLand({ firstLand: land, positions, mapId }) {
  if (!Number.isInteger(land?.slot) || land.slot < 0 || land.slot > 2 || !Number.isSafeInteger(land.id) || land.id <= 0
      || typeof land.name !== 'string' || !land.name.trim()) return null;
  if (Number.isSafeInteger(land.enemyId) && land.enemyId > 0) return land;
  if (!Number.isInteger(mapId) || mapId < 1 || mapId > NORMAL_QUEST_MAP_COUNT
      || !Array.isArray(positions)) return null;
  const start = positions.find(position => position.slot === land.slot && position.id === land.id);
  const empty = land.emptyTerrain === true && start?.emptyTerrain === true;
  const treasure = land.fixedGemTreasure && start?.fixedGemTreasure?.treasureId === land.fixedGemTreasure.treasureId;
  if ((!empty && !treasure) || !Array.isArray(start?.nextSlots)) return null;
  return positions.some(position => start.nextSlots.includes(position.slot)
    && Number.isSafeInteger(position.enemyId) && position.enemyId > 0) ? land : null;
}

async function startQuestSearch() {
  if (searchUi.start.disabled) return;
  const restoreFocus = document.activeElement === searchUi.start;
  const request = beginLiveQuestRequest('search');
  if (!request) return;
  const { session, controller } = request;
  const { signal } = controller;
  let countdownTitle;
  showQuestActionStatus(searchUi.status, 'starting', '正在向伺服器開始搜尋…');

  try {
    const { row, energy } = await session.startQuestSearch({ signal });
    if (!isCurrentLiveQuestRequest(request)) return;
    if (!Number.isSafeInteger(row?.inventoryId) || row.inventoryId <= 0 || row.questId !== 0
        || row.status !== QUEST_PENDING || !Number.isSafeInteger(row.findSeconds)
        || !Number.isFinite(row.receivedAt) || row.receivedAt < 0 || !Number.isSafeInteger(energy) || energy < 0) {
      throw new SessionError('search-uncertain');
    }

    displayAvatarEnergy(energy, session.initialData.avatar.energyMax);
    showQuestActionStatus(searchUi.status, 'started', '伺服器已開始搜尋。');
    try {
      const snapshot = await session.readQuestInventory({ signal });
      if (!isCurrentLiveQuestRequest(request)) return;
      const newestEntry = snapshot?.rows.find(entry => entry.inventoryId === row.inventoryId);
      if (!newestEntry || questUi.rows.querySelector(`[data-inventory-id="${row.inventoryId}"]`)) {
        throw new SessionError('protocol');
      }
      displayQuestSnapshot(snapshot, { ...newestEntry, receivedAt: row.receivedAt });
      countdownTitle = questUi.rows.querySelector(`[data-inventory-id="${row.inventoryId}"] .quest-name`);
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
    if (restoreFocus && active === session && countdownTitle?.isConnected
        && [document.body, searchUi.start].includes(document.activeElement)) countdownTitle.focus();
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
  ui.title.textContent = signedIn ? '帳號與角色' : '登入';
  ui.description.hidden = signedIn;
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
    clearAvatarCreate();
    questUi.sourceDetails.open = false;
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
  const restoreFocus = document.activeElement === ui.status;
  show('failed', label, detail, kind);
  if (restoreFocus) (ui.username.value ? ui.password : ui.username).focus();
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
  const restoreFocus = [ui.result, ui.bootstrap, questUi.section, newsUi.details]
    .some(section => section.contains(document.activeElement));
  active = null;
  clearField(ui.password);
  if (reason === 'expired') {
    show('failed', '工作階段已逾時', '請重新登入。', 'expired');
  } else {
    show('failed', '連線已中斷', '請確認服務連線後重新登入。', 'network');
  }
  if (restoreFocus) ui.username.focus();
}

ui.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending || active || !ui.form.checkValidity()) return;

  const controller = new AbortController();
  pending = controller;
  const restoreFocus = ui.form.contains(document.activeElement);
  show('working', '正在驗證登入', '正在連線認證、大廳、資料與全域聊天。');
  if (restoreFocus) ui.status.focus({ preventScroll: true });

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
    const moveFocus = document.activeElement === ui.status;
    show('signed-in', '登入成功');
    if (moveFocus) ui.title.focus();
    if (initialData.registration) void loadAvatarStarterOptions(session, moveFocus ? ui.title : null);
    void session.closed.then((reason) => handleDisconnect(session, reason), () => handleDisconnect(session, 'network'));
  } catch (error) {
    if (pending === controller) showFailure(error);
  } finally {
    if (pending === controller) pending = null;
  }
});

avatarCreateUi.name.addEventListener('input', () => {
  avatarCreateUi.name.setCustomValidity('');
  avatarCreateUi.name.removeAttribute('aria-invalid');
  const { state, errorKind } = avatarCreateUi.status.dataset;
  if (state === 'rejected' && (errorKind === 'avatar-name-invalid' || errorKind === 'avatar-name-taken')) {
    showAvatarCreate('ready');
  }
});
avatarCreateUi.name.addEventListener('invalid', () => {
  const { validity, minLength, maxLength } = avatarCreateUi.name;
  if (!validity.customError) {
    const message = validity.valueMissing ? '請輸入角色名稱。' : `角色名稱需為 ${minLength} 至 ${maxLength} 個字。`;
    createAvatarNameError(message);
    showAvatarCreate('rejected', message, 'avatar-name-invalid');
  }
});
avatarCreateUi.form.addEventListener('submit', submitAvatarCreate);
avatarCreateUi.retry.addEventListener('click', () => {
  void loadAvatarStarterOptions(active, document.activeElement === avatarCreateUi.retry ? avatarCreateUi.retry : null);
});

questUi.load.addEventListener('click', async () => {
  const session = active;
  if (!session?.initialData?.avatar || questUi.load.disabled) return;

  questRequest?.abort();
  questProgressRequest?.abort();
  questProgressRequest = undefined;
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
questBattleUi.select.addEventListener('change', updateQuestBattleButtons);
questBattleUi.start.addEventListener('click', () => void runQuestBattleAction(
  questBattleUi.start, 'preparing', '正在向伺服器送出就緒…', (session, options) => session.readyQuestBattle(options),
));
questBattleUi.choose.addEventListener('click', () => {
  const direction = questBattleUi.select.value;
  if (!Object.hasOwn(questMoveDirections, direction) || (direction === '3' && questBattleUi.changeDirection.disabled)) return;
  void runQuestBattleAction(questBattleUi.choose, 'choosing', '正在等待伺服器確認移動方向…',
    (session, options) => session.chooseQuestMove(Number(direction), options));
});
questBattleUi.commit.addEventListener('click', () => {
  const message = questBattleUi.moveCards.childElementCount ? '正在送出已選移動卡…' : '正在送出不出牌的移動…';
  void runQuestBattleAction(questBattleUi.commit, 'committing', message, (session, options) => session.commitQuestMove(options));
});
questCombatUi.commit.addEventListener('click', () => {
  void runQuestBattleAction(questCombatUi.commit, 'committing', '正在送出本次攻防…',
    (session, options) => session.commitQuestBattle(options), { combat: true });
});
questSettlementUi.returnButton.addEventListener('click', () => void returnFromQuest());

document.addEventListener('visibilitychange', () => {
  updateQuestCountdowns();
  if (document.hidden) cancelQuestBoardAnimations();
  else if (active) syncQuestBattle(active);
});
questReducedMotion.addEventListener('change', () => {
  if (questReducedMotion.matches) cancelQuestBoardAnimations();
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
  const restoreFocus = document.activeElement === ui.signOut;
  show('working', '正在登出');
  if (restoreFocus) ui.status.focus({ preventScroll: true });

  try {
    await session.close();
    if (pending === controller) {
      show('idle', '尚未登入', '已關閉工作階段連線。');
      ui.username.focus({ preventScroll: true });
    }
  } catch {
    if (pending === controller) {
      show('failed', '登出確認失敗', '連線結束時發生錯誤，請重新登入。', 'network');
      if (document.activeElement === ui.status) ui.username.focus();
    }
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
