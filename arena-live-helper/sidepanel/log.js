// Khung nhật ký: hiển thị log từ background / Studio, copy, xoá.
import { $, h, clock, toast } from './ui.js';

const MAX_ENTRIES = 600;
const ICONS = { start: '◆', done: '◆', step: '▸', ok: '✓', info: '·', warn: '!', error: '✗', dry: '◌', nav: '↗' };
let entries = [];
let lastT = 0;

function detailLines(e) {
  return [
    e.step && `Bước: ${e.step}`,
    e.selector && `Selector: ${e.selector}`,
    e.url && `URL: ${e.url}`,
  ].filter(Boolean);
}

function renderEntry(e) {
  return h(
    'li',
    { class: `log-${e.level || 'info'}` },
    h('time', { text: clock(e.t) }),
    h('span', { class: 'log-icon', 'aria-hidden': 'true', text: ICONS[e.level] || '·' }),
    h('span', { class: 'log-msg' }, e.msg, ...detailLines(e).map((d) => h('span', { class: 'log-detail', text: d })))
  );
}

export function appendLog(entry) {
  if (!entry) return;
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  lastT = Math.max(lastT, entry.t);
  const list = $('#logList');
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.append(renderEntry(entry));
  while (list.children.length > MAX_ENTRIES) list.firstChild.remove();
  if (nearBottom) list.scrollTop = list.scrollHeight;
}

/** Ghép log từ buffer của background khi (nối lại) kết nối, bỏ những dòng đã có. */
export function mergeLogs(buffer) {
  (buffer || []).filter((e) => e.t > lastT).forEach(appendLog);
}

export const localLog = (level, msg) => appendLog({ t: Date.now(), level, msg, source: 'panel' });

function asText() {
  return entries
    .map((e) => [`${clock(e.t)} ${ICONS[e.level] || '·'} ${e.msg}`, ...detailLines(e).map((d) => `           ${d}`)].join('\n'))
    .join('\n');
}

export function initLog() {
  $('#btnCopyLog').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(asText());
      toast('Đã copy nhật ký', 'ok');
    } catch {
      toast('Không copy được — trình duyệt chặn clipboard', 'error');
    }
  });
  $('#btnClearLog').addEventListener('click', () => {
    entries = [];
    $('#logList').replaceChildren();
  });
}
