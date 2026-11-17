/* 서버 통신. SERVER_URL 이 있으면 구글 Apps Script 로, 없으면 브라우저 안의 체험 서버(DemoServer)로 보낸다. */
var Api = (function () {
  'use strict';
  var cfg = window.APP_CONFIG || {};
  var mode = cfg.SERVER_URL ? 'server' : 'demo';
  var token = null;
  var AUTH_LOST = { UNAUTHENTICATED: 1, SESSION_EXPIRED: 1 };
  var api = { mode: mode, onAuthLost: null, onBusy: null };

  function rid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function send(req) {
    if (mode === 'demo') return DemoServer.handle(req);
    var r;
    try {
      r = await fetch(cfg.SERVER_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req) });
    } catch (e) { var ne = new Error('인터넷 연결을 확인해 주세요.'); ne.code = 'NETWORK'; throw ne; }
    try { return await r.json(); } catch (e) { var pe = new Error('서버 응답을 읽을 수 없습니다.'); pe.code = 'NETWORK'; throw pe; }
  }

  /** 한 번 호출. 실패하면 code 가 붙은 Error 를 던진다. */
  api.call = async function (action, payload, opts) {
    opts = opts || {};
    var res = await send({ action: action, token: token, payload: payload || {}, req_id: opts.reqId });
    if (!res.ok) {
      var e = new Error(res.error.message); e.code = res.error.code; e.data = res.error.data;
      if (AUTH_LOST[e.code] && api.onAuthLost) api.onAuthLost(e);
      throw e;
    }
    return res.data;
  };

  /** 저장용 호출: 같은 req_id 로 네트워크 오류·서버 바쁨일 때 몇 번 다시 보낸다 (서버가 중복을 걸러 준다). */
  api.save = async function (action, payload) {
    var id = rid(), tries = 0;
    for (;;) {
      try { return await api.call(action, payload, { reqId: id }); }
      catch (e) {
        tries++;
        if ((e.code === 'NETWORK' || e.code === 'BUSY') && tries < 4) { await sleep(600 * tries); continue; }
        throw e;
      }
    }
  };

  api.setToken = function (t) { token = t; try { if (t) sessionStorage.setItem('vp_token', t); else sessionStorage.removeItem('vp_token'); } catch (e) {} };
  api.restoreToken = function () { try { token = sessionStorage.getItem('vp_token'); } catch (e) { token = null; } return token; };
  api.hasToken = function () { return !!token; };
  return api;
})();
