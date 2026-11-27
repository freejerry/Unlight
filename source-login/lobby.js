import { readNews } from '/news.js';

const layout = `
  <section id="lobby-view" class="source-lobby" aria-labelledby="lobby-title">
    <header class="source-lobby-heading">
      <h1 id="lobby-title" tabindex="-1">大廳</h1>
      <button id="lobby-logout" class="source-lobby-button" type="button">登出</button>
    </header>
    <p id="lobby-status" class="source-lobby-status" role="status" aria-atomic="true"></p>
    <nav id="lobby-entries" class="source-lobby-entries" aria-label="大廳入口">
      <button id="lobby-quest-load" class="source-lobby-button" type="button" aria-haspopup="dialog" aria-controls="lobby-quest">任務</button>
      <button id="lobby-news-open" class="source-lobby-button" type="button" aria-haspopup="dialog" aria-controls="lobby-news">最新消息</button>
    </nav>
    <section id="lobby-profile" aria-labelledby="lobby-profile-title">
      <h2 id="lobby-profile-title" class="sr-only">角色狀態</h2>
      <p id="lobby-avatar-name" class="source-lobby-avatar"></p>
      <span id="lobby-player-id" hidden></span>
      <span id="lobby-avatar-id" hidden></span>
      <dl class="source-lobby-values">
        <div><dt>等級</dt><dd id="lobby-level"></dd></div>
        <div><dt>Gem</dt><dd id="lobby-gems"></dd></div>
        <div><dt>經驗值</dt><dd id="lobby-exp"></dd></div>
        <div><dt>行動力</dt><dd id="lobby-energy"></dd></div>
        <div id="lobby-deck-row" hidden><dt>牌組</dt><dd id="lobby-deck-name"></dd></div>
      </dl>
    </section>
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

function displayProfile(view, playerId, avatar) {
  const { id, name, level, gems, exp, energy, energyMax, questDecks } = avatar;
  const fields = {
    'player-id': playerId,
    'avatar-name': name,
    'avatar-id': id,
    level,
    gems,
    exp,
    energy: Number.isSafeInteger(energy) && Number.isSafeInteger(energyMax) && energyMax >= energy
      ? `${energy}／${energyMax}` : energy,
  };
  for (const [field, value] of Object.entries(fields)) {
    view.querySelector(`#lobby-${field}`).textContent = value ?? '—';
  }
  const firstDeck = questDecks?.find(deck => deck.index === 1);
  if (typeof firstDeck?.name === 'string' && firstDeck.name.trim()) {
    view.querySelector('#lobby-deck-name').textContent = firstDeck.name;
    view.querySelector('#lobby-deck-row').hidden = false;
  }
}

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
  const open = () => {
    if (signal.aborted || dialog.open || dialog.parentElement.querySelector('dialog[open]')) return;
    dialog.showModal();
    didOpen();
  };
  entry.addEventListener('click', open, { signal });
  dialog.addEventListener('close', () => entry.focus({ preventScroll: true }), { signal });
  return open;
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

export function mountLobby(host, { session, onLogout }) {
  const avatar = session.initialData?.avatar;
  if (!avatar || !Number.isSafeInteger(session.playerId) || session.playerId < 1) {
    throw new Error('A verified player and avatar are required.');
  }

  const template = document.createElement('template');
  template.innerHTML = layout;
  const view = template.content.firstElementChild;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const title = view.querySelector('#lobby-title');
  const news = view.querySelector('#lobby-news');
  const logout = view.querySelector('#lobby-logout');
  const status = view.querySelector('#lobby-status');
  displayProfile(view, session.playerId, avatar);
  bindQuestInventory(view, session, signal);
  const requestNews = async () => {
    const available = await loadNews(view, signal);
    if (available && news.open) newsSeen.add(session.playerId);
    return available;
  };
  const openNews = bindDialog(view.querySelector('#lobby-news-open'), news, signal, () => {
    if (news.dataset.state === 'ready') newsSeen.add(session.playerId);
    if (news.dataset.state === 'error') void requestNews();
  });

  logout.addEventListener('click', async () => {
    logout.disabled = true;
    status.textContent = '正在登出…';
    try {
      await onLogout();
    } catch {
      if (signal.aborted) return;
      status.textContent = '暫時無法登出。';
      logout.disabled = false;
      if (document.activeElement === document.body) logout.focus({ preventScroll: true });
    }
  }, { signal });

  host.append(view);
  title.focus({ preventScroll: true });
  void requestNews().then(available => {
    if (available && !newsSeen.has(session.playerId) && document.activeElement === title) openNews();
  });

  return () => {
    lifetime.abort();
    for (const dialog of view.querySelectorAll('dialog[open]')) dialog.close();
    view.remove();
  };
}
