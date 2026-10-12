// Studio giả + bộ chạy luồng trong trang (thay cho background.js). Xem mock-studio.html.
(function () {
  'use strict';
  const CH = 'UC' + 'm'.repeat(22);
  const origin = location.origin;
  ALH.URLS = {
    ...ALH.URLS,
    root: `${origin}/`,
    manage: `${origin}/channel/{channelId}/livestreaming/manage`,
    controlRoom: `${origin}/video/{videoId}/livestreaming`,
  };

  const freshDb = () => ({
    streams: [
      { id: 'aaaaaaaaaa1', title: 'Trận cũ Bàn 3', status: 'live', key: 'Ban 3 - Arena Q7', autoStart: true, autoStop: true },
      { id: 'ccccccccc_3', title: 'Trận Bàn 10', status: 'live', key: 'Ban 10 - Arena Q7', autoStart: true, autoStop: true },
      { id: 'bbbbbbbbbb2', title: 'Trận Bàn 1', status: 'live', key: 'Ban 1 - Arena Q7', autoStart: true, autoStop: true },
      { id: 'ddddddddd_4', title: 'Trận đã xong', status: 'ended', key: 'Ban 2 - Arena Q7' },
    ],
    keys: ['Default stream key', 'Ban 1 - Arena Q7', 'Ban 10 - Arena Q7', 'Ban 3 - Arena Q7'],
    signalKeys: ['Ban 1 - Arena Q7', 'Ban 3 - Arena Q7', 'Ban 10 - Arena Q7'], // encoder đang đẩy
    brokenEnd: false,
    nextId: 1,
  });
  let db = freshDb();

  const app = document.getElementById('app');
  const html = (s) => {
    const t = document.createElement('template');
    t.innerHTML = s.trim();
    return t.content.firstElementChild;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STATUS_TEXT = { live: 'Trực tiếp', waiting: 'Đang chờ kết nối', ended: 'Đã kết thúc phát trực tiếp', scheduled: 'Đã lên lịch' };
  const find = (id) => db.streams.find((s) => s.id === id);

  function go(url) {
    document.querySelectorAll('.overlay').forEach((o) => o.remove());
    history.pushState({}, '', url);
    render();
  }

  function render() {
    const m = location.pathname.match(/\/video\/([\w-]{11})\/livestreaming/);
    if (m) return renderRoom(m[1]);
    if (/\/livestreaming\/manage/.test(location.pathname)) return renderManage();
    app.replaceChildren(html('<p>Trang chủ Studio giả</p>'));
  }

  // ── Trang Quản lý ──────────────────────────────────────────────────────────
  function renderManage() {
    const rows = db.streams
      .map((s) => `<ytcp-video-row><a id="video-title" href="/video/${s.id}/livestreaming">${s.title}</a> <span class="status">${STATUS_TEXT[s.status]}</span></ytcp-video-row>`)
      .join('');
    app.replaceChildren(html(`<div><h1>Quản lý</h1><ytcp-button><button>Lên lịch phát trực tiếp</button></ytcp-button><div>${rows}</div></div>`));
    app.querySelector('ytcp-button button').addEventListener('click', () => setTimeout(openReuse, 300));
  }

  function openReuse() {
    const d = html('<tp-yt-paper-dialog class="overlay"><p>Dùng lại chế độ cài đặt?</p><ytcp-button><button>Tạo mới</button></ytcp-button></tp-yt-paper-dialog>');
    d.querySelector('button').addEventListener('click', () => {
      d.remove();
      setTimeout(() => openDetails({ mode: 'create' }), 300);
    });
    document.body.append(d);
  }

  // ── Dialog thông tin (tạo / sửa) ───────────────────────────────────────────
  function radio(name, label, checked = false) {
    return `<tp-yt-paper-radio-button name="${name}" aria-checked="${checked}"><div role="radio"></div> ${label}</tp-yt-paper-radio-button>`;
  }

  function openDetails({ mode, stream }) {
    const model = { title: stream ? stream.title : '', description: '', kids: null, category: 'Giải trí', visibility: null };
    const d = html(`<ytcp-uploads-dialog class="overlay">
      <div id="step1">
        <ytcp-social-suggestions-textbox id="title-textarea"></ytcp-social-suggestions-textbox>
        <div id="description-textarea"><div id="textbox" contenteditable="true" aria-label="Giới thiệu về video của bạn cho người xem"></div></div>
        ${mode === 'create' ? radio('VIDEO_MADE_FOR_KIDS_MFK', 'Có, nội dung này dành cho trẻ em') + radio('VIDEO_MADE_FOR_KIDS_NOT_MFK', 'Không, nội dung này không dành cho trẻ em') : ''}
        <button id="toggle-button">Hiện thêm</button>
        <div id="more" class="hidden"><ytcp-form-select id="category"><span>Danh mục</span><ytcp-dropdown-trigger aria-haspopup="true">Giải trí</ytcp-dropdown-trigger></ytcp-form-select></div>
      </div>
      <div id="step2" class="hidden">Tuỳ chỉnh</div>
      <div id="step3" class="hidden">${radio('PRIVATE', 'Riêng tư')}${radio('UNLISTED', 'Không công khai')}${radio('PUBLIC', 'Công khai')}</div>
      ${mode === 'create' ? '<ytcp-button id="next-button" disabled><button>Tiếp</button></ytcp-button><ytcp-button id="done-button" class="hidden"><button>Xong</button></ytcp-button>' : '<ytcp-button id="save-button"><button>Lưu</button></ytcp-button>'}
    </ytcp-uploads-dialog>`);
    // tiêu đề nằm trong shadow root (kiểm tra selector xuyên " >>> ")
    const host = d.querySelector('#title-textarea');
    host.attachShadow({ mode: 'open' }).innerHTML = '<div id="textbox" contenteditable="true" aria-label="Thêm tiêu đề để mô tả video của bạn" style="display:block;min-height:20px;border:1px solid #aaa"></div>';
    const titleBox = host.shadowRoot.querySelector('#textbox');
    titleBox.textContent = model.title;
    const next = d.querySelector('#next-button');
    const sync = () => next && next.toggleAttribute('disabled', !model.title.trim());
    titleBox.addEventListener('input', () => { model.title = titleBox.innerText; sync(); });
    const desc = d.querySelector('#description-textarea #textbox');
    desc.addEventListener('input', () => (model.description = desc.innerText));
    d.querySelectorAll('tp-yt-paper-radio-button').forEach((r) =>
      r.addEventListener('click', () => {
        const group = r.getAttribute('name').startsWith('VIDEO_MADE') ? 'kids' : 'visibility';
        d.querySelectorAll('tp-yt-paper-radio-button').forEach((o) => {
          if ((o.getAttribute('name').startsWith('VIDEO_MADE') ? 'kids' : 'visibility') === group) o.setAttribute('aria-checked', String(o === r));
        });
        model[group] = r.getAttribute('name');
      })
    );
    d.querySelector('#toggle-button').addEventListener('click', () => d.querySelector('#more').classList.remove('hidden'));
    const trigger = d.querySelector('ytcp-dropdown-trigger');
    trigger.addEventListener('click', () => openMenu(['Giải trí', 'Thể thao', 'Trò chơi'], (v) => { model.category = v; trigger.textContent = v; }));
    let step = 1;
    if (next) next.addEventListener('click', () => {
      if (next.hasAttribute('disabled')) return;
      d.querySelector(`#step${step}`).classList.add('hidden');
      step += 1;
      d.querySelector(`#step${step}`).classList.remove('hidden');
      if (step === 3) { next.classList.add('hidden'); d.querySelector('#done-button').classList.remove('hidden'); }
    });
    const done = d.querySelector('#done-button');
    if (done) done.addEventListener('click', () => {
      const id = `NEWVIDEO${String(db.nextId++).padStart(3, '0')}`;
      db.streams.unshift({ id, title: model.title, description: model.description, status: 'waiting', key: 'Default stream key', autoStart: false, autoStop: false, visibility: model.visibility, category: model.category, kids: model.kids });
      d.remove();
      setTimeout(() => go(`${origin}/video/${id}/livestreaming`), 500);
    });
    const save = d.querySelector('#save-button');
    if (save) save.addEventListener('click', () => {
      stream.title = model.title;
      stream.description = model.description;
      setTimeout(() => { d.remove(); refreshRoom(); }, 400);
    });
    document.body.append(d);
  }

  function openMenu(items, onPick) {
    const m = html(`<tp-yt-paper-listbox class="overlay" role="listbox">${items.map((i) => `<tp-yt-paper-item role="option">${i}</tp-yt-paper-item>`).join('')}</tp-yt-paper-listbox>`);
    m.querySelectorAll('tp-yt-paper-item').forEach((it, i) => it.addEventListener('click', () => { onPick(items[i]); m.remove(); }));
    setTimeout(() => document.body.append(m), 200);
  }

  // ── Phòng điều khiển ───────────────────────────────────────────────────────
  let roomId = null;
  const keyBusy = (s) => db.streams.some((o) => o !== s && o.status === 'live' && o.key === s.key);
  const hasSignal = (s) => db.signalKeys.includes(s.key) && !keyBusy(s);

  function renderRoom(id) {
    roomId = id;
    const s = find(id);
    app.replaceChildren(html(`<div>
      <ytls-broadcast-metadata><h2 id="title"></h2><ytcp-button id="edit-button"><button>Chỉnh sửa</button></ytcp-button></ytls-broadcast-metadata>
      <ytls-broadcast-status-renderer></ytls-broadcast-status-renderer>
      <div id="main-action"></div>
      <tp-yt-paper-tab role="tab">Cài đặt luồng</tp-yt-paper-tab>
      <section id="settings" class="hidden">
        <div><span>Chọn khóa sự kiện phát trực tiếp</span><ytls-ingestion-dropdown-trigger-renderer aria-haspopup="true"></ytls-ingestion-dropdown-trigger-renderer></div>
        <div><ytcp-checkbox-lit id="as"><div role="checkbox"></div></ytcp-checkbox-lit><span>Bật tính năng tự động bắt đầu</span></div>
        <div><ytcp-checkbox-lit id="ae"><div role="checkbox"></div></ytcp-checkbox-lit><span>Bật tính năng tự động dừng</span></div>
      </section>
    </div>`));
    app.querySelector('tp-yt-paper-tab').addEventListener('click', () => app.querySelector('#settings').classList.remove('hidden'));
    app.querySelector('#edit-button button').addEventListener('click', () => setTimeout(() => openDetails({ mode: 'edit', stream: s }), 300));
    const trig = app.querySelector('ytls-ingestion-dropdown-trigger-renderer');
    trig.addEventListener('click', () => openMenu(db.keys.map((k) => `${k} (RTMP, Variable)`), (v) => { s.key = v.replace(/ \(RTMP, Variable\)$/, ''); refreshRoom(); }));
    app.querySelector('#as').addEventListener('click', () => { s.autoStart = !s.autoStart; refreshRoom(); });
    app.querySelector('#ae').addEventListener('click', () => { s.autoStop = !s.autoStop; refreshRoom(); });
    refreshRoom();
  }

  function refreshRoom() {
    const s = roomId && find(roomId);
    if (!s || !app.querySelector('ytls-broadcast-status-renderer')) return;
    app.querySelector('#title').textContent = s.title;
    app.querySelector('ytls-broadcast-status-renderer').textContent = STATUS_TEXT[s.status];
    app.querySelector('ytls-ingestion-dropdown-trigger-renderer').textContent = `${s.key} (RTMP, Variable)`;
    app.querySelector('#as [role=checkbox]').setAttribute('aria-checked', String(!!s.autoStart));
    app.querySelector('#ae [role=checkbox]').setAttribute('aria-checked', String(!!s.autoStop));
    const slot = app.querySelector('#main-action');
    const want = s.status === 'live' ? 'end' : s.status === 'ended' ? 'none' : hasSignal(s) ? 'go-on' : 'go-off';
    if (slot.dataset.kind === want) return;
    slot.dataset.kind = want;
    if (want === 'end') {
      slot.replaceChildren(db.brokenEnd ? html('<ytcp-button><button>Dừng phát</button></ytcp-button>') : html('<ytcp-button id="end-stream-button"><button>Kết thúc phát trực tiếp</button></ytcp-button>'));
      slot.querySelector('button').addEventListener('click', () => setTimeout(() => openEndConfirm(s), 300));
    } else if (want === 'none') slot.replaceChildren();
    else {
      slot.replaceChildren(html(`<ytcp-button id="start-stream-button" ${want === 'go-off' ? 'disabled' : ''}><button>Phát trực tiếp</button></ytcp-button>`));
      slot.querySelector('button').addEventListener('click', () => { if (hasSignal(s)) { s.status = 'live'; s.clickedGoLive = true; refreshRoom(); } });
    }
  }

  function openEndConfirm(s) {
    const d = html('<ytcp-confirmation-dialog class="overlay"><p>Kết thúc buổi phát trực tiếp?</p><ytcp-button id="confirm-button"><button>Kết thúc</button></ytcp-button></ytcp-confirmation-dialog>');
    d.querySelector('button').addEventListener('click', () => { d.remove(); setTimeout(() => { s.status = 'ended'; refreshRoom(); }, 700); });
    document.body.append(d);
  }

  // Tự bắt đầu: luồng đang chờ, bật auto-start, key có tín hiệu và không bị luồng khác chiếm → lên live
  setInterval(() => {
    db.streams.forEach((s) => { if (s.status === 'waiting' && s.autoStart && hasSignal(s)) s.status = 'live'; });
    refreshRoom();
  }, 400);

  // ── Bộ chạy luồng (bản thu gọn của background.runFlow + main.makeCtx) ──────
  async function run(flow, args, { dryRun = false, confirm = true, cancelAfterMs = 0 } = {}) {
    const logs = [];
    const confirms = [];
    let cancelled = false;
    if (cancelAfterMs) setTimeout(() => (cancelled = true), cancelAfterMs);
    const makeCtx = () => {
      const ctx = {
        runId: 'mock', dryRun, env: { channelId: CH }, dryPending: null,
        log: (level, msg) => logs.push(`${level}: ${msg}`),
        checkCancel() { if (cancelled) throw new ALH.dom.CancelledError(); },
        async step(name, fn) {
          ctx.checkCancel();
          ctx.log('step', name);
          await ALH.dom.humanPause(ctx);
          try { const r = await fn(); ctx.log('ok', name); return r; } catch (e) { e.step = e.step || name; throw e; }
        },
      };
      return ctx;
    };
    let stack = [{ flow, stage: 'start', state: { args } }];
    try {
      for (let i = 0; i < 300; i++) {
        const frame = stack[stack.length - 1];
        const out = (await ALH.flows[frame.flow][frame.stage](frame.state, makeCtx())) || {};
        const state = out.state || frame.state;
        if (out.confirm) {
          confirms.push(out.confirm.title);
          if (!confirm) return { ok: false, error: { kind: 'cancelled', message: 'không xác nhận' }, logs, confirms };
        }
        if (out.goto && !ALH.text.sameStudioPath(location.href, out.goto)) { logs.push(`nav: ${out.goto.replace(origin, '')}`); go(out.goto); }
        if ('done' in out) {
          stack = stack.slice(0, -1);
          if (!stack.length) return { ok: true, result: out.done, logs, confirms };
          const p = stack[stack.length - 1];
          stack = [...stack.slice(0, -1), { ...p, state: { ...p.state, lastResult: out.done } }];
          continue;
        }
        stack = [...stack.slice(0, -1), { ...frame, stage: out.next, state }];
        if (out.call) stack = [...stack, { flow: out.call.flow, stage: 'start', state: { args: out.call.args } }];
      }
      return { ok: false, error: { message: 'quá nhiều bước' }, logs, confirms };
    } catch (e) {
      return { ok: false, error: { kind: e.kind || 'step', message: e.message, step: e.step, selector: e.selector }, logs, confirms };
    }
  }

  window.harness = {
    CH,
    run,
    go,
    reset(patch = {}) { db = { ...freshDb(), ...patch }; go(`${origin}/channel/${CH}/livestreaming/manage`); },
    get db() { return db; },
  };
  harness.reset();
})();
