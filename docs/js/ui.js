/* 화면 도구: 자동 이스케이프 템플릿, 알림, 대화상자, 작은 부품들 */
var UI = (function () {
  'use strict';
  var U = {};

  function Raw(s) { this.s = s; }
  U.raw = function (s) { return new Raw(s); };
  U.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function part(v) {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(part).join('');
    return U.esc(v);
  }
  /** html`<b>${사용자글}</b>` — 끼워 넣은 값은 모두 이스케이프된다. 이미 안전한 조각은 UI.raw() 로 감싼다. */
  U.html = function (strings) {
    var out = strings[0];
    for (var i = 1; i < arguments.length; i++) out += part(arguments[i]) + strings[i];
    return new Raw(out);
  };
  U.set = function (el, h) { el.innerHTML = h instanceof Raw ? h.s : U.esc(h); };

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  U.toast = function (msg, kind) {
    var wrap = document.getElementById('toasts'), t = document.createElement('div');
    t.className = 'toast ' + (kind || ''); t.textContent = msg; wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'err' ? 6000 : 3000);
  };

  /** 대화상자. buttons: [{label, kind, value}] → Promise(value) */
  U.modal = function (opts) {
    return new Promise(function (resolve) {
      var root = document.getElementById('modal-root');
      var bg = document.createElement('div'); bg.className = 'modal-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true');
      var box = document.createElement('div'); box.className = 'modal' + (opts.wide ? ' wide' : '');
      var btns = (opts.buttons || [{ label: '닫기', value: null }]).map(function (b, i) { return '<button class="btn ' + (b.kind || '') + '" data-i="' + i + '">' + U.esc(b.label) + '</button>'; }).join('');
      box.innerHTML = '<h2>' + U.esc(opts.title || '') + '</h2><div class="mbody">' + (opts.body instanceof Raw ? opts.body.s : U.esc(opts.body || '')) + '</div><div class="row" style="margin-top:16px;justify-content:flex-end">' + btns + '</div>';
      bg.appendChild(box); root.appendChild(bg);
      var prev = document.activeElement;
      function close(v) { bg.remove(); if (prev && prev.focus) prev.focus(); resolve(v); }
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-i]'); if (!b) return;
        var def = opts.buttons[Number(b.dataset.i)];
        if (opts.onSubmit && def.submit) { var out = opts.onSubmit(box, def); if (out === false) return; close(out === undefined ? def.value : out); return; }
        close(def.value);
      });
      bg.addEventListener('mousedown', function (e) { if (e.target === bg && !opts.sticky) close(null); });
      bg.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !opts.sticky) close(null); });
      var first = box.querySelector('input,textarea,select,button.primary,button'); if (first) first.focus();
      if (opts.onOpen) opts.onOpen(box);
    });
  };
  U.confirm = function (title, body, okLabel, danger) {
    return U.modal({ title: title, body: body, buttons: [{ label: '취소', value: false }, { label: okLabel || '확인', kind: danger ? 'danger' : 'primary', value: true }] });
  };

  U.bar = function (pct) { return U.raw('<div class="bar" role="progressbar" aria-valuenow="' + Math.round(pct) + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>'); };
  U.pct = function (a, b) { return b ? Math.round((a / b) * 100) : 0; };
  U.date = function (iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? String(iso) : (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; };
  U.datetime = function (iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
  U.today = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  U.debounce = function (fn, ms) { var t; var f = function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; f.flush = function () { clearTimeout(t); }; return f; };

  /** 문장 속 {{강조}} 표시를 <mark> 로 */
  U.marked = function (text) {
    var s = U.esc(text).replace(/\{\{(.+?)\}\}/g, '<mark class="tg">$1</mark>');
    return U.raw(s);
  };
  /** 문장에서 낱말(또는 줄기)을 찾아 강조 */
  U.mark = function (text, word) {
    var t = U.esc(text);
    if (!word) return U.raw(t);
    var w = U.esc(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp(w); if (re.test(t)) return U.raw(t.replace(re, function (m) { return '<mark class="tg">' + m + '</mark>'; }));
    var stem = word.replace(/(하다|되다|적|화|성)$/, '');
    if (stem.length >= 2 && t.indexOf(U.esc(stem)) >= 0) return U.raw(t.replace(U.esc(stem), '<mark class="tg">' + U.esc(stem) + '</mark>'));
    return U.raw(t);
  };


  /* ---- 앱 타이틀 이미지 ----
   * 기본 이미지: img/title.png (원본 그대로, 무손실) + img/title.webp (같은 화소를 더 작게 담은 사본)
   * 교사가 올린 이미지가 있으면 그것(데이터 주소)을 대신 쓴다. 비율은 CSS 로만 맞추고 이미지는 변형하지 않는다. */
  U.title = { custom: '' };
  U.titleImg = function (cls) {
    var alt = '힘이 되는 학습도구어';
    if (U.title.custom) return U.raw('<picture class="title-pic" data-tcls="' + U.esc(cls || '') + '"><img class="title-img ' + U.esc(cls || '') + '" src="' + U.esc(U.title.custom) + '" alt="' + alt + '"></picture>');
    return U.raw('<picture class="title-pic" data-tcls="' + U.esc(cls || '') + '"><source srcset="img/title.webp" type="image/webp"><img class="title-img ' + U.esc(cls || '') + '" src="img/title.png" width="2048" height="682" alt="' + alt + '"></picture>');
  };
  /** 화면에 이미 그려진 타이틀 이미지를 모두 바꾼다 (교사가 이미지를 바꿨을 때·시작할 때) */
  U.setTitle = function (dataUrl) {
    U.title.custom = dataUrl || '';
    $$('picture.title-pic').forEach(function (p) { p.outerHTML = U.titleImg(p.dataset.tcls).s; });
    $$('[data-title-slot=brand]').forEach(function (s) { if (!s.firstChild) s.innerHTML = U.titleImg('brand-title').s; });
  };

  U.errMsg = function (e) { return e && e.message ? e.message : '문제가 생겼습니다. 잠시 뒤에 다시 해 보세요.'; };

  /** 저장 상태 표시기: ok · busy · err */
  U.saveState = function (el) {
    return {
      busy: function () { el.className = 'savestate busy'; el.textContent = '저장 중…'; },
      ok: function (msg) { el.className = 'savestate ok'; el.textContent = msg || '✔ 저장됨 ' + U.datetime(new Date().toISOString()).split(' ')[1]; },
      err: function (msg) { el.className = 'savestate err'; el.textContent = msg || '저장하지 못했어요. 내용은 이 기기에 임시로 보관돼 있어요.'; },
      text: function (msg) { el.className = 'savestate'; el.textContent = msg; }
    };
  };

  /** CSV(엑셀에서 한글이 깨지지 않도록 BOM 포함)로 내려받기 */
  U.downloadCsv = function (name, rows) {
    var csv = '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
    U.downloadBlob(name + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  };
  U.downloadBlob = function (name, blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.downloadXlsx = async function (name, rows) {
    if (!window.XLSX) {
      await new Promise(function (res, rej) {
        var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = res; s.onerror = function () { rej(new Error('엑셀 도구를 불러오지 못했습니다. CSV 로 받아 주세요.')); }; document.head.appendChild(s);
      });
    }
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '내보내기');
    XLSX.writeFile(wb, name + '.xlsx');
  };

  /** 데이터 속 글로 만든 요소 안의 data-act 클릭을 한 곳에서 받는다. */
  U.on = function (root, handlers) {
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]'); if (!el || !root.contains(el)) return;
      var h = handlers[el.dataset.act]; if (h) { e.preventDefault(); h(el, e); }
    });
  };

  return U;
})();
var html = UI.html, esc = UI.esc, $ = UI.$, $$ = UI.$$;

/* 앱 전체가 함께 쓰는 상태와 화면 모음 (다른 파일들이 먼저 불러와도 되도록 여기에 둔다) */
var S = { user: null, snap: null, classes: [], classId: null, leave: null };
var Views = {}; // Views.student / Views.teacher 가 각자 등록한다
