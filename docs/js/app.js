/* 앱 뼈대: 시작, 로그인, 라우터, 공통 상태 */

var App = (function () {
  'use strict';
  var A = {};
  var STUDENT_NAV = [['#/home', '홈', '🏠'], ['#/vocab', '어휘', '📖'], ['#/lab', '쓰기', '✏️'], ['#/collect', '수집함', '🔖'], ['#/practice', '복습·기록', '🌱']];
  var TEACHER_NAV = [['#/t/students', '학생', '👥'], ['#/t/lessons', '차시·과제', '🗓️'], ['#/t/content', '어휘·장면', '📝'], ['#/t/status', '현황', '📊'], ['#/t/data', '자료·백업', '💾']];

  function view() { return document.getElementById('view'); }
  A.view = view;

  A.parse = function () {
    var h = location.hash.replace(/^#\/?/, ''), q = {}, i = h.indexOf('?');
    if (i >= 0) { h.slice(i + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); h = h.slice(0, i); }
    return { parts: h.split('/').filter(Boolean).map(decodeURIComponent), q: q };
  };
  A.go = function (hash) { if (location.hash === hash) A.route(); else location.hash = hash; };

  /* ---------------- 공통 ---------------- */
  A.refreshSnap = async function () {
    S.snap = await Api.call('sync');
    Data.applyDelta(S.snap.delta);
    return S.snap;
  };

  function renderChrome() {
    var nav = S.user ? (S.user.role === 'teacher' ? TEACHER_NAV : STUDENT_NAV) : [];
    var cur = location.hash;
    var on = function (h) { return cur === h || cur.indexOf(h + '/') === 0 || cur.indexOf(h + '?') === 0 ? 'on' : ''; };
    var top = document.getElementById('topnav'), bar = document.getElementById('tabbar'), ub = document.getElementById('userbox');
    top.innerHTML = nav.map(function (n) { return '<a href="' + n[0] + '" class="' + on(n[0]) + '">' + n[1] + '</a>'; }).join('');
    bar.innerHTML = nav.map(function (n) { return '<a href="' + n[0] + '" class="' + on(n[0]) + '"><span class="ic" aria-hidden="true">' + n[2] + '</span>' + n[1] + '</a>'; }).join('');
    bar.classList.toggle('hidden', !S.user);
    if (S.user) {
      ub.innerHTML = '<span class="who">' + esc(S.user.display_name) + (S.user.role === 'teacher' ? ' 선생님' : '') + '</span><a class="btn small" href="#/me">내 정보</a>';
    } else ub.innerHTML = '';
    var banner = document.getElementById('demo-banner');
    if (Api.mode === 'demo') {
      banner.classList.remove('hidden');
      banner.innerHTML = '<b>체험 모드</b> · 기록은 이 브라우저에만 저장돼요. 실제 수업에서는 <code>config.js</code> 에 서버 주소를 넣어 쓰세요.';
    }
  }
  A.chrome = renderChrome;

  A.login = async function (ses) {
    Api.setToken(ses.token);
    S.user = ses.user;
    if (S.user.role === 'student') await A.refreshSnap();
    else { S.classes = await Api.call('class.list'); try { S.classId = localStorage.getItem('vp_class') || null; } catch (e) {} if (!S.classes.some(function (c) { return c.class_id === S.classId; })) S.classId = S.classes[0] ? S.classes[0].class_id : null; }
    try { localStorage.setItem('vp_last_login', S.user.login_id); } catch (e) {}
    A.go(S.user.role === 'teacher' ? '#/t/students' : '#/home');
  };

  A.logout = async function (silent) {
    try { if (!silent && Api.hasToken()) await Api.call('auth.logout'); } catch (e) { /* 이미 끝난 세션 */ }
    Api.setToken(null); S.user = null; S.snap = null; S.classes = []; S.leave = null;
    A.go('#/login');
  };

  /* ---------------- 로그인 화면 ---------------- */
  function loginView(msg) {
    var v = view(), last = ''; try { last = localStorage.getItem('vp_last_login') || ''; } catch (e) {}
    var demo = Api.mode === 'demo';
    v.innerHTML = html`<div class="login-wrap stack">
      <div class="hero"><div class="slogan">아는 어휘에서 쓰는 어휘로!</div><h1>힘이 되는 학습도구어</h1><p>어휘를 이해하고, 생각을 확장하고, 나의 언어로 표현하다.</p></div>
      ${msg ? html`<div class="notice err" role="alert">${msg}</div>` : ''}
      <div class="card">
        <div class="pill-tabs" role="tablist"><button class="on" data-tab="in" role="tab">로그인</button><button data-tab="first" role="tab">처음 오셨나요?</button></div>
        <form id="f-in" autocomplete="on">
          <label class="f" for="li-id">아이디</label><input id="li-id" type="text" name="username" autocomplete="username" autocapitalize="off" value="${last}" required>
          <label class="f" for="li-pw">비밀번호</label><input id="li-pw" type="password" name="password" autocomplete="current-password" required>
          <div class="gap"></div><button class="btn primary" style="width:100%" type="submit">로그인</button>
          <p class="small muted" style="margin-top:12px">비밀번호를 잊었다면 선생님께 새 초대 코드를 받아 «처음 오셨나요?» 에서 다시 만드세요.</p>
        </form>
        <form id="f-first" class="hidden" autocomplete="off">
          <p class="small muted">선생님께 받은 <b>아이디</b>와 <b>초대 코드</b>로 처음 한 번만 비밀번호를 만듭니다.</p>
          <label class="f" for="fi-id">아이디</label><input id="fi-id" type="text" autocapitalize="off" required>
          <label class="f" for="fi-code">초대 코드<span class="hint">예) ABCD-EFGH</span></label><input id="fi-code" type="text" autocapitalize="characters" required>
          <label class="f" for="fi-pw">새 비밀번호<span class="hint">학생 6자 이상 · 선생님 10자 이상</span></label><input id="fi-pw" type="password" autocomplete="new-password" required>
          <label class="f" for="fi-pw2">비밀번호 한 번 더</label><input id="fi-pw2" type="password" autocomplete="new-password" required>
          <div class="gap"></div><button class="btn green" style="width:100%" type="submit">비밀번호 만들고 시작하기</button>
        </form>
      </div>
      ${demo ? html`<div class="card soft-blue"><h3>체험용 계정</h3><p class="small">연습용 학급이 미리 만들어져 있어요. 누르면 바로 들어갑니다.</p>
        <div class="row">${[['선생님', DemoServer.DEMO.teacher.id, DemoServer.DEMO.teacher.pw]].concat([]).map(function (a) { return html`<button class="btn small" data-demo="${a[1]}|${a[2]}">${a[0]}으로 체험</button>`; })}
        <span data-slot="demo-students"></span></div>
        <p class="small muted" style="margin-top:10px">체험 기록을 지우려면 <a href="#" id="demo-reset">체험 데이터 초기화</a></p></div>` : ''}
    </div>`.s;
    if (demo) {
      var slot = $('[data-slot=demo-students]', v), us = DemoServer._store.all('Users').filter(function (u) { return u.role === 'student'; });
      slot.outerHTML = us.slice(0, 5).map(function (u) { return '<button class="btn small" data-demo="' + esc(u.login_id) + '|' + esc(DemoServer.DEMO.student_pw) + '">' + esc(u.display_name) + '(학생)</button>'; }).join('');
    }
    var busy = false;
    async function doLogin(id, pw) {
      if (busy) return; busy = true;
      try { var ses = await Api.call('auth.login', { login_id: id, password: pw }); await A.login(ses); }
      catch (e) { loginView(UI.errMsg(e)); }
      busy = false;
    }
    v.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) { $$('[data-tab]', v).forEach(function (b) { b.classList.toggle('on', b === t); }); $('#f-in', v).classList.toggle('hidden', t.dataset.tab !== 'in'); $('#f-first', v).classList.toggle('hidden', t.dataset.tab !== 'first'); }
      var d = e.target.closest('[data-demo]'); if (d) { var p = d.dataset.demo.split('|'); doLogin(p[0], p[1]); }
      if (e.target.id === 'demo-reset') { e.preventDefault(); UI.confirm('체험 데이터 지우기', '체험 중에 만든 기록이 모두 사라지고 처음 상태로 돌아갑니다.', '지우기', true).then(function (ok) { if (ok) { DemoServer.reset(); location.reload(); } }); }
    });
    $('#f-in', v).addEventListener('submit', function (e) { e.preventDefault(); doLogin($('#li-id', v).value.trim(), $('#li-pw', v).value); });
    $('#f-first', v).addEventListener('submit', async function (e) {
      e.preventDefault();
      if ($('#fi-pw', v).value !== $('#fi-pw2', v).value) return UI.toast('두 비밀번호가 서로 달라요.', 'err');
      try { var ses = await Api.call('auth.activate', { login_id: $('#fi-id', v).value.trim(), invite_code: $('#fi-code', v).value.trim(), new_password: $('#fi-pw', v).value }); UI.toast('비밀번호를 만들었어요. 환영합니다!', 'ok'); await A.login(ses); }
      catch (err) { UI.toast(UI.errMsg(err), 'err'); }
    });
  }

  /* ---------------- 내 정보 ---------------- */
  function meView() {
    var v = view();
    v.innerHTML = html`<div class="stack" style="max-width:520px"><h1>내 정보</h1>
      <div class="card"><div class="row between"><div><b>${S.user.display_name}</b> <span class="chip">${S.user.role === 'teacher' ? '선생님' : '학생'}</span><div class="small muted">아이디 ${S.user.login_id}</div></div><button class="btn" id="logout">로그아웃</button></div></div>
      <form class="card" id="f-pw"><h3>비밀번호 바꾸기</h3>
        <label class="f" for="pw0">지금 비밀번호</label><input id="pw0" type="password" autocomplete="current-password" required>
        <label class="f" for="pw1">새 비밀번호</label><input id="pw1" type="password" autocomplete="new-password" required>
        <div class="gap"></div><button class="btn primary" type="submit">바꾸기</button>
        <p class="small muted" style="margin-top:8px">바꾸면 다른 기기에서는 로그아웃돼요.</p></form>
      <p class="small muted">${Api.mode === 'demo' ? '체험 모드: 이 브라우저에만 저장됩니다.' : '이 기기의 로그인은 ' + (S.user.role === 'teacher' ? 4 : 8) + '시간 뒤에 끝납니다.'}</p></div>`.s;
    $('#logout', v).onclick = function () { A.logout(); };
    $('#f-pw', v).onsubmit = async function (e) {
      e.preventDefault();
      try { await Api.save('auth.change_password', { old_password: $('#pw0', v).value, new_password: $('#pw1', v).value }); UI.toast('비밀번호를 바꿨어요.', 'ok'); e.target.reset(); }
      catch (err) { UI.toast(UI.errMsg(err), 'err'); }
    };
  }

  /* ---------------- 라우터 ---------------- */
  A.route = async function () {
    if (S.leave) { try { await S.leave(); } catch (e) {} S.leave = null; }
    var r = A.parse(), p = r.parts, v = view();
    window.scrollTo(0, 0);
    if (!S.user) { if (p[0] !== 'login') { location.replace('#/login'); return; } renderChrome(); return loginView(A._msg); }
    A._msg = '';
    renderChrome();
    try {
      if (p[0] === 'login' || !p[0]) return A.go(S.user.role === 'teacher' ? '#/t/students' : '#/home');
      if (p[0] === 'me') return meView();
      var group = S.user.role === 'teacher' ? Views.teacher : Views.student;
      var key = S.user.role === 'teacher' ? (p[0] === 't' ? p[1] : '') : p[0];
      var fn = group && group[key];
      if (!fn) { v.innerHTML = html`<div class="card"><h2>페이지를 찾을 수 없어요</h2><p><a href="${S.user.role === 'teacher' ? '#/t/students' : '#/home'}">처음으로</a></p></div>`.s; return; }
      v.innerHTML = '<p class="muted center" style="padding:40px">불러오는 중…</p>';
      await fn(v, S.user.role === 'teacher' ? p.slice(2) : p.slice(1), r.q);
      v.focus({ preventScroll: true });
    } catch (e) {
      if (e && (e.code === 'UNAUTHENTICATED' || e.code === 'SESSION_EXPIRED')) return;
      console.error(e);
      v.innerHTML = html`<div class="card"><h2>앗, 불러오지 못했어요</h2><p class="muted">${UI.errMsg(e)}</p><p class="small muted">잘못하신 게 아니에요. 아래 버튼으로 다시 해 보세요.</p><button class="btn primary" onclick="App.route()">다시 불러오기</button></div>`.s;
    }
  };

  /* ---------------- 시작 ---------------- */
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error(src + ' 를 불러오지 못했습니다.')); }; document.head.appendChild(s); }); }

  A.boot = async function () {
    var v = view();
    try {
      if (Api.mode === 'demo') { await loadScript('js/memory_store.js'); await loadScript('js/demo_env.js'); await loadScript('js/seed_examples.js'); }
      await Data.load();
      if (Api.mode === 'demo') DemoServer.init(Data.raw, window.SEED_EXAMPLES);
    } catch (e) {
      v.innerHTML = '<div class="card"><h2>시작하지 못했어요</h2><p class="muted">' + esc(UI.errMsg(e)) + '</p><p class="small">인터넷 연결을 확인하고 새로고침해 주세요. 잘못하신 게 아니에요.</p></div>';
      return;
    }
    Api.onAuthLost = function (e) {
      if (!S.user) return;
      S.user = null; S.snap = null; Api.setToken(null);
      A._msg = e.code === 'SESSION_EXPIRED' ? '로그인 시간이 끝났어요. 쓰던 글은 이 기기에 임시로 남아 있어요. 다시 로그인해 주세요.' : '다시 로그인해 주세요.';
      location.hash = '#/login'; A.route();
    };
    window.addEventListener('hashchange', A.route);
    if (Api.restoreToken()) {
      try {
        var me = await Api.call('auth.me'); S.user = me.user;
        if (S.user.role === 'student') await A.refreshSnap();
        else { S.classes = await Api.call('class.list'); try { S.classId = localStorage.getItem('vp_class') || null; } catch (e2) {} if (!S.classes.some(function (c) { return c.class_id === S.classId; })) S.classId = S.classes[0] ? S.classes[0].class_id : null; }
      } catch (e) { Api.setToken(null); S.user = null; }
    }
    if (!location.hash || location.hash === '#') location.hash = S.user ? (S.user.role === 'teacher' ? '#/t/students' : '#/home') : '#/login';
    A.route();
  };

  return A;
})();

document.addEventListener('DOMContentLoaded', function () { App.boot(); });
