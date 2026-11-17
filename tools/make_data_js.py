"""docs/data/*.json → docs/data/*.js  (index.html 을 더블클릭해 file:// 로 열어도 데이터를 읽을 수 있게 한다)
브라우저는 file:// 에서 fetch 를 막지만 <script src> 는 허용한다.
사용: python tools/make_data_js.py   (tools/build_data.py 를 돌린 뒤 실행)
"""
import json
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "docs" / "data"
for name, var in (("vocab", "__VOCAB"), ("cards", "__CARDS")):
    data = json.loads((D / f"{name}.json").read_text(encoding="utf8"))
    text = "/* 자동 생성(tools/make_data_js.py) — %s.json 과 같은 내용 */\nwindow.%s = %s;\n" % (name, var, json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    (D / f"{name}.js").write_text(text, encoding="utf8")
    print(f"{name}.js  {len(text) // 1024}KB")
