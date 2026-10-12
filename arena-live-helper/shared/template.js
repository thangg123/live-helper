// Mẫu tiêu đề / mô tả: thay biến {ban}, {giai}, {vong}, {a}, {b}, {ghichu}, {ngay}, {gio}.
(function (root) {
  'use strict';
  const ALH = (root.ALH = root.ALH || {});

  const TITLE_MAX = 100;
  const DESCRIPTION_MAX = 5000;
  const VARIABLES = ['ban', 'giai', 'vong', 'a', 'b', 'ghichu', 'ngay', 'gio'];

  const pad2 = (n) => String(n).padStart(2, '0');
  const formatDate = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const formatTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  /** Gom giá trị biến từ tên bàn + form trận + thời điểm hiện tại. */
  function buildVars(tableName, match, now = new Date()) {
    const m = match || {};
    return {
      ban: tableName || '',
      giai: m.giai || '',
      vong: m.vong || '',
      a: m.a || '',
      b: m.b || '',
      ghichu: m.ghichu || '',
      ngay: formatDate(now),
      gio: formatTime(now),
    };
  }

  /** Thay {biến}; biến không biết thì giữ nguyên để người dùng thấy lỗi gõ mẫu. */
  function renderTemplate(template, vars) {
    return String(template ?? '').replace(/\{(\w+)\}/g, (whole, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? '').trim() : whole
    );
  }

  // Dấu phân cách hay dùng trong tiêu đề: – — - | · •
  const SEP = '[–—\\-|·•]';

  const cleanSegment = (seg) =>
    seg
      .trim()
      .replace(/^vs(\s+|$)/i, '')
      .replace(/(^|\s+)vs$/i, '')
      .trim();

  /**
   * Dọn tiêu đề khi có biến trống: "Giải –  – A vs B" → "Giải – A vs B".
   * Tách theo dấu phân cách có khoảng trắng hai bên, bỏ đoạn rỗng và "vs" mồ côi,
   * giữ nguyên dấu phân cách gốc của từng đoạn còn lại.
   */
  function cleanTitle(s) {
    const t = String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(new RegExp(`^(${SEP}\\s+)+`), '')
      .replace(new RegExp(`(\\s+${SEP})+$`), '');
    const parts = t.split(new RegExp(`\\s+(${SEP})(?=\\s|$)`));
    const out = [];
    for (let i = 0; i < parts.length; i += 2) {
      const seg = cleanSegment(parts[i]);
      if (!seg) continue;
      if (out.length) out.push(` ${parts[i - 1]} `);
      out.push(seg);
    }
    return out.join('');
  }

  function renderTitle(template, vars) {
    return cleanTitle(renderTemplate(template, vars));
  }

  function renderDescription(template, vars) {
    return renderTemplate(template, vars)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n')
      .trim();
  }

  /** Lỗi chặn chạy (mảng chuỗi rỗng = hợp lệ). YouTube không nhận < > trong tiêu đề. */
  function validateTitle(title) {
    const errors = [];
    const t = String(title ?? '').trim();
    if (!t) errors.push('Tiêu đề đang trống.');
    if (t.length > TITLE_MAX) errors.push(`Tiêu đề dài ${t.length}/${TITLE_MAX} ký tự.`);
    if (/[<>]/.test(t)) errors.push('Tiêu đề không được chứa ký tự < hoặc >.');
    const leftover = t.match(/\{\w+\}/g);
    if (leftover) errors.push(`Còn biến chưa thay: ${leftover.join(', ')}`);
    return errors;
  }

  function validateDescription(desc) {
    const errors = [];
    const d = String(desc ?? '');
    if (d.length > DESCRIPTION_MAX) errors.push(`Mô tả dài ${d.length}/${DESCRIPTION_MAX} ký tự.`);
    if (/[<>]/.test(d)) errors.push('Mô tả không được chứa ký tự < hoặc >.');
    return errors;
  }

  ALH.template = {
    TITLE_MAX,
    DESCRIPTION_MAX,
    VARIABLES,
    formatDate,
    formatTime,
    buildVars,
    renderTemplate,
    cleanTitle,
    renderTitle,
    renderDescription,
    validateTitle,
    validateDescription,
  };
})(globalThis);
