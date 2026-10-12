// Điểm vào side panel: nạp cấu hình, chia tab, nối background, trạng thái tab Studio, hộp xác nhận.
import { $, $$, confirmDialog } from './ui.js';
import { getState, setState, subscribe } from './state.js';
import * as bg from './bg.js';
import * as store from './store.js';
import { initLog, appendLog, mergeLogs } from './log.js';
import { initControl } from './control.js';
import { initTables } from './tables.js';
import { initSelectorTab } from './selector-tab.js';

const STUDIO_MATCH = 'https://studio.youtube.com/*';
const FLOW_LABELS = {
  listBroadcasts: 'Đang đọc danh sách luồng…',
  createBroadcast: 'Đang tạo luồng mới…',
  endBroadcast: 'Đang kết thúc luồng…',
  editInfo: 'Đang cập nhật tiêu đề…',
  switchMatch: 'Đang chuyển trận…',
};

function initTabs() {
  const tabs = $$('[role="tab"]');
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

function renderRunBar(s) {
  const bar = $('#runBar');
  bar.hidden = !s.running;
  if (s.running) $('#runLabel').textContent = `${s.running.dryRun ? '[Chạy thử] ' : ''}${FLOW_LABELS[s.running.flow] || 'Đang chạy…'}`;
}

function onBgMessage(msg) {
  switch (msg.type) {
    case 'hello':
      mergeLogs(msg.logs);
      setState({ running: msg.running });
      break;
    case 'log':
      appendLog(msg.entry);
      break;
    case 'runState':
      setState({ running: msg.running });
      break;
    case 'confirm':
      confirmDialog({
        kicker: msg.dryRun ? 'Chạy thử — không bấm thật' : '',
        title: msg.title,
        message: msg.message,
        okText: msg.okText,
        danger: msg.danger,
      }).then((ok) => bg.send({ type: 'confirmReply', id: msg.id, ok }));
      break;
    case 'disconnected':
      setState({ running: null });
      break;
    default:
      break;
  }
}

// ── Trạng thái tab Studio (dùng chrome.tabs trực tiếp, không cần hỏi background) ──

async function refreshStudioPill() {
  const pill = $('#studioPill');
  const tabs = await chrome.tabs.query({ url: STUDIO_MATCH });
  const inWindow = tabs.filter((t) => t.windowId === getState().windowId);
  const tab = inWindow.find((t) => t.active) || inWindow[0] || tabs[0];
  if (!tab) {
    pill.dataset.state = 'off';
    $('#studioPillText').textContent = 'Chưa mở Studio';
    pill.title = 'Bấm để mở YouTube Studio';
    return;
  }
  pill.dataset.state = tab.active ? 'on' : 'idle';
  $('#studioPillText').textContent = tab.active ? 'Studio đang mở' : 'Studio ở tab khác';
  pill.title = tab.url;
}

function initStudioPill() {
  $('#studioPill').addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ url: STUDIO_MATCH });
    const inWindow = tabs.find((t) => t.windowId === getState().windowId) || tabs[0];
    if (inWindow) await chrome.tabs.update(inWindow.id, { active: true });
    else await chrome.tabs.create({ url: 'https://studio.youtube.com/', windowId: getState().windowId });
  });
  const refresh = () => refreshStudioPill().catch(() => {});
  chrome.tabs.onUpdated.addListener(refresh);
  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onRemoved.addListener(refresh);
  refresh();
}

async function main() {
  const [loaded, win] = await Promise.all([store.loadAll(), chrome.windows.getCurrent()]);
  const tableId = loaded.config.tables.some((t) => t.id === loaded.ui.tableId)
    ? loaded.ui.tableId
    : (loaded.config.tables[0] || {}).id || null;
  setState({ ...loaded, ui: { ...loaded.ui, tableId }, windowId: win.id });

  initTabs();
  initLog();
  initControl();
  initTables();
  initSelectorTab();
  initStudioPill();
  subscribe(renderRunBar);
  $('#btnStop').addEventListener('click', () => bg.send({ type: 'cancel' }));
  store.onDetectedChannel((id) => setState({ detectedChannelId: id }));

  bg.on(onBgMessage);
  bg.init();
}

main().catch((e) => {
  document.body.prepend(Object.assign(document.createElement('p'), { className: 'fatal', textContent: `Lỗi khởi động panel: ${e.message}` }));
});
