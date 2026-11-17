"""저장소 점검 (파이썬 기본 기능만 사용). GitHub Actions 와 내 컴퓨터에서 똑같이 돌린다.
  python tests/check_repo.py
확인하는 것: ① 데이터 개수 ② backend ↔ docs/js 복사본과 통합 파일이 최신인지 ③ 개인정보 흔적(학교 이름·전화번호·이메일·엑셀 파일)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
problems = []


def need(cond, msg):
    print(("  ✔ " if cond else "  ✘ ") + msg)
    if not cond:
        problems.append(msg)


print("① 데이터 개수")
v = json.loads((ROOT / "docs" / "data" / "vocab.json").read_text(encoding="utf8"))
cards = json.loads((ROOT / "docs" / "data" / "cards.json").read_text(encoding="utf8"))
school = [x for x in v["vocabulary"] if x["origin"] == "SCHOOL"]
nat = [x for x in v["vocabulary"] if x["origin"] == "NATIONAL"]
need(len(school) == 103, f"학교 고유 표제어 103개 (지금 {len(school)})")
need(len([s for s in v["sources"] if s["source_type"] == "SCHOOL"]) == 104, "학교 원본 항목(출처 행) 104개")
need(len(nat) == 307 and len(cards) == 307, f"국가 어휘·카드 307개 (지금 {len(nat)}·{len(cards)})")
need(len(v["prompts"]) == 309, "작문 장면 309개")
need(len([r for r in v["relations"] if r["relation_type"] == "SAME_HEADWORD"]) == 9, "같은 표제어 후보 9개")
need(all(c["guess"] and c["understand"]["definition"] for c in cards.values()), "모든 카드에 짐작 단서·뜻풀이가 있다")
need(len({x["vocabulary_id"] for x in v["vocabulary"]}) == len(v["vocabulary"]), "vocabulary_id 중복 없음")

for name, var in (("vocab", "__VOCAB"), ("cards", "__CARDS")):
    js = (ROOT / "docs" / "data" / f"{name}.js").read_text(encoding="utf8")
    body = js[js.index("= ") + 2: js.rindex(";")]
    need(json.loads(body) == json.loads((ROOT / "docs" / "data" / f"{name}.json").read_text(encoding="utf8")), f"{name}.js 가 {name}.json 과 같다 (더블클릭 실행용)")

print("② 복사본·통합 파일")
for tool in ("sync_core.py", "bundle_gas.py"):
    r = subprocess.run([sys.executable, "-X", "utf8", str(ROOT / "tools" / tool), "--check"], capture_output=True, text=True, encoding="utf8")
    need(r.returncode == 0, f"{tool} --check")

print("③ 개인정보 흔적")
TEXT_EXT = {".md", ".json", ".js", ".gs", ".html", ".css", ".py", ".tsv", ".yml", ".yaml", ".txt"}
bad_names = [p for p in ROOT.rglob("*") if p.suffix.lower() in (".xlsx", ".xls", ".csv", ".hwp", ".hwpx", ".pdf") and ".git" not in p.parts]
need(not bad_names, "엑셀·CSV·한글·PDF 파일이 저장소에 없다 " + (", ".join(str(p.relative_to(ROOT)) for p in bad_names) if bad_names else ""))
SCHOOL_WORD = re.compile("석촌")
PHONE = re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}")
EMAIL = re.compile(r"[\w.+-]+@(?!example\.|noreply)[\w-]+\.[\w.]+")
hits = []
for p in ROOT.rglob("*"):
    if not p.is_file() or p.suffix.lower() not in TEXT_EXT or ".git" in p.parts or p.name == "check_repo.py":
        continue
    t = p.read_text(encoding="utf8", errors="ignore")
    for name, rx in (("학교 이름", SCHOOL_WORD), ("전화번호", PHONE), ("이메일", EMAIL)):
        m = rx.search(t)
        if m:
            hits.append(f"{p.relative_to(ROOT)}: {name} «{m.group(0)[:20]}»")
need(not hits, "학교 이름·전화번호·이메일이 없다 " + "; ".join(hits[:5]))

print()
print("모두 통과" if not problems else f"실패 {len(problems)}건")
sys.exit(1 if problems else 0)
