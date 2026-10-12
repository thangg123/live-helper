// Tab "Điều khiển": chọn bàn, form trận, xem trước, danh sách luồng, các nút thao tác.
import { $, h, debounce, toast, confirmDialog, renderErrors } from './ui.js';
import { getState, setState, subscribe, currentTable, selectedStream } from './state.js';
import * as bg from './bg.js';
import * as store from './store.js';
import { localLog } from './log.js';

const TPL = globalThis.ALH.template;
const MATCH_FIELDS = ['giai', 'vong', 'a', 'b', 'ghichu'];
const PREVIEW_REFRESH_MS = 30000; // để {gio} không bị cũ khi panel mở lâu
export const STATUS_LABEL = {
  live: 'Đang live',
  scheduled: 'Đã lên lịch',
  waiting: 'Đang chờ',
  ready: 'Sẵn sàng',
  ended: 'Đã kết thúc',
  unknown: 'Không rõ',
};
const ORDER_HINT = {
  createFirst: 'tạo luồng mới → kết thúc luồng cũ',
  endFirst: 'kết thúc luồng cũ → tạo luồng mới',
};

const saveMatchLater = debounce((m) => store.saveMatch(m), 400);

// ── Xem trước ─────────────────────────────────────────────────────────────────

function computePreview(s) {
  const table = currentTable(s);
  if (!table) return { title: '', description: '' };
  const vars = TPL.buildVars(table.name, s.match);
  return {
    title: TPL.renderTitle(table.titleTemplate, vars),
    description: TPL.renderDescription(table.descriptionTemplate, vars),
  };
}

function setValue(sel, value) {
  const el = $(sel);
  if (el.value !== value) el.value = value;
}

function refreshPreview(s = getState()) {
  if (!s.preview.manual) {
    const pv = computePreview(s);
    setValue('#pv-title', pv.title);
    setValue('#pv-desc', pv.description);
  }
  const title = $('#pv-title').value;
  const count = $('#titleCount');
  count.textContent = `${title.trim().length}/${TPL.TITLE_MAX}`;
  count.dataset.over = String(title.trim().length > TPL.TITLE_MAX);
  $('#btnRegen').hidden = !s.preview.manual;
}

/** Lấy tiêu đề / mô tả để chạy; trả null nếu không hợp lệ (lỗi hiện dưới ô xem trước). */
function collectContent() {
  refreshPreview();
  const title = $('#pv-title').value.replace(/\s*\n\s*/g, ' ').trim();
  const description = $('#pv-desc').value;
  const errors = [...TPL.validateTitle(title), ...TPL.validateDescription(description)];
  renderErrors($('#pvErrors'), errors);
  if (errors.length) {
    toast(errors[0], 'error');
    return null;
  }
  return { title, description };
}

// ── Hiển thị ──────────────────────────────────────────────────────────────────

let renderedTables = null;
let renderedStreams = undefined;
let renderedSelected = undefined;

function renderTableSelect(s) {
  const select = $('#tableSelect');
  const table = currentTable(s);
  if (renderedTables !== s.config.tables) {
    renderedTables = s.config.tables;
    select.replaceChildren(...s.config.tables.map((t) => h('option', { value: t.id, text: t.name || '(chưa đặt tên)' })));
    select.disabled = !s.config.tables.length;
  }
  if (table && select.value !== table.id) select.value = table.id;
  $('#keyHint').textContent = table
    ? `Stream key: ${table.streamKeyName || '—'}`
    : 'Chưa có bàn nào — thêm ở tab “Cấu hình bàn”.';
}

function streamRow(r, selectedId) {
  const id = `stream-${r.videoId}`;
  return h(
    'label',
    { class: 'stream-row', for: id, dataset: { status: r.status } },
    h('input', { type: 'radio', name: 'stream', id, value: r.videoId, checked: r.videoId === selectedId }),
    h('span', { class: `badge badge-${r.status}`, text: STATUS_LABEL[r.status] || r.status }),
    h('span', { class: 'stream-title', text: r.title || '(không đọc được tiêu đề)', title: r.statusText || '' }),
    h('code', { class: 'stream-id', text: r.videoId })
  );
}

function renderStreams(s) {
  if (renderedStreams === s.streams && renderedSelected === s.selectedVideoId) return;
  renderedStreams = s.streams;
  renderedSelected = s.selectedVideoId;
  const box = $('#streamList');
  if (s.streams === null) return;
  if (!s.streams.length) {
    box.replaceChildren(h('p', { class: 'empty', text: 'Không có luồng nào đang live hoặc đã lên lịch.' }));
    return;
  }
  box.replaceChildren(...s.streams.map((r) => streamRow(r, s.selectedVideoId)));
}

function linkButton(label, url) {
  return h('button', { type: 'button', class: 'btn-ghost', onclick: () => chrome.tabs.create({ url }) }, label);
}

function copyButton(text) {
  return h('button', {
    type: 'button',
    class: 'btn-ghost',
    onclick: () => navigator.clipboard.writeText(text).then(() => toast('Đã copy link', 'ok'), () => toast('Không copy được', 'error')),
  }, 'Copy link');
}

function renderResult(s) {
  const box = $('#resultBox');
  const r = s.lastResult;
  if (!r) {
    box.hidden = true;
    return;
  }
  const created = r.created;
  const lines = [];
  if (r.kind === 'switch') {
    lines.push(h('strong', { text: '✓ Đã chuyển trận' }));
    if (r.old) lines.push(h('span', { text: `Luồng cũ đã kết thúc: “${r.old.title}”` }));
    lines.push(h('span', { text: `Luồng mới đang live: “${created.title}”` }));
  } else if (r.kind === 'create') {
    lines.push(h('strong', { text: '✓ Đã tạo luồng mới' }));
    lines.push(h('span', { text: `“${created.title}” (${created.videoId})` }));
  }
  box.replaceChildren(
    h('div', { class: 'result-text' }, ...lines),
    h('div', { class: 'btn-row' }, linkButton('Mở trên YouTube', created.watchUrl), copyButton(created.watchUrl), linkButton('Phòng điều khiển', created.studioUrl))
  );
  box.hidden = false;
}

function renderButtons(s) {
  const busy = !!s.running;
  const table = currentTable(s);
  const stream = selectedStream(s);
  $('#btnSwitch').disabled = busy || !table;
  $('#btnCreate').disabled = busy || !table;
  $('#btnEnd').disabled = busy || !stream;
  $('#btnEdit').disabled = busy || !stream;
  $('#btnRefresh').disabled = busy;
  $('#btnStopInline').disabled = !busy;
  $('#switchSub').textContent = ORDER_HINT[s.config.settings.switchOrder] || ORDER_HINT.createFirst;
  $('#dryRun').checked = !!s.ui.dryRun;
  document.body.dataset.dry = String(!!s.ui.dryRun);
}

function render(s) {
  renderTableSelect(s);
  refreshPreview(s);
  renderStreams(s);
  renderButtons(s);
  renderResult(s);
}

// ── Chạy luồng ────────────────────────────────────────────────────────────────

async function runFlow(flow, args, label, { allowDry = true } = {}) {
  const s = getState();
  const settings = s.config.settings;
  try {
    const result = await bg.request('run', {
      flow,
      args: { ...args, channelId: settings.channelId || undefined },
      dryRun: allowDry && !!s.ui.dryRun,
      windowId: s.windowId,
    });
    if (result && result.dryRunStopped) {
      toast('Chạy thử xong — xem nhật ký', 'info', 4500);
      return { ok: false, dry: true };
    }
    return { ok: true, result };
  } catch (e) {
    if (e.kind === 'cancelled') toast(e.message, 'warn');
    else toast(`${label}: ${e.message}`, 'error', 7000);
    return { ok: false };
  }
}

const withoutStream = (streams, videoId) => (streams || []).filter((r) => r.videoId !== videoId);
const withStream = (streams, row) => [row, ...withoutStream(streams, row.videoId)];

async function onRefresh() {
  const r = await runFlow('listBroadcasts', {}, 'Làm mới', { allowDry: false });
  if (!r.ok || !Array.isArray(r.result)) return;
  const streams = r.result;
  setState((s) => ({
    streams,
    selectedVideoId: streams.some((x) => x.videoId === s.selectedVideoId) ? s.selectedVideoId : null,
  }));
}

async function onSwitch() {
  const s = getState();
  const table = currentTable(s);
  const content = table && collectContent();
  if (!content) return;
  const { switchOrder, liveTimeoutSec } = s.config.settings;
  const r = await runFlow('switchMatch', { table, ...content, order: switchOrder, liveTimeoutSec }, 'Chuyển trận');
  if (!r.ok) return;
  const { old, created } = r.result;
  setState((st) => ({
    streams: withStream(old ? withoutStream(st.streams, old.videoId) : st.streams, {
      videoId: created.videoId,
      title: created.title,
      status: 'live',
    }),
    selectedVideoId: created.videoId,
    lastResult: { kind: 'switch', ...r.result },
  }));
}

async function onCreate() {
  const table = currentTable();
  const content = table && collectContent();
  if (!content) return;
  const r = await runFlow('createBroadcast', { table, ...content }, 'Tạo luồng mới');
  if (!r.ok) return;
  const created = r.result;
  setState((st) => ({
    streams: withStream(st.streams, { videoId: created.videoId, title: created.title, status: 'scheduled' }),
    selectedVideoId: created.videoId,
    lastResult: { kind: 'create', created },
  }));
}

async function onEnd() {
  const s = getState();
  const st = selectedStream(s);
  if (!st) return toast('Chọn một luồng trong danh sách trước', 'warn');
  const ok = await confirmDialog({
    kicker: s.ui.dryRun ? 'Chạy thử — không bấm thật' : STATUS_LABEL[st.status] || '',
    title: 'Kết thúc luồng này?',
    message: `“${st.title || '(không đọc được tiêu đề)'}”\nVideo ID: ${st.videoId}\n\nLuồng sẽ kết thúc ngay và không mở lại được.`,
    okText: 'Kết thúc luồng',
    danger: true,
  });
  if (!ok) return localLog('info', 'Đã huỷ kết thúc luồng');
  const r = await runFlow('endBroadcast', { videoId: st.videoId, expectedTitle: st.title || undefined }, 'Kết thúc luồng');
  if (!r.ok) return;
  toast('Đã kết thúc luồng', 'ok');
  setState((x) => ({ streams: withoutStream(x.streams, st.videoId), selectedVideoId: null }));
}

async function onEdit() {
  const st = selectedStream();
  if (!st) return toast('Chọn một luồng trong danh sách trước', 'warn');
  const content = collectContent();
  if (!content) return;
  const r = await runFlow('editInfo', { videoId: st.videoId, ...content, expectedTitle: st.title || undefined }, 'Cập nhật tiêu đề');
  if (!r.ok) return;
  toast('Đã cập nhật tiêu đề / mô tả', 'ok');
  setState((x) => ({ streams: (x.streams || []).map((row) => (row.videoId === st.videoId ? { ...row, title: content.title } : row)) }));
}

// ── Gắn sự kiện ───────────────────────────────────────────────────────────────

function bindMatchForm() {
  const s = getState();
  MATCH_FIELDS.forEach((k) => {
    const input = $(`#m-${k}`);
    input.value = s.match[k] || '';
    input.addEventListener('input', () => {
      const match = { ...getState().match, [k]: input.value };
      setState({ match });
      saveMatchLater(match);
    });
  });
}

export function initControl() {
  bindMatchForm();
  $('#tableSelect').addEventListener('change', (e) => {
    const ui = { ...getState().ui, tableId: e.target.value };
    setState({ ui, preview: { manual: false } });
    store.saveUi(ui);
  });
  const markManual = () => {
    if (!getState().preview.manual) setState({ preview: { manual: true } });
    else refreshPreview();
  };
  $('#pv-title').addEventListener('input', markManual);
  $('#pv-title').addEventListener('keydown', (e) => e.key === 'Enter' && e.preventDefault()); // tiêu đề chỉ một dòng
  $('#pv-desc').addEventListener('input', markManual);
  $('#btnRegen').addEventListener('click', () => {
    renderErrors($('#pvErrors'), []);
    setState({ preview: { manual: false } });
  });
  $('#streamList').addEventListener('change', (e) => {
    if (e.target.name === 'stream') setState({ selectedVideoId: e.target.value });
  });
  $('#dryRun').addEventListener('change', (e) => {
    const ui = { ...getState().ui, dryRun: e.target.checked };
    setState({ ui });
    store.saveUi(ui);
  });
  $('#btnRefresh').addEventListener('click', onRefresh);
  $('#btnSwitch').addEventListener('click', onSwitch);
  $('#btnCreate').addEventListener('click', onCreate);
  $('#btnEnd').addEventListener('click', onEnd);
  $('#btnEdit').addEventListener('click', onEdit);
  $('#btnStopInline').addEventListener('click', () => bg.send({ type: 'cancel' }));

  subscribe(render);
  render(getState());
  setInterval(() => refreshPreview(), PREVIEW_REFRESH_MS);
}
