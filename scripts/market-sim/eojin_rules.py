"""
어진냥이 2기 규칙 (sim.py 는 그대로, 여기서 새로 정의해 sim.py 이름공간의 RULES 에 더함)
  방법 1. 골든크로스: MACD(0선 아래 골든크로스, 기존 R_macd) · 이동평균(20일선 > 60일선, 기존 R_ma_cross) · 둘 중 먼저(OR)
  방법 2. 하락장 맥점: 나스닥(QQQ)이 하락 구간일 때만, 미리 그어 둔 핵심 지지(맥점)에 닿은 뒤 양봉으로 지지를 확인하면 산다
          맥점 후보: 직전 스윙 저점(수평선) · 120일선 · 200일선 · 피보나치 0.5~0.618
          손절 = 맥점 5% 아래, 목표 = 하락 시작점(직전 60일 고점)
"""
import eojin_lib as E

NS = E.NS
BARS, IND, px = NS["BARS"], NS["IND"], NS["px"]
sma = NS["sma"]

# 200일선 (sim.py 지표에 없음)
for code in BARS:
    IND[code]["ma200"] = sma(IND[code]["c"], 200)

# ── 시장 하락 구간 (QQQ): 60일 고점 대비 -10% 이하이거나, 20거래일 수익률 -5% 이하 ──
Q = BARS["QQQ"]
QC = [x["c"] for x in Q]
DOWN = {}
for k in range(len(Q)):
    hi60 = max(QC[max(0, k - 59): k + 1])
    r20 = QC[k] / QC[k - 20] - 1 if k >= 20 else 0
    DOWN[Q[k]["d"]] = QC[k] / hi60 - 1 <= -0.10 or r20 <= -0.05
NS["MARKET_DOWN"] = DOWN

def market_down_spans():
    """하락 구간을 이어진 날짜 묶음으로 (시작, 끝, QQQ 고점 대비 최저)"""
    spans, cur = [], None
    for k, x in enumerate(Q):
        if DOWN[x["d"]]:
            if cur is None: cur = [x["d"], x["d"], 0.0]
            cur[1] = x["d"]
            hi60 = max(QC[max(0, k - 59): k + 1])
            cur[2] = min(cur[2], QC[k] / hi60 - 1)
        elif cur:
            spans.append(tuple(cur)); cur = None
    if cur: spans.append(tuple(cur))
    return spans

def _confirm(b, i, level):
    """맥점에 닿은 뒤(저가가 맥점 1% 안까지) 양봉으로 맥점 위 마감"""
    return b[i]["l"] <= level * 1.01 and b[i]["c"] > level and b[i]["c"] > b[i]["o"]

def _mak_signal(code, i, level, label, lines, why):
    b = BARS[code]
    hi60 = max(x["h"] for x in b[max(0, i - 60): i])
    if hi60 <= b[i]["c"] * 1.03: return None  # 되돌아갈 자리가 거의 없으면 안 삼
    return dict(why=why, stop=level * 0.95, target=hi60, hold=40, lines=lines, method="맥점")

def R_mak_swing(code, i):
    if not DOWN.get(BARS[code][i]["d"]): return None
    b = BARS[code]
    lows = [k for k in NS["swing_lows"](b, i, look=120, w=5) if k < i - 10]
    if not lows: return None
    k = lows[-1]; level = b[k]["l"]
    if not _confirm(b, i, level): return None
    lines = [dict(kind="hline", label="맥점: 직전 스윙 저점", a=[b[k]["d"], px(code, level)], b=[b[i]["d"], px(code, level)])]
    return _mak_signal(code, i, level, "swing", lines, f"시장 하락 구간, 직전 스윙 저점 맥점 {px(code, level):,}에 닿은 뒤 양봉 지지")

def _ma_mak(key, label):
    def R(code, i):
        if not DOWN.get(BARS[code][i]["d"]): return None
        b, I = BARS[code], IND[code]
        level = I[key][i]
        if not level or not _confirm(b, i, level): return None
        lines = [dict(kind="hline", label=f"맥점: {label}", a=[b[max(0, i - 30)]["d"], px(code, level)], b=[b[i]["d"], px(code, level)])]
        return _mak_signal(code, i, level, key, lines, f"시장 하락 구간, {label} 맥점 {px(code, level):,}에 닿은 뒤 양봉 지지")
    return R
R_mak_ma120 = _ma_mak("ma120", "120일선")
R_mak_ma200 = _ma_mak("ma200", "200일선")

FIB = NS["FIB"]
def R_mak_fib(code, i):
    if not DOWN.get(BARS[code][i]["d"]): return None
    b = BARS[code]
    if i < 130: return None
    lo_k = min(range(i - 120, i - 15), key=lambda k: b[k]["l"])
    hi_k = max(range(lo_k + 1, i - 3), key=lambda k: b[k]["h"], default=None)
    if hi_k is None: return None
    L, H = b[lo_k]["l"], b[hi_k]["h"]
    if H / L < 1.2: return None
    l50, l618 = H - 0.5 * (H - L), H - 0.618 * (H - L)
    if not (b[i]["l"] <= l50 * 1.01 and b[i]["c"] > l618 and b[i]["c"] > b[i]["o"]): return None
    lines = [dict(kind="trend", label="스윙 저점→고점", a=[b[lo_k]["d"], px(code, L)], b=[b[hi_k]["d"], px(code, H)])]
    for f in FIB:
        v = H - f * (H - L)
        lines.append(dict(kind="hline", label=f"피보나치 {f:g}", a=[b[hi_k]["d"], px(code, v)], b=[b[i]["d"], px(code, v)]))
    return dict(why=f"시장 하락 구간, 피보나치 0.5~0.618 맥점 ({px(code, l618):,}~{px(code, l50):,})에서 양봉 지지", stop=l618 * 0.95, target=H, hold=40, lines=lines, method="맥점")

R_macd, R_ma_cross = NS["R_macd"], NS["R_ma_cross"]
def tag(fn, method):
    def R(code, i):
        s = fn(code, i)
        if s: s = dict(s, method=method)
        return s
    return R
def first_of(*fns):
    def R(code, i):
        for f in fns:
            s = f(code, i)
            if s: return s
    return R

GC = {"macd": tag(R_macd, "골든크로스"), "ma": tag(R_ma_cross, "골든크로스"), "or": first_of(tag(R_ma_cross, "골든크로스"), tag(R_macd, "골든크로스"))}
MAK = {"swing": R_mak_swing, "ma120": R_mak_ma120, "ma200": R_mak_ma200, "fib": R_mak_fib}

def register(key, fn, name, desc):
    NS["RULES"][key] = (fn, name, desc)
    return key

def combo(gc, mak):
    """방법 1 + 방법 2: 시장 하락 구간엔 맥점이 먼저, 아니면 골든크로스"""
    fns = ([MAK[mak]] if mak else []) + ([GC[gc]] if gc else [])
    return register(f"eojin:{gc}:{mak}", first_of(*fns), "반등 자리 매수", "골든크로스 · 하락장 맥점")

# ── 하락장 맥점 = TQQQ (사용자 결정 11/20: 트럼프 관세 · 엔캐리 청산 같은 시장 급락 때 TQQQ 를 맥점에서 산다) ──
#   맥점은 나스닥100(QQQ) 차트에 긋고(지수의 핵심 지지), 사는 건 TQQQ. QQQ 가 맥점에 닿은 뒤 양봉으로 지지하면 그날 TQQQ 종가에 매수
#   손절: QQQ 가 맥점 3% 아래로 마감하면(TQQQ 로는 약 -9%) → TQQQ 진입가 × 0.91
#   목표: QQQ 가 하락 시작점(직전 60일 고점)으로 돌아가는 만큼의 3배
QB, QI = BARS["QQQ"], IND["QQQ"]
QIDX = {x["d"]: k for k, x in enumerate(QB)}

def _qqq_level(kind, k):
    """QQQ 맥점 가격과 그은 선 (QQQ 기준)"""
    if kind == "ma200":
        v = QI["ma200"][k]
        return (v, [dict(kind="hline", label="맥점: 나스닥100 200일선", a=[QB[max(0, k - 30)]["d"], round(v, 2)], b=[QB[k]["d"], round(v, 2)])]) if v else None
    if kind == "ma120":
        v = QI["ma120"][k]
        return (v, [dict(kind="hline", label="맥점: 나스닥100 120일선", a=[QB[max(0, k - 30)]["d"], round(v, 2)], b=[QB[k]["d"], round(v, 2)])]) if v else None
    if kind == "fib":
        if k < 260: return None
        lo_k = min(range(k - 250, k - 20), key=lambda j: QB[j]["l"])
        hi_k = max(range(lo_k + 1, k - 3), key=lambda j: QB[j]["h"], default=None)
        if hi_k is None: return None
        L, H = QB[lo_k]["l"], QB[hi_k]["h"]
        if H / L < 1.15: return None
        v = H - 0.5 * (H - L)
        lines = [dict(kind="trend", label="나스닥100 저점→고점", a=[QB[lo_k]["d"], round(L, 2)], b=[QB[hi_k]["d"], round(H, 2)])]
        for f in FIB:
            lines.append(dict(kind="hline", label=f"피보나치 {f:g}", a=[QB[hi_k]["d"], round(H - f * (H - L), 2)], b=[QB[k]["d"], round(H - f * (H - L), 2)]))
        return (v, lines, H - 0.618 * (H - L))
    if kind == "swing":
        lows = [j for j in NS["swing_lows"](QB, k, look=250, w=10) if j < k - 20]
        if not lows: return None
        j = min(lows, key=lambda j: QB[j]["l"]) if False else lows[-1]
        v = QB[j]["l"]
        return (v, [dict(kind="hline", label="맥점: 나스닥100 직전 스윙 저점", a=[QB[j]["d"], round(v, 2)], b=[QB[k]["d"], round(v, 2)])])
    return None

def tqqq_mak(kind):
    def R(code, i):
        if code != "TQQQ": return None
        d = BARS["TQQQ"][i]["d"]
        if not DOWN.get(d): return None
        k = QIDX[d]; q = QB[k]
        lv = _qqq_level(kind, k)
        if not lv: return None
        level, lines = lv[0], lv[1]
        lower = lv[2] if len(lv) > 2 else level * 0.97
        # QQQ 가 맥점(피보나치는 0.5~0.618 구간)에 닿고 양봉으로 맥점 위 마감
        if not (q["l"] <= level * 1.01 and q["c"] > lower and q["c"] > q["o"]): return None
        hi60 = max(x["h"] for x in QB[max(0, k - 60): k])
        up = hi60 / q["c"] - 1
        if up < 0.03: return None
        t = BARS["TQQQ"][i]["c"]
        return dict(why=f"나스닥100 급락 구간, 지수 맥점 {level:,.2f}에서 양봉 지지 → TQQQ 매수 (QQQ 고점까지 {up * 100:.1f}%)",
                    stop=t * 0.91, target=t * (1 + 3 * up), hold=40, lines=lines, method="맥점", qqq=True)
    return R

def combo_tqqq(gc, mak):
    fns = [tqqq_mak(mak)] if mak else []
    if gc: fns.append(lambda c, i, f=GC[gc]: None if c == "TQQQ" else f(c, i))
    return register(f"eojin:{gc}:tqqq-{mak}", first_of(*fns), "반등 자리 매수", "골든크로스 · 하락장 TQQQ 맥점")
