"""
데모 판매자 9명용 일봉 만들기 (2026-11-20): Trackkit_prac/data 의 일봉 CSV(국내 daily · 미국 us_daily, 수정주가) → sim.py 형식
  data/market-sim-demo/KR/{code}.json · US/{code}.json · _meta.json  ([YYYYMMDD, 시가, 고가, 저가, 종가, 거래량])
  국내 시장 기준(KRMKT) = 아래 국내 종목 동일 비중 바스켓 (지수 파일이 없어서). 미국 시장 기준 = SPY
  python demo_candles.py
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
DATA = os.path.join(ROOT, "..", "data")
OUT = os.path.join(ROOT, "data", "market-sim-demo")
FROM = "2022-06-01"

KR = {
    "005930": "삼성전자", "000660": "SK하이닉스", "042700": "한미반도체", "000990": "DB하이텍", "058470": "리노공업",
    "373220": "LG에너지솔루션", "086520": "에코프로", "247540": "에코프로비엠", "003670": "포스코퓨처엠", "006400": "삼성SDI",
    "068270": "셀트리온", "196170": "알테오젠", "028300": "HLB", "207940": "삼성바이오로직스", "000100": "유한양행",
    "005380": "현대차", "000270": "기아", "012330": "현대모비스", "204320": "HL만도",
    "012450": "한화에어로스페이스", "329180": "HD현대중공업", "079550": "LIG넥스원", "064350": "현대로템", "042660": "한화오션",
    "105560": "KB금융", "055550": "신한지주", "086790": "하나금융지주", "316140": "우리금융지주", "138040": "메리츠금융지주",
    "035420": "NAVER", "035720": "카카오", "259960": "크래프톤", "036570": "엔씨소프트",
}
US = {"AAPL": "애플", "MSFT": "마이크로소프트", "GOOGL": "알파벳", "AMZN": "아마존", "META": "메타",
      "LLY": "일라이릴리", "UNH": "유나이티드헬스", "JNJ": "존슨앤드존슨", "ABBV": "애브비", "MRK": "머크", "SPY": "S&P500 ETF"}


def read(path, integer):
    rows = []
    for r in csv.DictReader(open(path, encoding="utf-8")):
        if r["Date"] < FROM: continue
        o, h, l, c, v = (float(r[k]) for k in ("Open", "High", "Low", "Close", "Volume"))
        if c <= 0: continue
        f = (lambda x: int(round(x))) if integer else (lambda x: round(x, 4))
        rows.append([r["Date"].replace("-", ""), f(o or c), f(h or c), f(l or c), f(c), int(v)])
    return rows


for mk, names, src, integer in (("KR", KR, "daily", True), ("US", US, "us_daily", False)):
    d = os.path.join(OUT, mk)
    os.makedirs(d, exist_ok=True)
    meta = {}
    for code, name in names.items():
        rows = read(os.path.join(DATA, src, f"{code}.csv"), integer)
        json.dump(rows, open(os.path.join(d, f"{code}.json"), "w"))
        meta[code] = dict(name=name, market=mk, n=len(rows), **{"from": rows[0][0], "to": rows[-1][0]})
    if mk == "KR":
        # 동일 비중 바스켓 (전일 대비 등락의 평균을 이어 붙임, 시작 1000)
        series = {c: {r[0]: r for r in json.load(open(os.path.join(d, f"{c}.json")))} for c in names}
        days = sorted({day for s in series.values() for day in s})
        lvl, prev, out = 1000.0, {}, []
        for day in days:
            rets = [series[c][day][4] / prev[c] - 1 for c in names if day in series[c] and c in prev]
            r = sum(rets) / len(rets) if rets else 0.0
            o = lvl
            lvl *= 1 + r
            out.append([day, round(o, 2), round(max(o, lvl) * 1.003, 2), round(min(o, lvl) * 0.997, 2), round(lvl, 2), 0])
            for c in names:
                if day in series[c]: prev[c] = series[c][day][4]
        json.dump(out, open(os.path.join(d, "KRMKT.json"), "w"))
        meta["KRMKT"] = dict(name="국내 대형주 바스켓", market="KR", n=len(out), **{"from": out[0][0], "to": out[-1][0]})
    json.dump(meta, open(os.path.join(d, "_meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(mk, len(meta), "files")
