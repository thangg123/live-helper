// Giả lập chrome.* để mở sidepanel/index.html trong trình duyệt thường (xem giao diện, bấm thử luồng).
// Dùng: page.addInitScript(nội dung file này) rồi mở http://localhost:PORT/arena-live-helper/sidepanel/index.html
(function () {
  const CH = 'UC' + 'x'.repeat(22);
  const table = (id, n, key, extra = {}) => ({
    id, name: `Bàn ${n}`, streamKeyName: key, titleTemplate: '{giai} – {vong} – {a} vs {b} – {ban}',
    descriptionTemplate: '{giai} – {vong}\n{a} vs {b}\n{ban} · {ngay} {gio}\n\n{ghichu}',
    visibility: 'PUBLIC', playlist: '', category: 'Thể thao', madeForKids: false, autoStart: true, autoStop: true, ...extra,
  });
  const data = {
    config: {
      version: 1,
      tables: [table('t1', 1, 'Ban 1 - Arena Q7'), table('t3', 3, 'Ban 3 - Arena Q7', { visibility: 'UNLISTED' })],
      settings: { channelId: '', switchOrder: 'createFirst', liveTimeoutSec: 60 },
    },
    matchForm: { giai: 'Arena Open 2026', vong: 'Tứ kết', a: 'Nguyễn Văn An', b: 'Trần Bình' },
    uiState: { tableId: 't3' },
    detectedChannelId: CH,
  };
  const noopEvent = { addListener() {}, removeListener() {} };
  const rows = [
    { videoId: 'aaaaaaaaaa1', title: 'Arena Open 2026 – Vòng 1/8 – Lê Cường vs Phạm Dũng – Bàn 3', status: 'live', statusText: 'Trực tiếp' },
    { videoId: 'bbbbbbbbbb2', title: 'Arena Open 2026 – Vòng 1/8 – Hoàng Em vs Vũ Phúc – Bàn 1', status: 'live', statusText: 'Trực tiếp' },
    { videoId: 'ccccccccc_3', title: 'Arena Open 2026 – Tứ kết – (chờ) – Bàn 2', status: 'scheduled', statusText: 'Đã lên lịch' },
  ];

  const listeners = [];
  const deliver = (msg) => setTimeout(() => listeners.forEach((fn) => fn(msg)), 0);
  const log = (level, msg, extra) => deliver({ type: 'log', entry: { t: Date.now(), level, msg, source: 'bg', ...extra } });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let confirmResolve = null;

  async function fakeRun(msg) {
    const dry = msg.dryRun;
    deliver({ type: 'runState', running: { id: 'r', flow: msg.flow, dryRun: dry } });
    log('start', `Bắt đầu: ${msg.flow}${dry ? ' — CHẠY THỬ' : ''}`);
    try {
      if (msg.flow === 'listBroadcasts') {
        log('nav', `Mở /channel/${CH}/livestreaming/manage`);
        await wait(400);
        log('step', '▶ Đọc danh sách luồng');
        await wait(300);
        log('ok', '✓ Đọc danh sách luồng');
        return { ok: true, result: rows };
      }
      if (msg.flow === 'switchMatch') {
        log('step', '▶ Đọc stream key của “Arena Open 2026 – Vòng 1/8 – Lê Cường…”');
        await wait(400);
        log('ok', 'Luồng cũ của bàn: “Arena Open 2026 – Vòng 1/8 – Lê Cường vs Phạm Dũng – Bàn 3” (aaaaaaaaaa1)');
        deliver({ type: 'confirm', id: 'c1', title: 'Chuyển trận?', message: `Sẽ KẾT THÚC luồng đang live:\n“${rows[0].title}” (aaaaaaaaaa1)\n\nvà tạo luồng mới cho Bàn 3:\n“${msg.args.title}”`, okText: 'Chuyển trận', danger: true, dryRun: dry });
        const ok = await new Promise((r) => (confirmResolve = r));
        if (!ok) {
          log('warn', '■ Đã huỷ — không xác nhận.');
          return { ok: false, error: { kind: 'cancelled', message: 'Đã huỷ — không xác nhận.' } };
        }
        if (dry) {
          log('dry', '[Chạy thử] Sẽ bấm: Lên lịch phát trực tiếp');
          log('dry', 'Chạy thử dừng ở "Ô tiêu đề (contenteditable)": phần này chỉ hiện sau khi bấm thật "Lên lịch phát trực tiếp".');
          return { ok: true, result: { dryRunStopped: true, message: 'x' } };
        }
        for (const s of ['Bấm "Lên lịch phát trực tiếp"', 'Nhập tiêu đề', 'Nhập mô tả', 'Chọn stream key "Ban 3 - Arena Q7"', 'Bấm "Kết thúc phát trực tiếp"']) {
          log('step', `▶ ${s}`);
          await wait(250);
          log('ok', `✓ ${s}`);
        }
        log('error', '✗ Không tìm thấy Nút xác nhận "Kết thúc" trong hộp thoại sau 10 giây (không có dialog nào đang mở).', {
          step: 'Xác nhận trong hộp thoại', selector: 'controlRoom.endConfirmButton', url: 'https://studio.youtube.com/video/aaaaaaaaaa1/livestreaming',
        });
        log('ok', 'Luồng mới đang live');
        return { ok: true, result: { old: rows[0], oldEnded: true, live: true, created: { videoId: 'NEWNEWNEW01', title: msg.args.title, watchUrl: 'https://www.youtube.com/watch?v=NEWNEWNEW01', studioUrl: 'https://studio.youtube.com/video/NEWNEWNEW01/livestreaming' } } };
      }
      await wait(600);
      return { ok: false, error: { kind: 'step', message: 'Giả lập: luồng này chưa mô phỏng.' } };
    } finally {
      log('done', `Xong: ${msg.flow}`);
      deliver({ type: 'runState', running: null });
    }
  }

  const port = {
    onMessage: { addListener: (fn) => listeners.push(fn) },
    onDisconnect: noopEvent,
    postMessage(msg) {
      if (msg.type === 'run') fakeRun(msg).then((r) => deliver({ type: 'reply', reqId: msg.reqId, ...r }));
      else if (msg.type === 'confirmReply' && confirmResolve) confirmResolve(msg.ok);
      else if (msg.type === 'tool') {
        const result = msg.name === 'checkSelectors'
          ? { url: 'x', page: 'quan-ly', dialogOpen: false, menuOpen: false, results: [
              { key: 'manage.createButton', desc: 'Nút "Lên lịch phát trực tiếp" ở trang Quản lý', found: true, via: 'chữ "Lên lịch phát trực tiếp"' },
              { key: 'manage.row', desc: 'Một dòng trong danh sách luồng', found: true, via: 'css ytcp-video-row' },
              { key: 'details.titleBox', desc: 'Ô tiêu đề (contenteditable)', found: false, reason: 'không có dialog nào đang mở', within: 'dialog' },
              { key: 'controlRoom.endButton', desc: 'Nút "Kết thúc phát trực tiếp"', found: false, reason: 'không khớp css / aria-label / chữ nào' },
            ] }
          : { cleared: 0 };
        setTimeout(() => deliver({ type: 'reply', reqId: msg.reqId, ok: true, result }), 300);
      }
    },
  };

  window.chrome = {
    runtime: { id: 'fake', connect: () => (setTimeout(() => deliver({ type: 'hello', running: null, logs: [] }), 0), port) },
    storage: {
      local: {
        get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, data[k]])),
        set: async (obj) => Object.assign(data, obj),
      },
      onChanged: noopEvent,
    },
    windows: { getCurrent: async () => ({ id: 1 }) },
    tabs: {
      query: async () => [{ id: 9, windowId: 1, active: true, url: `https://studio.youtube.com/channel/${CH}/livestreaming/manage` }],
      update: async () => ({}),
      create: async () => ({}),
      onUpdated: noopEvent,
      onActivated: noopEvent,
      onRemoved: noopEvent,
    },
  };
})();
