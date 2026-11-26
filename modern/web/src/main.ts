import './style.css';
import { startOcean } from './ocean';
import { replay, sameValue } from './replay';

type Status = 'playing' | 'won' | 'lost' | 'draw';
type Vessel = { hp: number; max_hp: number; shield: number };
type Card = { id: string; name: string; kind: string; cost: number; description: string; power: number };
type BattleEvent = { seq: number; text: string; kind: string };
type GameView = {
  turn: number;
  revision: number;
  status: Status;
  player: Vessel;
  opponent: Vessel;
  energy: number;
  max_energy: number;
  hand: Card[];
  events: BattleEvent[];
  deck_count: number;
};
type Action = { type: 'play'; card_id: string } | { type: 'end_turn' };
type Match = { id: string; seed: number; view: GameView; history: Action[] };
type ReplayResult = { ok: true; view: GameView } | { ok: false; error: string };

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const ui = {
  energy: element('energy'),
  turn: element('turn'),
  deck: element('deck'),
  status: element('game-status'),
  title: element('status-title'),
  detail: element('status-detail'),
  start: element<HTMLButtonElement>('start-match'),
  restart: element<HTMLButtonElement>('restart-match'),
  play: element<HTMLButtonElement>('play-card'),
  endTurn: element<HTMLButtonElement>('end-turn'),
  verify: element<HTMLButtonElement>('verify-replay'),
  replay: element('replay-result'),
  selection: element('selection-note'),
  hand: element('hand'),
  board: element('board'),
  dropZone: element('drop-zone'),
  log: element('events'),
  logEmpty: element('log-empty'),
  connection: element('connection'),
  error: element('error-note'),
  announcement: element('announcement'),
  rules: element<HTMLDialogElement>('rules-dialog'),
};

const ocean = startOcean(element<HTMLCanvasElement>('surface'));
const art = new Image();
art.addEventListener('load', () => ui.board.style.setProperty('--board-art', `url("${art.src}")`));
art.src = `${import.meta.env.BASE_URL}board.webp`;

const outcomes: Record<Exclude<Status, 'playing'>, string> = {
  won: '演習勝利',
  lost: '演習失敗',
  draw: '演習平手',
};
const cardKinds: Partial<Record<string, string>> = {
  strike: '攻擊',
  guard: '防禦',
  repair: '維修',
  surge: '增幅',
};

let match: Match | null = null;
let selected: string | null = null;
let dragged: string | null = null;
let socket: WebSocket | null = null;
let reconnectTimer = 0;
let busy = false;
let verifying = false;

class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

class ConnectionError extends Error {}

async function request(path: string, payload?: object): Promise<Match> {
  const controller = new AbortController();
  const deadline = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, {
      signal: controller.signal,
      ...payload && {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    });
    const result = await response.json().catch((error) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (!response.ok || !result?.view) {
      const detail = typeof result?.error === 'string' ? result.error : '服務暫時無法回應，請稍後再試。';
      throw new ApiError(response.status, detail);
    }
    return result as Match;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ConnectionError(controller.signal.aborted ? '連線逾時，請稍後再試。' : '連線中斷，請確認網路後再試。');
  } finally {
    window.clearTimeout(deadline);
  }
}

function matchPath(id: string) {
  return `/api/matches/${encodeURIComponent(id)}`;
}

function selectedCard() {
  return match?.view.hand.find((card) => card.id === selected);
}

function isPlayable(card: Card) {
  return match?.view.status === 'playing' && card.cost <= match.view.energy && !busy;
}

function updateVessel(side: 'player' | 'opponent', vessel: Vessel) {
  const meter = element<HTMLProgressElement>(`${side}-meter`);
  meter.max = vessel.max_hp;
  meter.value = vessel.hp;
  element(`${side}-hp`).textContent = `${vessel.hp} / ${vessel.max_hp}`;
  element(`${side}-shield`).textContent = vessel.shield > 0 ? `護盾 ${vessel.shield}` : '';
}

function showError(error: unknown) {
  ui.error.textContent = error instanceof Error ? error.message : String(error ?? '');
  ui.error.hidden = !ui.error.textContent;
}

function setConnection(state: 'offline' | 'reconnecting' | 'online') {
  ui.connection.dataset.state = state;
  ui.connection.textContent = { offline: '待命', reconnecting: '連線中', online: '已連線' }[state];
}

function makeCard(card: Card) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card';
  button.dataset.testid = 'card';
  button.dataset.cardId = card.id;
  button.dataset.cost = String(card.cost);
  button.dataset.kind = card.kind;
  const kind = cardKinds[card.kind] ?? '戰術';
  button.setAttribute('aria-label', `${card.name}，${kind}，能量 ${card.cost}。${card.description}`);
  button.setAttribute('aria-pressed', String(selected === card.id));
  button.setAttribute('aria-disabled', String(!isPlayable(card)));
  button.draggable = Boolean(isPlayable(card));

  const costRow = document.createElement('span');
  costRow.className = 'card-cost-row';
  const cost = document.createElement('span');
  cost.className = 'card-cost';
  cost.textContent = String(card.cost);
  costRow.append(cost, kind);
  const emblem = document.createElement('span');
  emblem.className = 'card-emblem';
  emblem.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = card.name;
  const description = document.createElement('span');
  description.className = 'card-description';
  description.textContent = card.description;
  button.append(costRow, emblem, name, description);

  button.addEventListener('click', () => {
    if (!isPlayable(card)) return;
    selected = selected === card.id ? null : card.id;
    renderControls();
  });
  button.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer || !isPlayable(card)) {
      event.preventDefault();
      return;
    }
    dragged = card.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.id);
  });
  button.addEventListener('dragend', clearDrag);
  return button;
}

function renderHand(cards: Card[]) {
  const active = document.activeElement;
  const focusId = active instanceof HTMLButtonElement ? active.dataset.cardId : undefined;
  const buttons = cards.map(makeCard);
  ui.hand.replaceChildren(...buttons);
  if (focusId) {
    const next = buttons.find((button) => button.dataset.cardId === focusId) ?? buttons[0];
    if (next) next.focus({ preventScroll: true });
  }
}

function renderControls() {
  const view = match?.view;
  const canAct = view?.status === 'playing' && !busy;
  const card = selectedCard();
  ui.start.disabled = busy;
  ui.restart.disabled = busy;
  ui.play.disabled = !card || !isPlayable(card);
  ui.endTurn.disabled = !canAct;
  ui.verify.disabled = busy || verifying;
  ui.hand.setAttribute('aria-busy', String(busy));
  ui.selection.textContent = view?.status === 'playing'
    ? card ? `已選擇 ${card.name}（能量 ${card.cost}）` : '點選或拖曳手牌。'
    : view ? '演習已結束。' : '開局後會抽取手牌。';

  for (const button of ui.hand.querySelectorAll('button')) {
    const handCard = view?.hand.find((item) => item.id === button.dataset.cardId);
    const playable = Boolean(handCard && isPlayable(handCard));
    button.setAttribute('aria-pressed', String(button.dataset.cardId === selected));
    button.setAttribute('aria-disabled', String(!playable));
    button.draggable = playable;
  }
}

function renderLog(events: BattleEvent[]) {
  ui.logEmpty.hidden = events.length > 0;
  ui.log.replaceChildren(...events.toReversed().map((event) => {
    const entry = document.createElement('li');
    entry.dataset.kind = event.kind;
    entry.dataset.seq = String(event.seq);
    entry.textContent = event.text;
    return entry;
  }));
}

function renderView(view: GameView) {
  updateVessel('player', view.player);
  updateVessel('opponent', view.opponent);
  ui.turn.textContent = String(view.turn);
  ui.energy.textContent = `${view.energy} / ${view.max_energy}`;
  ui.deck.textContent = String(view.deck_count);
  ui.status.dataset.status = view.status;
  ui.dropZone.hidden = view.status !== 'playing';
  ui.start.hidden = true;
  ui.restart.hidden = view.status === 'playing';
  ui.verify.hidden = view.status === 'playing';

  if (view.status !== 'playing') {
    ui.title.textContent = outcomes[view.status];
    ui.detail.textContent = `第 ${view.turn} 回合結算。`;
  }

  renderHand(view.status === 'playing' ? view.hand : []);
  renderLog(view.events);
  renderControls();
}

function adopt(next: Match) {
  const previous = match?.id === next.id ? match.view : undefined;
  if (previous && previous.revision >= next.view.revision) return;
  match = next;
  if (!selectedCard()) selected = null;
  const lastSeq = previous?.events.at(-1)?.seq ?? 0;
  const newEvents = next.view.events.filter((event) => event.seq > lastSeq);
  const impact = newEvents.findLast((event) => ['attack', 'repair', 'guard', 'surge'].includes(event.kind));

  ocean.setActive(next.view.status === 'playing');
  if (newEvents.length) {
    ocean.pulse(impact?.kind ?? 'action');
    ui.announcement.textContent = newEvents.at(-1)?.text ?? '';
  }

  renderView(next.view);
  if (previous?.status === 'playing' && next.view.status !== previous.status) ui.title.focus();
}

function closeSocket() {
  clearTimeout(reconnectTimer);
  const current = socket;
  socket = null;
  current?.close();
}

function expireMatch() {
  closeSocket();
  clearDrag();
  setConnection('offline');
  ocean.setActive(false);
  match = null;
  selected = null;

  const resetVessel = (side: 'player' | 'opponent') => {
    element(`${side}-hp`).textContent = '—';
    element(`${side}-shield`).textContent = '';
    element<HTMLProgressElement>(`${side}-meter`).value = 0;
  };
  resetVessel('player');
  resetVessel('opponent');
  ui.turn.textContent = '—';
  ui.energy.textContent = '—';
  ui.deck.textContent = '—';
  ui.status.dataset.status = 'idle';
  ui.title.textContent = '對局已結束';
  ui.detail.textContent = '這場對局已失效，可以開始新的演習。';
  ui.start.hidden = false;
  ui.restart.hidden = true;
  ui.verify.hidden = true;
  ui.dropZone.hidden = true;
  ui.replay.textContent = '';
  renderHand([]);
  renderLog([]);
  ui.title.focus();
}

function connect(id: string, retry = 0) {
  closeSocket();
  setConnection('reconnecting');
  const address = new URL(`${matchPath(id)}/ws`, location.href);
  address.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const current = new WebSocket(address);
  socket = current;
  current.addEventListener('open', () => {
    if (socket === current) setConnection('online');
  });
  current.addEventListener('message', (event) => {
    if (socket !== current || match?.id !== id || typeof event.data !== 'string') return;
    let next: Match;
    try {
      next = JSON.parse(event.data) as Match;
    } catch {
      return;
    }
    if (next?.id === id && next.view) adopt(next);
  });
  current.addEventListener('close', () => {
    if (socket !== current || match?.id !== id) return;
    socket = null;
    setConnection('reconnecting');
    reconnectTimer = window.setTimeout(() => connect(id, retry + 1), Math.min(6000, 750 * (retry + 1)));
  });
}

function preferredSeed(): number | undefined {
  const seed = new URLSearchParams(location.search).get('seed');
  if (seed === null || !/^\d{1,10}$/.test(seed)) return undefined;
  const value = Number(seed);
  return value <= 0xffffffff ? value : undefined;
}

async function startMatch() {
  if (busy) return;
  busy = true;
  showError(null);
  renderControls();
  try {
    const next = await request('/api/matches', { seed: preferredSeed() });
    closeSocket();
    selected = null;
    ui.replay.textContent = '';
    delete ui.replay.dataset.valid;
    adopt(next);
    connect(next.id);
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    renderControls();
  }
}

function actionAccepted(snapshot: Match | null, id: string, revision: number, action: Action) {
  return snapshot?.id === id && sameValue(snapshot.history?.[revision], action);
}

async function recoverAction(id: string, revision: number, action: Action, error: unknown) {
  if (error instanceof ApiError && error.status === 404) {
    expireMatch();
    return;
  }
  if (actionAccepted(match, id, revision, action)) return;

  const stale = error instanceof ApiError && error.status === 409;
  if (stale || error instanceof ConnectionError) {
    try {
      const current = await request(matchPath(id));
      adopt(current);
      if (actionAccepted(match, id, revision, action)) return;
      showError(stale ? '對局狀態已更新，請再操作一次。' : '操作尚未確認，請再試一次。');
      return;
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 404) {
        expireMatch();
        return;
      }
    }
  }
  if (!actionAccepted(match, id, revision, action)) showError(error);
}

async function dispatch(action: Action) {
  if (busy || match?.view.status !== 'playing') return;
  const { id, view } = match;
  busy = true;
  showError(null);
  renderControls();
  try {
    const next = await request(`${matchPath(id)}/actions`, { ...action, revision: view.revision });
    adopt(next);
  } catch (error) {
    await recoverAction(id, view.revision, action, error);
  } finally {
    busy = false;
    renderControls();
  }
}

async function verifyReplay() {
  if (!match || busy || verifying) return;
  const target = match;
  if (target.history?.length !== target.view.revision) {
    ui.replay.dataset.valid = 'false';
    ui.replay.textContent = '這場對局的操作紀錄不完整。';
    return;
  }

  verifying = true;
  renderControls();
  delete ui.replay.dataset.valid;
  ui.replay.textContent = '正在核對回放…';
  try {
    const result = await replay<ReplayResult>({ seed: target.seed, actions: target.history });
    if (match?.id !== target.id) return;
    if (!result.ok) throw new Error('回放引擎無法處理這場對局。');
    const valid = sameValue(result.view, target.view);
    ui.replay.dataset.valid = String(valid);
    ui.replay.textContent = valid ? '回放驗證通過' : '回放與伺服器結果不一致。';
  } catch (error) {
    if (match?.id !== target.id) return;
    ui.replay.dataset.valid = 'false';
    ui.replay.textContent = error instanceof Error ? error.message : '回放驗證失敗。';
  } finally {
    verifying = false;
    renderControls();
  }
}

function clearDrag() {
  dragged = null;
  delete ui.dropZone.dataset.active;
}

ui.dropZone.addEventListener('dragover', (event) => {
  if (!dragged || !event.dataTransfer) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  ui.dropZone.dataset.active = 'true';
});
ui.dropZone.addEventListener('dragleave', (event) => {
  if (event.relatedTarget instanceof Node && ui.dropZone.contains(event.relatedTarget)) return;
  delete ui.dropZone.dataset.active;
});
ui.dropZone.addEventListener('drop', (event) => {
  if (!dragged || dragged !== event.dataTransfer?.getData('text/plain')) return;
  event.preventDefault();
  const card = match?.view.hand.find((item) => item.id === dragged);
  clearDrag();
  if (card && isPlayable(card)) void dispatch({ type: 'play', card_id: card.id });
});

ui.start.addEventListener('click', () => void startMatch());
ui.restart.addEventListener('click', () => void startMatch());
ui.play.addEventListener('click', () => {
  const card = selectedCard();
  if (card && isPlayable(card)) void dispatch({ type: 'play', card_id: card.id });
});
ui.endTurn.addEventListener('click', () => void dispatch({ type: 'end_turn' }));
ui.verify.addEventListener('click', () => void verifyReplay());
element('rules').addEventListener('click', () => ui.rules.showModal());
window.addEventListener('pagehide', closeSocket);
window.addEventListener('pageshow', (event) => {
  if (event.persisted && match) connect(match.id);
});
