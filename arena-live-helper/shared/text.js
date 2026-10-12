// Hàm xử lý chữ thuần (không đụng DOM, không đụng chrome.*).
// Dùng chung cho content script, side panel, background và test Node.
(function (root) {
  'use strict';
  const ALH = (root.ALH = root.ALH || {});

  /** Chuẩn hoá để so sánh: NFC (dấu tiếng Việt), bỏ nbsp, gộp khoảng trắng, chữ thường. */
  function normText(s) {
    return String(s ?? '')
      .normalize('NFC')
      .replace(/[   ]/g, ' ')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * So một chuỗi với danh sách ứng viên.
   * mode: 'exact' | 'contains' | 'startsWith'
   */
  function textMatches(actual, candidates, mode = 'exact') {
    const a = normText(actual);
    if (!a) return false;
    return (candidates || []).some((c) => {
      const n = normText(c);
      if (!n) return false;
      if (mode === 'contains') return a.includes(n);
      if (mode === 'startsWith') return a.startsWith(n);
      return a === n;
    });
  }

  // Ký tự được phép đứng ngay sau tên stream key (ví dụ "Ban 3 (RTMP, Variable)").
  // Không nhận "-" vì tên key thường chứa " - " ("Ban 3 - Arena Q7").
  const KEY_BOUNDARY = /^\s*([(\[·|•]|$)/;

  /**
   * Dòng chữ hiển thị có phải là stream key `keyName` không.
   * "Ban 1" KHÔNG khớp "Ban 10", "Ban 3" KHÔNG khớp "Ban 3 - Arena Q7".
   */
  function matchesKeyName(displayText, keyName) {
    const key = normText(keyName);
    if (!key) return false;
    return String(displayText ?? '')
      .split(/\n+/)
      .map(normText)
      .some((line) => line === key || (line.startsWith(key) && KEY_BOUNDARY.test(line.slice(key.length))));
  }

  const VIDEO_ID_PATTERNS = [
    /\/video\/([\w-]{11})(?:[/?#]|$)/,
    /[?&]v=([\w-]{11})(?:[&#]|$)/,
    /youtu\.be\/([\w-]{11})(?:[/?#]|$)/,
    /\/vi(?:_webp)?\/([\w-]{11})\//,
    /\/live\/([\w-]{11})(?:[/?#]|$)/,
  ];

  /** Lấy video ID 11 ký tự từ link Studio / watch / youtu.be / thumbnail. */
  function extractVideoId(s) {
    const str = String(s ?? '');
    for (const re of VIDEO_ID_PATTERNS) {
      const m = str.match(re);
      if (m) return m[1];
    }
    return null;
  }

  /** Lấy channel ID (UC + 22 ký tự) từ URL Studio. */
  function extractChannelId(s) {
    const m = String(s ?? '').match(/\/channel\/(UC[\w-]{22})(?:[/?#]|$)/);
    return m ? m[1] : null;
  }

  /**
   * Phân loại trạng thái theo từ khoá. Thứ tự kiểm tra quan trọng:
   * "Đã phát trực tiếp" (đã kết thúc) chứa "trực tiếp", nên xét ended trước live.
   */
  const STATUS_ORDER = ['ended', 'scheduled', 'waiting', 'live'];

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Chứa từ khoá như một cụm từ trọn vẹn ("ended" không khớp "recommended"; hỗ trợ dấu tiếng Việt). */
  function containsPhrase(text, phrase) {
    const p = normText(phrase);
    if (!p) return false;
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(p)}(?![\\p{L}\\p{N}])`, 'u').test(normText(text));
  }

  function classifyStatus(statusText, keywords) {
    if (!normText(statusText)) return 'unknown';
    for (const status of STATUS_ORDER) {
      const list = (keywords && keywords[status]) || [];
      if (list.some((k) => containsPhrase(statusText, k))) return status;
    }
    return 'unknown';
  }

  /** So hai nội dung nhập (tiêu đề/mô tả) mà bỏ qua khác biệt khoảng trắng do contenteditable sinh ra. */
  function normMultiline(s) {
    return String(s ?? '')
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      .replace(/[ ​]/g, ' ')
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function sameContent(a, b) {
    return normMultiline(a) === normMultiline(b);
  }

  /** So URL Studio bỏ qua query/hash và dấu "/" cuối. */
  function sameStudioPath(a, b) {
    const clean = (u) => {
      try {
        const x = new URL(u);
        return x.origin + x.pathname.replace(/\/+$/, '');
      } catch {
        return String(u ?? '');
      }
    };
    return clean(a) === clean(b);
  }

  /** Thay {key} trong mẫu URL; ném lỗi nếu thiếu giá trị. */
  function fillUrl(pattern, values) {
    return String(pattern).replace(/\{(\w+)\}/g, (_, k) => {
      const v = values?.[k];
      if (v === undefined || v === null || v === '') throw new Error(`Thiếu giá trị "${k}" cho URL ${pattern}`);
      return encodeURIComponent(v);
    });
  }

  function shorten(s, max = 80) {
    const str = String(s ?? '').replace(/\s+/g, ' ').trim();
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  ALH.text = {
    normText,
    textMatches,
    matchesKeyName,
    extractVideoId,
    extractChannelId,
    containsPhrase,
    classifyStatus,
    normMultiline,
    sameContent,
    sameStudioPath,
    fillUrl,
    shorten,
  };
})(globalThis);
