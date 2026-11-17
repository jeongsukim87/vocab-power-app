/**
 * 힘이 되는 학습도구어 — 서버 핵심 로직 (저장소와 무관한 순수 JavaScript)
 *
 *  · Google Apps Script 에서는 이 파일이 그대로 Core.gs 로 올라가고, SheetsStore(Store.gs) 가 저장을 맡는다.
 *  · 브라우저 «체험 모드» 에서는 docs/js/core.js (이 파일의 복사본)를 불러와 localStorage 저장소를 쓴다.
 *  · 인증·권한·저장 규칙을 한 곳에만 두기 위해 두 환경이 같은 코드를 쓴다. (복사: tools/sync_core.py)
 *
 * env(환경) 로 받는 것:
 *   store            { all(t), get(t,id), insert(t,row), update(t,id,patch), remove(t,id), ensure() }
 *   sha256Hex(str)   동기 SHA-256 (16진수 문자열)
 *   randomHex(n)     암호학적 난수 n바이트의 16진수
 *   now()            ISO 시각 문자열
 *   lock(fn)         한 번에 한 요청만 쓰게 하는 잠금 (fn 을 실행하고 결과를 돌려준다)
 *   pepper           비밀번호·토큰 해시에 섞는 서버 비밀값 (코드에 적지 않고 스크립트 속성에 둔다)
 *   log(e)           오류 기록(선택)
 */
var VocabCore = (function () {
  'use strict';

  var C = {
    LESSONS: 34,
    HASH_ROUNDS: 10000,
    SESSION_HOURS: { student: 8, teacher: 4 },
    SESSION_MAX_HOURS: 24,
    MAX_FAILS: 5,
    LOCK_MINUTES: 10,
    INVITE_DAYS: 14,
    TEXT_MAX: 2000,
    SHORT_MAX: 200,
    REQLOG_MINUTES: 30,
    MIN_PW: { student: 6, teacher: 10 }
  };

  /* ------------------------------------------------------------------ 표(시트) 정의
   * 열 이름 뒤 ":n" 은 숫자, ":j" 는 JSON 문자열(저장 시 문자열, 읽을 때 객체). 첫 열이 기본키. */
  var TABLES = {
    Users: ['user_id', 'role', 'login_id', 'display_name', 'class_id', 'student_no:n', 'credential_hash', 'salt',
      'invite_hash', 'invite_expires', 'status', 'failed_count:n', 'locked_until', 'created_at', 'last_login_at'],
    Classes: ['class_id', 'school_year:n', 'grade:n', 'class_name', 'teacher_id', 'created_at'],
    Sessions: ['token_hash', 'user_id', 'role', 'created_at', 'expires_at'],
    Vocabulary: ['vocabulary_id', 'headword', 'normalized_headword', 'sense_id', 'definition', 'definition_status',
      'semantic_category', 'origin', 'subject', 'edited_at', 'edited_by'],
    VocabularySources: ['source_id', 'vocabulary_id', 'source_type', 'original_entry_id', 'subject', 'publisher', 'page',
      'permission_status'],
    VocabularyRelations: ['relation_id', 'from_vocabulary_id', 'to_vocabulary_id', 'relation_type', 'status'],
    Lessons: ['lesson_id', 'class_id', 'lesson_number:n', 'title', 'goals', 'published:n', 'due_date'],
    LessonVocabulary: ['lv_id', 'class_id', 'lesson_number:n', 'vocabulary_id', 'required:n', 'sort:n'],
    LearningActivities: ['activity_id', 'vocabulary_id', 'type', 'prompt', 'answer_key', 'content_status', 'created_by',
      'created_at'],
    StudentVocabulary: ['sv_id', 'user_id', 'vocabulary_id', 'progress_status', 'steps:j', 'textbook_sentence',
      'guessed_meaning', 'self_explanation', 'comprehension_level:n', 'box:n', 'next_review_at', 'last_studied_at',
      'rev:n', 'updated_at'],
    PersonalCollections: ['collection_id', 'user_id', 'headword', 'normalized_headword', 'vocabulary_id', 'duplicate_of',
      'discovered_at', 'medium', 'source_context', 'guessed_meaning', 'confirmed_meaning', 'self_explanation',
      'example_sentence', 'subject', 'tags', 'related_words', 'favorite:n', 'status', 'trashed_at', 'share_status',
      'share_note', 'rev:n', 'created_at', 'updated_at'],
    WritingPrompts: ['prompt_id', 'vocabulary_id', 'scene_type', 'scenario', 'guiding_question', 'example',
      'content_status', 'origin', 'edited_at', 'edited_by'],
    Writings: ['writing_id', 'user_id', 'vocabulary_id', 'scene_type', 'draft_text', 'text', 'status', 'version:n',
      'self_check:j', 'example_viewed:n', 'rev:n', 'created_at', 'saved_at', 'submitted_at', 'featured:n'],
    WritingRevisions: ['revision_id', 'writing_id', 'user_id', 'version:n', 'text', 'saved_at'],
    DailySentences: ['daily_id', 'user_id', 'date', 'text', 'vocabulary_id', 'rev:n', 'created_at', 'updated_at',
      'deleted:n'],
    ReviewRecords: ['review_id', 'user_id', 'vocabulary_id', 'mode', 'result', 'detail', 'created_at'],
    TeacherFeedback: ['feedback_id', 'target_id', 'target_type', 'student_id', 'teacher_id', 'comment', 'rubric:j',
      'created_at', 'updated_at', 'read_at'],
    AuditLogs: ['log_id', 'actor_id', 'action', 'target_id', 'detail', 'created_at'],
    ReqLog: ['req_id', 'user_id', 'response', 'created_at']
  };

  var RUBRIC = ['accuracy', 'context', 'clarity', 'own_thought', 'transfer'];
  var RUBRIC_LABEL = { accuracy: '의미 정확성', context: '문맥 적절성', clarity: '표현 명료성',
    own_thought: '자기 생각', transfer: '새 맥락 전이' };
  var SCENES = ['SUBJECT', 'DAILY', 'WORLD'];
  var SCENE_LABEL = { SUBJECT: '교과 속에서', DAILY: '일상 속에서', WORLD: '세상 속에서' };

  function colName(c) { return c.split(':')[0]; }
  function colType(c) { return c.indexOf(':') < 0 ? 's' : c.split(':')[1]; }
  function keyOf(table) { return colName(TABLES[table][0]); }

  /** 객체 → 저장용 배열(열 순서). 숫자·JSON 열을 맞춰 준다. */
  function toRow(table, obj) {
    return TABLES[table].map(function (c) {
      var v = obj[colName(c)], t = colType(c);
      if (v === undefined || v === null) return t === 'n' ? '' : '';
      if (t === 'j') return typeof v === 'string' ? v : JSON.stringify(v);
      return v;
    });
  }
  /** 저장된 배열 → 객체 */
  function fromRow(table, arr) {
    var o = {};
    TABLES[table].forEach(function (c, i) {
      var v = arr[i], t = colType(c);
      if (t === 'n') o[colName(c)] = (v === '' || v === null || v === undefined) ? 0 : Number(v);
      else if (t === 'j') { try { o[colName(c)] = (v === '' || v == null) ? null : (typeof v === 'string' ? JSON.parse(v) : v); } catch (e) { o[colName(c)] = null; } }
      else o[colName(c)] = (v === null || v === undefined) ? '' : String(v);
    });
    return o;
  }

  /* ------------------------------------------------------------------ 오류·검증 도구 */
  function fail(code, message, data) { var e = new Error(message); e.code = code; e.data = data; throw e; }
  function isStr(v) { return typeof v === 'string'; }
  function str(v, max, name, opt) {
    if (v === undefined || v === null || v === '') { if (opt) return ''; fail('BAD_REQUEST', (name || '값') + '이(가) 비어 있습니다.'); }
    if (!isStr(v)) fail('BAD_REQUEST', (name || '값') + ' 형식이 올바르지 않습니다.');
    if (v.length > (max || C.SHORT_MAX)) fail('BAD_REQUEST', (name || '값') + '이(가) 너무 깁니다.');
    return v;
  }
  function oneOf(v, list, name) { if (list.indexOf(v) < 0) fail('BAD_REQUEST', (name || '값') + '이(가) 올바르지 않습니다.'); return v; }
  function int(v, min, max, name) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) fail('BAD_REQUEST', (name || '숫자') + ' 범위가 올바르지 않습니다.');
    return n;
  }
  function norm(s) { return String(s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase(); }
  function trim(s) { return String(s || '').replace(/^\s+|\s+$/g, ''); }
  function csvSafe(v) { var s = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
  function minutesFrom(iso, m) { return new Date(new Date(iso).getTime() + m * 60000).toISOString(); }
  function hoursFrom(iso, h) { return minutesFrom(iso, h * 60); }

  /* ------------------------------------------------------------------ 학습 진행 규칙 (서버·화면 공용) */
  var STEP_KEYS = ['confirm', 'context', 'infer', 'define', 'explain', 'related'];

  /** 본문(글) 단계는 글자 수로, 보기 단계는 표시 여부로 계산한다. */
  function computeSteps(sv, prev) {
    var s = {};
    STEP_KEYS.forEach(function (k) { s[k] = !!(prev && prev[k]); });
    s.transfer = !!(prev && prev.transfer);
    s.context = trim(sv.textbook_sentence).length >= 5;
    s.infer = trim(sv.guessed_meaning).length >= 2;
    s.explain = trim(sv.self_explanation).length >= 10;
    return s;
  }

  function submittedScenes(writings) {
    var set = {};
    (writings || []).forEach(function (w) { if (w.version > 0 && trim(w.text)) set[w.scene_type] = true; });
    return set;
  }

  /**
   * 어휘 하나의 학습 상태.
   * origin: SCHOOL | NATIONAL | PERSONAL
   * 완료 조건
   *   SCHOOL   : 교과서 문장·짐작·뜻 확인·자기 설명·관련어 탐색 + 세 장면 모두 제출
   *   NATIONAL : 확인·짐작·이해(뜻 확인)·확장(관련어 탐색) + 새 문장 1개 이상 제출
   *   PERSONAL : 확인한 뜻·자기 설명 입력 + 새 문장 1개 이상 제출
   */
  function vocabStatus(origin, sv, writings, extra) {
    var st = (sv && sv.steps) || {};
    var sc = submittedScenes(writings);
    var nScenes = Object.keys(sc).length;
    var done, total, got;
    if (origin === 'SCHOOL') {
      var need = ['context', 'infer', 'define', 'explain', 'related'];
      got = need.filter(function (k) { return st[k]; }).length + nScenes;
      total = need.length + 3;
    } else if (origin === 'NATIONAL') {
      var need2 = ['confirm', 'infer', 'define', 'related'];
      got = need2.filter(function (k) { return st[k]; }).length + (nScenes > 0 ? 1 : 0);
      total = need2.length + 1;
    } else {
      var p = extra || {};
      got = (p.confirmed ? 1 : 0) + (p.explained ? 1 : 0) + (nScenes > 0 ? 1 : 0);
      total = 3;
    }
    done = got === total;
    // 능동 어휘 습득: 이해·독립적 설명·문장 작성·새 맥락 적용 네 가지를 구분해서 본다 (문장 수만으로 판정하지 않는다)
    var level = {
      understand: !!(st.define && st.infer),
      explain: trim(sv && sv.self_explanation).length >= 10,
      write: nScenes > 0,
      transfer: !!st.transfer || nScenes >= 2
    };
    level.active = level.understand && level.explain && level.write && level.transfer;
    return { done: done, got: got, total: total, scenes: sc, level: level };
  }

  var BOX_DAYS = [0, 1, 2, 4, 8, 16];
  function nextReview(box, now) { return minutesFrom(now, BOX_DAYS[Math.max(1, Math.min(5, box))] * 24 * 60); }

  /* ------------------------------------------------------------------ 코어 */
  function create(env) {
    var store = env.store;
    var pepper = env.pepper || '';
    var H = {}; // action → {auth, write, fn}

    /* ---------- 저장소 도우미 ---------- */
    function all(t) { return store.all(t); }
    function where(t, pred) { return all(t).filter(pred); }
    function get(t, id) { return store.get(t, id); }
    function uid(prefix) { return prefix + '-' + env.randomHex(8); }
    function nowIso() { return env.now(); }
    function audit(actor, action, target, detail) {
      store.insert('AuditLogs', { log_id: uid('L'), actor_id: actor || '', action: action, target_id: target || '',
        detail: detail || '', created_at: nowIso() });
    }

    /* ---------- 비밀번호·토큰 ---------- */
    function hashSecret(secret, salt) {
      var h = env.sha256Hex(pepper + '|' + salt + '|' + secret);
      for (var i = 0; i < C.HASH_ROUNDS; i++) h = env.sha256Hex(h + salt + secret);
      return h;
    }
    function sameStr(a, b) { // 시간차 공격을 줄이기 위해 끝까지 비교
      if (a.length !== b.length) return false;
      var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return r === 0;
    }
    function tokenHash(token) { return env.sha256Hex('tok|' + pepper + '|' + token); }
    var INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    function newInviteCode() {
      var hex = env.randomHex(8), code = '';
      for (var i = 0; i < 8; i++) code += INVITE_ALPHABET.charAt(parseInt(hex.substr(i * 2, 2), 16) % INVITE_ALPHABET.length);
      return code.substr(0, 4) + '-' + code.substr(4);
    }
    function normInvite(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
    function checkPassword(pw, role, loginId) {
      if (!isStr(pw)) fail('BAD_REQUEST', '비밀번호를 입력해 주세요.');
      var min = C.MIN_PW[role] || 6;
      if (pw.length < min) fail('WEAK_PASSWORD', '비밀번호는 ' + min + '자 이상이어야 합니다.');
      if (pw.length > 100) fail('WEAK_PASSWORD', '비밀번호가 너무 깁니다.');
      if (loginId && pw.toLowerCase() === String(loginId).toLowerCase()) fail('WEAK_PASSWORD', '아이디와 같은 비밀번호는 쓸 수 없습니다.');
      if (/^(.)\1+$/.test(pw)) fail('WEAK_PASSWORD', '같은 글자만 반복한 비밀번호는 쓸 수 없습니다.');
    }

    function publicUser(u) {
      return { user_id: u.user_id, role: u.role, login_id: u.login_id, display_name: u.display_name,
        class_id: u.class_id, student_no: u.student_no };
    }

    function openSession(u) {
      var now = nowIso();
      // 만료된 세션 정리
      where('Sessions', function (s) { return s.expires_at < now; }).forEach(function (s) { store.remove('Sessions', s.token_hash); });
      var token = env.randomHex(24);
      store.insert('Sessions', { token_hash: tokenHash(token), user_id: u.user_id, role: u.role, created_at: now,
        expires_at: hoursFrom(now, C.SESSION_HOURS[u.role] || 4) });
      store.update('Users', u.user_id, { last_login_at: now, failed_count: 0, locked_until: '' });
      return { token: token, user: publicUser(u), expires_at: hoursFrom(now, C.SESSION_HOURS[u.role] || 4) };
    }

    function authenticate(token) {
      if (!isStr(token) || token.length < 20 || token.length > 200) fail('UNAUTHENTICATED', '로그인이 필요합니다.');
      var s = get('Sessions', tokenHash(token));
      if (!s) fail('UNAUTHENTICATED', '로그인이 필요합니다.');
      var now = nowIso();
      if (s.expires_at < now || hoursFrom(s.created_at, C.SESSION_MAX_HOURS) < now) fail('SESSION_EXPIRED', '로그인 시간이 끝났습니다. 다시 로그인해 주세요.');
      var u = get('Users', s.user_id);
      if (!u || u.status !== 'ACTIVE') fail('UNAUTHENTICATED', '사용할 수 없는 계정입니다.');
      return { user: u, session: s };
    }

    /* ---------- 권한 도우미 ---------- */
    function requireTeacherOfClass(user, classId) {
      var c = classId && get('Classes', classId);
      if (!c || c.teacher_id !== user.user_id) fail('FORBIDDEN', '이 학급에 대한 권한이 없습니다.');
      return c;
    }
    function requireTeacherOfStudent(teacher, studentId) {
      var s = studentId && get('Users', studentId);
      if (!s || s.role !== 'student') fail('NOT_FOUND', '학생을 찾을 수 없습니다.');
      requireTeacherOfClass(teacher, s.class_id);
      return s;
    }
    function ownOr404(row, user) { // 학생 본인 기록만. 남의 것이면 «없음» 으로 답해 존재 여부도 알려 주지 않는다.
      if (!row || row.user_id !== user.user_id) fail('NOT_FOUND', '기록을 찾을 수 없습니다.');
      return row;
    }
    function vocabExists(id, user) {
      if (get('Vocabulary', id)) return true;
      var pc = get('PersonalCollections', id);
      return !!(pc && user && pc.user_id === user.user_id);
    }
    function originOf(vid) {
      var v = get('Vocabulary', vid);
      return v ? v.origin : 'PERSONAL';
    }

    /* ---------- 정의: 엔드포인트 등록 ---------- */
    function def(name, opt, fn) { H[name] = { auth: opt.auth || 'student', write: !!opt.write, fn: fn }; }

    /* ================================================================= 인증 */
    def('auth.login', { auth: 'none', write: true }, function (ctx, p) {
      var loginId = str(p.login_id, 40, '아이디').toLowerCase();
      var pw = str(p.password, 100, '비밀번호');
      var u = where('Users', function (x) { return x.login_id.toLowerCase() === loginId; })[0];
      var now = nowIso();
      var bad = function () { fail('LOGIN_FAILED', '아이디 또는 비밀번호가 맞지 않습니다.'); };
      if (!u || u.status !== 'ACTIVE') { hashSecret(pw, 'dummy'); bad(); } // 존재 여부가 시간으로 드러나지 않게
      if (u.locked_until && u.locked_until > now) fail('LOCKED', '로그인에 여러 번 실패해서 잠시 잠겼습니다. ' + C.LOCK_MINUTES + '분 뒤에 다시 해 보세요.');
      if (!u.credential_hash) fail('NOT_ACTIVATED', '아직 비밀번호를 만들지 않았습니다. «처음 오셨나요?» 에서 초대 코드로 시작해 주세요.');
      if (!sameStr(hashSecret(pw, u.salt), u.credential_hash)) {
        var n = (u.failed_count || 0) + 1;
        store.update('Users', u.user_id, { failed_count: n, locked_until: n >= C.MAX_FAILS ? minutesFrom(now, C.LOCK_MINUTES) : '' });
        audit(u.user_id, 'login_failed', u.user_id, '');
        bad();
      }
      audit(u.user_id, 'login', u.user_id, '');
      return openSession(u);
    });

    def('auth.activate', { auth: 'none', write: true }, function (ctx, p) {
      var loginId = str(p.login_id, 40, '아이디').toLowerCase();
      var code = normInvite(str(p.invite_code, 20, '초대 코드'));
      var u = where('Users', function (x) { return x.login_id.toLowerCase() === loginId; })[0];
      var now = nowIso();
      var bad = function () { fail('INVITE_INVALID', '아이디 또는 초대 코드가 맞지 않거나 기간이 지났습니다. 선생님께 새 코드를 받아 주세요.'); };
      if (!u || u.status !== 'ACTIVE' || !u.invite_hash || !u.invite_expires || u.invite_expires < now) bad();
      if (u.locked_until && u.locked_until > now) fail('LOCKED', '잠시 잠겼습니다. ' + C.LOCK_MINUTES + '분 뒤에 다시 해 보세요.');
      if (!sameStr(hashSecret(code, u.salt), u.invite_hash)) {
        var n = (u.failed_count || 0) + 1;
        store.update('Users', u.user_id, { failed_count: n, locked_until: n >= C.MAX_FAILS ? minutesFrom(now, C.LOCK_MINUTES) : '' });
        bad();
      }
      checkPassword(p.new_password, u.role, u.login_id);
      var salt = env.randomHex(16);
      store.update('Users', u.user_id, { salt: salt, credential_hash: hashSecret(p.new_password, salt), invite_hash: '', invite_expires: '', failed_count: 0 });
      audit(u.user_id, 'activate', u.user_id, '');
      return openSession(get('Users', u.user_id));
    });

    def('auth.logout', { auth: 'any', write: true }, function (ctx) {
      store.remove('Sessions', ctx.session.token_hash);
      return { bye: true };
    });

    def('auth.change_password', { auth: 'any', write: true }, function (ctx, p) {
      var u = ctx.user;
      if (!sameStr(hashSecret(str(p.old_password, 100, '현재 비밀번호'), u.salt), u.credential_hash)) fail('LOGIN_FAILED', '현재 비밀번호가 맞지 않습니다.');
      checkPassword(p.new_password, u.role, u.login_id);
      var salt = env.randomHex(16);
      store.update('Users', u.user_id, { salt: salt, credential_hash: hashSecret(p.new_password, salt) });
      // 다른 기기의 로그인은 모두 끊는다 (지금 쓰는 세션만 남김)
      where('Sessions', function (s) { return s.user_id === u.user_id && s.token_hash !== ctx.session.token_hash; })
        .forEach(function (s) { store.remove('Sessions', s.token_hash); });
      audit(u.user_id, 'change_password', u.user_id, '');
      return { changed: true };
    });

    def('auth.me', { auth: 'any' }, function (ctx) { return { user: publicUser(ctx.user), expires_at: ctx.session.expires_at }; });

    /* ================================================================= 학생: 동기화(한 번에 내 기록 전부) */
    function lessonsForClass(classId, onlyPublished) {
      var ls = where('Lessons', function (l) { return l.class_id === classId && (!onlyPublished || l.published); });
      var lv = where('LessonVocabulary', function (x) { return x.class_id === classId; });
      var pubSet = {}; ls.forEach(function (l) { pubSet[l.lesson_number] = true; });
      return ls.sort(function (a, b) { return a.lesson_number - b.lesson_number; }).map(function (l) {
        return Object.assign({}, l, {
          vocab: lv.filter(function (x) { return x.lesson_number === l.lesson_number; })
            .sort(function (a, b) { return a.sort - b.sort; })
            .map(function (x) { return { vocabulary_id: x.vocabulary_id, required: x.required }; })
        });
      });
    }

    function contentDelta() {
      return {
        vocabulary: where('Vocabulary', function (v) { return v.origin === 'CUSTOM' || v.edited_at; }),
        prompts: where('WritingPrompts', function (p) { return p.origin === 'CUSTOM' || p.edited_at; }),
        activities: all('LearningActivities').map(function (a) { return pick(a, ['activity_id', 'vocabulary_id', 'type', 'prompt', 'content_status']); })
      };
    }

    function studentSnapshot(user) {
      var uidv = user.user_id;
      var cls = user.class_id ? get('Classes', user.class_id) : null;
      var myWritings = where('Writings', function (w) { return w.user_id === uidv; });
      return {
        user: publicUser(user),
        class: cls ? pick(cls, ['class_id', 'school_year', 'grade', 'class_name']) : null,
        lessons: user.class_id ? lessonsForClass(user.class_id, true) : [],
        sv: where('StudentVocabulary', function (x) { return x.user_id === uidv; }),
        collections: where('PersonalCollections', function (x) { return x.user_id === uidv; }),
        writings: myWritings,
        daily: where('DailySentences', function (x) { return x.user_id === uidv && !x.deleted; }),
        reviews: where('ReviewRecords', function (x) { return x.user_id === uidv; }).slice(-300),
        feedback: where('TeacherFeedback', function (x) { return x.student_id === uidv; }),
        shared: user.class_id ? sharedWords(user.class_id) : [],
        delta: contentDelta(),
        server_time: nowIso()
      };
    }

    function sharedWords(classId) {
      var members = {};
      where('Users', function (u) { return u.class_id === classId && u.role === 'student'; }).forEach(function (u) { members[u.user_id] = u.display_name; });
      return where('PersonalCollections', function (c) { return members[c.user_id] && c.share_status === 'APPROVED' && c.status === 'ACTIVE'; })
        .map(function (c) { return { collection_id: c.collection_id, headword: c.headword, confirmed_meaning: c.confirmed_meaning,
          example_sentence: c.example_sentence, subject: c.subject, note: c.share_note }; });
    }

    def('sync', { auth: 'student' }, function (ctx) { return studentSnapshot(ctx.user); });

    /* ================================================================= 학생: 어휘 학습 기록 */
    function svFor(user, vid) {
      return where('StudentVocabulary', function (x) { return x.user_id === user.user_id && x.vocabulary_id === vid; })[0];
    }

    def('sv.save', { auth: 'student', write: true }, function (ctx, p) {
      var vid = str(p.vocabulary_id, 60, '어휘');
      if (!vocabExists(vid, ctx.user)) fail('NOT_FOUND', '어휘를 찾을 수 없습니다.');
      var cur = svFor(ctx.user, vid), now = nowIso();
      if (cur && p.base_rev !== undefined && Number(p.base_rev) !== cur.rev) fail('CONFLICT', '다른 기기에서 먼저 저장한 내용이 있습니다.', cur);
      var patch = {};
      if (p.textbook_sentence !== undefined) patch.textbook_sentence = str(p.textbook_sentence, C.TEXT_MAX, '교과서 문장', true);
      if (p.guessed_meaning !== undefined) patch.guessed_meaning = str(p.guessed_meaning, C.TEXT_MAX, '짐작한 뜻', true);
      if (p.self_explanation !== undefined) patch.self_explanation = str(p.self_explanation, C.TEXT_MAX, '자기 설명', true);
      if (p.comprehension_level !== undefined) patch.comprehension_level = int(p.comprehension_level, 0, 4, '이해 정도');
      var merged = Object.assign({}, cur || {}, patch);
      var steps = computeSteps(merged, cur && cur.steps);
      if (p.mark) { // 보기 단계 표시 (확인·뜻 확인·관련어 탐색)
        var marks = Array.isArray(p.mark) ? p.mark : [p.mark];
        marks.forEach(function (m) { oneOf(m, ['confirm', 'define', 'related'], '단계'); steps[m] = true; });
      }
      patch.steps = steps; patch.last_studied_at = now; patch.updated_at = now;
      if (cur) {
        patch.rev = cur.rev + 1;
        store.update('StudentVocabulary', cur.sv_id, patch);
        return get('StudentVocabulary', cur.sv_id);
      }
      var row = Object.assign({ sv_id: uid('SV'), user_id: ctx.user.user_id, vocabulary_id: vid, progress_status: 'IN_PROGRESS',
        comprehension_level: 0, box: 0, next_review_at: '', rev: 1 }, patch);
      store.insert('StudentVocabulary', row);
      return get('StudentVocabulary', row.sv_id);
    });

    /* ================================================================= 학생: 세 장면 작문 */
    function writingFor(user, vid, scene) {
      return where('Writings', function (w) { return w.user_id === user.user_id && w.vocabulary_id === vid && w.scene_type === scene; })[0];
    }

    def('writing.save', { auth: 'student', write: true }, function (ctx, p) {
      var vid = str(p.vocabulary_id, 60, '어휘');
      if (!vocabExists(vid, ctx.user)) fail('NOT_FOUND', '어휘를 찾을 수 없습니다.');
      var scene = oneOf(p.scene_type, SCENES, '장면');
      var mode = oneOf(p.mode || 'DRAFT', ['DRAFT', 'SUBMIT'], '저장 방식');
      var text = str(p.text, C.TEXT_MAX, '문장', mode === 'DRAFT');
      if (mode === 'SUBMIT' && trim(text).length < 5) fail('TOO_SHORT', '문장을 조금 더 써서 제출해 주세요. (5자 이상)');
      var cur = writingFor(ctx.user, vid, scene), now = nowIso();
      if (cur && p.base_rev !== undefined && Number(p.base_rev) !== cur.rev) fail('CONFLICT', '다른 기기에서 먼저 저장한 내용이 있습니다.', cur);
      if (!cur && p.base_rev) fail('CONFLICT', '기록이 바뀌었습니다. 다시 불러와 주세요.');
      var check = p.self_check && typeof p.self_check === 'object' ? pick(p.self_check, ['word', 'scene', 'meaning', 'mine']) : undefined;
      var row;
      if (!cur) {
        row = { writing_id: uid('W'), user_id: ctx.user.user_id, vocabulary_id: vid, scene_type: scene, draft_text: text, text: '',
          status: 'DRAFT', version: 0, self_check: check || {}, example_viewed: 0, rev: 1, created_at: now, saved_at: now, submitted_at: '' };
        if (mode === 'SUBMIT') { row.text = text; row.version = 1; row.status = 'SUBMITTED'; row.submitted_at = now; }
        store.insert('Writings', row);
        if (mode === 'SUBMIT') store.insert('WritingRevisions', { revision_id: uid('RV'), writing_id: row.writing_id, user_id: row.user_id, version: 1, text: text, saved_at: now });
      } else {
        var patch = { draft_text: text, saved_at: now, rev: cur.rev + 1 };
        if (check) patch.self_check = check;
        if (mode === 'SUBMIT') {
          if (cur.version > 0 && cur.text === text) fail('UNCHANGED', '고친 곳이 없습니다. 문장을 고친 뒤에 다시 제출해 주세요.');
          patch.text = text; patch.version = cur.version + 1; patch.status = 'SUBMITTED'; patch.submitted_at = now;
          store.insert('WritingRevisions', { revision_id: uid('RV'), writing_id: cur.writing_id, user_id: cur.user_id, version: patch.version, text: text, saved_at: now });
        } else {
          patch.status = cur.version > 0 ? 'REVISING' : 'DRAFT';
        }
        store.update('Writings', cur.writing_id, patch);
        row = get('Writings', cur.writing_id);
      }
      // 어휘 학습 기록의 마지막 학습 시각 갱신 (없으면 만들지 않는다)
      var sv = svFor(ctx.user, vid);
      if (sv) store.update('StudentVocabulary', sv.sv_id, { last_studied_at: now });
      return get('Writings', row.writing_id);
    });

    def('writing.feature', { auth: 'student', write: true }, function (ctx, p) { // 대표 문장으로 고르기(포트폴리오)
      var w = ownOr404(get('Writings', str(p.writing_id, 60, '글')), ctx.user);
      if (w.version < 1) fail('BAD_REQUEST', '제출한 문장만 대표 문장으로 고를 수 있습니다.');
      store.update('Writings', w.writing_id, { featured: p.featured ? 1 : 0 });
      return get('Writings', w.writing_id);
    });

    def('writing.mark_example', { auth: 'student', write: true }, function (ctx, p) {
      var w = ownOr404(get('Writings', str(p.writing_id, 60, '글')), ctx.user);
      store.update('Writings', w.writing_id, { example_viewed: 1 });
      return get('Writings', w.writing_id);
    });

    // 예시는 «먼저 작성한 뒤» 에만 보여 준다 (서버가 확인한다)
    def('writing.example', { auth: 'student' }, function (ctx, p) {
      var vid = str(p.vocabulary_id, 60, '어휘'), scene = oneOf(p.scene_type, SCENES, '장면');
      var w = writingFor(ctx.user, vid, scene);
      if (!w || (trim(w.draft_text).length < 5 && w.version === 0)) fail('WRITE_FIRST', '먼저 내 문장을 써 보세요. 쓴 다음에 예시를 볼 수 있어요.');
      var pr = where('WritingPrompts', function (x) { return x.vocabulary_id === vid && x.scene_type === scene; })[0];
      return { example: pr ? pr.example : '' };
    });

    def('writing.revisions', { auth: 'student' }, function (ctx, p) {
      var w = ownOr404(get('Writings', str(p.writing_id, 60, '글')), ctx.user);
      return where('WritingRevisions', function (r) { return r.writing_id === w.writing_id; }).sort(function (a, b) { return a.version - b.version; });
    });

    /* ================================================================= 학생: 나의 어휘 수집함 */
    function findDictMatches(normHead) {
      return where('Vocabulary', function (v) { return v.normalized_headword === normHead; })
        .map(function (v) { return pick(v, ['vocabulary_id', 'headword', 'origin', 'definition']); });
    }

    function collectionFields(p) {
      var f = {};
      if (p.discovered_at !== undefined) { f.discovered_at = str(p.discovered_at, 10, '발견 날짜', true); if (f.discovered_at && !/^\d{4}-\d{2}-\d{2}$/.test(f.discovered_at)) fail('BAD_REQUEST', '날짜 형식이 올바르지 않습니다.'); }
      if (p.medium !== undefined) f.medium = oneOf(str(p.medium, 20, '매체', true) || '기타', ['독서', '수업', '기사', '영상', '일상', '기타'], '매체');
      ['source_context', 'guessed_meaning', 'confirmed_meaning', 'self_explanation', 'example_sentence', 'related_words'].forEach(function (k) {
        if (p[k] !== undefined) f[k] = str(p[k], C.TEXT_MAX, k, true);
      });
      if (p.subject !== undefined) f.subject = str(p.subject, 20, '교과', true);
      if (p.tags !== undefined) f.tags = str(p.tags, 100, '태그', true);
      if (p.favorite !== undefined) f.favorite = p.favorite ? 1 : 0;
      return f;
    }

    def('collection.add', { auth: 'student', write: true }, function (ctx, p) {
      var head = trim(str(p.headword, 40, '낱말'));
      var nh = norm(head), now = nowIso();
      var mine = where('PersonalCollections', function (c) { return c.user_id === ctx.user.user_id && c.normalized_headword === nh && c.status !== 'PURGED'; });
      var matches = findDictMatches(nh);
      if ((mine.length || matches.length) && !p.confirm_duplicate) {
        // 중복 안내: 저장하지 않고 알려 준다. 학생이 «새 문맥으로 따로 저장» 을 고르면 confirm_duplicate 로 다시 보낸다.
        return { duplicate: true, mine: mine.map(function (c) { return pick(c, ['collection_id', 'headword', 'discovered_at', 'source_context', 'confirmed_meaning']); }), dictionary: matches };
      }
      var f = collectionFields(p);
      var row = Object.assign({ collection_id: uid('C'), user_id: ctx.user.user_id, headword: head, normalized_headword: nh,
        vocabulary_id: matches.length ? matches[0].vocabulary_id : '', duplicate_of: mine.length ? (mine[0].duplicate_of || mine[0].collection_id) : '',
        discovered_at: now.substr(0, 10), medium: '기타', favorite: 0, status: 'ACTIVE', share_status: 'NONE', rev: 1,
        created_at: now, updated_at: now }, f);
      store.insert('PersonalCollections', row);
      return { duplicate: false, item: get('PersonalCollections', row.collection_id) };
    });

    def('collection.save', { auth: 'student', write: true }, function (ctx, p) {
      var c = ownOr404(get('PersonalCollections', str(p.collection_id, 60, '수집함')), ctx.user);
      if (p.base_rev !== undefined && Number(p.base_rev) !== c.rev) fail('CONFLICT', '다른 기기에서 먼저 고친 내용이 있습니다.', c);
      var f = collectionFields(p);
      if (p.headword !== undefined) { f.headword = trim(str(p.headword, 40, '낱말')); f.normalized_headword = norm(f.headword); }
      f.rev = c.rev + 1; f.updated_at = nowIso();
      // 내용이 바뀌면 이미 승인된 공유는 다시 검토를 받아야 한다
      if (c.share_status === 'APPROVED' && (f.confirmed_meaning !== undefined || f.example_sentence !== undefined)) f.share_status = 'NONE';
      store.update('PersonalCollections', c.collection_id, f);
      return get('PersonalCollections', c.collection_id);
    });

    def('collection.trash', { auth: 'student', write: true }, function (ctx, p) {
      var c = ownOr404(get('PersonalCollections', str(p.collection_id, 60, '수집함')), ctx.user);
      store.update('PersonalCollections', c.collection_id, { status: p.restore ? 'ACTIVE' : 'TRASHED', trashed_at: p.restore ? '' : nowIso(), share_status: p.restore ? c.share_status : 'NONE', rev: c.rev + 1, updated_at: nowIso() });
      return get('PersonalCollections', c.collection_id);
    });

    def('collection.request_share', { auth: 'student', write: true }, function (ctx, p) {
      var c = ownOr404(get('PersonalCollections', str(p.collection_id, 60, '수집함')), ctx.user);
      if (c.status !== 'ACTIVE') fail('BAD_REQUEST', '지운 단어는 공유할 수 없습니다.');
      if (!trim(c.confirmed_meaning)) fail('BAD_REQUEST', '확인한 뜻을 먼저 적어 주세요.');
      store.update('PersonalCollections', c.collection_id, { share_status: 'PENDING', rev: c.rev + 1, updated_at: nowIso() });
      return get('PersonalCollections', c.collection_id);
    });

    /* ================================================================= 학생: 오늘의 문장·복습 */
    def('daily.save', { auth: 'student', write: true }, function (ctx, p) {
      var date = str(p.date, 10, '날짜');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('BAD_REQUEST', '날짜 형식이 올바르지 않습니다.');
      var text = str(p.text, C.TEXT_MAX, '문장');
      var vid = str(p.vocabulary_id, 60, '어휘', true);
      if (vid && !vocabExists(vid, ctx.user)) fail('NOT_FOUND', '어휘를 찾을 수 없습니다.');
      var now = nowIso();
      if (p.daily_id) {
        var d = ownOr404(get('DailySentences', str(p.daily_id, 60, '문장')), ctx.user);
        if (p.base_rev !== undefined && Number(p.base_rev) !== d.rev) fail('CONFLICT', '다른 기기에서 먼저 고친 내용이 있습니다.', d);
        store.update('DailySentences', d.daily_id, { text: text, vocabulary_id: vid, date: date, rev: d.rev + 1, updated_at: now });
        return get('DailySentences', d.daily_id);
      }
      var row = { daily_id: uid('D'), user_id: ctx.user.user_id, date: date, text: text, vocabulary_id: vid, rev: 1, created_at: now, updated_at: now, deleted: 0 };
      store.insert('DailySentences', row);
      return row;
    });

    def('daily.delete', { auth: 'student', write: true }, function (ctx, p) {
      var d = ownOr404(get('DailySentences', str(p.daily_id, 60, '문장')), ctx.user);
      store.update('DailySentences', d.daily_id, { deleted: 1, updated_at: nowIso() });
      return { deleted: true };
    });

    def('review.record', { auth: 'student', write: true }, function (ctx, p) {
      var vid = str(p.vocabulary_id, 60, '어휘');
      if (!vocabExists(vid, ctx.user)) fail('NOT_FOUND', '어휘를 찾을 수 없습니다.');
      var mode = oneOf(p.mode, ['recall', 'context', 'synonym', 'fix', 'improve', 'transfer'], '복습 방식');
      var result = oneOf(p.result, ['CORRECT', 'WRONG'], '결과');
      var now = nowIso();
      store.insert('ReviewRecords', { review_id: uid('RR'), user_id: ctx.user.user_id, vocabulary_id: vid, mode: mode, result: result,
        detail: str(p.detail, 500, '내용', true), created_at: now });
      var sv = svFor(ctx.user, vid);
      var box = sv ? sv.box : 0;
      box = result === 'CORRECT' ? Math.min(5, box + 1) : 1;
      var tr = mode === 'transfer' && result === 'CORRECT';
      if (sv) {
        var patch = { box: box, next_review_at: nextReview(box, now), last_studied_at: now };
        if (tr) patch.steps = Object.assign({}, sv.steps || {}, { transfer: true });
        store.update('StudentVocabulary', sv.sv_id, patch);
      } else {
        store.insert('StudentVocabulary', { sv_id: uid('SV'), user_id: ctx.user.user_id, vocabulary_id: vid, progress_status: 'IN_PROGRESS', steps: tr ? { transfer: true } : {},
          comprehension_level: 0, box: box, next_review_at: nextReview(box, now), last_studied_at: now, rev: 1, updated_at: now });
      }
      return { box: box, next_review_at: nextReview(box, now) };
    });

    def('feedback.read', { auth: 'student', write: true }, function (ctx, p) {
      var f = get('TeacherFeedback', str(p.feedback_id, 60, '피드백'));
      if (!f || f.student_id !== ctx.user.user_id) fail('NOT_FOUND', '피드백을 찾을 수 없습니다.');
      if (!f.read_at) store.update('TeacherFeedback', f.feedback_id, { read_at: nowIso() });
      return { read: true };
    });

    /* ================================================================= 교사: 학급·학생 */
    function newLoginId(cls, no) {
      var base = String(cls.grade) + (cls.class_name.replace(/\D/g, '').length ? ('0' + cls.class_name.replace(/\D/g, '')).slice(-2) : 'xx') + ('0' + no).slice(-2);
      var id = base, n = 0;
      while (where('Users', function (u) { return u.login_id.toLowerCase() === id.toLowerCase(); }).length) { n++; id = base + String.fromCharCode(96 + Math.min(n, 26)) + (n > 26 ? n : ''); }
      return id;
    }

    function createStudent(teacher, cls, name, no) {
      var now = nowIso(), code = newInviteCode(), salt = env.randomHex(16);
      var u = { user_id: uid('U'), role: 'student', login_id: newLoginId(cls, no), display_name: name, class_id: cls.class_id, student_no: no,
        credential_hash: '', salt: salt, invite_hash: hashSecret(normInvite(code), salt), invite_expires: hoursFrom(now, C.INVITE_DAYS * 24),
        status: 'ACTIVE', failed_count: 0, locked_until: '', created_at: now, last_login_at: '' };
      store.insert('Users', u);
      audit(teacher.user_id, 'student_create', u.user_id, '');
      return { user_id: u.user_id, login_id: u.login_id, display_name: name, student_no: no, invite_code: code, invite_expires: u.invite_expires };
    }

    def('class.list', { auth: 'teacher' }, function (ctx) {
      return where('Classes', function (c) { return c.teacher_id === ctx.user.user_id; });
    });

    def('class.create', { auth: 'teacher', write: true }, function (ctx, p) {
      var row = { class_id: uid('CL'), school_year: int(p.school_year, 2020, 2100, '학년도'), grade: int(p.grade, 1, 6, '학년'),
        class_name: str(p.class_name, 20, '반 이름'), teacher_id: ctx.user.user_id, created_at: nowIso() };
      store.insert('Classes', row);
      for (var i = 1; i <= C.LESSONS; i++) {
        store.insert('Lessons', { lesson_id: uid('LS'), class_id: row.class_id, lesson_number: i, title: i + '차시', goals: '', published: 0, due_date: '' });
      }
      audit(ctx.user.user_id, 'class_create', row.class_id, '');
      return row;
    });

    def('student.create', { auth: 'teacher', write: true }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      var list = Array.isArray(p.students) ? p.students : [{ name: p.display_name, no: p.student_no }];
      if (list.length > 60) fail('BAD_REQUEST', '한 번에 60명까지 만들 수 있습니다.');
      var used = {};
      where('Users', function (u) { return u.class_id === cls.class_id && u.role === 'student'; }).forEach(function (u) { used[u.student_no] = true; });
      return list.map(function (s) {
        var no = int(s.no, 1, 99, '번호'), name = trim(str(s.name, 20, '이름'));
        if (used[no]) fail('DUPLICATE', no + '번 학생은 이미 있습니다.');
        used[no] = true;
        return createStudent(ctx.user, cls, name, no);
      });
    });

    def('student.reset', { auth: 'teacher', write: true }, function (ctx, p) { // 계정 복구: 새 초대 코드를 주고 기존 로그인을 끊는다
      var s = requireTeacherOfStudent(ctx.user, p.user_id);
      var now = nowIso(), code = newInviteCode(), salt = env.randomHex(16);
      store.update('Users', s.user_id, { salt: salt, credential_hash: '', invite_hash: hashSecret(normInvite(code), salt),
        invite_expires: hoursFrom(now, C.INVITE_DAYS * 24), failed_count: 0, locked_until: '' });
      where('Sessions', function (x) { return x.user_id === s.user_id; }).forEach(function (x) { store.remove('Sessions', x.token_hash); });
      audit(ctx.user.user_id, 'student_reset', s.user_id, '');
      return { login_id: s.login_id, display_name: s.display_name, invite_code: code, invite_expires: hoursFrom(now, C.INVITE_DAYS * 24) };
    });

    def('student.set_status', { auth: 'teacher', write: true }, function (ctx, p) {
      var s = requireTeacherOfStudent(ctx.user, p.user_id);
      var st = oneOf(p.status, ['ACTIVE', 'DISABLED'], '상태');
      store.update('Users', s.user_id, { status: st });
      if (st === 'DISABLED') where('Sessions', function (x) { return x.user_id === s.user_id; }).forEach(function (x) { store.remove('Sessions', x.token_hash); });
      audit(ctx.user.user_id, 'student_status_' + st, s.user_id, '');
      return { status: st };
    });

    // 개인정보 삭제 정책: 학생 계정과 그 학생의 모든 기록을 지운다 (되돌릴 수 없음)
    def('student.purge', { auth: 'teacher', write: true }, function (ctx, p) {
      var s = requireTeacherOfStudent(ctx.user, p.user_id);
      if (p.confirm !== s.login_id) fail('CONFIRM_REQUIRED', '확인을 위해 학생 아이디를 정확히 입력해야 합니다.');
      var removed = 0;
      ['StudentVocabulary', 'PersonalCollections', 'Writings', 'WritingRevisions', 'DailySentences', 'ReviewRecords', 'Sessions'].forEach(function (t) {
        where(t, function (r) { return r.user_id === s.user_id; }).forEach(function (r) { store.remove(t, r[keyOf(t)]); removed++; });
      });
      where('TeacherFeedback', function (r) { return r.student_id === s.user_id; }).forEach(function (r) { store.remove('TeacherFeedback', r.feedback_id); removed++; });
      store.remove('Users', s.user_id);
      audit(ctx.user.user_id, 'student_purge', s.user_id, 'rows=' + removed);
      return { removed: removed + 1 };
    });

    function studentSummary(u, ix) {
      var sv = ix.sv[u.user_id] || [], ws = ix.writings[u.user_id] || [], cs = ix.collections[u.user_id] || [];
      var wByV = {}; ws.forEach(function (w) { (wByV[w.vocabulary_id] = wByV[w.vocabulary_id] || []).push(w); });
      var svBy = {}; sv.forEach(function (x) { svBy[x.vocabulary_id] = x; });
      var schoolDone = 0, natStarted = 0, natDone = 0, active = 0;
      Object.keys(ix.origin).forEach(function (vid) {
        var o = ix.origin[vid];
        var x = svBy[vid], w = wByV[vid];
        if (o === 'NATIONAL') { if (x || w) natStarted++; }
        if (!x && !w) return;
        var st = vocabStatus(o, x, w);
        if (st.done) { if (o === 'SCHOOL') schoolDone++; else natDone++; }
        if (st.level.active) active++;
      });
      var last = ''; sv.concat(ws).forEach(function (r) { var t = r.last_studied_at || r.saved_at || ''; if (t > last) last = t; });
      return { user_id: u.user_id, login_id: u.login_id, display_name: u.display_name, student_no: u.student_no, status: u.status,
        activated: !!u.credential_hash, school_done: schoolDone, national_started: natStarted, national_done: natDone, active_words: active,
        collections: cs.filter(function (c) { return c.status === 'ACTIVE'; }).length,
        writings_submitted: ws.filter(function (w) { return w.version > 0; }).length,
        pending_share: cs.filter(function (c) { return c.share_status === 'PENDING'; }).length, last_active: last, last_login_at: u.last_login_at };
    }

    function buildIndex(studentIds) {
      var set = {}; studentIds.forEach(function (i) { set[i] = true; });
      function group(t, key) { var g = {}; all(t).forEach(function (r) { if (set[r.user_id]) (g[r.user_id] = g[r.user_id] || []).push(r); }); return g; }
      var origin = {}; all('Vocabulary').forEach(function (v) { origin[v.vocabulary_id] = v.origin; });
      return { sv: group('StudentVocabulary'), writings: group('Writings'), collections: group('PersonalCollections'), origin: origin };
    }

    def('student.list', { auth: 'teacher' }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      var us = where('Users', function (u) { return u.class_id === cls.class_id && u.role === 'student'; }).sort(function (a, b) { return a.student_no - b.student_no; });
      var ix = buildIndex(us.map(function (u) { return u.user_id; }));
      return us.map(function (u) { return studentSummary(u, ix); });
    });

    def('student.detail', { auth: 'teacher' }, function (ctx, p) {
      var s = requireTeacherOfStudent(ctx.user, p.user_id);
      audit(ctx.user.user_id, 'view_student', s.user_id, '');
      var writings = where('Writings', function (w) { return w.user_id === s.user_id; });
      var wIds = {}; writings.forEach(function (w) { wIds[w.writing_id] = true; });
      var daily = where('DailySentences', function (d) { return d.user_id === s.user_id && !d.deleted; });
      var dIds = {}; daily.forEach(function (d) { dIds[d.daily_id] = true; });
      return {
        user: publicUser(s),
        sv: where('StudentVocabulary', function (x) { return x.user_id === s.user_id; }),
        collections: where('PersonalCollections', function (x) { return x.user_id === s.user_id; }),
        writings: writings,
        revisions: where('WritingRevisions', function (r) { return wIds[r.writing_id]; }),
        daily: daily,
        reviews: where('ReviewRecords', function (x) { return x.user_id === s.user_id; }),
        feedback: where('TeacherFeedback', function (f) { return f.student_id === s.user_id; })
      };
    });

    /* ================================================================= 교사: 차시·과제·내용 */
    def('lesson.list', { auth: 'teacher' }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      return lessonsForClass(cls.class_id, false);
    });

    def('lesson.save', { auth: 'teacher', write: true }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      var n = int(p.lesson_number, 1, C.LESSONS, '차시');
      var l = where('Lessons', function (x) { return x.class_id === cls.class_id && x.lesson_number === n; })[0];
      var patch = {};
      if (p.title !== undefined) patch.title = str(p.title, 80, '제목');
      if (p.goals !== undefined) patch.goals = str(p.goals, 500, '학습 목표', true);
      if (p.published !== undefined) patch.published = p.published ? 1 : 0;
      if (p.due_date !== undefined) patch.due_date = str(p.due_date, 10, '기한', true);
      if (!l) { l = Object.assign({ lesson_id: uid('LS'), class_id: cls.class_id, lesson_number: n, title: n + '차시', goals: '', published: 0, due_date: '' }, patch); store.insert('Lessons', l); }
      else store.update('Lessons', l.lesson_id, patch);
      return lessonsForClass(cls.class_id, false).filter(function (x) { return x.lesson_number === n; })[0];
    });

    def('lesson.set_vocab', { auth: 'teacher', write: true }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      var n = int(p.lesson_number, 1, C.LESSONS, '차시');
      if (!Array.isArray(p.items) || p.items.length > 60) fail('BAD_REQUEST', '어휘 목록이 올바르지 않습니다.');
      var seen = {};
      p.items.forEach(function (it) {
        str(it.vocabulary_id, 60, '어휘');
        if (!get('Vocabulary', it.vocabulary_id)) fail('NOT_FOUND', '없는 어휘가 있습니다.');
        if (seen[it.vocabulary_id]) fail('DUPLICATE', '같은 어휘가 두 번 들어 있습니다.');
        seen[it.vocabulary_id] = true;
      });
      where('LessonVocabulary', function (x) { return x.class_id === cls.class_id && x.lesson_number === n; }).forEach(function (x) { store.remove('LessonVocabulary', x.lv_id); });
      p.items.forEach(function (it, i) {
        store.insert('LessonVocabulary', { lv_id: uid('LV'), class_id: cls.class_id, lesson_number: n, vocabulary_id: it.vocabulary_id, required: it.required === false ? 0 : 1, sort: i });
      });
      return lessonsForClass(cls.class_id, false).filter(function (x) { return x.lesson_number === n; })[0];
    });

    // 학교 필수 어휘를 교과별로 묶어 34개 차시에 고르게 나눈다 (제안일 뿐, 교사가 고칠 수 있다)
    def('lesson.auto_distribute', { auth: 'teacher', write: true }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      var school = where('Vocabulary', function (v) { return v.origin === 'SCHOOL'; });
      var order = ['국어', '역사', '도덕', '과학', '수학', '기가'];
      school.sort(function (a, b) { var d = order.indexOf(a.subject) - order.indexOf(b.subject); return d || (a.headword < b.headword ? -1 : 1); });
      where('LessonVocabulary', function (x) { return x.class_id === cls.class_id; }).forEach(function (x) { store.remove('LessonVocabulary', x.lv_id); });
      school.forEach(function (v, i) { // 34개 차시에 고르게(한 차시 3~4개) 나눈다
        var n = Math.min(C.LESSONS, Math.floor(i * C.LESSONS / school.length) + 1);
        store.insert('LessonVocabulary', { lv_id: uid('LV'), class_id: cls.class_id, lesson_number: n, vocabulary_id: v.vocabulary_id, required: 1, sort: i });
      });
      audit(ctx.user.user_id, 'lesson_auto_distribute', cls.class_id, '');
      return lessonsForClass(cls.class_id, false);
    });

    def('vocab.save', { auth: 'teacher', write: true }, function (ctx, p) { // 뜻풀이 검토·수정, 새 어휘 추가
      var now = nowIso();
      if (p.vocabulary_id) {
        var v = get('Vocabulary', str(p.vocabulary_id, 60, '어휘'));
        if (!v) fail('NOT_FOUND', '어휘를 찾을 수 없습니다.');
        var patch = { edited_at: now, edited_by: ctx.user.user_id };
        if (p.definition !== undefined) patch.definition = str(p.definition, 500, '뜻풀이');
        patch.definition_status = oneOf(p.definition_status || 'TEACHER_REVIEWED', ['DRAFT_REVIEW', 'TEACHER_REVIEWED', 'NATIONAL_CARD', 'CUSTOM'], '검토 상태');
        store.update('Vocabulary', v.vocabulary_id, patch);
        audit(ctx.user.user_id, 'vocab_edit', v.vocabulary_id, '');
        return get('Vocabulary', v.vocabulary_id);
      }
      var head = trim(str(p.headword, 40, '낱말'));
      var row = { vocabulary_id: uid('V-C'), headword: head, normalized_headword: norm(head), sense_id: 'C1', definition: str(p.definition, 500, '뜻풀이'),
        definition_status: 'CUSTOM', semantic_category: '', origin: 'CUSTOM', subject: str(p.subject, 20, '교과', true), edited_at: now, edited_by: ctx.user.user_id };
      store.insert('Vocabulary', row);
      store.insert('VocabularySources', { source_id: uid('SRC'), vocabulary_id: row.vocabulary_id, source_type: 'PERSONAL', original_entry_id: 'teacher:' + ctx.user.user_id,
        subject: row.subject, publisher: '', page: '', permission_status: 'SCHOOL_OWN' });
      return row;
    });

    def('prompt.save', { auth: 'teacher', write: true }, function (ctx, p) { // 작문 상황·사고 질문·예시 수정/추가
      var vid = str(p.vocabulary_id, 60, '어휘');
      if (!get('Vocabulary', vid)) fail('NOT_FOUND', '어휘를 찾을 수 없습니다.');
      var scene = oneOf(p.scene_type, SCENES, '장면');
      var cur = where('WritingPrompts', function (x) { return x.vocabulary_id === vid && x.scene_type === scene; })[0];
      var patch = { scenario: str(p.scenario, 500, '상황'), guiding_question: str(p.guiding_question, 300, '사고 질문'), example: str(p.example, 500, '예시', true),
        content_status: 'TEACHER_REVIEWED', edited_at: nowIso(), edited_by: ctx.user.user_id };
      if (cur) store.update('WritingPrompts', cur.prompt_id, patch);
      else store.insert('WritingPrompts', Object.assign({ prompt_id: uid('P'), vocabulary_id: vid, scene_type: scene, origin: 'CUSTOM' }, patch));
      return where('WritingPrompts', function (x) { return x.vocabulary_id === vid && x.scene_type === scene; })[0];
    });

    def('prompt.get', { auth: 'teacher' }, function (ctx, p) { // 교사는 예시 문장까지 볼 수 있다
      var vid = str(p.vocabulary_id, 60, '어휘');
      return where('WritingPrompts', function (x) { return x.vocabulary_id === vid; });
    });

    def('activity.save', { auth: 'teacher', write: true }, function (ctx, p) { // 복습 문항 추가
      var vid = str(p.vocabulary_id, 60, '어휘');
      if (!get('Vocabulary', vid)) fail('NOT_FOUND', '어휘를 찾을 수 없습니다.');
      var row = { activity_id: uid('A'), vocabulary_id: vid, type: oneOf(p.type, ['context', 'synonym', 'fix', 'transfer'], '유형'),
        prompt: str(p.prompt, 500, '문항'), answer_key: str(p.answer_key, 300, '정답', true), content_status: 'TEACHER_REVIEWED', created_by: ctx.user.user_id, created_at: nowIso() };
      store.insert('LearningActivities', row);
      return row;
    });

    /* ================================================================= 교사: 피드백·수집 어휘 검토 */
    def('feedback.save', { auth: 'teacher', write: true }, function (ctx, p) {
      var tid = str(p.target_id, 60, '대상'), type = oneOf(p.target_type || 'WRITING', ['WRITING', 'DAILY'], '대상 종류');
      var target = type === 'WRITING' ? get('Writings', tid) : get('DailySentences', tid);
      if (!target) fail('NOT_FOUND', '대상을 찾을 수 없습니다.');
      requireTeacherOfStudent(ctx.user, target.user_id);
      var rubric = {};
      if (p.rubric) RUBRIC.forEach(function (k) { if (p.rubric[k] !== undefined && p.rubric[k] !== null && p.rubric[k] !== '') rubric[k] = int(p.rubric[k], 1, 4, RUBRIC_LABEL[k]); });
      var comment = str(p.comment, 1000, '피드백', true);
      if (!comment && !Object.keys(rubric).length) fail('BAD_REQUEST', '피드백 글이나 점수를 하나 이상 넣어 주세요.');
      var now = nowIso();
      var cur = where('TeacherFeedback', function (f) { return f.target_id === tid && f.teacher_id === ctx.user.user_id; })[0];
      if (cur) { store.update('TeacherFeedback', cur.feedback_id, { comment: comment, rubric: rubric, updated_at: now, read_at: '' }); return get('TeacherFeedback', cur.feedback_id); }
      var row = { feedback_id: uid('F'), target_id: tid, target_type: type, student_id: target.user_id, teacher_id: ctx.user.user_id, comment: comment, rubric: rubric, created_at: now, updated_at: now, read_at: '' };
      store.insert('TeacherFeedback', row);
      return row;
    });

    def('collection.review', { auth: 'teacher', write: true }, function (ctx, p) {
      var c = get('PersonalCollections', str(p.collection_id, 60, '수집함'));
      if (!c) fail('NOT_FOUND', '단어를 찾을 수 없습니다.');
      requireTeacherOfStudent(ctx.user, c.user_id);
      var d = oneOf(p.decision, ['APPROVED', 'REJECTED'], '결정');
      store.update('PersonalCollections', c.collection_id, { share_status: d, share_note: str(p.note, 300, '메모', true), rev: c.rev + 1, updated_at: nowIso() });
      audit(ctx.user.user_id, 'collection_' + d, c.collection_id, '');
      return get('PersonalCollections', c.collection_id);
    });

    def('review.pending', { auth: 'teacher' }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      var members = {}; where('Users', function (u) { return u.class_id === cls.class_id && u.role === 'student'; }).forEach(function (u) { members[u.user_id] = u.display_name; });
      return where('PersonalCollections', function (c) { return members[c.user_id] && c.share_status === 'PENDING'; })
        .map(function (c) { return Object.assign(pick(c, ['collection_id', 'headword', 'confirmed_meaning', 'example_sentence', 'source_context', 'subject']), { student: members[c.user_id], user_id: c.user_id }); });
    });

    /* ================================================================= 교사: 통계·내보내기·백업 */
    def('stats.class', { auth: 'teacher' }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      var us = where('Users', function (u) { return u.class_id === cls.class_id && u.role === 'student'; });
      var ids = us.map(function (u) { return u.user_id; });
      var ix = buildIndex(ids);
      var sums = us.map(function (u) { return studentSummary(u, ix); });
      var bySubject = {};
      var vmap = {}; all('Vocabulary').forEach(function (v) { vmap[v.vocabulary_id] = v; });
      var wordCount = {};
      ids.forEach(function (id) {
        (ix.writings[id] || []).forEach(function (w) { if (w.version > 0) wordCount[w.vocabulary_id] = (wordCount[w.vocabulary_id] || 0) + 1; });
        (ix.sv[id] || []).forEach(function (x) { var v = vmap[x.vocabulary_id]; if (v && v.origin === 'SCHOOL') {
          var st = vocabStatus('SCHOOL', x, (ix.writings[id] || []).filter(function (w) { return w.vocabulary_id === x.vocabulary_id; }));
          var s = bySubject[v.subject] = bySubject[v.subject] || { started: 0, done: 0 };
          s.started++; if (st.done) s.done++;
        } });
      });
      var feedbackTotal = where('TeacherFeedback', function (f) { return f.teacher_id === ctx.user.user_id; }).length;
      return { students: sums, by_subject: bySubject, feedback_total: feedbackTotal,
        incomplete_required: requiredIncomplete(cls.class_id, ids, ix) };
    });

    function requiredIncomplete(classId, ids, ix) {
      var req = {}; where('LessonVocabulary', function (x) { return x.class_id === classId && x.required; }).forEach(function (x) { req[x.vocabulary_id] = true; });
      var out = {};
      ids.forEach(function (id) {
        var svBy = {}; (ix.sv[id] || []).forEach(function (x) { svBy[x.vocabulary_id] = x; });
        var wBy = {}; (ix.writings[id] || []).forEach(function (w) { (wBy[w.vocabulary_id] = wBy[w.vocabulary_id] || []).push(w); });
        var left = 0;
        Object.keys(req).forEach(function (vid) { if (!vocabStatus(ix.origin[vid] || 'SCHOOL', svBy[vid], wBy[vid]).done) left++; });
        out[id] = left;
      });
      return out;
    }

    // 내보내기: 서버는 행(배열)을 돌려주고, 화면이 CSV/XLSX 파일로 만든다. 접근 기록을 남긴다.
    def('export.class', { auth: 'teacher' }, function (ctx, p) {
      var cls = requireTeacherOfClass(ctx.user, p.class_id);
      var kind = oneOf(p.kind, ['progress', 'writings', 'collections'], '내보내기 종류');
      var us = where('Users', function (u) { return u.class_id === cls.class_id && u.role === 'student'; }).sort(function (a, b) { return a.student_no - b.student_no; });
      var uMap = {}; us.forEach(function (u) { uMap[u.user_id] = u; });
      var vmap = {}; all('Vocabulary').forEach(function (v) { vmap[v.vocabulary_id] = v; });
      audit(ctx.user.user_id, 'export_' + kind, cls.class_id, '');
      var rows;
      if (kind === 'progress') {
        var ix = buildIndex(us.map(function (u) { return u.user_id; }));
        rows = [['번호', '이름', '아이디', '학교 어휘 완료', '국가 어휘 시작', '국가 어휘 완료', '능동 어휘', '수집 어휘', '제출한 문장', '마지막 학습']]
          .concat(us.map(function (u) { var s = studentSummary(u, ix); return [s.student_no, s.display_name, s.login_id, s.school_done, s.national_started, s.national_done, s.active_words, s.collections, s.writings_submitted, s.last_active]; }));
      } else if (kind === 'writings') {
        rows = [['번호', '이름', '어휘', '장면', '제출한 문장', '제출 횟수', '제출 시각']];
        where('Writings', function (w) { return uMap[w.user_id] && w.version > 0; }).sort(function (a, b) { return uMap[a.user_id].student_no - uMap[b.user_id].student_no; })
          .forEach(function (w) { var v = vmap[w.vocabulary_id]; rows.push([uMap[w.user_id].student_no, uMap[w.user_id].display_name, v ? v.headword : '(내 단어)', SCENE_LABEL[w.scene_type], w.text, w.version, w.submitted_at]); });
      } else {
        rows = [['번호', '이름', '낱말', '발견한 날', '매체', '확인한 뜻', '예문', '공유 상태']];
        where('PersonalCollections', function (c) { return uMap[c.user_id] && c.status === 'ACTIVE'; })
          .forEach(function (c) { rows.push([uMap[c.user_id].student_no, uMap[c.user_id].display_name, c.headword, c.discovered_at, c.medium, c.confirmed_meaning, c.example_sentence, c.share_status]); });
      }
      return { filename: cls.school_year + '_' + cls.grade + '학년' + cls.class_name + '_' + kind, rows: rows.map(function (r, i) { return i === 0 ? r : r.map(csvSafe); }) };
    });

    var BACKUP_TABLES = ['Classes', 'Users', 'Lessons', 'LessonVocabulary', 'StudentVocabulary', 'PersonalCollections', 'Writings', 'WritingRevisions',
      'DailySentences', 'ReviewRecords', 'TeacherFeedback'];

    def('backup.export', { auth: 'teacher' }, function (ctx) {
      var classes = where('Classes', function (c) { return c.teacher_id === ctx.user.user_id; });
      var cset = {}; classes.forEach(function (c) { cset[c.class_id] = true; });
      var users = where('Users', function (u) { return cset[u.class_id] && u.role === 'student'; });
      var uset = {}; users.forEach(function (u) { uset[u.user_id] = true; });
      var wset = {}; where('Writings', function (w) { return uset[w.user_id]; }).forEach(function (w) { wset[w.writing_id] = true; });
      var data = {
        Classes: classes,
        Users: users.map(function (u) { return Object.assign({}, u); }), // 비밀번호 해시도 포함: 복원 후에도 같은 비밀번호로 로그인되게
        Lessons: where('Lessons', function (r) { return cset[r.class_id]; }),
        LessonVocabulary: where('LessonVocabulary', function (r) { return cset[r.class_id]; }),
        StudentVocabulary: where('StudentVocabulary', function (r) { return uset[r.user_id]; }),
        PersonalCollections: where('PersonalCollections', function (r) { return uset[r.user_id]; }),
        Writings: where('Writings', function (r) { return uset[r.user_id]; }),
        WritingRevisions: where('WritingRevisions', function (r) { return wset[r.writing_id]; }),
        DailySentences: where('DailySentences', function (r) { return uset[r.user_id]; }),
        ReviewRecords: where('ReviewRecords', function (r) { return uset[r.user_id]; }),
        TeacherFeedback: where('TeacherFeedback', function (r) { return uset[r.student_id]; })
      };
      audit(ctx.user.user_id, 'backup_export', '', '');
      return { format: 'vocab-backup-1', created_at: nowIso(), teacher_id: ctx.user.user_id, data: data };
    });

    // 복원: 내 학급에 속한 행만 «있으면 덮어쓰고 없으면 추가». 지우지는 않는다.
    def('backup.restore', { auth: 'teacher', write: true }, function (ctx, p) {
      var b = p.backup;
      if (!b || b.format !== 'vocab-backup-1' || b.teacher_id !== ctx.user.user_id || !b.data) fail('BAD_REQUEST', '이 선생님의 백업 파일이 아닙니다.');
      var mine = {}; where('Classes', function (c) { return c.teacher_id === ctx.user.user_id; }).forEach(function (c) { mine[c.class_id] = true; });
      (b.data.Classes || []).forEach(function (c) { if (c.teacher_id === ctx.user.user_id) mine[c.class_id] = true; });
      var userIn = {}; (b.data.Users || []).forEach(function (u) { if (mine[u.class_id]) userIn[u.user_id] = true; });
      var n = 0;
      BACKUP_TABLES.forEach(function (t) {
        (b.data[t] || []).forEach(function (r) {
          var ok = (t === 'Classes') ? r.teacher_id === ctx.user.user_id
            : (t === 'Users') ? (mine[r.class_id] && r.role === 'student')
            : (t === 'Lessons' || t === 'LessonVocabulary') ? mine[r.class_id]
            : (t === 'TeacherFeedback') ? (userIn[r.student_id] && r.teacher_id === ctx.user.user_id)
            : (t === 'WritingRevisions') ? userIn[r.user_id]
            : userIn[r.user_id];
          if (!ok) return;
          var key = r[keyOf(t)];
          if (get(t, key)) store.update(t, key, r); else store.insert(t, r);
          n++;
        });
      });
      audit(ctx.user.user_id, 'backup_restore', '', 'rows=' + n);
      return { restored: n };
    });

    def('audit.list', { auth: 'teacher' }, function (ctx) {
      var mineIds = {}; mineIds[ctx.user.user_id] = true;
      where('Users', function (u) { return u.role === 'student'; }).forEach(function (u) { var c = get('Classes', u.class_id); if (c && c.teacher_id === ctx.user.user_id) mineIds[u.user_id] = true; });
      return where('AuditLogs', function (l) { return mineIds[l.actor_id] || mineIds[l.target_id]; }).slice(-200).reverse();
    });

    /* ================================================================= 요청 처리기 */
    function cleanReqLog(now) {
      var cut = minutesFrom(now, -C.REQLOG_MINUTES);
      where('ReqLog', function (r) { return r.created_at < cut; }).forEach(function (r) { store.remove('ReqLog', r.req_id); });
    }

    function run(req) {
      var d = H[req.action];
      var ctx = {};
      if (d.auth !== 'none') {
        var a = authenticate(req.token);
        ctx.user = a.user; ctx.session = a.session;
        if (d.auth === 'teacher' && a.user.role !== 'teacher') fail('FORBIDDEN', '선생님만 쓸 수 있는 기능입니다.');
        if (d.auth === 'student' && a.user.role !== 'student') fail('FORBIDDEN', '학생 화면에서만 쓸 수 있습니다.');
      }
      var payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
      if (!d.write) return d.fn(ctx, payload);
      return env.lock(function () {
        var now = nowIso(), rid = isStr(req.req_id) && req.req_id.length <= 64 ? req.req_id : '';
        if (rid && ctx.user) { // 같은 요청이 두 번 들어오면(재전송·더블클릭) 처음 결과를 그대로 돌려준다
          var prior = get('ReqLog', rid);
          if (prior && prior.user_id === ctx.user.user_id) return JSON.parse(prior.response);
        }
        // 잠금 안에서 세션을 다시 확인한다 (로그아웃·비밀번호 변경과 겹치는 경우)
        if (ctx.user) { var again = get('Sessions', ctx.session.token_hash); if (!again && d.fn !== H['auth.logout'].fn) fail('UNAUTHENTICATED', '로그인이 필요합니다.'); }
        var out = d.fn(ctx, payload);
        if (rid && ctx.user && action_isSave(req.action)) {
          cleanReqLog(now);
          store.insert('ReqLog', { req_id: rid, user_id: ctx.user.user_id, response: JSON.stringify(out), created_at: now });
        }
        return out;
      });
    }
    // 처음 결과를 다시 돌려줄 수 있는 «저장» 요청만 기록한다. 초대 코드·로그인 토큰이 든 응답은 시트에 남기지 않는다.
    var REPLAYABLE = { 'sv.save': 1, 'writing.save': 1, 'collection.add': 1, 'collection.save': 1, 'collection.trash': 1,
      'daily.save': 1, 'review.record': 1, 'feedback.save': 1 };
    function action_isSave(a) { return !!REPLAYABLE[a]; }

    function handle(req) {
      try {
        if (!req || typeof req !== 'object' || !isStr(req.action) || !H[req.action]) fail('NOT_FOUND', '알 수 없는 요청입니다.');
        return { ok: true, data: run(req) };
      } catch (e) {
        if (e && e.code) return { ok: false, error: { code: e.code, message: e.message, data: e.data === undefined ? undefined : e.data } };
        if (env.log) env.log(e);
        return { ok: false, error: { code: 'INTERNAL', message: '서버에서 문제가 생겼습니다. 잠시 뒤에 다시 해 보세요.' } };
      }
    }

    /* ---------- 관리용(웹으로 열리지 않음): 교사 계정 만들기, 어휘 데이터 넣기 ---------- */
    function createTeacher(loginId, displayName) {
      return env.lock(function () {
        loginId = str(loginId, 40, '아이디'); displayName = str(displayName, 20, '이름');
        if (where('Users', function (u) { return u.login_id.toLowerCase() === loginId.toLowerCase(); }).length) fail('DUPLICATE', '이미 있는 아이디입니다.');
        var now = nowIso(), code = newInviteCode(), salt = env.randomHex(16);
        store.insert('Users', { user_id: uid('U'), role: 'teacher', login_id: loginId, display_name: displayName, class_id: '', student_no: 0,
          credential_hash: '', salt: salt, invite_hash: hashSecret(normInvite(code), salt), invite_expires: hoursFrom(now, C.INVITE_DAYS * 24),
          status: 'ACTIVE', failed_count: 0, locked_until: '', created_at: now, last_login_at: '' });
        return { login_id: loginId, invite_code: code, note: '이 초대 코드는 한 번만 보여 드립니다. 로그인 화면의 «처음 오셨나요?» 에서 쓰세요.' };
      });
    }

    function bulk(table, rows) {
      if (!rows.length) return;
      if (store.insertMany) store.insertMany(table, rows);
      else rows.forEach(function (r) { store.insert(table, r); });
    }

    /** 새 초대 코드를 주고 비밀번호를 비운다 (비밀번호를 잊은 교사용). */
    function resetInvite(loginId) {
      return env.lock(function () {
        var u = where('Users', function (x) { return x.login_id.toLowerCase() === String(loginId).toLowerCase(); })[0];
        if (!u) fail('NOT_FOUND', '그 아이디의 계정이 없습니다.');
        var now = nowIso(), code = newInviteCode(), salt = env.randomHex(16);
        store.update('Users', u.user_id, { salt: salt, credential_hash: '', invite_hash: hashSecret(normInvite(code), salt),
          invite_expires: hoursFrom(now, C.INVITE_DAYS * 24), failed_count: 0, locked_until: '' });
        where('Sessions', function (s) { return s.user_id === u.user_id; }).forEach(function (s) { store.remove('Sessions', s.token_hash); });
        audit('admin', 'reset_invite', u.user_id, '');
        return { login_id: u.login_id, invite_code: code };
      });
    }

    function seed(vocabJson, examples) {
      examples = examples || {};
      return env.lock(function () {
        function missing(t, rows) { var have = {}, k = keyOf(t); all(t).forEach(function (r) { have[r[k]] = true; }); return rows.filter(function (r) { return !have[r[k]]; }); }
        var vs = missing('Vocabulary', vocabJson.vocabulary.map(function (v) { return Object.assign({ edited_at: '', edited_by: '' }, v); }));
        bulk('Vocabulary', vs);
        bulk('VocabularySources', missing('VocabularySources', vocabJson.sources));
        bulk('VocabularyRelations', missing('VocabularyRelations', vocabJson.relations));
        bulk('WritingPrompts', missing('WritingPrompts', vocabJson.prompts.map(function (s) {
          return Object.assign({ example: examples[s.prompt_id] || '', origin: 'SEED', edited_at: '', edited_by: '' }, s); })));
        return { vocabulary_added: vs.length };
      });
    }

    return { handle: handle, createTeacher: createTeacher, resetInvite: resetInvite, seed: seed, actions: Object.keys(H) };
  }

  return {
    create: create, TABLES: TABLES, C: C, RUBRIC: RUBRIC, RUBRIC_LABEL: RUBRIC_LABEL, SCENES: SCENES, SCENE_LABEL: SCENE_LABEL,
    toRow: toRow, fromRow: fromRow, colName: colName, keyOf: keyOf,
    util: { norm: norm, trim: trim, vocabStatus: vocabStatus, computeSteps: computeSteps, submittedScenes: submittedScenes, nextReview: nextReview, BOX_DAYS: BOX_DAYS }
  };
})();
