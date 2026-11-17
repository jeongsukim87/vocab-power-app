/**
 * 구글 스프레드시트 저장소 — Core.gs 가 요구하는 store 인터페이스를 시트 한 장 = 표 하나로 구현한다.
 *  · 첫 줄은 열 제목, 첫 열이 기본키
 *  · 한 번의 요청 안에서는 읽은 표를 메모리에 두고 쓴다. 잠금을 잡을 때마다 비우고 다시 읽는다(invalidate).
 *  · 모든 글 칸은 «일반 텍스트» 서식이라 날짜 모양 글자가 자동으로 날짜로 바뀌지 않는다.
 */
function SheetsStore_(ss) {
  var T = VocabCore.TABLES;
  var cache = {};

  function makeSheet(t) { // 시트 한 장을 만들고 열 제목·서식을 넣는다
    var sh = ss.getSheetByName(t) || ss.insertSheet(t);
    var heads = T[t].map(VocabCore.colName);
    sh.getRange(1, 1, 1, heads.length).setValues([heads]).setFontWeight('bold').setBackground('#eef2ff');
    sh.setFrozenRows(1);
    T[t].forEach(function (c, i) {
      var isNum = c.indexOf(':n') > 0;
      sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(isNum ? '0' : '@');
    });
    return sh;
  }

  function sheetOf(t) {
    // 새 버전에서 표가 늘어나도(예: Settings) 기존 시트를 건드리지 않고 없는 표만 만든다
    return ss.getSheetByName(t) || makeSheet(t);
  }

  function load(t) {
    if (cache[t]) return cache[t];
    var sh = sheetOf(t), n = T[t].length, last = sh.getLastRow();
    var vals = last > 1 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
    var objs = vals.map(function (r) { return VocabCore.fromRow(t, r); });
    var index = {};
    objs.forEach(function (o, i) { index[o[VocabCore.keyOf(t)]] = i; });
    cache[t] = { objs: objs, index: index };
    return cache[t];
  }

  return {
    invalidate: function () { cache = {}; },

    ensure: function () {
      Object.keys(T).forEach(function (t) { makeSheet(t); });
      var first = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
      if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);
    },

    all: function (t) { return load(t).objs; },

    get: function (t, id) {
      var c = load(t), i = c.index[id];
      return i === undefined ? null : c.objs[i];
    },

    insert: function (t, obj) {
      var c = load(t), sh = sheetOf(t);
      var row = VocabCore.toRow(t, obj);
      var r = sh.getLastRow() + 1;
      sh.getRange(r, 1, 1, row.length).setValues([row]);
      var o = VocabCore.fromRow(t, row);
      c.objs.push(o);
      c.index[o[VocabCore.keyOf(t)]] = c.objs.length - 1;
      return o;
    },

    insertMany: function (t, objs) { // 한 번에 여러 줄 (처음 어휘를 넣을 때 쓴다)
      var c = load(t), sh = sheetOf(t);
      var rows = objs.map(function (o) { return VocabCore.toRow(t, o); });
      if (!rows.length) return;
      var r = sh.getLastRow() + 1;
      sh.getRange(r, 1, rows.length, rows[0].length).setValues(rows);
      rows.forEach(function (row) {
        var o = VocabCore.fromRow(t, row);
        c.objs.push(o);
        c.index[o[VocabCore.keyOf(t)]] = c.objs.length - 1;
      });
    },

    update: function (t, id, patch) {
      var c = load(t), i = c.index[id];
      if (i === undefined) throw new Error('행이 없습니다: ' + t + '/' + id);
      var merged = Object.assign({}, c.objs[i], patch);
      var row = VocabCore.toRow(t, merged);
      sheetOf(t).getRange(i + 2, 1, 1, row.length).setValues([row]);
      c.objs[i] = VocabCore.fromRow(t, row);
      return c.objs[i];
    },

    remove: function (t, id) {
      var c = load(t), i = c.index[id];
      if (i === undefined) return false;
      sheetOf(t).deleteRow(i + 2);
      delete cache[t]; // 행 번호가 밀리므로 다시 읽는다
      return true;
    }
  };
}
