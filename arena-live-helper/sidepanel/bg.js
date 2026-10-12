// Kết nối side panel ↔ background qua một port lâu dài. Tự nối lại khi service worker khởi động lại.
let port = null;
const pending = new Map();
const listeners = new Set();

function onMessage(msg) {
  if (msg && msg.type === 'reply') {
    const p = pending.get(msg.reqId);
    if (!p) return;
    pending.delete(msg.reqId);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(Object.assign(new Error((msg.error && msg.error.message) || 'Lỗi không rõ'), msg.error || {}));
    return;
  }
  listeners.forEach((fn) => fn(msg));
}

function connect() {
  port = chrome.runtime.connect({ name: 'panel' });
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    port = null;
    for (const p of pending.values()) p.reject(new Error('Mất kết nối với background — thử lại.'));
    pending.clear();
    listeners.forEach((fn) => fn({ type: 'disconnected' }));
  });
}

function ensurePort() {
  if (!port) connect();
  return port;
}

export function init() {
  ensurePort();
}

export function on(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function send(msg) {
  ensurePort().postMessage(msg);
}

/** Gửi yêu cầu và chờ background trả lời (`reply` cùng reqId). */
export function request(type, payload = {}) {
  const p = ensurePort();
  const reqId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    p.postMessage({ ...payload, type, reqId });
  });
}
