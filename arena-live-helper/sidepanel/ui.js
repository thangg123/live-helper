// Tiện ích giao diện dùng chung trong side panel.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Tạo phần tử. Chữ luôn qua textContent / append(String) nên không chèn HTML. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const pad2 = (n) => String(n).padStart(2, '0');
export const clock = (t) => {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

let toastTimer = null;
export function toast(message, kind = 'info', ms = 3200) {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => (el.hidden = true), 200);
  }, ms);
}

let confirmQueue = Promise.resolve();

/** Hộp xác nhận trong panel. Trả Promise<boolean>. Các yêu cầu đến cùng lúc được xếp hàng. */
export function confirmDialog({ title, message, okText = 'Đồng ý', danger = false, kicker = '' }) {
  const run = () =>
    new Promise((resolve) => {
      const dlg = $('#confirmDialog');
      $('#confirmTitle').textContent = title;
      $('#confirmMessage').textContent = message;
      $('#confirmKicker').textContent = kicker;
      $('#confirmKicker').hidden = !kicker;
      $('#confirmOk').textContent = okText;
      dlg.dataset.danger = danger ? 'true' : 'false';
      dlg.returnValue = '';
      const onClose = () => {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      };
      dlg.addEventListener('close', onClose);
      dlg.showModal();
      (danger ? $('#confirmCancel') : $('#confirmOk')).focus();
    });
  const p = confirmQueue.then(run);
  confirmQueue = p.catch(() => {});
  return p;
}

export function downloadText(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function renderErrors(listEl, errors) {
  listEl.replaceChildren(...errors.map((e) => h('li', { text: e })));
}
