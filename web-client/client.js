import { ProbeError, probeKeepAlive, toHex } from './transport.js';
import { drawPanel } from './panel.js';
import { createWebGLPanelRenderer } from './panel-webgl.js';

const services = [
  { port: 12001, label: '認證' },
  { port: 12002, label: '大廳' },
  { port: 12003, label: '資料' },
  { port: 12004, label: '戰鬥' },
  { port: 12005, label: '任務' },
  { port: 12020, label: '全域聊天' },
];

const stateLabels = {
  idle: '待檢查',
  running: '檢查中',
  retrying: '重試中',
  success: '通過',
  failed: '失敗',
};

const ui = {
  main: document.querySelector('#diagnostics'),
  run: document.querySelector('#run-checks'),
  retry: document.querySelector('#retry-failed'),
  status: document.querySelector('#overall-status'),
  detail: document.querySelector('#overall-detail'),
  progress: document.querySelector('#progress'),
  progressLabel: document.querySelector('#progress-label'),
  services: document.querySelector('#service-list'),
  template: document.querySelector('#service-template'),
  assets: document.querySelector('#asset-checks'),
  imagePreview: document.querySelector('#image-preview'),
  image: document.querySelector('#asset-image'),
  audio: document.querySelector('#asset-audio'),
  playAudio: document.querySelector('#play-audio'),
  imageStatus: document.querySelector('#image-status'),
  audioStatus: document.querySelector('#audio-status'),
  panelStatus: document.querySelector('#panel-status'),
  panelPreviews: document.querySelector('#panel-previews'),
};

const rows = new Map();
const panelImage = new Image();
const panelGuides = { left: 42, top: 60, right: 78, bottom: 64 };
const panelCanvases = ui.panelPreviews.querySelectorAll('canvas');
const renderedPanels = new WeakMap();
let webglPanelRenderer;
let running = false;

for (const service of services) {
  const row = ui.template.content.firstElementChild.cloneNode(true);
  row.dataset.port = String(service.port);
  const title = row.querySelector('.service-name');
  title.id = `service-${service.port}`;
  title.textContent = service.label;
  row.setAttribute('aria-labelledby', title.id);
  row.querySelector('.service-port').textContent = `通訊埠 ${service.port}`;
  ui.services.append(row);
  rows.set(service.port, {
    row,
    status: row.querySelector('.service-status'),
    detail: row.querySelector('.service-detail'),
    response: row.querySelector('.response-hex'),
  });
}

async function requestJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function readServiceList() {
  const config = await requestJson('/api/services');
  if (!Array.isArray(config?.services) || config.services.length !== rows.size) {
    throw new Error('服務清單必須包含六個連線項目。');
  }

  const entries = new Map();
  const isCommand = (value) => Number.isInteger(value) && value >= 0 && value <= 65535;
  for (const service of config.services) {
    if (!rows.has(service?.port) || entries.has(service.port) || !isCommand(service.ping) || !isCommand(service.pong)) {
      throw new Error('服務清單含有重複或格式錯誤的項目。');
    }
    entries.set(service.port, service);
  }
  return entries;
}

function updateRow(port, state, detail, bytes, errorKind) {
  const entry = rows.get(port);
  entry.row.dataset.state = state;
  entry.status.textContent = stateLabels[state];
  entry.detail.textContent = detail;
  entry.response.textContent = bytes?.length ? toHex(bytes) : '—';
  if (errorKind) entry.row.dataset.errorKind = errorKind;
  else delete entry.row.dataset.errorKind;
}

function updateProgress() {
  let passes = 0;
  let failures = 0;
  for (const { row } of rows.values()) {
    if (row.dataset.state === 'success') passes += 1;
    if (row.dataset.state === 'failed') failures += 1;
  }

  ui.progress.value = passes + failures;
  ui.progressLabel.textContent = `完成 ${passes + failures} / ${rows.size}`;
  return { passes, failures };
}

async function checkService(service) {
  try {
    const response = await probeKeepAlive(service, (attempt) => {
      const state = attempt === 1 ? 'running' : 'retrying';
      const message = attempt === 1 ? '正在等待 KeepAlive 回覆。' : '第一次連線未完成，正在重試。';
      updateRow(service.port, state, message);
    });
    updateRow(service.port, 'success', '7 bytes 與原版格式一致。', response);
  } catch (error) {
    if (error instanceof ProbeError) {
      updateRow(service.port, 'failed', error.message, error.response, error.kind);
    } else {
      updateRow(service.port, 'failed', '驗證過程中斷。', null, 'unknown');
    }
  }
  updateProgress();
}

async function runChecks(ports) {
  if (running || !ports.length) return;
  running = true;
  ui.main.dataset.state = 'running';
  ui.run.disabled = true;
  ui.retry.hidden = true;
  ui.status.textContent = '正在檢查';
  ui.detail.textContent = '正在讀取服務清單。';
  for (const port of ports) updateRow(port, 'running', '等待連線設定。');
  updateProgress();

  try {
    const config = await readServiceList();
    ui.detail.textContent = '送出原版 KeepAlive 並核對回覆。';
    await Promise.all(ports.map((port) => checkService(config.get(port))));
    const { passes, failures } = updateProgress();
    ui.main.dataset.state = failures === 0 ? 'success' : 'failed';
    ui.status.textContent = failures === 0 ? '全部服務通過' : `${failures} 個服務檢查失敗`;
    ui.detail.textContent = failures === 0
      ? '每個服務的二進位回覆都與原版 KeepAlive 一致。'
      : `${passes} 個服務已通過。各服務卡片列出失敗原因。`;
    ui.retry.hidden = failures === 0;
  } catch {
    for (const port of ports) updateRow(port, 'failed', '無法取得有效的服務清單。', null, 'configuration');
    updateProgress();
    ui.main.dataset.state = 'failed';
    ui.status.textContent = '無法讀取服務清單';
    ui.detail.textContent = '確認診斷伺服器已啟動後再重試。';
    ui.retry.hidden = false;
  } finally {
    ui.run.textContent = '重新檢查全部';
    ui.run.disabled = false;
    running = false;
  }
}

function updateAsset(status, state, message) {
  status.dataset.state = state;
  status.textContent = message;

  const states = [ui.imageStatus, ui.audioStatus, ui.panelStatus].map(asset => asset.dataset.state);
  if (states.includes('loading')) ui.assets.dataset.state = 'loading';
  else if (states.includes('failed')) ui.assets.dataset.state = 'failed';
  else if (states.every((value) => value === 'unconfigured')) ui.assets.dataset.state = 'unconfigured';
  else ui.assets.dataset.state = 'success';
}

function assetAddress(path) {
  if (typeof path !== 'string' || !path.startsWith('/public/')) throw new Error('Invalid asset path');
  const resolved = new URL(path, location.origin);
  if (resolved.origin !== location.origin || !resolved.pathname.startsWith('/public/')) throw new Error('Invalid asset path');
  return resolved.href;
}

function startAsset(media, path, status, readyEvent, onSuccess) {
  if (path === null) {
    updateAsset(status, 'unconfigured', '未設定原始素材路徑。');
    return;
  }

  let address;
  try {
    address = assetAddress(path);
  } catch {
    updateAsset(status, 'failed', '素材位置格式錯誤。');
    return;
  }

  function settle(state, message) {
    clearTimeout(timer);
    media.removeEventListener(readyEvent, ready);
    media.removeEventListener('error', failed);
    updateAsset(status, state, message);
    if (state === 'success') onSuccess();
  }
  function ready() {
    settle('success', '已載入。');
  }
  function failed() {
    settle('failed', '原始素材無法載入。');
  }

  const timer = setTimeout(() => settle('failed', '載入原始素材逾時。'), 8000);
  media.addEventListener(readyEvent, ready);
  media.addEventListener('error', failed);
  media.src = address;
}

function drawPanelSamples(ratio, renderer) {
  const panels = [];
  for (const canvas of panelCanvases) {
    const { width, height } = canvas.getBoundingClientRect();
    const previous = renderedPanels.get(canvas);
    if (previous?.width === width && previous.height === height && previous.ratio === ratio
        && previous.renderer === renderer) continue;
    panels.push({ canvas, width, height });
  }

  if (panels.length === 0) return;
  if (renderer) renderer.drawPanels(panels, panelImage, panelGuides, ratio);
  for (const { canvas, width, height } of panels) {
    if (!renderer) drawPanel(canvas, panelImage, width, height, panelGuides, ratio);
    renderedPanels.set(canvas, { width, height, ratio, renderer });
    canvas.dataset.rendered = 'true';
  }
}

function releaseWebGLPanelRenderer() {
  const renderer = webglPanelRenderer;
  webglPanelRenderer = null;
  renderer?.dispose();
}

function handlePanelContextLoss() {
  if (!webglPanelRenderer) return;
  releaseWebGLPanelRenderer();
  redrawLoadedPanels();
}

function renderPanelPreviews() {
  const ratio = window.devicePixelRatio || 1;
  try {
    if (panelImage.naturalWidth !== 120 || panelImage.naturalHeight !== 96) {
      throw new Error('Unexpected original panel dimensions');
    }
    ui.panelPreviews.hidden = false;
    if (webglPanelRenderer === undefined) {
      try {
        webglPanelRenderer = createWebGLPanelRenderer(handlePanelContextLoss);
      } catch {
        webglPanelRenderer = null;
      }
    }

    const renderer = webglPanelRenderer;
    try {
      drawPanelSamples(ratio, renderer);
    } catch (error) {
      if (!renderer) throw error;
      releaseWebGLPanelRenderer();
      drawPanelSamples(ratio, null);
    }

    const activeRenderer = webglPanelRenderer ? 'webgl2' : 'canvas2d';
    if (ui.panelPreviews.dataset.renderer !== activeRenderer) {
      ui.panelPreviews.dataset.renderer = activeRenderer;
      const label = activeRenderer === 'webgl2' ? 'WebGL 2' : 'Canvas 2D';
      updateAsset(ui.panelStatus, 'success', `已載入原版 120 × 96 px 面板皮膚，使用 ${label} 繪製。`);
    }
  } catch {
    ui.panelPreviews.hidden = true;
    delete ui.panelPreviews.dataset.renderer;
    for (const canvas of panelCanvases) {
      renderedPanels.delete(canvas);
      delete canvas.dataset.rendered;
    }
    updateAsset(ui.panelStatus, 'failed', '無法繪製面板。');
  }
}

function redrawLoadedPanels() {
  if (ui.panelStatus.dataset.state === 'success') renderPanelPreviews();
}

function watchPanelDensity() {
  const resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  resolution.addEventListener('change', () => {
    watchPanelDensity();
    redrawLoadedPanels();
  }, { once: true });
}

async function loadAssets() {
  try {
    const config = await requestJson('/api/assets');
    startAsset(ui.image, config.image, ui.imageStatus, 'load', () => {
      ui.imagePreview.hidden = false;
    });
    startAsset(ui.audio, config.audio, ui.audioStatus, 'loadedmetadata', () => {
      ui.playAudio.hidden = false;
      ui.playAudio.disabled = false;
    });
    startAsset(panelImage, config.panel ?? null, ui.panelStatus, 'load', () => {
      renderPanelPreviews();
      const observer = new ResizeObserver(redrawLoadedPanels);
      for (const canvas of panelCanvases) observer.observe(canvas);
      watchPanelDensity();
    });
  } catch {
    updateAsset(ui.imageStatus, 'failed', '無法讀取原始素材設定。');
    updateAsset(ui.audioStatus, 'failed', '無法讀取原始素材設定。');
    updateAsset(ui.panelStatus, 'failed', '無法讀取原始素材設定。');
  }
}

ui.run.addEventListener('click', () => void runChecks(services.map(({ port }) => port)));
ui.retry.addEventListener('click', () => {
  const failedPorts = services.filter(({ port }) => rows.get(port).row.dataset.state === 'failed').map(({ port }) => port);
  void runChecks(failedPorts);
});

ui.playAudio.addEventListener('click', async () => {
  if (!ui.audio.paused) {
    ui.audio.pause();
    return;
  }

  try {
    await ui.audio.play();
    updateAsset(ui.audioStatus, 'success', '正在播放。');
  } catch {
    updateAsset(ui.audioStatus, 'failed', '無法播放音樂。');
  }
});
ui.audio.addEventListener('play', () => { ui.playAudio.textContent = '暫停'; });
ui.audio.addEventListener('pause', () => {
  ui.playAudio.textContent = '播放';
  if (ui.audioStatus.dataset.state === 'success') updateAsset(ui.audioStatus, 'success', '已暫停。');
});
ui.audio.addEventListener('ended', () => {
  ui.playAudio.textContent = '播放';
  updateAsset(ui.audioStatus, 'success', '已播放完畢。');
});

window.addEventListener('resize', redrawLoadedPanels);

void loadAssets();
