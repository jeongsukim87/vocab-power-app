/* 학생 화면 2: 세 장면 작문 LAB, 나의 어휘 수집함, 오늘의 문장·복습·성장 기록 */
(function () {
  'use strict';
  var V = Views.student;
  var U = VocabCore.util;
  var SCENES = VocabCore.SCENES, SL = VocabCore.SCENE_LABEL;
  function put(el, h) { el.innerHTML = h.s; }
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function wordLink(vid) { var v = Calc.info(vid); return v ? (v.origin === 'SCHOOL' ? '#/school/' + vid : v.origin === 'PERSONAL' ? '#/collect/' + vid : '#/national/' + vid) : '#/vocab'; }

  /* ============================ 쓰기 LAB ============================ */
  function sceneDots(vid) {
    return SCENES.map(function (sc) { var w = Calc.w(vid, sc); return '<span class="chip ' + (w && w.version > 0 ? 'green' : w ? 'warn' : '') + '" title="' + SL[sc] + '">' + (w && w.version > 0 ? '✔' : w ? '✎' : '○') + '</span>'; }).join('');
  }

  async function labList(root, q) {
    var tab = q.t || 'school', text = q.q || '';
    var drafts = S.snap.writings.filter(function (w) { return w.status === 'DRAFT' || w.status === 'REVISING'; }).sort(function (a, b) { return a.saved_at < b.saved_at ? 1 : -1; });
    var assigned = {}; S.snap.lessons.forEach(function (l) { l.vocab.forEach(function (x) { if (x.required) assigned[x.vocabulary_id] = l.title; }); });
    var pool = tab === 'school' ? Data.school : tab === 'national' ? Data.national : S.snap.collections.filter(function (c) { return c.status === 'ACTIVE'; }).map(function (c) { return Calc.info(c.collection_id); });
    var n = U.norm(text);
    var list = pool.filter(function (v) { return !n || v.normalized_headword.indexOf(n) >= 0; });
    if (tab === 'national') list = list.slice().sort(function (a, b) { return a.headword < b.headword ? -1 : 1; });
    if (tab === 'school') list = list.slice().sort(function (a, b) { return (assigned[b.vocabulary_id] ? 1 : 0) - (assigned[a.vocabulary_id] ? 1 : 0); });
    var shown = 50;
    function drawList() {
      put($('#llist', root), html`<p class="small muted">${list.length}개${tab === 'school' ? ' · 선생님이 정한 과제를 위에 모았어요' : ''}</p><div class="grid g2">${list.slice(0, shown).map(function (v) {
        return html`<a class="vitem" href="#/lab/${v.vocabulary_id}"><div class="grow"><div class="hw">${v.headword}</div><div class="sub">${assigned[v.vocabulary_id] ? '과제 · ' + assigned[v.vocabulary_id] : Data.originLabel(v.origin)}</div></div><span>${UI.raw(sceneDots(v.vocabulary_id))}</span></a>`; })}</div>
        ${list.length > shown ? html`<p class="center" style="margin-top:12px"><button class="btn" id="more">더 보기</button></p>` : ''}${list.length === 0 ? html`<p class="muted center" style="padding:20px">${tab === 'mine' ? '수집함에 단어를 먼저 넣어 주세요.' : '찾는 낱말이 없어요.'}</p>` : ''}`);
      var m = $('#more', root); if (m) m.onclick = function () { shown += 50; drawList(); };
    }
    put(root, html`<div class="stack"><h1>세 장면 작문 LAB</h1>
      <div class="hero" style="padding:16px"><p style="font-weight:700">교과 속에서 · 일상 속에서 · 세상 속에서</p><p class="small" style="opacity:.95">같은 낱말을 세 장면에서 직접 써 봐요. 쓰다 만 글은 저절로 저장돼요.</p></div>
      ${drafts.length ? html`<div class="card soft-green"><h3>이어서 쓰기</h3><ul class="list">${drafts.slice(0, 4).map(function (w) { var v = Calc.info(w.vocabulary_id); return v ? html`<li><a class="vitem" href="#/lab/${w.vocabulary_id}?scene=${w.scene_type}"><div class="grow"><div class="hw">${v.headword}</div><div class="sub">${SL[w.scene_type]} · ${w.status === 'REVISING' ? '고치는 중' : '쓰는 중'} · ${UI.date(w.saved_at)}</div></div><span class="chip warn">이어서</span></a></li>` : ''; })}</ul></div>` : ''}
      <div class="pill-tabs"><a href="#/lab?t=school" class="${tab === 'school' ? 'on' : ''}">학교 필수 (기본 대상)</a><a href="#/lab?t=national" class="${tab === 'national' ? 'on' : ''}">국가 사고도구어</a><a href="#/lab?t=mine" class="${tab === 'mine' ? 'on' : ''}">내 단어</a></div>
      <input id="lq" type="search" placeholder="낱말로 찾기" value="${text}" aria-label="낱말로 찾기">
      <div id="llist"></div></div>`);
    $('#lq', root).oninput = UI.debounce(function () { text = $('#lq', root).value; n = U.norm(text); list = pool.filter(function (v) { return !n || v.normalized_headword.indexOf(n) >= 0; }); shown = 50; drawList(); }, 200);
    drawList();
  }

  V.lab = async function (root, parts, q) {
    if (!parts[0]) return labList(root, q);
    var vid = parts[0], info = Calc.info(vid);
    if (!info) { put(root, html`<div class="card"><p>어휘를 찾을 수 없어요.</p><a href="#/lab">목록으로</a></div>`); return; }
    var scene = SCENES.indexOf(q.scene) >= 0 ? q.scene : (SCENES.filter(function (sc) { var w = Calc.w(vid, sc); return !(w && w.version > 0); })[0] || 'SUBJECT');
    var ed = null; // 지금 열린 장면 편집기

    S.leave = async function () { if (ed) await ed.flush(); };

    function header() {
      return html`<div class="card"><div class="row between"><div><span class="headword" style="font-size:1.6rem">${info.headword}</span> ${UI.raw(sourceChips2(vid))}</div><a class="btn small" href="${wordLink(vid)}">${info.origin === 'PERSONAL' ? '수집함에서 보기' : '어휘 학습으로'}</a></div>
        <details class="acc" style="margin-top:10px"><summary>뜻 보기</summary><div>${info.definition ? html`<p>${info.definition}</p>${info.definition_status === 'DRAFT_REVIEW' ? html`<p class="small muted">뜻풀이 초안 · 검토 필요</p>` : ''}` : html`<p class="muted">아직 뜻을 적지 않았어요.</p>`}</div></details>
        <div class="row" style="margin-top:12px;align-items:stretch">${SCENES.map(function (sc) { var w = Calc.w(vid, sc), ok = w && w.version > 0;
          return html`<a class="scene-tab scene-${sc} ${sc === scene ? 'on' : ''}" href="#/lab/${vid}?scene=${sc}" style="text-decoration:none">${ok ? '✔ ' : w ? '✎ ' : ''}${SL[sc]}<small>${ok ? '제출 v' + w.version + (w.status === 'REVISING' ? ' · 고치는 중' : '') : w ? '쓰는 중' : '아직'}</small></a>`; })}</div></div>`;
    }
    function sourceChips2(id) { var v = Data.get(id); return v ? sourceChipsHtml(v) : '<span class="chip green">나의 단어</span>'; }
    function sourceChipsHtml(v) { var sibs = [v].concat(Data.siblings(v.vocabulary_id)), k = {}; sibs.forEach(function (x) { k[x.origin] = 1; }); return Object.keys(k).map(function (o) { return '<span class="chip ' + (o === 'SCHOOL' ? 'blue' : o === 'NATIONAL' ? 'purple' : 'green') + '">' + Data.originLabel(o) + '</span>'; }).join(' '); }

    put(root, html`<div class="stack"><p class="small"><a href="#/lab">← 쓰기 LAB</a></p><div id="lab-head">${header()}</div><div id="lab-scene"></div></div>`);
    ed = sceneEditor($('#lab-scene', root), vid, scene, info, function () { put($('#lab-head', root), header()); });
  };

  function sceneEditor(box, vid, scene, info, onChange) {
    var pr = Data.promptFor(vid, scene, info.headword);
    var key = vid + '_' + scene, chain = Promise.resolve(), dirty = false, ta, ss, drawn = false;
    var w0 = Calc.w(vid, scene);
    var local = SV.draftGet(key);
    var base = w0 ? (w0.draft_text || w0.text || '') : '';
    var restored = !!(local && local.text && local.text !== base && (!w0 || local.at > w0.saved_at));
    var startText = restored ? local.text : base;
    var CHECKS = [['word', '낱말을 자연스럽게 썼나요?'], ['scene', '이 장면에 어울리는 문장인가요?'], ['meaning', '낱말의 뜻이 정확히 드러나나요?'], ['mine', '내 생각이나 경험이 담겼나요?']];

    function statusChip(w) {
      if (!w) return html`<span class="chip">아직 안 썼어요</span>`;
      if (w.status === 'REVISING') return html`<span class="chip warn">고치는 중 · 제출본 v${w.version}</span>`;
      if (w.version > 0) return html`<span class="chip green">✔ 제출함 v${w.version}</span>`;
      return html`<span class="chip warn">쓰는 중 (임시 저장)</span>`;
    }

    function draw() {
      var w = Calc.w(vid, scene), sc = (w && w.self_check) || {}, fbs = w ? Calc.feedbackFor(w.writing_id) : [];
      var shown = drawn ? (w ? (w.draft_text || w.text || '') : '') : startText, showRestored = !drawn && restored;
      drawn = true;
      put(box, html`<div class="card stack">
        <div class="row between"><span class="chip ${scene === 'SUBJECT' ? 'blue' : scene === 'DAILY' ? 'green' : 'purple'}">${SL[scene]} 쓰기</span><span id="stchip">${statusChip(w)}</span></div>
        <div><h3>상황</h3><p style="margin:0">${pr.scenario}</p>${pr.fallback ? html`<p class="small muted">기본 안내예요. 선생님이 이 낱말의 장면을 따로 만들면 바뀌어요.</p>` : (pr.status === 'DRAFT_REVIEW' ? html`<p class="small muted">장면 초안 · 검토 필요</p>` : '')}</div>
        <div class="quote"><b>생각해 볼 질문</b><br>${pr.question}</div>
        <div><label class="f" for="txt" style="margin-top:0">내 문장 <span class="hint">‘${info.headword}’ 을(를) 넣어 쓰세요 · 여러 문장도 괜찮아요</span></label>
          <textarea class="big" id="txt" maxlength="2000" placeholder="여기에 써 보세요">${shown}</textarea>
          <div class="row between small muted"><span id="cnt"></span><span id="savestate" class="savestate"></span></div>
          ${showRestored ? html`<div class="notice info small" style="margin-top:6px">이 기기에 임시로 저장해 둔 글을 불러왔어요.</div>` : ''}</div>
        <div class="checks"><b class="small">자기 점검</b>${CHECKS.map(function (c) { return html`<label><input type="checkbox" data-chk="${c[0]}" ${sc[c[0]] ? 'checked' : ''}><span>${c[1]}</span></label>`; })}</div>
        <div class="row"><button class="btn" id="b-draft">임시 저장</button><button class="btn primary" id="b-submit">${w && w.version > 0 ? '고쳐서 다시 제출' : '제출하기'}</button><button class="btn ghost" id="b-example">예시 보기</button></div>
        <div id="example"></div>
        ${w && w.version > 0 ? html`<div class="notice ok small"><b>제출한 문장 (v${w.version})</b><br>${w.text}<div class="row" style="margin-top:8px"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="feat" ${w.featured ? 'checked' : ''} style="width:20px;height:20px"> 대표 문장으로 고르기</label></div></div>` : ''}
        ${fbs.length ? html`<div class="stack"><h3>선생님 피드백</h3>${fbs.map(function (f) { return html`<div class="fb ${f.read_at ? '' : 'unread'}"><div>${f.comment || '(글 대신 점수를 남겨 주셨어요)'}</div>${f.rubric && Object.keys(f.rubric).length ? html`<div class="row" style="margin-top:6px">${VocabCore.RUBRIC.filter(function (k) { return f.rubric[k]; }).map(function (k) { return html`<span class="chip green">${VocabCore.RUBRIC_LABEL[k]} ${f.rubric[k]}/4</span>`; })}</div>` : ''}<div class="small muted">${UI.date(f.updated_at)}</div></div>`; })}</div>` : ''}
        ${w && w.version > 0 ? html`<details class="acc" id="revs"><summary>수정 이력 (${w.version}번 제출)</summary><div id="revlist" class="small muted">열면 불러와요…</div></details>` : ''}
      </div>`);
      ta = $('#txt', box); ss = UI.saveState($('#savestate', box));
      count();
      ta.oninput = function () { dirty = true; count(); SV.draftSet(key, ta.value); ss.text('입력 중…'); auto(); };
      $$('[data-chk]', box).forEach(function (c) { c.onchange = function () { dirty = true; auto(); }; });
      $('#b-draft', box).onclick = async function () { try { await save('DRAFT'); UI.toast('임시 저장했어요.', 'ok'); } catch (e) { /* 표시됨 */ } };
      $('#b-submit', box).onclick = submit;
      $('#b-example', box).onclick = showExample;
      var rv = $('#revs', box); if (rv) rv.ontoggle = function () { if (rv.open) loadRevs(w); };
      var ft = $('#feat', box); if (ft) ft.onchange = async function () { try { var row = await Api.save('writing.feature', { writing_id: w.writing_id, featured: ft.checked }); SV.upsert(S.snap.writings, 'writing_id', row); UI.toast(ft.checked ? '대표 문장에 담았어요.' : '대표 문장에서 뺐어요.', 'ok'); } catch (e) { UI.toast(UI.errMsg(e), 'err'); ft.checked = !ft.checked; } };
      // 새 피드백은 «읽음» 으로 알려 준다
      fbs.filter(function (f) { return !f.read_at; }).forEach(function (f) { Api.save('feedback.read', { feedback_id: f.feedback_id }).then(function () { f.read_at = new Date().toISOString(); }).catch(function () {}); });
    }
    function count() { var n = ta.value.length; $('#cnt', box).textContent = n + '자'; }
    function checks() { var o = {}; $$('[data-chk]', box).forEach(function (c) { o[c.dataset.chk] = c.checked; }); return o; }

    var auto = UI.debounce(function () { save('DRAFT').catch(function () {}); }, 1500);

    function save(mode) {
      var run = chain.catch(function () {}).then(async function () {
        var text = ta.value;
        if (mode === 'DRAFT' && !text && !Calc.w(vid, scene)) { ss.text(''); dirty = false; return null; }
        ss.busy();
        for (var attempt = 0; attempt < 2; attempt++) {
          var w = Calc.w(vid, scene);
          try {
            var row = await Api.save('writing.save', { vocabulary_id: vid, scene_type: scene, text: text, mode: mode, self_check: checks(), base_rev: w ? w.rev : 0 });
            SV.upsert(S.snap.writings, 'writing_id', row);
            if (ta && ta.value === text) { SV.draftClear(key); dirty = false; }
            ss.ok(mode === 'SUBMIT' ? '✔ 제출했어요' : null);
            var chip = $('#stchip', box); if (chip) put(chip, statusChip(row));
            return row;
          } catch (e) {
            if (e.code === 'CONFLICT') {
              var choice = await conflictDialog(text, e.data);
              SV.upsert(S.snap.writings, 'writing_id', e.data);
              if (choice === 'server') { ta.value = e.data.draft_text || e.data.text || ''; SV.draftClear(key); dirty = false; ss.ok('서버 글을 불러왔어요'); return e.data; }
              continue; // 내 글로 덮어쓰기: 최신 번호로 다시 보낸다
            }
            if (e.code === 'NETWORK' || e.code === 'BUSY') ss.err(); else ss.err(UI.errMsg(e));
            throw e;
          }
        }
      });
      chain = run.catch(function () {});
      return run;
    }

    async function conflictDialog(mine, server) {
      var r = await UI.modal({ title: '다른 기기에서 먼저 저장했어요', sticky: true, wide: true,
        body: html`<p>같은 글을 다른 기기에서 고친 기록이 있어요. 어느 글을 쓸까요?</p><div class="grid g2"><div class="card flat"><b>이 화면의 글</b><p class="small" style="white-space:pre-wrap">${mine}</p></div><div class="card flat"><b>저장돼 있는 글 (${UI.datetime(server.saved_at)})</b><p class="small" style="white-space:pre-wrap">${server.draft_text || server.text}</p></div></div>`,
        buttons: [{ label: '저장돼 있는 글 쓰기', value: 'server' }, { label: '이 화면의 글로 바꾸기', kind: 'primary', value: 'mine' }] });
      return r || 'server';
    }

    async function submit() {
      if (U.trim(ta.value).length < 5) { UI.toast('문장을 조금 더 써서 제출해 주세요. (5자 이상)', 'err'); return; }
      var allChecked = Object.keys(checks()).filter(function (k) { return checks()[k]; }).length;
      if (!allChecked) { var ok = await UI.confirm('자기 점검을 안 했어요', '쓴 문장을 한 번 읽어 보고 위의 자기 점검에 표시해 보면 좋아요. 그래도 제출할까요?', '그래도 제출'); if (!ok) return; }
      try {
        auto.flush();
        var row = await save('SUBMIT');
        if (row) { UI.toast('제출했어요! 선생님이 읽고 피드백을 남겨 주실 거예요.', 'ok'); draw(); onChange(); }
      } catch (e) {
        if (e.code === 'UNCHANGED') UI.toast('고친 곳이 없어요. 문장을 고친 뒤에 다시 제출해 주세요.', 'err');
        else if (e.code === 'TOO_SHORT') UI.toast(e.message, 'err');
        else UI.toast(UI.errMsg(e), 'err');
      }
    }

    async function showExample() {
      if (U.trim(ta.value).length < 5) { UI.toast('먼저 내 문장을 써 보세요. 쓴 다음에 예시를 볼 수 있어요.', 'err'); return; }
      try {
        auto.flush(); await save('DRAFT');
        var r = await Api.call('writing.example', { vocabulary_id: vid, scene_type: scene });
        var w = Calc.w(vid, scene);
        if (w && !w.example_viewed) Api.save('writing.mark_example', { writing_id: w.writing_id }).then(function (row) { SV.upsert(S.snap.writings, 'writing_id', row); }).catch(function () {});
        put($('#example', box), r.example ? html`<div class="notice info"><b>예시</b> <span class="small">(정답이 아니라 «이렇게도 쓸 수 있다» 는 본보기예요)</span><p style="margin:6px 0 0">${r.example}</p></div>` : html`<div class="notice info small">이 장면에는 아직 예시가 없어요.</div>`);
      } catch (e) { UI.toast(UI.errMsg(e), 'err'); }
    }

    async function loadRevs(w) {
      var el = $('#revlist', box);
      try {
        var revs = await Api.call('writing.revisions', { writing_id: w.writing_id });
        put(el, html`<ol class="list" style="padding-left:0">${revs.slice().reverse().map(function (r, i) { return html`<li><b>v${r.version}</b> ${i === 0 ? html`<span class="chip green">지금 제출본</span>` : ''} <span class="muted">${UI.datetime(r.saved_at)}</span><div style="white-space:pre-wrap">${r.text}</div></li>`; })}</ol>`);
      } catch (e) { el.textContent = UI.errMsg(e); }
    }

    draw();
    return { flush: async function () { auto.flush(); if (dirty) { try { await save('DRAFT'); } catch (e) { /* 이 기기에 임시 보관돼 있음 */ } } } };
  }

  /* ============================ 나의 어휘 수집함 ============================ */
  var MEDIA = ['독서', '수업', '기사', '영상', '일상', '기타'];
  function collForm(c) {
    c = c || {};
    return html`<label class="f" for="c-head">낱말</label><input id="c-head" type="text" maxlength="40" value="${c.headword || ''}" required>
      <div class="grid g2"><div><label class="f" for="c-date">발견한 날</label><input id="c-date" type="date" value="${c.discovered_at || UI.today()}"></div>
      <div><label class="f" for="c-med">어디서 만났나요?</label><select id="c-med">${MEDIA.map(function (m) { return html`<option ${c.medium === m ? 'selected' : ''}>${m}</option>`; })}</select></div></div>
      <label class="f" for="c-ctx">원문 또는 문맥 요약<span class="hint">어떤 글·장면에서 만났나요?</span></label><textarea id="c-ctx" style="min-height:90px">${c.source_context || ''}</textarea>
      <label class="f" for="c-gue">짐작한 뜻</label><input id="c-gue" type="text" value="${c.guessed_meaning || ''}">
      <label class="f" for="c-con">확인한 뜻<span class="hint">사전이나 선생님께 확인한 뜻</span></label><input id="c-con" type="text" value="${c.confirmed_meaning || ''}">
      <label class="f" for="c-exp">내 말로 설명<span class="hint">10자 이상</span></label><textarea id="c-exp" style="min-height:80px">${c.self_explanation || ''}</textarea>
      <label class="f" for="c-ex">예문</label><input id="c-ex" type="text" value="${c.example_sentence || ''}">
      <div class="grid g2"><div><label class="f" for="c-sub">교과</label><select id="c-sub"><option value="">(선택 안 함)</option>${Data.SUBJECTS.concat(['기타']).map(function (s) { return html`<option value="${s}" ${c.subject === s ? 'selected' : ''}>${Data.subjectLabel(s)}</option>`; })}</select></div>
      <div><label class="f" for="c-tags">태그<span class="hint">쉼표로 구분</span></label><input id="c-tags" type="text" value="${c.tags || ''}" placeholder="예) 뉴스, 과학"></div></div>
      <label class="f" for="c-rel">관련어<span class="hint">비슷한 말·반대말·같은 뿌리의 말</span></label><input id="c-rel" type="text" value="${c.related_words || ''}">`;
  }
  function collRead(root) {
    var g = function (id) { return $(id, root).value; };
    return { headword: g('#c-head'), discovered_at: g('#c-date'), medium: g('#c-med'), source_context: g('#c-ctx'), guessed_meaning: g('#c-gue'),
      confirmed_meaning: g('#c-con'), self_explanation: g('#c-exp'), example_sentence: g('#c-ex'), subject: g('#c-sub'), tags: g('#c-tags'), related_words: g('#c-rel') };
  }
  function shareChip(c) { return c.share_status === 'PENDING' ? '<span class="chip warn">공유 검토 중</span>' : c.share_status === 'APPROVED' ? '<span class="chip green">학급 공유됨</span>' : c.share_status === 'REJECTED' ? '<span class="chip danger">공유 안 됨</span>' : ''; }

  V.collect = async function (root, parts, q) {
    if (parts[0] === 'new') return collNew(root);
    if (parts[0]) return collEdit(root, parts[0]);
    var tab = q.t || 'active', text = q.q || '', sort = q.s || 'new', subj = q.sub || '';
    var base = S.snap.collections.filter(function (c) { return tab === 'trash' ? c.status === 'TRASHED' : c.status === 'ACTIVE'; });
    if (tab === 'fav') base = base.filter(function (c) { return c.favorite; });
    var n = U.norm(text);
    var list = base.filter(function (c) { return (!n || c.normalized_headword.indexOf(n) >= 0 || U.norm(c.confirmed_meaning).indexOf(n) >= 0 || U.norm(c.tags).indexOf(n) >= 0) && (!subj || c.subject === subj); });
    list.sort(function (a, b) { return sort === 'abc' ? (a.headword < b.headword ? -1 : 1) : sort === 'fav' ? (b.favorite - a.favorite || (a.created_at < b.created_at ? 1 : -1)) : (a.created_at < b.created_at ? 1 : -1); });
    var counts = { active: S.snap.collections.filter(function (c) { return c.status === 'ACTIVE'; }).length, trash: S.snap.collections.filter(function (c) { return c.status === 'TRASHED'; }).length };
    var shared = S.snap.shared;
    put(root, html`<div class="stack"><div class="row between"><h1>나의 어휘 수집함</h1><a class="btn primary" href="#/collect/new">＋ 새 단어 등록</a></div>
      <p class="muted">책·수업·기사·영상·일상에서 만난 새 낱말을 모아 두는 나만의 단어장이에요.</p>
      <div class="pill-tabs"><a href="#/collect?t=active" class="${tab === 'active' ? 'on' : ''}">전체 ${counts.active}</a><a href="#/collect?t=fav" class="${tab === 'fav' ? 'on' : ''}">★ 즐겨찾기</a><a href="#/collect?t=trash" class="${tab === 'trash' ? 'on' : ''}">휴지통 ${counts.trash}</a></div>
      <div class="row"><input id="cq" type="search" class="grow" style="min-width:160px;flex:2" placeholder="낱말·뜻·태그로 찾기" value="${text}" aria-label="찾기">
        <select id="cs" style="width:auto" aria-label="정렬"><option value="new" ${sort === 'new' ? 'selected' : ''}>최신순</option><option value="abc" ${sort === 'abc' ? 'selected' : ''}>가나다순</option><option value="fav" ${sort === 'fav' ? 'selected' : ''}>즐겨찾기 먼저</option></select>
        <select id="csub" style="width:auto" aria-label="교과"><option value="">모든 교과</option>${Data.SUBJECTS.concat(['기타']).map(function (s) { return html`<option value="${s}" ${subj === s ? 'selected' : ''}>${Data.subjectLabel(s)}</option>`; })}</select></div>
      ${list.length ? html`<div class="grid g2">${list.map(function (c) { return html`<a class="vitem" href="#/collect/${c.collection_id}" style="align-items:flex-start"><div class="grow"><div class="hw">${c.favorite ? '★ ' : ''}${c.headword}</div><div class="sub">${c.confirmed_meaning || c.guessed_meaning || '뜻을 아직 안 적었어요'}</div><div class="sub">${c.discovered_at} · ${c.medium}${c.subject ? ' · ' + Data.subjectLabel(c.subject) : ''}</div>
          <div style="margin-top:4px">${UI.raw(shareChip(c))} ${c.vocabulary_id ? html`<span class="chip blue">공용 사전에도 있어요</span>` : ''} ${c.duplicate_of ? html`<span class="chip">같은 단어의 다른 발견</span>` : ''} ${UI.raw(sceneDots(c.collection_id))}</div></div></a>`; })}</div>`
        : html`<div class="card center muted" style="padding:28px">${tab === 'trash' ? '휴지통이 비어 있어요.' : '아직 등록한 단어가 없어요. 오늘 새로 만난 낱말을 하나 넣어 볼까요?'}</div>`}
      ${shared.length ? html`<div class="card soft-green"><h3>우리 반이 함께 쓰는 단어 (선생님이 승인한 것)</h3><ul class="list">${shared.map(function (s) { return html`<li><b>${s.headword}</b> <span class="muted">${s.confirmed_meaning}</span>${s.example_sentence ? html`<div class="small muted">예) ${s.example_sentence}</div>` : ''}</li>`; })}</ul></div>` : ''}</div>`);
    var go = function () { var t = $('#cq', root).value, s = $('#cs', root).value, sub = $('#csub', root).value; location.hash = '#/collect?t=' + tab + '&q=' + encodeURIComponent(t) + '&s=' + s + '&sub=' + encodeURIComponent(sub); };
    $('#cq', root).onchange = go; $('#cs', root).onchange = go; $('#csub', root).onchange = go;
  };

  async function collNew(root) {
    put(root, html`<div class="stack" style="max-width:640px"><p class="small"><a href="#/collect">← 수집함</a></p><h1>새 단어 등록</h1>
      <form class="card" id="cf">${collForm()}<div class="gap"></div><button class="btn primary" type="submit">저장하기</button></form></div>`);
    $('#cf', root).onsubmit = async function (e) {
      e.preventDefault();
      var data = collRead(root);
      if (U.trim(data.self_explanation) && U.trim(data.self_explanation).length < 10 && !(await UI.confirm('설명이 짧아요', '내 말로 설명은 10자 이상 써야 «설명한 것» 으로 인정돼요. 그대로 저장할까요?', '그대로 저장'))) return;
      try {
        var r = await Api.save('collection.add', data);
        if (r.duplicate) {
          var dict = r.dictionary, mine = r.mine;
          var ch = await UI.modal({ title: '이미 있는 낱말이에요', wide: true, body: html`
            ${dict.length ? html`<h3>공용 사전에 있어요</h3><ul class="list">${dict.map(function (d) { return html`<li><b>${d.headword}</b> <span class="chip ${d.origin === 'NATIONAL' ? 'purple' : 'blue'}">${Data.originLabel(d.origin)}</span><div class="small muted">${d.definition}</div></li>`; })}</ul>` : ''}
            ${mine.length ? html`<h3>내 수집함에도 있어요</h3><ul class="list">${mine.map(function (m) { return html`<li><b>${m.headword}</b> <span class="small muted">${m.discovered_at}</span><div class="small">${m.source_context || m.confirmed_meaning || ''}</div></li>`; })}</ul>` : ''}
            <div class="notice info small">그래도 <b>이번에 새로 만난 문맥</b>과 내 메모는 따로 보관할 수 있어요. 기존 기록은 그대로 남아요.</div>`,
            buttons: [{ label: '취소', value: null }, { label: '새 문맥으로 따로 저장', kind: 'primary', value: 'save' }] });
          if (ch !== 'save') return;
          r = await Api.save('collection.add', Object.assign({ confirm_duplicate: true }, data));
        }
        SV.upsert(S.snap.collections, 'collection_id', r.item);
        UI.toast('수집함에 담았어요.', 'ok'); location.hash = '#/collect/' + r.item.collection_id;
      } catch (err) { UI.toast(UI.errMsg(err), 'err'); }
    };
  }

  async function collEdit(root, id) {
    var c = Calc.col(id);
    if (!c) { put(root, html`<div class="card"><p>단어를 찾을 수 없어요.</p><a href="#/collect">수집함으로</a></div>`); return; }
    var trashed = c.status === 'TRASHED';
    var sv = Calc.sv(id);
    put(root, html`<div class="stack" style="max-width:680px"><p class="small"><a href="#/collect">← 수집함</a></p>
      <div class="row between"><h1>${c.headword}</h1><div>${UI.raw(shareChip(c))} ${trashed ? html`<span class="chip danger">휴지통</span>` : ''}</div></div>
      ${c.vocabulary_id && Data.get(c.vocabulary_id) ? html`<div class="notice info small">공용 사전에도 있는 낱말이에요: <a href="${wordLink(c.vocabulary_id)}">${Data.originLabel(Data.get(c.vocabulary_id).origin)} 어휘로 보기</a> · 내가 새로 발견한 문맥과 메모는 여기에 따로 남아요.</div>` : ''}
      ${c.share_status === 'REJECTED' && c.share_note ? html`<div class="notice err small">공유되지 않은 이유: ${c.share_note}</div>` : ''}
      <form class="card" id="cf">${collForm(c)}<div class="gap"></div><div class="row"><button class="btn primary" type="submit" ${trashed ? 'disabled' : ''}>저장하기</button><span id="cs" class="savestate"></span></div></form>
      <div class="card"><div class="row">
        ${trashed ? html`<button class="btn" id="restore">휴지통에서 되살리기</button>` : html`
          <button class="btn" id="fav">${c.favorite ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button>
          <a class="btn purple" href="#/lab/${id}">세 장면 쓰기</a>
          <button class="btn" id="review">${sv && sv.steps && sv.steps.define ? '✔ 복습 목록에 있어요' : '복습 목록에 넣기'}</button>
          <button class="btn" id="share" ${c.share_status === 'PENDING' || c.share_status === 'APPROVED' ? 'disabled' : ''}>학급에 공유 요청</button>
          <button class="btn danger" id="trash">지우기</button>`}</div>
        <p class="small muted" style="margin-top:8px">지운 단어는 휴지통에 남아 있어서 언제든 되살릴 수 있어요. 학급 공유는 선생님이 검토하고 승인해야 해요.</p></div></div>`);
    var ss = UI.saveState($('#cs', root));
    $('#cf', root).onsubmit = async function (e) {
      e.preventDefault();
      var cur = Calc.col(id); ss.busy();
      try {
        var row = await Api.save('collection.save', Object.assign({ collection_id: id, base_rev: cur.rev }, collRead(root)));
        SV.upsert(S.snap.collections, 'collection_id', row); ss.ok(); UI.toast('저장했어요.', 'ok');
      } catch (err) {
        if (err.code === 'CONFLICT') { SV.upsert(S.snap.collections, 'collection_id', err.data); ss.err('다른 기기에서 먼저 고쳤어요. 최신 내용을 불러왔으니 다시 확인해 주세요.'); collEdit(root, id); }
        else ss.err(UI.errMsg(err));
      }
    };
    var act = async function (fn, msg) { try { var row = await fn(); if (row) SV.upsert(S.snap.collections, 'collection_id', row); if (msg) UI.toast(msg, 'ok'); collEdit(root, id); } catch (err) { UI.toast(UI.errMsg(err), 'err'); } };
    var b;
    if ((b = $('#fav', root))) b.onclick = function () { act(function () { return Api.save('collection.save', { collection_id: id, base_rev: Calc.col(id).rev, favorite: !Calc.col(id).favorite }); }); };
    if ((b = $('#trash', root))) b.onclick = async function () { if (await UI.confirm('이 단어를 지울까요?', '휴지통으로 옮겨요. 언제든 되살릴 수 있어요.', '지우기', true)) act(function () { return Api.save('collection.trash', { collection_id: id }); }, '휴지통으로 옮겼어요.'); };
    if ((b = $('#restore', root))) b.onclick = function () { act(function () { return Api.save('collection.trash', { collection_id: id, restore: true }); }, '되살렸어요.'); };
    if ((b = $('#share', root))) b.onclick = function () { act(function () { return Api.save('collection.request_share', { collection_id: id }); }, '선생님께 공유를 요청했어요.'); };
    if ((b = $('#review', root))) b.onclick = async function () { try { var row = await Api.save('sv.save', { vocabulary_id: id, mark: ['define'], base_rev: sv ? sv.rev : undefined }); SV.upsert(S.snap.sv, 'sv_id', row); UI.toast('복습 목록에 넣었어요.', 'ok'); collEdit(root, id); } catch (err) { UI.toast(UI.errMsg(err), 'err'); } };
  }

  /* ============================ 오늘의 문장 · 복습 · 성장 기록 ============================ */
  V.practice = async function (root, parts, q) {
    var tab = q.t || 'today';
    put(root, html`<div class="stack"><h1>복습 · 기록</h1>
      <div class="pill-tabs"><a href="#/practice?t=today" class="${tab === 'today' ? 'on' : ''}">오늘의 문장</a><a href="#/practice?t=quiz" class="${tab === 'quiz' ? 'on' : ''}">복습하기</a><a href="#/practice?t=growth" class="${tab === 'growth' ? 'on' : ''}">성장 기록</a></div><div id="ptab"></div></div>`);
    var box = $('#ptab', root);
    if (tab === 'quiz') return quizTab(box);
    if (tab === 'growth') return growthTab(box);
    return todayTab(box);
  };

  /* ---- 오늘의 문장 ---- */
  function todayTab(box) {
    function studied() { return Data.school.concat(Data.national).filter(function (v) { return Calc.touched(v.vocabulary_id); }).concat(S.snap.collections.filter(function (c) { return c.status === 'ACTIVE'; }).map(function (c) { return Calc.info(c.collection_id); })); }
    function draw() {
      var list = S.snap.daily.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at < b.created_at ? 1 : -1); });
      var words = studied();
      put(box, html`<div class="stack"><div class="card"><h3>오늘 쓰고 싶은 문장</h3><p class="small muted">배운 낱말이 아니어도 괜찮아요. 오늘 있었던 일, 생각, 느낌을 한두 문장으로 남겨 보세요.</p>
        <div class="grid g2"><div><label class="f" for="d-date">날짜</label><input id="d-date" type="date" value="${UI.today()}"></div><div><label class="f" for="d-word">쓴 낱말 (선택)</label><select id="d-word"><option value="">(없음)</option>${words.map(function (v) { return html`<option value="${v.vocabulary_id}">${v.headword}</option>`; })}</select></div></div>
        <label class="f" for="d-text">문장</label><textarea id="d-text" maxlength="2000" placeholder="오늘의 한 줄"></textarea>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="d-save">저장하기</button></div></div>
        <div class="card"><h3>지난 문장</h3>${list.length ? html`<ul class="list">${list.map(function (d) { var v = d.vocabulary_id ? Calc.info(d.vocabulary_id) : null; var fbs = Calc.feedbackFor(d.daily_id);
          return html`<li><div class="row between"><span class="small muted">${d.date}${v ? ' · ' + v.headword : ''}</span><span><button class="btn small ghost" data-edit="${d.daily_id}">고치기</button><button class="btn small ghost danger" data-del="${d.daily_id}">지우기</button></span></div><div style="white-space:pre-wrap">${d.text}</div>${fbs.map(function (f) { return html`<div class="fb" style="margin-top:6px"><b class="small">선생님</b> ${f.comment}</div>`; })}</li>`; })}</ul>` : html`<p class="muted">아직 남긴 문장이 없어요.</p>`}</div></div>`);
      $('#d-save', box).onclick = async function () {
        var text = $('#d-text', box).value; if (U.trim(text).length < 2) return UI.toast('문장을 적어 주세요.', 'err');
        try { var row = await Api.save('daily.save', { date: $('#d-date', box).value, text: text, vocabulary_id: $('#d-word', box).value }); SV.upsert(S.snap.daily, 'daily_id', row); UI.toast('저장했어요.', 'ok'); draw(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); }
      };
      $$('[data-edit]', box).forEach(function (b) { b.onclick = async function () {
        var d = S.snap.daily.filter(function (x) { return x.daily_id === b.dataset.edit; })[0];
        var out = await UI.modal({ title: '문장 고치기', body: html`<label class="f" for="e-date">날짜</label><input id="e-date" type="date" value="${d.date}"><label class="f" for="e-text">문장</label><textarea id="e-text" maxlength="2000">${d.text}</textarea>`,
          buttons: [{ label: '취소', value: null }, { label: '저장', kind: 'primary', submit: true, value: 'ok' }], onSubmit: function (m) { return { date: $('#e-date', m).value, text: $('#e-text', m).value }; } });
        if (!out) return;
        try { var row = await Api.save('daily.save', { daily_id: d.daily_id, date: out.date, text: out.text, vocabulary_id: d.vocabulary_id, base_rev: d.rev }); SV.upsert(S.snap.daily, 'daily_id', row); UI.toast('고쳤어요.', 'ok'); draw(); }
        catch (e) { if (e.code === 'CONFLICT') { SV.upsert(S.snap.daily, 'daily_id', e.data); UI.toast('다른 기기에서 먼저 고쳤어요. 최신 내용을 불러왔어요.', 'err'); draw(); } else UI.toast(UI.errMsg(e), 'err'); }
      }; });
      $$('[data-del]', box).forEach(function (b) { b.onclick = async function () { if (!(await UI.confirm('이 문장을 지울까요?', '지우면 되돌릴 수 없어요.', '지우기', true))) return; try { await Api.save('daily.delete', { daily_id: b.dataset.del }); S.snap.daily = S.snap.daily.filter(function (x) { return x.daily_id !== b.dataset.del; }); draw(); } catch (e) { UI.toast(UI.errMsg(e), 'err'); } }; });
    }
    draw();
  }

  /* ---- 복습하기 ---- */
  var MODES = [['recall', '뜻 보고 낱말 떠올리기'], ['context', '문맥에 맞는 낱말 고르기'], ['synonym', '비슷한 말·반대말 구별'], ['fix', '오류 고치기'], ['improve', '내 문장 더 좋게'], ['transfer', '새로운 상황에 쓰기']];

  function poolIds() {
    var ids = [];
    S.snap.sv.forEach(function (x) { if ((x.steps && x.steps.define) || x.box) ids.push(x.vocabulary_id); });
    S.snap.writings.forEach(function (w) { if (w.version > 0 && ids.indexOf(w.vocabulary_id) < 0) ids.push(w.vocabulary_id); });
    return ids.filter(function (id) { return Calc.info(id); });
  }
  function defOf(id) { var v = Calc.info(id); return v ? (v.definition || '') : ''; }
  function distractors(id, n, byWord) {
    var v = Calc.info(id), src = v.origin === 'SCHOOL' ? Data.school : Data.national;
    var all = shuffle(src.map(function (x) { return x.headword; })).filter(function (h) { return h !== v.headword; });
    return all.slice(0, n);
  }
  function blankOut(sentence, word) {
    var s = sentence.replace(/\{\{(.+?)\}\}/g, '____');
    if (s.indexOf('____') >= 0) return s;
    var stem = word.replace(/(하다|되다|적|화|성)$/, '');
    if (stem.length >= 2 && sentence.indexOf(stem) >= 0) return sentence.replace(stem, '____');
    return null;
  }

  async function buildQuestions(mode) {
    var ids = shuffle(poolIds()), out = [];
    var cards = (mode === 'context' || mode === 'synonym') ? await Data.loadCards() : null;
    for (var i = 0; i < ids.length && out.length < 5; i++) {
      var id = ids[i], v = Calc.info(id);
      if (mode === 'recall') { if (defOf(id)) out.push({ mode: mode, vid: id, type: 'text', prompt: '이 뜻에 맞는 낱말을 써 보세요.', clue: defOf(id), answer: v.headword }); }
      else if (mode === 'context') {
        var sent = null, own = Calc.ws(id).filter(function (w) { return w.version > 0; }).map(function (w) { return w.text; });
        var cardId = v.origin === 'NATIONAL' ? id : (Data.siblings(id).filter(function (s) { return s.origin === 'NATIONAL'; })[0] || {}).vocabulary_id;
        if (cardId && cards[cardId]) sent = blankOut(cards[cardId].understand.example, v.headword);
        if (!sent) { for (var k = 0; k < own.length && !sent; k++) sent = blankOut(own[k], v.headword); }
        if (sent) out.push({ mode: mode, vid: id, type: 'choice', prompt: '빈칸에 들어갈 알맞은 낱말은?', clue: sent, answer: v.headword, options: shuffle([v.headword].concat(distractors(id, 3))) });
      } else if (mode === 'synonym') {
        var cid = v.origin === 'NATIONAL' ? id : (Data.siblings(id).filter(function (s) { return s.origin === 'NATIONAL'; })[0] || {}).vocabulary_id;
        var card = cid && cards[cid]; if (!card) continue;
        var syn = card.expand.items.filter(function (it) { return /^유의어/.test(it.type) && it.word; })[0], ant = card.expand.items.filter(function (it) { return /^반의어/.test(it.type) && it.word; })[0];
        var it = rnd([syn, ant].filter(Boolean)); if (!it) continue;
        var isAnt = /^반의어/.test(it.type);
        var pool = []; Object.keys(cards).forEach(function (k2) { cards[k2].expand.items.forEach(function (x) { if (x.word && x.word !== it.word && /^(유의어|반의어)/.test(x.type)) pool.push(x.word); }); });
        out.push({ mode: mode, vid: id, type: 'choice', prompt: '«' + v.headword + '» 와(과) ' + (isAnt ? '뜻이 반대인' : '뜻이 가까운') + ' 말은?', clue: '', answer: it.word, options: shuffle([it.word].concat(shuffle(pool).slice(0, 3))) });
      } else if (mode === 'fix') {
        var acts = Data.activities.filter(function (a) { return a.type === 'fix' && a.vocabulary_id === id; });
        if (acts.length) out.push({ mode: mode, vid: id, type: 'text', prompt: '잘못된 곳을 찾아 고쳐 써 보세요.', clue: acts[0].prompt, answer: '' , activity: acts[0] });
      } else if (mode === 'improve') {
        var ws = Calc.ws(id).filter(function (w) { return w.version > 0; });
        if (ws.length) { var wr = rnd(ws); out.push({ mode: mode, vid: id, type: 'improve', prompt: '이전에 쓴 문장을 더 정확하고 분명하게 고쳐 보세요.', clue: wr.text, writing: wr }); }
      } else if (mode === 'transfer') {
        var others = shuffle(Data.school.filter(function (x) { return x.vocabulary_id !== id; })), tp = others.length ? Data.promptFor(others[0].vocabulary_id, rnd(['DAILY', 'WORLD']), others[0].headword) : null;
        out.push({ mode: mode, vid: id, type: 'transfer', prompt: '처음 보는 장면에서 «' + v.headword + '» 을(를) 써 보세요.', clue: tp ? tp.scenario.replace(new RegExp('«[^»]*»', 'g'), '') : '친구에게 오늘 있었던 낯선 일을 이야기하는 장면', answer: '' });
      }
    }
    return out;
  }

  async function quizTab(box) {
    var ids = poolIds(), due = Calc.dueReview();
    if (!ids.length) { put(box, html`<div class="card center" style="padding:28px"><p>복습은 <b>뜻을 확인한 어휘</b>가 생기면 열려요.</p><a class="btn primary" href="#/vocab">어휘 학습하러 가기</a></div>`); return; }
    var hasFix = Data.activities.some(function (a) { return a.type === 'fix'; });
    put(box, html`<div class="stack"><div class="card"><p style="margin:0">복습할 수 있는 어휘 <b>${ids.length}개</b> · 오늘 다시 볼 어휘 <b>${due.length}개</b></p><p class="small muted">맞히면 간격이 늘어나고(1·2·4·8·16일), 틀리면 내일 다시 나와요.</p></div>
      <div class="grid g3">${MODES.map(function (m) { var off = m[0] === 'fix' && !hasFix; return html`<button class="card" data-mode="${m[0]}" style="text-align:left;cursor:pointer" ${off ? 'disabled' : ''}><b>${m[1]}</b><div class="small muted">${off ? '선생님이 문항을 올리면 열려요' : ({ recall: '뜻을 보고 낱말을 직접 써요', context: '빈칸에 알맞은 낱말을 골라요', synonym: '유의어·반의어를 구별해요', improve: '예전 문장을 고쳐 써요', transfer: '낯선 장면에서 써 봐요' }[m[0]] || '')}</div></button>`; })}</div></div>`);
    $$('[data-mode]', box).forEach(function (b) { b.onclick = async function () {
      var qs = await buildQuestions(b.dataset.mode);
      if (!qs.length) return UI.toast('이 방식으로 낼 수 있는 문제가 아직 없어요. 다른 방식을 골라 보세요.', 'err');
      runQuiz(box, qs, b.dataset.mode);
    }; });
  }

  function runQuiz(box, qs, mode) {
    var i = 0, correct = 0, log = [];
    function record(qn, ok, detail) {
      return Api.save('review.record', { vocabulary_id: qn.vid, mode: qn.mode, result: ok ? 'CORRECT' : 'WRONG', detail: (detail || '').slice(0, 480) })
        .then(function (r) { S.snap.reviews.push({ review_id: 'local-' + Date.now() + Math.random(), user_id: S.user.user_id, vocabulary_id: qn.vid, mode: qn.mode, result: ok ? 'CORRECT' : 'WRONG', created_at: new Date().toISOString() }); var sv = Calc.sv(qn.vid); if (sv) { sv.box = r.box; sv.next_review_at = r.next_review_at; if (qn.mode === 'transfer' && ok) sv.steps = Object.assign({}, sv.steps, { transfer: true }); } else Api.call('sync').then(function (s) { S.snap.sv = s.sv; }).catch(function () {}); })
        .catch(function (e) { UI.toast(UI.errMsg(e), 'err'); });
    }
    function next() { i++; draw(); }
    function result() {
      put(box, html`<div class="card center stack"><h2>${correct} / ${qs.length} 맞혔어요</h2><p class="muted">${correct === qs.length ? '모두 맞혔어요! 🎉' : '틀린 낱말은 내일 다시 나와요.'}</p>
        <ul class="list" style="text-align:left">${log.map(function (l) { return html`<li>${l.ok ? '✔' : '✘'} <b>${Calc.info(l.vid).headword}</b> <span class="small muted">${l.note || ''}</span></li>`; })}</ul>
        <div class="row" style="justify-content:center"><a class="btn primary" href="#/practice?t=quiz" onclick="App.route()">다른 방식으로 복습</a><a class="btn" href="#/home">홈으로</a></div></div>`);
    }
    function draw() {
      if (i >= qs.length) return result();
      var qn = qs[i], v = Calc.info(qn.vid);
      var head = html`<div class="row between"><span class="chip purple">${MODES.filter(function (m) { return m[0] === mode; })[0][1]}</span><span class="small muted">${i + 1} / ${qs.length}</span></div>${UI.bar(UI.pct(i, qs.length))}<h3 style="margin-top:12px">${qn.prompt}</h3>${qn.clue ? html`<div class="quote">${qn.clue}</div>` : ''}`;
      if (qn.type === 'choice') {
        put(box, html`<div class="card stack">${head}<div class="grid g2">${qn.options.map(function (o) { return html`<button class="btn" data-opt="${o}" style="min-height:52px">${o}</button>`; })}</div><div id="fbk"></div></div>`);
        $$('[data-opt]', box).forEach(function (b) { b.onclick = async function () {
          $$('[data-opt]', box).forEach(function (x) { x.disabled = true; });
          var ok = b.dataset.opt === qn.answer; if (ok) correct++; b.classList.add(ok ? 'green' : 'danger');
          log.push({ vid: qn.vid, ok: ok, note: ok ? '' : '정답: ' + qn.answer }); record(qn, ok, b.dataset.opt);
          put($('#fbk', box), html`<div class="notice ${ok ? 'ok' : 'err'}">${ok ? '맞았어요!' : '정답은 «' + qn.answer + '» 예요.'}</div><button class="btn primary" id="nx">${i + 1 < qs.length ? '다음' : '결과 보기'}</button>`);
          $('#nx', box).onclick = next;
        }; });
      } else if (qn.type === 'text') {
        put(box, html`<div class="card stack">${head}<input id="ans" type="text" placeholder="여기에 써 보세요" autocomplete="off"><div class="row"><button class="btn primary" id="chk">확인</button><button class="btn ghost" id="idk">모르겠어요</button></div><div id="fbk"></div></div>`);
        var done = false;
        var finish = function (given) {
          if (done) return; done = true;
          var key = qn.activity ? qn.activity.answer_key : qn.answer;
          var ok = !!given && (qn.activity ? (!key || U.norm(given).indexOf(U.norm(key)) >= 0) : U.norm(given) === U.norm(key) || (U.norm(key).length >= 2 && U.norm(given) === U.norm(key).replace(/(하다|되다)$/, '')));
          if (ok) correct++; log.push({ vid: qn.vid, ok: ok, note: ok ? '' : '정답: ' + (key || '선생님 확인') }); record(qn, ok, given);
          put($('#fbk', box), html`<div class="notice ${ok ? 'ok' : 'err'}">${ok ? '맞았어요!' : (key ? '정답은 «' + key + '» 예요.' : '선생님이 확인할 거예요.')}</div><button class="btn primary" id="nx">${i + 1 < qs.length ? '다음' : '결과 보기'}</button>`);
          $('#nx', box).onclick = next;
        };
        $('#chk', box).onclick = function () { finish($('#ans', box).value); }; $('#idk', box).onclick = function () { finish(''); };
        $('#ans', box).onkeydown = function (e) { if (e.key === 'Enter') finish($('#ans', box).value); }; $('#ans', box).focus();
      } else if (qn.type === 'improve') {
        put(box, html`<div class="card stack">${head}<textarea class="big" id="imp">${qn.writing.text}</textarea><div class="row"><button class="btn primary" id="sub">고쳐서 제출</button><button class="btn ghost" id="skip">건너뛰기</button></div><div id="fbk"></div></div>`);
        $('#sub', box).onclick = async function () {
          var t = $('#imp', box).value; if (t === qn.writing.text) return UI.toast('아직 고친 곳이 없어요.', 'err');
          try { var w = Calc.w(qn.vid, qn.writing.scene_type); var row = await Api.save('writing.save', { vocabulary_id: qn.vid, scene_type: qn.writing.scene_type, text: t, mode: 'SUBMIT', base_rev: w.rev }); SV.upsert(S.snap.writings, 'writing_id', row); correct++; log.push({ vid: qn.vid, ok: true, note: '새 버전 v' + row.version }); record(qn, true, 'v' + row.version); next(); }
          catch (e) { UI.toast(UI.errMsg(e), 'err'); }
        };
        $('#skip', box).onclick = function () { log.push({ vid: qn.vid, ok: false, note: '건너뜀' }); next(); };
      } else { // transfer
        put(box, html`<div class="card stack">${head}<textarea class="big" id="tr" placeholder="이 장면에서 한 문장 이상 써 보세요"></textarea><p class="small muted">쓴 다음, 스스로 어땠는지 골라 주세요.</p><div class="row"><button class="btn green" id="good">잘 썼어요</button><button class="btn" id="hard">아직 어려워요</button></div></div>`);
        var rec = function (ok) { var t = $('#tr', box).value; if (U.trim(t).length < 5) return UI.toast('먼저 문장을 써 주세요.', 'err'); if (ok) correct++; log.push({ vid: qn.vid, ok: ok, note: ok ? '' : '다시 연습해요' }); record(qn, ok, t); next(); };
        $('#good', box).onclick = function () { rec(true); }; $('#hard', box).onclick = function () { rec(false); };
      }
    }
    draw();
  }

  /* ---- 성장 기록 ---- */
  function growthTab(box) {
    var sn = S.snap;
    var per = Data.SUBJECTS.map(function (s) { var l = Data.school.filter(function (v) { return v.subject === s; }); return { s: s, n: l.length, d: l.filter(function (v) { return Calc.status(v.vocabulary_id).done; }).length }; });
    var rows = Data.school.concat(Data.national).filter(function (v) { return Calc.touched(v.vocabulary_id); }).map(function (v) { return { v: v, st: Calc.status(v.vocabulary_id) }; })
      .concat(sn.collections.filter(function (c) { return c.status === 'ACTIVE' && Calc.touched(c.collection_id); }).map(function (c) { return { v: Calc.info(c.collection_id), st: Calc.status(c.collection_id) }; }));
    var active = rows.filter(function (r) { return r.st.level.active; }).length;
    var reviewN = sn.reviews.length, reviewOk = sn.reviews.filter(function (r) { return r.result === 'CORRECT'; }).length;
    var multi = sn.writings.filter(function (w) { return w.version > 1; }).length;
    var featured = sn.writings.filter(function (w) { return w.featured && w.version > 0; });
    var mode = 'week';
    function trend(m) {
      var buckets = {}, now = new Date(), labels = [];
      function key(d) { if (m === 'month') return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); var t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return (t.getMonth() + 1) + '/' + t.getDate(); }
      for (var i = (m === 'month' ? 5 : 7); i >= 0; i--) { var d = new Date(now); if (m === 'month') d.setMonth(d.getMonth() - i, 1); else d.setDate(d.getDate() - i * 7); var k = key(d); labels.push(k); buckets[k] = 0; }
      sn.writings.forEach(function (w) { if (w.version > 0 && w.submitted_at) { var k = key(new Date(w.submitted_at)); if (k in buckets) buckets[k]++; } });
      sn.daily.forEach(function (x) { var k = key(new Date(x.created_at)); if (k in buckets) buckets[k]++; });
      var max = Math.max.apply(null, labels.map(function (k) { return buckets[k]; }).concat([1]));
      return html`<div class="trend">${labels.map(function (k) { return html`<div><div style="font-weight:700;color:var(--ink)">${buckets[k]}</div><i style="height:${Math.round(buckets[k] / max * 80) + 3}px"></i>${k}</div>`; })}</div>`;
    }
    put(box, html`<div class="stack">
      <div class="grid g4"><div class="card stat"><div class="l">능동 어휘</div><div class="n">${active}<small> 개</small></div><div class="small muted">이해·설명·문장·새 맥락을 모두 한 어휘</div></div>
        <div class="card stat"><div class="l">제출한 문장</div><div class="n">${sn.writings.filter(function (w) { return w.version > 0; }).length}<small> 개</small></div><div class="small muted">고쳐 다시 낸 문장 ${multi}개</div></div>
        <div class="card stat"><div class="l">복습</div><div class="n">${reviewN}<small> 번</small></div><div class="small muted">맞힌 비율 ${UI.pct(reviewOk, reviewN)}%</div></div>
        <div class="card stat"><div class="l">수집 어휘</div><div class="n">${sn.collections.filter(function (c) { return c.status === 'ACTIVE'; }).length}<small> 개</small></div></div></div>
      <div class="card"><div class="row between"><h3>쓰기 기록 추이</h3><div class="pill-tabs" style="margin:0"><button class="on" data-tr="week">주간</button><button data-tr="month">월간</button></div></div><div id="trend">${trend('week')}</div><p class="small muted">제출한 문장과 오늘의 문장을 합쳐 센 값이에요.</p></div>
      <div class="card"><h3>교과별 학교 필수 어휘</h3>${per.map(function (p) { return html`<div style="margin:8px 0"><div class="row between small"><b>${Data.subjectLabel(p.s)}</b><span class="muted">${p.d} / ${p.n}</span></div>${UI.bar(UI.pct(p.d, p.n))}</div>`; })}
        <div style="margin:8px 0"><div class="row between small"><b>국가 사고도구어</b><span class="muted">${Data.national.filter(function (v) { return Calc.status(v.vocabulary_id).done; }).length} / ${Data.national.length}</span></div>${UI.bar(UI.pct(Data.national.filter(function (v) { return Calc.status(v.vocabulary_id).done; }).length, Data.national.length))}</div></div>
      <div class="card"><h3>대표 문장 포트폴리오</h3>${featured.length ? html`<ul class="list">${featured.map(function (w) { var v = Calc.info(w.vocabulary_id); return html`<li><div class="small muted">${v ? v.headword : ''} · ${SL[w.scene_type]} · v${w.version}</div><div>${w.text}</div></li>`; })}</ul><button class="btn small" onclick="window.print()">인쇄하기</button>` : html`<p class="muted">쓰기 LAB 에서 제출한 문장 아래의 «대표 문장으로 고르기» 를 누르면 여기에 모여요.</p>`}</div>
      <div class="card"><h3>어휘별 습득 단계</h3><p class="small muted">«능동» 은 <b>이해 → 내 말로 설명 → 문장 쓰기 → 새 맥락에 쓰기</b>를 모두 했을 때만 붙어요. 문장을 많이 썼다고 붙지 않아요.</p>
        ${rows.length ? html`<div class="tablewrap"><table class="tbl"><thead><tr><th>어휘</th><th>이해</th><th>설명</th><th>문장</th><th>새 맥락</th><th>능동</th></tr></thead><tbody>${rows.map(function (r) { var l = r.st.level; var m = function (b) { return b ? '✔' : '·'; }; return html`<tr><td><a href="${wordLink(r.v.vocabulary_id)}"><b>${r.v.headword}</b></a></td><td>${m(l.understand)}</td><td>${m(l.explain)}</td><td>${m(l.write)}</td><td>${m(l.transfer)}</td><td>${l.active ? '★' : ''}</td></tr>`; })}</tbody></table></div>` : html`<p class="muted">학습을 시작하면 여기에 쌓여요.</p>`}</div></div>`);
    $$('[data-tr]', box).forEach(function (b) { b.onclick = function () { $$('[data-tr]', box).forEach(function (x) { x.classList.toggle('on', x === b); }); put($('#trend', box), trend(b.dataset.tr)); }; });
  }
})();
