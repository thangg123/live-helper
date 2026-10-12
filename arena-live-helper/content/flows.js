// Các luồng thao tác. Mỗi luồng là một tập "chặng" (stage); mỗi chặng chạy trọn trong MỘT trang.
// Chặng trả về một chỉ thị cho background (background.js → runFlow):
//   { next, state }            chạy tiếp chặng `next` trên trang hiện tại
//   { goto: url, next }        background mở url (chờ tải xong) rồi chạy chặng `next`
//   { call: {flow, args}, next } chạy luồng con, kết quả nằm ở state.lastResult khi quay lại `next`
//   { confirm: {...}, next }   hỏi xác nhận trong side panel trước khi đi tiếp
//   { done: result }           kết thúc luồng
(function (root) {
  'use strict';
  const ALH = (root.ALH = root.ALH || {});
  const D = ALH.dom;
  const T = ALH.text;
  const { StepError } = D;

  const GO_LIVE_GRACE_MS = 10000; // chờ Tự bắt đầu trước khi tự bấm "Phát trực tiếp"
  const POLL_LIVE_MS = 2000;
  const VIS_KEY = { PUBLIC: 'details.visibilityPublic', UNLISTED: 'details.visibilityUnlisted', PRIVATE: 'details.visibilityPrivate' };
  const VIS_LABEL = { PUBLIC: 'Công khai', UNLISTED: 'Không công khai', PRIVATE: 'Riêng tư' };

  // ── URL ──────────────────────────────────────────────────────────────────────

  function channelIdFromPage() {
    for (const a of D.deepQueryAll('a[href*="/channel/UC"]')) {
      const id = T.extractChannelId(a.href);
      if (id) return id;
    }
    return null;
  }

  function urlManage(ctx) {
    const channelId = ctx.env.channelId || T.extractChannelId(location.href) || channelIdFromPage();
    if (!channelId) throw new StepError('Chưa biết channel ID của kênh. Mở trang chủ Studio một lần hoặc điền channel ID ở tab Cấu hình bàn.');
    return T.fillUrl(ALH.URLS.manage, { channelId });
  }
  const urlControlRoom = (videoId) => T.fillUrl(ALH.URLS.controlRoom, { videoId });
  const urlWatch = (videoId) => T.fillUrl(ALH.URLS.watch, { videoId });

  // ── Đọc danh sách luồng (trang Quản lý) ──────────────────────────────────────

  function videoIdIn(el) {
    for (const a of D.deepQueryAll('a[href]', el)) {
      const id = T.extractVideoId(a.getAttribute('href'));
      if (id) return id;
    }
    for (const img of D.deepQueryAll('img[src]', el)) {
      const id = T.extractVideoId(img.getAttribute('src'));
      if (id) return id;
    }
    return null;
  }

  const firstLine = (s) => String(s || '').split('\n').map((l) => l.trim()).find(Boolean) || '';

  function rowFromElement(row) {
    const videoId = videoIdIn(row);
    if (!videoId) return null;
    const title = firstLine(D.visibleText(D.resolve('manage.rowTitle', { scope: row })));
    const statusEl = D.resolve('manage.rowStatus', { scope: row });
    const statusText = statusEl ? D.visibleText(statusEl) : D.visibleText(row).replace(title, ' ');
    return {
      videoId,
      title,
      status: T.classifyStatus(statusText, ALH.KEYWORDS),
      statusText: T.shorten(statusText, 60),
    };
  }

  /** Dự phòng khi selector dòng hỏng: gom theo link /video/{id}, leo lên tổ tiên lớn nhất chỉ chứa đúng 1 video. */
  function rowsFromLinks() {
    const rows = [];
    const seen = new Set();
    const idOf = (a) => T.extractVideoId(a.getAttribute('href'));
    for (const a of D.deepQueryAll('a[href*="/video/"]').filter((x) => D.isVisible(x))) {
      const id = idOf(a);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      let row = a;
      for (let n = D.parentDeep(a), i = 0; n && i < 8; n = D.parentDeep(n), i++) {
        const ids = new Set(D.deepQueryAll('a[href*="/video/"]', n).map(idOf).filter(Boolean));
        if (ids.size > 1) break;
        row = n;
      }
      const parsed = rowFromElement(row);
      if (parsed) rows.push(parsed);
    }
    return rows;
  }

  function parseRows() {
    const fromRows = D.resolveAll('manage.row').map(rowFromElement).filter(Boolean);
    const rows = fromRows.length ? fromRows : rowsFromLinks();
    const seen = new Set();
    return rows.filter((r) => (seen.has(r.videoId) ? false : (seen.add(r.videoId), true)));
  }

  function pageSaysEmpty() {
    const text = document.body ? document.body.innerText : '';
    return ALH.KEYWORDS.emptyList.some((k) => T.containsPhrase(text, k));
  }

  function readBroadcastRows(ctx) {
    return ctx.step('Đọc danh sách luồng', async () => {
      const found = await D.waitUntil(ctx, () => {
        const rows = parseRows();
        if (rows.length) return rows;
        return pageSaysEmpty() ? 'empty' : null;
      }, { timeout: 15000, label: 'danh sách luồng (hoặc thông báo danh sách trống)', selector: 'manage.row' });
      const rows = found === 'empty' ? [] : found;
      ctx.log('info', `Đọc được ${rows.length} luồng`);
      return rows;
    });
  }

  // ── Phòng điều khiển ─────────────────────────────────────────────────────────

  function readRoomState() {
    const statusEl = D.resolve('controlRoom.status');
    const statusText = statusEl ? D.visibleText(statusEl) : '';
    const endBtn = D.resolve('controlRoom.endButton');
    const goLive = D.resolve('controlRoom.goLiveButton');
    const canGoLive = !!goLive && D.isEnabled(goLive);
    let status = T.classifyStatus(statusText, ALH.KEYWORDS);
    if (status === 'unknown') status = endBtn ? 'live' : goLive ? (canGoLive ? 'ready' : 'waiting') : 'unknown';
    return { status, statusText: T.shorten(statusText, 80), hasEnd: !!endBtn, canGoLive };
  }

  function waitRoomLoaded(ctx) {
    return ctx.step('Chờ phòng điều khiển tải xong', () =>
      D.waitUntil(
        ctx,
        () => ['controlRoom.title', 'controlRoom.endButton', 'controlRoom.goLiveButton', 'controlRoom.streamKeyDropdown'].some((k) => D.resolve(k)),
        { timeout: 20000, label: 'phòng điều khiển (tiêu đề / nút / ô stream key)', selector: 'controlRoom.title' }
      )
    );
  }

  async function readRoomTitle(ctx) {
    return firstLine(D.visibleText(await D.waitFor(ctx, 'controlRoom.title', { timeout: 15000 })));
  }

  async function verifyRoomTitle(ctx, expected) {
    const got = await readRoomTitle(ctx);
    if (T.normText(got) !== T.normText(expected)) {
      throw new StepError(`Tiêu đề trên trang là "${got}", không khớp "${expected}". Dừng để tránh thao tác nhầm luồng.`, {
        selector: 'controlRoom.title',
        url: location.href,
      });
    }
    ctx.log('info', `Tiêu đề khớp: "${T.shorten(got, 60)}"`);
  }

  async function openStreamSettings(ctx) {
    if (D.resolve('controlRoom.streamKeyDropdown')) return;
    const tab = await D.waitFor(ctx, 'controlRoom.streamSettingsTab', { timeout: 5000, optional: true });
    if (tab) await D.click(ctx, tab, 'Tab Cài đặt luồng');
  }

  async function readStreamKeyText(ctx) {
    await openStreamSettings(ctx);
    return D.visibleText(await D.waitFor(ctx, 'controlRoom.streamKeyDropdown', { timeout: 15000 }));
  }

  function selectStreamKey(ctx, keyName) {
    return ctx.step(`Chọn stream key "${keyName}"`, async () => {
      await openStreamSettings(ctx);
      const trigger = await D.waitFor(ctx, 'controlRoom.streamKeyDropdown', { timeout: 15000 });
      if (T.matchesKeyName(D.visibleText(trigger), keyName)) {
        ctx.log('info', 'Stream key đã đúng sẵn');
        return;
      }
      await D.pickMenuItem(ctx, trigger, (t) => T.matchesKeyName(t, keyName), { label: `stream key "${keyName}"` });
      if (ctx.dryRun) return;
      await D.waitUntil(ctx, () => {
        const tr = D.resolve('controlRoom.streamKeyDropdown');
        return tr && T.matchesKeyName(D.visibleText(tr), keyName);
      }, { timeout: 8000, label: `ô stream key hiện "${keyName}"`, selector: 'controlRoom.streamKeyDropdown' });
    });
  }

  async function setToggleByKey(ctx, key, desired, label) {
    await ctx.step(`${desired ? 'Bật' : 'Tắt'} ${label}`, async () => {
      await openStreamSettings(ctx);
      await D.setChecked(ctx, await D.waitFor(ctx, key), desired, label);
    });
  }

  // ── Dialog thông tin luồng ───────────────────────────────────────────────────

  /** Ô checkbox trong popup playlist có nhãn đúng bằng `name`. */
  function findPlaylistCheckbox(name) {
    const popup = D.topMenu() || D.topDialog();
    if (!popup) return null;
    for (const box of D.deepQueryAll(ALH.TOGGLE_CSS, popup).filter((b) => D.isVisible(b))) {
      for (let n = box, i = 0; n && i < 4; i++, n = D.parentDeep(n)) {
        if (T.normText(D.visibleText(n)) === T.normText(name)) return box;
      }
    }
    return null;
  }

  async function choosePlaylist(ctx, name) {
    await D.click(ctx, await D.waitFor(ctx, 'details.playlistTrigger'), 'Ô danh sách phát');
    const box = await D.waitFor(ctx, () => findPlaylistCheckbox(name), { timeout: 8000, label: `playlist "${name}"` });
    await D.setChecked(ctx, box, true, `Playlist "${name}"`);
    await D.click(ctx, await D.waitFor(ctx, 'details.playlistDoneButton', { enabled: true }), 'Xong (playlist)');
  }

  async function chooseCategory(ctx, category) {
    let trigger = D.resolve('details.categoryTrigger');
    if (!trigger) {
      await D.click(ctx, await D.waitFor(ctx, 'details.showMoreButton', { timeout: 5000 }), 'Hiện thêm');
      trigger = await D.waitFor(ctx, 'details.categoryTrigger');
    }
    if (T.textMatches(D.visibleText(trigger), [category], 'contains')) {
      ctx.log('info', `Danh mục đã là "${category}"`);
      return;
    }
    await D.pickMenuItem(ctx, trigger, category, { label: `danh mục "${category}"` });
  }

  async function fillTitleAndDescription(ctx, title, description) {
    await ctx.step('Nhập tiêu đề', async () =>
      D.typeText(ctx, await D.waitFor(ctx, 'details.titleBox', { timeout: 20000 }), title, 'tiêu đề')
    );
    await ctx.step('Nhập mô tả', async () => D.typeText(ctx, await D.waitFor(ctx, 'details.descriptionBox'), description, 'mô tả'));
  }

  async function fillDetails(ctx, { title, description, table }) {
    await fillTitleAndDescription(ctx, title, description);
    if (table.playlist) await ctx.step(`Chọn playlist "${table.playlist}"`, () => choosePlaylist(ctx, table.playlist));
    await ctx.step('Chọn "Không, nội dung này không dành cho trẻ em"', async () =>
      D.setChecked(ctx, await D.waitFor(ctx, 'details.kidsNo'), true, 'Không dành cho trẻ em')
    );
    if (table.category) await ctx.step(`Chọn danh mục "${table.category}"`, () => chooseCategory(ctx, table.category));
  }

  async function goToVisibilityStep(ctx, visKey) {
    for (let i = 0; i < 4 && !D.resolve(visKey); i++) {
      await D.click(ctx, await D.waitFor(ctx, 'details.nextButton', { enabled: true }), 'Tiếp');
      if (ctx.dryRun) return;
      await D.waitFor(ctx, visKey, { timeout: 2500, optional: true });
    }
  }

  /** Sau khi bấm Xong: Studio thường chuyển sang /video/{id}/livestreaming. Không chuyển thì tìm theo tiêu đề. */
  async function waitNewVideoId(ctx, title, beforeUrl) {
    const fromUrl = () =>
      location.href !== beforeUrl && /\/video\/[\w-]{11}\/livestreaming/.test(location.pathname) ? T.extractVideoId(location.pathname) : null;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const id = fromUrl();
      if (id) return id;
      await D.sleep(ctx, 300);
    }
    ctx.log('warn', 'Studio không tự chuyển sang phòng điều khiển, tìm luồng mới theo tiêu đề');
    const match = parseRows().find((r) => T.normText(r.title) === T.normText(title));
    if (match) return match.videoId;
    throw new StepError(`Đã bấm Xong nhưng không tìm thấy luồng mới "${title}".`, { url: location.href });
  }

  // ── Các luồng ────────────────────────────────────────────────────────────────

  const listBroadcasts = {
    start: (st, ctx) => ({ goto: urlManage(ctx), next: 'read' }),
    async read(st, ctx) {
      const rows = (await readBroadcastRows(ctx)).filter((r) => r.status !== 'ended');
      return { done: rows };
    },
  };

  const createBroadcast = {
    start: (st, ctx) => ({ goto: urlManage(ctx), next: 'open' }),

    async open(st, ctx) {
      const { title, description, table } = st.args;
      await ctx.step('Bấm "Lên lịch phát trực tiếp"', async () =>
        D.click(ctx, await D.waitFor(ctx, 'manage.createButton', { timeout: 20000, enabled: true }), 'Lên lịch phát trực tiếp')
      );
      await ctx.step('Chọn "Tạo mới" nếu Studio hỏi dùng lại cài đặt', async () => {
        const btn = await D.waitFor(ctx, 'reuse.createNewButton', { timeout: 4000, optional: true });
        if (btn) await D.click(ctx, btn, 'Tạo mới');
        else ctx.log('info', 'Không có hộp dùng lại cài đặt');
      });
      await fillDetails(ctx, { title, description, table });
      const visKey = VIS_KEY[table.visibility] || VIS_KEY.PUBLIC;
      const visLabel = VIS_LABEL[table.visibility] || VIS_LABEL.PUBLIC;
      await ctx.step('Tới bước Chế độ hiển thị', () => goToVisibilityStep(ctx, visKey));
      await ctx.step(`Chọn chế độ hiển thị "${visLabel}"`, async () => D.setChecked(ctx, await D.waitFor(ctx, visKey), true, visLabel));
      const beforeUrl = location.href;
      await ctx.step('Bấm "Xong"', async () => D.click(ctx, await D.waitFor(ctx, 'details.doneButton', { enabled: true }), 'Xong'));
      const videoId = await ctx.step('Chờ Studio tạo luồng', () => waitNewVideoId(ctx, title, beforeUrl));
      ctx.log('ok', `Đã tạo luồng ${videoId}`);
      return { state: { ...st, videoId }, goto: urlControlRoom(videoId), next: 'configure' };
    },

    async configure(st, ctx) {
      const { title, table } = st.args;
      await waitRoomLoaded(ctx);
      await selectStreamKey(ctx, table.streamKeyName);
      await setToggleByKey(ctx, 'controlRoom.autoStartToggle', table.autoStart, 'Tự bắt đầu');
      await setToggleByKey(ctx, 'controlRoom.autoStopToggle', table.autoStop, 'Tự kết thúc');
      await ctx.step('Đọc lại tiêu đề và stream key', async () => {
        await verifyRoomTitle(ctx, title);
        const keyText = await readStreamKeyText(ctx);
        if (!T.matchesKeyName(keyText, table.streamKeyName)) {
          throw new StepError(`Stream key trên trang là "${T.shorten(keyText, 60)}", không phải "${table.streamKeyName}".`, {
            selector: 'controlRoom.streamKeyDropdown',
            url: location.href,
          });
        }
      });
      return {
        done: { videoId: st.videoId, title, watchUrl: urlWatch(st.videoId), studioUrl: urlControlRoom(st.videoId) },
      };
    },
  };

  const endBroadcast = {
    start: (st) => ({ goto: urlControlRoom(st.args.videoId), next: 'end' }),

    async end(st, ctx) {
      const { videoId, expectedTitle } = st.args;
      await waitRoomLoaded(ctx);
      if (expectedTitle) await ctx.step('Kiểm tra đúng luồng đã chọn', () => verifyRoomTitle(ctx, expectedTitle));
      if (readRoomState().status === 'ended') {
        ctx.log('warn', 'Luồng này đã kết thúc từ trước');
        return { done: { videoId, ended: true, alreadyEnded: true } };
      }
      await ctx.step('Bấm "Kết thúc phát trực tiếp"', async () =>
        D.click(ctx, await D.waitFor(ctx, 'controlRoom.endButton', { enabled: true, timeout: 15000 }), 'Kết thúc phát trực tiếp')
      );
      await ctx.step('Xác nhận trong hộp thoại', async () =>
        D.click(ctx, await D.waitFor(ctx, 'controlRoom.endConfirmButton', { enabled: true }), 'Xác nhận Kết thúc')
      );
      await ctx.step('Chờ trạng thái "đã kết thúc"', () =>
        D.waitUntil(ctx, () => {
          const s = readRoomState();
          return s.status === 'ended' || (!s.hasEnd && s.status !== 'live');
        }, { timeout: 30000, label: 'luồng chuyển sang đã kết thúc', selector: 'controlRoom.status' })
      );
      return { done: { videoId, ended: true } };
    },
  };

  const editInfo = {
    start: (st) => ({ goto: urlControlRoom(st.args.videoId), next: 'edit' }),

    async edit(st, ctx) {
      const { videoId, title, description, expectedTitle } = st.args;
      await waitRoomLoaded(ctx);
      if (expectedTitle) await ctx.step('Kiểm tra đúng luồng đã chọn', () => verifyRoomTitle(ctx, expectedTitle));
      await ctx.step('Bấm "Chỉnh sửa"', async () => D.click(ctx, await D.waitFor(ctx, 'controlRoom.editButton', { enabled: true }), 'Chỉnh sửa'));
      await fillTitleAndDescription(ctx, title, description);
      await ctx.step('Bấm "Lưu"', async () => D.click(ctx, await D.waitFor(ctx, 'details.saveButton', { enabled: true }), 'Lưu'));
      await ctx.step('Chờ hộp chỉnh sửa đóng', () =>
        D.waitUntil(ctx, () => !D.resolve('details.titleBox'), { timeout: 15000, label: 'hộp chỉnh sửa đóng lại', selector: 'details.titleBox' })
      );
      await ctx.step('Đọc lại tiêu đề trên trang', () =>
        D.waitUntil(ctx, () => {
          const el = D.resolve('controlRoom.title');
          return el && T.normText(firstLine(D.visibleText(el))) === T.normText(title);
        }, { timeout: 10000, label: `tiêu đề trên trang đổi thành "${T.shorten(title, 50)}"`, selector: 'controlRoom.title' })
      );
      return { done: { videoId, title } };
    },
  };

  // Chuyển trận: tìm luồng đang live của bàn → xác nhận → tạo mới + kết thúc cũ (thứ tự theo cấu hình) → chờ live.
  function checkNextCandidate(st) {
    if (!st.queue.length) return confirmSwitch({ ...st, old: null });
    return { state: st, goto: urlControlRoom(st.queue[0].videoId), next: 'checkKey' };
  }

  function confirmSwitch(st) {
    const { table, title } = st.args;
    const confirm = st.old
      ? {
          title: 'Chuyển trận?',
          message: `Sẽ KẾT THÚC luồng đang live:\n“${st.old.title}” (${st.old.videoId})\n\nvà tạo luồng mới cho ${table.name}:\n“${title}”`,
          okText: 'Chuyển trận',
          danger: true,
        }
      : {
          title: 'Không thấy luồng cũ',
          message: `Không có luồng đang live nào dùng stream key “${table.streamKeyName}”.\nVẫn tạo luồng mới “${title}”?`,
          okText: 'Tạo luồng mới',
          danger: false,
        };
    return { state: st, confirm, next: 'run' };
  }

  const createCall = (st) => ({
    flow: 'createBroadcast',
    args: { table: st.args.table, title: st.args.title, description: st.args.description },
  });
  const endCall = (st) => ({ flow: 'endBroadcast', args: { videoId: st.old.videoId, expectedTitle: st.old.title } });

  const switchMatch = {
    start: (st, ctx) => ({ goto: urlManage(ctx), next: 'scan' }),

    async scan(st, ctx) {
      const live = (await readBroadcastRows(ctx)).filter((r) => r.status === 'live');
      ctx.log('info', `${live.length} luồng đang live — tìm luồng dùng key "${st.args.table.streamKeyName}"`);
      return checkNextCandidate({ ...st, queue: live });
    },

    async checkKey(st, ctx) {
      const [current, ...rest] = st.queue;
      await waitRoomLoaded(ctx);
      const keyText = await ctx.step(`Đọc stream key của “${T.shorten(current.title, 50)}”`, () => readStreamKeyText(ctx));
      if (T.matchesKeyName(keyText, st.args.table.streamKeyName)) {
        ctx.log('ok', `Luồng cũ của bàn: “${current.title}” (${current.videoId})`);
        return confirmSwitch({ ...st, queue: [], old: current });
      }
      ctx.log('info', `“${T.shorten(current.title, 50)}” dùng key khác (${T.shorten(keyText, 40)})`);
      return checkNextCandidate({ ...st, queue: rest });
    },

    run(st) {
      if (st.args.order === 'endFirst' && st.old) return { call: endCall(st), next: 'afterEndFirst' };
      return { call: createCall(st), next: 'afterCreate' };
    },

    afterEndFirst: (st) => ({ state: { ...st, oldEnded: true }, call: createCall(st), next: 'afterCreate' }),

    afterCreate(st) {
      const next = { ...st, created: st.lastResult };
      if (st.old && !st.oldEnded) return { state: next, call: endCall(st), next: 'afterEnd' };
      return { state: next, goto: urlControlRoom(next.created.videoId), next: 'waitLive' };
    },

    afterEnd: (st) => ({ state: { ...st, oldEnded: true }, goto: urlControlRoom(st.created.videoId), next: 'waitLive' }),

    async waitLive(st, ctx) {
      await waitRoomLoaded(ctx);
      const sec = st.args.liveTimeoutSec || 60;
      ctx.log('info', `Chờ luồng mới lên live (tối đa ${sec} giây)…`);
      const now = Date.now();
      return { state: { ...st, liveDeadline: now + sec * 1000, goLiveAfter: now + GO_LIVE_GRACE_MS, lastLogAt: now }, next: 'pollLive' };
    },

    async pollLive(st, ctx) {
      const s = readRoomState();
      if (s.status === 'live') {
        ctx.log('ok', 'Luồng mới đang live');
        return { done: { old: st.old, oldEnded: !!st.oldEnded, created: st.created, live: true } };
      }
      if (Date.now() > st.liveDeadline) {
        throw new StepError(
          `Luồng mới chưa lên live sau ${st.args.liveTimeoutSec || 60} giây (trạng thái: ${s.statusText || s.status}). Kiểm tra encoder hoặc bấm "Phát trực tiếp" tay.`,
          { selector: 'controlRoom.status', url: location.href }
        );
      }
      let { clickedGoLive, lastLogAt } = st;
      if (!clickedGoLive && s.canGoLive && Date.now() >= st.goLiveAfter) {
        await ctx.step('Tự bắt đầu chưa chạy — bấm "Phát trực tiếp"', () => D.click(ctx, D.resolve('controlRoom.goLiveButton'), 'Phát trực tiếp'));
        clickedGoLive = true;
      }
      if (Date.now() - lastLogAt > 10000) {
        ctx.log('info', `Đang chờ… trạng thái: ${s.statusText || s.status}`);
        lastLogAt = Date.now();
      }
      await D.sleep(ctx, POLL_LIVE_MS);
      return { state: { ...st, clickedGoLive, lastLogAt }, next: 'pollLive' };
    },
  };

  ALH.flows = { listBroadcasts, createBroadcast, endBroadcast, editInfo, switchMatch };

  // Dùng cho nút "Đọc dữ liệu trang" ở tab Selector (không chờ, không bấm).
  ALH.flowProbe = function probe() {
    const onRoom = /\/video\/[\w-]{11}\/livestreaming/.test(location.pathname);
    const titleEl = D.resolve('controlRoom.title');
    const keyEl = D.resolve('controlRoom.streamKeyDropdown');
    return {
      url: location.href,
      page: onRoom ? 'controlRoom' : /\/livestreaming/.test(location.pathname) ? 'livestreaming' : 'other',
      channelId: T.extractChannelId(location.href) || channelIdFromPage(),
      rows: onRoom ? undefined : parseRows(),
      room: onRoom
        ? {
            title: titleEl ? firstLine(D.visibleText(titleEl)) : null,
            streamKeyText: keyEl ? T.shorten(D.visibleText(keyEl), 80) : null,
            ...readRoomState(),
            autoStart: D.readChecked(D.resolve('controlRoom.autoStartToggle')),
            autoStop: D.readChecked(D.resolve('controlRoom.autoStopToggle')),
          }
        : undefined,
    };
  };
})(globalThis);
