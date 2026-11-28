const art = new URL('./lobby-record-art/', import.meta.url);
const categories = [
  ['all', 'ALL', null], ['avatar', 'Avatar', 0], ['duel', 'Duel', 1],
  ['quest', 'Quest', 2], ['event', 'Event', 4], ['friend', 'Friend', 3],
];
const tabs = ['active', 'finished'];
const pageSize = 16;
const viewStates = new WeakMap();

function add(parent, tag, id, className) {
  const node = parent.ownerDocument.createElement(tag);
  if (id) node.id = `lobby-record${id === true ? '' : `-${id}`}`;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function place(node, x, y, width, height) {
  Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
}

function sprite(parent, layer, className, dx = 0, dy = 0) {
  if (!layer) return;
  const image = add(parent, 'img', null, className ?? 'lobby-record-art');
  image.alt = '';
  image.src = new URL(layer.file, art).href;
  place(image, layer.x + dx, layer.y + dy, layer.width, layer.height);
  return image;
}

function artButton(parent, id, label, model, dx = 0, dy = 0) {
  const [x, y, width, height] = model.hit;
  const button = add(parent, 'button', id, 'lobby-record-button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  place(button, x + dx, y + dy, width, height);
  for (const state of ['up', 'over', 'down']) {
    sprite(button, model[state], `lobby-record-art lobby-record-skin-${state}`, -x, -y);
  }
  return button;
}

function displayText(value) {
  return (value ?? '').replace(/<br\s*\/?\s*>|\\n/gi, '\n')
    .replace(/<\/?(?:font|b|i|u)(?:\s+[^>]*)?>/gi, '')
    .replace(/&(?:amp|lt|gt|quot|nbsp);/g, entity => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': '\u00a0',
    })[entity]);
}

function parseDate(value) {
  return value ? new Date(value) : null;
}

function deadlineText(value) {
  const date = parseDate(value);
  if (!date || !Number.isFinite(date.getTime())) return value || '---';
  const weekday = '日一二三四五六'[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${weekday}) ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function categoryChooser(panel, current, signal, onChange) {
  const frame = add(panel, 'div', null, 'lobby-record-category-frame');
  const trigger = add(frame, 'button', 'category');
  trigger.type = 'button';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-label', '紀錄類別');
  trigger.setAttribute('aria-controls', 'lobby-record-category-menu');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = add(frame, 'div', 'category-menu');
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', '紀錄類別');
  menu.hidden = true;
  let active = current;
  const listen = (node, event, handler) => node.addEventListener(event, handler, { signal });
  const options = categories.map(([category, label], index) => {
    const option = add(menu, 'button', `category-${category}`);
    option.type = 'button';
    option.tabIndex = -1;
    option.dataset.category = category;
    option.setAttribute('role', 'option');
    option.textContent = label;
    listen(option, 'pointermove', () => highlight(index));
    listen(option, 'pointerdown', event => event.preventDefault());
    listen(option, 'click', () => choose(index));
    return option;
  });

  function commitLabel() {
    trigger.dataset.category = categories[current][0];
    trigger.textContent = categories[current][1];
    for (const [index, option] of options.entries()) option.setAttribute('aria-selected', String(index === current));
  }

  function highlight(index) {
    active = Math.max(0, Math.min(options.length - 1, index));
    trigger.setAttribute('aria-activedescendant', options[active].id);
    for (const [i, option] of options.entries()) option.classList.toggle('lobby-record-category-active', i === active);
  }

  function toggle(expanded) {
    menu.hidden = !expanded;
    trigger.setAttribute('aria-expanded', String(expanded));
    if (expanded) highlight(current);
    else trigger.removeAttribute('aria-activedescendant');
  }

  function choose(index) {
    toggle(false);
    trigger.focus({ preventScroll: true });
    if (index === current) return;
    current = index;
    commitLabel();
    onChange(index);
  }

  listen(trigger, 'click', () => toggle(menu.hidden));
  listen(trigger, 'keydown', event => {
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        if (menu.hidden) toggle(true);
        else highlight(active + (event.key === 'ArrowDown' ? 1 : -1));
        break;
      case 'Home':
      case 'End':
        if (menu.hidden) return;
        highlight(event.key === 'Home' ? 0 : options.length - 1);
        break;
      case 'Enter':
      case ' ':
        if (menu.hidden) return;
        choose(active);
        break;
      case 'Escape':
        if (menu.hidden) return;
        toggle(false);
        event.stopPropagation();
        break;
      case 'Tab':
        toggle(false);
        return;
      default:
        return;
    }
    event.preventDefault();
  });
  listen(panel.parentElement, 'pointerdown', event => {
    if (!menu.hidden && !frame.contains(event.target)) toggle(false);
  });
  commitLabel();
  return trigger;
}

function recordConditions(row, entry, catalogue) {
  if (!(entry.successCondition > 0)) return [];
  const type = entry.conditionType;
  const multiple = [5, 6, 7, 16].includes(type);
  const criteria = multiple ? entry.condition.split('_').map(part => part.split(',')) :
    [[entry.condition.split(',')[0], entry.successCondition]];
  const progress = row.progress?.split(',');
  const visible = [];
  // AchievementInfoScene keeps three lines and skips already cleared early criteria.
  for (const [index, [id, target]] of criteria.entries()) {
    const goal = Number(target);
    if (!Number.isFinite(goal)) continue;
    const current = progress ? Number(progress[index] ?? 0) || 0 : null;
    const met = current !== null && current >= goal;
    if (met && criteria.length - 3 + visible.length > index) continue;
    const counted = goal < 99999;
    const name = catalogue.conditionNames?.[type]?.[id] ?? '';
    const title = counted ? (catalogue.conditionLabels?.[type] ?? '').replaceAll('__NAME__', name) : '';
    const count = current === null ? '' : counted ? `${met ? goal : current}/${goal}` : String(current);
    visible.push({ title, count, met: met && counted });
    if (visible.length === 3) break;
  }
  return visible;
}

async function loadRecordArt(signal) {
  async function read(file) {
    const response = await fetch(new URL(file, art), { signal });
    if (!response.ok) throw new Error(file);
    return response.json();
  }
  const manifest = await read('index.json');
  const catalogue = await read(manifest.catalogue);
  return { manifest, catalogue };
}

// AchievementListView shows with Quad.easeOut and hides with Sine.easeOut.
function animate(panel, from, to, duration, easing, signal) {
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
      const time = Math.min(1, Math.max(0, (now - start) / duration));
      move(from + (to - from) * easing(time));
      if (time === 1) finish(true);
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

export function mountLobbyRecord(view, { session, trigger, signal, canOpen, onOpen, onClose } = {}) {
  const lifetime = new AbortController();
  let current = null;
  let pending = false;
  const display = viewStates.get(session) ?? { tab: 0, category: 0, title: 0, pages: tabs.map(() => Array(categories.length).fill(0)) };
  if (session) viewStates.set(session, display);
  const isOpen = () => pending || current !== null;

  function dispose() {
    lifetime.abort();
    current?.controller.abort();
    current?.shell.remove();
    current = null;
    pending = false;
    trigger?.setAttribute('aria-expanded', 'false');
    signal?.removeEventListener('abort', dispose);
  }

  async function close() {
    const instance = current;
    if (!instance || instance.panel.dataset.state === 'closing') return false;
    const { panel, shell, controller, transition } = instance;
    const translate = panel.getBoundingClientRect().top - shell.getBoundingClientRect().top - instance.Y;
    panel.dataset.state = 'closing';
    panel.inert = true;
    transition.abort();
    if (!await animate(panel, translate, -220, 150, time => Math.sin(time * Math.PI / 2), controller.signal)) return false;
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
    pending = true;
    let assets;
    try {
      assets = await loadRecordArt(lifetime.signal);
    } catch {
      pending = false;
      return false;
    }
    pending = false;
    if (lifetime.signal.aborted || !view.isConnected || canOpen?.() === false) return false;

    const { manifest, catalogue } = assets;
    const controller = new AbortController();
    const transition = new AbortController();
    const modal = controller.signal;
    modal.addEventListener('abort', () => transition.abort(), { once: true });
    const shell = add(view, 'dialog', 'shell');
    shell.setAttribute('aria-label', 'Record');
    const panel = add(shell, 'section', true);
    panel.dataset.state = 'opening';
    panel.style.transform = 'translateY(-220px)';
    const [X, Y] = manifest.origin;
    place(panel, X, Y, manifest.panel.width, manifest.panel.height);
    current = { shell, panel, controller, transition, Y };
    const stage = view.closest('#stage') ?? view;
    function position() {
      const box = stage.getBoundingClientRect();
      place(shell, box.left, box.top, 780, 680);
    }
    const window = view.ownerDocument.defaultView;
    window.addEventListener('resize', position, { signal: modal });
    window.addEventListener('scroll', position, { capture: true, signal: modal });
    position();

    sprite(panel, manifest.panel);
    const heading = add(panel, 'div', 'heading');
    const tabButtons = tabs.map((name, index) => artButton(panel, `tab-${name}`, index ? '已完成' : '進行中', manifest.tabs[index]));
    const closeButton = artButton(panel, 'close', '關閉紀錄', manifest.buttons.close);
    const category = categoryChooser(panel, display.category, modal, index => {
      display.category = index;
      display.title = index;
      selected = null;
      render();
    });
    const list = add(panel, 'div', 'rows');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', '紀錄清單');
    const status = add(panel, 'div', 'status');
    status.setAttribute('role', 'status');
    const prev = artButton(panel, 'prev', '上一頁', manifest.buttons.previous);
    const next = artButton(panel, 'next', '下一頁', manifest.buttons.next);
    const page = add(panel, 'output', 'page');
    const details = add(panel, 'section', 'detail');
    const title = add(details, 'h2', 'detail-title');
    const explanation = add(details, 'p', 'detail-explanation');
    const conditions = add(details, 'div', 'detail-conditions');
    const deadline = add(details, 'div', 'detail-deadline');
    const deadlineLabel = add(deadline, 'span');
    const deadlineValue = add(deadline, 'span');
    const code = add(details, 'div', 'detail-code');
    let selected = null;
    let visibleRows = [];
    let snapshot = session?.readAchievementRecords?.() ?? { status: 'unknown', rows: [] };
    display.pages[display.tab][display.category] = 0;

    function showHeading() {
      heading.replaceChildren();
      sprite(heading, manifest.categoryTitles[display.title]);
    }

    function showDetails() {
      const data = visibleRows.find(({ row }) => row.achievementId === selected);
      details.hidden = !data;
      if (!data) {
        delete details.dataset.achievementId;
        title.textContent = '';
        explanation.textContent = '';
        conditions.replaceChildren();
        deadlineLabel.textContent = '';
        deadlineValue.textContent = '';
        code.textContent = '';
        return;
      }
      const { row, entry } = data;
      details.dataset.achievementId = String(selected);
      title.textContent = displayText(entry.caption);
      explanation.textContent = displayText(entry.explanation);
      deadlineLabel.textContent = '有效期限';
      deadlineValue.textContent = deadlineText(entry.deadline || row.endAt);
      deadlineValue.classList.toggle('lobby-record-red', row.state === 2);
      code.textContent = row.code ? `達成代碼:   ${row.code}` : '';
      conditions.replaceChildren();
      for (const { title, count, met } of recordConditions(row, entry, catalogue)) {
        const line = add(conditions, 'div');
        add(line, 'span').textContent = title;
        const value = add(line, 'span');
        value.textContent = count;
        value.classList.toggle('lobby-record-red', met);
      }
    }

    function selectRecord(row, entry) {
      selected = row.achievementId;
      for (const button of list.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.achievementId) === selected));
      }
      if (display.category === 0) {
        display.title = entry.kind;
        showHeading();
      }
      showDetails();
    }

    function paintRows(index) {
      const focusedId = view.ownerDocument.activeElement?.dataset.achievementId;
      list.replaceChildren();
      for (const [line, { row, entry }] of visibleRows.slice(index * pageSize, (index + 1) * pageSize).entries()) {
        const y = 63 + line * 16;
        const rowModel = manifest.rows.panel;
        const [hitX, hitY] = rowModel.hit;
        const button = artButton(list, null, displayText(entry.caption), rowModel, 16, y);
        button.classList.add('lobby-record-row');
        button.style.setProperty('--record-row-blend', rowModel.blendMode ?? 'normal');
        const id = String(row.achievementId);
        button.dataset.achievementId = id;
        button.dataset.state = String(row.state);
        if (row.progress !== null && row.progress !== undefined) button.dataset.progress = row.progress;
        button.setAttribute('aria-pressed', String(row.achievementId === selected));
        sprite(button, manifest.rows.selected, 'lobby-record-art lobby-record-selected', -hitX, -hitY);
        sprite(button, manifest.rows.icons[entry.kind], null, -hitX, -hitY);
        const name = add(button, 'span', null, 'lobby-record-row-name');
        place(name, 34 - hitX, -hitY, 355, 16);
        name.textContent = displayText(entry.caption);
        const end = add(button, 'span', null, 'lobby-record-row-deadline');
        place(end, 415 - hitX, -hitY, 176, 16);
        end.append('有效期限:');
        const endValue = add(end, 'span');
        const time = entry.deadline || row.endAt;
        endValue.textContent = deadlineText(time);
        endValue.classList.toggle('lobby-record-red', Boolean(time) && row.state === 2);
        button.addEventListener('click', () => selectRecord(row, entry));
        if (id === focusedId) button.focus({ preventScroll: true });
      }
    }

    function render() {
      panel.dataset.status = snapshot.status;
      panel.dataset.tab = tabs[display.tab];
      panel.dataset.category = categories[display.category][0];
      const [, , kind] = categories[display.category];
      const now = Date.now();
      visibleRows = [];
      for (const row of snapshot.rows) {
        const entry = catalogue.entries[row.achievementId];
        if (!entry || ![0, 1, 2, 3, 4].includes(entry.kind) || (kind !== null && entry.kind !== kind)) continue;
        if (display.tab === 0 ? row.state !== 0 : row.state !== 1 && row.state !== 2) continue;
        if (entry.deadline && !(parseDate(entry.deadline) > now)) continue;
        visibleRows.push({ row, entry });
      }
      visibleRows.sort((left, right) => left.entry.kind - right.entry.kind || left.row.achievementId - right.row.achievementId);
      status.hidden = snapshot.status === 'ready';
      status.textContent = snapshot.status === 'partial' ? '尚未收到完整紀錄。' : '尚未收到紀錄。';
      const pages = display.pages[display.tab];
      const max = Math.max(1, Math.ceil(visibleRows.length / pageSize));
      const index = pages[display.category] = Math.min(pages[display.category], max - 1);
      const focused = view.ownerDocument.activeElement;
      prev.hidden = index === 0;
      next.hidden = index >= max - 1;
      page.textContent = `${index + 1}/${max}`;
      for (const [i, button] of tabButtons.entries()) button.setAttribute('aria-pressed', String(display.tab === i));
      if (focused === prev && prev.hidden) (next.hidden ? category : next).focus({ preventScroll: true });
      if (focused === next && next.hidden) (prev.hidden ? category : prev).focus({ preventScroll: true });
      paintRows(index);
      showDetails();
      showHeading();
    }

    const listen = (node, event, handler) => node.addEventListener(event, handler, { signal: modal });
    function changePage(delta) {
      display.pages[display.tab][display.category] += delta;
      render();
    }
    listen(prev, 'click', () => { if (!prev.hidden) changePage(-1); });
    listen(next, 'click', () => { if (!next.hidden) changePage(1); });
    for (const [index, button] of tabButtons.entries()) listen(button, 'click', () => {
      if (display.tab === index) return;
      display.tab = index;
      selected = null;
      render();
    });
    listen(closeButton, 'click', () => { void close(); });
    listen(shell, 'cancel', event => {
      event.preventDefault();
      void close();
    });
    render();
    session?.subscribeAchievementRecords?.(nextSnapshot => {
      snapshot = nextSnapshot;
      render();
    }, { signal: modal });
    shell.showModal();
    trigger?.setAttribute('aria-expanded', 'true');
    onOpen?.();
    if (!await animate(panel, -220, 0, 300, time => 1 - (1 - time) ** 2, transition.signal)) return false;
    panel.dataset.state = 'open';
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
