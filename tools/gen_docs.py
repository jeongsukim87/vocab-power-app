"""backend/Core.gs 를 읽어 설계 문서의 «시트 열 제목»·«API 명세» 표를 자동으로 만든다 (코드와 문서가 어긋나지 않게).
출력: design/04b_시트_열_제목.md, design/05_API_명세.md
사용: python tools/gen_docs.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
core = (ROOT / "backend" / "Core.gs").read_text(encoding="utf8")

# ---------- 표 정의 ----------
block = core[core.index("var TABLES = {"): core.index("var RUBRIC")]
tables = {}
for m in re.finditer(r"^\s{4}(\w+): \[(.*?)\](?:,|\n\s*\};)", block, re.S | re.M):
    cols = re.findall(r"'([^']+)'", m.group(2))
    tables[m.group(1)] = cols

TABLE_NOTE = {
    "Users": "교사·학생 계정. 비밀번호는 salt+해시만 저장, 초대 코드도 해시.",
    "Classes": "학급. teacher_id 가 소유 교사.",
    "Sessions": "로그인 세션. 토큰 자체가 아니라 토큰의 해시만 저장.",
    "Vocabulary": "표제어·뜻(sense). origin = SCHOOL / NATIONAL / CUSTOM(교사 추가).",
    "VocabularySources": "출처. 학교 원본 104개 항목은 original_entry_id 로 보존.",
    "VocabularyRelations": "어휘 사이의 관계(같은 표제어·유사 표기·유의어 등). status=CANDIDATE 는 교사 확인 전.",
    "Lessons": "학급별 34개 차시. published=1 인 차시만 학생에게 보임.",
    "LessonVocabulary": "차시별 지정 어휘와 필수 여부.",
    "LearningActivities": "교사가 올린 복습 문항.",
    "StudentVocabulary": "학생×어휘 학습 기록. steps 는 JSON, rev 는 동시 저장 충돌 검사용.",
    "PersonalCollections": "나의 어휘 수집함. 학생별 소유.",
    "WritingPrompts": "세 장면(교과·일상·세상)의 상황·질문·예시. 서버에서만 예시를 내려 준다.",
    "Writings": "학생×어휘×장면의 현재 글. draft_text(작성 중) / text(제출본) / version(제출 횟수).",
    "WritingRevisions": "제출할 때마다 쌓는 수정 이력(지우지 않음).",
    "DailySentences": "오늘의 문장.",
    "ReviewRecords": "복습 결과.",
    "TeacherFeedback": "서술형 피드백과 5개 준거 점수.",
    "AuditLogs": "접근 기록(로그인, 학생 기록 열람, 내보내기, 백업 …).",
    "Settings": "사이트 설정. 지금은 타이틀 이미지(큰 글자는 40,000자씩 쪼개 여러 줄에 저장).",
    "ReqLog": "같은 저장 요청이 두 번 와도 한 번만 처리하기 위한 짧은 기록(30분 뒤 정리).",
}

lines = ["# 시트(표) 열 제목\n",
         "> 이 문서는 `tools/gen_docs.py` 가 `backend/Core.gs` 에서 자동으로 만듭니다. 직접 고치지 마세요.\n",
         "> `:n` 은 숫자 열, `:j` 는 JSON 글자가 들어가는 열입니다. 첫 열이 기본키입니다. 구글 시트의 시트(탭) 이름이 표 이름과 같습니다.\n"]
for t, cols in tables.items():
    lines.append(f"\n## {t}\n\n{TABLE_NOTE.get(t, '')}\n")
    lines.append("| # | 열 제목 | 종류 |\n|---|---|---|")
    for i, c in enumerate(cols, 1):
        name, _, typ = c.partition(":")
        kind = {"n": "숫자", "j": "JSON"}.get(typ, "글자") + (" · 기본키" if i == 1 else "")
        lines.append(f"| {i} | `{name}` | {kind} |")
(ROOT / "design" / "04b_시트_열_제목.md").write_text("\n".join(lines) + "\n", encoding="utf8")

# ---------- API 명세 ----------
DESC = {
    "auth.login": ("아이디·비밀번호로 로그인", "login_id, password", "token, user, expires_at"),
    "auth.activate": ("초대 코드로 처음 비밀번호 만들기(1회용)", "login_id, invite_code, new_password", "token, user"),
    "auth.logout": ("로그아웃(서버의 세션도 지움)", "-", "bye"),
    "auth.change_password": ("비밀번호 변경(다른 기기 로그아웃)", "old_password, new_password", "changed"),
    "auth.me": ("지금 로그인한 사용자", "-", "user, expires_at"),
    "sync": ("학생 본인의 기록 전부 + 공개된 차시 + 교사 수정분", "-", "user, class, lessons, sv, collections, writings, daily, reviews, feedback, shared, delta"),
    "sv.save": ("어휘 학습 기록(교과서 문장·짐작·설명, 단계 표시)", "vocabulary_id, textbook_sentence?, guessed_meaning?, self_explanation?, mark?[], base_rev?", "저장된 행"),
    "writing.save": ("세 장면 작문 임시 저장(DRAFT) / 제출(SUBMIT)", "vocabulary_id, scene_type, text, mode, self_check?, base_rev", "저장된 행 (충돌 시 CONFLICT + 서버 행)"),
    "writing.feature": ("대표 문장 지정", "writing_id, featured", "저장된 행"),
    "writing.mark_example": ("예시를 열어 봤다고 표시", "writing_id", "저장된 행"),
    "writing.example": ("예시 문장(먼저 쓴 뒤에만)", "vocabulary_id, scene_type", "example  (쓰기 전이면 WRITE_FIRST)"),
    "writing.revisions": ("내 문장의 수정 이력", "writing_id", "[{version, text, saved_at}]"),
    "collection.add": ("수집함에 새 단어. 중복이면 저장하지 않고 안내", "headword, …, confirm_duplicate?", "{duplicate, mine, dictionary} 또는 {item}"),
    "collection.save": ("수집 단어 수정", "collection_id, 바꿀 항목, base_rev", "저장된 행"),
    "collection.trash": ("휴지통으로 / 되살리기", "collection_id, restore?", "저장된 행"),
    "collection.request_share": ("학급 공유 승인 요청", "collection_id", "저장된 행"),
    "daily.save": ("오늘의 문장 저장·수정", "date, text, vocabulary_id?, daily_id?, base_rev?", "저장된 행"),
    "daily.delete": ("오늘의 문장 지우기", "daily_id", "deleted"),
    "review.record": ("복습 결과 기록(복습 간격 갱신)", "vocabulary_id, mode, result, detail?", "box, next_review_at"),
    "feedback.read": ("피드백을 읽었다고 표시", "feedback_id", "read"),
    "class.list": ("내 학급 목록", "-", "[class]"),
    "class.create": ("학급 만들기(34개 차시 줄도 만듦)", "school_year, grade, class_name", "class"),
    "student.create": ("학생 계정 발급(아이디·초대 코드)", "class_id, students:[{no, name}]", "[{login_id, invite_code, …}] — 코드는 이때만 보임"),
    "student.reset": ("계정 복구: 새 초대 코드, 기존 로그인 끊기", "user_id", "invite_code"),
    "student.set_status": ("사용 중지/재개", "user_id, status", "status"),
    "student.purge": ("학생 계정과 모든 기록 삭제", "user_id, confirm(=학생 아이디)", "removed"),
    "student.list": ("학급 학생과 진도 요약", "class_id", "[summary]"),
    "student.detail": ("학생 한 명의 모든 기록·수정 이력(접근 기록이 남음)", "user_id", "sv, writings, revisions, collections, daily, reviews, feedback"),
    "lesson.list": ("34개 차시와 지정 어휘", "class_id", "[lesson]"),
    "lesson.save": ("차시 제목·목표·기한·공개 여부", "class_id, lesson_number, title?, goals?, published?, due_date?", "lesson"),
    "lesson.set_vocab": ("차시의 어휘와 필수 여부 지정", "class_id, lesson_number, items:[{vocabulary_id, required}]", "lesson"),
    "lesson.auto_distribute": ("학교 어휘를 34개 차시에 고르게 나눔", "class_id", "[lesson]"),
    "vocab.save": ("뜻풀이 수정(검토 완료 표시) / 새 어휘 추가", "vocabulary_id, definition … 또는 headword, definition, subject", "vocabulary"),
    "prompt.save": ("작문 장면(상황·질문·예시) 수정", "vocabulary_id, scene_type, scenario, guiding_question, example?", "prompt"),
    "prompt.get": ("어휘의 장면 목록(예시 포함, 교사 전용)", "vocabulary_id", "[prompt]"),
    "activity.save": ("복습 문항 올리기", "vocabulary_id, type, prompt, answer_key?", "activity"),
    "feedback.save": ("피드백(서술 + 5개 준거 1~4점)", "target_id, target_type, comment, rubric", "feedback"),
    "collection.review": ("수집 어휘 공유 승인/거절", "collection_id, decision, note?", "저장된 행"),
    "review.pending": ("공유 검토를 기다리는 수집 어휘", "class_id", "[item]"),
    "stats.class": ("학급 통계", "class_id", "students, by_subject, feedback_total, incomplete_required"),
    "export.class": ("내보내기용 표(CSV/XLSX 는 화면에서 만듦)", "class_id, kind", "filename, rows"),
    "backup.export": ("내 학급 백업(JSON)", "-", "backup"),
    "backup.restore": ("백업으로 복원(덮어쓰기·되살리기, 삭제 없음)", "backup", "restored"),
    "site.get": ("타이틀 이미지 조회(로그인 전에도 열려 있음)", "-", "title_image(비어 있으면 기본 이미지)"),
    "site.set_title": ("타이틀 이미지 교체(교사=관리자 전용, PNG·WEBP·JPG, 330KB 이하)", "data_url", "title_image"),
    "site.reset_title": ("타이틀 이미지를 기본으로 되돌리기", "-", "title_image"),
    "audit.list": ("접근 기록 최근 200건", "-", "[log]"),
}
who = {"none": "로그인 전", "any": "로그인한 모두", "student": "학생", "teacher": "교사"}
rows = []
for m in re.finditer(r"def\('([a-z_.]+)', \{([^}]*)\}", core):
    name, opts = m.group(1), m.group(2)
    auth = re.search(r"auth: '(\w+)'", opts).group(1)
    write = "write: true" in opts
    d = DESC.get(name, ("", "", ""))
    rows.append((name, who[auth], "쓰기" if write else "읽기", *d))
missing = [r[0] for r in rows if not r[3]]
api = ["# API 명세\n",
       "> 이 문서의 표는 `tools/gen_docs.py` 가 `backend/Core.gs` 에서 자동으로 만듭니다.\n",
       "## 요청과 응답\n",
       "모든 요청은 **하나의 주소**로 `POST` 합니다. 본문은 JSON 글자이고, 사전 확인(preflight)을 피하려고 `Content-Type: text/plain` 으로 보냅니다.\n",
       "```json\n{ \"action\": \"writing.save\", \"token\": \"로그인 때 받은 토큰\", \"payload\": { \"vocabulary_id\": \"V-S025\", \"scene_type\": \"SUBJECT\", \"text\": \"…\", \"mode\": \"DRAFT\", \"base_rev\": 0 }, \"req_id\": \"r…(저장 요청마다 새로)\" }\n```\n",
       "성공: `{ \"ok\": true, \"data\": … }`  /  실패: `{ \"ok\": false, \"error\": { \"code\": \"…\", \"message\": \"…\", \"data\": … } }`\n",
       "## 공통 규칙\n",
       "- **모든 엔드포인트가 서버에서** 토큰·역할·소유권을 검사합니다. 웹앱 주소가 공개여도 토큰이 없으면 아무것도 읽거나 쓸 수 없습니다.",
       "- 학생 기록은 `user_id` 가 토큰의 주인과 같을 때만 접근합니다. 남의 기록은 «없음(NOT_FOUND)» 으로 답해 존재 여부도 알려 주지 않습니다.",
       "- 교사는 `teacher_id` 가 자기인 학급의 학생에게만 접근합니다(`FORBIDDEN`).",
       "- 쓰기 요청은 `LockService` 로 한 번에 하나씩 처리합니다.",
       "- 저장 요청에는 `req_id` 를 붙입니다. 같은 `req_id` 가 다시 오면 처음 결과를 돌려줍니다(더블클릭·재전송 방지).",
       "- `base_rev` 가 서버의 `rev` 와 다르면 `CONFLICT` 와 함께 서버의 최신 행을 돌려줍니다(덮어쓰기 방지).",
       "- 로그인 5회 실패 시 10분 잠금. 세션은 학생 8시간·교사 4시간(최대 24시간).\n",
       "## 오류 코드\n",
       "| code | 뜻 |\n|---|---|",
       "| `UNAUTHENTICATED` / `SESSION_EXPIRED` | 로그인이 필요하거나 시간이 끝남 |",
       "| `FORBIDDEN` | 역할·소유권이 맞지 않음 |",
       "| `NOT_FOUND` | 대상이 없거나 내 것이 아님 |",
       "| `BAD_REQUEST` / `TOO_SHORT` / `UNCHANGED` / `DUPLICATE` | 입력 문제 |",
       "| `CONFLICT` | 다른 기기에서 먼저 저장함 |",
       "| `WRITE_FIRST` | 쓰기 전에 예시를 요청함 |",
       "| `LOGIN_FAILED` / `LOCKED` / `NOT_ACTIVATED` / `INVITE_INVALID` / `WEAK_PASSWORD` | 로그인·계정 |",
       "| `CONFIRM_REQUIRED` | 삭제 확인 입력이 틀림 |",
       "| `BUSY` / `INTERNAL` | 서버가 바쁘거나 문제가 생김 |\n",
       "## 엔드포인트\n",
       "| action | 누가 | 종류 | 하는 일 | 주요 입력 | 응답 |\n|---|---|---|---|---|---|"]
for r in rows:
    api.append(f"| `{r[0]}` | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} |")
api.append("\n## 관리용 함수 (웹으로 열리지 않음)\n\nApps Script 편집기에서만 실행합니다: `setup()` 설치·어휘 넣기·교사 계정, `newTeacherCode()` 교사 초대 코드 재발급, `backupToDrive()` / `installNightlyBackup()` 드라이브 백업, `cleanup()` 만료 세션 정리.\n")
(ROOT / "design" / "05_API_명세.md").write_text("\n".join(api), encoding="utf8")
print(f"표 {len(tables)}개, API {len(rows)}개, 설명 빠진 API: {missing or '없음'}")
