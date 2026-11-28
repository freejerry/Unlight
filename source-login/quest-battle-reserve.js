import { renderCharacterCard } from './character-card.js';

const art = new URL('./quest-art/', import.meta.url);
const cardWidth = 168;
const cardHeight = 240;
const fieldHeight = 680;
const quadOut = 'cubic-bezier(.333333, .666667, .666667, 1)';
const expandedCards = new WeakMap();

function place(node, x, y, width, height) {
  Object.assign(node.style, {
    position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`,
  });
}

function currentDamage(row, definition) {
  return Number.isInteger(row.hp) && Number.isInteger(definition?.hp)
    ? Math.max(0, definition.hp - row.hp) : row.seedDamage;
}

function reserveLabel(tab, field, bounds) {
  const label = document.createElement('span');
  label.dataset.reserveField = field;
  Object.assign(label.style, { textAlign: 'center', color: '#4c4c4c',
    font: 'bold 9px/14px Verdana, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', pointerEvents: 'none' });
  if (field === 'maxHp') label.style.color = '#b3b3b3';
  if (field === 'name') Object.assign(label.style, { textAlign: 'left', color: '#3c3c3c',
    font: '14px/18px "Unlight Card Mincho", serif', letterSpacing: '1px' });
  if (field === 'hp') Object.assign(label.style, { font: '24px/25px "Bradley Gratis", serif', letterSpacing: '2px' });
  place(label, ...bounds);
  tab.append(label);
  return label;
}

/** The original offstage status tab and card motion from DuelCharaCards. */
export function createQuestBattleReserve(battle, { artwork, definitions, signal, inspect, restoreFocus, side = 'player' }) {
  const foe = side === 'opponent';
  const tabOffset = artwork?.offsets?.[foe ? 'foe' : 'player'];
  if (!artwork?.base || !tabOffset) return;
  const inspectTop = foe ? 0 : fieldHeight - cardHeight;
  const restOffset = foe ? -cardHeight : cardHeight;
  const prefix = foe ? 'quest-battle-opponent' : 'quest-battle-reserve';
  const root = document.createElement('div');
  root.id = `${prefix}-tabs`;
  root.className = `quest-battle-layer ${root.id}`;
  root.style.zIndex = '30';
  root.setAttribute('aria-label', foe ? '對手角色' : '候補角色');
  battle.append(root);
  const slots = new Map();
  let enabled = false;
  let active;

  function setOpen(slot, open, immediate = false) {
    const duration = immediate || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : open ? 150 : 80;
    slot.node.dataset.state = open ? 'expanded' : 'collapsed';
    slot.trigger.setAttribute('aria-expanded', String(open));
    slot.node.style.zIndex = open ? '1' : '0';
    slot.track.style.transitionDuration = `${duration}ms`;
    slot.track.style.transform = open ? 'none' : `translateY(${restOffset}px)`;
    slot.hitArea.style.pointerEvents = open ? 'auto' : 'none';
    const card = slot.inspector?.card;
    if (!card) return;
    card.inert = !open;
    card.style.pointerEvents = open ? 'auto' : 'none';
    card.style.transitionDuration = `${duration}ms, 0ms`;
    card.style.transitionDelay = `0ms, ${open ? 0 : duration}ms`;
    card.style.opacity = open ? '1' : '0';
    card.style.visibility = open ? 'visible' : 'hidden';
  }

  function close(slot, { immediate = false, returnFocus = true } = {}) {
    if (active !== slot) return;
    active = undefined;
    if (expandedCards.get(battle) === closeActive) expandedCards.delete(battle);
    if (returnFocus && slot.inspector?.card.contains(document.activeElement)) slot.trigger.focus({ preventScroll: true });
    setOpen(slot, false, immediate);
  }

  function closeActive() {
    if (active) close(active);
  }

  function paintInspector(slot) {
    if (!slot.inspector) return;
    const { card, canvas, ready, updateConditions } = slot.inspector;
    const damage = currentDamage(slot.row, slot.definition);
    card.style.filter = slot.dead ? 'brightness(.5)' : '';
    updateConditions(slot.row);
    if (damage === slot.damage) return;
    slot.damage = damage;
    void ready.then(() => {
      if (!slot.signal.aborted && damage === slot.damage) {
        void renderCharacterCard(canvas, slot.definition, { signal: slot.signal, damage });
      }
    });
  }

  function open(slot) {
    if (!enabled || slot.trigger.disabled || active === slot || slot.signal.aborted) return;
    expandedCards.get(battle)?.();
    if (!slot.inspector) {
      slot.damage = currentDamage(slot.row, slot.definition);
      slot.inspector = inspect(slot.track, slot.definition, slot.row, slot.damage, slot.signal);
      const { card } = slot.inspector;
      card.removeAttribute('data-roster-index');
      card.style.top = `${inspectTop}px`;
      card.style.opacity = '0';
      card.style.transitionProperty = 'opacity, visibility';
      card.style.transitionTimingFunction = quadOut;
      slot.trigger.setAttribute('aria-controls', card.id);
      paintInspector(slot);
      // Establish the starting opacity before starting the source's parallel slide and fade.
      void card.offsetWidth;
    }
    active = slot;
    expandedCards.set(battle, closeActive);
    setOpen(slot, true);
  }

  function createSlot(row) {
    const node = document.createElement('div');
    node.className = `${prefix}-tab`;
    node.dataset.rosterIndex = String(row.index);
    node.dataset.cardId = String(row.cardId);
    node.dataset.side = side;
    place(node, 0, 0, cardWidth, fieldHeight);
    const track = document.createElement('div');
    place(track, 0, 0, cardWidth, fieldHeight);
    track.style.transitionProperty = 'transform';
    track.style.transitionTimingFunction = quadOut;
    node.append(track);
    const tab = document.createElement('div');
    const [x, y] = tabOffset;
    const { width, height } = artwork.base;
    place(tab, x, inspectTop + y, width, height);
    track.append(tab);
    const image = new Image();
    image.alt = '';
    image.style.pointerEvents = 'none';
    tab.append(image);
    const labels = Object.entries(artwork.labels).map(([field, bounds]) => [field, reserveLabel(tab, field, bounds)]);
    const definition = definitions.get(row.cardId);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    if (foe) {
      trigger.id = `${prefix}-trigger`;
      trigger.dataset.opponentTrigger = '';
    } else {
      trigger.id = `${prefix}-trigger-${row.index}`;
      trigger.dataset.reserveTrigger = '';
    }
    trigger.style.pointerEvents = 'auto';
    trigger.setAttribute('aria-label', definition?.name ? `檢視${definition.name}的角色卡` : '檢視候補角色');
    place(trigger, 0, 0, width, height);
    tab.append(trigger);
    const hitArea = document.createElement('div');
    hitArea.setAttribute('aria-hidden', 'true');
    // Keep the original card hit area while its visible face rotates away.
    place(hitArea, 0, inspectTop, cardWidth, cardHeight);
    track.append(hitArea);
    const life = new AbortController();
    const slot = { node, track, hitArea, image, labels, trigger, definition, row, life, signal: AbortSignal.any([signal, life.signal]) };
    setOpen(slot, false, true);
    root.append(node);

    node.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch' || !enabled) return;
      slot.hovered = true;
      open(slot);
    }, { signal: slot.signal });
    node.addEventListener('pointerleave', () => {
      slot.hovered = false;
      const focus = document.activeElement;
      if (!(node.contains(focus) && focus.matches(':focus-visible'))) close(slot);
    }, { signal: slot.signal });
    node.addEventListener('focusout', event => {
      if (!slot.hovered && !node.contains(event.relatedTarget)) close(slot, { returnFocus: false });
    }, { signal: slot.signal });
    trigger.addEventListener('click', event => {
      if (!enabled) return;
      if (active !== slot) open(slot);
      else if (event.detail === 0 || !slot.hovered) close(slot);
    }, { signal: slot.signal });
    node.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || active !== slot) return;
      event.preventDefault();
      event.stopPropagation();
      close(slot);
    }, { signal: slot.signal });
    return slot;
  }

  function updateSlot(slot, row, order) {
    slot.row = row;
    const { node, definition, trigger, image, labels } = slot;
    node.style.left = `${foe ? 0 : (order + 1) * cardWidth}px`;
    trigger.disabled = !enabled || !definition;
    if (root.children[order] !== node) root.insertBefore(node, root.children[order] ?? null);
    const hp = Number.isInteger(row.hp) ? row.hp : null;
    const dead = row.alive === false || (hp !== null && hp <= 0);
    if (slot.dead !== dead) {
      slot.dead = dead;
      const plate = dead && artwork.dead ? artwork.dead : artwork.base;
      image.src = new URL(plate.file, art);
      place(image, plate.x, plate.y, plate.width, plate.height);
    }
    const values = { name: definition?.name ?? '', hp: dead ? '' : hp ?? '?', level: definition?.level ?? '?',
      attack: definition?.ap ?? '?', defense: definition?.dp ?? '?', maxHp: definition?.hp ?? '?' };
    for (const [field, label] of labels) {
      const text = String(values[field]);
      if (label.textContent !== text) label.textContent = text;
      if (field === 'hp') label.style.color = hp === null || hp >= definition?.hp ? '#fff'
        : hp >= definition?.hp / 2 ? '#ffff30' : '#ff7070';
    }
    paintInspector(slot);
  }

  function clearFocus() {
    if (root.contains(document.activeElement)) restoreFocus?.();
  }

  signal.addEventListener('abort', () => {
    if (active) close(active, { immediate: true, returnFocus: false });
    root.remove();
  }, { once: true });
  return {
    root,
    update(party, hidden, { enabled: canInspect = true } = {}) {
      if (signal.aborted) return;
      enabled = canInspect && !hidden && Boolean(party);
      if (!enabled) {
        clearFocus();
        if (active) close(active, { immediate: true, returnFocus: false });
        for (const slot of slots.values()) slot.hovered = false;
      }
      root.hidden = hidden || (foe && !party);
      root.inert = !enabled;
      if (hidden || !party) return;
      const rows = foe
        ? party.cards.filter(({ index, cardId }) => party.cards.length === 1 && index === party.activeIndex
          && Number.isSafeInteger(cardId) && cardId > 0 && definitions.has(cardId))
        : party.cards.filter(({ index }) => index !== party.activeIndex);
      const identities = new Map(rows.map(({ index, cardId }) => [index, cardId]));
      for (const [index, slot] of slots) {
        if (identities.get(index) === slot.row.cardId) continue;
        if (slot.node.contains(document.activeElement)) clearFocus();
        close(slot, { immediate: true, returnFocus: false });
        slot.life.abort();
        slot.node.remove();
        slots.delete(index);
      }
      rows.forEach((row, order) => {
        const slot = slots.get(row.index) ?? createSlot(row);
        slots.set(row.index, slot);
        updateSlot(slot, row, order);
      });
    },
  };
}
