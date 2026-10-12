// Mô hình cấu hình: danh sách bàn + cài đặt chung. Không đụng chrome.* để test được.
(function (root) {
  'use strict';
  const ALH = (root.ALH = root.ALH || {});

  const CONFIG_VERSION = 1;
  const VISIBILITIES = ['PUBLIC', 'UNLISTED', 'PRIVATE'];
  const VISIBILITY_LABELS = { PUBLIC: 'Công khai', UNLISTED: 'Không công khai', PRIVATE: 'Riêng tư' };
  const SWITCH_ORDERS = ['createFirst', 'endFirst'];

  const DEFAULT_TITLE_TEMPLATE = '{giai} – {vong} – {a} vs {b} – {ban}';
  const DEFAULT_DESCRIPTION_TEMPLATE = [
    '{giai} – {vong}',
    '{a} vs {b}',
    '{ban} · {ngay} {gio}',
    '',
    '{ghichu}',
  ].join('\n');

  const DEFAULT_SETTINGS = Object.freeze({
    channelId: '',
    switchOrder: 'createFirst',
    liveTimeoutSec: 60,
  });

  function newTableId() {
    return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function defaultTable(overrides = {}) {
    return {
      id: newTableId(),
      name: '',
      streamKeyName: '',
      titleTemplate: DEFAULT_TITLE_TEMPLATE,
      descriptionTemplate: DEFAULT_DESCRIPTION_TEMPLATE,
      visibility: 'PUBLIC',
      playlist: '',
      category: 'Thể thao',
      madeForKids: false,
      autoStart: true,
      autoStop: true,
      ...overrides,
    };
  }

  const str = (v, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

  /** Ép một bàn về đúng kiểu, điền mặc định. "Dành cho trẻ em" luôn là Không. */
  function normalizeTable(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const base = defaultTable();
    return {
      id: str(r.id).trim() || base.id,
      name: str(r.name).trim(),
      streamKeyName: str(r.streamKeyName).trim(),
      titleTemplate: str(r.titleTemplate, base.titleTemplate),
      descriptionTemplate: str(r.descriptionTemplate, base.descriptionTemplate),
      visibility: VISIBILITIES.includes(r.visibility) ? r.visibility : base.visibility,
      playlist: str(r.playlist).trim(),
      category: str(r.category, base.category).trim(),
      madeForKids: false,
      autoStart: bool(r.autoStart, true),
      autoStop: bool(r.autoStop, true),
    };
  }

  function normalizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const timeout = Number(r.liveTimeoutSec);
    return {
      channelId: /^UC[\w-]{22}$/.test(str(r.channelId).trim()) ? str(r.channelId).trim() : '',
      switchOrder: SWITCH_ORDERS.includes(r.switchOrder) ? r.switchOrder : DEFAULT_SETTINGS.switchOrder,
      liveTimeoutSec: Number.isFinite(timeout) && timeout >= 10 && timeout <= 600 ? Math.round(timeout) : DEFAULT_SETTINGS.liveTimeoutSec,
    };
  }

  /** Bỏ bàn trùng id (giữ bàn đầu), trả cấu hình mới — không sửa object gốc. */
  function normalizeConfig(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const seen = new Set();
    const tables = (Array.isArray(r.tables) ? r.tables : [])
      .map(normalizeTable)
      .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    return { version: CONFIG_VERSION, tables, settings: normalizeSettings(r.settings) };
  }

  /** Lỗi của một bàn (mảng rỗng = hợp lệ). `others` dùng để bắt trùng tên / trùng stream key. */
  function validateTable(table, others = []) {
    const errors = [];
    if (!table.name) errors.push('Chưa nhập tên bàn.');
    if (!table.streamKeyName) errors.push('Chưa nhập tên stream key.');
    if (!table.titleTemplate.trim()) errors.push('Mẫu tiêu đề đang trống.');
    const rest = others.filter((o) => o.id !== table.id);
    const lower = (s) => s.normalize('NFC').trim().toLowerCase();
    if (table.name && rest.some((o) => lower(o.name) === lower(table.name))) errors.push(`Đã có bàn tên "${table.name}".`);
    if (table.streamKeyName && rest.some((o) => lower(o.streamKeyName) === lower(table.streamKeyName))) {
      errors.push(`Stream key "${table.streamKeyName}" đã gán cho bàn khác.`);
    }
    return errors;
  }

  function upsertTable(config, table) {
    const exists = config.tables.some((t) => t.id === table.id);
    const tables = exists ? config.tables.map((t) => (t.id === table.id ? table : t)) : [...config.tables, table];
    return { ...config, tables };
  }

  function removeTable(config, id) {
    return { ...config, tables: config.tables.filter((t) => t.id !== id) };
  }

  /** Đọc file JSON xuất ra trước đó. Ném lỗi tiếng Việt nếu file sai định dạng. */
  function parseImportedConfig(jsonText) {
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      throw new Error('File không phải JSON hợp lệ.');
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.tables)) {
      throw new Error('File không có danh sách "tables".');
    }
    if (data.version && data.version > CONFIG_VERSION) {
      throw new Error(`File cấu hình phiên bản ${data.version} mới hơn extension (${CONFIG_VERSION}).`);
    }
    const config = normalizeConfig(data);
    const problems = config.tables
      .map((t) => ({ t, errs: validateTable(t, config.tables) }))
      .filter((x) => x.errs.length)
      .map((x) => `${x.t.name || '(chưa đặt tên)'}: ${x.errs.join(' ')}`);
    if (problems.length) throw new Error('Cấu hình có bàn lỗi:\n' + problems.join('\n'));
    return config;
  }

  function exportConfig(config) {
    return JSON.stringify({ ...normalizeConfig(config), exportedAt: new Date().toISOString() }, null, 2);
  }

  ALH.config = {
    CONFIG_VERSION,
    VISIBILITIES,
    VISIBILITY_LABELS,
    SWITCH_ORDERS,
    DEFAULT_SETTINGS,
    DEFAULT_TITLE_TEMPLATE,
    DEFAULT_DESCRIPTION_TEMPLATE,
    newTableId,
    defaultTable,
    normalizeTable,
    normalizeSettings,
    normalizeConfig,
    validateTable,
    upsertTable,
    removeTable,
    parseImportedConfig,
    exportConfig,
  };
})(globalThis);
