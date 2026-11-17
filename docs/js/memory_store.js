/**
 * 메모리 저장소 (체험 모드·자동 테스트용). 구글 시트 저장소(Store.gs)와 같은 인터페이스를 가진다.
 * 행을 저장할 때마다 toRow → fromRow 를 거쳐, 시트에 저장했다 읽는 것과 똑같이 값이 정리된다.
 */
function MemoryStore(opts) {
  opts = opts || {};
  var T = VocabCore.TABLES, data = {}, index = {};

  function table(t) {
    if (!data[t]) {
      var rows = opts.load ? opts.load(t) : null;
      data[t] = (rows || []).map(function (r) { return VocabCore.fromRow(t, VocabCore.toRow(t, r)); });
      reindex(t);
    }
    return data[t];
  }
  function reindex(t) {
    index[t] = {};
    data[t].forEach(function (o, i) { index[t][o[VocabCore.keyOf(t)]] = i; });
  }
  function save(t) { if (opts.persist) opts.persist(t, data[t]); }

  return {
    invalidate: function () {},
    ensure: function () { Object.keys(T).forEach(table); },
    all: function (t) { return table(t); },
    get: function (t, id) { table(t); var i = index[t][id]; return i === undefined ? null : data[t][i]; },
    insert: function (t, obj) {
      table(t);
      var o = VocabCore.fromRow(t, VocabCore.toRow(t, obj));
      data[t].push(o); index[t][o[VocabCore.keyOf(t)]] = data[t].length - 1;
      save(t); return o;
    },
    insertMany: function (t, objs) {
      table(t);
      objs.forEach(function (obj) {
        var o = VocabCore.fromRow(t, VocabCore.toRow(t, obj));
        data[t].push(o); index[t][o[VocabCore.keyOf(t)]] = data[t].length - 1;
      });
      save(t);
    },
    update: function (t, id, patch) {
      table(t);
      var i = index[t][id];
      if (i === undefined) throw new Error('행이 없습니다: ' + t + '/' + id);
      data[t][i] = VocabCore.fromRow(t, VocabCore.toRow(t, Object.assign({}, data[t][i], patch)));
      save(t); return data[t][i];
    },
    remove: function (t, id) {
      table(t);
      var i = index[t][id];
      if (i === undefined) return false;
      data[t].splice(i, 1); reindex(t); save(t); return true;
    },
    dump: function () { var o = {}; Object.keys(T).forEach(function (t) { o[t] = table(t); }); return o; }
  };
}
