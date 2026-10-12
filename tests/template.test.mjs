import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../arena-live-helper/shared/template.js';

const T = globalThis.ALH.template;
const NOW = new Date(2026, 9, 5, 9, 7); // 05/10/2026 09:07

test('buildVars định dạng ngày dd/mm/yyyy và giờ HH:mm', () => {
  const v = T.buildVars('Bàn 3', { giai: 'Arena Open', a: 'An' }, NOW);
  assert.equal(v.ngay, '05/10/2026');
  assert.equal(v.gio, '09:07');
  assert.equal(v.ban, 'Bàn 3');
  assert.equal(v.b, '');
});

test('renderTemplate thay biến, giữ biến lạ', () => {
  const v = T.buildVars('Bàn 3', { a: 'An', b: 'Bình' }, NOW);
  assert.equal(T.renderTemplate('{a} vs {b} {xyz}', v), 'An vs Bình {xyz}');
});

test('renderTitle đủ biến', () => {
  const v = T.buildVars('Bàn 3', { giai: 'Arena Open', vong: 'Tứ kết', a: 'An', b: 'Bình' }, NOW);
  assert.equal(T.renderTitle('{giai} – {vong} – {a} vs {b} – {ban}', v), 'Arena Open – Tứ kết – An vs Bình – Bàn 3');
});

test('cleanTitle bỏ đoạn rỗng giữa dấu phân cách', () => {
  assert.equal(T.cleanTitle('Arena Open –  – An vs Bình – Bàn 3'), 'Arena Open – An vs Bình – Bàn 3');
  assert.equal(T.cleanTitle(' – Tứ kết – An vs Bình'), 'Tứ kết – An vs Bình');
  assert.equal(T.cleanTitle('Arena Open – Tứ kết – '), 'Arena Open – Tứ kết');
});

test('cleanTitle bỏ "vs" mồ côi khi thiếu VĐV', () => {
  assert.equal(T.cleanTitle('Arena Open – vs – Bàn 3'), 'Arena Open – Bàn 3');
  assert.equal(T.cleanTitle('Arena Open – An vs – Bàn 3'), 'Arena Open – An – Bàn 3');
  assert.equal(T.cleanTitle('vs Bình | Bàn 3'), 'Bình | Bàn 3');
});

test('cleanTitle giữ dấu gạch nối trong chữ và dấu phân cách gốc', () => {
  assert.equal(T.cleanTitle('Q7-A | Tứ kết – An vs Bình'), 'Q7-A | Tứ kết – An vs Bình');
});

test('renderDescription bỏ khoảng trắng cuối dòng và đầu/cuối', () => {
  const v = T.buildVars('Bàn 3', { a: 'An', b: 'Bình', ghichu: '' }, NOW);
  assert.equal(T.renderDescription('{a} vs {b}   \r\n{ban}\n\n{ghichu}\n', v), 'An vs Bình\nBàn 3');
});

test('validateTitle bắt trống, quá dài, ký tự < >, biến sót', () => {
  assert.deepEqual(T.validateTitle('Ổn'), []);
  assert.match(T.validateTitle('  ')[0], /trống/);
  assert.match(T.validateTitle('x'.repeat(101))[0], /101\/100/);
  assert.match(T.validateTitle('a <b>')[0], /< hoặc >/);
  assert.match(T.validateTitle('{giai} x')[0], /\{giai\}/);
});

test('validateDescription bắt quá dài và ký tự < >', () => {
  assert.deepEqual(T.validateDescription('ok'), []);
  assert.equal(T.validateDescription('x'.repeat(5001)).length, 1);
  assert.equal(T.validateDescription('<').length, 1);
});
