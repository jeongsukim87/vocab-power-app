/* 학생 화면 1: 계산 도우미, 홈, 어휘 목록, 학교·국가 어휘 상세 */
var Calc = (function () {
  'use strict';
  var U = VocabCore.util;
  var C = {};
  C.sv = function (vid) { return S.snap.sv.filter(function (x) { return x.vocabulary_id === vid; })[0] || null; };
  C.ws = function (vid) { return S.snap.writings.filter(function (w) { return w.vocabulary_id === vid; }); };
  C.w = function (vid, scene) { return S.snap.writings.filter(function (w) { return w.vocabulary_id === vid && w.scene_type === scene; })[0] || null; };
  C.col = function (id) { return S.snap.collections.filter(function (c) { return c.collection_id === id; })[0] || null; };
  C.info = function (vid) {
    var v = Data.get(vid); if (v) return v;
    var c = C.col(vid);
    return c ? { vocabulary_id: c.collection_id, headword: c.headword, definition: c.confirmed_meaning, origin: 'PERSONAL', subject: c.subject, normalized_headword: c.normalized_headword } : null;
  };
  C.ruleOf = function (origin) { return origin === 'SCHOOL' ? 'SCHOOL' : origin === 'PERSONAL' ? 'PERSONAL' : 'NATIONAL'; };
  C.status = function (vid) {
    var v = C.info(vid), o = v ? v.origin : 'PERSONAL', extra;
    if (o === 'PERSONAL') { var c = C.col(vid); extra = { confirmed: !!(c && U.trim(c.confirmed_meaning)), explained: !!(c && U.trim(c.self_explanation).length >= 10) }; }
    return U.vocabStatus(C.ruleOf(o), C.sv(vid), C.ws(vid), extra);
  };
  C.touched = function (vid) { return !!(C.sv(vid) || C.ws(vid).length); };
  C.state = function (vid) { var s = C.status(vid); return s.done ? 'done' : (C.touched(vid) ? 'part' : ''); };
  C.lessonDone = function (l) {
    var req = l.vocab.filter(function (x) { return x.required; });
    return req.length > 0 && req.every(function (x) { return C.status(x.vocabulary_id).done; });
  };
  C.threeDone = function (vid) { return Object.keys(U.submittedScenes(C.ws(vid))).length === 3; };
  C.lastStudied = function (vid) { var s = C.sv(vid), t = s ? s.last_studied_at : ''; C.ws(vid).forEach(function (w) { if (w.saved_at > t) t = w.saved_at; }); return t || ''; };
  C.feedbackFor = function (id) { return S.snap.feedback.filter(function (f) { return f.target_id === id; }); };
  C.dueReview = function () {
    var now = new Date().toISOString(), out = [];
    S.snap.sv.forEach(function (x) {
      if (!(x.steps && x.steps.define) && !x.box) return;
      var due = x.next_review_at ? x.next_review_at <= now : (x.last_studied_at && x.last_studied_at < new Date(Date.now() - 864e5).toISOString());
      if (due) out.push(x);
    });
    return out.sort(function (a, b) { return (a.next_review_at || a.last_studied_at) < (b.next_review_at || b.last_studied_at) ? -1 : 1; });
  };
  return C;
})();

var SV = (function () { // 서버에 받은 행을 내 기록 목록에 끼워 넣기
  'use strict';
  var X = {};
  X.upsert = function (list, key, row) {
    var i = list.findIndex(function (r) { return r[key] === row[key]; });
    if (i >= 0) list[i] = row; else list.push(row);
    return row;
  };
  X.draftKey = function (k) { return 'vp_draft_' + (S.user ? S.user.user_id : '') + '_' + k; };
  X.draftGet = function (k) { try { return JSON.parse(localStorage.getItem(X.draftKey(k)) || 'null'); } catch (e) { return null; } };
  X.draftSet = function (k, text) { try { localStorage.setItem(X.draftKey(k), JSON.stringify({ text: text, at: new Date().toISOString() })); } catch (e) {} };
  X.draftClear = function (k) { try { localStorage.removeItem(X.draftKey(k)); } catch (e) {} };

  /** 학습 기록(뜻 짐작·설명 등) 저장기: 입력이 멈추면 한 번에 보내고, 순서대로 하나씩만 보낸다. */
  X.saver = function (vid, stateEl) {
    var ss = UI.saveState(stateEl), pending = {}, timer = null, chain = Promise.resolve();
    function send(patch) {
      var run = chain.catch(function () {}).then(async function () {
        ss.busy();
        for (var attempt = 0; attempt < 2; attempt++) {
          try {
            var cur = Calc.sv(vid), payload = Object.assign({ vocabulary_id: vid }, patch);
            if (cur) payload.base_rev = cur.rev;
            var row = await Api.save('sv.save', payload);
            X.upsert(S.snap.sv, 'sv_id', row); ss.ok(); return row;
          } catch (e) {
            if (e.code === 'CONFLICT' && attempt === 0) { X.upsert(S.snap.sv, 'sv_id', e.data); continue; } // 다른 기기가 먼저 저장 → 최신 번호로 한 번 더
            ss.err(e.code === 'NETWORK' ? null : UI.errMsg(e)); throw e;
          }
        }
      });
      chain = run.catch(function () {});
      return run;
    }
    return {
      set: function (patch) { Object.assign(pending, patch); ss.text('입력 중…'); clearTimeout(timer); timer = setTimeout(this.flush, 1200); },
      flush: function () { clearTimeout(timer); var p = pending; pending = {}; return Object.keys(p).length ? send(p) : chain; },
      markNow: function (marks) { return send({ mark: marks }); }
    };
  };
  return X;
})();

(function () {
  'use strict';
  var V = Views.student = {};
  var U = VocabCore.util;
  function put(el, h) { el.innerHTML = h.s; }
  function dotOf(vid) { return '<span class="dot ' + Calc.state(vid) + '" title="' + ({ done: '완료', part: '학습 중', '': '아직' }[Calc.state(vid)]) + '"></span>'; }
  function sourceChips(vid) {
    var v = Data.get(vid); if (!v) return '';
    var sibs = [v].concat(Data.siblings(vid)), kinds = {};
    sibs.forEach(function (x) { kinds[x.origin] = 1; });
    return Object.keys(kinds).map(function (k) { return '<span class="chip ' + (k === 'SCHOOL' ? 'blue' : k === 'NATIONAL' ? 'purple' : 'green') + '">' + Data.originLabel(k) + '</span>'; }).join(' ');
  }
  function pageText(src) { return src.page === '미기재' ? '쪽수 미기재' : src.page; }

  /* ============================ 홈 ============================ */
  V.home = async function (root) {
    var sn = S.snap, now = new Date().toISOString();
    var schoolDone = Data.school.filter(function (v) { return Calc.status(v.vocabulary_id).done; }).length;
    var natTouched = Data.national.filter(function (v) { return Calc.touched(v.vocabulary_id); }).length;
    var natDone = Data.national.filter(function (v) { return Calc.status(v.vocabulary_id).done; }).length;
    var lessonsDone = sn.lessons.filter(Calc.lessonDone).length;
    var coll = sn.collections.filter(function (c) { return c.status === 'ACTIVE'; }).length;
    var three = Data.school.concat(Data.national).filter(function (v) { return Calc.threeDone(v.vocabulary_id); }).length
      + sn.collections.filter(function (c) { return Calc.threeDone(c.collection_id); }).length;
    var sentences = sn.writings.filter(function (w) { return w.version > 0; }).length;

    var tasks = [];
    sn.lessons.forEach(function (l) { l.vocab.forEach(function (x) { if (x.required && !Calc.status(x.vocabulary_id).done) tasks.push({ l: l, vid: x.vocabulary_id }); }); });
    var due = Calc.dueReview().slice(0, 5);
    var recent = sn.writings.filter(function (w) { return w.version > 0; }).sort(function (a, b) { return a.submitted_at < b.submitted_at ? 1 : -1; }).slice(0, 3);
    var fbs = sn.feedback.slice().sort(function (a, b) { return (a.read_at ? 1 : 0) - (b.read_at ? 1 : 0) || (a.updated_at < b.updated_at ? 1 : -1); }).slice(0, 3);
    var cont = Data.school.concat(Data.national).filter(function (v) { return Calc.touched(v.vocabulary_id) && !Calc.status(v.vocabulary_id).done; })
      .sort(function (a, b) { return Calc.lastStudied(b.vocabulary_id) < Calc.lastStudied(a.vocabulary_id) ? -1 : 1; })[0];

    function link(vid) { var v = Calc.info(vid); return v.origin === 'SCHOOL' ? '#/school/' + vid : v.origin === 'PERSONAL' ? '#/collect/' + vid : '#/national/' + vid; }

    put(root, html`<div class="stack">
      <div class="hero"><div class="slogan">아는 어휘에서 쓰는 어휘로!</div><h1>${S.user.display_name}님, 안녕하세요</h1><p>어휘를 이해하고, 생각을 확장하고, 나의 언어로 표현하다.</p>
        ${cont ? html`<p style="margin-top:12px"><a class="btn green" href="${link(cont.vocabulary_id)}">이어서 학습하기 · ${cont.headword}</a></p>` : html`<p style="margin-top:12px"><a class="btn green" href="#/vocab">어휘 학습 시작하기</a></p>`}</div>

      <div class="grid g4">
        <div class="card stat"><div class="l">34차시 진도</div><div class="n">${lessonsDone}<small> / 34</small></div>${UI.bar(UI.pct(lessonsDone, 34))}<div class="small muted" style="margin-top:6px">공개된 차시 ${sn.lessons.length}개</div></div>
        <div class="card stat"><div class="l">학교 필수 어휘</div><div class="n">${schoolDone}<small> / ${Data.school.length}</small></div>${UI.bar(UI.pct(schoolDone, Data.school.length))}<div class="small muted" style="margin-top:6px">모든 단계를 마친 어휘</div></div>
        <div class="card stat"><div class="l">국가 사고도구어 탐색</div><div class="n">${natTouched}<small> / ${Data.national.length}</small></div>${UI.bar(UI.pct(natTouched, Data.national.length))}<div class="small muted" style="margin-top:6px">완료 ${natDone}개</div></div>
        <div class="card stat"><div class="l">나의 수집 어휘</div><div class="n">${coll}<small> 개</small></div><div class="small muted" style="margin-top:6px">세 장면 작문 완료 <b>${three}</b>개 · 제출한 문장 ${sentences}개</div></div>
      </div>

      <div class="grid g2">
        <div class="card"><h2>오늘의 과제</h2>
          ${tasks.length ? html`<ul class="list">${tasks.slice(0, 5).map(function (t) { var v = Calc.info(t.vid); return html`<li><a class="vitem" href="${link(t.vid)}">${UI.raw(dotOf(t.vid))}<div class="grow"><div class="hw">${v.headword}</div><div class="sub">${t.l.title} · ${Data.originLabel(v.origin)}</div></div><span class="chip warn">해야 해요</span></a></li>`; })}</ul>${tasks.length > 5 ? html`<p class="small muted">그 밖에 ${tasks.length - 5}개가 더 있어요.</p>` : ''}`
            : html`<p class="muted">${sn.lessons.length ? '지금 해야 할 필수 과제를 모두 마쳤어요. 🎉' : '선생님이 아직 과제를 공개하지 않았어요. 어휘 목록에서 먼저 살펴봐도 좋아요.'}</p>`}</div>
        <div class="card"><h2>복습 추천</h2>
          ${due.length ? html`<ul class="list">${due.map(function (x) { var v = Calc.info(x.vocabulary_id); return v ? html`<li><div class="row between"><b>${v.headword}</b><span class="chip">${U.BOX_DAYS[Math.max(1, x.box)]}일 간격</span></div></li>` : ''; })}</ul><a class="btn primary" href="#/practice?t=quiz">복습하러 가기</a>`
            : html`<p class="muted">오늘 다시 볼 어휘는 아직 없어요. 뜻을 확인한 어휘가 생기면 알려 드릴게요.</p>`}</div>
      </div>

      <div class="grid g2">
        <div class="card"><h2>교사 피드백</h2>
          ${fbs.length ? html`<div class="stack">${fbs.map(function (f) { var tgt = f.target_type === 'WRITING' ? S.snap.writings.filter(function (w) { return w.writing_id === f.target_id; })[0] : null; var vv = tgt ? Calc.info(tgt.vocabulary_id) : null;
            return html`<div class="fb ${f.read_at ? '' : 'unread'}"><div class="small"><b>${vv ? vv.headword : '오늘의 문장'}</b> ${f.read_at ? '' : html`<span class="chip green">새 글</span>`}</div><div>${f.comment || '(점수만 남겨 주셨어요)'}</div>${tgt ? html`<a class="small" href="#/lab/${tgt.vocabulary_id}?scene=${tgt.scene_type}">내 문장 보기</a>` : html`<a class="small" href="#/practice?t=today">오늘의 문장 보기</a>`}</div>`; })}</div>`
            : html`<p class="muted">아직 받은 피드백이 없어요.</p>`}</div>
        <div class="card"><h2>최근에 쓴 문장</h2>
          ${recent.length ? html`<ul class="list">${recent.map(function (w) { var v = Calc.info(w.vocabulary_id); return html`<li><div class="small muted">${v ? v.headword : ''} · ${VocabCore.SCENE_LABEL[w.scene_type]} · ${UI.date(w.submitted_at)}</div><a href="#/lab/${w.vocabulary_id}?scene=${w.scene_type}" style="color:inherit;text-decoration:none">${w.text}</a></li>`; })}</ul>`
            : html`<p class="muted">아직 제출한 문장이 없어요. <a href="#/lab">쓰기 LAB</a>에서 첫 문장을 써 보세요.</p>`}</div>
      </div></div>`);
  };

  /* ============================ 어휘 목록 ============================ */
  V.vocab = async function (root, parts, q) {
    var tab = q.t === 'national' ? 'national' : 'school';
    var f = { subject: q.s || '', lesson: q.l || '', text: q.q || '', state: q.st || '' };
    function matchText(v) { return !f.text || v.normalized_headword.indexOf(VocabCore.util.norm(f.text)) >= 0 || (v.definition || '').indexOf(f.text) >= 0; }
    function matchState(v) { var s = Calc.state(v.vocabulary_id); return !f.state || (f.state === 'none' ? s === '' : s === f.state); }

    var shown = 60;
    function draw() {
      var list;
      if (tab === 'school') {
        var lessonSet = null;
        if (f.lesson) { var L = S.snap.lessons.filter(function (l) { return String(l.lesson_number) === f.lesson; })[0]; lessonSet = {}; (L ? L.vocab : []).forEach(function (x) { lessonSet[x.vocabulary_id] = x.required; }); }
        list = Data.school.filter(function (v) { return (!f.subject || v.subject === f.subject) && (!lessonSet || v.vocabulary_id in lessonSet) && matchText(v) && matchState(v); });
      } else {
        list = Data.national.filter(function (v) { return matchText(v) && matchState(v) && (f.state !== 'common' ? true : Data.siblings(v.vocabulary_id).length > 0); });
        if (f.state === 'common') list = Data.national.filter(function (v) { return matchText(v) && Data.siblings(v.vocabulary_id).length; });
        list.sort(function (a, b) { return a.headword < b.headword ? -1 : a.headword > b.headword ? 1 : 0; });
      }
      var box = $('#vlist', root);
      put(box, html`<p class="small muted">${list.length}개${tab === 'national' ? ' · 가나다순' : ''}</p>
        <div class="grid g2">${list.slice(0, shown).map(function (v) {
          var srcs = Data.sourcesOf(v.vocabulary_id).filter(function (s) { return s.source_type === 'SCHOOL'; });
          var sub = tab === 'school' ? (srcs.map(function (s) { return Data.subjectLabel(s.subject) + ' ' + pageText(s); }).join(' · ')) : (Data.siblings(v.vocabulary_id).length ? '학교 필수 어휘와 겹쳐요' : '');
          return html`<a class="vitem" href="#/${tab === 'school' ? 'school' : 'national'}/${v.vocabulary_id}">${UI.raw(dotOf(v.vocabulary_id))}<div class="grow"><div class="hw">${v.headword}</div><div class="sub">${sub}</div></div>${UI.raw(sourceChips(v.vocabulary_id))}</a>`; })}</div>
        ${list.length > shown ? html`<p class="center" style="margin-top:12px"><button class="btn" id="more">더 보기 (${list.length - shown}개 남음)</button></p>` : ''}
        ${list.length === 0 ? html`<p class="muted center" style="padding:20px">조건에 맞는 어휘가 없어요.</p>` : ''}`);
      var more = $('#more', root); if (more) more.onclick = function () { shown += 60; draw(); };
    }

    var lessonOpts = S.snap.lessons.map(function (l) { return html`<option value="${l.lesson_number}" ${f.lesson === String(l.lesson_number) ? 'selected' : ''}>${l.lesson_number}차시 · ${l.title.replace(/^\d+차시:?\s*/, '')}</option>`; });
    put(root, html`<div class="stack"><h1>어휘</h1>
      <div class="pill-tabs"><a href="#/vocab?t=school" class="${tab === 'school' ? 'on' : ''}">학교 필수 학습도구어 ${Data.school.length}</a><a href="#/vocab?t=national" class="${tab === 'national' ? 'on' : ''}">국가 사고도구어 ${Data.national.length}</a></div>
      <div class="card"><div class="row">
        <div class="grow" style="min-width:180px"><label class="f sr-only" for="vq">검색</label><input id="vq" type="search" placeholder="낱말이나 뜻으로 찾기" value="${f.text}"></div>
        ${tab === 'school' ? html`<select id="vs" style="width:auto" aria-label="교과"><option value="">모든 교과</option>${Data.SUBJECTS.map(function (s) { return html`<option value="${s}" ${f.subject === s ? 'selected' : ''}>${Data.subjectLabel(s)}</option>`; })}</select>
          <select id="vl" style="width:auto" aria-label="차시"><option value="">모든 차시</option>${lessonOpts}</select>` : ''}
        <select id="vst" style="width:auto" aria-label="상태"><option value="">모든 상태</option><option value="none" ${f.state === 'none' ? 'selected' : ''}>아직 안 한 것</option><option value="part" ${f.state === 'part' ? 'selected' : ''}>학습 중</option><option value="done" ${f.state === 'done' ? 'selected' : ''}>완료</option>${tab === 'national' ? html`<option value="common" ${f.state === 'common' ? 'selected' : ''}>학교 어휘와 겹치는 것</option>` : ''}</select>
      </div></div>
      ${tab === 'school' ? html`<div class="notice info small">뜻풀이는 선생님이 검토 중인 <b>초안</b>입니다. 교과서 쪽수가 «미기재» 인 어휘는 원본 자료에 쪽수가 없는 것이에요.</div>` : html`<div class="notice info small">국가기초학력지원센터의 사고도구어 카드로 학습해요. 확인 → 짐작 → 이해 → 확장 → 표현 순서로 만나 보세요.</div>`}
      <div id="vlist"></div></div>`);
    function upd() { f.text = $('#vq', root).value; var s = $('#vs', root), l = $('#vl', root); f.subject = s ? s.value : ''; f.lesson = l ? l.value : ''; f.state = $('#vst', root).value; shown = 60; draw(); }
    $('#vq', root).oninput = UI.debounce(upd, 200);
    ['#vs', '#vl', '#vst'].forEach(function (sel) { var el = $(sel, root); if (el) el.onchange = upd; });
    draw();
  };

  /* ============================ 학교 어휘 상세 ============================ */
  function steps(st) { return st || {}; }
  function relatedBlock(v) {
    var rels = Data.relations(v.vocabulary_id).filter(function (r) { return r.type === 'SAME_HEADWORD' || r.type === 'VARIANT_FORM'; });
    return rels;
  }

  V.school = async function (root, parts) {
    var vid = parts[0], v = Data.get(vid);
    if (!v || v.origin !== 'SCHOOL') { put(root, html`<div class="card"><p>어휘를 찾을 수 없어요.</p><a href="#/vocab">목록으로</a></div>`); return; }
    var srcs = Data.sourcesOf(vid), sibs = Data.siblings(vid), rels = Data.relations(vid);
    var saver;
    S.leave = function () { return saver && saver.flush(); };

    function ctxOf() { var sv = Calc.sv(vid), st = steps(sv && sv.steps); return { sv: sv, st: st, status: Calc.status(vid), guess: sv ? sv.guessed_meaning : '' }; }

    function headerInner() {
      var c = ctxOf(), st = c.st, status = c.status;
      var stepList = [['context', '교과서 문장'], ['infer', '뜻 짐작'], ['define', '뜻 확인'], ['explain', '내 말로 설명'], ['related', '관련어 탐색'], ['write', '세 장면 작문']];
      var doneMap = { context: st.context, infer: st.infer, define: st.define, explain: st.explain, related: st.related, write: Object.keys(status.scenes).length === 3 };
      var cur = null; stepList.some(function (s) { if (!doneMap[s[0]]) { cur = s[0]; return true; } });
      return html`<div class="row between"><div><span class="headword">${v.headword}</span> ${UI.raw(sourceChips(vid))}</div>${status.done ? html`<span class="chip green">✔ 완료</span>` : html`<span class="chip">${status.got} / ${status.total} 단계</span>`}</div>
        <div class="small muted" style="margin-top:6px">${srcs.map(function (s) { return html`<span class="chip blue">${Data.subjectLabel(s.subject)}</span> ${s.publisher} · ${pageText(s)}`; }).reduce(function (a, b) { return a.concat([b, UI.raw(' &nbsp; ')]); }, [])}</div>
        <ol class="stepper">${stepList.map(function (s) { return html`<li class="${doneMap[s[0]] ? 'done' : s[0] === cur ? 'cur' : ''}">${doneMap[s[0]] ? '✔ ' : ''}${s[1]}</li>`; })}</ol>`;
    }
    function revealInner() {
      var c = ctxOf(), canReveal = U.trim(c.guess).length >= 2 || c.st.define;
      if (!canReveal) return html`<h3>③ 뜻 확인하기</h3><p class="muted">②에서 먼저 짐작한 뜻을 적으면 열려요.</p>`;
      return html`<h3>③ 뜻 확인하기</h3>${c.st.define ? html`<div class="quote">${v.definition}</div><p class="small muted" style="margin-top:8px">${Data.STATUS_LABEL[v.definition_status] || ''}${v.definition_status === 'DRAFT_REVIEW' ? ' — 사전과 대조하기 전의 설명이에요. 더 알맞은 설명이 있으면 선생님께 알려 주세요.' : ''}</p>` : html`<button class="btn primary" id="reveal">뜻 보기</button>`}`;
    }
    function relInner() {
      var c = ctxOf();
      return html`<h3>⑤ 관련어 탐색</h3>
        ${(sibs.length || rels.length) ? html`<ul class="list">${rels.filter(function (r) { return r.other.vocabulary_id !== vid; }).map(function (r) {
          return html`<li><div class="row between"><div><b>${r.other.headword}</b> <span class="chip ${r.other.origin === 'NATIONAL' ? 'purple' : 'blue'}">${Data.originLabel(r.other.origin)}</span> <span class="chip">${Data.REL_LABEL[r.type] || r.type}${r.status === 'CANDIDATE' ? ' · 확인 전' : ''}</span></div>
            <a class="small" href="#/${r.other.origin === 'NATIONAL' ? 'national' : 'school'}/${r.other.vocabulary_id}">살펴보기</a></div>${r.other.definition ? html`<div class="small muted">${r.other.definition}</div>` : ''}</li>`; })}</ul>`
          : html`<p class="muted small">이 낱말과 이어진 어휘가 아직 목록에 없어요. 비슷한 말·반대말을 직접 떠올려 보세요.</p>`}
        ${sibs.length ? html`<div class="notice info small" style="margin-top:8px">국가 사고도구어에도 같은 표제어가 있어요. <b>뜻이 같은지는 선생님이 확인하기 전까지 «후보»</b> 로만 이어 두었어요. 두 뜻을 비교해 보세요.</div>` : ''}
        ${c.st.related ? html`<p class="chip green" style="margin-top:8px">✔ 관련어를 살펴봤어요</p>` : html`<button class="btn" id="rel-done" style="margin-top:8px">관련어를 살펴봤어요</button>`}`;
    }
    function sceneInner() {
      var chips = VocabCore.SCENES.map(function (sc) { var w = Calc.w(vid, sc), ok = w && w.version > 0; return '<a class="chip ' + (ok ? 'green' : w ? 'warn' : '') + '" href="#/lab/' + vid + '?scene=' + sc + '">' + (ok ? '✔ ' : w ? '✎ ' : '') + VocabCore.SCENE_LABEL[sc] + '</a>'; }).join(' ');
      return html`<h3>⑥ 세 장면에서 써 보세요</h3><p class="small">같은 낱말을 교과 · 일상 · 세상, 세 장면에서 써 봐야 «아는 어휘» 가 «쓰는 어휘» 가 돼요.</p><div class="row">${UI.raw(chips)}</div><p style="margin-top:12px"><a class="btn purple" href="#/lab/${vid}">쓰기 LAB 열기</a></p>`;
    }

    var c0 = ctxOf();
    put(root, html`<div class="stack">
      <p class="small"><a href="#/vocab?t=school">← 학교 필수 어휘</a></p>
      <div class="card"><div id="hdr">${headerInner()}</div><div id="svstate" class="savestate"></div></div>

      <div class="card"><h3>① 교과서에서 이 낱말이 쓰인 문장을 찾아 적어 보세요</h3>
        <p class="small muted">${srcs.map(function (s) { return Data.subjectLabel(s.subject) + '(' + s.publisher + ') ' + (s.page === '미기재' ? '— 쪽수가 원본 자료에 없어요. 교과서에서 직접 찾아 보세요.' : s.page + '에서 찾아보세요.'); }).join(' / ')}</p>
        <textarea id="t-ctx" placeholder="교과서 문장을 그대로 옮겨 적어요 (5자 이상)">${c0.sv ? c0.sv.textbook_sentence : ''}</textarea></div>

      <div class="card"><h3>② 문장 속에서 뜻을 짐작해 보세요</h3>
        <textarea id="t-guess" placeholder="앞뒤 내용을 보면 이런 뜻 같아요…">${c0.guess}</textarea></div>

      <div class="card" id="reveal-card">${revealInner()}</div>

      <div class="card"><h3>④ 내 말로 설명해 보세요</h3>
        <textarea id="t-exp" placeholder="친구에게 설명한다고 생각하고 적어 보세요 (10자 이상)" ${c0.st.define ? '' : 'disabled'}>${c0.sv ? c0.sv.self_explanation : ''}</textarea>
        <p class="small muted" id="exp-hint" ${c0.st.define ? 'hidden' : ''}>③에서 뜻을 확인하면 쓸 수 있어요.</p></div>

      <div class="card" id="rel-card">${relInner()}</div>
      <div class="card soft-purple" id="scene-card">${sceneInner()}</div>

      ${sibs.length ? html`<div class="card"><h3>같은 표제어의 국가 사고도구어 (연결 학습 이력)</h3><ul class="list">${sibs.map(function (s) { var stt = Calc.status(s.vocabulary_id); return html`<li><div class="row between"><div><b>${s.headword}</b> <span class="chip purple">국가</span></div><span class="chip ${stt.done ? 'green' : ''}">${stt.done ? '완료' : stt.got + ' / ' + stt.total + ' 단계'}</span></div><div class="small muted">${s.definition}</div><a class="small" href="#/national/${s.vocabulary_id}">카드로 학습하기</a></li>`; })}</ul></div>` : ''}
    </div>`);

    saver = SV.saver(vid, $('#svstate', root));
    // 글을 쓰는 중에는 화면 전체를 다시 그리지 않고, 바뀐 부분만 고친다 (입력 칸의 커서가 사라지지 않도록)
    function refresh() {
      put($('#hdr', root), headerInner());
      var rc = $('#reveal-card', root); put(rc, revealInner()); bindReveal();
      var c = ctxOf(); $('#t-exp', root).disabled = !c.st.define; $('#exp-hint', root).hidden = !!c.st.define;
      var rl = $('#rel-card', root); put(rl, relInner()); bindRel();
    }
    function bindReveal() {
      var rv = $('#reveal', root);
      if (rv) rv.onclick = async function () { try { await saver.flush(); await saver.markNow(['define']); refresh(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } };
    }
    function bindRel() {
      var rd = $('#rel-done', root);
      if (rd) rd.onclick = async function () { try { await saver.markNow(['related']); refresh(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } };
    }
    [['#t-ctx', 'textbook_sentence'], ['#t-guess', 'guessed_meaning'], ['#t-exp', 'self_explanation']].forEach(function (p) {
      var el = $(p[0], root);
      el.oninput = function () { var o = {}; o[p[1]] = el.value; saver.set(o); SV.draftSet('sv_' + vid + '_' + p[1], el.value); if (p[1] === 'guessed_meaning') { var ok = U.trim(el.value).length >= 2; if (ok !== !!$('#reveal-card', root).dataset.on) { $('#reveal-card', root).dataset.on = ok ? '1' : ''; var cc = ctxOf(); if (!cc.st.define) { put($('#reveal-card', root), html`<h3>③ 뜻 확인하기</h3>${ok ? html`<button class="btn primary" id="reveal">뜻 보기</button>` : html`<p class="muted">②에서 먼저 짐작한 뜻을 적으면 열려요.</p>`}`); bindReveal(); } } } };
      el.onblur = function () { saver.flush().then(refresh).catch(function () {}); };
    });
    bindReveal(); bindRel();
  };

  /* ============================ 국가 사고도구어 카드 ============================ */
  V.national = async function (root, parts, q) {
    var vid = parts[0], v = Data.get(vid);
    if (!v || (v.origin !== 'NATIONAL')) { put(root, html`<div class="card"><p>어휘를 찾을 수 없어요.</p><a href="#/vocab?t=national">목록으로</a></div>`); return; }
    var cards = await Data.loadCards(), c = cards[vid];
    var stage = q.stage || '';
    var saver, sibs = Data.siblings(vid);
    S.leave = function () { return saver && saver.flush(); };

    var STAGES = [['confirm', '확인', '문장에서 발견하기'], ['guess', '짐작', '뜻 짐작하기'], ['understand', '이해', '뜻·예문 알기'], ['expand', '확장', '관련어·교과 쓰임'], ['express', '표현', '새 문장 쓰기']];
    function draw() {
      var sv = Calc.sv(vid), st = steps(sv && sv.steps), status = Calc.status(vid);
      var guess = sv ? sv.guessed_meaning : '';
      var unlocked = { confirm: true, guess: true, understand: U.trim(guess).length >= 2 || st.define, expand: st.define, express: st.define };
      if (!stage || !unlocked[stage]) { stage = !st.confirm ? 'confirm' : !st.infer ? 'guess' : !st.define ? 'understand' : !st.related ? 'expand' : 'express'; }
      var doneMap = { confirm: st.confirm, guess: st.infer, understand: st.define, expand: st.related, express: Object.keys(status.scenes).length > 0 };
      var body;
      if (stage === 'confirm') {
        body = html`<h3>확인 · 이 문장에서 «${v.headword}» 를 찾아보세요</h3><div class="quote">${UI.marked(c.confirm.text.indexOf('{{') < 0 ? c.confirm.text.replace(v.headword.replace(/(하다|되다|적|화|성)$/, ''), '{{$&}}') : c.confirm.text)}</div>
          <p class="small muted" style="margin-top:8px">굵게 표시된 낱말이 오늘의 어휘예요. 어떤 뜻으로 쓰였을까요?</p>
          ${st.confirm ? '' : html`<button class="btn primary" id="go-guess">문장을 읽었어요 → 짐작하러 가기</button>`}`;
      } else if (stage === 'guess') {
        body = html`<h3>짐작 · 단서를 보고 뜻을 떠올려 보세요</h3>
          <div class="row" style="align-items:stretch">${c.guess.map(function (g, i) { return html`<div class="card flat grow" style="min-width:150px"><span class="chip purple">단서 ${i + 1}</span><div style="margin-top:6px">${g}</div></div>`; })}</div>
          <label class="f" for="t-guess">내가 짐작한 뜻<span class="hint">2자 이상 쓰면 «이해» 가 열려요</span></label><textarea id="t-guess" placeholder="이런 뜻 같아요…">${guess}</textarea>`;
      } else if (stage === 'understand') {
        body = html`<h3>이해 · 뜻과 예문</h3>
          <div class="quote"><b>${v.headword}</b><div>${c.understand.definition}</div></div>
          <div class="card flat" style="margin-top:10px"><span class="chip">예문</span><div style="margin-top:6px">${UI.marked(c.understand.example)}</div></div>
          ${U.trim(guess) ? html`<p class="small muted" style="margin-top:8px">내가 짐작한 뜻: “${guess}”</p>` : ''}
          ${st.define ? '' : html`<button class="btn primary" id="got-it">뜻을 이해했어요</button>`}`;
      } else if (stage === 'expand') {
        body = html`<h3>확장 · 어근 «${c.expand.stem || v.headword}» 에서 퍼져 나가는 말</h3>
          ${c.expand.items.map(function (it) { return html`<div class="expand-item"><div class="tp">${it.type}</div><div>${UI.marked(it.sentence)}</div>${it.definition ? html`<div class="df"><b>${it.word}</b> ${it.definition}</div>` : html`<div class="df muted">(원본 카드에 설명이 없는 항목이에요)</div>`}</div>`; })}
          ${st.related ? html`<p class="chip green" style="margin-top:10px">✔ 관련어를 살펴봤어요</p>` : html`<button class="btn primary" id="exp-done" style="margin-top:12px">모두 살펴봤어요</button>`}`;
      } else {
        var ws = Calc.ws(vid);
        body = html`<h3>표현 · 나의 문장으로 써 보세요</h3><p>배운 낱말로 새 문장을 쓰면 «아는 어휘» 가 «쓰는 어휘» 가 돼요. 세 장면 중 하나만 써도 이 단계는 끝나고, 세 장면을 모두 쓰면 더 좋아요.</p>
          <div class="row">${VocabCore.SCENES.map(function (sc) { var w = Calc.w(vid, sc); return html`<a class="chip ${w && w.version > 0 ? 'green' : w ? 'warn' : ''}" href="#/lab/${vid}?scene=${sc}">${w && w.version > 0 ? '✔ ' : ''}${VocabCore.SCENE_LABEL[sc]}</a>`; })}</div>
          <p style="margin-top:12px"><a class="btn purple" href="#/lab/${vid}">쓰기 LAB 열기</a></p>`;
      }
      put(root, html`<div class="stack">
        <p class="small"><a href="#/vocab?t=national">← 국가 사고도구어</a></p>
        <div class="card"><div class="row between"><div><span class="headword">${v.headword}</span> ${UI.raw(sourceChips(vid))}</div>${status.done ? html`<span class="chip green">✔ 완료</span>` : html`<span class="chip">${status.got} / ${status.total} 단계</span>`}</div>
          <div class="pill-tabs" style="margin:10px 0 0">${STAGES.map(function (s) { return unlocked[s[0]] ? html`<a href="#/national/${vid}?stage=${s[0]}" class="${s[0] === stage ? 'on' : ''}">${doneMap[s[0]] ? '✔ ' : ''}${s[1]}</a>` : html`<span class="chip" style="padding:8px 14px;opacity:.6">🔒 ${s[1]}</span>`; })}</div>
          <div id="svstate" class="savestate"></div></div>
        <div class="card">${body}</div>
        ${c.review_flags && c.review_flags.length ? html`<div class="notice small">이 카드는 PDF 에서 글자를 뽑는 과정에서 띄어쓰기가 어색할 수 있어요. 이상한 곳이 있으면 선생님께 알려 주세요.</div>` : ''}
        ${sibs.length ? html`<div class="card"><h3>학교 필수 학습도구어에도 있어요 <span class="chip blue">학교</span></h3><ul class="list">${sibs.map(function (s) { var stt = Calc.status(s.vocabulary_id), src = Data.sourcesOf(s.vocabulary_id)[0] || {}; return html`<li><div class="row between"><div><b>${s.headword}</b> <span class="chip">${Data.subjectLabel(src.subject)}</span></div><span class="chip ${stt.done ? 'green' : ''}">${stt.done ? '완료' : stt.got + ' / ' + stt.total + ' 단계'}</span></div><div class="small muted">학교 초안: ${s.definition}</div><a class="small" href="#/school/${s.vocabulary_id}">학교 어휘로 학습하기</a></li>`; })}</ul><p class="small muted">같은 낱말이라도 뜻이 같은지는 선생님이 확인해요. 학습 기록은 따로 쌓이고, 여기서 함께 보여 줘요.</p></div>` : ''}
        <div class="card flat small muted">카드 출처: 국가기초학력지원센터 교수학습 카드(${Data.sourcesOf(vid)[0] ? Data.sourcesOf(vid)[0].page : ''}) · 이용 허락 확인 전</div>
      </div>`);

      saver = saver || SV.saver(vid, $('#svstate', root));
      if (!st.confirm && stage === 'confirm') { /* 확인 쪽을 열면 «본 것» 으로 표시하지 않고 버튼으로 표시 */ }
      var b;
      if ((b = $('#go-guess', root))) b.onclick = async function () { try { await saver.markNow(['confirm']); stage = 'guess'; draw(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } };
      var gEl = $('#t-guess', root);
      if (gEl) {
        gEl.oninput = function () { saver.set({ guessed_meaning: gEl.value }); };
        gEl.onblur = function () { saver.flush().then(function () { if (U.trim(gEl.value).length >= 2 && !unlocked.understand) draw(); }).catch(function () {}); };
      }
      if ((b = $('#got-it', root))) b.onclick = async function () { try { await saver.markNow(['define']); stage = 'expand'; draw(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } };
      if ((b = $('#exp-done', root))) b.onclick = async function () { try { await saver.markNow(['related']); stage = 'express'; draw(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } };
    }
    draw();
  };
})();
