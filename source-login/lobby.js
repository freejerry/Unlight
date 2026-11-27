import { readNews } from '/news.js';
import { mountAvatarLayer, prepareLobbyArt } from './avatar-layer.js';
import { playLobbyClick } from './bgm.js';

const layout = `
  <section id="lobby-view" class="source-lobby lobby-stage" aria-labelledby="lobby-title">
    <h1 id="lobby-title" class="sr-only" tabindex="-1">大廳</h1>
    <!-- LobbyView.as: PRIO_BG, PRIO_CHARA, PRIO_AVATAR, PRIO_ENTRANCE. -->
    <div class="lobby-backdrop" data-source="entrance_bg.swf" aria-hidden="true"></div>
    <div class="art-slot standing-character" role="img" aria-label="艾伯李斯特立繪" data-source="standchara01.swf"></div>
    <div class="avatar-layer"></div>
    <div id="lobby-entries" class="entrance-layer" role="group" aria-label="大廳入口">
      <img class="entrance-art" src="/source-login/lobby-art/entrances.png" width="760" height="680" alt="" />
      <!-- EntranceSet.as binds these instance names from the TCN entrance SWF. -->
      <ul class="top-entries" aria-label="館舍入口">
        <li data-symbol="btn_i"><span class="sr-only">商店</span></li>
        <li data-symbol="btn_j"><span class="sr-only">暗房</span></li>
        <li data-symbol="btn_g"><span class="sr-only">牌組</span></li>
        <li data-symbol="btn_e"><span class="sr-only">道具</span></li>
        <li data-symbol="btn_c"><span class="sr-only">圖書館</span></li>
      </ul>
      <ul class="play-entries" aria-label="遊戲入口">
        <li class="duel" data-symbol="btn_f"><span class="sr-only">對戰</span></li>
        <li class="quest" data-symbol="btn_b">
          <button id="lobby-quest-load" class="source-lobby-quest-entry" type="button" aria-label="任務" aria-haspopup="dialog" aria-controls="lobby-quest"></button>
        </li>
        <li class="raid" data-symbol="btn_k"><span class="sr-only">襲擊</span></li>
      </ul>
      <ul class="utility-entries" aria-label="輔助入口">
        <li class="options" data-symbol="btn_h">
          <button id="lobby-option-open" class="source-lobby-option-entry" type="button" aria-label="設定"></button>
        </li>
        <li class="tutorial" data-symbol="btn_d"><span class="sr-only">教學</span></li>
        <li class="serial" data-symbol="btn_serial"><span class="sr-only">序號</span></li>
      </ul>
      <div class="lower-slot ranking" role="img" aria-label="排行榜外框" data-source="entrance_rank.swf"></div>
    </div>
    <div class="lower-slot chat" aria-hidden="true"></div>
    <dialog id="lobby-quest" class="stage-panel source-lobby-dialog" aria-labelledby="lobby-quest-title" data-state="idle">
      <header class="source-lobby-dialog-heading">
        <h2 id="lobby-quest-title" class="stage-panel-title">任務清單</h2>
        <form method="dialog">
          <button id="lobby-quest-close" class="source-lobby-button" type="submit" autofocus>關閉</button>
        </form>
      </header>
      <div class="source-lobby-body source-lobby-quest-body">
        <p id="lobby-quest-status" role="status" aria-atomic="true"></p>
        <button id="lobby-quest-retry" class="source-lobby-button" type="button" hidden>重新讀取</button>
        <ol id="lobby-quest-rows" class="source-lobby-scroll source-lobby-quest-rows" aria-labelledby="lobby-quest-title" role="list" tabindex="0" hidden></ol>
      </div>
    </dialog>
    <dialog id="lobby-news" class="stage-panel source-lobby-dialog" aria-labelledby="lobby-news-title" data-state="loading">
      <header class="source-lobby-dialog-heading">
        <h2 id="lobby-news-title" class="stage-panel-title">最新消息</h2>
        <form method="dialog">
          <button id="lobby-news-close" class="source-lobby-button" type="submit" autofocus>關閉</button>
        </form>
      </header>
      <div class="source-lobby-body source-lobby-news-body">
        <p id="lobby-news-status" role="status" aria-atomic="true">正在讀取最新消息…</p>
        <div id="lobby-news-content" class="source-lobby-scroll source-lobby-news-content" role="region" aria-labelledby="lobby-news-title" tabindex="0" hidden></div>
      </div>
    </dialog>
  </section>`;

const questStates = ['新任務', '未完成', '進行中', '已完成', '搜尋中', '失敗', '受贈'];
const newsSeen = new Set();
async function loadNews(view, signal) {
  const panel = view.querySelector('#lobby-news');
  const status = panel.querySelector('#lobby-news-status');
  const content = panel.querySelector('#lobby-news-content');
  panel.dataset.state = 'loading';
  status.textContent = '正在讀取最新消息…';
  try {
    const response = await fetch('/public/news.xml', {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok && response.status !== 404) throw new Error('News request failed.');
    const news = response.ok ? readNews(await response.text()) : null;
    if (signal.aborted) return false;
    if (news?.textContent.trim()) {
      content.replaceChildren(news);
      content.hidden = false;
      panel.dataset.state = 'ready';
      status.textContent = '最新消息已載入。';
      status.classList.add('sr-only');
      return true;
    } else {
      panel.dataset.state = 'empty';
      status.textContent = '目前沒有最新消息。';
    }
  } catch {
    if (signal.aborted) return false;
    panel.dataset.state = 'error';
    status.textContent = '暫時無法讀取最新消息。';
  }
  return false;
}

function bindDialog(entry, dialog, signal, didOpen) {
  entry.addEventListener('click', () => {
    if (signal.aborted || dialog.open || dialog.parentElement.querySelector('dialog[open]')) return;
    dialog.showModal();
    didOpen();
  }, { signal });
  dialog.addEventListener('close', () => entry.focus({ preventScroll: true }), { signal });
}

function createQuestRow({ inventoryId, questId, status }) {
  const row = document.createElement('li');
  row.dataset.inventoryId = String(inventoryId);
  row.dataset.questId = String(questId);
  row.dataset.questStatus = String(status);
  const label = document.createElement('strong');
  label.textContent = questId > 0 ? `任務 ${questId}` : '待確認任務';
  const state = document.createElement('span');
  state.textContent = questStates[status] ?? `狀態 ${status}`;
  row.append(label, state);
  return row;
}

async function resolveQuestNames(rows, signal) {
  const ids = [...new Set(rows.map(row => Number(row.dataset.questId)).filter(id => id > 0))];
  if (!ids.length) return;
  try {
    const params = new URLSearchParams();
    for (const id of ids) params.append('id', String(id));
    const response = await fetch(`/api/quest-catalog?${params}`, {
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
    });
    if (!response.ok) return;
    const { quests } = await response.json();
    if (signal.aborted || !Array.isArray(quests)) return;
    const names = new Map(quests.map(quest => [quest?.id, quest?.name]));
    for (const row of rows) {
      const name = names.get(Number(row.dataset.questId));
      if (row.isConnected && typeof name === 'string' && name.trim()) row.firstElementChild.textContent = name;
    }
  } catch {
    // The confirmed inventory remains visible with its original quest IDs.
  }
}

function bindQuestInventory(view, session, signal) {
  const panel = view.querySelector('#lobby-quest');
  const entry = view.querySelector('#lobby-quest-load');
  const retry = panel.querySelector('#lobby-quest-retry');
  const status = panel.querySelector('#lobby-quest-status');
  const list = panel.querySelector('#lobby-quest-rows');
  const read = async () => {
    if (panel.dataset.state === 'loading') return;
    panel.dataset.state = 'loading';
    status.textContent = '正在讀取任務資料…';
    if (document.activeElement === retry) {
      panel.querySelector('#lobby-quest-close').focus({ preventScroll: true });
    }
    retry.hidden = true;
    list.hidden = true;
    try {
      const snapshot = await session.readQuestInventory({ signal });
      if (signal.aborted) return;
      if (!Array.isArray(snapshot?.rows)) throw new Error('Quest inventory unavailable.');
      const rows = snapshot.rows.map(createQuestRow);
      list.replaceChildren(...rows);
      list.hidden = rows.length === 0;
      panel.dataset.state = rows.length ? 'ready' : 'empty';
      status.textContent = Number.isSafeInteger(snapshot.capacity)
        ? `持有 ${rows.length}／${snapshot.capacity} 筆任務`
        : `持有 ${rows.length} 筆任務`;
      void resolveQuestNames(rows, signal);
    } catch {
      if (signal.aborted) return;
      panel.dataset.state = 'error';
      status.textContent = '暫時無法讀取任務資料。';
      retry.hidden = false;
    }
  };
  bindDialog(entry, panel, signal, read);
  retry.addEventListener('click', read, { signal });
}

export function mountLobby(host, { session, fadeIn, onOptions }) {
  const template = document.createElement('template');
  template.innerHTML = layout;
  const view = template.content.firstElementChild;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const title = view.querySelector('#lobby-title');
  const news = view.querySelector('#lobby-news');
  const avatarArrival = mountAvatarLayer(view.querySelector('.avatar-layer'), { session, signal });
  const options = view.querySelector('#lobby-option-open');
  options.disabled = typeof onOptions !== 'function';
  if (!options.disabled) {
    options.addEventListener('click', () => {
      playLobbyClick();
      onOptions();
    }, { signal });
  }
  bindQuestInventory(view, session, signal);
  news.addEventListener('close', () => title.focus({ preventScroll: true }), { signal });

  host.append(view);
  void prepareLobbyArt(view, signal);
  title.focus({ preventScroll: true });
  const entrance = fadeIn?.(view) ?? host.getAnimations().find(animation => animation.animationName === 'login-destination-in');
  // LobbyView asks for an avatar update after its entrance threads have joined.
  const ready = Promise.allSettled([avatarArrival, entrance?.finished]).then(() => {
    if (!signal.aborted) session.refreshLobbyAvatar?.();
  });
  if (!newsSeen.has(session.playerId)) {
    void Promise.all([loadNews(view, signal), ready]).then(([available]) => {
      if (!available || signal.aborted || document.activeElement !== title) return;
      news.showModal();
      newsSeen.add(session.playerId);
    });
  }

  return () => {
    lifetime.abort();
    for (const dialog of view.querySelectorAll('dialog[open]')) dialog.close();
    view.remove();
  };
}
