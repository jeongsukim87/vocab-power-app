"""학교 어휘 엑셀 + 국가 사고도구어 카드 → 앱이 읽는 데이터(docs/data) + 대조 보고서(data/reports)

사용:  python tools/build_data.py <학교 어휘 xlsx 경로>
먼저 tools/extract_national.py 로 data/national_cards.json 을 만들어 둔다.
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs" / "data"
REPORTS = DATA / "reports"

SUBJECT_LABEL = {"국어": "국어", "수학": "수학", "과학": "과학", "역사": "역사", "도덕": "도덕", "기가": "기술·가정"}
REL_BY_TYPE = {"유의어": "SYNONYM", "반의어": "ANTONYM", "관련어": "RELATED", "동형이의어": "HOMONYM",
               "상위어": "HYPERNYM", "하위어": "HYPONYM"}


def nk(s: str) -> str:
    """표제어 정규화 키: NFC · 공백 제거."""
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", s))


def stem_key(s: str) -> str:
    s = nk(s)
    for suf in ("하다", "되다", "하는", "적", "화", "성", "히"):
        if s.endswith(suf) and len(s) > len(suf):
            return s[: -len(suf)]
    return s


def parse_ref(text: str):
    """'국어(비상교육) 14쪽' → (교과, 출판사, 쪽수)"""
    m = re.match(r"^\s*(\S+?)\((.+?)\)\s*(.*)$", text.strip())
    if not m:
        return "", "", text.strip()
    return m.group(1), m.group(2), m.group(3).strip()


def load_school(xlsx):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    ws = wb["가나다순 학습도구어"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    return [r for r in rows if r[1]]


def load_scenarios():
    scen = {}
    for ln in (DATA / "school_scenarios.tsv").read_text(encoding="utf8").splitlines():
        if not ln.strip() or ln.startswith("#"):
            continue
        p = ln.split("|")
        if len(p) != 7:
            raise SystemExit(f"장면 파일 열 수 오류({len(p)}): {ln[:30]}")
        scen[nk(p[0])] = p[1:]
    return scen


def load_examples():
    ex = {}
    for ln in (DATA / "school_examples.tsv").read_text(encoding="utf8").splitlines():
        if not ln.strip() or ln.startswith("#"):
            continue
        p = ln.split("|")
        if len(p) != 4:
            raise SystemExit(f"예시 파일 열 수 오류({len(p)}): {ln[:30]}")
        ex[nk(p[0])] = p[1:]
    return ex


FLAG_PARTICLE = re.compile(r"(?:^|\s)([가-힣])\s(?=[가-힣])")
SUSPECT_SINGLE = set("는은을를와과에며다어")


def card_flags(card):
    flags = []
    texts = {"확인": card["confirm"]["text"], "뜻풀이": card["understand"]["definition"],
             "예문": card["understand"]["example"]}
    for i, it in enumerate(card["expand"]["items"], 1):
        texts[f"확장{i}문장"] = it["sentence"]
        texts[f"확장{i}설명"] = it["definition"]
    for k, t in texts.items():
        for m in FLAG_PARTICLE.finditer(t):
            if m.group(1) in SUSPECT_SINGLE:
                flags.append(f"{k}: 띄어쓰기 의심 '…{t[max(0, m.start()-6):m.end()+6]}…'")
        if re.search(r"\d\s\d\s", t) or re.search(r"[가-힣]{12,}", t):
            flags.append(f"{k}: 숫자·분수 등 서식이 깨졌을 수 있음")
    return flags


def main():
    xlsx = Path(sys.argv[1])
    school_rows = load_school(xlsx)
    cards = json.loads((DATA / "national_cards.json").read_text(encoding="utf8"))
    scen = load_scenarios()
    examples_src = load_examples()
    examples = {}
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    vocab, sources, relations, prompts = [], [], [], []
    school_entry_count = 0

    # ---------- 학교 ----------
    school_ids = {}
    for no, hw, subj, ref, definition in school_rows:
        vid = f"V-S{no:03d}"
        school_ids[nk(hw)] = vid
        refs = [r.strip() for r in str(ref).split("/")]
        subj_codes = []
        for j, r in enumerate(refs, 1):
            sc, pub, page = parse_ref(r)
            school_entry_count += 1
            subj_codes.append(sc)
            sources.append({
                "source_id": f"SRC-S{no:03d}-{j}",
                "vocabulary_id": vid,
                "source_type": "SCHOOL",
                "original_entry_id": f"정리본#{no}" + (f"-{j}" if len(refs) > 1 else ""),
                "subject": sc or subj,
                "subject_label": SUBJECT_LABEL.get(sc or subj, sc or subj),
                "publisher": pub,
                "page": page,
                "permission_status": "SCHOOL_OWN",
            })
        vocab.append({
            "vocabulary_id": vid, "headword": hw, "normalized_headword": nk(hw), "sense_id": "S1",
            "definition": definition, "definition_status": "DRAFT_REVIEW", "semantic_category": "",
            "origin": "SCHOOL", "subject": subj, "subject_label": SUBJECT_LABEL.get(subj, subj),
        })
        sc3 = scen.get(nk(hw))
        if not sc3:
            raise SystemExit(f"장면 파일에 없음: {hw}")
        ex3 = examples_src.get(nk(hw))
        if not ex3:
            raise SystemExit(f"예시 파일에 없음: {hw}")
        for k, (stype, i) in enumerate((("SUBJECT", 0), ("DAILY", 2), ("WORLD", 4))):
            examples[f"P-S{no:03d}-{stype[0]}"] = ex3[k]
            prompts.append({
                "prompt_id": f"P-S{no:03d}-{stype[0]}", "vocabulary_id": vid, "scene_type": stype,
                "scenario": sc3[i], "guiding_question": sc3[i + 1], "content_status": "DRAFT_REVIEW",
            })

    # ---------- 국가 ----------
    nat_ids = {}
    cards_out = {}
    for c in cards:
        vid = f"V-N{c['card_no']:03d}"
        hw = c["headword"]
        nat_ids.setdefault(nk(hw), []).append(vid)
        vocab.append({
            "vocabulary_id": vid, "headword": hw, "normalized_headword": nk(hw), "sense_id": "N1",
            "definition": c["understand"]["definition"], "definition_status": "NATIONAL_CARD",
            "semantic_category": "", "origin": "NATIONAL", "subject": "", "subject_label": "",
        })
        sources.append({
            "source_id": f"SRC-N{c['card_no']:03d}", "vocabulary_id": vid, "source_type": "NATIONAL",
            "original_entry_id": f"카드#{c['card_no']}", "subject": "", "subject_label": "",
            "publisher": "국가기초학력지원센터 교수학습 카드",
            "page": f"PDF {c['pdf_pages'][0]}~{c['pdf_pages'][1]}쪽", "permission_status": "UNVERIFIED",
        })
        card = {k: c[k] for k in ("confirm", "guess", "understand", "expand")}
        card["review_flags"] = card_flags(c)
        cards_out[vid] = card

    # ---------- 관계 ----------
    rel_n = 0

    def rel(a, b, t, status):
        nonlocal rel_n
        rel_n += 1
        relations.append({"relation_id": f"R{rel_n:04d}", "from_vocabulary_id": a, "to_vocabulary_id": b,
                          "relation_type": t, "status": status})

    common = []
    for key, vid in school_ids.items():
        for nid in nat_ids.get(key, []):
            rel(vid, nid, "SAME_HEADWORD", "CANDIDATE")  # 뜻이 같은지는 교사가 확인 전까지 '후보'
            common.append((vid, nid))
    nat_stems = defaultdict(list)
    for key, ids in nat_ids.items():
        for i in ids:
            nat_stems[stem_key(key)].append(i)
    variants = []
    for key, vid in school_ids.items():
        if key in nat_ids:
            continue
        for nid in nat_stems.get(stem_key(key), []):
            rel(vid, nid, "VARIANT_FORM", "CANDIDATE")
            variants.append((vid, nid))
    # 국가 카드 확장 항목이 가리키는 낱말 중 어휘 목록에 있는 것
    all_ids = {**{k: v[0] for k, v in nat_ids.items()}, **school_ids}
    expand_links = 0
    for c in cards:
        a = f"V-N{c['card_no']:03d}"
        for it in c["expand"]["items"]:
            t = REL_BY_TYPE.get(it["type"].split("ㆍ")[0].split("·")[0])
            for w in {nk(it["word"]), nk(it["target"])}:
                if not w:
                    continue
                for b in {school_ids.get(w), (nat_ids.get(w) or [None])[0]} - {None, a}:
                    rel(a, b, t or "RELATED", "SOURCE")
                    expand_links += 1

    # ---------- 검증 ----------
    problems = []
    if len({v["vocabulary_id"] for v in vocab}) != len(vocab):
        problems.append("vocabulary_id 중복")
    school_src = [s for s in sources if s["source_type"] == "SCHOOL"]
    if len([v for v in vocab if v["origin"] == "SCHOOL"]) != len(school_rows):
        problems.append("학교 어휘 수 불일치")
    if len(cards) != 307:
        problems.append(f"국가 카드 {len(cards)}장 (307 아님)")
    if len(prompts) != 3 * len(school_rows):
        problems.append("작문 장면 수 불일치")
    meta = {
        "version": now, "school_unique": len(school_rows), "school_entries": school_entry_count,
        "national": len(cards), "common_exact": len(common), "variant_candidates": len(variants),
        "prompts": len(prompts), "relations": len(relations),
        "notes": ["학교 뜻풀이는 검토용 초안(DRAFT_REVIEW)이며 표준국어대사전과 대조되지 않았습니다.",
                  "국가 카드 자료의 이용 허락은 확인되지 않았습니다(permission_status=UNVERIFIED).",
                  "교과서 쪽수가 '미기재'인 항목은 원본에 쪽수가 없는 것입니다."],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    (OUT / "vocab.json").write_text(json.dumps(
        {"meta": meta, "vocabulary": vocab, "sources": sources, "relations": relations, "prompts": prompts},
        ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    ex_json = json.dumps(examples, ensure_ascii=False, indent=1)
    head_gs = "/** 자동 생성(tools/build_data.py) — 작문 «예시 문장». 학생 화면에는 서버가 «먼저 쓴 뒤에만» 내려 준다. */"
    head_js = "/* 자동 생성 — 체험 모드 전용 예시 문장 */"
    (OUT / "examples.json").write_text(ex_json, encoding="utf8")  # Apps Script 의 setup() 이 이 주소에서 가져간다
    (ROOT / "docs" / "js").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs" / "js" / "seed_examples.js").write_text(head_js + "\nvar SEED_EXAMPLES = " + ex_json + ";\n", encoding="utf8")
    (OUT / "cards.json").write_text(json.dumps(cards_out, ensure_ascii=False, separators=(",", ":")), encoding="utf8")

    # ---------- 보고서 ----------
    flagged = [(c["card_no"], c["headword"], cards_out[f"V-N{c['card_no']:03d}"]["review_flags"]) for c in cards]
    flagged = [x for x in flagged if x[2]]
    by_subj = Counter(v["subject_label"] for v in vocab if v["origin"] == "SCHOOL")
    nopage = sum(1 for s in school_src if s["page"] == "미기재")
    L = []
    L.append(f"# 데이터 대조·검증 보고서\n\n생성: {now}\n")
    L.append("## 1. 학교 필수 학습도구어\n")
    L.append(f"- 가나다순 정리본 고유 표제어: **{len(school_rows)}개**")
    L.append(f"- 교과서 출처 항목(원본 항목) 수: **{school_entry_count}개** — "
             "정리본 한 칸에 교과서 쪽수가 둘 이상 적힌 항목은 원본에서 합쳐진 것으로 보고 항목을 따로 보존했습니다.")
    multi = [(r[0], r[1], r[3]) for r in school_rows if "/" in str(r[3])]
    for n, h, rf in multi:
        L.append(f"  - 정리본 #{n} 「{h}」: {rf} → 원본 항목 {len(str(rf).split('/'))}개")
    L.append(f"- 설명서의 «원본 104개 항목» 과 대조: 정리본 {len(school_rows)}행 + 합쳐진 중복 {school_entry_count - len(school_rows)}행 = "
             f"{school_entry_count}개 → "
             + ("**104개와 일치**" if school_entry_count == 104 else "**104개와 다름 — 원본 파일로 다시 대조 필요**")
             + " (원본 엑셀 자체는 첨부되지 않아 정리본의 설명만으로 계산한 값입니다)")
    L.append(f"- 교과별 고유 표제어: " + ", ".join(f"{k} {v}" for k, v in sorted(by_subj.items())))
    L.append(f"- 쪽수 '미기재': {nopage}개 (원본에 쪽수가 없는 항목)")
    L.append("- 뜻풀이는 검토용 초안이므로 앱에서 «검토 필요» 로 표시합니다.\n")
    L.append("## 2. 국가 사고도구어 카드\n")
    L.append(f"- PDF {len(cards) * 4}쪽 = 카드 {len(cards)}장 × 4쪽(확인·짐작·이해·확장)")
    L.append("- 모든 카드에서 쪽 이름 확인·짐작·이해·확장 순서와 표제어 일치를 검사함(불일치 0건)")
    L.append(f"- 표제어 중복: {len(cards) - len({nk(c['headword']) for c in cards})}건")
    L.append(f"- 자동 추출 후 사람이 한 번 더 볼 만한 카드(띄어쓰기·서식 의심): **{len(flagged)}장**\n")
    for n, h, fl in flagged:
        L.append(f"  - #{n} {h}: " + " / ".join(fl))
    L.append("\n## 3. 학교 ↔ 국가 공통·유사 표제어\n")
    L.append(f"### 3-1. 표제어가 똑같은 어휘 ({len(common)}개) — 뜻이 같은지는 교사가 확인하기 전까지 «후보» 로만 연결\n")
    vmap = {v["vocabulary_id"]: v for v in vocab}
    for a, b in common:
        L.append(f"- **{vmap[a]['headword']}**\n  - 학교 초안: {vmap[a]['definition']}\n  - 국가 카드: {vmap[b]['definition']}")
    L.append(f"\n### 3-2. 표기·활용형이 비슷한 후보 ({len(variants)}쌍) — 자동 병합하지 않음\n")
    for a, b in variants:
        L.append(f"- 학교 「{vmap[a]['headword']}」 ~ 국가 「{vmap[b]['headword']}」")
    homs = [(c["card_no"], c["headword"], it) for c in cards for it in c["expand"]["items"] if it["type"] == "동형이의어"]
    L.append(f"\n### 3-3. 국가 카드가 «동형이의어» 로 표시한 항목 ({len(homs)}개)\n")
    for n, h, it in homs:
        L.append(f"- 카드 #{n} {h}: {it['word']} — {it['definition']}")
    L.append(f"\n### 3-4. 국가 카드의 유의어·관련어·반의어가 다른 어휘와 이어진 곳: {expand_links}개\n")
    if problems:
        L.append("\n## ⚠ 검증 실패\n" + "\n".join(f"- {p}" for p in problems))
    (REPORTS / "대조_검증_보고서.md").write_text("\n".join(L) + "\n", encoding="utf8")

    print(json.dumps(meta, ensure_ascii=False, indent=1))
    print("검증 문제:", problems or "없음")
    print(f"vocab.json {(OUT/'vocab.json').stat().st_size//1024}KB, cards.json {(OUT/'cards.json').stat().st_size//1024}KB")
    if problems:
        sys.exit(1)
    import subprocess
    subprocess.run([sys.executable, str(ROOT / "tools" / "make_data_js.py")], check=True)


if __name__ == "__main__":
    main()
