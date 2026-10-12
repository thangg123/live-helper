// Tab "Cấu hình bàn": thêm / sửa / xoá bàn, cài đặt chung, xuất / nhập JSON.
import { $, h, debounce, toast, confirmDialog, downloadText, renderErrors } from './ui.js';
import { getState, setState, subscribe } from './state.js';
import * as store from './store.js';

const C = globalThis.ALH.config;
const TPL = globalThis.ALH.template;
const TEXT_FIELDS = ['name', 'streamKeyName', 'titleTemplate', 'descriptionTemplate', 'visibility', 'category', 'playlist'];
const BOOL_FIELDS = ['autoStart', 'autoStop'];

let editingId = null; // id bàn đang sửa; bàn mới chưa lưu cũng có id riêng
let lastTemplateField = null;

async function commitConfig(config, message) {
  setState((s) => {
    const tableId = config.tables.some((t) => t.id === s.ui.tableId) ? s.ui.tableId : (config.tables[0] || {}).id || null;
    return { config, ui: { ...s.ui, tableId } };
  });
  await store.saveConfig(config);
  await store.saveUi(getState().ui);
  if (message) toast(message, 'ok');
}

// ── Danh sách bàn ─────────────────────────────────────────────────────────────

function renderList(s) {
  const list = $('#tableList');
  if (!s.config.tables.length) {
    list.replaceChildren(h('li', { class: 'empty', text: 'Chưa có bàn nào. Bấm “+ Thêm bàn”.' }));
    return;
  }
  list.replaceChildren(
    ...s.config.tables.map((t) =>
      h(
        'li',
        {},
        h(
          'button',
          { type: 'button', class: 'table-item', 'aria-current': t.id === editingId ? 'true' : null, onclick: () => openForm(t) },
          h('span', { class: 'table-item-name', text: t.name || '(chưa đặt tên)' }),
          h('span', { class: 'table-item-key', text: t.streamKeyName || 'chưa có stream key' }),
          h('span', { class: `chip chip-${t.visibility.toLowerCase()}`, text: C.VISIBILITY_LABELS[t.visibility] })
        )
      )
    )
  );
}

// ── Form sửa bàn ──────────────────────────────────────────────────────────────

function openForm(table) {
  const form = $('#tableForm');
  editingId = table.id;
  TEXT_FIELDS.forEach((k) => (form.elements[k].value = table[k] ?? ''));
  BOOL_FIELDS.forEach((k) => (form.elements[k].checked = !!table[k]));
  const isNew = !getState().config.tables.some((t) => t.id === table.id);
  $('#tableFormTitle').textContent = isNew ? 'Thêm bàn' : `Sửa ${table.name || 'bàn'}`;
  $('#btnDeleteTable').hidden = isNew;
  renderErrors($('#tableErrors'), []);
  form.hidden = false;
  renderList(getState());
  form.elements.name.focus();
  form.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function closeForm() {
  editingId = null;
  $('#tableForm').hidden = true;
  renderList(getState());
}

function readForm() {
  const form = $('#tableForm');
  const raw = { id: editingId };
  TEXT_FIELDS.forEach((k) => (raw[k] = form.elements[k].value));
  BOOL_FIELDS.forEach((k) => (raw[k] = form.elements[k].checked));
  return C.normalizeTable(raw);
}

async function onSubmit(e) {
  e.preventDefault();
  const table = readForm();
  const { config } = getState();
  const errors = C.validateTable(table, config.tables);
  renderErrors($('#tableErrors'), errors);
  if (errors.length) return;
  await commitConfig(C.upsertTable(config, table), `Đã lưu ${table.name}`);
  closeForm();
}

async function onDelete() {
  const { config } = getState();
  const table = config.tables.find((t) => t.id === editingId);
  if (!table) return closeForm();
  const ok = await confirmDialog({
    title: `Xoá ${table.name}?`,
    message: `Cấu hình của ${table.name} (stream key “${table.streamKeyName}”) sẽ bị xoá khỏi extension. Không ảnh hưởng gì tới YouTube.`,
    okText: 'Xoá bàn',
    danger: true,
  });
  if (!ok) return;
  await commitConfig(C.removeTable(config, table.id), `Đã xoá ${table.name}`);
  closeForm();
}

function renderVarChips() {
  $('#varChips').replaceChildren(
    h('span', { class: 'muted', text: 'Chèn biến:' }),
    ...TPL.VARIABLES.map((v) =>
      h('button', {
        type: 'button',
        class: 'var-chip',
        // mousedown giữ focus ở ô mẫu đang gõ
        onmousedown: (e) => e.preventDefault(),
        onclick: () => insertVariable(`{${v}}`),
      }, `{${v}}`)
    )
  );
}

function insertVariable(token) {
  const field = lastTemplateField || $('#tableForm').elements.titleTemplate;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = field.value.slice(0, start) + token + field.value.slice(end);
  field.focus();
  field.setSelectionRange(start + token.length, start + token.length);
}

// ── Cài đặt chung ─────────────────────────────────────────────────────────────

function fillSettings(s) {
  const st = s.config.settings;
  const active = document.activeElement;
  if (active !== $('#set-channel')) $('#set-channel').value = st.channelId || '';
  if (active !== $('#set-timeout')) $('#set-timeout').value = st.liveTimeoutSec;
  $('#set-order').value = st.switchOrder;
  $('#detectedChannel').textContent = s.detectedChannelId ? `tự nhận: ${s.detectedChannelId}` : 'chưa nhận được';
}

const saveSettings = debounce(async () => {
  const raw = {
    channelId: $('#set-channel').value.trim(),
    switchOrder: $('#set-order').value,
    liveTimeoutSec: Number($('#set-timeout').value),
  };
  if (raw.channelId && !/^UC[\w-]{22}$/.test(raw.channelId)) {
    toast('Channel ID phải có dạng UC + 22 ký tự', 'error');
    return;
  }
  const settings = C.normalizeSettings(raw);
  const { config } = getState();
  await commitConfig({ ...config, settings });
}, 500);

// ── Xuất / nhập ───────────────────────────────────────────────────────────────

function onExport() {
  const { config } = getState();
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  downloadText(`arena-live-config-${stamp}.json`, C.exportConfig(config), 'application/json');
}

async function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imported = C.parseImportedConfig(await file.text());
    const ok = await confirmDialog({
      title: 'Thay cấu hình hiện tại?',
      message: `File có ${imported.tables.length} bàn. Toàn bộ ${getState().config.tables.length} bàn đang lưu sẽ được thay bằng nội dung file.`,
      okText: 'Nhập cấu hình',
      danger: true,
    });
    if (!ok) return;
    closeForm();
    await commitConfig(imported, `Đã nhập ${imported.tables.length} bàn`);
  } catch (err) {
    toast(err.message, 'error', 7000);
  }
}

export function initTables() {
  renderVarChips();
  const form = $('#tableForm');
  form.addEventListener('submit', onSubmit);
  form.querySelectorAll('[data-template]').forEach((el) => el.addEventListener('focus', () => (lastTemplateField = el)));
  $('#btnAddTable').addEventListener('click', () => openForm(C.defaultTable({ name: `Bàn ${getState().config.tables.length + 1}` })));
  $('#btnCancelTable').addEventListener('click', closeForm);
  $('#btnDeleteTable').addEventListener('click', onDelete);
  ['#set-channel', '#set-timeout'].forEach((sel) => $(sel).addEventListener('input', saveSettings));
  $('#set-order').addEventListener('change', saveSettings);
  $('#btnExport').addEventListener('click', onExport);
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', onImportFile);

  let lastConfig = null;
  let lastDetected = null;
  subscribe((s) => {
    if (s.config === lastConfig && s.detectedChannelId === lastDetected) return;
    lastConfig = s.config;
    lastDetected = s.detectedChannelId;
    renderList(s);
    fillSettings(s);
  });
  renderList(getState());
  fillSettings(getState());
}
