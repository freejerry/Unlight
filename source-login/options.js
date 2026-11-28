import { mountAvatarLayer, prepareLobbyArt } from './avatar-layer.js';
import { playBackClick } from './bgm.js';
import { getPreferences, setPreference, subscribePreferences } from './preferences.js';
import { mountLobbyRecord } from './lobby-record.js';
import { mountLobbyItem } from './lobby-item.js';
import { bindLobbyFriendIndicator } from './lobby.js';
import { mountLobbyFriend } from './lobby-friend.js';

const volumes = [['bgm', 'BGM'], ['se', 'SE'], ['cv', 'VOICE']];
const layout = `
  <section id="options-view" class="source-options" aria-labelledby="options-title">
    <div class="avatar-layer"></div>
    <h1 id="options-title" tabindex="-1"><span lang="en">Option</span> <span class="options-title-tcn">選項設定</span></h1>
    <section id="options-help" class="stage-panel" aria-labelledby="options-help-title">
      <h2 id="options-help-title" class="stage-panel-title" lang="en">Help Option</h2>
      <div class="options-help-fields">
        <label class="options-check"><input id="option-tooltip" type="checkbox" name="toolTip">顯示工具提示</label>
        <label class="options-check"><input id="option-arrow" type="checkbox" name="arrow">顯示箭形符號嚮導</label>
      </div>
    </section>
    <section id="options-sound" class="stage-panel" aria-labelledby="options-sound-title">
      <h2 id="options-sound-title" class="stage-panel-title" lang="en">Sound Option</h2>
      <div class="options-volume-fields">
        ${volumes.map(([key, label]) => `
        <div class="option-volume">
          <label for="option-${key}" lang="en">${label}</label>
          <div class="option-scale" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>
          <div class="option-ticks" aria-hidden="true"></div>
          <div class="option-rail" aria-hidden="true"></div>
          <input id="option-${key}" name="${key}" type="range" min="0" max="100" step="1">
        </div>`).join('')}
      </div>
    </section>
    <button id="options-back" type="button" aria-label="返回大廳">
      <span lang="en">Back</span>
      <img src="/source-login/option-art/back.png" width="48" height="32" alt="">
      <img class="options-back-over" src="/source-login/option-art/back-over.png" width="48" height="32" alt="">
    </button>
    <button id="options-record-open" class="source-record-open" type="button" aria-label="紀錄" aria-haspopup="dialog"></button>
    <button id="options-friend-open" class="source-friend-open" type="button" aria-label="好友" aria-haspopup="dialog"></button>
    <button id="options-item-open" class="source-item-open" type="button" aria-label="道具" aria-haspopup="dialog"></button>
  </section>`;

export function mountOptions(host, { session, onBack, onFriendSearchInvalid }) {
  const template = document.createElement('template');
  template.innerHTML = layout;
  const view = template.content.firstElementChild;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  mountAvatarLayer(view.querySelector('.avatar-layer'), { session, signal, idPrefix: 'options' });

  const controls = view.querySelectorAll('#options-help input, #options-sound input');
  const paint = preferences => {
    for (const control of controls) {
      const value = preferences[control.name];
      if (control.type === 'range') {
        control.valueAsNumber = value;
        control.closest('.option-volume').style.setProperty('--option-volume', `${value}%`);
      } else {
        control.checked = value;
      }
    }
  };
  paint(getPreferences());
  const unsubscribe = subscribePreferences(paint);
  for (const control of controls) {
    const isRange = control.type === 'range';
    control.addEventListener(isRange ? 'input' : 'change', () => {
      setPreference(control.name, isRange ? control.valueAsNumber : control.checked);
    }, { signal });
  }

  const back = view.querySelector('#options-back');
  back.addEventListener('click', () => {
    back.disabled = true;
    playBackClick();
    onBack();
  }, { signal });

  host.append(view);
  const record = mountLobbyRecord(view, { session, trigger: view.querySelector('#options-record-open'), signal,
    canOpen: () => !item.isOpen() && !friend.isOpen() });
  const item = mountLobbyItem(view, {
    session, trigger: view.querySelector('#options-item-open'), signal,
    canOpen: () => !record.isOpen() && !friend.isOpen(),
    onRowClick: playBackClick,
    onUse: (row, options) => session.useLobbyAvatarItem(row.inventoryId, options),
  });
  const friendTrigger = view.querySelector('#options-friend-open');
  const friend = mountLobbyFriend(view, {
    session, trigger: friendTrigger, signal,
    canOpen: () => !record.isOpen() && !item.isOpen(),
    onClosing: () => session.checkLobbyAchievements({ signal: AbortSignal.any([signal]) }),
    onSearchInvalid: focus => onFriendSearchInvalid?.(focus, signal),
  });
  bindLobbyFriendIndicator(friendTrigger, { session, signal });
  void prepareLobbyArt(view, signal);
  view.querySelector('#options-title').focus({ preventScroll: true });

  return () => {
    lifetime.abort();
    unsubscribe();
    view.remove();
  };
}
