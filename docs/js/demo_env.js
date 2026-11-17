/**
 * 체험 모드 서버: 구글 서버 없이 브라우저 안에서 Core 를 돌린다. 기록은 «이 브라우저의 localStorage» 에만 남는다.
 * 실제 운영(Apps Script)과 같은 Core 코드를 쓰므로 로그인·권한·저장 규칙이 똑같이 동작한다.
 */
var DemoServer = (function () {
  'use strict';
  var PREFIX = 'vp_demo_';
  var ls = null;
  try { ls = window.localStorage; ls.setItem(PREFIX + 'probe', '1'); ls.removeItem(PREFIX + 'probe'); } catch (e) { ls = null; }

  function randomHex(n) {
    var a = new Uint8Array(n), s = '';
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < n; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  }

  var store = MemoryStore({
    load: function (t) { try { return ls ? JSON.parse(ls.getItem(PREFIX + t) || 'null') : null; } catch (e) { return null; } },
    persist: function (t, rows) { try { if (ls) ls.setItem(PREFIX + t, JSON.stringify(rows.map(function (r) { return r; }))); } catch (e) { /* 용량 초과 등 */ } }
  });

  var pepper = (ls && ls.getItem(PREFIX + 'pepper')) || randomHex(16);
  if (ls) { try { ls.setItem(PREFIX + 'pepper', pepper); } catch (e) {} }

  var core = VocabCore.create({
    store: store, sha256Hex: sha256Hex, randomHex: randomHex, pepper: pepper,
    now: function () { return new Date().toISOString(); },
    lock: function (fn) { return fn(); },
    log: function (e) { console.error(e); }
  });

  var DEMO = {
    teacher: { id: 'teacher', pw: 'demo-teacher-1234' },
    student_pw: 'demo1234',
    students: ['학생1', '학생2', '학생3', '학생4', '학생5']
  };

  function call(action, payload, token) {
    var r = core.handle({ action: action, token: token, payload: payload || {} });
    if (!r.ok) throw new Error(action + ': ' + r.error.code + ' ' + r.error.message);
    return r.data;
  }

  /** 처음 열었을 때: 어휘 데이터와 체험용 교사·학급·학생 계정을 만든다. */
  function init(vocabJson, examples) {
    store.ensure();
    if (!store.all('Vocabulary').length) core.seed(vocabJson, examples || {});
    if (!store.all('Users').length) {
      var t = core.createTeacher(DEMO.teacher.id, '체험 선생님');
      var ses = call('auth.activate', { login_id: DEMO.teacher.id, invite_code: t.invite_code, new_password: DEMO.teacher.pw });
      var token = ses.token;
      var cls = call('class.create', { school_year: 2027, grade: 2, class_name: '3반' }, token);
      var made = call('student.create', { class_id: cls.class_id, students: DEMO.students.map(function (n, i) { return { no: i + 1, name: n }; }) }, token);
      made.forEach(function (s) { call('auth.activate', { login_id: s.login_id, invite_code: s.invite_code, new_password: DEMO.student_pw }); });
      call('lesson.auto_distribute', { class_id: cls.class_id }, token);
      for (var n = 1; n <= 12; n++) call('lesson.save', { class_id: cls.class_id, lesson_number: n, published: true, title: n + '차시' }, token);
      call('auth.logout', {}, token);
    }
  }

  function reset() {
    if (ls) Object.keys(ls).filter(function (k) { return k.indexOf(PREFIX) === 0; }).forEach(function (k) { ls.removeItem(k); });
  }

  /** 서버와 같은 모양으로 응답한다 (JSON 으로 한 번 왕복해 객체 공유를 끊는다). */
  function handle(req) {
    var res = core.handle(JSON.parse(JSON.stringify(req)));
    return Promise.resolve(JSON.parse(JSON.stringify(res)));
  }

  return { init: init, handle: handle, reset: reset, DEMO: DEMO, persistent: !!ls, _core: core, _store: store };
})();
