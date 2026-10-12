// Trạng thái side panel: một object bất biến, mỗi lần đổi tạo bản mới rồi báo cho các phần giao diện.
let state = {
  config: { version: 1, tables: [], settings: {} },
  match: {},
  ui: { tableId: null, dryRun: false },
  preview: { manual: false }, // nội dung xem trước nằm trong ô nhập; manual = người dùng đã sửa tay
  streams: null,
  selectedVideoId: null,
  running: null,
  lastResult: null,
  detectedChannelId: '',
  windowId: undefined,
};
const subscribers = new Set();

export const getState = () => state;

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  subscribers.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function currentTable(s = state) {
  return s.config.tables.find((t) => t.id === s.ui.tableId) || s.config.tables[0] || null;
}

export function selectedStream(s = state) {
  return (s.streams || []).find((r) => r.videoId === s.selectedVideoId) || null;
}
