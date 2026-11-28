import { encodeFriendInviteCode } from './friend-invite-code.js';
import { playBackClick } from './bgm.js';

const duration = 50;
// Original immediate ease-out curves sampled at eighths for browser interpolation.
const quadOut = 'linear(0, .234375, .4375, .609375, .75, .859375, .9375, .984375, 1)';
const sineOut = 'linear(0, .1951, .3827, .5556, .7071, .8315, .9239, .9808, 1)';

/** Mount the original same-session invitation code panel above the Friend drawer. */
export function mountLobbyFriendInvite(view, { session, trigger, signal, onOpen, onClose } = {}) {
  const lifetime = new AbortController();
  const doc = view.ownerDocument;
  const win = doc.defaultView;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const code = encodeFriendInviteCode(session?.playerId);
  let current;

  function fade(dialog, from, to, easing) {
    const effect = win.CSS.supports('animation-timing-function', easing) ? easing : 'ease-out';
    return dialog.animate([{ opacity: from }, { opacity: to }], {
      duration: reducedMotion.matches ? 0 : duration, easing: effect, fill: 'both',
    });
  }

  function remove(instance, restoreFocus) {
    current = undefined;
    instance.controller.abort();
    instance.animation?.cancel();
    if (instance.dialog.open) instance.dialog.close();
    instance.dialog.remove();
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !lifetime.signal.aborted) {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      onClose?.();
    }
  }

  async function close() {
    const instance = current;
    if (!instance || instance.dialog.dataset.state === 'closing') return false;
    const { dialog } = instance;
    const opacity = Number(win.getComputedStyle(dialog).opacity);
    dialog.dataset.state = 'closing';
    instance.animation?.cancel();
    instance.animation = fade(dialog, opacity, 0, sineOut);
    await instance.animation.finished.catch(() => {});
    if (current !== instance) return false;
    remove(instance, true);
    return true;
  }

  async function open() {
    if (!code || current || lifetime.signal.aborted || !view.isConnected) return false;
    const stage = view.closest('#stage');
    const template = doc.getElementById('lobby-friend-invite-template');
    if (!stage || !template) return false;

    const dialog = template.content.firstElementChild.cloneNode(true);
    const closeButton = dialog.querySelector('#lobby-friend-invite-close');
    const copyButton = dialog.querySelector('#lobby-friend-invite-copy');
    const controller = new AbortController();
    const scope = controller.signal;
    const instance = { dialog, controller, animation: null };
    current = instance;
    dialog.querySelector('#lobby-friend-invite-value').textContent = code;
    dialog.dataset.state = 'opening';

    function position() {
      const { left, top } = stage.getBoundingClientRect();
      dialog.style.left = `${left + 260}px`;
      dialog.style.top = `${top + 220}px`;
    }
    win.addEventListener('resize', position, { signal: scope });
    win.addEventListener('scroll', position, { capture: true, signal: scope });
    closeButton.addEventListener('click', () => { void close(); }, { signal: scope });
    copyButton.addEventListener('click', event => {
      if (!event.isTrusted || dialog.dataset.state === 'closing') return;
      playBackClick();
      // The pinned client's SET_URL_BASE has no invitation-code replacement token.
      void win.navigator.clipboard?.writeText('orig').catch(() => {});
    }, { signal: scope });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      void close();
    }, { signal: scope });
    dialog.addEventListener('close', () => {
      if (current === instance && !dialog.open) remove(instance, true);
    }, { signal: scope });

    stage.append(dialog);
    position();
    dialog.showModal();
    instance.animation = fade(dialog, 0, 1, quadOut);
    trigger?.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
    onOpen?.();
    try {
      await instance.animation.finished;
    } catch {
      return false;
    }
    if (current !== instance || dialog.dataset.state === 'closing') return false;
    dialog.dataset.state = 'open';
    return true;
  }

  function dispose() {
    lifetime.abort();
    if (current) remove(current, false);
    signal?.removeEventListener('abort', dispose);
  }

  trigger?.setAttribute('aria-haspopup', 'dialog');
  trigger?.setAttribute('aria-expanded', 'false');
  trigger?.addEventListener('click', () => { void open(); }, { signal: lifetime.signal });
  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort', dispose, { once: true });
  return { open, close, isOpen: () => current !== undefined, dispose };
}
