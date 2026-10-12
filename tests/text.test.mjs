import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../arena-live-helper/shared/text.js';

const T = globalThis.ALH.text;

test('normText gộp khoảng trắng, bỏ nbsp, chuẩn NFC', () => {
  const decomposed = 'Bàn 3'; // "Bàn" dạng tổ hợp
  assert.equal(T.normText(`  ${decomposed}  `), 'bàn 3');
  assert.equal(T.normText(null), '');
});

test('textMatches theo exact / contains / startsWith', () => {
  assert.equal(T.textMatches('Công khai', ['Công khai']), true);
  assert.equal(T.textMatches('Không công khai', ['Công khai']), false);
  assert.equal(T.textMatches('Không công khai', ['Công khai'], 'contains'), true);
  assert.equal(T.textMatches('Lên lịch phát trực tiếp', ['lên lịch'], 'startsWith'), true);
  assert.equal(T.textMatches('', ['x']), false);
  assert.equal(T.textMatches('x', ['', null]), false);
});

test('matchesKeyName không nhầm Ban 1 với Ban 10', () => {
  assert.equal(T.matchesKeyName('Ban 10 (RTMP, Variable)', 'Ban 1'), false);
  assert.equal(T.matchesKeyName('Ban 1 (RTMP, Variable)', 'Ban 1'), true);
});

test('matchesKeyName không nhận "-" làm ranh giới', () => {
  assert.equal(T.matchesKeyName('Ban 3 - Arena Q7', 'Ban 3'), false);
  assert.equal(T.matchesKeyName('Ban 3 - Arena Q7 (RTMP, Variable)', 'Ban 3 - Arena Q7'), true);
  assert.equal(T.matchesKeyName('Ban 3 - Arena Q7', 'Ban 3 - Arena Q7'), true);
});

test('matchesKeyName xét từng dòng, bỏ qua hoa thường', () => {
  assert.equal(T.matchesKeyName('Khóa luồng\nban 3 - arena q7 · RTMP', 'Ban 3 - Arena Q7'), true);
  assert.equal(T.matchesKeyName('anything', ''), false);
});

test('extractVideoId đọc mọi dạng link', () => {
  assert.equal(T.extractVideoId('https://studio.youtube.com/video/abcDEF12345/livestreaming'), 'abcDEF12345');
  assert.equal(T.extractVideoId('/video/abc-EF_1234/edit'), 'abc-EF_1234');
  assert.equal(T.extractVideoId('https://www.youtube.com/watch?v=abcDEF12345&t=1'), 'abcDEF12345');
  assert.equal(T.extractVideoId('https://youtu.be/abcDEF12345'), 'abcDEF12345');
  assert.equal(T.extractVideoId('https://i.ytimg.com/vi/abcDEF12345/mqdefault.jpg'), 'abcDEF12345');
  assert.equal(T.extractVideoId('https://www.youtube.com/live/abcDEF12345?si=x'), 'abcDEF12345');
  assert.equal(T.extractVideoId('/video/short/edit'), null);
  assert.equal(T.extractVideoId(undefined), null);
});

test('extractChannelId', () => {
  const id = 'UC' + 'a'.repeat(22);
  assert.equal(T.extractChannelId(`https://studio.youtube.com/channel/${id}/livestreaming/manage`), id);
  assert.equal(T.extractChannelId(`https://studio.youtube.com/channel/${id}`), id);
  assert.equal(T.extractChannelId('https://studio.youtube.com/video/abc/livestreaming'), null);
});

test('classifyStatus xét "đã kết thúc" trước "trực tiếp"', () => {
  const kw = {
    ended: ['Đã phát trực tiếp', 'Đã kết thúc'],
    scheduled: ['Đã lên lịch', 'Scheduled'],
    waiting: ['Đang chờ kết nối'],
    live: ['Trực tiếp', 'Live'],
  };
  assert.equal(T.classifyStatus('Đã phát trực tiếp', kw), 'ended');
  assert.equal(T.classifyStatus('TRỰC TIẾP', kw), 'live');
  assert.equal(T.classifyStatus('Scheduled for 20:00', kw), 'scheduled');
  assert.equal(T.classifyStatus('Đang chờ kết nối...', kw), 'waiting');
  assert.equal(T.classifyStatus('???', kw), 'unknown');
  assert.equal(T.classifyStatus('', kw), 'unknown');
  assert.equal(T.classifyStatus('Live', undefined), 'unknown');
});

test('containsPhrase so cả cụm, không khớp giữa từ', () => {
  assert.equal(T.containsPhrase('Recommended for you', 'Ended'), false);
  assert.equal(T.containsPhrase('Stream ended.', 'Ended'), true);
  assert.equal(T.containsPhrase('Livestream', 'Live'), false);
  assert.equal(T.containsPhrase('● LIVE', 'Live'), true);
  assert.equal(T.containsPhrase('Đang phát trực tiếp', 'trực tiếp'), true);
  assert.equal(T.containsPhrase('Trực tiếpx', 'trực tiếp'), false);
  assert.equal(T.containsPhrase('a+b (x)', 'b (x)'), true, 'ký tự regex được escape');
  assert.equal(T.containsPhrase('abc', ''), false);
});

test('sameContent bỏ qua khoảng trắng do contenteditable sinh ra', () => {
  assert.equal(T.sameContent('a\nb', 'a  \r\nb\n'), true);
  assert.equal(T.sameContent('a\n\nb', 'a\n\n\n\nb'), true);
  assert.equal(T.sameContent('a b', 'a b'), true);
  assert.equal(T.sameContent('a', 'b'), false);
});

test('sameStudioPath bỏ query, hash, dấu / cuối', () => {
  assert.equal(T.sameStudioPath('https://studio.youtube.com/video/x/livestreaming/?a=1#h', 'https://studio.youtube.com/video/x/livestreaming'), true);
  assert.equal(T.sameStudioPath('https://studio.youtube.com/video/x/livestreaming', 'https://studio.youtube.com/video/y/livestreaming'), false);
  assert.equal(T.sameStudioPath('not a url', 'not a url'), true);
});

test('fillUrl thay biến và báo thiếu', () => {
  assert.equal(T.fillUrl('https://x/{a}/{b}', { a: 'UC1', b: 'v 2' }), 'https://x/UC1/v%202');
  assert.throws(() => T.fillUrl('https://x/{a}', {}), /Thiếu giá trị "a"/);
});

test('shorten cắt chuỗi dài', () => {
  assert.equal(T.shorten('abc', 5), 'abc');
  assert.equal(T.shorten('abcdefgh', 5), 'abcd…');
});
