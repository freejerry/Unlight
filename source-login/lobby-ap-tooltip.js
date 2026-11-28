const second = 1000;

function formatRemaining(seconds) {
  if (!seconds) return ['full', '現在的AP是最大值。'];
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  const hourLabel = seconds >= 3600 ? `${hours}小時` : '';
  const minuteLabel = seconds >= 60 ? `${minutes}分鐘` : '';
  return [hourLabel ? 'hours' : minuteLabel ? 'minutes' : 'seconds',
    `到下一次回復還剩${hourLabel}${minuteLabel}${seconds % 60}秒。`];
}

export function mountLobbyApTooltip(view, { session, signal }) {
  const gauge = view.querySelector('#lobby-ap-gauge');
  const tooltip = view.querySelector('#lobby-ap-tooltip');
  let snapshot = session.initialData.avatar;
  let hovering = false;
  let timer;
  let refreshedAt;

  function updateVisibility() {
    tooltip.dataset.visible = String(!!tooltip.textContent && (hovering || gauge.matches(':focus-visible')));
  }

  function tick() {
    clearTimeout(timer);
    if (signal.aborted) return;
    const { energy, energyMax, energyReceivedAt, energyRemainingSeconds, energyRecoveryInterval } = snapshot;
    const validEnergy = Number.isSafeInteger(energy) && energy >= 0 && Number.isSafeInteger(energyMax) && energyMax > 0;
    const full = validEnergy && energy >= energyMax;
    const clock = validEnergy && !full && Number.isFinite(energyReceivedAt) &&
      Number.isSafeInteger(energyRemainingSeconds) && energyRemainingSeconds >= 0;
    const elapsed = clock ? Math.max(0, performance.now() - energyReceivedAt) : 0;
    const remaining = clock ? Math.max(0, energyRemainingSeconds - Math.floor(elapsed / second)) : 0;
    const interval = Number.isSafeInteger(energyRecoveryInterval) && energyRecoveryInterval > 0 ? energyRecoveryInterval : 0;
    const shown = full ? 0 : remaining || interval;
    const [kind, caption] = full || (clock && shown > 0) ? formatRemaining(shown) : ['', ''];
    if (tooltip.textContent !== caption) {
      tooltip.textContent = caption;
      tooltip.dataset.kind = kind;
    }
    gauge.setAttribute('aria-label', validEnergy ? `AP ${energy}/${energyMax}` : 'AP');
    updateVisibility();

    if (!clock || refreshedAt === energyReceivedAt) return;
    // SC17 truncates the server's fractional seconds. Wait through that last second before checking.
    const due = elapsed >= (energyRemainingSeconds + 1) * second;
    if (due && session.refreshLobbyAvatar?.()) refreshedAt = energyReceivedAt;
    else timer = setTimeout(tick, second - elapsed % second);
  }

  gauge.addEventListener('pointerenter', () => { hovering = true; updateVisibility(); }, { signal });
  gauge.addEventListener('pointerleave', () => { hovering = false; updateVisibility(); }, { signal });
  gauge.addEventListener('focus', updateVisibility, { signal });
  gauge.addEventListener('blur', updateVisibility, { signal });
  view.ownerDocument.addEventListener('visibilitychange', tick, { signal });
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  session.subscribeAvatar?.(avatar => {
    snapshot = avatar;
    tick();
  }, { signal });
  tick();
}
