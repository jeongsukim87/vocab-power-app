/* 교사 화면: 학생·계정, 차시·과제, 어휘·장면, 현황(통계·검토·접근 기록), 자료·백업 */
(function () {
  'use strict';
  var T = Views.teacher = {};
  var U = VocabCore.util, SL = VocabCore.SCENE_LABEL;
  var MODE_LABEL = { recall: '뜻→낱말', context: '문맥 고르기', synonym: '유의어·반의어', fix: '오류 고치기', improve: '문장 고치기', transfer: '새 상황 쓰기' };
  var ACTION_LABEL = { login: '로그인', login_failed: '로그인 실패', activate: '비밀번호 만듦', change_password: '비밀번호 변경', student_create: '학생 계정 만듦', student_reset: '새 초대 코드', student_status_ACTIVE: '사용 재개', student_status_DISABLED: '사용 중지', student_purge: '학생 삭제', class_create: '학급 만듦', view_student: '학생 기록 열람', export_progress: '진도 내려받기', export_writings: '문장 내려받기', export_collections: '수집어휘 내려받기', backup_export: '백업 받음', backup_restore: '백업 복원', collection_APPROVED: '수집어휘 승인', collection_REJECTED: '수집어휘 거절', lesson_auto_distribute: '차시 자동 나누기', vocab_edit: '뜻풀이 수정', reset_invite: '초대 코드 재발급' };
  function put(el, h) { el.innerHTML = h.s; }
  function cls() { return S.classes.filter(function (c) { return c.class_id === S.classId; })[0] || null; }

  /* ---------- 공통: 학급 고르기 ---------- */
  function classBar() {
    return html`<div class="row between" style="margin-bottom:12px"><div class="row"><label class="sr-only" for="cls">학급</label>
      <select id="cls" style="width:auto;font-weight:700">${S.classes.map(function (c) { return html`<option value="${c.class_id}" ${c.class_id === S.classId ? 'selected' : ''}>${c.school_year}학년도 ${c.grade}학년 ${c.class_name}</option>`; })}</select></div>
      <button class="btn small" id="newcls">＋ 새 학급</button></div>`;
  }
  function bindClassBar(root) {
    var sel = $('#cls', root); if (sel) sel.onchange = function () { S.classId = sel.value; try { localStorage.setItem('vp_class', S.classId); } catch (e) {} App.route(); };
    var nb = $('#newcls', root); if (nb) nb.onclick = createClass;
  }
  async function createClass() {
    var y = new Date().getFullYear();
    var out = await UI.modal({ title: '새 학급 만들기', body: html`<label class="f" for="nc-y">학년도</label><input id="nc-y" type="number" value="${y}"><label class="f" for="nc-g">학년</label><input id="nc-g" type="number" value="2" min="1" max="6"><label class="f" for="nc-n">반 이름</label><input id="nc-n" type="text" value="1반" maxlength="20">`,
      buttons: [{ label: '취소', value: null }, { label: '만들기', kind: 'primary', submit: true, value: 'ok' }], onSubmit: function (m) { return { school_year: Number($('#nc-y', m).value), grade: Number($('#nc-g', m).value), class_name: $('#nc-n', m).value }; } });
    if (!out) return;
    try { var c = await Api.save('class.create', out); S.classes.push(c); S.classId = c.class_id; try { localStorage.setItem('vp_class', S.classId); } catch (e) {} UI.toast('학급을 만들었어요. 34개 차시 칸도 함께 만들어졌어요.', 'ok'); App.route(); }
    catch (e) { UI.toast(UI.errMsg(e), 'err'); }
  }
  function needClass(root) {
    if (cls()) return false;
    put(root, html`<div class="card stack" style="max-width:520px"><h2>먼저 학급을 만들어 주세요</h2><p class="muted">학급을 만들면 학생 계정과 34개 차시 계획을 쓸 수 있어요.</p><button class="btn primary" id="newcls">학급 만들기</button></div>`);
    $('#newcls', root).onclick = createClass; return true;
  }

  /* ============================ 학생 ============================ */
  T.students = async function (root) {
    if (needClass(root)) return;
    var c = cls(), list = await Api.call('student.list', { class_id: c.class_id });
    var stat = function (u) { return !u.activated ? '<span class="chip warn">비밀번호 미설정</span>' : u.status === 'DISABLED' ? '<span class="chip danger">사용 중지</span>' : '<span class="chip green">사용 중</span>'; };
    put(root, html`<div class="stack">${classBar()}<h1>학생</h1>
      <div class="card"><h3>학생 계정 만들기</h3><p class="small muted">한 줄에 한 명씩 «번호 이름» 으로 적어 붙여 넣으세요. 학생마다 <b>아이디와 초대 코드</b>가 만들어져요. 초대 코드는 <b>지금 한 번만</b> 보여 드려요.</p>
        <textarea id="roster" placeholder="1 학생A&#10;2 학생B&#10;3 학생C" style="min-height:110px"></textarea><div class="row" style="margin-top:10px"><button class="btn primary" id="mk">계정 만들기</button></div></div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>번호</th><th>이름</th><th>아이디</th><th>상태</th><th>학교 어휘</th><th>국가 시작/완료</th><th>능동</th><th>수집</th><th>제출 문장</th><th>공유 대기</th><th>마지막 학습</th><th></th></tr></thead><tbody>
      ${list.map(function (u) { return html`<tr><td>${u.student_no}</td><td><a href="#/t/student/${u.user_id}"><b>${u.display_name}</b></a></td><td>${u.login_id}</td><td>${UI.raw(stat(u))}</td><td>${u.school_done} / ${Data.school.length}</td><td>${u.national_started} / ${u.national_done}</td><td>${u.active_words}</td><td>${u.collections}</td><td>${u.writings_submitted}</td><td>${u.pending_share ? html`<span class="chip warn">${u.pending_share}</span>` : '-'}</td><td class="small">${UI.date(u.last_active) || '-'}</td>
        <td style="white-space:nowrap"><a class="btn small" href="#/t/student/${u.user_id}">보기</a> <button class="btn small" data-reset="${u.user_id}">새 코드</button> <button class="btn small" data-dis="${u.user_id}|${u.status}">${u.status === 'DISABLED' ? '재개' : '중지'}</button> <button class="btn small danger" data-purge="${u.user_id}|${u.login_id}|${u.display_name}">삭제</button></td></tr>`; })}
      ${list.length ? '' : html`<tr><td colspan="12" class="muted center" style="padding:20px">아직 학생이 없어요.</td></tr>`}</tbody></table></div>
      <div class="notice info small">학생이 비밀번호를 잊으면 «새 코드» 를 눌러 새 초대 코드를 주세요. 학생은 로그인 화면의 «처음 오셨나요?» 에서 새 비밀번호를 만들어요. 이름만으로는 다른 학생 기록에 들어갈 수 없어요.</div></div>`);
    bindClassBar(root);
    $('#mk', root).onclick = async function () {
      var lines = $('#roster', root).value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return UI.toast('학생을 한 줄에 한 명씩 적어 주세요.', 'err');
      var students = [], bad = null;
      lines.forEach(function (l) { var m = l.match(/^(\d{1,2})[\s.,)\-]+(.+)$/); if (!m) bad = bad || l; else students.push({ no: Number(m[1]), name: m[2].trim() }); });
      if (bad) return UI.toast('«번호 이름» 모양이 아닌 줄이 있어요: ' + bad, 'err');
      try { var res = await Api.save('student.create', { class_id: c.class_id, students: students }); await showCodes(res, '학생 계정을 만들었어요'); App.route(); }
      catch (e) { UI.toast(UI.errMsg(e), 'err'); }
    };
    $$('[data-reset]', root).forEach(function (b) { b.onclick = async function () {
      if (!(await UI.confirm('새 초대 코드를 만들까요?', '지금 로그인해 있는 기기는 모두 로그아웃되고, 학생은 새 코드로 비밀번호를 다시 만들어야 해요.', '새 코드 만들기'))) return;
      try { var r = await Api.save('student.reset', { user_id: b.dataset.reset }); await showCodes([r], '새 초대 코드'); App.route(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } }; });
    $$('[data-dis]', root).forEach(function (b) { b.onclick = async function () { var p = b.dataset.dis.split('|'); try { await Api.save('student.set_status', { user_id: p[0], status: p[1] === 'DISABLED' ? 'ACTIVE' : 'DISABLED' }); App.route(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } }; });
    $$('[data-purge]', root).forEach(function (b) { b.onclick = async function () {
      var p = b.dataset.purge.split('|');
      var out = await UI.modal({ title: p[2] + ' 학생을 완전히 삭제할까요?', body: html`<div class="notice err">계정과 <b>모든 학습 기록·문장·피드백</b>이 지워져요. <b>되돌릴 수 없어요.</b> (미리 «자료·백업» 에서 백업을 받아 두세요.)</div><label class="f" for="pc">확인하려면 아이디 «${p[1]}» 를 똑같이 입력하세요</label><input id="pc" type="text" autocomplete="off">`,
        buttons: [{ label: '취소', value: null }, { label: '완전히 삭제', kind: 'danger', submit: true, value: 'ok' }], onSubmit: function (m) { return $('#pc', m).value; } });
      if (out == null) return;
      try { var r = await Api.save('student.purge', { user_id: p[0], confirm: out }); UI.toast('삭제했어요 (' + r.removed + '줄).', 'ok'); App.route(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } }; });
  };

  async function showCodes(rows, title) {
    var cls0 = cls();
    await UI.modal({ title: title, wide: true, body: html`<div class="notice err small"><b>이 화면을 닫으면 초대 코드를 다시 볼 수 없어요.</b> 지금 인쇄하거나 CSV 로 저장하세요. 코드는 14일 안에 한 번만 쓸 수 있어요.</div>
      <div class="tablewrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>번호</th><th>이름</th><th>아이디</th><th>초대 코드</th></tr></thead><tbody>${rows.map(function (r) { return html`<tr><td>${r.student_no || ''}</td><td>${r.display_name}</td><td>${r.login_id}</td><td><span class="big-code">${r.invite_code}</span></td></tr>`; })}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="mc-print">인쇄</button><button class="btn" id="mc-csv">CSV 로 저장</button></div>`,
      buttons: [{ label: '확인했어요', kind: 'primary', value: true }], sticky: true,
      onOpen: function (m) {
        $('#mc-print', m).onclick = function () { window.print(); };
        $('#mc-csv', m).onclick = function () { UI.downloadCsv('초대코드', [['번호', '이름', '아이디', '초대 코드']].concat(rows.map(function (r) { return [r.student_no || '', r.display_name, r.login_id, r.invite_code]; }))); };
      } });
  }

  /* ============================ 학생 상세 ============================ */
  T.student = async function (root, parts, q) {
    var uid = parts[0], d = await Api.call('student.detail', { user_id: uid });
    var tab = q.tab || 'writings';
    var vname = function (id) { var v = Data.get(id) || (d.collections.filter(function (c) { return c.collection_id === id; })[0]); return v ? v.headword : '(알 수 없음)'; };
    var fbOf = function (id) { return d.feedback.filter(function (f) { return f.target_id === id; })[0]; };
    var revsOf = function (id) { return d.revisions.filter(function (r) { return r.writing_id === id; }).sort(function (a, b) { return a.version - b.version; }); };

    function fbForm(id, type, f) {
      f = f || {}; var r = f.rubric || {};
      return html`<form class="card flat" data-fb="${id}|${type}" style="margin-top:8px"><b class="small">${f.feedback_id ? '피드백 고치기' : '피드백 쓰기'}</b>
        <textarea name="comment" style="min-height:80px" placeholder="서술형 피드백">${f.comment || ''}</textarea>
        <div class="rubric" style="margin-top:8px">${VocabCore.RUBRIC.map(function (k) { return html`<label class="small"><b>${VocabCore.RUBRIC_LABEL[k]}</b><select name="${k}"><option value="">-</option>${[1, 2, 3, 4].map(function (n) { return html`<option value="${n}" ${r[k] === n ? 'selected' : ''}>${n}</option>`; })}</select></label>`; })}</div>
        <div class="row" style="margin-top:8px"><button class="btn small primary" type="submit">저장</button>${f.read_at ? html`<span class="small muted">학생이 ${UI.datetime(f.read_at)}에 읽었어요</span>` : (f.feedback_id ? html`<span class="small muted">아직 안 읽었어요</span>` : '')}</div></form>`;
    }

    var tabs = [['writings', '문장·피드백'], ['learn', '학습 기록'], ['collect', '수집 어휘'], ['daily', '오늘의 문장'], ['review', '복습']];
    var body;
    if (tab === 'writings') {
      var ws = d.writings.filter(function (w) { return w.version > 0 || w.draft_text; }).sort(function (a, b) { return (b.saved_at || '') < (a.saved_at || '') ? -1 : 1; });
      body = ws.length ? html`<div class="stack">${ws.map(function (w) { var revs = revsOf(w.writing_id), f = fbOf(w.writing_id);
        return html`<div class="card"><div class="row between"><div><b>${vname(w.vocabulary_id)}</b> <span class="chip ${w.scene_type === 'SUBJECT' ? 'blue' : w.scene_type === 'DAILY' ? 'green' : 'purple'}">${SL[w.scene_type]}</span> <span class="chip">${w.version > 0 ? '제출 v' + w.version : '임시 저장'}${w.status === 'REVISING' ? ' · 고치는 중' : ''}</span>${w.example_viewed ? html` <span class="chip">예시 열람</span>` : ''}</div><span class="small muted">${UI.datetime(w.submitted_at || w.saved_at)}</span></div>
          ${w.version > 0 ? html`<p style="margin:8px 0;white-space:pre-wrap">${w.text}</p>` : ''}${w.status === 'REVISING' || w.version === 0 ? html`<p class="small muted" style="white-space:pre-wrap">작성 중인 글: ${w.draft_text}</p>` : ''}
          ${w.self_check && Object.keys(w.self_check).length ? html`<div class="small muted">자기 점검: ${Object.keys(w.self_check).filter(function (k) { return w.self_check[k]; }).length}/4 표시</div>` : ''}
          ${revs.length > 1 ? html`<details class="acc" style="margin-top:8px"><summary>수정 이력 ${revs.length}개</summary><div>${revs.map(function (r) { return html`<p class="small"><b>v${r.version}</b> <span class="muted">${UI.datetime(r.saved_at)}</span><br>${r.text}</p>`; })}</div></details>` : ''}
          ${w.version > 0 ? fbForm(w.writing_id, 'WRITING', f) : ''}</div>`; })}</div>` : html`<div class="card muted center">아직 쓴 문장이 없어요.</div>`;
    } else if (tab === 'learn') {
      var req = {}; var lessons = await Api.call('lesson.list', { class_id: cls().class_id });
      lessons.forEach(function (l) { if (l.published) l.vocab.forEach(function (x) { if (x.required) req[x.vocabulary_id] = l.lesson_number; }); });
      var svBy = {}; d.sv.forEach(function (x) { svBy[x.vocabulary_id] = x; });
      var rows = Object.keys(req).map(function (vid) { var v = Data.get(vid); var st = U.vocabStatus(v.origin === 'SCHOOL' ? 'SCHOOL' : 'NATIONAL', svBy[vid], d.writings.filter(function (w) { return w.vocabulary_id === vid; })); return { vid: vid, v: v, n: req[vid], st: st }; }).sort(function (a, b) { return a.n - b.n; });
      body = html`<div class="stack"><div class="card"><h3>공개한 차시의 필수 과제 (${rows.filter(function (r) { return r.st.done; }).length} / ${rows.length} 완료)</h3>${rows.length ? html`<div class="tablewrap"><table class="tbl"><thead><tr><th>차시</th><th>어휘</th><th>진행</th><th>상태</th></tr></thead><tbody>${rows.map(function (r) { return html`<tr><td>${r.n}</td><td>${r.v.headword} <span class="chip">${Data.originLabel(r.v.origin)}</span></td><td>${r.st.got} / ${r.st.total}</td><td>${r.st.done ? html`<span class="chip green">완료</span>` : html`<span class="chip warn">미완료</span>`}</td></tr>`; })}</tbody></table></div>` : html`<p class="muted">공개한 차시에 필수 어휘가 없어요.</p>`}</div>
        <div class="card"><h3>학습한 어휘</h3><div class="tablewrap"><table class="tbl"><thead><tr><th>어휘</th><th>교과서 문장</th><th>짐작한 뜻</th><th>내 말로 설명</th><th>단계</th></tr></thead><tbody>${d.sv.map(function (x) { var v = Data.get(x.vocabulary_id); return html`<tr><td><b>${vname(x.vocabulary_id)}</b></td><td class="small">${x.textbook_sentence}</td><td class="small">${x.guessed_meaning}</td><td class="small">${x.self_explanation}</td><td class="small">${Object.keys(x.steps || {}).filter(function (k) { return x.steps[k]; }).join(' · ')}</td></tr>`; })}</tbody></table></div></div></div>`;
    } else if (tab === 'collect') {
      body = d.collections.length ? html`<div class="stack">${d.collections.map(function (c) { return html`<div class="card"><div class="row between"><div><b>${c.headword}</b> <span class="small muted">${c.discovered_at} · ${c.medium}${c.subject ? ' · ' + c.subject : ''}</span> ${c.status === 'TRASHED' ? html`<span class="chip danger">휴지통</span>` : ''}${c.share_status !== 'NONE' ? html` <span class="chip ${c.share_status === 'APPROVED' ? 'green' : c.share_status === 'PENDING' ? 'warn' : 'danger'}">${{ PENDING: '공유 검토 대기', APPROVED: '학급 공유됨', REJECTED: '공유 안 함' }[c.share_status]}</span>` : ''}</div>
          ${c.share_status === 'PENDING' ? html`<span><button class="btn small green" data-rv="${c.collection_id}|APPROVED">승인</button> <button class="btn small danger" data-rv="${c.collection_id}|REJECTED">거절</button></span>` : ''}</div>
          <div class="small">확인한 뜻: ${c.confirmed_meaning || '-'}</div><div class="small muted">문맥: ${c.source_context || '-'} / 예문: ${c.example_sentence || '-'}</div></div>`; })}</div>` : html`<div class="card muted center">수집한 단어가 없어요.</div>`;
    } else if (tab === 'daily') {
      body = d.daily.length ? html`<div class="stack">${d.daily.sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (x) { return html`<div class="card"><div class="small muted">${x.date}${x.vocabulary_id ? ' · ' + vname(x.vocabulary_id) : ''}</div><p style="white-space:pre-wrap;margin:4px 0">${x.text}</p>${fbForm(x.daily_id, 'DAILY', fbOf(x.daily_id))}</div>`; })}</div>` : html`<div class="card muted center">오늘의 문장이 없어요.</div>`;
    } else {
      body = html`<div class="card"><h3>복습 기록 ${d.reviews.length}번 (맞힘 ${d.reviews.filter(function (r) { return r.result === 'CORRECT'; }).length})</h3><div class="tablewrap"><table class="tbl"><thead><tr><th>시각</th><th>어휘</th><th>방식</th><th>결과</th></tr></thead><tbody>${d.reviews.slice().reverse().slice(0, 100).map(function (r) { return html`<tr><td class="small">${UI.datetime(r.created_at)}</td><td>${vname(r.vocabulary_id)}</td><td>${MODE_LABEL[r.mode] || r.mode}</td><td>${r.result === 'CORRECT' ? '✔' : '✘'}</td></tr>`; })}</tbody></table></div></div>`;
    }
    put(root, html`<div class="stack"><p class="small"><a href="#/t/students">← 학생 목록</a></p><div class="row between"><h1>${d.user.display_name} <span class="muted" style="font-size:1rem">${d.user.student_no}번 · ${d.user.login_id}</span></h1></div>
      <div class="pill-tabs">${tabs.map(function (t) { return html`<a href="#/t/student/${uid}?tab=${t[0]}" class="${t[0] === tab ? 'on' : ''}">${t[1]}</a>`; })}</div>${body}</div>`);
    $$('form[data-fb]', root).forEach(function (f) { f.onsubmit = async function (e) {
      e.preventDefault(); var p = f.dataset.fb.split('|'), rub = {}; VocabCore.RUBRIC.forEach(function (k) { if (f.elements[k].value) rub[k] = Number(f.elements[k].value); });
      try { var row = await Api.save('feedback.save', { target_id: p[0], target_type: p[1], comment: f.elements.comment.value, rubric: rub }); var i = d.feedback.findIndex(function (x) { return x.feedback_id === row.feedback_id; }); if (i >= 0) d.feedback[i] = row; else d.feedback.push(row); UI.toast('피드백을 저장했어요.', 'ok'); }
      catch (err) { UI.toast(UI.errMsg(err), 'err'); } }; });
    $$('[data-rv]', root).forEach(function (b) { b.onclick = function () { reviewShare(b.dataset.rv.split('|')[0], b.dataset.rv.split('|')[1]).then(function () { App.route(); }); }; });
  };

  async function reviewShare(id, decision) {
    var note = '';
    if (decision === 'REJECTED') { note = await UI.modal({ title: '공유하지 않는 이유 (학생에게 보여요)', body: html`<input id="rn" type="text" maxlength="300" placeholder="예) 뜻을 한 번 더 확인해 보자">`, buttons: [{ label: '취소', value: null }, { label: '거절하기', kind: 'danger', submit: true, value: 'ok' }], onSubmit: function (m) { return $('#rn', m).value || ' '; } }); if (note == null) return; }
    try { await Api.save('collection.review', { collection_id: id, decision: decision, note: note.trim() }); UI.toast(decision === 'APPROVED' ? '학급에 공유했어요.' : '공유하지 않기로 했어요.', 'ok'); } catch (e) { UI.toast(UI.errMsg(e), 'err'); }
  }

  /* ============================ 차시·과제 ============================ */
  T.lessons = async function (root) {
    if (needClass(root)) return;
    var c = cls(), ls = await Api.call('lesson.list', { class_id: c.class_id });
    var pub = ls.filter(function (l) { return l.published; }).length, assigned = ls.reduce(function (n, l) { return n + l.vocab.length; }, 0);
    put(root, html`<div class="stack">${classBar()}<h1>34차시 학습 계획 · 과제</h1>
      <div class="card row between"><div><b>공개 ${pub} / ${ls.length}차시</b> · 지정한 어휘 ${assigned}개<div class="small muted">«공개» 한 차시만 학생 화면에 보여요. 어휘마다 필수 과제인지 정할 수 있어요.</div></div><button class="btn" id="auto">학교 어휘 103개 자동 나누기</button></div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>차시</th><th>제목</th><th>학습 목표</th><th>어휘</th><th>기한</th><th>공개</th><th></th></tr></thead><tbody>
      ${ls.map(function (l) { return html`<tr><td><b>${l.lesson_number}</b></td><td><input type="text" data-f="title|${l.lesson_number}" value="${l.title}" maxlength="80" style="min-width:150px" aria-label="${l.lesson_number}차시 제목"></td><td><input type="text" data-f="goals|${l.lesson_number}" value="${l.goals}" maxlength="500" style="min-width:180px" aria-label="${l.lesson_number}차시 목표"></td>
        <td class="small">${l.vocab.length ? l.vocab.slice(0, 6).map(function (x) { var v = Data.get(x.vocabulary_id); return v ? (v.headword + (x.required ? '' : '(선택)')) : ''; }).join(', ') + (l.vocab.length > 6 ? ' 외 ' + (l.vocab.length - 6) : '') : html`<span class="muted">-</span>`}</td>
        <td><input type="date" data-f="due_date|${l.lesson_number}" value="${l.due_date}" aria-label="${l.lesson_number}차시 기한"></td>
        <td><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-pub="${l.lesson_number}" ${l.published ? 'checked' : ''} style="width:22px;height:22px"> ${l.published ? '공개' : '숨김'}</label></td>
        <td><button class="btn small" data-edit="${l.lesson_number}">어휘 지정</button></td></tr>`; })}</tbody></table></div></div>`);
    bindClassBar(root);
    $$('[data-f]', root).forEach(function (el) { el.onchange = async function () { var p = el.dataset.f.split('|'), o = { class_id: c.class_id, lesson_number: Number(p[1]) }; o[p[0]] = el.value; try { await Api.save('lesson.save', o); UI.toast('저장했어요.', 'ok'); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } }; });
    $$('[data-pub]', root).forEach(function (el) { el.onchange = async function () { try { await Api.save('lesson.save', { class_id: c.class_id, lesson_number: Number(el.dataset.pub), published: el.checked }); App.route(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); el.checked = !el.checked; } }; });
    $('#auto', root).onclick = async function () {
      if (!(await UI.confirm('자동으로 나눌까요?', '학교 필수 어휘를 교과별로 묶어 34개 차시에 고르게 나눠요. 지금 지정해 둔 어휘 목록은 모두 바뀌어요. 나눈 뒤에 하나씩 고칠 수 있어요.', '나누기'))) return;
      try { await Api.save('lesson.auto_distribute', { class_id: c.class_id }); UI.toast('나눴어요. 공개할 차시를 골라 주세요.', 'ok'); App.route(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } };
    $$('[data-edit]', root).forEach(function (b) { b.onclick = function () { editLessonVocab(c, ls.filter(function (l) { return String(l.lesson_number) === b.dataset.edit; })[0]); }; });
  };

  async function editLessonVocab(c, l) {
    var sel = {}; l.vocab.forEach(function (x) { sel[x.vocabulary_id] = !!x.required; });
    var tabSel = 'SCHOOL', text = '';
    var out = await UI.modal({ title: l.lesson_number + '차시 어휘 지정', wide: true, sticky: true, body: html`<div class="pill-tabs" id="vt"><button class="on" data-o="SCHOOL">학교 필수</button><button data-o="NATIONAL">국가 사고도구어</button><button data-o="CUSTOM">내가 추가한 어휘</button></div>
      <input id="vs" type="search" placeholder="낱말로 찾기" style="margin-bottom:8px"><div id="vl" style="max-height:34vh;overflow:auto"></div><h3 style="margin-top:12px">지정한 어휘 <span id="vc"></span></h3><div id="sl" style="max-height:24vh;overflow:auto"></div>`,
      buttons: [{ label: '취소', value: null }, { label: '저장', kind: 'primary', submit: true, value: 'ok' }],
      onSubmit: function () { return Object.keys(sel).map(function (id) { return { vocabulary_id: id, required: sel[id] }; }); },
      onOpen: function (m) {
        function drawSel() { var ids = Object.keys(sel); put($('#sl', m), html`${ids.length ? ids.map(function (id) { var v = Data.get(id); return html`<div class="row between" style="padding:4px 0"><span><b>${v.headword}</b> <span class="chip">${Data.originLabel(v.origin)}</span></span><span><label class="small"><input type="checkbox" data-req="${id}" ${sel[id] ? 'checked' : ''}> 필수</label> <button class="btn small ghost danger" data-rm="${id}">빼기</button></span></div>`; }) : html`<p class="muted small">아직 없어요.</p>`}`); $('#vc', m).textContent = '(' + ids.length + '개)'; }
        function drawList() { var n = U.norm(text), pool = Data.vocab.filter(function (v) { return v.origin === tabSel && (!n || v.normalized_headword.indexOf(n) >= 0); }).slice(0, 80);
          put($('#vl', m), html`${pool.map(function (v) { return html`<label style="display:flex;gap:8px;align-items:center;padding:5px 0"><input type="checkbox" data-pick="${v.vocabulary_id}" ${v.vocabulary_id in sel ? 'checked' : ''} style="width:20px;height:20px"><b>${v.headword}</b> <span class="small muted">${(v.definition || '').slice(0, 40)}</span></label>`; })}${pool.length === 0 ? html`<p class="muted small">없어요.</p>` : ''}`); }
        m.addEventListener('change', function (e) { var p = e.target.dataset.pick, r = e.target.dataset.req; if (p) { if (e.target.checked) sel[p] = true; else delete sel[p]; drawSel(); } if (r) sel[r] = e.target.checked; });
        m.addEventListener('click', function (e) { var rm = e.target.dataset.rm, t = e.target.dataset.o; if (rm) { delete sel[rm]; drawSel(); drawList(); } if (t) { tabSel = t; $$('#vt button', m).forEach(function (b) { b.classList.toggle('on', b === e.target); }); drawList(); } });
        $('#vs', m).oninput = function () { text = this.value; drawList(); };
        drawSel(); drawList();
      } });
    if (!out) return;
    try { await Api.save('lesson.set_vocab', { class_id: c.class_id, lesson_number: l.lesson_number, items: out }); UI.toast('저장했어요.', 'ok'); App.route(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); }
  }

  /* ============================ 어휘·장면 ============================ */
  T.content = async function (root, parts, q) {
    var text = q.q || '', pick = q.v || '';
    var n = U.norm(text);
    var res = n ? Data.vocab.filter(function (v) { return v.normalized_headword.indexOf(n) >= 0; }).slice(0, 30) : [];
    var v = pick ? Data.get(pick) : null;
    var prompts = v ? await Api.call('prompt.get', { vocabulary_id: v.vocabulary_id }) : [];
    put(root, html`<div class="stack"><h1>어휘 · 작문 장면</h1>
      <div class="card"><div class="row"><input id="cq" type="search" class="grow" placeholder="수정할 낱말 찾기" value="${text}" style="flex:2;min-width:180px"><button class="btn" id="addv">＋ 새 어휘 추가</button></div>
        ${res.length ? html`<div class="row" style="margin-top:10px">${res.map(function (r) { return html`<a class="chip ${r.vocabulary_id === pick ? 'blue' : ''}" href="#/t/content?q=${encodeURIComponent(text)}&v=${r.vocabulary_id}">${r.headword} · ${Data.originLabel(r.origin)}</a>`; })}</div>` : (n ? html`<p class="muted small" style="margin-top:8px">찾는 낱말이 없어요.</p>` : html`<p class="muted small" style="margin-top:8px">낱말을 검색해서 뜻풀이와 세 장면(상황·질문·예시)을 고치거나, 복습 문항을 올릴 수 있어요.</p>`)}</div>
      ${v ? html`<div class="card stack"><div class="row between"><h2 style="margin:0">${v.headword} <span class="chip">${Data.originLabel(v.origin)}</span></h2><span class="chip ${v.definition_status === 'TEACHER_REVIEWED' ? 'green' : 'warn'}">${Data.STATUS_LABEL[v.definition_status] || v.definition_status}</span></div>
        <div><label class="f" for="vdef">뜻풀이</label><textarea id="vdef" style="min-height:80px">${v.definition}</textarea><div class="row" style="margin-top:8px"><button class="btn primary small" id="sdef">뜻풀이 저장 (검토 완료로 표시)</button></div>
          ${Data.sourcesOf(v.vocabulary_id).map(function (s) { return html`<div class="small muted">출처: ${Data.originLabel(s.source_type === 'PERSONAL' ? 'CUSTOM' : s.source_type)} ${s.publisher || ''} ${s.page || ''} · 이용 허락 ${({ SCHOOL_OWN: '학교 자료', UNVERIFIED: '확인 전' })[s.permission_status] || s.permission_status}</div>`; })}</div>
        ${SCENES().map(function (sc) { var p = prompts.filter(function (x) { return x.scene_type === sc; })[0] || {}, fb = Data.promptFor(v.vocabulary_id, sc, v.headword); return html`<form class="card flat" data-sc="${sc}"><b>${SL[sc]}</b> ${p.content_status === 'TEACHER_REVIEWED' ? html`<span class="chip green">검토 완료</span>` : p.prompt_id ? html`<span class="chip warn">초안</span>` : html`<span class="chip">기본 안내</span>`}
          <label class="f" for="sc-s-${sc}">상황</label><textarea id="sc-s-${sc}" name="scenario" style="min-height:70px">${p.scenario || fb.scenario}</textarea>
          <label class="f" for="sc-q-${sc}">사고 질문</label><input id="sc-q-${sc}" name="q" type="text" value="${p.guiding_question || fb.question}">
          <label class="f" for="sc-e-${sc}">예시 문장<span class="hint">학생이 먼저 쓴 뒤에만 보여요</span></label><textarea id="sc-e-${sc}" name="ex" style="min-height:60px">${p.example || ''}</textarea>
          <div class="row" style="margin-top:8px"><button class="btn small primary" type="submit">이 장면 저장</button></div></form>`; })}
        <form class="card flat" id="actf"><b>복습 문항 올리기</b><div class="grid g2"><div><label class="f" for="a-t">유형</label><select id="a-t"><option value="fix">오류 고치기</option><option value="context">문맥</option><option value="synonym">유사어 구별</option><option value="transfer">새 상황 전이</option></select></div><div><label class="f" for="a-k">정답(선택)</label><input id="a-k" type="text"></div></div><label class="f" for="a-p">문항</label><textarea id="a-p" style="min-height:60px" placeholder="예) 다음 문장에서 어색한 곳을 고치세요: …"></textarea><div class="row" style="margin-top:8px"><button class="btn small primary" type="submit">문항 저장</button></div></form></div>` : ''}
    </div>`);
    function SCENES() { return VocabCore.SCENES; }
    $('#cq', root).onkeydown = function (e) { if (e.key === 'Enter') location.hash = '#/t/content?q=' + encodeURIComponent(this.value); };
    $('#cq', root).onchange = function () { location.hash = '#/t/content?q=' + encodeURIComponent(this.value); };
    $('#addv', root).onclick = async function () {
      var out = await UI.modal({ title: '새 어휘 추가', body: html`<label class="f" for="nv-h">낱말</label><input id="nv-h" type="text" maxlength="40"><label class="f" for="nv-d">뜻풀이</label><textarea id="nv-d" style="min-height:70px"></textarea><label class="f" for="nv-s">교과</label><select id="nv-s"><option value="">(선택 안 함)</option>${Data.SUBJECTS.map(function (s) { return html`<option value="${s}">${Data.subjectLabel(s)}</option>`; })}</select>`,
        buttons: [{ label: '취소', value: null }, { label: '추가', kind: 'primary', submit: true, value: 'ok' }], onSubmit: function (m) { return { headword: $('#nv-h', m).value, definition: $('#nv-d', m).value, subject: $('#nv-s', m).value }; } });
      if (!out) return;
      try { var r = await Api.save('vocab.save', out); Data.applyDelta({ vocabulary: [r], prompts: [], activities: Data.activities }); UI.toast('어휘를 추가했어요. 이제 차시에 지정할 수 있어요.', 'ok'); location.hash = '#/t/content?q=' + encodeURIComponent(r.headword) + '&v=' + r.vocabulary_id; } catch (e) { UI.toast(UI.errMsg(e), 'err'); }
    };
    if (!v) return;
    $('#sdef', root).onclick = async function () { try { var r = await Api.save('vocab.save', { vocabulary_id: v.vocabulary_id, definition: $('#vdef', root).value, definition_status: 'TEACHER_REVIEWED' }); Data.applyDelta({ vocabulary: [r], prompts: [], activities: Data.activities }); UI.toast('뜻풀이를 저장했어요.', 'ok'); App.route(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } };
    $$('form[data-sc]', root).forEach(function (f) { f.onsubmit = async function (e) { e.preventDefault(); try { var r = await Api.save('prompt.save', { vocabulary_id: v.vocabulary_id, scene_type: f.dataset.sc, scenario: f.elements.scenario.value, guiding_question: f.elements.q.value, example: f.elements.ex.value }); (Data.prompts[v.vocabulary_id] = Data.prompts[v.vocabulary_id] || {})[r.scene_type] = r; UI.toast('장면을 저장했어요.', 'ok'); App.route(); } catch (err) { UI.toast(UI.errMsg(err), 'err'); } }; });
    $('#actf', root).onsubmit = async function (e) { e.preventDefault(); try { await Api.save('activity.save', { vocabulary_id: v.vocabulary_id, type: $('#a-t', root).value, prompt: $('#a-p', root).value, answer_key: $('#a-k', root).value }); UI.toast('복습 문항을 올렸어요.', 'ok'); $('#a-p', root).value = ''; $('#a-k', root).value = ''; } catch (err) { UI.toast(UI.errMsg(err), 'err'); } };
  };

  /* ============================ 현황 (통계 · 수집어휘 검토 · 접근 기록) ============================ */
  T.status = async function (root, parts, q) {
    if (needClass(root)) return;
    var c = cls(), tab = q.tab || 'stats', body = html``;
    if (tab === 'stats') {
      var st = await Api.call('stats.class', { class_id: c.class_id }), list = st.students;
      var n = list.length || 1, avg = function (k) { return Math.round(list.reduce(function (a, x) { return a + x[k]; }, 0) / n * 10) / 10; };
      body = html`<div class="grid g4"><div class="card stat"><div class="l">학생 수</div><div class="n">${list.length}</div></div><div class="card stat"><div class="l">학교 어휘 평균 완료</div><div class="n">${avg('school_done')}<small> / ${Data.school.length}</small></div></div><div class="card stat"><div class="l">평균 제출 문장</div><div class="n">${avg('writings_submitted')}</div></div><div class="card stat"><div class="l">남긴 피드백</div><div class="n">${st.feedback_total}</div></div></div>
        <div class="card"><h3>교과별 학교 어휘 (학급 전체)</h3>${Data.SUBJECTS.map(function (s) { var b = st.by_subject[s] || { started: 0, done: 0 }; var tot = Data.school.filter(function (v) { return v.subject === s; }).length * list.length; return html`<div style="margin:8px 0"><div class="row between small"><b>${Data.subjectLabel(s)}</b><span class="muted">완료 ${b.done} / 시작 ${b.started} / 전체 ${tot}</span></div>${UI.bar(UI.pct(b.done, tot))}</div>`; })}</div>
        <div class="tablewrap"><table class="tbl"><thead><tr><th>번호</th><th>이름</th><th>학교 어휘 진행</th><th>필수 과제 남은 것</th><th>능동</th><th>제출 문장</th><th>마지막 학습</th></tr></thead><tbody>${list.map(function (u) { return html`<tr><td>${u.student_no}</td><td><a href="#/t/student/${u.user_id}">${u.display_name}</a></td><td style="min-width:140px">${UI.bar(UI.pct(u.school_done, Data.school.length))}<span class="small muted">${u.school_done} / ${Data.school.length}</span></td><td>${st.incomplete_required[u.user_id] ? html`<span class="chip warn">${st.incomplete_required[u.user_id]}개</span>` : html`<span class="chip green">없음</span>`}</td><td>${u.active_words}</td><td>${u.writings_submitted}</td><td class="small">${UI.date(u.last_active) || '-'}</td></tr>`; })}</tbody></table></div>`;
    } else if (tab === 'share') {
      var pend = await Api.call('review.pending', { class_id: c.class_id });
      body = pend.length ? html`<div class="stack">${pend.map(function (p) { return html`<div class="card"><div class="row between"><div><b>${p.headword}</b> <span class="small muted">${p.student}${p.subject ? ' · ' + p.subject : ''}</span></div><span><button class="btn small green" data-rv="${p.collection_id}|APPROVED">승인</button> <button class="btn small danger" data-rv="${p.collection_id}|REJECTED">거절</button></span></div><div class="small">뜻: ${p.confirmed_meaning}</div>${p.example_sentence ? html`<div class="small muted">예문: ${p.example_sentence}</div>` : ''}${p.source_context ? html`<div class="small muted">발견한 문맥: ${p.source_context}</div>` : ''}</div>`; })}</div>` : html`<div class="card muted center">검토할 수집 어휘가 없어요.</div>`;
    } else {
      var logs = await Api.call('audit.list');
      body = html`<div class="tablewrap"><table class="tbl"><thead><tr><th>시각</th><th>행동</th><th>대상</th></tr></thead><tbody>${logs.map(function (l) { return html`<tr><td class="small">${UI.datetime(l.created_at)}</td><td>${ACTION_LABEL[l.action] || l.action}</td><td class="small">${l.target_id}</td></tr>`; })}</tbody></table></div><p class="small muted">로그인, 계정 발급·복구·삭제, 학생 기록 열람, 내보내기, 백업 기록이 남아요. 최근 200건까지 보여요.</p>`;
    }
    put(root, html`<div class="stack">${classBar()}<h1>현황</h1><div class="pill-tabs"><a href="#/t/status?tab=stats" class="${tab === 'stats' ? 'on' : ''}">학급 통계</a><a href="#/t/status?tab=share" class="${tab === 'share' ? 'on' : ''}">수집 어휘 검토</a><a href="#/t/status?tab=log" class="${tab === 'log' ? 'on' : ''}">접근 기록</a></div>${body}</div>`);
    bindClassBar(root);
    $$('[data-rv]', root).forEach(function (b) { b.onclick = function () { var p = b.dataset.rv.split('|'); reviewShare(p[0], p[1]).then(function () { App.route(); }); }; });
  };

  /* ============================ 자료·백업 ============================ */
  T.data = async function (root) {
    if (needClass(root)) return;
    var c = cls();
    put(root, html`<div class="stack">${classBar()}<h1>자료 · 백업</h1>
      <div class="card"><h3>내려받기 (엑셀·CSV)</h3><div class="grid g3">${[['progress', '진도 현황'], ['writings', '제출한 문장'], ['collections', '수집 어휘']].map(function (k) { return html`<div class="card flat"><b>${k[1]}</b><div class="row" style="margin-top:8px"><button class="btn small" data-ex="${k[0]}|csv">CSV</button><button class="btn small" data-ex="${k[0]}|xlsx">엑셀(XLSX)</button></div></div>`; })}</div>
        <p class="small muted">내려받은 파일에는 학생 이름이 들어 있어요. 학교 개인정보 기준에 맞게 보관하고, 저장소(GitHub)에는 올리지 마세요. 수식으로 읽힐 수 있는 글자로 시작하는 칸은 안전하게 바꿔 담아요.</p></div>
      <div class="card"><h3>백업 · 복원</h3><p class="small">우리 학급의 계정(비밀번호는 암호화된 상태)·학습 기록·문장·수정 이력·피드백을 하나의 파일로 저장해요.</p>
        <div class="row"><button class="btn primary" id="bk">백업 파일 만들기</button><label class="btn" style="cursor:pointer">백업 파일로 복원<input id="rs" type="file" accept=".json,application/json" class="sr-only"></label></div>
        <p class="small muted" style="margin-top:8px">복원은 «있으면 덮어쓰고, 없으면 되살리는» 방식이며 지우지는 않아요. 다른 선생님의 백업 파일은 복원되지 않아요. 구글 시트 전체 백업은 Apps Script 의 <code>installNightlyBackup</code> 으로 매일 밤 자동으로 걸 수 있어요.</p></div>
      <div class="card"><h3>앱 타이틀 이미지</h3>
        <p class="small muted">홈·로그인 화면 맨 위와 상단 헤더에 보이는 이미지예요. 이미지는 <b>비율만 맞춰 보여 주고 변형하지 않아요.</b> 교사(관리자)만 바꿀 수 있고, 바꾸면 모든 학생 화면에 반영돼요.</p>
        <div class="grid g2"><div><b class="small">지금 쓰는 이미지</b><div id="ti-now" class="card flat" style="margin-top:6px;padding:8px">${UI.titleImg('')}</div></div>
          <div><b class="small">새 이미지 미리보기</b><div id="ti-new" class="card flat" style="margin-top:6px;padding:8px;min-height:90px"><p class="small muted" style="margin:6px">아래 «이미지 고르기» 로 파일을 고르면 여기에 미리 보여요.</p></div></div></div>
        <div id="ti-info" class="small" style="margin-top:8px"></div>
        <div class="row" style="margin-top:10px"><label class="btn" style="cursor:pointer">이미지 고르기<input id="ti-file" type="file" accept="image/png,image/webp,image/jpeg" class="sr-only"></label>
          <button class="btn primary" id="ti-apply" disabled>이 이미지로 적용</button><button class="btn danger" id="ti-reset">기본 이미지로 되돌리기</button></div>
        <p class="small muted" style="margin-top:8px">권장: 가로로 긴 이미지(약 3:1, 예: 2048×682), PNG·WEBP·JPG, 330KB 이하. 파일이 더 크면 자동으로 줄여 올려요(이때만 화질이 조금 줄 수 있어요).</p></div>
      <div class="card"><h3>개인정보 · 보관 · 삭제</h3><ul class="small">
        <li><b>받는 정보</b>: 이름(교사가 입력), 번호, 아이디, 암호화한 비밀번호, 학습 기록. 전화번호·개인 이메일·주민등록번호는 받지 않아요.</li>
        <li><b>접근 기록</b>: 로그인·계정 발급·학생 기록 열람·내보내기가 «현황 → 접근 기록» 에 남아요.</li>
        <li><b>보관</b>: 학년이 끝나면 «내려받기·백업» 을 한 뒤 학생 계정을 삭제하는 것을 권해요.</li>
        <li><b>삭제</b>: «학생» 화면의 «삭제» 는 계정과 모든 기록을 지워요(되돌릴 수 없음). 학생은 자기 단어를 휴지통으로 옮기고 되살릴 수 있어요.</li>
        <li><b>AI</b>: 이 앱은 외부 AI 서비스로 학생 글을 보내지 않아요.</li></ul></div></div>`);
    bindClassBar(root);
    $$('[data-ex]', root).forEach(function (b) { b.onclick = async function () {
      var p = b.dataset.ex.split('|');
      try { var r = await Api.call('export.class', { class_id: c.class_id, kind: p[0] }); if (p[1] === 'csv') UI.downloadCsv(r.filename, r.rows); else await UI.downloadXlsx(r.filename, r.rows); UI.toast('내려받았어요.', 'ok'); }
      catch (e) { UI.toast(UI.errMsg(e), 'err'); } }; });
    $('#bk', root).onclick = async function () {
      try { var r = await Api.call('backup.export'); UI.downloadBlob('학습도구어_백업_' + UI.today() + '.json', new Blob([JSON.stringify(r)], { type: 'application/json' })); UI.toast('백업 파일을 만들었어요. 안전한 곳(개인 드라이브 등)에 보관하세요.', 'ok'); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } };
    $('#rs', root).onchange = async function () {
      var f = this.files[0]; if (!f) return;
      try { var b = JSON.parse(await f.text()); if (!(await UI.confirm('백업으로 복원할까요?', f.name + ' 의 내용으로 같은 번호의 기록을 덮어쓰고, 없는 기록은 되살려요.', '복원'))) return;
        var r = await Api.save('backup.restore', { backup: b }); UI.toast(r.restored + '줄을 복원했어요.', 'ok'); }
      catch (e) { UI.toast(e instanceof SyntaxError ? '백업 파일이 아니에요.' : UI.errMsg(e), 'err'); }
      this.value = ''; };

    /* ---- 타이틀 이미지 교체 ---- */
    var pending = null; // { dataUrl, w, h, note }
    var LIMIT = 450000;  // 서버가 받는 데이터 주소 글자 수 (≈ 파일 330KB)
    function readFile(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('파일을 읽지 못했어요.')); }; r.readAsDataURL(f); }); }
    function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('이미지를 열 수 없는 파일이에요.')); }; i.src = src; }); }
    async function shrink(img) { // 용량이 넘을 때만 가로를 줄여 WEBP 로 다시 만든다
      var steps = [[1600, 0.92], [1400, 0.85], [1200, 0.8], [1000, 0.75]];
      for (var i = 0; i < steps.length; i++) {
        var w = Math.min(img.naturalWidth, steps[i][0]), h = Math.round(img.naturalHeight * w / img.naturalWidth);
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var d = cv.toDataURL('image/webp', steps[i][1]);
        if (d.indexOf('data:image/webp') === 0 && d.length <= LIMIT) return d;
      }
      return null;
    }
    $('#ti-file', root).onchange = async function () {
      var f = this.files[0]; if (!f) return;
      var info = $('#ti-info', root), box = $('#ti-new', root), btn = $('#ti-apply', root);
      pending = null; btn.disabled = true; info.textContent = '';
      try {
        if (!/^image\/(png|webp|jpeg)$/.test(f.type)) throw new Error('PNG·WEBP·JPG 이미지 파일만 쓸 수 있어요. (SVG 는 안 돼요)');
        var d = await readFile(f), img = await loadImg(d), note = '';
        if (d.length > LIMIT) {
          var small = await shrink(img);
          if (!small) throw new Error('이미지가 너무 커서 줄여도 올릴 수 없어요. 더 작은 파일을 골라 주세요.');
          d = small; note = '원본이 커서 자동으로 줄였어요(WEBP, 화질이 조금 줄 수 있어요).';
        }
        var ratio = img.naturalWidth / img.naturalHeight;
        pending = { dataUrl: d };
        put(box, html`<img src="${d}" alt="새 타이틀 이미지 미리보기" style="display:block;width:100%;height:auto;object-fit:contain">`);
        info.innerHTML = '';
        put(info, html`${f.name} · ${img.naturalWidth}×${img.naturalHeight}px · 약 ${Math.round(d.length * 3 / 4 / 1024)}KB ${note ? html`<br><span class="chip warn">${note}</span>` : ''}${(ratio < 2.2 || ratio > 4) ? html`<br><span class="chip warn">가로형(약 3:1) 이미지가 아니에요. 홈 화면에서 작거나 크게 보일 수 있어요.</span>` : ''}`);
        btn.disabled = false;
      } catch (e) { put(box, html`<p class="small muted" style="margin:6px">미리 볼 수 없어요.</p>`); info.textContent = UI.errMsg(e); info.className = 'small'; UI.toast(UI.errMsg(e), 'err'); }
    };
    $('#ti-apply', root).onclick = async function () {
      if (!pending) return;
      if (!(await UI.confirm('이 이미지로 바꿀까요?', '모든 학생과 교사 화면의 타이틀 이미지가 바뀌어요. 언제든 기본 이미지로 되돌릴 수 있어요.', '적용'))) return;
      try { var r = await Api.save('site.set_title', { data_url: pending.dataUrl }); try { localStorage.setItem('vp_title', r.title_image); } catch (e) {} UI.setTitle(r.title_image); UI.toast('타이틀 이미지를 바꿨어요.', 'ok'); pending = null; $('#ti-apply', root).disabled = true; }
      catch (e) { UI.toast(UI.errMsg(e), 'err'); }
    };
    $('#ti-reset', root).onclick = async function () {
      if (!(await UI.confirm('기본 이미지로 되돌릴까요?', '올려 둔 이미지는 지워지고 처음의 타이틀 이미지로 돌아가요.', '되돌리기'))) return;
      try { await Api.save('site.reset_title', {}); try { localStorage.removeItem('vp_title'); } catch (e) {} UI.setTitle(''); UI.toast('기본 이미지로 되돌렸어요.', 'ok'); }
      catch (e) { UI.toast(UI.errMsg(e), 'err'); }
    };
  };
})();
