import { renderLobbyAvatar } from './lobby-avatar.js';
import { getPreferences, subscribePreferences } from './preferences.js';

function avatarMarkup(idPrefix) {
  return `
  <div class="art-slot avatar" aria-hidden="true"></div>
  <canvas id="${idPrefix}-avatar" class="avatar-portrait" width="290" height="450" aria-label="虛擬人物"></canvas>
  <ul class="side-entries" aria-label="角色入口">
    <li data-symbol="record"><span class="sr-only">紀錄</span><img class="record-art" src="/source-login/lobby-art/record.png" width="48" height="32" alt="" /></li>
    <li data-symbol="friend"><span class="sr-only">好友</span><img class="friend-art" src="/source-login/lobby-art/friend.png" width="48" height="37" alt="" /></li>
    <li data-symbol="item"><span class="sr-only">道具</span><img class="item-art" src="/source-login/lobby-art/item.png" width="48" height="32" alt="" /></li>
  </ul>
  <dl id="${idPrefix}-profile" class="avatar-status" data-source="gene.swf" aria-label="角色狀態">
    <div class="name">
      <dt class="sr-only">Name</dt>
      <dd><span id="${idPrefix}-level-label" hidden>Lv.<span id="${idPrefix}-level"></span> </span><span id="${idPrefix}-avatar-name"></span></dd>
    </div>
    <div class="gem"><dt class="sr-only">Gem</dt><dd id="${idPrefix}-gems"></dd></div>
    <div class="exp"><dt class="sr-only">Exp</dt><dd><span id="${idPrefix}-exp"></span><span id="${idPrefix}-exp-next"></span></dd></div>
    <div class="ap">
      <dt class="sr-only">AP</dt>
      <dd><span class="lobby-ap-liquid" aria-hidden="true"></span><span id="${idPrefix}-energy" class="avatar-energy"></span></dd>
    </div>
    <div class="free-duel" hidden>
      <dt class="sr-only">不消耗AP可進行的對戰次數</dt>
      <dd><span id="${idPrefix}-free-duel-count" class="sr-only"></span><img id="${idPrefix}-free-duel-stars" class="avatar-free-duel-stars" width="43" height="13" alt="" /></dd>
    </div>
    <div id="${idPrefix}-deck-row" hidden><dt>牌組</dt><dd id="${idPrefix}-deck-name"></dd></div>
  </dl>
  <span id="${idPrefix}-player-id" hidden></span>
  <span id="${idPrefix}-avatar-id" hidden></span>`;
}

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

export async function prepareLobbyArt(view, signal) {
  try {
    const response = await fetch(hoverArtPath + 'index.json', {
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) return;
    const { entrancesBase, buttons } = await response.json();
    const anchors = view.querySelectorAll('.entrance-layer [data-symbol], .avatar-layer [data-symbol]');
    const entranceArt = view.querySelector('.entrance-art');
    const [base, ...sprites] = await Promise.all([
      entranceArt && loadHoverImage(entrancesBase, 760, 680),
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
    if (base) {
      base.className = 'entrance-art';
      entranceArt.replaceWith(base);
    }
    view.dataset.hoverArt = 'ready';
  } catch {
    // Keep the approved default artwork if the optional state bundle is incomplete.
  }
}

function displayProfile(layer, idPrefix, playerId, avatar) {
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
    layer.querySelector(`#${idPrefix}-${field}`).textContent = value ?? '—';
  }
  layer.querySelector(`#${idPrefix}-level-label`).hidden = !Number.isSafeInteger(level);
  if (hasEnergyRange) {
    // The original ActionPointGauge leaves a small margin at full AP.
    layer.querySelector('.ap').style.setProperty('--lobby-ap-ratio', 0.98 * energy / energyMax);
  }
  if (Number.isSafeInteger(freeDuelCount) && freeDuelCount >= 0 && freeDuelCount <= 3) {
    const count = layer.querySelector(`#${idPrefix}-free-duel-count`);
    count.textContent = freeDuelCount;
    layer.querySelector(`#${idPrefix}-free-duel-stars`).src = `/source-login/lobby-art/duel-stars-${freeDuelCount}.png`;
    count.closest('.free-duel').hidden = false;
  }
  const firstDeck = questDecks?.find(deck => deck.index === 1);
  if (typeof firstDeck?.name === 'string' && firstDeck.name.trim()) {
    layer.querySelector(`#${idPrefix}-deck-name`).textContent = firstDeck.name;
  }
}

async function displayExperienceTarget(layer, idPrefix, { level, exp }, signal) {
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
      layer.querySelector(`#${idPrefix}-exp-next`).textContent = `/${target || '-----'}`;
    }
  } catch {
    // The current experience value is available even without the original table.
  }
}

export function mountAvatarLayer(layer, { session, signal, idPrefix = 'lobby' }) {
  const avatar = session.initialData?.avatar;
  if (!avatar || !Number.isSafeInteger(session.playerId) || session.playerId < 1) {
    throw new Error('A verified player and avatar are required.');
  }
  if (idPrefix !== 'lobby' && idPrefix !== 'options') {
    throw new Error('Unknown avatar layer.');
  }

  layer.innerHTML = avatarMarkup(idPrefix);
  displayProfile(layer, idPrefix, session.playerId, avatar);
  const hints = [
    [layer.querySelector(`#${idPrefix}-avatar-name`), avatar.name ?? ''],
    [layer.querySelector('.free-duel'), '不消耗AP可進行的對戰次數'],
  ];
  const applyHints = ({ toolTip }) => {
    for (const [element, title] of hints) {
      if (toolTip) element.title = title;
      else element.removeAttribute('title');
    }
  };
  applyHints(getPreferences());
  const unsubscribe = subscribePreferences(applyHints);
  signal.addEventListener('abort', unsubscribe, { once: true });
  void displayExperienceTarget(layer, idPrefix, avatar, signal);
  void renderLobbyAvatar(layer.querySelector('.avatar-portrait'), avatar.equippedPartIds, {
    signal,
    fadeOnly: idPrefix === 'options',
  }).catch(() => {
    // The portrait renderer marks its own failure; the signed-in view remains usable.
  });
}
