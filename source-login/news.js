import { readNews } from '/news.js';

const panel = document.querySelector('#news');
const status = document.querySelector('#news-status');
const content = document.querySelector('#news-content');

function showStatus(state, message) {
  panel.dataset.state = state;
  status.textContent = message;
  status.classList.toggle('sr-only', state === 'ready');
}

async function loadNews() {
  try {
    const response = await fetch('/public/news.xml', {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) {
      showStatus('empty', '目前沒有最新消息。');
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const news = readNews(await response.text());
    if (!news.textContent.trim()) {
      showStatus('empty', '目前沒有最新消息。');
      return;
    }

    content.replaceChildren(news);
    content.hidden = false;
    showStatus('ready', '最新消息已載入。');
  } catch {
    showStatus('error', '暫時無法讀取最新消息。');
  }
}

void loadNews();
