"""
규칙 기반 검증 (2026-11-20): 트레이더의 매매 규칙(sim.py 의 규칙 그대로)을 나중에 다른 종목에 적용해도 통하나
  1) 규칙마다 전체 종목에 그대로 돌려 매매를 만든다 (신호 날 종가 진입, sim.py 와 같은 손절 · 목표 · 보유일 · 청산 조건, 계획 위반 없음)
  2) 어느 달(m) 종목 5개에서 나온 결과 = 그 트레이더의 전략 성과
  3) 1 · 3 · 6개월 뒤(m+L) 같은 규칙을 다른 종목에 적용한 성과가, 원래 좋았을 때와 나빴을 때 달랐나
  수익률은 거래 비용을 빼고, 같은 기간 시장(전체 종목 평균) 수익률을 뺀 초과 수익률
  시장 상황: 시장 지수 60일 추세 (상승 > +4% · 하락 < -4% · 그 사이 횡보), 유형: 규칙의 보유일 중앙값 (단기 ≤5 · 스윙 ≤25 · 중장기)
실행: python rule_transfer.py <kr|kospi|kosdaq|us> [종목 수 상한]
"""
import os, sys, re, random, statistics as st
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "..", "..", "data"))
MARKET = (sys.argv[1] if len(sys.argv) > 1 else "kr").lower()
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 500
US = MARKET == "us"
KEEP = 950
COST = 0.001 if US else 0.0025  # 왕복 거래 비용 (국내 수수료 + 거래세)
SKIP = {"kiyoung", "kiyoung_old", "kiyoung_trend"}  # 밈 규칙은 뺌


def read_csv(path):
    out = []
    with open(path, encoding="utf-8") as f:
        next(f, None)
        for line in f:
            p = line.strip().split(",")
            if len(p) < 6:
                continue
            try:
                c = float(p[4])
            except ValueError:
                continue
            if c <= 0:
                continue
            out.append(dict(d=p[0], o=float(p[1]), h=float(p[2]), l=float(p[3]), c=c, v=float(p[5] or 0)))
    return out[-KEEP:]


def universe():
    d = os.path.join(DATA, "us_daily" if US else "daily")
    codes = [f[:-4] for f in os.listdir(d) if f.endswith(".csv")]
    if MARKET in ("kospi", "kosdaq"):
        with open(os.path.join(DATA, "listing.csv"), encoding="utf-8") as f:
            keep = {r.split(",")[0] for r in f.read().splitlines()[1:] if r.split(",")[2:3] == [MARKET.upper()]}
        codes = [c for c in codes if c in keep]
    bars, value = {}, {}
    for c in codes:
        b = read_csv(os.path.join(d, f"{c}.csv"))
        if len(b) < 500:
            continue
        bars[c] = b
        value[c] = st.median(x["c"] * x["v"] for x in b[-250:])
    top = sorted(bars, key=lambda c: -value[c])[:LIMIT]
    return {c: bars[c] for c in top}


# sim.py 의 지표 · 규칙 코드를 그대로 가져와 이 종목들로 실행
SRC = open(os.path.join(HERE, "sim.py"), encoding="utf-8").read()
CODE = SRC[SRC.index("# ── 지표 ──"): SRC.index("def simulate")]

NS = None


def init(bars):
    global NS
    ns = {"BARS": bars, "META": {c: {"market": "US" if US else "KR", "name": c} for c in bars}, "math": __import__("math"), "random": random}
    exec(CODE, ns)
    NS = ns


def run_rule(key):
    fn = NS["RULES"][key][0]
    BARS, IND, hs_top = NS["BARS"], NS["IND"], NS["hs_top"]
    trades = []
    for c, b in BARS.items():
        I = IND[c]
        i = 130
        while i < len(b) - 1:
            try:
                s = fn(c, i)
            except Exception:
                s = None
            if not s:
                i += 1
                continue
            bar = b[i]
            entry = bar["o"] if s.get("at") == "open" else (s["at"] if isinstance(s.get("at"), (int, float)) else bar["c"])
            stop = entry * 0.97 if key == "risk" else s["stop"]
            target = s.get("target", entry * 1.1)
            exit_k, exit_px = None, None
            if s.get("hold") == 0:
                exit_px = stop if bar["l"] <= stop else (target if bar["h"] >= target else bar["c"])
                exit_k = i
            days = 0
            k = i
            while exit_px is None and k < len(b) - 1:
                k += 1
                days += 1
                x = b[k]
                if s.get("exit_next_open"):
                    exit_px = x["o"]
                elif x["l"] <= stop:
                    exit_px = min(x["o"], stop)
                elif x["h"] >= target and not s.get("trail"):
                    exit_px = max(x["o"], target)
                elif key in ("ma", "risk", "trendbreak") and hs_top(c, k):
                    exit_px = x["c"]
                elif s.get("trail") and I[s["trail"]][k] and x["c"] < I[s["trail"]][k]:
                    exit_px = x["c"]
                elif s.get("exit_rsi") and I["rsi"][k] and I["rsi"][k] >= s["exit_rsi"]:
                    exit_px = x["c"]
                elif s.get("exit_macd") and I["macd"][k] < I["sig"][k]:
                    exit_px = x["c"]
                elif key == "bb" and I["ma20"][k] and x["h"] >= I["ma20"][k]:
                    exit_px = max(x["o"], I["ma20"][k])
                if exit_px is None and s.get("hold") is not None and days >= max(1, s["hold"]) and not s.get("trail"):
                    exit_px = x["c"]
                if exit_px is None and days >= 250:
                    exit_px = x["c"]
                exit_k = k
            if exit_px is None:
                break
            trades.append((c, b[i]["d"], b[exit_k]["d"], exit_px / entry - 1 - COST, exit_k - i))
            i = exit_k + 1
    return key, trades


def main():
    bars = universe()
    init(bars)
    keys = [k for k in NS["RULES"] if k not in SKIP]
    print(f"[{MARKET}] 종목 {len(bars)}개 · 규칙 {len(keys)}개", flush=True)
    with Pool(min(8, os.cpu_count() or 4), initializer=init, initargs=(bars,)) as pool:
        results = dict(pool.map(run_rule, keys))

    # 시장 지수 (전체 종목 하루 평균 수익률)
    cal = sorted({x["d"] for b in bars.values() for x in b})
    pos = {c: {x["d"]: k for k, x in enumerate(b)} for c, b in bars.items()}
    level, lv = {}, 1.0
    for j, d in enumerate(cal):
        if j:
            rs = []
            for c, b in bars.items():
                k = pos[c].get(d)
                if k and k > 0:
                    r = b[k]["c"] / b[k - 1]["c"] - 1
                    if abs(r) < 0.3:
                        rs.append(r)
            lv *= 1 + (sum(rs) / len(rs) if rs else 0)
        level[d] = lv
    ci = {d: j for j, d in enumerate(cal)}

    def regime(d):
        j = ci[d]
        if j < 60:
            return None
        t = level[d] / level[cal[j - 60]] - 1
        return "상승" if t > 0.04 else "하락" if t < -0.04 else "횡보"

    months = sorted({d[:7] for d in cal})
    month_start = {m: min(d for d in cal if d[:7] == m) for m in months}

    rows = []  # (type, regime_from, regime_to, lag, origin, target)
    rnd = random.Random(20261120)
    for key, tr in results.items():
        if len(tr) < 50:
            continue
        hold = st.median(t[4] for t in tr)
        typ = "단기" if hold <= 5 else "스윙" if hold <= 25 else "중장기"
        bym = {}
        for c, d0, d1, r, _ in tr:
            ex = r - (level[d1] / level[d0] - 1)
            bym.setdefault(d0[:7], []).append((c, ex))
        for mi, m in enumerate(months):
            src = bym.get(m, [])
            stocks = sorted({c for c, _ in src})
            if len(stocks) < 5:
                continue
            for _ in range(3):  # 트레이더 세 명(종목 5개씩)
                mine = set(rnd.sample(stocks, 5))
                origin = st.mean(e for c, e in src if c in mine)
                for L in (1, 3, 6):
                    if mi + L >= len(months):
                        continue
                    m2 = months[mi + L]
                    later = [e for c, e in bym.get(m2, []) if c not in mine]
                    if len(later) < 10:
                        continue
                    rf, rt = regime(month_start[m]), regime(month_start[m2])
                    if rf and rt:
                        rows.append((typ, rf, rt, L, origin, st.mean(later)))

    print(f"표본 {len(rows)}개 (규칙 · 달 · 트레이더 · 적용 시점)\n")
    def report(name, sel):
        if len(sel) < 40:
            return
        good = [t for o, t in sel if o > 0]
        bad = [t for o, t in sel if o <= 0]
        if len(good) < 10 or len(bad) < 10:
            return
        g, b_ = st.mean(good), st.mean(bad)
        se = (st.pvariance(good) / len(good) + st.pvariance(bad) / len(bad)) ** 0.5
        xs = [o for o, _ in sel]
        ys = [t for _, t in sel]
        mx, my = st.mean(xs), st.mean(ys)
        cov = sum((a - mx) * (c - my) for a, c in zip(xs, ys))
        den = (sum((a - mx) ** 2 for a in xs) * sum((c - my) ** 2 for c in ys)) ** 0.5 or 1
        print(f"  {name:14} n={len(sel):5}  상관 {cov / den:+.3f}  나중 성과: 원래 좋았을 때 {g * 100:+.2f}% · 나빴을 때 {b_ * 100:+.2f}% · 차이 {(g - b_) * 100:+.2f}%p (t={(g - b_) / (se or 1):+.1f})")
    for typ in ("단기", "스윙", "중장기"):
        print(f"■ {typ}")
        report("전체", [(o, t) for ty, rf, rt, L, o, t in rows if ty == typ])
        for rf in ("상승", "횡보", "하락"):
            report(f"{rf}장 → 같은 장", [(o, t) for ty, a, b, L, o, t in rows if ty == typ and a == rf and b == rf])
            report(f"{rf}장 → 다른 장", [(o, t) for ty, a, b, L, o, t in rows if ty == typ and a == rf and b != rf])
    # 규칙 자체가 늘 시장보다 나았나 (참고)
    print("\n규칙별 평균 초과 수익률 (전체 기간 · 모든 종목)")
    for key, tr in sorted(results.items(), key=lambda kv: -len(kv[1])):
        if len(tr) < 50:
            continue
        ex = [r - (level[d1] / level[d0] - 1) for c, d0, d1, r, _ in tr]
        print(f"  {key:12} 매매 {len(tr):6} · 보유 중앙 {st.median(t[4] for t in tr):4.0f}일 · 평균 초과 {st.mean(ex) * 100:+.2f}% · 이긴 비율 {sum(e > 0 for e in ex) / len(ex) * 100:.0f}%")


if __name__ == "__main__":
    main()
