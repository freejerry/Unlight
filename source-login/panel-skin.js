import { drawPanel } from '/panel.js';

const guides = { left: 42, right: 78, top: 60, bottom: 64 };
const stage = document.getElementById('stage');
const panels = new Map();
const resized = new ResizeObserver(entries => {
  for (const { target } of entries) paint(target);
});
let pixelRatio;
let image;
let imageLoad;

function paint(panel) {
  const state = panels.get(panel);
  if (!state || !image) return;
  const { width, height } = panel.getBoundingClientRect();
  if (!width || !height) return;
  if (state.canvas && state.width === width && state.height === height && state.ratio === pixelRatio) return;

  const canvas = state.canvas ?? document.createElement('canvas');
  try {
    drawPanel(canvas, image, width, height, guides, pixelRatio);
  } catch {
    canvas.remove();
    state.canvas = null;
    return;
  }
  if (!state.canvas) {
    canvas.className = 'stage-panel-skin';
    canvas.setAttribute('aria-hidden', 'true');
    panel.prepend(canvas);
  }
  Object.assign(state, { canvas, width, height, ratio: pixelRatio });
}

async function loadSkin() {
  const source = new Image();
  source.src = '/source-login/assets/panel_gene.png';
  await source.decode();
  image = source;
  for (const panel of panels.keys()) paint(panel);
}

function syncPanels() {
  const current = new Set(Number.isInteger(pixelRatio) ? [] : stage.querySelectorAll('.stage-panel'));
  for (const [panel, { canvas }] of panels) {
    if (current.has(panel)) continue;
    resized.unobserve(panel);
    canvas?.remove();
    panels.delete(panel);
  }
  for (const panel of current) {
    if (!panels.has(panel)) {
      panels.set(panel, {});
      resized.observe(panel);
    }
    paint(panel);
  }
  // Leave the original CSS skin in place until decoding and painting succeed.
  if (current.size) imageLoad ??= loadSkin().catch(() => {});
}

function watchResolution() {
  pixelRatio = window.devicePixelRatio || 1;
  window.matchMedia(`(resolution: ${pixelRatio}dppx)`).addEventListener('change', watchResolution, { once: true });
  syncPanels();
}

// The authenticated view is mounted and removed as one direct child of this host.
const mounts = new MutationObserver(syncPanels);
mounts.observe(document.getElementById('post-login'), { childList: true });
watchResolution();
