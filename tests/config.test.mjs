import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../arena-live-helper/shared/config.js';

const C = globalThis.ALH.config;

const table = (o = {}) => C.normalizeTable({ id: 't1', name: 'Bàn 1', streamKeyName: 'Ban 1 - Arena', ...o });

test('normalizeTable điền mặc định và luôn đặt madeForKids = false', () => {
  const t = C.normalizeTable({ name: ' Bàn 2 ', madeForKids: true, visibility: 'WRONG' });
  assert.equal(t.name, 'Bàn 2');
  assert.equal(t.madeForKids, false);
  assert.equal(t.visibility, 'PUBLIC');
  assert.equal(t.autoStart, true);
  assert.equal(t.category, 'Thể thao');
  assert.match(t.id, /^t_/);
});

test('normalizeTable giữ giá trị hợp lệ', () => {
  const t = C.normalizeTable({ id: 'x', visibility: 'PRIVATE', autoStop: false, playlist: ' PL ' });
  assert.equal(t.visibility, 'PRIVATE');
  assert.equal(t.autoStop, false);
  assert.equal(t.playlist, 'PL');
});

test('normalizeSettings kiểm tra channel ID, thứ tự, timeout', () => {
  const ok = C.normalizeSettings({ channelId: 'UC' + 'b'.repeat(22), switchOrder: 'endFirst', liveTimeoutSec: 90 });
  assert.equal(ok.switchOrder, 'endFirst');
  assert.equal(ok.liveTimeoutSec, 90);
  const bad = C.normalizeSettings({ channelId: 'abc', switchOrder: 'x', liveTimeoutSec: 5 });
  assert.equal(bad.channelId, '');
  assert.equal(bad.switchOrder, 'createFirst');
  assert.equal(bad.liveTimeoutSec, 60);
  assert.deepEqual(C.normalizeSettings(undefined), { ...C.DEFAULT_SETTINGS });
});

test('normalizeConfig bỏ bàn trùng id và không sửa object gốc', () => {
  const raw = { tables: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] };
  const cfg = C.normalizeConfig(raw);
  assert.equal(cfg.tables.length, 1);
  assert.equal(cfg.tables[0].name, 'A');
  assert.equal(raw.tables.length, 2);
  assert.deepEqual(C.normalizeConfig(null).tables, []);
});

test('validateTable bắt thiếu trường và trùng tên / stream key', () => {
  assert.deepEqual(C.validateTable(table()), []);
  const errs = C.validateTable(C.normalizeTable({ id: 'z', titleTemplate: ' ' }));
  assert.equal(errs.length, 3);
  const other = table({ id: 't2' });
  const dupes = C.validateTable(table(), [other]);
  assert.equal(dupes.length, 2);
  assert.deepEqual(C.validateTable(table(), [table()]), [], 'không tự so với chính nó');
});

test('upsertTable / removeTable trả cấu hình mới', () => {
  const cfg = C.normalizeConfig({ tables: [table()] });
  const added = C.upsertTable(cfg, table({ id: 't2', name: 'Bàn 2', streamKeyName: 'K2' }));
  assert.equal(added.tables.length, 2);
  assert.equal(cfg.tables.length, 1);
  const edited = C.upsertTable(added, table({ name: 'Bàn 1 mới' }));
  assert.equal(edited.tables[0].name, 'Bàn 1 mới');
  assert.equal(C.removeTable(edited, 't1').tables.length, 1);
});

test('exportConfig → parseImportedConfig đi vòng giữ nguyên dữ liệu', () => {
  const cfg = C.normalizeConfig({ tables: [table()], settings: { switchOrder: 'endFirst' } });
  const back = C.parseImportedConfig(C.exportConfig(cfg));
  assert.deepEqual(back.tables, cfg.tables);
  assert.equal(back.settings.switchOrder, 'endFirst');
});

test('parseImportedConfig báo lỗi rõ ràng', () => {
  assert.throws(() => C.parseImportedConfig('{oops'), /JSON hợp lệ/);
  assert.throws(() => C.parseImportedConfig('{"a":1}'), /tables/);
  assert.throws(() => C.parseImportedConfig('{"version":99,"tables":[]}'), /phiên bản 99/);
  assert.throws(() => C.parseImportedConfig('{"tables":[{"name":""}]}'), /bàn lỗi/);
});
