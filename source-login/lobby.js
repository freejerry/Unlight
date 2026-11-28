import { readNews } from '/news.js';
import { mountAvatarLayer, prepareLobbyArt } from './avatar-layer.js';
import { playLobbyClick, playQuestBattleEffect } from './bgm.js';
import { mountLobbyAchievementNotices } from './lobby-achievement.js';
import { mountLobbyApTooltip } from './lobby-ap-tooltip.js';
import { mountLobbyRecord } from './lobby-record.js';

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
          <button id="lobby-quest-load" class="source-lobby-quest-entry" type="button" aria-label="任務"></button>
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
    <button id="lobby-ap-gauge" type="button" aria-label="AP" aria-describedby="lobby-ap-tooltip"></button>
    <button id="lobby-record-open" class="source-record-open" type="button" aria-label="紀錄" aria-haspopup="dialog" disabled></button>
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

export function mountLobby(host, { session, fadeIn, returnFocus, onOptions, onQuest, onSelectableClaimed }) {
  const template = document.createElement('template');
  template.innerHTML = layout;
  const view = template.content.firstElementChild;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const title = view.querySelector('#lobby-title');
  const focus = (returnFocus && view.querySelector(returnFocus)) || title;
  const news = view.querySelector('#lobby-news');
  const avatarArrival = mountAvatarLayer(view.querySelector('.avatar-layer'), { session, signal });
  host.append(view);
  mountLobbyApTooltip(view, { session, signal });
  const waitingNotices = [];
  let ready = false;
  let checkingAchievements = false;
  let newsAvailable = false;
  const achievements = mountLobbyAchievementNotices(view, {
    signal,
    returnFocus: focus,
    onFlip: () => playQuestBattleEffect('flip', signal),
    onChoice: () => playQuestBattleEffect('lobby-choice', signal),
    onAcknowledge: receipt => session.acknowledgeLobbyAchievement(receipt),
    getSelectableOptions: receipt => session.getLobbyAchievementOptions(receipt),
    getSelectableState: receipt => session.getLobbyAchievementRewardState(receipt),
    onClaimSelectable: (receipt, index, options) => session.claimLobbyAchievementReward(receipt, index, options),
    onSelectableClaimed: details => onSelectableClaimed?.(details, signal),
    onIdle: presentNotices,
  });
  const recordTrigger = view.querySelector('#lobby-record-open');
  const record = mountLobbyRecord(view, {
    session, trigger: recordTrigger, signal,
    canOpen: () => ready && !checkingAchievements && !news.open && !achievements.hasPending(),
    onClose: presentNotices,
  });

  function presentNotices() {
    if (!ready || checkingAchievements || signal.aborted || news.open || record.isOpen()) return;
    if (waitingNotices.length) {
      achievements.enqueue(waitingNotices.splice(0));
    } else if (newsAvailable && !newsSeen.has(session.playerId) && !achievements.hasPending() &&
        document.activeElement === title) {
      news.showModal();
      newsSeen.add(session.playerId);
    }
  }

  const options = view.querySelector('#lobby-option-open');
  const canOpenOptions = typeof onOptions === 'function';
  options.disabled = true;
  if (canOpenOptions) {
    options.addEventListener('click', () => {
      playLobbyClick();
      onOptions();
    }, { signal });
  }
  const quest = view.querySelector('#lobby-quest-load');
  const canOpenQuest = typeof onQuest === 'function';
  quest.disabled = true;
  if (canOpenQuest) quest.addEventListener('click', onQuest, { signal });
  news.addEventListener('close', () => {
    title.focus({ preventScroll: true });
    presentNotices();
  }, { signal });

  void prepareLobbyArt(view, signal);
  title.focus({ preventScroll: true });
  const entrance = fadeIn?.(view) ?? host.getAnimations().find(animation => animation.animationName === 'login-destination-in');
  if (!newsSeen.has(session.playerId)) {
    void loadNews(view, signal).then(available => {
      newsAvailable = available;
      presentNotices();
    });
  }
  // LobbyView refreshes the avatar and checks notices after its entrance threads join.
  void Promise.allSettled([avatarArrival, entrance?.finished]).then(() => {
    if (signal.aborted) return;
    ready = true;
    options.disabled = !canOpenOptions;
    quest.disabled = !canOpenQuest;
    recordTrigger.disabled = false;
    if (document.activeElement === title) focus.focus({ preventScroll: true });
    session.refreshLobbyAvatar?.();
    session.subscribeLobbyAchievementEvents(event => {
      if (event.kind !== 'achievement' && event.kind !== 'new-achievement' && event.kind !== 'selectable-achievement') return;
      waitingNotices.push(event);
      presentNotices();
    }, { signal });
    presentNotices();
    const finishCheck = () => {
      checkingAchievements = false;
      presentNotices();
    };
    checkingAchievements = true;
    if (!session.checkLobbyAchievements({ signal, onBatchReady: finishCheck })) finishCheck();
  });

  return () => {
    lifetime.abort();
    for (const dialog of view.querySelectorAll('dialog[open]')) dialog.close();
    view.remove();
  };
}
