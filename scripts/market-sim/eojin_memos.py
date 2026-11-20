"""
어진냥이 메모 문장 파일 만들기 / 반영하기
  python eojin_memos.py export   → data/market-sim-eojin/memos.tsv (한 줄에 메모 하나: id · 날짜 · 종류 · 종목 · 문장)
  python eojin_memos.py apply    → memos.tsv 에서 고친 문장을 data/market-sim/t42.json 에 다시 넣음 (숫자 · 선 · 매매는 그대로)
  문장만 고치는 파일. 숫자(수익률 · 가격)는 실제 일봉 계산값이라 문장 안 숫자를 바꾸면 기록과 어긋나니 주의
"""
import csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
DETAIL = os.path.join(ROOT, "data", "market-sim", "t42.json")
TSV = os.path.join(ROOT, "data", "market-sim-eojin", "memos.tsv")
KIND = {"trade": "매매 메모", "stock": "종목 노트", "market": "증시 메모", "review": "복기", "carry": "이어진 보유"}


def rows(detail):
    for m in detail["months"]:
        for k, t in enumerate(m["trades"]):
            yield f"{m['month']}:T{k}", t["entry"]["d"], "trade", t["code"], t["entry"], "why"
        for k, n in enumerate(m["notes"]):
            if n["type"] == "carry": continue
            yield f"{m['month']}:N{k}", n["d"], n["type"], n.get("code", ""), n, "text"


detail = json.load(open(DETAIL, encoding="utf-8"))
if sys.argv[1:] == ["export"]:
    with open(TSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["id", "날짜", "종류", "종목", "문장"])
        for rid, d, kind, code, obj, key in rows(detail):
            w.writerow([rid, d, KIND[kind], code, obj[key]])
    print("wrote", TSV)
elif sys.argv[1:] == ["apply"]:
    edits = {r["id"]: r["문장"] for r in csv.DictReader(open(TSV, encoding="utf-8-sig"), delimiter="\t")}
    n = 0
    for rid, d, kind, code, obj, key in rows(detail):
        if rid in edits and edits[rid] != obj[key]:
            obj[key] = edits[rid]; n += 1
    json.dump(detail, open(DETAIL, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("updated", n)
else:
    print(__doc__)
