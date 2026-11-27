import { readNews } from '/news.js';
import { renderLobbyAvatar } from './lobby-avatar.js';

const layout = `
  <section id="lobby-view" class="source-lobby lobby-stage" aria-labelledby="lobby-title">
    <h1 id="lobby-title" class="sr-only" tabindex="-1">大廳</h1>
    <!-- LobbyView.as: PRIO_BG, PRIO_CHARA, PRIO_AVATAR, PRIO_ENTRANCE. -->
    <div class="lobby-backdrop" data-source="entrance_bg.swf" aria-hidden="true"></div>
    <div class="art-slot standing-character" role="img" aria-label="艾伯李斯特立繪" data-source="standchara01.swf"></div>
    <div class="avatar-layer">
      <div class="art-slot avatar" aria-hidden="true"></div>
      <canvas id="lobby-avatar" width="290" height="450" aria-label="虛擬人物"></canvas>
      <ul class="side-entries" aria-label="角色入口">
        <li data-symbol="record"><span class="sr-only">紀錄</span><img class="record-art" src="/source-login/lobby-art/record.png" width="48" height="32" alt="" /></li>
        <li data-symbol="friend"><span class="sr-only">好友</span><img class="friend-art" src="/source-login/lobby-art/friend.png" width="48" height="37" alt="" /></li>
        <li data-symbol="item"><span class="sr-only">道具</span><img class="item-art" src="/source-login/lobby-art/item.png" width="48" height="32" alt="" /></li>
      </ul>
      <dl id="lobby-profile" class="avatar-status" data-source="gene.swf" aria-label="角色狀態">
        <div class="name">
          <dt class="sr-only">Name</dt>
          <dd><span id="lobby-level-label" hidden>Lv.<span id="lobby-level"></span> </span><span id="lobby-avatar-name"></span></dd>
        </div>
        <div class="gem"><dt class="sr-only">Gem</dt><dd id="lobby-gems"></dd></div>
        <div class="exp"><dt class="sr-only">Exp</dt><dd><span id="lobby-exp"></span><span id="lobby-exp-next"></span></dd></div>
        <div class="ap">
          <dt class="sr-only">AP</dt>
          <dd><span class="lobby-ap-liquid" aria-hidden="true"></span><span id="lobby-energy"></span></dd>
        </div>
        <div class="free-duel" title="不消耗AP可進行的對戰次數" hidden>
          <dt class="sr-only">不消耗AP可進行的對戰次數</dt>
          <dd><span id="lobby-free-duel-count" class="sr-only"></span><img id="lobby-free-duel-stars" width="43" height="13" alt="" /></dd>
        </div>
        <div id="lobby-deck-row" hidden><dt>牌組</dt><dd id="lobby-deck-name"></dd></div>
      </dl>
      <span id="lobby-player-id" hidden></span>
      <span id="lobby-avatar-id" hidden></span>
    </div>
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
        <li class="options" data-symbol="btn_h"><span class="sr-only">設定</span></li>
        <li class="tutorial" data-symbol="btn_d"><span class="sr-only">教學</span></li>
        <li class="serial" data-symbol="btn_serial"><span class="sr-only">序號</span></li>
      </ul>
      <div class="lower-slot ranking" role="img" aria-label="排行榜外框" data-source="entrance_rank.swf"></div>
      <div class="source-lobby-actions">
        <button id="lobby-news-open" class="source-lobby-button" type="button" aria-haspopup="dialog" aria-controls="lobby-news">最新消息</button>
        <button id="lobby-logout" class="source-lobby-button" type="button">登出</button>
      </div>
    </div>
    <div class="lower-slot chat" aria-hidden="true"></div>
    <p id="lobby-status" class="source-lobby-status" role="status" aria-atomic="true"></p>
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
const hoverArtPath = '/source-login/lobby-art/hover/';

async function loadHoverImage(filename, width, height) {
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9_-]+\.png$/.test(filename)) {
    throw new Error('Invalid lobby artwork filename.');
  }
  const image = new Image(width, height);
  image.alt = '';
  image.src = hoverArtPath + filename;
  await image.decode();
  if (image.naturalWidth !== width || image.naturalHeight !== height) {
    throw new Error('Invalid lobby artwork size.');
  }
  return image;
}

async function prepareHoverMotion(target, { file, frameCount, frameMs, loop, loopStart = 0 }, width, height, signal) {
  if (!Number.isSafeInteger(frameCount) || frameCount < 2 ||
      !Number.isSafeInteger(loopStart) || loopStart < 0 || loopStart >= frameCount ||
      !Number.isFinite(frameMs) || frameMs <= 0) return;
  try {
    const sprite = await loadHoverImage(file, width, height * frameCount);
    if (signal.aborted) return;
    const intro = loop === true ? loopStart : 0;
    const steps = loop === true ? frameCount - intro : frameCount - 1;
    sprite.className = 'lobby-art-motion';
    sprite.style.setProperty('--lobby-art-motion-start', `${-height * intro}px`);
    sprite.style.setProperty('--lobby-art-motion-end', `${-height * (intro + steps)}px`);
    sprite.style.animationDuration = `${frameMs * steps}ms`;
    sprite.style.animationTimingFunction = `steps(${steps}, end)`;
    sprite.style.animationIterationCount = loop === true ? 'infinite' : '1';
    if (intro) {
      const introDuration = `${frameMs * intro}ms`;
      sprite.style.animationName = 'lobby-art-over-intro, lobby-art-over-frames';
      sprite.style.animationDuration = `${introDuration}, ${sprite.style.animationDuration}`;
      sprite.style.animationTimingFunction = `steps(${intro}, end), ${sprite.style.animationTimingFunction}`;
      sprite.style.animationDelay = `0ms, ${introDuration}`;
      sprite.style.animationIterationCount = '1, infinite';
      sprite.style.animationFillMode = 'forwards, none';
    }
    target.append(sprite);
  } catch {
    // The exact static hover frame remains usable without its optional animation.
  }
}

async function prepareLobbyHover(view, signal) {
  try {
    const response = await fetch(hoverArtPath + 'index.json', {
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) return;
    const { entrancesBase, buttons } = await response.json();
    const anchors = view.querySelectorAll('[data-symbol]');
    const [base, ...sprites] = await Promise.all([
      loadHoverImage(entrancesBase, 760, 680),
      ...Array.from(anchors, async anchor => {
        const { x, y, width, height, up, over, animation } = buttons[anchor.dataset.symbol];
        if (![x, y, width, height].every(Number.isSafeInteger) ||
            x < 0 || y < 0 || width < 1 || height < 1 || x + width > 780 || y + height > 680) {
          throw new Error('Invalid lobby artwork bounds.');
        }
        const [idle, hovered] = await Promise.all([loadHoverImage(up, width, height), loadHoverImage(over, width, height)]);
        return { anchor, x, y, idle, hovered, animation };
      }),
    ]);
    if (signal.aborted) return;

    const scene = view.getBoundingClientRect();
    for (const { anchor, x, y, idle, hovered, animation } of sprites) {
      const bounds = anchor.getBoundingClientRect();
      const oldArt = anchor.querySelector(':scope > img');
      const overLayer = document.createElement('span');
      idle.className = 'lobby-art-up';
      overLayer.className = 'lobby-art-over';
      hovered.className = 'lobby-art-still';
      overLayer.append(hovered);
      for (const layer of [idle, overLayer]) {
        layer.style.left = `${x - (bounds.left - scene.left)}px`;
        layer.style.top = `${y - (bounds.top - scene.top)}px`;
      }
      if (oldArt) {
        idle.classList.add(...oldArt.classList);
        oldArt.replaceWith(idle, overLayer);
      } else {
        anchor.append(idle, overLayer);
      }
      if (animation) {
        overLayer.style.width = `${hovered.width}px`;
        overLayer.style.height = `${hovered.height}px`;
        void prepareHoverMotion(overLayer, animation, hovered.width, hovered.height, signal);
      }
    }
    base.className = 'entrance-art';
    view.querySelector('.entrance-art').replaceWith(base);
    view.dataset.hoverArt = 'ready';
  } catch {
    // Keep the approved default artwork if the optional state bundle is incomplete.
  }
}

function displayProfile(view, playerId, avatar) {
  const { id, name, level, gems, exp, energy, energyMax, freeDuelCount, questDecks } = avatar;
  const hasEnergyRange = Number.isSafeInteger(energy) && Number.isSafeInteger(energyMax) &&
    energy >= 0 && energyMax > 0 && energy <= energyMax;
  const fields = {
    'player-id': playerId,
    'avatar-name': name,
    'avatar-id': id,
    level,
    gems,
    exp,
    energy: hasEnergyRange ? `${energy}/${energyMax}` : energy,
  };
  for (const [field, value] of Object.entries(fields)) {
    view.querySelector(`#lobby-${field}`).textContent = value ?? '—';
  }
  view.querySelector('#lobby-level-label').hidden = !Number.isSafeInteger(level);
  view.querySelector('#lobby-avatar-name').title = name ?? '';
  if (hasEnergyRange) {
    // The original ActionPointGauge leaves a small margin at full AP.
    view.querySelector('.ap').style.setProperty('--lobby-ap-ratio', 0.98 * energy / energyMax);
  }
  if (Number.isSafeInteger(freeDuelCount) && freeDuelCount >= 0 && freeDuelCount <= 3) {
    const count = view.querySelector('#lobby-free-duel-count');
    count.textContent = freeDuelCount;
    view.querySelector('#lobby-free-duel-stars').src = `/source-login/lobby-art/duel-stars-${freeDuelCount}.png`;
    count.closest('.free-duel').hidden = false;
  }
  const firstDeck = questDecks?.find(deck => deck.index === 1);
  if (typeof firstDeck?.name === 'string' && firstDeck.name.trim()) {
    view.querySelector('#lobby-deck-name').textContent = firstDeck.name;
  }
}

async function displayExperienceTarget(view, { level, exp }, signal) {
  if (!Number.isSafeInteger(level) || level < 1 || !Number.isSafeInteger(exp)) return;
  try {
    const response = await fetch('/source-login/avatar-levels.json', {
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
    });
    if (!response.ok) return;
    const { levelMax, thresholds } = await response.json();
    if (signal.aborted || !Number.isSafeInteger(levelMax) || levelMax < 1) return;
    const target = level >= levelMax ? 0 : thresholds?.[level];
    if (Number.isSafeInteger(target) && target >= 0) {
      view.querySelector('#lobby-exp-next').textContent = `/${target || '-----'}`;
    }
  } catch {
    // The current experience value is available even without the original table.
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
  void prepareLobbyHover(view, signal);
  void renderLobbyAvatar(view.querySelector('#lobby-avatar'), avatar.equippedPartIds, { signal }).catch(() => {
    // The portrait renderer marks its own failure; the signed-in view remains usable.
  });
  void displayExperienceTarget(view, avatar, signal);
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
