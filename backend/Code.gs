/**
 * Apps Script 웹앱 진입점.
 *  · 화면(GitHub Pages)이 POST 로 {action, token, payload, req_id} 를 보내면 Core 가 처리한다.
 *  · 웹앱 주소(URL)가 공개여도 안전한 이유: 모든 요청이 서버에서 로그인 토큰과 역할·소유권을 검사한다. (Core.gs)
 *  · 비밀값(pepper)은 이 파일이 아닌 «스크립트 속성» 에 있다.
 */

function props_() { return PropertiesService.getScriptProperties(); }

function pepper_() {
  var p = props_(), v = p.getProperty('PEPPER');
  if (!v) { v = randomHex_(32); p.setProperty('PEPPER', v); }
  return v;
}

function randomHex_(n) { // Utilities.getUuid() 는 java.util.UUID.randomUUID() (SecureRandom) 기반이다
  var s = '';
  while (s.length < n * 2) s += Utilities.getUuid().replace(/-/g, '');
  return s.substr(0, n * 2);
}

function spreadsheet_() {
  var id = props_().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('스프레드시트에 연결된 스크립트가 아닙니다.');
  return ss;
}

function newCore_() {
  var store = SheetsStore_(spreadsheet_());
  var lock = LockService.getScriptLock();
  var env = {
    store: store,
    sha256Hex: sha256Hex,
    randomHex: randomHex_,
    pepper: pepper_(),
    now: function () { return new Date().toISOString(); },
    lock: function (fn) {
      lock.waitLock(25000); // 동시에 저장하려는 요청은 차례로 처리한다 (덮어쓰기·유실 방지)
      try { store.invalidate(); return fn(); } finally { lock.releaseLock(); }
    },
    log: function (e) { console.error(e && e.stack ? e.stack : e); }
  };
  return VocabCore.create(env);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var res;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 200000) return json_({ ok: false, error: { code: 'BAD_REQUEST', message: '요청이 올바르지 않습니다.' } });
    res = newCore_().handle(JSON.parse(raw));
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    res = { ok: false, error: { code: err && err.message && /Lock/i.test(err.message) ? 'BUSY' : 'INTERNAL',
      message: '서버가 바쁘거나 문제가 생겼습니다. 잠시 뒤에 다시 해 보세요.' } };
  }
  return json_(res);
}

function doGet() { // 주소를 직접 열어 보았을 때: 서버가 살아 있는지만 알려 준다 (데이터는 돌려주지 않는다)
  return json_({ ok: true, service: 'vocab-power-server', version: 1 });
}
