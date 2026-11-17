"""국가 사고도구어 교수학습 카드 PDF → data/national_cards.json

PDF 는 어휘 하나당 4쪽(확인·짐작·이해·확장)이 반복되는 구조다.
글자 크기·색·위치로 각 요소를 가려낸다 (PyMuPDF 필요).

사용:  python tools/extract_national.py <PDF 경로> [출력 JSON]
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz  # PyMuPDF

STAGES = ["확인", "짐작", "이해", "확장"]
BLUE = 0x5778D9
WHITE = 0xFFFFFF
GRAY = 0xA9A9A9
PINK = 0xFF82C9


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = s.replace("\x07", "").replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def spans_of(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            for sp in ln["spans"]:
                t = sp["text"].replace("\x07", "")
                if t.strip() == "":
                    continue
                out.append({
                    "t": t, "size": round(sp["size"], 1), "color": sp["color"],
                    "bold": "7Bold" in sp["font"],
                    "x0": sp["bbox"][0], "y0": sp["bbox"][1], "y1": sp["bbox"][3],
                    "x1": sp["bbox"][2],
                })
    return out


PARTICLE = re.compile(r"^(은|는|이|가|을|를|의|에|와|과|도|로|으로|만|에서|에게|보다|까지|부터|처럼|이다|인|한|해|하여|된|되|적|스럽|들)")


def render(spans, mark=False):
    """한 줄의 span 들을 이어 붙인다. span 사이의 가로 틈이 벌어져 있으면 띄어쓰기를 복원한다
    (PDF 가 낱말 단위로 글을 쪼개 두어 공백 문자가 빠져 있다)."""
    out, prev = [], None
    for sp in spans:
        t = sp["t"]
        is_t = mark and (sp["color"] == BLUE or sp["bold"])
        core = t.strip()
        if prev is not None:
            gap = sp["x0"] - prev["x1"]
            need = gap > 0.12 * sp["size"]
            prev_marked = mark and (prev["color"] == BLUE or prev["bold"])
            if need and prev_marked and not is_t and PARTICLE.match(t.strip()):
                need = False  # 강조 낱말 바로 뒤의 조사는 붙여 쓴다
            if need and not (out and out[-1].endswith(" ")) and not t.startswith(" "):
                out.append(" ")
        out.append("{{" + core + "}}" + (" " if t.endswith(" ") else "") if is_t else t)
        prev = sp
    txt = "".join(out)
    return norm(txt).replace("}} {{", " ").replace("}}{{", "")


def lines_of(spans):
    """같은 줄(y 가 거의 같은) span 을 x 순으로 묶어 줄 목록으로."""
    spans = sorted(spans, key=lambda s: (round(s["y0"] / 8), s["x0"]))
    lines, cur, cur_y = [], [], None
    for s in spans:
        if cur_y is None or abs(s["y0"] - cur_y) <= 8:
            cur.append(s)
            cur_y = s["y0"] if cur_y is None else cur_y
        else:
            lines.append(cur)
            cur, cur_y = [s], s["y0"]
    if cur:
        lines.append(cur)
    return [sorted(l, key=lambda s: s["x0"]) for l in lines]


def join_marked(spans, mark_blue=True):
    """글줄을 이어 붙이되 파란색/굵은 목표 낱말을 {{ }} 로 표시."""
    return render(spans, mark=mark_blue)


def parse_confirm(page):
    sp = [s for s in spans_of(page) if s["color"] != WHITE and not is_decor(s)]
    head = [s for s in sp if s["size"] >= 90 and s["color"] == BLUE]
    ctx = [s for s in sp if s not in head]
    headword = norm("".join(s["t"] for s in head))
    lines = lines_of(ctx)
    text = " ".join(join_marked(l) for l in lines)
    targets = re.findall(r"\{\{(.+?)\}\}", text)
    return headword, norm(text), targets


def parse_guess(page):
    sp = [s for s in spans_of(page) if s["color"] != WHITE and not is_decor(s)]
    # 세 칸(왼쪽·가운데·오른쪽)으로 나뉘는 쪽지: x 위치로 묶는다.
    cols = {}
    for s in sp:
        cx = (s["x0"] + s["x1"]) / 2
        key = 0 if cx < 427 else (1 if cx < 853 else 2)
        cols.setdefault(key, []).append(s)
    clues = []
    for k in sorted(cols):
        txt = " ".join(join_marked(l, mark_blue=False) for l in lines_of(cols[k]))
        clues.append(norm(txt))
    return clues


def is_decor(s):
    return s["color"] == PINK or s["t"].strip().lower() == "vs"


def split_by_gap(lines):
    """줄 목록을 가장 큰 세로 틈에서 위/아래로 나눈다 (뜻풀이 / 예문)."""
    if len(lines) < 2:
        return lines, []
    gaps = [(lines[i + 1][0]["y0"] - lines[i][0]["y0"], i) for i in range(len(lines) - 1)]
    g, i = max(gaps)
    return lines[: i + 1], lines[i + 1:]


def parse_understand(page):
    sp = [s for s in spans_of(page) if s["color"] != WHITE and not is_decor(s)]
    head = [s for s in sp if s["color"] == BLUE and s["size"] >= 60]
    body = [s for s in sp if s not in head]
    headword = norm("".join(s["t"] for s in head))
    lines = lines_of(body)
    d_lines, e_lines = split_by_gap(lines)
    definition = norm(" ".join(render(l) for l in d_lines))
    example = " ".join(join_marked(l) for l in e_lines)
    return headword, definition, norm(example)


def is_gray_color(c):
    r, g, b = (c >> 16) & 255, (c >> 8) & 255, c & 255
    return abs(r - g) < 6 and abs(g - b) < 6 and r >= 0x90 and r < 0xF0


def parse_expand(page):
    spans = spans_of(page)
    stem = norm("".join(s["t"] for s in spans if s["color"] == WHITE and s["size"] > 40))
    body = [s for s in spans if not (s["color"] == WHITE)]
    # 오른쪽 열(x≥350)의 항목들. 위에서 아래로 훑는다.
    lines = lines_of(sorted(body, key=lambda s: s["y0"]))
    items, cur = [], None
    for l in lines:
        is_gray = all(is_gray_color(s["color"]) for s in l)
        text = join_marked(l, mark_blue=True)
        if is_gray:
            if cur is None:
                continue
            cur["_gray"].append(render(l))
            continue
        m = re.match(r"^\[(.+?)\]\s*(.*)$", text)
        if m:
            cur = {"type": m.group(1), "_sent": [m.group(2)], "_gray": []}
            items.append(cur)
        elif cur is not None and not cur["_gray"]:
            cur["_sent"].append(text)
        elif cur is not None:
            # 회색 설명 뒤에 또 보통 줄이 오면 이어 붙임(드문 경우)
            cur["_gray"].append(render(l))
    out = []
    for it in items:
        sent = norm(" ".join(it["_sent"]))
        targets = re.findall(r"\{\{(.+?)\}\}", sent)
        gray = norm(" ".join(it["_gray"]))
        word, _, meaning = gray.partition(":")
        out.append({
            "type": it["type"],
            "sentence": sent,
            "target": targets[0] if targets else "",
            "word": norm(word) if meaning else "",
            "definition": norm(meaning) if meaning else gray,
        })
    return stem, out


def main():
    pdf = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "data" / "national_cards.json"
    doc = fitz.open(pdf)
    if len(doc) % 4:
        raise SystemExit(f"쪽수 {len(doc)} 가 4의 배수가 아님")
    cards, problems, notes = [], [], []
    for i in range(0, len(doc), 4):
        n = i // 4 + 1
        pgs = [doc[i + k] for k in range(4)]
        for k, st in enumerate(STAGES):
            lab = [s["t"] for s in spans_of(pgs[k]) if s["color"] == WHITE and s["size"] == 29.0]
            if st not in norm("".join(lab)):
                problems.append((n, f"{k+1}번째 쪽 단계 이름이 {st} 가 아님: {lab}"))
        h1, ctx, targets = parse_confirm(pgs[0])
        clues = parse_guess(pgs[1])
        h3, definition, example = parse_understand(pgs[2])
        stem, items = parse_expand(pgs[3])
        if h1 != h3:
            problems.append((n, f"확인/이해 표제어 불일치 {h1!r} vs {h3!r}"))
        if len(clues) != 3:
            problems.append((n, f"짐작 단서 {len(clues)}개"))
        if not definition:
            problems.append((n, "뜻풀이 비어 있음"))
        if not example:
            problems.append((n, "예문 비어 있음"))
        if not items:
            problems.append((n, "확장 항목 없음"))
        for it in items:
            if not it["definition"]:
                notes.append((n, f"확장 항목에 설명이 없음(원본에도 없음): {it['type']} {it['target']}"))
        cards.append({
            "card_no": n,
            "headword": h3 or h1,
            "pdf_pages": [i + 1, i + 4],
            "confirm": {"text": ctx, "targets": targets},
            "guess": clues,
            "understand": {"definition": definition, "example": example},
            "expand": {"stem": stem, "items": items},
        })
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(cards, ensure_ascii=False, indent=1), encoding="utf8")
    print(f"카드 {len(cards)}장 → {dst}")
    print(f"문제 {len(problems)}건 / 참고 {len(notes)}건")
    for n, m in notes:
        print(f"  (참고) #{n}: {m}")
    for n, m in problems[:60]:
        print(f"  #{n}: {m}")


if __name__ == "__main__":
    main()
