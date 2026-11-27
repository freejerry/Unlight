import { parseReplayTrace } from './replay-model.js';

const RECORD_INTERVAL_MS = 600;
const ui = {
  main: document.querySelector('#replay'),
  status: document.querySelector('#replay-status'),
  retry: document.querySelector('#replay-retry'),
  seedLabel: document.querySelector('#replay-seed-label'),
  seed: document.querySelector('#replay-seed'),
  player: document.querySelector('#replay-player'),
  content: document.querySelector('#replay-content'),
  toggle: document.querySelector('#replay-toggle'),
  previous: document.querySelector('#replay-prev'),
  next: document.querySelector('#replay-next'),
  seek: document.querySelector('#replay-seek'),
  index: document.querySelector('#replay-index'),
  tick: document.querySelector('#replay-tick'),
  time: document.querySelector('#replay-time'),
  turn: document.querySelector('#replay-turn'),
  phase: document.querySelector('#replay-phase'),
  playerHp: document.querySelector('#replay-player-hp'),
  cpuHp: document.querySelector('#replay-cpu-hp'),
  result: document.querySelector('#replay-result'),
  draw: document.querySelector('#replay-draw'),
  drawPlayer: document.querySelector('#replay-draw-player'),
  drawCpu: document.querySelector('#replay-draw-cpu'),
  raw: document.querySelector('#replay-event-json'),
};

let replay = null;
let index = 0;
let timer = null;
let loading = false;

function renderEvent() {
  const { events, outcome } = replay;
  const event = events[index];
  const last = events.length - 1;
  const playing = timer !== null;

  ui.main.dataset.playback = playing ? 'playing' : 'paused';
  ui.toggle.textContent = playing ? '暫停' : index === last ? '重新播放' : '播放';
  ui.toggle.disabled = last === 0;
  ui.previous.disabled = index === 0;
  ui.next.disabled = index === last;
  ui.seek.disabled = last === 0;
  ui.seek.value = String(index);
  ui.seek.setAttribute('aria-valuetext', `第 ${index + 1} 筆，共 ${events.length} 筆`);
  ui.index.textContent = `${index + 1} / ${events.length}`;

  ui.tick.textContent = String(event.tick);
  ui.time.textContent = (event.tick / 10).toFixed(1);
  ui.turn.textContent = String(event.turn);
  ui.phase.textContent = event.phase;
  ui.playerHp.textContent = String(event.hp[0]);
  ui.cpuHp.textContent = String(event.hp[1]);
  ui.result.textContent = event.phase === 'finished' ? outcome.join(' / ') : '—';
  ui.draw.hidden = event.drawCounts === null;
  ui.drawPlayer.textContent = event.drawCounts?.[0] ?? '';
  ui.drawCpu.textContent = event.drawCounts?.[1] ?? '';
  ui.raw.textContent = JSON.stringify(event.raw, null, 2);
}

function stopPlayback() {
  clearInterval(timer);
  timer = null;
}

function selectEvent(position) {
  if (!replay) return;
  stopPlayback();
  index = Math.min(replay.events.length - 1, Math.max(0, position));
  renderEvent();
}

function togglePlayback() {
  if (!replay || replay.events.length < 2) return;
  const last = replay.events.length - 1;
  if (timer !== null) {
    stopPlayback();
  } else {
    if (index === last) index = 0;
    timer = setInterval(() => {
      index += 1;
      if (index === last) stopPlayback();
      renderEvent();
    }, RECORD_INTERVAL_MS);
  }
  renderEvent();
}

function showLoadState(state, message) {
  const ready = state === 'ready';
  ui.main.dataset.state = state;
  ui.status.textContent = message;
  ui.retry.hidden = state !== 'failed';
  ui.seedLabel.hidden = !ready;
  ui.player.hidden = !ready;
  ui.content.hidden = !ready;
}

async function loadReplay() {
  if (loading) return;
  loading = true;
  showLoadState('loading', '正在讀取 Ruby 對局紀錄…');
  try {
    const response = await fetch('/api/replay-baseline', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    replay = parseReplayTrace(await response.json());
    index = 0;
    ui.seed.textContent = String(replay.seed);
    ui.seek.max = String(replay.events.length - 1);
    renderEvent();
    showLoadState('ready', `已讀取 ${replay.events.length} 筆 Ruby 紀錄。`);
  } catch {
    replay = null;
    showLoadState('failed', '無法讀取 Ruby 對局紀錄。請重試。');
  } finally {
    loading = false;
  }
}

ui.toggle.addEventListener('click', togglePlayback);
ui.previous.addEventListener('click', () => selectEvent(index - 1));
ui.next.addEventListener('click', () => selectEvent(index + 1));
ui.seek.addEventListener('input', () => selectEvent(ui.seek.valueAsNumber));
ui.retry.addEventListener('click', () => void loadReplay());
window.addEventListener('pagehide', () => {
  if (timer !== null) {
    stopPlayback();
    renderEvent();
  }
});

void loadReplay();
