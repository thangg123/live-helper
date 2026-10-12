// Tab "Selector": chụp DOM, kiểm tra selector, đọc thử dữ liệu trang.
import { $, h, toast, downloadText } from './ui.js';
import { getState } from './state.js';
import * as bg from './bg.js';

const GROUP_LABELS = {
  manage: 'Trang Quản lý',
  reuse: 'Hộp dùng lại cài đặt',
  details: 'Dialog thông tin luồng',
  controlRoom: 'Phòng điều khiển',
};

const tool = (name, args) => bg.request('tool', { name, args, windowId: getState().windowId });

async function withBusy(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    toast(e.message, 'error', 6000);
  } finally {
    button.disabled = false;
  }
}

async function onCapture(e) {
  await withBusy(e.currentTarget, async () => {
    const res = await tool('capture');
    downloadText(res.filename, res.html, 'text/html');
    const kb = Math.round(res.chars / 1024);
    $('#captureInfo').textContent = `${res.filename} · ${kb} KB · trang: ${res.meta.trang} · ${res.meta.soDialog} dialog · ${res.meta.soMenu} menu`;
    toast('Đã tải file chụp DOM', 'ok');
  });
}

function resultRow(r) {
  return h(
    'li',
    { class: `check-row ${r.found ? 'is-found' : 'is-missing'}` },
    h(
      'button',
      {
        type: 'button',
        disabled: !r.found,
        title: r.found ? 'Tô viền phần tử này trên Studio' : r.reason || '',
        onclick: () => tool('highlight', { key: r.key }).catch((err) => toast(err.message, 'error')),
      },
      h('span', { class: 'check-mark', 'aria-hidden': 'true', text: r.found ? '✓' : '✗' }),
      h('span', { class: 'check-key', text: r.key }),
      h('span', { class: 'check-desc', text: r.desc }),
      h('span', { class: 'check-via', text: r.found ? r.via : r.reason })
    )
  );
}

async function onCheck(e) {
  await withBusy(e.currentTarget, async () => {
    const res = await tool('checkSelectors');
    const found = res.results.filter((r) => r.found).length;
    $('#checkSummary').replaceChildren(
      h('strong', { text: `${found}/${res.results.length} tìm thấy` }),
      h('span', { class: 'muted', text: ` · trang: ${res.page}${res.dialogOpen ? ' · có dialog' : ''}${res.menuOpen ? ' · có menu' : ''}` })
    );
    const groups = Object.keys(GROUP_LABELS).map((g) => ({ g, rows: res.results.filter((r) => r.key.startsWith(`${g}.`)) }));
    $('#checkResults').replaceChildren(
      ...groups
        .filter((x) => x.rows.length)
        .map((x) =>
          h('section', { class: 'check-group' },
            h('h3', { text: `${GROUP_LABELS[x.g]} · ${x.rows.filter((r) => r.found).length}/${x.rows.length}` }),
            h('ul', { class: 'check-list' }, ...x.rows.map(resultRow))
          )
        )
    );
  });
}

async function onProbe(e) {
  await withBusy(e.currentTarget, async () => {
    const res = await tool('probe');
    const out = $('#probeOut');
    out.textContent = JSON.stringify(res, null, 2);
    out.hidden = false;
  });
}

export function initSelectorTab() {
  $('#btnCapture').addEventListener('click', onCapture);
  $('#btnCheck').addEventListener('click', onCheck);
  $('#btnProbe').addEventListener('click', onProbe);
  $('#btnClearHl').addEventListener('click', () =>
    tool('clearHighlights').then((r) => toast(`Đã xoá ${r.cleared} viền`, 'ok'), (err) => toast(err.message, 'error'))
  );
}
