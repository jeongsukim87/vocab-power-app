/* 어휘 데이터(정적 JSON) 읽기·색인. 교사가 고친 내용(delta)은 서버에서 받아 덧씌운다. */
var Data = (function () {
  'use strict';
  var D = { loaded: false, vocab: [], byId: {}, byHead: {}, sources: {}, relFrom: {}, prompts: {}, cards: null, activities: [], meta: {} };

  D.SUBJECTS = ['국어', '수학', '과학', '역사', '도덕', '기가'];
  D.SUBJECT_LABEL = { '국어': '국어', '수학': '수학', '과학': '과학', '역사': '역사', '도덕': '도덕', '기가': '기술·가정' };
  D.REL_LABEL = { SAME_HEADWORD: '같은 표제어', VARIANT_FORM: '비슷한 표기·활용형', SYNONYM: '유의어', ANTONYM: '반의어', RELATED: '관련어', HOMONYM: '동형이의어', HYPERNYM: '상위어', HYPONYM: '하위어' };
  D.STATUS_LABEL = { DRAFT_REVIEW: '뜻풀이 초안 · 검토 필요', TEACHER_REVIEWED: '교사 검토 완료', NATIONAL_CARD: '국가 카드 원문', CUSTOM: '교사가 추가' };

  function add(v) {
    if (D.byId[v.vocabulary_id]) { Object.assign(D.byId[v.vocabulary_id], v); return; }
    D.vocab.push(v); D.byId[v.vocabulary_id] = v;
    (D.byHead[v.normalized_headword] = D.byHead[v.normalized_headword] || []).push(v.vocabulary_id);
  }

  D.load = async function () {
    if (D.loaded) return;
    var j = window.__VOCAB; // index.html 을 더블클릭해 열 때(file://)는 fetch 가 막히므로 <script> 로 실어 둔 데이터를 쓴다
    if (!j) {
      var r = await fetch('data/vocab.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('어휘 데이터를 불러오지 못했습니다.');
      j = await r.json();
    }
    D.meta = j.meta; D.raw = j;
    j.vocabulary.forEach(add);
    j.sources.forEach(function (s) { (D.sources[s.vocabulary_id] = D.sources[s.vocabulary_id] || []).push(s); });
    j.relations.forEach(function (x) { (D.relFrom[x.from_vocabulary_id] = D.relFrom[x.from_vocabulary_id] || []).push(x); (D.relFrom[x.to_vocabulary_id] = D.relFrom[x.to_vocabulary_id] || []).push(x); });
    j.prompts.forEach(function (p) { (D.prompts[p.vocabulary_id] = D.prompts[p.vocabulary_id] || {})[p.scene_type] = p; });
    D.school = D.vocab.filter(function (v) { return v.origin === 'SCHOOL'; });
    D.national = D.vocab.filter(function (v) { return v.origin === 'NATIONAL'; });
    D.loaded = true;
  };

  D.loadCards = async function () {
    if (D.cards) return D.cards;
    if (window.__CARDS) { D.cards = window.__CARDS; return D.cards; }
    var r = await fetch('data/cards.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('카드 데이터를 불러오지 못했습니다.');
    D.cards = await r.json();
    return D.cards;
  };

  /** 서버가 알려 준 교사 수정분(뜻풀이 수정, 새 어휘, 장면 수정)을 덧씌운다. */
  D.applyDelta = function (delta) {
    if (!delta) return;
    (delta.vocabulary || []).forEach(function (v) {
      var had = !!D.byId[v.vocabulary_id];
      add(Object.assign({}, v));
      if (!had) { D.custom = true; if (v.origin === 'CUSTOM') D.sources[v.vocabulary_id] = [{ source_type: 'PERSONAL', subject: v.subject, publisher: '', page: '교사가 추가', permission_status: 'SCHOOL_OWN' }]; }
    });
    (delta.prompts || []).forEach(function (p) { (D.prompts[p.vocabulary_id] = D.prompts[p.vocabulary_id] || {})[p.scene_type] = p; });
    D.activities = delta.activities || [];
  };

  D.get = function (id) { return D.byId[id] || null; };
  D.sourcesOf = function (id) { return D.sources[id] || []; };
  D.siblings = function (id) { // 표제어가 같은 다른 어휘(학교↔국가)
    var v = D.byId[id]; if (!v) return [];
    return (D.byHead[v.normalized_headword] || []).filter(function (x) { return x !== id; }).map(D.get);
  };
  D.relations = function (id) {
    return (D.relFrom[id] || []).map(function (r) {
      var other = r.from_vocabulary_id === id ? r.to_vocabulary_id : r.from_vocabulary_id;
      return { type: r.relation_type, status: r.status, other: D.get(other) };
    }).filter(function (x) { return x.other; });
  };
  D.originLabel = function (o) { return o === 'SCHOOL' ? '학교' : o === 'NATIONAL' ? '국가' : o === 'CUSTOM' ? '교사 추가' : '나의 단어'; };
  D.subjectLabel = function (s) { return D.SUBJECT_LABEL[s] || s || ''; };

  /* ---- 작문 장면: 저장된 상황이 없으면(국가·개인·교사 추가 어휘) 기본 안내를 돌려가며 쓴다 ---- */
  var FALLBACK = {
    SUBJECT: [
      ['수업 시간에 «{w}»이(가) 나오는 설명이나 문제를 만났다고 상상해 보세요. 어느 교과의 어떤 장면인가요?', '이 낱말이 그 장면에서 하는 일은 무엇일까?'],
      ['친구에게 «{w}»의 뜻을 교과 내용과 함께 설명해 주려 합니다.', '교과서의 어떤 내용이 이 낱말과 이어질까?'],
      ['모둠 발표 자료에 «{w}»을(를) 넣어 한 문장을 쓰려 합니다.', '발표를 듣는 친구가 쉽게 이해하려면 어떻게 써야 할까?'],
      ['시험 서술형 문제에서 «{w}»을(를) 사용해 답을 쓴다고 생각해 보세요.', '어떤 근거와 함께 쓰면 좋은 답이 될까?']],
    DAILY: [
      ['학교·친구·가족과 있었던 오늘의 일 중에 «{w}»을(를) 쓸 수 있는 장면이 있나요?', '그 일을 떠올리며 어떤 말을 하고 싶은가요?'],
      ['친구와 나누는 대화 속에 «{w}»을(를) 자연스럽게 넣어 보세요.', '친구가 이 말을 알아듣도록 하려면 어떻게 말해야 할까?'],
      ['집에서 부모님이나 형제와 이야기하다가 «{w}»이(가) 떠오른 순간을 써 보세요.', '그 순간의 상황과 마음은 어땠나요?'],
      ['SNS 대화방이나 일기에 «{w}»을(를) 넣어 한 줄을 남긴다면?', '짧지만 뜻이 분명하게 전해지게 쓰려면?']],
    WORLD: [
      ['뉴스 기사나 사회 현상에서 «{w}»이(가) 쓰일 만한 장면을 찾아보세요.', '이 낱말을 쓰면 현상을 어떻게 더 정확히 설명할 수 있을까?'],
      ['환경·기술·문화 문제를 다룬 글 속에 «{w}»을(를) 넣어 문장을 쓰려 합니다.', '내 생각이나 의견은 무엇인가요?'],
      ['먼 나라 이야기나 미래 사회를 상상하며 «{w}»을(를) 써 보세요.', '낯선 상황에서도 이 낱말의 뜻이 그대로 통할까?'],
      ['토론 주제에 대해 «{w}»을(를) 근거로 들어 주장하는 문장을 쓰려 합니다.', '상대가 반대한다면 어떻게 다시 설득할까?']]
  };
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  /** 장면 하나의 상황·질문·기본 안내 여부 */
  D.promptFor = function (vid, scene, headword) {
    var p = D.prompts[vid] && D.prompts[vid][scene];
    if (p) return { scenario: p.scenario, question: p.guiding_question, status: p.content_status, fallback: false };
    var pool = FALLBACK[scene], pick = pool[hash(vid + scene) % pool.length], w = headword || (D.get(vid) || {}).headword || '이 낱말';
    return { scenario: pick[0].replace('{w}', w), question: pick[1], status: 'DEFAULT', fallback: true };
  };

  return D;
})();
