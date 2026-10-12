// Chế độ chụp DOM + kiểm tra selector (tab "Selector" trong side panel).
(function (root) {
  'use strict';
  const ALH = (root.ALH = root.ALH || {});
  const D = ALH.dom;
  const T = ALH.text;

  const MAX_SECTION_CHARS = 4_000_000;
  const MAX_TEXT = 200;
  const MAX_ATTR = 300;
  const HIDDEN_DEPTH = 2; // nhánh bị ẩn chỉ chụp 2 tầng để file gọn
  const MAX_SUMMARY_ROWS = 800;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE']);
  const VOID_TAGS = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'SOURCE', 'TRACK', 'WBR']);
  const SUMMARY_CSS = `${ALH.CLICKABLE_CSS}, [contenteditable="true"], input, textarea, [aria-label]`;

  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function attrString(el) {
    return [...el.attributes]
      .filter((a) => a.name !== 'style' || a.value.length < 120)
      .map((a) => {
        const v = a.value.length > MAX_ATTR ? a.value.slice(0, MAX_ATTR) + '…' : a.value;
        return v === '' ? ` ${a.name}` : ` ${a.name}="${v.replace(/"/g, '&quot;')}"`;
      })
      .join('');
  }

  /** In cây DOM thụt lề, xuyên shadow root, đánh dấu phần tử ẩn. Trả về chuỗi (có giới hạn kích thước). */
  function serializeTree(rootEl) {
    const lines = [];
    let size = 0;
    let truncated = false;
    const push = (line) => {
      if (size > MAX_SECTION_CHARS) {
        truncated = true;
        return false;
      }
      lines.push(line);
      size += line.length + 1;
      return true;
    };

    const visit = (el, depth, hiddenDepth) => {
      if (truncated || SKIP_TAGS.has(el.tagName)) return;
      const pad = '  '.repeat(depth);
      const tag = el.tagName.toLowerCase();
      const visible = D.isVisible(el);
      const mark = visible ? '' : ' data-alh-hidden';
      if (tag === 'svg') {
        push(`${pad}<svg${attrString(el)}${mark}>…</svg>`);
        return;
      }
      const nextHidden = visible ? 0 : hiddenDepth + 1;
      if (!push(`${pad}<${tag}${attrString(el)}${mark}>`)) return;
      if (VOID_TAGS.has(el.tagName)) return;
      if (nextHidden > HIDDEN_DEPTH) {
        const n = el.querySelectorAll('*').length;
        if (n) push(`${pad}  …(ẩn, ${n} phần tử con)`);
      } else {
        if (el.shadowRoot) {
          push(`${pad}  #shadow-root`);
          [...el.shadowRoot.children].forEach((c) => visit(c, depth + 2, nextHidden));
        }
        for (const node of el.childNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) visit(node, depth + 1, nextHidden);
          else if (node.nodeType === Node.TEXT_NODE) {
            const t = node.nodeValue.replace(/\s+/g, ' ').trim();
            if (t) push(`${pad}  "${t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + '…' : t}"`);
          }
        }
      }
      push(`${pad}</${tag}>`);
    };

    visit(rootEl, 0, 0);
    if (truncated) lines.push('…(cắt bớt vì quá dài)');
    return lines.join('\n');
  }

  function shortPath(el) {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === Node.ELEMENT_NODE && i < 6; n = D.parentDeep(n), i++) {
      parts.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : ''));
    }
    return parts.join(' > ');
  }

  function interactiveSummary() {
    return D.deepQueryAll(SUMMARY_CSS)
      .filter((el) => D.isVisible(el))
      .slice(0, MAX_SUMMARY_ROWS)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        name: el.getAttribute('name') || '',
        role: el.getAttribute('role') || '',
        aria: el.getAttribute('aria-label') || '',
        text: T.shorten(D.visibleText(el), 70),
        state: [
          D.isEnabled(el) ? '' : 'disabled',
          D.readChecked(el) === true ? 'checked' : '',
          el.getAttribute('aria-haspopup') ? 'popup' : '',
        ].filter(Boolean).join(' '),
        path: shortPath(el),
      }));
  }

  function summaryTable(rows) {
    const head = ['#', 'tag', 'id', 'name', 'role', 'aria-label', 'chữ', 'trạng thái', 'đường dẫn'];
    const body = rows
      .map((r, i) =>
        `<tr><td>${i + 1}</td>${[r.tag, r.id, r.name, r.role, r.aria, r.text, r.state, r.path].map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`
      )
      .join('\n');
    return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>\n${body}\n</tbody></table>`;
  }

  function pageKind() {
    const p = location.pathname;
    if (/\/video\/[\w-]{11}\/livestreaming/.test(p)) return 'phong-dieu-khien';
    if (/\/livestreaming\/manage/.test(p)) return 'quan-ly';
    if (/\/livestreaming/.test(p)) return 'livestreaming';
    return 'khac';
  }

  /** Chụp vùng đang mở (dialog, menu) + toàn trang thành một file .html để viết / sửa selector. */
  function capture() {
    const dialogs = D.outermost(D.deepQueryAll(ALH.DIALOG_CSS).filter((e) => D.isVisible(e)));
    const menus = D.outermost(D.deepQueryAll(ALH.MENU_CSS).filter((e) => D.isVisible(e)));
    const summary = interactiveSummary();
    const sections = [
      ...dialogs.map((el, i) => ({ title: `Dialog ${i + 1}: <${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}>`, el })),
      ...menus.map((el, i) => ({ title: `Menu / popup ${i + 1}: <${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}>`, el })),
      { title: 'Toàn trang (body) — nhánh ẩn được rút gọn', el: document.body },
    ];
    const now = new Date();
    const meta = {
      url: location.href,
      thoiGian: now.toISOString(),
      ngonNgu: document.documentElement.lang || '(không rõ)',
      kichThuoc: `${innerWidth}×${innerHeight}`,
      trang: pageKind(),
      soDialog: dialogs.length,
      soMenu: menus.length,
    };
    const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Studio DOM ${escapeHtml(meta.trang)} ${escapeHtml(meta.thoiGian)}</title>
<style>
body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#1b1b1b}
h1{font-size:18px}h2{font-size:15px;margin-top:28px;border-top:2px solid #ddd;padding-top:12px}
table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #ddd;padding:3px 6px;vertical-align:top;text-align:left}
th{background:#f3f3f3;position:sticky;top:0}pre{background:#fafafa;border:1px solid #e5e5e5;padding:10px;overflow:auto;font:12px/1.4 ui-monospace,Menlo,monospace}
</style></head><body>
<h1>Arena Live Helper — chụp DOM YouTube Studio</h1>
<pre id="alh-meta">${escapeHtml(JSON.stringify(meta, null, 2))}</pre>
<h2>Phần tử bấm được / nhập được đang hiển thị (${summary.length})</h2>
${summaryTable(summary)}
${sections.map((s) => `<h2>${escapeHtml(s.title)}</h2>\n<pre class="alh-dom">${escapeHtml(serializeTree(s.el))}</pre>`).join('\n')}
</body></html>`;
    const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    return { html, filename: `studio-dom-${meta.trang}-${stamp}.html`, meta, chars: html.length };
  }

  /** Chạy qua mọi selector trên màn hình hiện tại. */
  function checkSelectors() {
    const results = ALH.allSelectorKeys().map((key) => {
      const entry = ALH.sel(key);
      const r = D.resolveDetailed(entry);
      return {
        key,
        desc: entry.desc,
        within: entry.within || null,
        found: !!r.el,
        via: r.via || null,
        reason: r.el ? null : r.reason,
      };
    });
    return {
      url: location.href,
      page: pageKind(),
      dialogOpen: !!D.topDialog(),
      menuOpen: !!D.topMenu(),
      results,
    };
  }

  function highlightKey(key) {
    const r = D.resolveDetailed(key);
    if (r.el) D.highlight(r.el, key, '#0a7d4f');
    return { key, found: !!r.el, via: r.via || null, reason: r.reason || null };
  }

  ALH.inspector = { capture, checkSelectors, highlightKey, serializeTree, interactiveSummary };
})(globalThis);
