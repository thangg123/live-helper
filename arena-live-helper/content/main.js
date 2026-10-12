// Nhận lệnh từ background, chạy một chặng của luồng (flows.js) hoặc công cụ (inspector.js), trả kết quả và log.
(function () {
  'use strict';
  const ALH = globalThis.ALH;
  const D = ALH.dom;
  const cancelledRuns = new Set();

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // extension vừa được tải lại → context cũ không còn, bỏ qua
    }
  }

  function makeCtx({ runId, dryRun, env }) {
    const ctx = {
      runId,
      dryRun: !!dryRun,
      env: env || {},
      dryPending: null,
      log(level, msg, extra = {}) {
        send({ type: 'log', runId, entry: { t: Date.now(), level, msg, source: 'studio', ...extra } });
      },
      checkCancel() {
        if (cancelledRuns.has(runId)) throw new D.CancelledError();
      },
      async step(name, fn) {
        ctx.checkCancel();
        ctx.log('step', name);
        await D.humanPause(ctx);
        try {
          const result = await fn();
          ctx.log('ok', name);
          return result;
        } catch (e) {
          if (!e.step) e.step = name;
          throw e;
        }
      },
    };
    return ctx;
  }

  function serializeError(e) {
    return {
      kind: e.kind || (e instanceof D.StepError ? 'step' : 'error'),
      message: (e && e.message) || String(e),
      step: e.step || null,
      selector: e.selector || null,
      url: e.url || location.href,
    };
  }

  async function runStage(msg) {
    const flow = ALH.flows[msg.flow];
    const fn = flow && flow[msg.stage];
    if (typeof fn !== 'function') {
      return { ok: false, error: { kind: 'error', message: `Không có chặng ${msg.flow}.${msg.stage}`, url: location.href } };
    }
    if (msg.fresh) D.clearHighlights();
    const ctx = makeCtx(msg);
    try {
      const out = (await fn(msg.state || {}, ctx)) || {};
      return { ok: true, out };
    } catch (e) {
      return { ok: false, error: serializeError(e) };
    }
  }

  async function runTool(msg) {
    try {
      switch (msg.name) {
        case 'capture':
          return { ok: true, result: ALH.inspector.capture() };
        case 'checkSelectors':
          return { ok: true, result: ALH.inspector.checkSelectors() };
        case 'highlight':
          return { ok: true, result: ALH.inspector.highlightKey(msg.args.key) };
        case 'clearHighlights':
          return { ok: true, result: { cleared: D.clearHighlights() } };
        case 'probe':
          return { ok: true, result: ALH.flowProbe() };
        default:
          return { ok: false, error: { message: `Không có công cụ "${msg.name}"` } };
      }
    } catch (e) {
      return { ok: false, error: serializeError(e) };
    }
  }

  function onMessage(msg, sender, sendResponse) {
    if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object') return false;
    switch (msg.type) {
      case 'ping':
        sendResponse({ ok: true, url: location.href, lang: document.documentElement.lang || '' });
        return false;
      case 'cancel':
        cancelledRuns.add(msg.runId);
        sendResponse({ ok: true });
        return false;
      case 'runStage':
        runStage(msg).then(sendResponse);
        return true;
      case 'tool':
        runTool(msg).then(sendResponse);
        return true;
      default:
        return false;
    }
  }

  // Tiêm lại script (sau khi tải lại extension) không được để 2 listener cùng chạy.
  if (globalThis.__alhListener) {
    try {
      chrome.runtime.onMessage.removeListener(globalThis.__alhListener);
    } catch {
      // listener cũ thuộc context đã chết
    }
  }
  globalThis.__alhListener = onMessage;
  chrome.runtime.onMessage.addListener(onMessage);
})();
