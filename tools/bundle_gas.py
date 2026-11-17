"""Apps Script 에 «복사해 붙여 넣기» 쉽도록 backend/*.gs 를 파일 하나로 합친다.
결과: backend/AppsScript_통합.gs   (선생님은 이 파일 하나만 Apps Script 편집기에 붙여 넣으면 된다)
사용: python tools/bundle_gas.py          (만들기)
      python tools/bundle_gas.py --check  (최신인지 확인)
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORDER = ["Sha256.gs", "Core.gs", "Store.gs", "Code.gs", "Setup.gs", "SeedExamples.gs"]
OUT = ROOT / "backend" / "AppsScript_통합.gs"


def build() -> str:
    parts = ["/* 자동 생성 파일 — 직접 고치지 마세요. (tools/bundle_gas.py)\n"
             "   Apps Script 편집기의 Code.gs 에 이 파일 내용을 통째로 붙여 넣습니다. */\n"]
    for name in ORDER:
        body = (ROOT / "backend" / name).read_text(encoding="utf8").rstrip() + "\n"
        parts.append(f"\n/* ================================================================\n   {name}\n   ================================================================ */\n{body}")
    return "".join(parts)


if __name__ == "__main__":
    text = build()
    if "--check" in sys.argv:
        same = OUT.exists() and OUT.read_text(encoding="utf8") == text
        print("같음" if same else "다름 — python tools/bundle_gas.py 를 실행하세요")
        sys.exit(0 if same else 1)
    OUT.write_text(text, encoding="utf8")
    print(f"만들었습니다: {OUT.relative_to(ROOT)} ({len(text) // 1024}KB)")
