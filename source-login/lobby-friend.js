import { renderLobbyAvatar } from './lobby-avatar.js';
import { playBackClick } from './bgm.js';

const art = new URL('./lobby-friend-art/', import.meta.url);
const tabs = [
  { id: 'friend', label: '好友', type: 1, count: 'friendCount', statuses: [2, 6] },
  { id: 'waiting', label: '等待認證', type: 0, count: 'requestCount', statuses: [0, 1] },
  { id: 'block', label: '封鎖', type: 2, count: 'blockCount', statuses: [3] },
  { id: 'search', label: '搜索', type: null, statuses: [7] },
];
const actionLabels = { 1: 'approve', 2: 'mail', 6: 'mail', 7: 'request' };
const viewsBySession = new WeakMap();

function add(parent, tag, id, className) {
  const node = parent.ownerDocument.createElement(tag);
  if (id) node.id = `lobby-friend${id === true ? '' : `-${id}`}`;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function place(node, x, y, width, height) {
  Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
}

function sprite(parent, layer, { skin, dx = 0, dy = 0 } = {}) {
  if (!layer) return;
  const image = add(parent, 'img', null, 'lobby-friend-art');
  image.alt = '';
  image.src = layer.url ?? new URL(layer.file, art).href;
  if (skin) image.dataset.skin = skin;
  place(image, dx + layer.x, dy + layer.y, layer.width, layer.height);
}

function artButton(parent, id, label, source) {
  const [x, y, width, height] = source.hit;
  const button = add(parent, 'button', id, 'lobby-friend-button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  place(button, x, y, width, height);
  for (const skin of ['up', 'over', 'down']) sprite(button, source[skin], { skin, dx: -x, dy: -y });
  return button;
}

// FriendListView animates y -120 → 150 with Quad.easeOut, and reverses with Sine.easeOut.
function slide(panel, from, to, duration, easing, signal) {
  return new Promise(resolve => {
    let frame;
    const start = performance.now();
    const move = value => { panel.style.transform = `translateY(${value}px)`; };
    function finish(completed) {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', cancel);
      resolve(completed);
    }
    function cancel() { finish(false); }
    function step(now) {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      move(from + (to - from) * easing(progress));
      if (progress === 1) finish(true);
      else frame = requestAnimationFrame(step);
    }
    if (signal.aborted) return resolve(false);
    if (panel.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      move(to);
      return resolve(true);
    }
    move(from);
    signal.addEventListener('abort', cancel, { once: true });
    frame = requestAnimationFrame(step);
  });
}

function wait(duration, signal) {
  return new Promise(resolve => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => finish(true), duration);
    function finish(completed) {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(completed);
    }
    function cancel() { finish(false); }
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function buttonText(button, text, [x, y, width, height], [hitX, hitY]) {
  const label = add(button, 'span');
  label.textContent = text;
  place(label, x - hitX, y - hitY, width, height);
}

function addCard(parent, row, index, grid, source, wording) {
  const card = add(parent, 'div', null, 'lobby-friend-card');
  card.setAttribute('role', 'listitem');
  Object.assign(card.dataset, {
    playerId: String(row.playerId), avatarId: String(row.avatarId), status: String(row.status), slot: String(index),
  });
  place(card, grid.x + index % grid.columns * grid.stepX, grid.y + Math.floor(index / grid.columns) * grid.stepY,
    grid.stepX, grid.stepY);
  const portrait = add(card, 'div', null, 'lobby-friend-avatar-clip');
  const canvas = add(portrait, 'canvas', null, 'lobby-friend-avatar');
  canvas.width = 290;
  canvas.height = 450;
  canvas.dataset.avatarState = 'loading';
  canvas.setAttribute('aria-hidden', 'true');
  const plate = add(card, 'div', null, 'lobby-friend-name-plate');
  place(plate, ...source.namePlate);
  const name = add(card, 'span', null, 'lobby-friend-name');
  place(name, ...source.labels.name);
  const level = add(card, 'span', null, 'lobby-friend-level');
  place(level, ...source.labels.level);
  const actions = [];
  if (row.status === 0) {
    const waiting = add(card, 'span', null, 'lobby-friend-waiting');
    place(waiting, ...source.labels.waiting);
    waiting.textContent = wording.waiting;
  }
  if (row.status === 6) sprite(card, source.online);
  const label = wording[actionLabels[row.status]];
  if (label && source.action) {
    const action = artButton(card, null, label, source.action);
    action.classList.add('lobby-friend-card-action');
    action.disabled = true;
    buttonText(action, label, source.actionText, source.action.hit);
    if (row.status === 1 || row.status === 7) {
      action.dataset.friendAction = row.status === 1 ? 'accept' : 'apply';
      actions.push(action);
    }
  }
  if (source.remove) {
    const label = row.status === 7 ? wording.block ?? '封鎖' : row.status === 3 ? wording.unblock : wording.delete;
    const remove = artButton(card, null, label, source.remove);
    remove.classList.add('lobby-friend-card-remove');
    remove.dataset.friendAction = row.status === 7 ? 'block' : 'remove';
    remove.disabled = true;
    actions.push(remove);
  }
  return { card, canvas, level, name, actions };
}

export function mountLobbyFriend(view, { session, trigger, signal, canOpen, onOpen, onClosing, onClose,
  onSearchInvalid, onConfirm, onError } = {}) {
  const lifetime = new AbortController();
  const saved = viewsBySession.get(session) ?? {
    pages: [0, 0, 0, 0], retainedHover: new Set(), totals: null, uncertainSearch: false,
    write: null, uncertainWrite: false, updateWriteControls: null,
  };
  const { pages, retainedHover } = saved;
  if (session) viewsBySession.set(session, saved);
  let current = null;
  let manifest;
  let loading = false;
  const isOpen = () => loading || current !== null;

  function dispose() {
    lifetime.abort();
    current?.controller.abort();
    current?.shell.remove();
    current = null;
    loading = false;
    trigger?.setAttribute('aria-expanded', 'false');
    signal?.removeEventListener('abort', dispose);
  }

  async function close() {
    const instance = current;
    if (!instance || instance.panel.dataset.state === 'closing') return false;
    const { shell, panel, controller, opening, stopRequests, writeScope, y, start } = instance;
    const yOffset = panel.getBoundingClientRect().top - shell.getBoundingClientRect().top - y;
    panel.dataset.state = 'closing';
    panel.inert = true;
    opening.abort();
    stopRequests();
    writeScope.abort();
    onClosing?.();
    if (!await slide(panel, yOffset, start, manifest.motion.closeMs, time => Math.sin(time * Math.PI / 2), controller.signal)) return false;
    controller.abort();
    shell.remove();
    current = null;
    trigger?.setAttribute('aria-expanded', 'false');
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    onClose?.();
    return true;
  }

  async function open() {
    if (isOpen() || lifetime.signal.aborted || !view.isConnected || canOpen?.() === false) return false;
    if (!manifest) {
      loading = true;
      try {
        const response = await fetch(new URL('index.json', art), { signal: lifetime.signal });
        if (!response.ok) return false;
        manifest = await response.json();
      } catch {
        return false;
      } finally {
        loading = false;
      }
    }
    if (lifetime.signal.aborted || !view.isConnected || canOpen?.() === false) return false;

    const [x, y] = manifest.origin;
    const start = manifest.motion.initialY - y;
    const pageSize = manifest.grid.columns * manifest.grid.rows;
    const controller = new AbortController();
    const opening = new AbortController();
    const scope = controller.signal;
    const writeScope = new AbortController();
    const writeSignal = writeScope.signal;
    const shell = add(view, 'dialog', 'shell');
    shell.setAttribute('aria-label', '好友名單');
    const panel = add(shell, 'section', true);
    place(panel, x, y, manifest.panel.width, manifest.panel.height);
    panel.dataset.state = 'opening';
    panel.style.transform = `translateY(${start}px)`;
    const stage = view.closest('#stage') ?? view;
    const window = view.ownerDocument.defaultView;
    function position() {
      const box = stage.getBoundingClientRect();
      place(shell, box.left, box.top, 780, 680);
    }
    window.addEventListener('resize', position, { signal: scope });
    window.addEventListener('scroll', position, { capture: true, signal: scope });
    position();

    sprite(panel, manifest.panel);
    const tabButtons = tabs.map((tab, i) => artButton(panel, `tab-${tab.id}`, tab.label, manifest.tabs[i]));
    const closeButton = artButton(panel, 'close', '關閉好友名單', manifest.buttons.close);
    const previous = artButton(panel, 'prev', '上一頁', manifest.buttons.previous);
    const next = artButton(panel, 'next', '下一頁', manifest.buttons.next);
    const invites = [];
    for (const [id, invite] of [['invite', manifest.invites?.sns], ['invite-code', manifest.invites?.code]]) {
      if (!invite) continue;
      const button = artButton(panel, id, invite.label, invite.button);
      button.classList.add('lobby-friend-invite');
      button.disabled = true;
      buttonText(button, invite.label, invite.buttonText, invite.button.hit);
      invites.push(button);
    }
    const rows = add(panel, 'div', 'rows');
    rows.setAttribute('role', 'list');
    rows.setAttribute('aria-label', '好友名單');
    const page = add(panel, 'span', 'page', 'lobby-friend-label');
    place(page, ...manifest.page);
    const count = add(panel, 'span', 'count', 'lobby-friend-label');
    place(count, ...manifest.count);
    const search = add(panel, 'form', 'search-form');
    const input = add(search, 'input', 'search-input');
    input.type = 'text';
    input.maxLength = manifest.search.maxLength;
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.setAttribute('aria-label', '虛擬人物名稱');
    place(input, ...manifest.search.input);
    const submit = artButton(search, 'search-submit', manifest.search.label, manifest.search.button);
    submit.type = 'submit';
    buttonText(submit, manifest.search.label, manifest.search.buttonText, manifest.search.button.hit);

    const profiles = new Map();
    const handledChanges = new WeakSet();
    let selectedTab = 0;
    let request;
    let searchData;
    let lastQuery = '';
    current = { shell, panel, controller, opening, stopRequests, writeScope, y, start };
    saved.updateWriteControls = updateWriteControls;
    scope.addEventListener('abort', () => {
      opening.abort();
      stopRequests();
      writeScope.abort();
      if (saved.updateWriteControls === updateWriteControls) saved.updateWriteControls = null;
    }, { once: true });

    function stopRequests() { request?.abort(); }
    function newRequest() {
      stopRequests();
      request = new AbortController();
      return request.signal;
    }
    function status(nextStatus) {
      panel.dataset.status = nextStatus;
      rows.setAttribute('aria-busy', String(nextStatus === 'loading'));
      updateWriteControls();
    }

    function updateWriteControls() {
      const state = saved.write?.phase ?? session?.getLobbyFriendWriteState?.() ?? (saved.uncertainWrite ? 'uncertain' : 'idle');
      panel.dataset.writeState = state;
      const available = panel.dataset.state === 'open' && panel.dataset.status === 'ready' && onConfirm && session?.changeLobbyFriend;
      for (const button of rows.querySelectorAll('button')) {
        if (!button.dataset.friendAction) continue;
        const confirmingButton = state === 'confirming' && saved.write?.focus === button;
        button.disabled = !available || button.dataset.friendReady !== 'true' || (state !== 'idle' && !confirmingButton);
      }
    }

    function applyChange(result) {
      if (!result || writeSignal.aborted || handledChanges.has(result)) return;
      handledChanges.add(result);
      saved.uncertainWrite = false;
      const matches = row => row.playerId === result.playerId && row.avatarId === result.avatarId;
      const focus = saved.write?.focus;
      if (focus && rows.contains(focus)) tabButtons[selectedTab].focus({ preventScroll: true });
      if (selectedTab === 3) {
        if (searchData?.rows.some(matches)) {
          searchData.rows = searchData.rows.filter(row => !matches(row));
          if (panel.dataset.searchState !== 'searching') paintSearch();
        }
      } else {
        if (!tabs[selectedTab].statuses.includes(result.status)) {
          for (const card of Array.from(rows.children)) {
            if (matches({ playerId: Number(card.dataset.playerId), avatarId: Number(card.dataset.avatarId) })) card.remove();
          }
        }
        void loadPage({ preserve: true });
      }
      updateWriteControls();
    }

    async function writeFriend(action, row, name, focus) {
      if (writeSignal.aborted || focus.disabled || !rows.contains(focus) || saved.write) return;
      const write = { phase: 'confirming', focus };
      saved.write = write;
      updateWriteControls();
      if (action === 'remove' || action === 'block') playBackClick();
      let confirmed = false;
      try {
        confirmed = await onConfirm(action, { name, status: row.status, focus, signal: writeSignal });
        if (confirmed !== true || writeSignal.aborted || !rows.contains(focus)) return;
        write.phase = 'pending';
        updateWriteControls();
        applyChange(await session.changeLobbyFriend(action, row, { signal: writeSignal }));
      } catch (error) {
        if (error?.kind === 'friend-write-uncertain') saved.uncertainWrite = true;
        if (!writeSignal.aborted && error?.kind === 'friend-write-rejected') {
          onError?.(error.friendCode, { focus, signal: writeSignal });
        }
      } finally {
        if (saved.write === write) saved.write = null;
        saved.updateWriteControls?.();
        if (!confirmed && !writeSignal.aborted && rows.contains(focus)) focus.focus({ preventScroll: true });
      }
    }
    function pageCount() {
      const sourceCount = selectedTab === 3 ? searchData?.count : saved.totals?.[tabs[selectedTab].count];
      // The authored count includes a final empty page at exact multiples of ten.
      return 1 + Math.floor((sourceCount ?? 0) / pageSize);
    }
    function paintNavigation() {
      const { id } = tabs[selectedTab];
      const { totals } = saved;
      panel.dataset.tab = id;
      panel.dataset.offset = String(pages[selectedTab] * pageSize);
      if (totals) {
        for (const key of ['friendCount', 'blockCount', 'requestCount']) panel.dataset[key] = String(totals[key]);
      }
      for (const [index, button] of tabButtons.entries()) button.setAttribute('aria-pressed', String(index === selectedTab));
      const max = pageCount();
      page.textContent = `${pages[selectedTab] + 1}/${max}`;
      previous.hidden = next.hidden = max < 2;
      previous.disabled = next.disabled = panel.dataset.status === 'loading';
      search.hidden = selectedTab !== 3;
      for (const button of invites) button.hidden = !search.hidden;
      count.hidden = id !== 'friend' && id !== 'block';
      const limit = session?.initialData?.avatar?.friendMax;
      const { friendPrefix, blockedPrefix } = manifest.wording;
      count.textContent = id === 'block' && totals ? `${blockedPrefix}${totals.blockCount}/10` : id === 'friend' && totals ?
        `${friendPrefix}${totals.friendCount}${Number.isInteger(limit) && limit >= 0 ? `/${limit}` : ''}` : '';
    }

    async function paintProfile(row, elements, rowSignal) {
      const { card, canvas, level, name, actions } = elements;
      try {
        const profile = profiles.get(row.avatarId) ?? await session.readLobbyFriendAvatar(row.avatarId, { signal: rowSignal });
        if (rowSignal.aborted) return;
        if (profile?.avatarId !== row.avatarId) throw new Error('Friend avatar mismatch');
        profiles.set(row.avatarId, profile);
        try {
          await renderLobbyAvatar(canvas, profile.equippedPartIds, { signal: rowSignal, fadeOnly: true });
          const [arrival] = canvas.getAnimations?.() ?? [];
          if (arrival) await arrival.finished.catch(() => {});
        } catch {
          // Actual names and levels remain available when an original part cannot be drawn.
        }
        if (rowSignal.aborted) return;
        card.dataset.avatarState = 'ready';
        name.textContent = profile.name;
        level.textContent = `${manifest.wording.levelPrefix}${profile.level}`;
        if (profile.name) {
          for (const button of actions) {
            button.dataset.friendReady = 'true';
            button.addEventListener('click', () => {
              void writeFriend(button.dataset.friendAction, row, profile.name, button);
            });
          }
          updateWriteControls();
        }
      } catch {
        if (!rowSignal.aborted) {
          card.dataset.avatarState = 'unavailable';
          canvas.dataset.avatarState = 'unavailable';
        }
      }
    }

    function paintRows(records, rowSignal) {
      rows.replaceChildren();
      const { statuses } = tabs[selectedTab];
      records.slice(0, pageSize).forEach((row, index) => {
        if (!row || !statuses.includes(row.status) || !Number.isSafeInteger(row.avatarId) || row.avatarId < 1) return;
        const elements = addCard(rows, row, index, manifest.grid, manifest.card, manifest.wording);
        elements.card.dataset.avatarState = 'loading';
        void paintProfile(row, elements, rowSignal);
      });
    }

    async function loadPage({ preserve = false } = {}) {
      const readSignal = newRequest();
      const tab = tabs[selectedTab];
      const offset = pages[selectedTab] * pageSize;
      if (!preserve) rows.replaceChildren();
      status('loading');
      paintNavigation();
      try {
        const result = await session.readLobbyFriendPage(tab.type, offset, { signal: readSignal });
        if (readSignal.aborted) return;
        if (result?.type !== tab.type || result.offset !== offset) throw new Error('Friend page mismatch');
        saved.totals = result;
        if (pages[selectedTab] >= pageCount()) {
          pages[selectedTab] = pageCount() - 1;
          return loadPage();
        }
        status('ready');
        paintNavigation();
        paintRows(result.rows, readSignal);
      } catch {
        if (readSignal.aborted) return;
        status('unavailable');
        paintNavigation();
      }
    }

    function paintSearch() {
      const rowSignal = newRequest();
      const pageIndex = pages[selectedTab];
      status('ready');
      paintNavigation();
      paintRows(searchData?.rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize) ?? [], rowSignal);
    }

    function showTab(index) {
      if (index === selectedTab) return;
      selectedTab = index;
      input.value = '';
      lastQuery = '';
      searchData = undefined;
      input.disabled = submit.disabled = saved.uncertainSearch;
      panel.dataset.searchState = saved.uncertainSearch ? 'uncertain' : 'idle';
      if (index === 3) {
        pages[index] = 0;
        paintSearch();
      } else {
        void loadPage();
      }
    }

    function changePage(delta) {
      const max = pageCount();
      if (max < 2 || panel.dataset.status === 'loading') return;
      pages[selectedTab] = (pages[selectedTab] + delta + max) % max;
      if (selectedTab === 3) paintSearch();
      else void loadPage();
    }

    async function submitSearch() {
      const query = input.value;
      if (selectedTab !== 3 || !query || query === lastQuery || input.disabled) return;
      if (query.length < 3) return onSearchInvalid?.(input);
      if (query.length > manifest.search.maxLength) return;
      const readSignal = newRequest();
      lastQuery = query;
      input.value = manifest.search.pending;
      input.disabled = submit.disabled = true;
      panel.dataset.searchState = 'searching';
      status('loading');
      paintNavigation();
      try {
        const result = await session.searchLobbyFriends(query, { signal: readSignal });
        if (!await wait(1000, readSignal)) return;
        // FriendListContainer enumerates FriendLink's numeric avatar-ID keys.
        searchData = { rows: [...result.rows].sort((a, b) => a.avatarId - b.avatarId), count: result.count ?? result.rows.length };
        pages[selectedTab] = 0;
        input.disabled = submit.disabled = false;
        input.value = query;
        panel.dataset.searchState = 'idle';
        paintSearch();
      } catch (error) {
        if (readSignal.aborted) return;
        input.value = query;
        saved.uncertainSearch = error?.kind === 'friend-search-uncertain';
        input.disabled = submit.disabled = saved.uncertainSearch;
        panel.dataset.searchState = saved.uncertainSearch ? 'uncertain' : 'unavailable';
        status('unavailable');
        paintNavigation();
        if (!saved.uncertainSearch) lastQuery = '';
      }
    }

    const listen = (node, event, handler) => node.addEventListener(event, handler, { signal: scope });
    for (const [index, button] of tabButtons.entries()) {
      if (retainedHover.has(index)) button.dataset.retainedHover = 'true';
      listen(button, 'click', event => {
        // Flash hides the pressed SimpleButton without resetting its pointer frame.
        if (index !== selectedTab && event.detail > 0) {
          retainedHover.add(index);
          button.dataset.retainedHover = 'true';
        }
        showTab(index);
      });
      listen(button, 'pointerleave', () => {
        if (index !== selectedTab) {
          retainedHover.delete(index);
          delete button.dataset.retainedHover;
        }
      });
    }
    listen(closeButton, 'click', () => { void close(); });
    listen(previous, 'click', () => changePage(-1));
    listen(next, 'click', () => changePage(1));
    listen(search, 'submit', event => {
      event.preventDefault();
      void submitSearch();
    });
    listen(shell, 'cancel', event => {
      event.preventDefault();
      void close();
    });
    panel.dataset.searchState = saved.uncertainSearch ? 'uncertain' : 'idle';
    shell.showModal();
    trigger?.setAttribute('aria-expanded', 'true');
    onOpen?.();
    void loadPage();
    session?.subscribeAvatar?.(paintNavigation, { signal: scope });
    session?.subscribeLobbyFriendChanges?.(applyChange, { signal: scope });
    if (!await slide(panel, start, 0, manifest.motion.openMs, time => 1 - (1 - time) ** 2, opening.signal)) return false;
    panel.dataset.state = 'open';
    updateWriteControls();
    closeButton.focus({ preventScroll: true });
    return true;
  }

  trigger?.setAttribute('aria-haspopup', 'dialog');
  trigger?.setAttribute('aria-expanded', 'false');
  trigger?.addEventListener('click', () => { void open(); }, { signal: lifetime.signal });
  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort', dispose, { once: true });
  return { open, close, isOpen, dispose };
}
