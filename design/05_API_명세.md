# API 명세

> 이 문서의 표는 `tools/gen_docs.py` 가 `backend/Core.gs` 에서 자동으로 만듭니다.

## 요청과 응답

모든 요청은 **하나의 주소**로 `POST` 합니다. 본문은 JSON 글자이고, 사전 확인(preflight)을 피하려고 `Content-Type: text/plain` 으로 보냅니다.

```json
{ "action": "writing.save", "token": "로그인 때 받은 토큰", "payload": { "vocabulary_id": "V-S025", "scene_type": "SUBJECT", "text": "…", "mode": "DRAFT", "base_rev": 0 }, "req_id": "r…(저장 요청마다 새로)" }
```

성공: `{ "ok": true, "data": … }`  /  실패: `{ "ok": false, "error": { "code": "…", "message": "…", "data": … } }`

## 공통 규칙

- **모든 엔드포인트가 서버에서** 토큰·역할·소유권을 검사합니다. 웹앱 주소가 공개여도 토큰이 없으면 아무것도 읽거나 쓸 수 없습니다.
- 학생 기록은 `user_id` 가 토큰의 주인과 같을 때만 접근합니다. 남의 기록은 «없음(NOT_FOUND)» 으로 답해 존재 여부도 알려 주지 않습니다.
- 교사는 `teacher_id` 가 자기인 학급의 학생에게만 접근합니다(`FORBIDDEN`).
- 쓰기 요청은 `LockService` 로 한 번에 하나씩 처리합니다.
- 저장 요청에는 `req_id` 를 붙입니다. 같은 `req_id` 가 다시 오면 처음 결과를 돌려줍니다(더블클릭·재전송 방지).
- `base_rev` 가 서버의 `rev` 와 다르면 `CONFLICT` 와 함께 서버의 최신 행을 돌려줍니다(덮어쓰기 방지).
- 로그인 5회 실패 시 10분 잠금. 세션은 학생 8시간·교사 4시간(최대 24시간).

## 오류 코드

| code | 뜻 |
|---|---|
| `UNAUTHENTICATED` / `SESSION_EXPIRED` | 로그인이 필요하거나 시간이 끝남 |
| `FORBIDDEN` | 역할·소유권이 맞지 않음 |
| `NOT_FOUND` | 대상이 없거나 내 것이 아님 |
| `BAD_REQUEST` / `TOO_SHORT` / `UNCHANGED` / `DUPLICATE` | 입력 문제 |
| `CONFLICT` | 다른 기기에서 먼저 저장함 |
| `WRITE_FIRST` | 쓰기 전에 예시를 요청함 |
| `LOGIN_FAILED` / `LOCKED` / `NOT_ACTIVATED` / `INVITE_INVALID` / `WEAK_PASSWORD` | 로그인·계정 |
| `CONFIRM_REQUIRED` | 삭제 확인 입력이 틀림 |
| `BUSY` / `INTERNAL` | 서버가 바쁘거나 문제가 생김 |

## 엔드포인트

| action | 누가 | 종류 | 하는 일 | 주요 입력 | 응답 |
|---|---|---|---|---|---|
| `auth.login` | 로그인 전 | 쓰기 | 아이디·비밀번호로 로그인 | login_id, password | token, user, expires_at |
| `auth.activate` | 로그인 전 | 쓰기 | 초대 코드로 처음 비밀번호 만들기(1회용) | login_id, invite_code, new_password | token, user |
| `auth.logout` | 로그인한 모두 | 쓰기 | 로그아웃(서버의 세션도 지움) | - | bye |
| `auth.change_password` | 로그인한 모두 | 쓰기 | 비밀번호 변경(다른 기기 로그아웃) | old_password, new_password | changed |
| `site.get` | 로그인 전 | 읽기 | 타이틀 이미지 조회(로그인 전에도 열려 있음) | - | title_image(비어 있으면 기본 이미지) |
| `site.set_title` | 교사 | 쓰기 | 타이틀 이미지 교체(교사=관리자 전용, PNG·WEBP·JPG, 330KB 이하) | data_url | title_image |
| `site.reset_title` | 교사 | 쓰기 | 타이틀 이미지를 기본으로 되돌리기 | - | title_image |
| `auth.me` | 로그인한 모두 | 읽기 | 지금 로그인한 사용자 | - | user, expires_at |
| `sync` | 학생 | 읽기 | 학생 본인의 기록 전부 + 공개된 차시 + 교사 수정분 | - | user, class, lessons, sv, collections, writings, daily, reviews, feedback, shared, delta |
| `sv.save` | 학생 | 쓰기 | 어휘 학습 기록(교과서 문장·짐작·설명, 단계 표시) | vocabulary_id, textbook_sentence?, guessed_meaning?, self_explanation?, mark?[], base_rev? | 저장된 행 |
| `writing.save` | 학생 | 쓰기 | 세 장면 작문 임시 저장(DRAFT) / 제출(SUBMIT) | vocabulary_id, scene_type, text, mode, self_check?, base_rev | 저장된 행 (충돌 시 CONFLICT + 서버 행) |
| `writing.feature` | 학생 | 쓰기 | 대표 문장 지정 | writing_id, featured | 저장된 행 |
| `writing.mark_example` | 학생 | 쓰기 | 예시를 열어 봤다고 표시 | writing_id | 저장된 행 |
| `writing.example` | 학생 | 읽기 | 예시 문장(먼저 쓴 뒤에만) | vocabulary_id, scene_type | example  (쓰기 전이면 WRITE_FIRST) |
| `writing.revisions` | 학생 | 읽기 | 내 문장의 수정 이력 | writing_id | [{version, text, saved_at}] |
| `collection.add` | 학생 | 쓰기 | 수집함에 새 단어. 중복이면 저장하지 않고 안내 | headword, …, confirm_duplicate? | {duplicate, mine, dictionary} 또는 {item} |
| `collection.save` | 학생 | 쓰기 | 수집 단어 수정 | collection_id, 바꿀 항목, base_rev | 저장된 행 |
| `collection.trash` | 학생 | 쓰기 | 휴지통으로 / 되살리기 | collection_id, restore? | 저장된 행 |
| `collection.request_share` | 학생 | 쓰기 | 학급 공유 승인 요청 | collection_id | 저장된 행 |
| `daily.save` | 학생 | 쓰기 | 오늘의 문장 저장·수정 | date, text, vocabulary_id?, daily_id?, base_rev? | 저장된 행 |
| `daily.delete` | 학생 | 쓰기 | 오늘의 문장 지우기 | daily_id | deleted |
| `review.record` | 학생 | 쓰기 | 복습 결과 기록(복습 간격 갱신) | vocabulary_id, mode, result, detail? | box, next_review_at |
| `feedback.read` | 학생 | 쓰기 | 피드백을 읽었다고 표시 | feedback_id | read |
| `class.list` | 교사 | 읽기 | 내 학급 목록 | - | [class] |
| `class.create` | 교사 | 쓰기 | 학급 만들기(34개 차시 줄도 만듦) | school_year, grade, class_name | class |
| `student.create` | 교사 | 쓰기 | 학생 계정 발급(아이디·초대 코드) | class_id, students:[{no, name}] | [{login_id, invite_code, …}] — 코드는 이때만 보임 |
| `student.reset` | 교사 | 쓰기 | 계정 복구: 새 초대 코드, 기존 로그인 끊기 | user_id | invite_code |
| `student.set_status` | 교사 | 쓰기 | 사용 중지/재개 | user_id, status | status |
| `student.purge` | 교사 | 쓰기 | 학생 계정과 모든 기록 삭제 | user_id, confirm(=학생 아이디) | removed |
| `student.list` | 교사 | 읽기 | 학급 학생과 진도 요약 | class_id | [summary] |
| `student.detail` | 교사 | 읽기 | 학생 한 명의 모든 기록·수정 이력(접근 기록이 남음) | user_id | sv, writings, revisions, collections, daily, reviews, feedback |
| `lesson.list` | 교사 | 읽기 | 34개 차시와 지정 어휘 | class_id | [lesson] |
| `lesson.save` | 교사 | 쓰기 | 차시 제목·목표·기한·공개 여부 | class_id, lesson_number, title?, goals?, published?, due_date? | lesson |
| `lesson.set_vocab` | 교사 | 쓰기 | 차시의 어휘와 필수 여부 지정 | class_id, lesson_number, items:[{vocabulary_id, required}] | lesson |
| `lesson.auto_distribute` | 교사 | 쓰기 | 학교 어휘를 34개 차시에 고르게 나눔 | class_id | [lesson] |
| `vocab.save` | 교사 | 쓰기 | 뜻풀이 수정(검토 완료 표시) / 새 어휘 추가 | vocabulary_id, definition … 또는 headword, definition, subject | vocabulary |
| `prompt.save` | 교사 | 쓰기 | 작문 장면(상황·질문·예시) 수정 | vocabulary_id, scene_type, scenario, guiding_question, example? | prompt |
| `prompt.get` | 교사 | 읽기 | 어휘의 장면 목록(예시 포함, 교사 전용) | vocabulary_id | [prompt] |
| `activity.save` | 교사 | 쓰기 | 복습 문항 올리기 | vocabulary_id, type, prompt, answer_key? | activity |
| `feedback.save` | 교사 | 쓰기 | 피드백(서술 + 5개 준거 1~4점) | target_id, target_type, comment, rubric | feedback |
| `collection.review` | 교사 | 쓰기 | 수집 어휘 공유 승인/거절 | collection_id, decision, note? | 저장된 행 |
| `review.pending` | 교사 | 읽기 | 공유 검토를 기다리는 수집 어휘 | class_id | [item] |
| `stats.class` | 교사 | 읽기 | 학급 통계 | class_id | students, by_subject, feedback_total, incomplete_required |
| `export.class` | 교사 | 읽기 | 내보내기용 표(CSV/XLSX 는 화면에서 만듦) | class_id, kind | filename, rows |
| `backup.export` | 교사 | 읽기 | 내 학급 백업(JSON) | - | backup |
| `backup.restore` | 교사 | 쓰기 | 백업으로 복원(덮어쓰기·되살리기, 삭제 없음) | backup | restored |
| `audit.list` | 교사 | 읽기 | 접근 기록 최근 200건 | - | [log] |

## 관리용 함수 (웹으로 열리지 않음)

Apps Script 편집기에서만 실행합니다: `setup()` 설치·어휘 넣기·교사 계정, `newTeacherCode()` 교사 초대 코드 재발급, `backupToDrive()` / `installNightlyBackup()` 드라이브 백업, `cleanup()` 만료 세션 정리.
