"""backend/Core.gs · Sha256.gs 를 체험 모드용 docs/js/ 로 복사한다 (한 곳만 고치면 되도록).
사용: python tools/sync_core.py          (복사)
      python tools/sync_core.py --check  (두 복사본이 같은지 확인 — 다르면 종료코드 1)
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAIRS = [(ROOT / "backend" / "Core.gs", ROOT / "docs" / "js" / "core.js"),
         (ROOT / "backend" / "Sha256.gs", ROOT / "docs" / "js" / "sha256.js")]
bad = 0
for src, dst in PAIRS:
    if "--check" in sys.argv:
        same = dst.exists() and src.read_bytes() == dst.read_bytes()
        print(("같음 " if same else "다름 ") + dst.name)
        bad += 0 if same else 1
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        print("복사:", src.name, "→", dst.relative_to(ROOT))
sys.exit(1 if bad else 0)
