// TitleView.as schedules the fades on the application stage. The nested Ageha
// clip also uses the loaded stage's 24 FPS, rather than its standalone 12 FPS.
const SPEED = 1.7;
const STAGE_FPS = 24;
const LOGO_DURATION = 3500 / SPEED;
const GLOW_DELAY = 800 / SPEED;
const GLOW_DURATION = 2000 / SPEED;
const FIRST_MOTION_TICK = Math.floor(LOGO_DURATION * STAGE_FPS / 1000) + 1;
const MAX_PENDING_TICKS = 10 * STAGE_FPS;

export function createTitleMotion(frameCount) {
  let x = 513;
  let y = -200;
  let lastTick = FIRST_MOTION_TICK - 1;

  return function sample(elapsedMs, pointer, reducedMotion) {
    const tick = Math.floor(elapsedMs * STAGE_FPS / 1000);
    if (reducedMotion) {
      lastTick = Math.max(lastTick, tick);
      return { logoOpacity: 0.9, glowOpacity: 0.7, butterfly: null };
    }

    // RequestAnimationFrame pauses in hidden tabs. Bound the pointer updates
    // after a long suspension because the intervening pointer positions are unavailable.
    const pending = Math.min(tick - lastTick, MAX_PENDING_TICKS);
    const pointerX = pointer?.x ?? 0;
    const pointerY = pointer?.y ?? 0;
    for (let step = 0; step < pending; step += 1) {
      x = followPointer(x, pointerX);
      y = followPointer(y, pointerY);
    }
    lastTick = Math.max(lastTick, tick);

    return {
      logoOpacity: 0.9 * easeOutSine(elapsedMs / LOGO_DURATION),
      glowOpacity: 0.7 * easeOutSine((elapsedMs - GLOW_DELAY) / GLOW_DURATION),
      butterfly: frameCount > 0 ? { x, y, frame: tick % frameCount } : null,
    };
  };
}

function easeOutSine(progress) {
  return Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI / 2);
}

function followPointer(position, target) {
  const threshold = target - 24 + Math.round(48 * Math.random());
  return position > threshold ? position - 5 : position + 3;
}
