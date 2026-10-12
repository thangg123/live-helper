// Service worker: nhận lệnh từ side panel, điều phối các chặng của luồng trên tab Studio
// (mở / chuyển trang, hỏi xác nhận, dừng), chuyển log về panel.
'use strict';
importScripts('shared/text.js');
const T = self.ALH.text;

const STUDIO_ORIGIN = 'https://studio.youtube.com';
const STUDIO_MATCH = `${STUDIO_ORIGIN}/*`;
const CONTENT_FILES = chrome.runtime.getManifest().content_scripts[0].js;
const MAX_STAGES = 400;
const NAV_TIMEOUT_MS = 30000;
const KEEPALIVE_MS = 20000;
const LOG_BUFFER_SIZE = 300;
const PING_TRIES = 10;
const PING_GAP_MS = 300;

const FLOW_LABELS = {
  listBroadcasts: 'Lấy danh sách luồng',
  createBroadcast: 'Tạo luồng mới',
  endBroadcast: 'Kết thúc luồng',
  editInfo: 'Cập nhật tiêu đề / mô tả',
  switchMatch: 'Chuyển trận',
};
const NEEDS_CHANNEL = new Set(['listBroadcasts', 'createBroadcast', 'switchMatch']);

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

let panelPort = null;
let currentRun = null;
const logBuffer = [];
const pendingConfirms = new Map();

// ── Kênh với side panel ───────────────────────────────────────────────────────

function emit(msg) {
  if (!panelPort) return;
  try {
    panelPort.postMessage(msg);
  } catch {
    panelPort = null;
  }
}

function pushLog(entry) {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.splice(0, logBuffer.length - LOG_BUFFER_SIZE);
  emit({ type: 'log', entry });
}

function log(level, msg, extra = {}) {
  pushLog({ t: Date.now(), level, msg, source: 'bg', ...extra });
}

function reply(reqId, ok, result = null, error = null) {
  emit({ type: 'reply', reqId, ok, result, error });
}

chrome.runtime.onConnect.addListener((port) => {
  const fromPanel = port.sender && port.sender.url && port.sender.url.startsWith(chrome.runtime.getURL('sidepanel/'));
  if (port.name !== 'panel' || !fromPanel) {
    port.disconnect();
    return;
  }
  panelPort = port;
  port.onMessage.addListener((msg) => handlePanelMessage(msg));
  port.onDisconnect.addListener(() => {
    if (panelPort === port) panelPort = null;
    settleConfirms(false);
  });
  port.postMessage({ type: 'hello', running: runInfo(), logs: logBuffer });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id || !msg || msg.type !== 'log' || !msg.entry) return;
  if (currentRun && msg.runId === currentRun.id) pushLog(msg.entry);
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  const id = info.url && T.extractChannelId(info.url);
  if (id) chrome.storage.local.set({ detectedChannelId: id });
});

function handlePanelMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'run':
      startRun(msg);
      break;
    case 'cancel':
      cancelRun();
      break;
    case 'confirmReply':
      settleConfirm(msg.id, !!msg.ok);
      break;
    case 'tool':
      runTool(msg);
      break;
    default:
      break;
  }
}

const runInfo = () => (currentRun ? { id: currentRun.id, flow: currentRun.flow, dryRun: currentRun.dryRun } : null);

// ── Kiểm tra tham số từ panel ─────────────────────────────────────────────────

const VIDEO_ID_RE = /^[\w-]{11}$/;

function validateArgs(flow, a) {
  const args = a || {};
  if (!(flow in FLOW_LABELS)) return 'Luồng không hợp lệ.';
  if (flow === 'createBroadcast' || flow === 'switchMatch') {
    if (!args.table || !args.table.streamKeyName) return 'Bàn chưa có tên stream key.';
    if (!args.title || !String(args.title).trim()) return 'Tiêu đề đang trống.';
  }
  if ((flow === 'endBroadcast' || flow === 'editInfo') && !VIDEO_ID_RE.test(args.videoId || '')) return 'Chưa chọn luồng hợp lệ.';
  if (flow === 'editInfo' && !String(args.title || '').trim()) return 'Tiêu đề đang trống.';
  return null;
}

// ── Chạy luồng ────────────────────────────────────────────────────────────────

class RunError extends Error {
  constructor(info) {
    super(info.message);
    Object.assign(this, info);
  }
}
const cancelledError = (message = 'Đã dừng') => new RunError({ kind: 'cancelled', message });

function checkCancelled(run) {
  if (run.cancelled) throw cancelledError();
}

async function startRun({ reqId, flow, args, dryRun, windowId }) {
  if (currentRun) return reply(reqId, false, null, { message: 'Đang chạy một thao tác khác. Bấm Dừng trước.' });
  const invalid = validateArgs(flow, args);
  if (invalid) return reply(reqId, false, null, { message: invalid });

  const run = { id: crypto.randomUUID(), flow, dryRun: !!dryRun, cancelled: false, tabId: null, windowId };
  currentRun = run;
  const keepalive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), KEEPALIVE_MS);
  emit({ type: 'runState', running: runInfo() });
  log('start', `Bắt đầu: ${FLOW_LABELS[flow]}${run.dryRun ? ' — CHẠY THỬ' : ''}`);
  try {
    const result = await runFlow(run, flow, args);
    log('done', `Xong: ${FLOW_LABELS[flow]}`);
    reply(reqId, true, result);
  } catch (e) {
    const error = { kind: e.kind || 'error', message: e.message || String(e), step: e.step || null, selector: e.selector || null, url: e.url || null };
    if (error.kind === 'dryRunStop') {
      log('dry', error.message);
      reply(reqId, true, { dryRunStopped: true, message: error.message });
    } else if (error.kind === 'cancelled') {
      log('warn', error.message);
      reply(reqId, false, null, error);
    } else {
      log('error', error.message, { step: error.step, selector: error.selector, url: error.url });
      reply(reqId, false, null, error);
    }
  } finally {
    clearInterval(keepalive);
    settleConfirms(false);
    currentRun = null;
    emit({ type: 'runState', running: null });
  }
}

/** Vòng điều phối: gửi từng chặng cho content script, làm theo chỉ thị trả về (goto / call / confirm / done). */
async function runFlow(run, flow, args) {
  const tab = await ensureStudioTab(run);
  run.tabId = tab.id;
  await chrome.tabs.update(tab.id, { active: true });
  const channelId = NEEDS_CHANNEL.has(flow) ? await resolveChannelId(run, tab, args.channelId) : args.channelId || '';
  const env = { channelId };

  let stack = [{ flow, stage: 'start', state: { args } }];
  let fresh = true;
  for (let i = 0; i < MAX_STAGES; i++) {
    checkCancelled(run);
    const frame = stack[stack.length - 1];
    const res = await sendStage(run, { flow: frame.flow, stage: frame.stage, state: frame.state, env, fresh });
    fresh = false;
    if (!res || !res.ok) throw new RunError((res && res.error) || { message: 'Tab Studio không trả lời.' });
    checkCancelled(run);

    const out = res.out || {};
    const state = out.state || frame.state;
    if (out.confirm) {
      const ok = await askConfirm(run, out.confirm);
      if (!ok) throw cancelledError(run.cancelled ? 'Đã dừng' : 'Đã huỷ — không xác nhận.');
      log('info', 'Đã xác nhận');
    }
    if (out.goto) await navigate(run, run.tabId, out.goto);

    if ('done' in out) {
      stack = stack.slice(0, -1);
      if (!stack.length) return out.done;
      const parent = stack[stack.length - 1];
      stack = [...stack.slice(0, -1), { ...parent, state: { ...parent.state, lastResult: out.done } }];
      continue;
    }
    if (!out.next) throw new RunError({ message: `Chặng ${frame.flow}.${frame.stage} không chỉ định bước tiếp theo.` });
    stack = [...stack.slice(0, -1), { ...frame, stage: out.next, state }];
    if (out.call) stack = [...stack, { flow: out.call.flow, stage: 'start', state: { args: out.call.args } }];
  }
  throw new RunError({ message: 'Luồng chạy quá nhiều bước — dừng để an toàn.' });
}

async function sendStage(run, payload) {
  const msg = { type: 'runStage', runId: run.id, dryRun: run.dryRun, ...payload };
  try {
    return await chrome.tabs.sendMessage(run.tabId, msg);
  } catch (e) {
    const text = String(e && e.message);
    if (/Receiving end does not exist|Could not establish connection/i.test(text)) {
      await ensureContent(run.tabId);
      return chrome.tabs.sendMessage(run.tabId, msg);
    }
    if (/message port closed|back\/forward cache/i.test(text)) {
      throw new RunError({ message: 'Trang Studio tải lại giữa chừng nên thao tác bị ngắt. Kiểm tra lại trạng thái trên Studio.' });
    }
    throw e;
  }
}

function cancelRun() {
  const run = currentRun;
  if (!run || run.cancelled) return;
  run.cancelled = true;
  log('warn', 'Đang dừng…');
  settleConfirms(false);
  if (run.tabId) chrome.tabs.sendMessage(run.tabId, { type: 'cancel', runId: run.id }).catch(() => {});
}

// ── Xác nhận trong side panel ─────────────────────────────────────────────────

function askConfirm(run, c) {
  if (!panelPort) return Promise.reject(new RunError({ message: 'Side panel đang đóng nên không hỏi xác nhận được.' }));
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingConfirms.set(id, resolve);
    emit({
      type: 'confirm',
      id,
      title: String(c.title || 'Xác nhận'),
      message: String(c.message || ''),
      okText: String(c.okText || 'Đồng ý'),
      danger: !!c.danger,
      dryRun: run.dryRun,
    });
    log('info', `Chờ xác nhận: ${c.title}`);
  });
}

function settleConfirm(id, ok) {
  const resolve = pendingConfirms.get(id);
  if (!resolve) return;
  pendingConfirms.delete(id);
  resolve(ok);
}

function settleConfirms(ok) {
  for (const id of [...pendingConfirms.keys()]) settleConfirm(id, ok);
}

// ── Tab Studio ────────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function findStudioTab(windowId) {
  const tabs = await chrome.tabs.query({ url: STUDIO_MATCH });
  if (!tabs.length) return null;
  const sameWindow = tabs.filter((t) => t.windowId === windowId);
  return sameWindow.find((t) => t.active) || sameWindow[0] || tabs.find((t) => t.active) || tabs[0];
}

async function ensureStudioTab(run) {
  const existing = await findStudioTab(run.windowId);
  if (existing) return existing;
  log('info', 'Chưa có tab YouTube Studio — đang mở…');
  const created = await chrome.tabs.create({ url: `${STUDIO_ORIGIN}/`, active: true, windowId: run.windowId });
  await waitTabComplete(run, created.id);
  return chrome.tabs.get(created.id);
}

function waitTabComplete(run, tabId, timeoutMs = NAV_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const onRemoved = (id) => {
      if (id === tabId) finish(new RunError({ message: 'Tab Studio đã bị đóng.' }));
    };
    const timer = setTimeout(() => finish(new RunError({ message: `Trang Studio tải quá ${timeoutMs / 1000} giây.` })), timeoutMs);
    const poll = setInterval(() => run.cancelled && finish(cancelledError()), 200);
    function finish(err) {
      clearTimeout(timer);
      clearInterval(poll);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (err) reject(err);
      else resolve();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

async function navigate(run, tabId, url) {
  checkCancelled(run);
  if (!String(url).startsWith(`${STUDIO_ORIGIN}/`)) throw new RunError({ message: `Từ chối mở URL ngoài Studio: ${url}` });
  const tab = await chrome.tabs.get(tabId);
  if (T.sameStudioPath(tab.url, url)) {
    await ensureContent(tabId);
    return;
  }
  log('nav', `Mở ${url.replace(STUDIO_ORIGIN, '')}`);
  const loaded = waitTabComplete(run, tabId);
  await chrome.tabs.update(tabId, { url });
  await loaded;
  await ensureContent(tabId);
}

async function ensureContent(tabId) {
  for (let i = 0; i < PING_TRIES; i++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
      if (r && r.ok) return r;
    } catch {
      // content script chưa sẵn sàng
    }
    await delay(PING_GAP_MS);
  }
  log('warn', 'Content script chưa chạy trong tab Studio — tiêm lại');
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  const r = await chrome.tabs.sendMessage(tabId, { type: 'ping' }).catch(() => null);
  if (!r || !r.ok) throw new RunError({ message: 'Không kết nối được với tab Studio. Tải lại tab Studio rồi thử lại.' });
  return r;
}

async function resolveChannelId(run, tab, override) {
  if (override) return override;
  const fromTab = T.extractChannelId(tab.url);
  if (fromTab) return fromTab;
  const { detectedChannelId } = await chrome.storage.local.get('detectedChannelId');
  if (detectedChannelId) return detectedChannelId;
  log('info', 'Đang lấy channel ID từ trang chủ Studio…');
  await navigate(run, tab.id, `${STUDIO_ORIGIN}/`);
  for (let i = 0; i < 30; i++) {
    const id = T.extractChannelId((await chrome.tabs.get(tab.id)).url);
    if (id) return id;
    await delay(500);
    checkCancelled(run);
  }
  throw new RunError({ message: 'Không lấy được channel ID. Điền channel ID ở tab Cấu hình bàn.' });
}

// ── Công cụ tab Selector ──────────────────────────────────────────────────────

async function runTool({ reqId, name, args, windowId }) {
  try {
    const tab = await findStudioTab(windowId);
    if (!tab) throw new Error('Chưa mở tab YouTube Studio.');
    await chrome.tabs.update(tab.id, { active: true });
    await ensureContent(tab.id);
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'tool', name, args: args || {} });
    if (!res || !res.ok) throw new Error((res && res.error && res.error.message) || 'Công cụ lỗi.');
    reply(reqId, true, res.result);
  } catch (e) {
    reply(reqId, false, null, { message: e.message || String(e) });
  }
}
