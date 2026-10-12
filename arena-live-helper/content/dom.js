// Thao tác DOM trên YouTube Studio: tìm xuyên shadow DOM, chờ, bấm, gõ chữ, chọn menu, tô viền.
// Mọi hàm có tham số `ctx` (tạo ở main.js) để: ghi log, kiểm tra cờ Dừng, chế độ Chạy thử.
(function (root) {
  'use strict';
  const ALH = (root.ALH = root.ALH || {});
  const T = ALH.text;

  const POLL_MS = 200;
  const DRY_WAIT_MS = 2500; // Chạy thử: phần tử phụ thuộc vào cú bấm giả thì chỉ chờ ngắn
  const HUMAN_PAUSE = [300, 800];

  class StepError extends Error {
    constructor(message, info = {}) {
      super(message);
      this.name = 'StepError';
      Object.assign(this, info);
    }
  }
  class CancelledError extends Error {
    constructor() {
      super('Đã dừng');
      this.name = 'CancelledError';
      this.kind = 'cancelled';
    }
  }
  class DryRunStop extends Error {
    constructor(message) {
      super(message);
      this.name = 'DryRunStop';
      this.kind = 'dryRunStop';
    }
  }

  // ── Duyệt cây (xuyên shadow root) ─────────────────────────────────────────────

  /** Trả về [start, ...mọi shadowRoot lồng bên dưới]. */
  function collectRoots(start) {
    const roots = [];
    const stack = [start];
    while (stack.length) {
      const r = stack.pop();
      roots.push(r);
      if (r.nodeType === Node.ELEMENT_NODE && r.shadowRoot) stack.push(r.shadowRoot);
      const walker = document.createTreeWalker(r, NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.shadowRoot) stack.push(n.shadowRoot);
      }
    }
    return roots;
  }

  /** querySelectorAll xuyên shadow DOM. "a >>> b" = tìm b bên trong (kể cả shadow) của a. */
  function deepQueryAll(selector, scope = document) {
    const segments = String(selector).split('>>>').map((s) => s.trim()).filter(Boolean);
    let bases = [scope];
    for (const seg of segments) {
      const found = new Set();
      for (const base of bases) {
        for (const r of collectRoots(base)) r.querySelectorAll(seg).forEach((el) => found.add(el));
      }
      bases = [...found];
    }
    return bases.filter((el) => el !== scope);
  }

  function deepQuery(selector, scope = document) {
    return deepQueryAll(selector, scope)[0] || null;
  }

  /** Mọi phần tử bên dưới scope (kể cả trong shadow root). */
  function allElements(scope = document) {
    return deepQueryAll('*', scope);
  }

  const parentDeep = (n) => n.parentElement || (n.getRootNode && n.getRootNode().host) || null;

  function deepContains(ancestor, node) {
    for (let n = node; n; n = n.parentNode || n.host) if (n === ancestor) return true;
    return false;
  }

  /** Bỏ những phần tử chứa phần tử khác trong danh sách → giữ phần tử trong cùng (nút thật). */
  function innermost(els) {
    return els.filter((el) => !els.some((o) => o !== el && deepContains(el, o)));
  }

  function outermost(els) {
    return els.filter((el) => !els.some((o) => o !== el && deepContains(o, el)));
  }

  // ── Trạng thái phần tử ────────────────────────────────────────────────────────

  function isVisible(el, depth = 0) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function' && el.getClientRects().length) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return true;
    // custom element "display: contents" không có hộp riêng → xét con
    if (depth < 2 && getComputedStyle(el).display === 'contents') {
      return [...el.children].some((c) => isVisible(c, depth + 1));
    }
    return false;
  }

  function isEnabled(el) {
    let n = el;
    for (let i = 0; n && i < 4; i++, n = parentDeep(n)) {
      if (n.getAttribute && (n.getAttribute('aria-disabled') === 'true' || n.hasAttribute('disabled'))) return false;
    }
    return true;
  }

  function visibleText(el) {
    if (!el) return '';
    const t = el.innerText !== undefined ? el.innerText : el.textContent;
    return String(t || '').trim();
  }

  /** true / false / null (không xác định). Dựa vào thuộc tính vì content script không thấy property của Polymer. */
  function readChecked(el) {
    if (!el) return null;
    const nodes = [el, ...deepQueryAll('[aria-checked], [aria-pressed], input[type="checkbox"], input[type="radio"]', el)];
    for (const n of nodes) {
      const ac = n.getAttribute('aria-checked');
      if (ac === 'true' || ac === 'false') return ac === 'true';
      const ap = n.getAttribute('aria-pressed');
      if (ap === 'true' || ap === 'false') return ap === 'true';
      if (n instanceof HTMLInputElement) return n.checked;
    }
    if (el.hasAttribute('checked') || el.hasAttribute('active')) return true;
    return null;
  }

  function zIndexOf(el) {
    let max = 0;
    for (let n = el; n && n.nodeType === Node.ELEMENT_NODE; n = parentDeep(n)) {
      const z = parseInt(getComputedStyle(n).zIndex, 10);
      if (Number.isFinite(z) && z > max) max = z;
    }
    return max;
  }

  /** Lớp phủ trên cùng trong số các phần tử khớp css (dialog/menu). Hoà nhau → lấy phần tử ngoài cùng, mới nhất. */
  function topOverlay(css) {
    const list = deepQueryAll(css).filter((el) => isVisible(el));
    if (!list.length) return null;
    const withZ = list.map((el) => ({ el, z: zIndexOf(el) }));
    const maxZ = Math.max(...withZ.map((x) => x.z));
    const top = outermost(withZ.filter((x) => x.z === maxZ).map((x) => x.el));
    return top[top.length - 1] || null;
  }

  const topDialog = () => topOverlay(ALH.DIALOG_CSS);
  const topMenu = () => topOverlay(ALH.MENU_CSS);

  // ── Tìm phần tử theo entry trong selectors.js ─────────────────────────────────

  function toEntry(target) {
    return typeof target === 'string' ? ALH.sel(target) : target;
  }

  function scopeFor(entry) {
    if (!entry.within) return { scope: document };
    if (entry.within === 'dialog') return { scope: topDialog(), reason: 'không có dialog nào đang mở' };
    if (entry.within === 'menu') return { scope: topMenu(), reason: 'không có menu/popup nào đang mở' };
    const r = resolveDetailed(entry.within);
    return { scope: r.el, reason: `không thấy vùng chứa "${entry.within}"` };
  }

  /** Phần tử chứa chữ nhãn (xét từng text node), sắp theo thứ tự tài liệu. */
  function findLabelElements(scope, labels, mode) {
    const out = [];
    for (const r of collectRoots(scope)) {
      const walker = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement;
        if (parent && T.textMatches(n.nodeValue, labels, mode) && isVisible(parent)) out.push(parent);
      }
    }
    return out;
  }

  function distance(a, b) {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return Math.hypot(ra.left + ra.width / 2 - (rb.left + rb.width / 2), ra.top + ra.height / 2 - (rb.top + rb.height / 2));
  }

  /** Tìm phần tử `target` gần nhãn nhất: chính nhãn nằm trong target, hoặc leo dần lên tổ tiên. */
  function findNear(near, scope) {
    const labels = findLabelElements(scope, near.label, near.match || 'startsWith');
    for (const lab of labels) {
      for (let n = lab, i = 0; n && i < 4; i++, n = parentDeep(n)) {
        if (n.matches && n.matches(near.target) && isVisible(n)) return n;
      }
      for (let anc = parentDeep(lab), i = 0; anc && i < 6; i++, anc = parentDeep(anc)) {
        const targets = deepQueryAll(near.target, anc).filter((t) => isVisible(t));
        if (targets.length) return targets.sort((x, y) => distance(x, lab) - distance(y, lab))[0];
      }
    }
    return null;
  }

  /**
   * Thử tìm một lần (không chờ). Trả { el, via } hoặc { el: null, reason }.
   * Thứ tự: css (id ổn định) → aria-label → chữ hiển thị → gần nhãn.
   */
  function resolveDetailed(target, opts = {}) {
    const entry = toEntry(target);
    const { scope, reason } = opts.scope ? { scope: opts.scope } : scopeFor(entry);
    if (!scope) return { el: null, reason };
    const mode = entry.match || 'exact';

    for (const css of entry.css || []) {
      const el = deepQueryAll(css, scope).find((e) => isVisible(e));
      if (el) return { el, via: `css ${css}` };
    }
    if (entry.aria && entry.aria.length) {
      const hits = deepQueryAll('[aria-label]', scope).filter(
        (e) => (!entry.targets || e.matches(entry.targets)) && T.textMatches(e.getAttribute('aria-label'), entry.aria, mode) && isVisible(e)
      );
      const el = innermost(hits)[0];
      if (el) return { el, via: `aria-label "${el.getAttribute('aria-label')}"` };
    }
    if (entry.text && entry.text.length) {
      const hits = deepQueryAll(entry.targets || ALH.CLICKABLE_CSS, scope).filter(
        (e) => isVisible(e) && T.textMatches(visibleText(e), entry.text, mode)
      );
      const el = innermost(hits)[0];
      if (el) return { el, via: `chữ "${T.shorten(visibleText(el), 40)}"` };
    }
    if (entry.near) {
      const el = findNear(entry.near, scope);
      if (el) return { el, via: 'gần nhãn chữ' };
    }
    return { el: null, reason: 'không khớp css / aria-label / chữ nào' };
  }

  const resolve = (target, opts) => resolveDetailed(target, opts).el;

  /** Mọi phần tử hiển thị khớp css đầu tiên có kết quả (dùng cho danh sách dòng). */
  function resolveAll(target, opts = {}) {
    const entry = toEntry(target);
    const scope = opts.scope || document;
    for (const css of entry.css || []) {
      const els = deepQueryAll(css, scope).filter((e) => isVisible(e));
      if (els.length) return outermost(els);
    }
    return [];
  }

  // ── Chờ / nghỉ (huỷ được) ─────────────────────────────────────────────────────

  async function sleep(ctx, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      ctx.checkCancel();
      await new Promise((r) => setTimeout(r, Math.min(100, end - Date.now())));
    }
    ctx.checkCancel();
  }

  function humanPause(ctx) {
    const [lo, hi] = HUMAN_PAUSE;
    return sleep(ctx, lo + Math.random() * (hi - lo));
  }

  function dryStop(ctx, desc) {
    return new DryRunStop(`Chạy thử dừng ở "${desc}": phần này chỉ hiện sau khi bấm thật "${ctx.dryPending}".`);
  }

  /**
   * Chờ phần tử xuất hiện và hiển thị. `target`: khoá selector, entry, hoặc hàm trả về phần tử.
   * opts: timeout (ms, mặc định 10000), enabled (chờ hết bị vô hiệu hoá), optional (hết giờ trả null), label, scope.
   */
  async function waitFor(ctx, target, opts = {}) {
    const { timeout = 10000, enabled = false, optional = false, label, scope } = opts;
    const isFn = typeof target === 'function';
    const entry = isFn ? null : toEntry(target);
    const desc = label || (entry && entry.desc) || 'phần tử';
    const limit = ctx.dryRun && ctx.dryPending ? Math.min(timeout, DRY_WAIT_MS) : timeout;
    const start = Date.now();
    let last = null;
    for (;;) {
      ctx.checkCancel();
      if (isFn) {
        const el = target();
        if (el) return el;
      } else {
        last = resolveDetailed(entry, { scope });
        if (last.el && (!enabled || isEnabled(last.el))) return last.el;
      }
      if (Date.now() - start >= limit) break;
      await sleep(ctx, POLL_MS);
    }
    if (optional) return null;
    if (ctx.dryRun && ctx.dryPending) throw dryStop(ctx, desc);
    const why = last && last.el && enabled ? 'tìm thấy nhưng đang bị vô hiệu hoá' : (last && last.reason) || 'không tìm thấy';
    throw new StepError(`Không tìm thấy ${desc} sau ${Math.round(limit / 1000)} giây (${why}).`, {
      selector: entry && entry.key,
      url: location.href,
    });
  }

  /** Chờ tới khi predicate() trả giá trị truthy; trả về giá trị đó. */
  async function waitUntil(ctx, predicate, { timeout = 10000, label = 'điều kiện', selector } = {}) {
    const limit = ctx.dryRun && ctx.dryPending ? Math.min(timeout, DRY_WAIT_MS) : timeout;
    const start = Date.now();
    for (;;) {
      ctx.checkCancel();
      const v = predicate();
      if (v) return v;
      if (Date.now() - start >= limit) break;
      await sleep(ctx, POLL_MS);
    }
    if (ctx.dryRun && ctx.dryPending) throw dryStop(ctx, label);
    throw new StepError(`Hết ${Math.round(limit / 1000)} giây mà chưa thấy: ${label}.`, { selector, url: location.href });
  }

  // ── Tô viền (Chạy thử / tab Selector) ─────────────────────────────────────────

  const highlighted = new Map();

  function highlight(el, label, color = '#e11d2e') {
    if (!el) return;
    const target = el.getBoundingClientRect().width ? el : [...el.children].find((c) => isVisible(c)) || el;
    if (!highlighted.has(target)) {
      highlighted.set(target, {
        outline: target.style.outline,
        outlineOffset: target.style.outlineOffset,
        title: target.getAttribute('title'),
      });
    }
    target.style.setProperty('outline', `3px solid ${color}`, 'important');
    target.style.setProperty('outline-offset', '2px', 'important');
    if (label) target.setAttribute('title', `[Arena Live Helper] ${label}`);
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  function clearHighlights() {
    for (const [el, prev] of highlighted) {
      el.style.outline = prev.outline;
      el.style.outlineOffset = prev.outlineOffset;
      if (prev.title === null) el.removeAttribute('title');
      else el.setAttribute('title', prev.title);
    }
    const n = highlighted.size;
    highlighted.clear();
    return n;
  }

  // ── Hành động ─────────────────────────────────────────────────────────────────

  function fireMouse(el, type, x, y) {
    const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    el.dispatchEvent(
      new Ctor(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerType: 'mouse' })
    );
  }

  const NATIVE_CLICKABLE =
    'button, a[href], input, select, textarea, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="tab"]';

  /**
   * Selector có thể khớp vỏ custom element (ytcp-button) trong khi handler nằm ở <button> bên trong.
   * Bấm vào phần tử bấm được trong cùng: sự kiện sẽ nổi lên vỏ, nên đúng cho cả hai kiểu gắn handler.
   */
  function clickTarget(el) {
    if (el.matches(NATIVE_CLICKABLE)) return el;
    return deepQueryAll(NATIVE_CLICKABLE, el).find((c) => isVisible(c)) || el;
  }

  /** Bấm như người dùng (pointer + mouse + click). Chạy thử: chỉ tô viền đỏ. */
  async function click(ctx, target, label) {
    ctx.checkCancel();
    if (!target) throw new StepError(`Không có phần tử để bấm: ${label}`, { url: location.href });
    const el = clickTarget(target);
    if (ctx.dryRun) {
      highlight(el, `Sẽ bấm: ${label}`);
      ctx.log('dry', `[Chạy thử] Sẽ bấm: ${label}`);
      ctx.dryPending = label;
      await sleep(ctx, 500);
      return;
    }
    el.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(ctx, 80);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    ['pointerover', 'mouseover', 'pointerdown', 'mousedown'].forEach((t) => fireMouse(el, t, x, y));
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    ['pointerup', 'mouseup'].forEach((t) => fireMouse(el, t, x, y));
    el.click();
    ctx.log('info', `Đã bấm: ${label}`);
  }

  function findEditable(el) {
    if (el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
    return deepQuery('[contenteditable="true"], [contenteditable="plaintext-only"], textarea, input', el) || el;
  }

  function readEditable(el) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.innerText;
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  // Xuống dòng bằng insertLineBreak (<br>) thay vì để insertText tự tạo <div>:
  // <div> làm innerText thừa một dòng trống ở mỗi đoạn trống.
  function insertIntoEditable(el, value) {
    el.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    String(value).split('\n').forEach((line, i) => {
      if (i > 0) document.execCommand('insertLineBreak', false);
      if (line) document.execCommand('insertText', false, line);
    });
  }

  /**
   * Gõ chữ vào ô contenteditable của Studio: focus → chọn hết → insertText (Studio nhận sự kiện input),
   * rồi đọc lại để chắc đã nhận. Chạy thử: chỉ tô viền.
   */
  async function typeText(ctx, el, value, label) {
    ctx.checkCancel();
    if (ctx.dryRun) {
      highlight(el, `Sẽ nhập: ${label}`, '#e11d2e');
      ctx.log('dry', `[Chạy thử] Sẽ nhập ${label}: "${T.shorten(value, 60)}"`);
      await sleep(ctx, 300);
      return;
    }
    const box = findEditable(el);
    box.scrollIntoView({ block: 'center' });
    if (box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) {
      box.focus();
      setNativeValue(box, value);
    } else {
      insertIntoEditable(box, value);
    }
    await sleep(ctx, 250);
    if (!T.sameContent(readEditable(box), value)) {
      ctx.log('warn', `${label}: Studio chưa nhận nội dung, thử cách dự phòng`);
      box.focus();
      box.textContent = value;
      box.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
      await sleep(ctx, 250);
    }
    const got = readEditable(box);
    if (!T.sameContent(got, value)) {
      throw new StepError(`Ô ${label} không nhận nội dung. Đang có: "${T.shorten(got, 60)}"`, { url: location.href });
    }
    box.blur();
    ctx.log('info', `Đã nhập ${label}: "${T.shorten(value, 60)}"`);
  }

  function menuItemTexts(limit = 15) {
    const menu = topMenu();
    if (!menu) return [];
    return deepQueryAll(ALH.MENU_ITEM_CSS, menu)
      .filter((e) => isVisible(e))
      .map((e) => T.shorten(visibleText(e), 50))
      .filter(Boolean)
      .slice(0, limit);
  }

  function findMenuItem(matcher) {
    const menu = topMenu();
    if (!menu) return null;
    const items = deepQueryAll(ALH.MENU_ITEM_CSS, menu).filter((e) => isVisible(e) && matcher(visibleText(e)));
    if (items.length) return innermost(items)[0];
    const any = allElements(menu).filter((e) => isVisible(e) && matcher(visibleText(e)));
    return innermost(any)[0] || null;
  }

  /**
   * Mở dropdown bằng `trigger`, chờ menu hiện, chọn mục có chữ khớp.
   * `matcher`: chuỗi (so chính xác) hoặc hàm (text) => boolean.
   */
  async function pickMenuItem(ctx, trigger, matcher, { label, timeout = 8000 } = {}) {
    const match = typeof matcher === 'function' ? matcher : (t) => T.textMatches(t, [matcher], 'exact');
    const name = label || String(matcher);
    await click(ctx, trigger, `Mở menu chọn ${name}`);
    await waitFor(ctx, () => topMenu(), { timeout, label: `menu chọn ${name}` });
    const item = await waitFor(ctx, () => findMenuItem(match), { timeout: 4000, optional: true });
    if (!item) {
      const seen = menuItemTexts();
      pressEscape();
      throw new StepError(`Không thấy mục "${name}" trong menu. Các mục đang có: ${seen.join(' | ') || '(không đọc được)'}`, {
        url: location.href,
      });
    }
    await click(ctx, item, `Chọn ${name}`);
    return item;
  }

  /** Đặt checkbox / công tắc / radio về `desired`, rồi kiểm tra lại. */
  async function setChecked(ctx, el, desired, label) {
    const cur = readChecked(el);
    if (cur === desired) {
      ctx.log('info', `${label}: đã ${desired ? 'bật' : 'tắt'} sẵn`);
      return;
    }
    if (cur === null) throw new StepError(`Không đọc được trạng thái của "${label}".`, { url: location.href });
    await click(ctx, el, `${label} → ${desired ? 'bật' : 'tắt'}`);
    if (ctx.dryRun) return;
    await waitUntil(ctx, () => readChecked(el) === desired, { timeout: 4000, label: `${label} chuyển sang ${desired ? 'bật' : 'tắt'}` });
  }

  function pressEscape() {
    const target = document.activeElement || document.body;
    ['keydown', 'keyup'].forEach((type) =>
      target.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true }))
    );
  }

  ALH.dom = {
    StepError,
    CancelledError,
    DryRunStop,
    collectRoots,
    deepQueryAll,
    deepQuery,
    allElements,
    parentDeep,
    deepContains,
    innermost,
    outermost,
    isVisible,
    isEnabled,
    visibleText,
    readChecked,
    topDialog,
    topMenu,
    resolveDetailed,
    resolve,
    resolveAll,
    sleep,
    humanPause,
    waitFor,
    waitUntil,
    highlight,
    clearHighlights,
    click,
    typeText,
    pickMenuItem,
    menuItemTexts,
    setChecked,
    pressEscape,
  };
})(globalThis);
