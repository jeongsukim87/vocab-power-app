/**
 * 처음 한 번 하는 설치와 관리용 함수. Apps Script 편집기에서 함수를 골라 ▶ 실행으로 쓴다.
 * (웹으로는 열리지 않는다 — doPost 가 부르는 목록에 없다.)
 *
 * 순서:  1) CONFIG 의 값을 채운다  2) setup 실행  3) 실행 로그에 나온 교사 초대 코드를 받아 적는다
 */
var CONFIG = {
  // 어휘 데이터가 올라간 주소 (GitHub Pages 에 배포한 뒤의 vocab.json 주소)
  SEED_URL: 'https://jeongsukim87.github.io/vocab-power-app/data/vocab.json',
  TEACHER_ID: 'teacher',          // 선생님 로그인 아이디
  TEACHER_NAME: '선생님',         // 화면에 보일 이름
  BACKUP_FOLDER_NAME: '학습도구어_백업', // 드라이브에 만들 백업 폴더
  BACKUP_KEEP: 14                 // 백업 파일을 몇 개까지 남길지
};

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  props_().setProperty('SPREADSHEET_ID', ss.getId());
  pepper_();
  var store = SheetsStore_(ss);
  store.ensure();
  var core = newCore_();

  var data = JSON.parse(UrlFetchApp.fetch(CONFIG.SEED_URL, { muteHttpExceptions: false }).getContentText());
  var examples = JSON.parse(UrlFetchApp.fetch(CONFIG.SEED_URL.replace(/vocab\.json$/, 'examples.json')).getContentText());
  var r = core.seed(data, examples);
  Logger.log('어휘 ' + r.vocabulary_added + '개를 시트에 넣었습니다.');

  try {
    var t = core.createTeacher(CONFIG.TEACHER_ID, CONFIG.TEACHER_NAME);
    Logger.log('교사 계정 «' + t.login_id + '» 초대 코드: ' + t.invite_code + '  (14일 안에 로그인 화면 «처음 오셨나요?» 에서 쓰세요)');
  } catch (e) {
    Logger.log('교사 계정: ' + e.message + ' — 이미 있으면 newTeacherCode() 로 새 코드를 만드세요.');
  }
}

/** 비밀번호를 잊은 교사에게 새 초대 코드를 준다 (새 코드로 다시 비밀번호를 만들게 한다). */
function newTeacherCode() {
  props_().setProperty('SPREADSHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  var r = newCore_().resetInvite(CONFIG.TEACHER_ID);
  Logger.log('«' + r.login_id + '» 새 초대 코드: ' + r.invite_code + '  (14일 안에 «처음 오셨나요?» 에서 쓰세요)');
}

/** 스프레드시트 전체를 드라이브 폴더에 날짜 이름으로 복사한다. 시간 기반 트리거(매일 밤)로 걸어 두면 자동 백업이 된다. */
function backupToDrive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var folders = DriveApp.getFoldersByName(CONFIG.BACKUP_FOLDER_NAME);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.BACKUP_FOLDER_NAME);
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmm');
  DriveApp.getFileById(ss.getId()).makeCopy('학습도구어_백업_' + stamp, folder);
  var files = [], it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(CONFIG.BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
  Logger.log('백업 완료: ' + stamp + ' (보관 ' + Math.min(files.length, CONFIG.BACKUP_KEEP) + '개)');
}

/** 매일 밤 2시에 backupToDrive 를 돌리는 트리거를 만든다 (한 번만 실행). */
function installNightlyBackup() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'backupToDrive'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupToDrive').timeBased().everyDays(1).atHour(2).create();
  Logger.log('매일 밤 2시 자동 백업을 켰습니다.');
}

/** 만료된 세션과 오래된 중복 방지 기록을 정리한다 (필요할 때 실행). */
function cleanup() {
  var store = SheetsStore_(SpreadsheetApp.getActiveSpreadsheet());
  var now = new Date().toISOString(), n = 0;
  store.all('Sessions').filter(function (s) { return s.expires_at < now; }).forEach(function (s) { store.remove('Sessions', s.token_hash); n++; });
  store.all('ReqLog').filter(function (r) { return r.created_at < new Date(Date.now() - 36e5).toISOString(); }).forEach(function (r) { store.remove('ReqLog', r.req_id); n++; });
  Logger.log('정리한 줄: ' + n);
}
