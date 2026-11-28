import { BATTLE_CARD_ART, renderActionCard } from './battle-card.js';
import { playQuestBattleEffect } from './bgm.js';
import { getPreferences } from './preferences.js';

const art = new URL('./quest-art/', import.meta.url);
const directions = [
  ['back', '後退一格', 1], ['stay', '原地待機', 0],
  ['change', '更換角色', null], ['forward', '前進一格', -1], ['done', '完成', null],
];
const moveMs = 200 / 1.7;
const sineOut = 'linear(0, .1951, .3827, .5556, .7071, .8315, .9239, .9808, 1)';

function position(node, x, y, width, height) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  if (width !== undefined) node.style.width = `${width}px`;
  if (height !== undefined) node.style.height = `${height}px`;
}

function skin(parent, source, root, className, x = source?.x, y = source?.y) {
  if (!source?.file) return;
  const image = document.createElement('img');
  image.src = root instanceof URL ? new URL(source.file, root) : root + source.file;
  image.alt = '';
  image.className = `quest-battle-control-art ${className}`;
  position(image, x, y, source.width, source.height);
  parent.append(image);
}

function bounds(hit, art) {
  if (Array.isArray(hit)) return hit;
  const { x, y, width, height } = hit ?? art;
  return [x, y, width, height];
}

function displaced(node, frames, signal) {
  if (signal.aborted || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animation = node.animate(frames, { duration: moveMs, easing: sineOut });
  const cancel = () => animation.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  void animation.finished.catch(() => {}).finally(() => signal.removeEventListener('abort', cancel));
}

export function createQuestBattleMove({ battle, scene, hud, hands, controls, combatControls, status, multi, signal, isCurrent }) {
  const cards = new Map();
  const buttons = new Map();
  let definitions = new Map();
  let cardArt;
  let snapshot;
  let localAction = null;
  let clickGate;
  let timedOut = false;
  let autoSent = false;
  let compactSignature;
  let drawn = false;
  let combat = false;
  let combatDone;

  function live() { return !signal.aborted && isCurrent(); }
  function combatTurn() {
    return combat && snapshot?.phase === 'moved' && snapshot.exchange?.turn === 1 && snapshot.exchange?.index === 1;
  }
  function selectable() {
    if (!combat) return snapshot?.phase === 'move' && !snapshot.moveSubmitted;
    return combatTurn() && !snapshot.exchange.submitted && ['attack', 'defense'].includes(snapshot.exchange.phase);
  }
  function canSend() { return live() && drawn && selectable() && !snapshot.operation && !localAction && !clickGate; }

  signal.addEventListener('abort', () => clearTimeout(clickGate), { once: true });

  function pauseClicks(milliseconds) {
    clearTimeout(clickGate);
    clickGate = setTimeout(() => {
      clickGate = undefined;
      update(scene.snapshot.adventure?.battle);
    }, milliseconds);
  }

  function errorMessage(error) {
    if (error?.kind === 'quest-battle-uncertain') return combat ? '無法確認攻防操作。' : '無法確認移動操作。';
    if (error?.kind === 'quest-card-rejected') return '伺服器未接受這張牌的操作。';
    if (error?.kind === 'quest-direction-rejected') return '伺服器未接受這個移動方向。';
    return '';
  }

  async function send(kind, value, origin) {
    if (!canSend()) return;
    const operation = (combat ? {
      rotate: 'rotateBattleCard', add: 'addBattleCard', remove: 'removeBattleCard', commit: 'commitBattle',
    } : {
      direction: 'chooseMove', rotate: 'rotateMoveCard', add: 'addMoveCard',
      remove: 'removeMoveCard', commit: 'commitMove',
    })[kind];
    if (typeof scene[operation] !== 'function') return;
    const previous = document.activeElement === origin && origin?.matches(':focus-visible');
    localAction = kind;
    if (kind === 'add' || kind === 'remove') pauseClicks(250);
    status.value = '';
    updateControls();
    try {
      const args = value === undefined ? [] : [value];
      const next = await scene[operation](...args, { signal });
      if (!live()) return;
      update(next ?? scene.snapshot.adventure?.battle);
      const ownCard = cards.get(value);
      if (kind === 'rotate') {
        pauseClicks(150);
        playQuestBattleEffect('rotate', signal);
      }
      else if (kind === 'add' || kind === 'remove') playQuestBattleEffect('deal', signal);
      if (previous && kind === 'direction') {
        status.value = directions.find(([, , direction]) => direction === value)?.[1] ?? '';
        const alternative = [...buttons.values()].find(button => !button.hidden && !button.disabled);
        alternative?.focus({ preventScroll: true });
      } else if (previous && ownCard && (kind === 'add' || kind === 'remove')) {
        ownCard.primary.focus({ preventScroll: true });
      } else if (previous && kind === 'commit') {
        status.focus({ preventScroll: true });
      }
    } catch (error) {
      if (live()) status.value = errorMessage(error);
    } finally {
      localAction = null;
      if (live()) {
        update(scene.snapshot.adventure?.battle);
      }
    }
  }

  function makeButton(key, name, value, combatButton = false) {
    if (key === 'change' && !multi) return;
    const command = key === 'done' ? hud.done : hud.moveButtons?.[key];
    if (!command?.up) return;
    const { up, over, down, hit, disabled } = command;
    const target = bounds(hit, up);
    const ox = key === 'done' ? 0 : command[multi ? 'x3v3' : 'x1v1'];
    const oy = key === 'done' ? 0 : command.y;
    const [x, y, width, height] = target;
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = key === 'change';
    button.dataset[combatButton ? 'combatCommand' : 'moveCommand'] = key;
    button.setAttribute('aria-label', name);
    position(button, ox + x, oy + y, width, height);
    for (const [state, source] of [['up', up], ['over', over], ['down', down], ['disabled', key === 'change' ? null : disabled]]) {
      skin(button, source, art, `quest-battle-art-${state}`, source?.x - x, source?.y - y);
    }
    if (key !== 'change') button.addEventListener('click', () => {
      if (button.hidden) return;
      if (combatButton !== combat) return;
      if (key === 'done') return send('commit', undefined, button);
      return send('direction', value, button);
    }, { signal });
    (combatButton ? combatControls : controls).append(button);
    if (!combatButton) buttons.set(key, button);
    return button;
  }

  for (const [key, name, value] of directions) makeButton(key, name, value);
  if (combatControls) combatDone = makeButton('done', '完成', null, true);

  function upgradeCard(node, entry) {
    const id = entry.id;
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'quest-battle-card-primary';
    primary.append(...node.childNodes);
    const rotate = document.createElement('button');
    rotate.type = 'button';
    rotate.className = 'quest-battle-card-rotate';
    rotate.setAttribute('aria-label', `翻轉卡片 ${id}`);
    const hint = document.createElement('span');
    hint.className = 'quest-battle-card-hint';
    hint.setAttribute('aria-hidden', 'true');
    node.append(primary, hint, rotate);
    const record = { node, primary, rotate, hint, entry, zone: 'hand' };
    cards.set(id, record);
    primary.addEventListener('click', () => {
      if (record.entry.playable) void send(record.zone === 'hand' ? 'add' : 'remove', id, primary);
    }, { signal });
    rotate.addEventListener('click', () => {
      if (record.entry.playable) void send('rotate', id, rotate);
    }, { signal });
    return record;
  }

  function paintCard(record, entry) {
    const { node, primary } = record;
    node.dataset.up = String(entry.up);
    node.setAttribute('aria-label', `${entry.event ? '事件牌' : '行動牌'} ${entry.id}，${entry.up ? '正向' : '反向'}`);
    const card = definitions.get(entry.id);
    const face = entry.up ? card?.upper : card?.lower;
    if (face) {
      node.dataset.faceType = String(face.type);
      node.dataset.faceValue = String(face.value);
    }
    updateHint(node);
    if (!card) return;
    const canvas = document.createElement('canvas');
    const orientation = entry.up;
    void renderActionCard(canvas, card, { signal, reversed: !orientation }).then(painted => {
      if (!painted || !live() || record.entry.up !== orientation) return;
      primary.replaceChildren(canvas);
      displaced(canvas, [{ transform: orientation ? 'rotate(180deg)' : 'rotate(-180deg)' }, { transform: 'none' }], signal);
    });
  }

  function updateHint(node) {
    const type = Number(node.dataset.faceType);
    const expected = combat ? snapshot?.exchange?.playerAttacks ? (snapshot.result?.distance === 1 ? 1 : 2) : 3 : 4;
    node.dataset.moveHint = String(type === expected && getPreferences().arrow);
  }

  function syncZone(parent, entries, zone) {
    parent.dataset.count = String(entries.length);
    entries.forEach((entry, i) => {
      const record = cards.get(entry.id);
      if (!record) return;
      const { node, primary } = record;
      const rotated = record.entry.up !== entry.up;
      record.entry = entry;
      record.zone = zone;
      node.dataset.zone = combat && zone === 'table' ? 'combat' : zone;
      const action = zone === 'hand' ? '出牌' : '收回';
      primary.setAttribute('aria-label', `${action} ${entry.event ? '事件牌' : '行動牌'} ${entry.id}`);
      if (rotated) paintCard(record, entry);
      else updateHint(node);

      const spacing = zone === 'hand' ? Math.min(60, Math.max(.68 * 60, 560 / entries.length)) : 60;
      const x = zone === 'hand' ? 202 + spacing * i : 380 + (i - (entries.length - 1) / 2) * spacing;
      const y = zone === 'hand' ? 512 : 389;
      const dx = Number.parseFloat(node.style.left) - x;
      const dy = Number.parseFloat(node.style.top) - y;
      if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] ?? null);
      position(node, x, y);
      if (dx || dy) displaced(node, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], signal);
    });
  }

  function updateControls() {
    if (!snapshot) return;
    const enabled = canSend();
    const { direction, phase, operation, moveSubmitted } = snapshot;
    battle.dataset.operation = operation ?? localAction ?? '';
    battle.dataset.direction = Number.isInteger(direction) ? String(direction) : '';
    const active = combat ? selectable() : phase === 'move' || phase === 'committing';
    for (const [key, , value] of directions) {
      const button = buttons.get(key);
      if (!button) continue;
      const selected = value !== null && value === direction;
      button.hidden = selected || (key === 'done' && (moveSubmitted || ['settling', 'moved'].includes(phase)));
      if (value !== null) button.setAttribute('aria-pressed', String(value === direction));
      button.setAttribute('aria-disabled', String(combat || !enabled || key === 'change'));
    }
    if (combatDone) {
      const ownDrop = combatTurn() && ['attack', 'defense', 'committing'].includes(snapshot.exchange.phase);
      combatDone.hidden = !ownDrop || snapshot.exchange.submitted === true;
      combatDone.setAttribute('aria-disabled', String(!combat || !enabled));
    }
    for (const { node, primary, rotate, entry } of cards.values()) {
      const allowed = enabled && entry.playable;
      node.dataset.playable = String(entry.playable);
      primary.tabIndex = active && entry.playable ? 0 : -1;
      rotate.tabIndex = primary.tabIndex;
      primary.setAttribute('aria-disabled', String(!allowed));
      rotate.setAttribute('aria-disabled', String(!allowed));
      rotate.hidden = !active || !entry.playable || !cardArt?.rotate?.up;
    }
  }

  function update(result) {
    if (!result || !live()) return;
    snapshot = result;
    const entries = result.hand;
    const table = combat ? result.exchange?.battleTable : result.moveTable;
    if (drawn && Array.isArray(entries) && Array.isArray(table) && (combat ? combatTurn() : result.phase !== 'moved')) {
      const signature = [combat ? result.exchange.phase : '', ...entries.map(({ id, up }) => `${id}:${up}`), '/',
        ...table.map(({ id, up }) => `${id}:${up}`)].join(',');
      if (compactSignature !== signature) {
        compactSignature = signature;
        if (combat) {
          const visible = new Set([...entries, ...table].map(({ id }) => id));
          for (const [id, { node }] of cards) if (!visible.has(id)) node.remove();
        }
        syncZone(hands.player, entries, 'hand');
        syncZone(hands.playerTable, table, 'table');
      } else {
        for (const entry of [...entries, ...table]) {
          if (cards.has(entry.id)) cards.get(entry.id).entry = entry;
        }
      }
    }
    updateControls();
    if (timedOut && !autoSent && canSend()) {
      autoSent = true;
      void send('commit');
    }
  }

  function installCardArt(artwork) {
    cardArt = artwork;
    if (!drawn || !cardArt || !live()) return;
    for (const { rotate, hint } of cards.values()) {
      rotate.replaceChildren();
      hint.replaceChildren();
      const { up, over, down, hit } = cardArt.rotate ?? {};
      if (up) {
        const [x, y, width, height] = bounds(hit, up);
        position(rotate, 28 + x, 43 + y, width, height);
        for (const [state, source] of [['up', up], ['over', over], ['down', down]]) {
          skin(rotate, source, BATTLE_CARD_ART, `quest-battle-art-${state}`, source?.x - x, source?.y - y);
        }
      }
      if (cardArt.arrow) {
        const arrow = cardArt.arrow;
        skin(hint, arrow, BATTLE_CARD_ART, 'quest-battle-card-arrow', 28 + arrow.x, 43 + arrow.y);
      }
    }
    updateControls();
  }

  return {
    update,
    installCardArt,
    beginCombat() {
      if (combat || !live()) return;
      combat = true;
      timedOut = false;
      autoSent = false;
      compactSignature = undefined;
      hands.playerTable.replaceChildren();
      hands.playerTable.hidden = false;
      update(scene.snapshot.adventure?.battle);
    },
    attach(metadata) {
      if (!live() || drawn) return;
      definitions = metadata;
      for (const node of Array.from(hands.player.children)) {
        const id = Number(node.dataset.cardId);
        upgradeCard(node, { id, up: node.dataset.up === 'true', event: node.dataset.kind === 'event', playable: false });
      }
      drawn = true;
      installCardArt(cardArt);
      update(scene.snapshot.adventure?.battle);
    },
    onTimeout() {
      timedOut = true;
      if (localAction === 'commit' || ['commit', 'combat-commit'].includes(snapshot?.operation)) autoSent = true;
      update(snapshot);
    },
  };
}
