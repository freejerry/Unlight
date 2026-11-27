import { renderLobbyAvatar } from './lobby-avatar.js';

const avatar = document.querySelector('#lobby-avatar');
const sample = new URL(document.URL).searchParams.get('avatar');
const loadout = sample === 'equipped' ? 'equipped' : 'starter';

void renderLobbyAvatar(avatar, loadout).then(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // AvatarClip enters from x + 200 over 2.1 / Unlight.SPEED seconds with a sine ease-in.
  const frames = Array.from({ length: 13 }, (_, step) => {
    const visible = 1 - Math.cos(step * Math.PI / 24);
    return { opacity: visible, transform: `translateX(${200 * (1 - visible)}px)` };
  });
  avatar.animate(frames, 2100 / 1.7);
}).catch(error => {
  console.error('無法載入虛擬人物素材。', error);
});
