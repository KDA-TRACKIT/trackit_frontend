"""
전략 쇼핑 더미 데이터: 실제 일봉(키움)에 트레이더별 매매 규칙을 그대로 돌려
  - 매매(진입·청산 날짜·가격·이유, 계획대로 했는지), 차트에 그은 선, 월별 수익률 · 최대 낙폭 · 이행률을 만든다
  - 수익률은 실제 가격으로 계산 (수수료·세금 포함), 가짜 숫자 없음
출력
  summary.json        → app/marketplace/sim.json (화면 목록·상세 숫자)
  traders/{id}.json   → public/market-sim/{id}.json (월별 전략 내용: 규칙 · 매매 · 선 · 그 달 차트)
"""
import json, math, os, sys, random
from datetime import date

CANDLES, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, "traders"), exist_ok=True)
META = json.load(open(os.path.join(CANDLES, "_meta.json"), encoding="utf-8"))

def load(code):
    rows = json.load(open(os.path.join(CANDLES, f"{code}.json")))
    return [dict(d=f"{r[0][:4]}-{r[0][4:6]}-{r[0][6:]}", o=r[1], h=r[2], l=r[3], c=r[4], v=r[5]) for r in rows]

BARS = {code: load(code) for code in META}
KR_POOL = [c for c in META if META[c]["market"] == "KR"]
US_POOL = [c for c in META if META[c]["market"] == "US"]
MONTHS = []
y, m = 2024, 12
for _ in range(24):
    MONTHS.append(f"{y}-{m:02d}")
    m += 1
    if m > 12: y, m = y + 1, 1
START = MONTHS[0] + "-01"

# ── 지표 ──
def sma(xs, n):
    out, s = [None] * len(xs), 0.0
    for i, x in enumerate(xs):
        s += x
        if i >= n: s -= xs[i - n]
        if i >= n - 1: out[i] = s / n
    return out

def rsi(xs, n=14):
    out = [None] * len(xs); g = l = 0.0
    for i in range(1, len(xs)):
        d = xs[i] - xs[i - 1]
        up, dn = max(d, 0), max(-d, 0)
        if i <= n:
            g += up; l += dn
            if i == n: g /= n; l /= n; out[i] = 100 - 100 / (1 + g / l) if l else 100
        else:
            g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n
            out[i] = 100 - 100 / (1 + g / l) if l else 100
    return out

def ema(xs, n):
    out, k, e = [None] * len(xs), 2 / (n + 1), None
    for i, x in enumerate(xs):
        e = x if e is None else x * k + e * (1 - k)
        out[i] = e
    return out

def stdev(xs, n):
    out = [None] * len(xs)
    for i in range(n - 1, len(xs)):
        w = xs[i - n + 1:i + 1]; mu = sum(w) / n
        out[i] = math.sqrt(sum((x - mu) ** 2 for x in w) / n)
    return out

def ind(code):
    b = BARS[code]; c = [x["c"] for x in b]; v = [x["v"] for x in b]
    macd = [a - s for a, s in zip(ema(c, 12), ema(c, 26))]
    sig = ema(macd, 9)
    sd = stdev(c, 20); m20 = sma(c, 20)
    return dict(c=c, ma5=sma(c, 5), ma10=sma(c, 10), ma20=m20, ma60=sma(c, 60), ma120=sma(c, 120), rsi=rsi(c), v20=sma(v, 20),
                macd=macd, sig=sig, bbu=[m + 2 * s if m and s else None for m, s in zip(m20, sd)], bbl=[m - 2 * s if m and s else None for m, s in zip(m20, sd)])

IND = {code: ind(code) for code in BARS}

def r2(x): return round(x, 2)
def px(code, x): return round(x, 2) if META[code]["market"] == "US" else int(round(x))

# ── 규칙: 신호를 보고 (진입 근거, 손절, 목표, 최대 보유일, 그은 선) 을 돌려준다 ──
#   entry 는 신호가 난 날 종가로 (계획을 장 마감 뒤 잠그고 다음 날 아침이 아니라, 신호 날 종가 근처 체결로 단순화)
def swing_lows(b, i, look=40, w=3):
    out = []
    for k in range(max(w, i - look), i - w):
        if all(b[k]["l"] <= b[j]["l"] for j in range(k - w, k + w + 1)): out.append(k)
    return out

def swing_highs(b, i, look=30, w=2):
    out = []
    for k in range(max(w, i - look), i - w + 1):
        if all(b[k]["h"] >= b[j]["h"] for j in range(k - w, min(len(b), k + w + 1))): out.append(k)
    return out

def R_support(code, i):  # 지지선 반등 (차트메이트)
    b, I = BARS[code], IND[code]
    if i < 25: return None
    sup = min(x["l"] for x in b[i - 20:i - 2])
    k = min(range(i - 20, i - 2), key=lambda j: b[j]["l"])
    if b[i]["l"] <= sup * 1.012 and b[i]["c"] > b[i]["o"] and b[i]["c"] > sup:
        return dict(why=f"20일 지지선 {px(code, sup):,} 근처에서 양봉 반등", stop=sup * 0.97, target=b[i]["c"] * 1.06, hold=5,
                    lines=[dict(kind="hline", label="지지선", a=[b[k]["d"], px(code, sup)], b=[b[i]["d"], px(code, sup)])])

def R_volume_trend(code, i):  # 거래량 터진 추세 (파동노트 · 코스닥러너)
    b, I = BARS[code], IND[code]
    if not I["ma20"][i] or not I["v20"][i - 1]: return None
    if b[i]["v"] > 2.2 * I["v20"][i - 1] and b[i]["c"] > b[i - 1]["c"] * 1.03 and b[i]["c"] > I["ma20"][i]:
        return dict(why=f"거래량 평소의 {b[i]['v'] / I['v20'][i - 1]:.1f}배 · 20일선 위 장대 양봉", stop=b[i]["l"], target=b[i]["c"] * 1.12, hold=8,
                    lines=[dict(kind="hline", label="장대양봉 저점(손절)", a=[b[i - 3]["d"], px(code, b[i]["l"])], b=[b[i]["d"], px(code, b[i]["l"])])])

def R_pullback(code, i):  # 눌림목 (원트로그)
    I, b = IND[code], BARS[code]
    m20, m60 = I["ma20"][i], I["ma60"][i]
    if not m60: return None
    if m20 > m60 and I["ma20"][i] > I["ma20"][i - 5] and b[i]["l"] <= m20 * 1.01 and b[i]["c"] > m20 and b[i - 1]["c"] < b[i - 3]["c"]:
        return dict(why="정배열(20일선 > 60일선)에서 20일선까지 눌린 뒤 지지", stop=m20 * 0.96, target=b[i]["c"] * 1.08, hold=10, lines=[ma_line(code, i, "ma20", "20일선")])

def ma_line(code, i, key, label, back=30):
    b, I = BARS[code], IND[code]
    pts = [[b[k]["d"], px(code, I[key][k])] for k in range(max(0, i - back), i + 1) if I[key][k]]
    return dict(kind="poly", label=label, points=pts)

def R_ma_cross(code, i):  # 이동평균 골든크로스 (모멘텀랩 · 리스크제로)
    I, b = IND[code], BARS[code]
    if not I["ma60"][i - 1]: return None
    if I["ma20"][i - 1] <= I["ma60"][i - 1] and I["ma20"][i] > I["ma60"][i] and b[i]["c"] > I["ma20"][i]:
        return dict(why="20일선이 60일선을 위로 뚫음 (골든크로스)", stop=b[i]["c"] * 0.93, target=b[i]["c"] * 1.25, hold=40, trail="ma20",
                    lines=[ma_line(code, i, "ma20", "20일선"), ma_line(code, i, "ma60", "60일선")])

def R_box(code, i):  # 박스권 돌파 (트렌드픽)
    b, I = BARS[code], IND[code]
    if i < 25 or not I["v20"][i - 1]: return None
    top = max(x["h"] for x in b[i - 20:i]); bot = min(x["l"] for x in b[i - 20:i])
    if (top - bot) / bot < 0.18 and b[i]["c"] > top and b[i]["v"] > 1.5 * I["v20"][i - 1]:
        return dict(why=f"20일 박스({px(code, bot):,}~{px(code, top):,}) 상단 거래량 돌파", stop=top * 0.97, target=b[i]["c"] * 1.15, hold=15,
                    lines=[dict(kind="hline", label="박스 상단", a=[b[i - 20]["d"], px(code, top)], b=[b[i]["d"], px(code, top)]),
                           dict(kind="hline", label="박스 하단", a=[b[i - 20]["d"], px(code, bot)], b=[b[i]["d"], px(code, bot)])])

def R_rsi(code, i, lo=30):  # RSI 과매도 (시그널맵 · 바닥탐험가)
    I, b = IND[code], BARS[code]
    r0, r1 = I["rsi"][i - 1], I["rsi"][i]
    if r0 and r1 and r0 < lo <= r1:
        return dict(why=f"RSI {r0:.0f} → {r1:.0f}, 과매도({lo}) 탈출", stop=min(x["l"] for x in b[i - 5:i + 1]) * 0.98, target=b[i]["c"] * 1.10, hold=12, exit_rsi=60,
                    lines=[dict(kind="hline", label="최근 저점(손절 기준)", a=[b[i - 5]["d"], px(code, min(x['l'] for x in b[i - 5:i + 1]))], b=[b[i]["d"], px(code, min(x['l'] for x in b[i - 5:i + 1]))])])

def R_rsi_deep(code, i): return R_rsi(code, i, 25)

def R_value(code, i):  # 낙폭 과대 가치 (밸류버스)
    I, b = IND[code], BARS[code]
    if not I["ma120"][i] or not I["rsi"][i]: return None
    if b[i]["c"] < I["ma120"][i] * 0.85 and I["rsi"][i] < 40 and b[i]["c"] > b[i]["o"]:
        return dict(why=f"120일선보다 {100 - b[i]['c'] / I['ma120'][i] * 100:.0f}% 아래 · RSI {I['rsi'][i]:.0f}", stop=b[i]["c"] * 0.88, target=b[i]["c"] * 1.2, hold=60,
                    lines=[ma_line(code, i, "ma120", "120일선", 60)])

def R_engulf(code, i):  # 상승 장악형 캔들 (캔들로그)
    b, I = BARS[code], IND[code]
    p, t = b[i - 1], b[i]
    if not I["ma20"][i]: return None
    if p["c"] < p["o"] and t["c"] > t["o"] and t["o"] <= p["c"] and t["c"] >= p["o"] and abs(t["l"] - I["ma20"][i]) / I["ma20"][i] < 0.03:
        return dict(why="20일선 근처 상승 장악형 캔들", stop=min(p["l"], t["l"]) * 0.99, target=t["c"] * 1.06, hold=5,
                    lines=[dict(kind="hline", label="장악형 저점", a=[p["d"], px(code, min(p['l'], t['l']))], b=[t["d"], px(code, min(p['l'], t['l']))])])

def R_bb(code, i):  # 볼린저 하단 복귀 (볼밴헌터)
    I, b = IND[code], BARS[code]
    if not I["bbl"][i - 1]: return None
    if b[i - 1]["c"] < I["bbl"][i - 1] and b[i]["c"] > I["bbl"][i]:
        return dict(why="볼린저 밴드 하단 밖에서 안으로 복귀", stop=b[i - 1]["l"] * 0.98, target=I["ma20"][i], hold=10,
                    lines=[ma_line(code, i, "bbl", "밴드 하단", 25), ma_line(code, i, "ma20", "밴드 중심", 25), ma_line(code, i, "bbu", "밴드 상단", 25)])

def R_gap(code, i):  # 갭 상승 (갭업클럽) — 그날 종가 청산
    b = BARS[code]
    if b[i]["o"] > b[i - 1]["h"] * 1.02 and b[i]["v"] > 0:
        return dict(why=f"전일 고가보다 {b[i]['o'] / b[i - 1]['h'] * 100 - 100:.1f}% 갭 상승 출발", at="open", stop=b[i]["o"] * 0.97, target=b[i]["o"] * 1.05, hold=0,
                    lines=[dict(kind="hline", label="전일 고가", a=[b[i - 1]["d"], px(code, b[i - 1]['h'])], b=[b[i]["d"], px(code, b[i - 1]['h'])])])

def R_weekly(code, i):  # 주봉 추세선 (스윙도크): 오르는 저점 두 개를 이은 선에서 반등
    b = BARS[code]
    lows = swing_lows(b, i, 60, 4)
    if len(lows) < 2: return None
    k1, k2 = lows[-2], lows[-1]
    if b[k2]["l"] <= b[k1]["l"] or i - k2 < 5: return None
    slope = (b[k2]["l"] - b[k1]["l"]) / (k2 - k1)
    line = b[k2]["l"] + slope * (i - k2)
    if b[i]["l"] <= line * 1.015 and b[i]["c"] > line and b[i]["c"] > b[i]["o"]:
        return dict(why="오르는 저점 두 개를 이은 추세선에서 반등", stop=line * 0.96, target=b[i]["c"] * 1.12, hold=20,
                    lines=[dict(kind="ray", label="상승 추세선(반직선)", a=[b[k1]["d"], px(code, b[k1]['l'])], b=[b[k2]["d"], px(code, b[k2]['l'])])])

def R_trend_break(code, i):  # 나스닥워커: 50일 신고가 + 20일선 위
    b, I = BARS[code], IND[code]
    if i < 55 or not I["ma20"][i]: return None
    hi = max(x["h"] for x in b[i - 50:i])
    if b[i]["c"] > hi and I["ma20"][i] > I["ma20"][i - 10]:
        return dict(why="50일 신고가 돌파 · 20일선 우상향", stop=b[i]["c"] * 0.92, target=b[i]["c"] * 1.3, hold=40, trail="ma20",
                    lines=[dict(kind="hline", label="50일 고점", a=[b[i - 50]["d"], px(code, hi)], b=[b[i]["d"], px(code, hi)]), ma_line(code, i, "ma20", "20일선")])

def R_vbo(code, i):  # 변동성 돌파 (다음 날 시가 청산)
    b = BARS[code]
    rng = b[i - 1]["h"] - b[i - 1]["l"]; trig = b[i]["o"] + 0.5 * rng
    if b[i]["h"] > trig and rng > 0:
        return dict(why=f"시가 + 전일 변동폭 × 0.5 = {px(code, trig):,} 돌파", at=trig, stop=trig * 0.97, target=trig * 1.08, hold=1, exit_next_open=True,
                    lines=[dict(kind="hline", label="돌파 기준가", a=[b[i - 1]["d"], px(code, trig)], b=[b[i]["d"], px(code, trig)])])

def R_macd(code, i):
    I, b = IND[code], BARS[code]
    if I["macd"][i - 1] <= I["sig"][i - 1] and I["macd"][i] > I["sig"][i] and I["macd"][i] < 0:
        return dict(why="0선 아래 MACD 골든크로스", stop=b[i]["c"] * 0.94, target=b[i]["c"] * 1.12, hold=15, exit_macd=True, lines=[])  # MACD 는 가격 위가 아니라 아래 보조지표 창에

# ── 기영이 머리 밈: 오른 뒤 30일쯤 뾰족뾰족 옆으로 기는 구간(= 기영이 머리카락) 밑에 기영이 얼굴을 그려 넣고,
#    기영이가 손을 들어 빛의 검을 뽑는 날(= 머리 위로 종가 돌파)에 산다 ──
HAIR_W = 30
def hair_at(code, k1):
    """k1 까지 30봉이 기영이 머리인지: 폭 5~20% 박스 · 뾰족한 꼭지 5개 이상 · 그 전에 8% 넘게 오름"""
    b = BARS[code]
    k0 = k1 - HAIR_W + 1
    if k0 < 70: return None
    top = max(x["h"] for x in b[k0:k1 + 1]); bot = min(x["l"] for x in b[k0:k1 + 1])
    mean = sum(x["c"] for x in b[k0:k1 + 1]) / HAIR_W
    if not (0.05 <= (top - bot) / mean <= 0.20): return None
    spikes = [k for k in range(k0 + 2, k1 - 1) if b[k]["h"] >= max(b[j]["h"] for j in range(k - 2, k + 3))]
    if len(spikes) < 5: return None
    if b[k0]["c"] < 1.08 * min(x["l"] for x in b[k0 - 60:k0]): return None
    return dict(k0=k0, k1=k1, top=top, bot=bot, spikes=len(spikes))

def face_doodle(code, hr, arm_k=None):
    """기영이 얼굴 손그림 (머리카락 = 실제 봉). 점 = [날짜, 봉 사이 위치(0~), 가격]. arm_k 가 있으면 손 들고 빛의 검"""
    b = BARS[code]
    k0, k1, top, bot = hr["k0"], hr["k1"], hr["top"], hr["bot"]
    h = top - bot
    cx = (k0 + k1) / 2
    a = (k1 - k0) * 0.46
    y0 = bot - 0.04 * h
    fh = 2.0 * h  # 얼굴 세로 (머리 높이의 2배 — 너무 납작하지 않게)
    def P(u, v):
        k = cx + u * a
        base = max(0, min(len(b) - 1, math.floor(k)))
        return [b[base]["d"], round(k - base, 3), px(code, y0 - v * fh)]
    def P2(k, price):
        base = max(0, min(len(b) - 1, math.floor(k)))
        return [b[base]["d"], round(k - base, 3), px(code, price)]
    def ell(cu, cv, ru, rv, n=18):
        return [P(cu + ru * math.cos(t * 2 * math.pi / n), cv + rv * math.sin(t * 2 * math.pi / n)) for t in range(n + 1)]
    strokes = []
    # 얼굴 테두리: 머리카락 끝에서 내려와 둥근 턱
    face = [P(1, 0)] + [P(1.0, 0.25)] + [P(math.cos(t * math.pi / 16), 0.5 + 0.5 * math.sin(t * math.pi / 16)) for t in range(17)] + [P(-1.0, 0.25), P(-1, 0)]
    strokes.append(face)
    # 귀
    strokes.append([P(-1, 0.3), P(-1.16, 0.28), P(-1.22, 0.4), P(-1.14, 0.53), P(-1, 0.52)])
    strokes.append([P(1, 0.3), P(1.16, 0.28), P(1.22, 0.4), P(1.14, 0.53), P(1, 0.52)])
    # 눈 · 눈동자 · 눈썹
    for s_ in (-1, 1):
        strokes.append(ell(0.38 * s_, 0.38, 0.17, 0.1))
        strokes.append(ell(0.38 * s_, 0.4, 0.06, 0.045, 10))
        strokes.append([P(0.58 * s_, 0.21), P(0.38 * s_, 0.18), P(0.2 * s_, 0.21)])
    # 코 · 웃는 입 · 주근깨
    strokes.append([P(0.03, 0.5), P(-0.07, 0.6), P(0.05, 0.62)])
    strokes.append([P(-0.28 + 0.56 * t / 10, 0.76 + 0.07 * (1 - ((t - 5) / 5) ** 2)) for t in range(11)])
    for fu, fv in ((-0.55, 0.55), (-0.62, 0.6), (0.55, 0.55), (0.62, 0.6)):
        strokes.append(ell(fu, fv, 0.012, 0.012, 6))
    # 목 · 어깨 · T 셔츠
    strokes.append([P(-0.22, 0.99), P(-0.24, 1.1), P(-0.95, 1.22), P(-1.05, 1.55)])
    strokes.append([P(0.22, 0.99), P(0.24, 1.1), P(0.95, 1.22), P(1.05, 1.55)])
    strokes.append([P(-0.3, 1.24), P(0.3, 1.24)])
    strokes.append([P(0, 1.24), P(0, 1.52)])
    if arm_k is not None:
        # 손 들고 빛의 검 (돌파한 봉 위로 번개처럼)
        hand = top + 0.15 * h
        strokes.append([P(0.95, 1.22), P2(arm_k - 0.6, bot - 0.2 * h), P2(arm_k, hand)])
        zig = [P2(arm_k, hand)]
        for z in range(1, 7):
            zig.append(P2(arm_k + (0.9 if z % 2 else -0.5), hand + z * 0.28 * h))
        strokes.append(zig)
    return dict(kind="doodle", label="기영이 (손그림)" + (" · 빛의 검" if arm_k is not None else ""), strokes=strokes)

def R_kiyoung(code, i):
    """기영이 머리 밈 매매: 머리(30일 뾰족 박스) 위로 종가 돌파 = 기영이가 손 들고 빛의 검"""
    b = BARS[code]
    hr = hair_at(code, i - 1)
    if not hr or not (b[i - 1]["c"] <= hr["top"] < b[i]["c"]): return None
    h = hr["top"] - hr["bot"]
    return dict(why=f"기영이 머리(30일 · 뾰족 꼭지 {hr['spikes']}개 · 폭 {h / hr['bot'] * 100:.0f}%) 위로 종가 돌파 — 기영이가 손 들고 빛의 검", stop=max(hr["bot"], b[i]["c"] * 0.92),
                target=hr["top"] + 1.5 * h, hold=25,
                lines=[face_doodle(code, hr, arm_k=i), dict(kind="hline", label="기영이 머리 꼭대기(돌파선)", a=[b[hr["k0"]]["d"], px(code, hr["top"])], b=[b[i]["d"], px(code, hr["top"])])])

def R_kiyoung_old(code, i):
    b = BARS[code]
    for k in range(i - 1, max(100, i - 40), -1):
        ky = kiyoung_head(code, k)
        if not ky: continue
        hit = min(x["l"] for x in b[k:i + 1]) <= ky["target"]
        if hit and b[i]["c"] > b[i]["o"] and b[i]["c"] > b[i - 1]["h"]:
            return dict(why=f"기영이 머리 목표 {px(code, ky['target']):,}까지 빠진 뒤 첫 반등 양봉 (다시 삼)", stop=min(x["l"] for x in b[k:i + 1]) * 0.97, target=ky["neck"](i), hold=30,
                        kiyoung=True, lines=ky["lines"])
        break
    return R_kiyoung_trend(code, i)

def R_kiyoung_trend(code, i):  # 기영이 머리: 추세 위에서 보유하다 뾰족한 봉우리 3개 + 직전 저점 이탈이면 정리
    I, b = IND[code], BARS[code]
    if not I["ma60"][i]: return None
    if I["ma20"][i] > I["ma60"][i] and b[i - 1]["c"] < I["ma20"][i - 1] < b[i]["c"]:
        return dict(why="정배열에서 20일선 회복 (기영이 머리 나오기 전까지 보유)", stop=b[i]["c"] * 0.9, target=b[i]["c"] * 1.4, hold=60, kiyoung=True,
                    lines=[ma_line(code, i, "ma20", "20일선")])

# ── 작도 매매: 채널 · 피보나치 · 엘리어트 파동 (선을 실제로 그은 위치에서 진입) ──
def R_channel(code, i, n=40):
    """최근 40일 종가 회귀선 + 고가·저가 끝을 지나는 평행선 = 상승 채널. 하단선 터치 후 양봉이면 진입, 상단선 목표"""
    b = BARS[code]
    if i < n + 1: return None
    xs = list(range(i - n, i)); ys = [b[k]["c"] for k in xs]
    mx, my = sum(xs) / n, sum(ys) / n
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    icpt = my - slope * mx
    reg = lambda k: icpt + slope * k
    up = max(b[k]["h"] - reg(k) for k in xs); dn = min(b[k]["l"] - reg(k) for k in xs)
    if slope <= 0 or (up - dn) / reg(i) > 0.25: return None  # 오르는 채널 · 너무 넓으면 안 씀
    lo_i, hi_i = reg(i) + dn, reg(i) + up
    if b[i]["l"] <= lo_i * 1.01 and b[i]["c"] > lo_i and b[i]["c"] > b[i]["o"]:
        s0 = i - n
        return dict(why=f"상승 채널 하단 {px(code, lo_i):,} 지지 (채널 폭 {(up - dn) / reg(i) * 100:.0f}%)", stop=lo_i * 0.97, target=hi_i, hold=15,
                    lines=[dict(kind="trend", label="채널 상단", a=[b[s0]["d"], px(code, reg(s0) + up)], b=[b[i]["d"], px(code, hi_i)]),
                           dict(kind="trend", label="채널 하단", a=[b[s0]["d"], px(code, reg(s0) + dn)], b=[b[i]["d"], px(code, lo_i)])])

FIB = [0, 0.382, 0.5, 0.618, 0.786, 1]
def R_fib(code, i):
    """60일 안 스윙 저점 → 고점(15% 넘게 오름)의 되돌림 0.5~0.618 구간에서 양봉 지지면 진입. 0.786 이탈 손절, 고점 재도전 목표"""
    b = BARS[code]
    if i < 65: return None
    lo_k = min(range(i - 60, i - 8), key=lambda k: b[k]["l"])
    hi_k = max(range(lo_k + 1, i - 3), key=lambda k: b[k]["h"], default=None)
    if hi_k is None: return None
    L, H = b[lo_k]["l"], b[hi_k]["h"]
    if H / L < 1.15 or min(x["l"] for x in b[hi_k + 1:i]) < H - 0.786 * (H - L): return None
    l50, l618 = H - 0.5 * (H - L), H - 0.618 * (H - L)
    if b[i]["l"] <= l50 and b[i]["c"] > l618 and b[i]["c"] > b[i]["o"]:
        lines = [dict(kind="trend", label="스윙 저점→고점", a=[b[lo_k]["d"], px(code, L)], b=[b[hi_k]["d"], px(code, H)])]
        for f in FIB:
            v = H - f * (H - L)
            lines.append(dict(kind="hline", label=f"피보나치 {f:g}", a=[b[hi_k]["d"], px(code, v)], b=[b[i]["d"], px(code, v)]))
        return dict(why=f"피보나치 되돌림 0.5~0.618 ({px(code, l618):,}~{px(code, l50):,}) 지지", stop=(H - 0.786 * (H - L)) * 0.99, target=H, hold=20, lines=lines)

def zigzag(b, start, end, th):
    """종가 기준 지그재그: th 만큼 반대로 움직여야 꼭지가 확정. [(k, 가격, 'H'|'L', 확정된 날)]"""
    piv, trend = [], None
    ext_k = start
    for k in range(start + 1, end + 1):
        c = b[k]["c"]
        if trend is None:
            if c >= b[ext_k]["c"] * (1 + th): piv.append((ext_k, b[ext_k]["l"], "L", k)); trend, ext_k = "up", k
            elif c <= b[ext_k]["c"] * (1 - th): piv.append((ext_k, b[ext_k]["h"], "H", k)); trend, ext_k = "down", k
            continue
        if trend == "up":
            if c > b[ext_k]["c"]: ext_k = k
            elif c <= b[ext_k]["c"] * (1 - th): piv.append((ext_k, b[ext_k]["h"], "H", k)); trend, ext_k = "down", k
        else:
            if c < b[ext_k]["c"]: ext_k = k
            elif c >= b[ext_k]["c"] * (1 + th): piv.append((ext_k, b[ext_k]["l"], "L", k)); trend, ext_k = "up", k
    return piv

def R_elliott(code, i):
    """지그재그 꼭지 0(저)-1(고)-2(저)-3(고)-4(저)가 엘리어트 규칙에 맞고, 4파 저점이 오늘 확정되면 5파 진입
       규칙: 2파는 1파의 38~79% 되돌림 · 3파가 1파보다 길고 1파 고점 위 · 4파 저점은 1파 고점 위(겹치지 않음)"""
    b = BARS[code]
    if i < 130: return None
    piv = zigzag(b, i - 130, i, 0.07)
    if len(piv) < 5 or piv[-1][2] != "L" or piv[-1][3] != i: return None
    p0, p1, p2, p3, p4 = piv[-5:]
    if [p[2] for p in (p0, p1, p2, p3, p4)] != ["L", "H", "L", "H", "L"]: return None
    w1 = p1[1] - p0[1]; w3 = p3[1] - p2[1]
    retr2 = (p1[1] - p2[1]) / w1 if w1 > 0 else 0
    if not (0.38 <= retr2 <= 0.79 and w3 > w1 and p3[1] > p1[1] and p4[1] > p1[1] and p2[1] > p0[1]): return None
    target = p4[1] + w1  # 5파 = 1파 길이
    pts = [[b[p[0]]["d"], px(code, p[1]), lab] for p, lab in zip((p0, p1, p2, p3, p4), ("0", "1", "2", "3", "4"))]
    return dict(why=f"엘리어트 4파 저점 {px(code, p4[1]):,} 확정 → 5파 진입 (목표 5파 = 1파 길이)", stop=p4[1] * 0.97, target=target, hold=30,
                lines=[dict(kind="wave", label="엘리어트 파동", points=pts),
                       dict(kind="hline", label="1파 고점(4파 하한)", a=[b[p1[0]]["d"], px(code, p1[1])], b=[b[i]["d"], px(code, p1[1])]),
                       dict(kind="hline", label="5파 목표", a=[b[p4[0]]["d"], px(code, target)], b=[b[i]["d"], px(code, target)])])

# ── 차트 패턴 매매 (꼭지 = 지그재그 확정 꼭지, 진입 = 돌파한 날 종가) ──
#   목표는 측정 이동(measured move): 패턴 높이를 돌파 지점에서 그만큼 더함. 손절은 패턴 안쪽 마지막 저점 아래
def pt(code, k, v, lab, hl):
    return [BARS[code][k]["d"], px(code, v), lab, hl]

def line_at(k1, v1, k2, v2, k):
    return v1 + (v2 - v1) / (k2 - k1) * (k - k1) if k2 != k1 else v1

def R_ihs(code, i):
    """역헤드앤숄더: 저(왼쪽 어깨)-고-저(머리, 양 어깨보다 3% 넘게 낮음)-고-저(오른쪽 어깨, 왼쪽과 10% 안) 뒤 넥라인 종가 돌파"""
    b = BARS[code]
    if i < 130: return None
    piv = zigzag(b, i - 130, i, 0.05)
    if len(piv) < 5: return None
    ls, h1, hd, h2, rs = piv[-5:]
    if [x[2] for x in (ls, h1, hd, h2, rs)] != ["L", "H", "L", "H", "L"] or i - rs[0] > 25: return None
    if not (hd[1] < ls[1] * 0.97 and hd[1] < rs[1] * 0.97 and abs(ls[1] - rs[1]) / max(ls[1], rs[1]) < 0.1): return None
    neck = lambda k: line_at(h1[0], h1[1], h2[0], h2[1], k)
    if not (b[i - 1]["c"] <= neck(i - 1) and b[i]["c"] > neck(i)): return None
    depth = neck(hd[0]) - hd[1]
    return dict(why=f"역헤드앤숄더 넥라인 {px(code, neck(i)):,} 종가 돌파 (머리 깊이 {depth / neck(hd[0]) * 100:.0f}%)", stop=rs[1] * 0.98, target=neck(i) + depth, hold=30,
                lines=[dict(kind="pattern", label="역헤드앤숄더", points=[pt(code, ls[0], ls[1], "왼쪽 어깨", "L"), pt(code, h1[0], h1[1], "", "H"), pt(code, hd[0], hd[1], "머리", "L"), pt(code, h2[0], h2[1], "", "H"), pt(code, rs[0], rs[1], "오른쪽 어깨", "L")]),
                       dict(kind="ray", label="넥라인", a=[b[h1[0]]["d"], px(code, h1[1])], b=[b[h2[0]]["d"], px(code, h2[1])]),
                       dict(kind="hline", label="목표(머리 깊이만큼)", a=[b[i]["d"], px(code, neck(i) + depth)], b=[b[min(i + 1, len(b) - 1)]["d"], px(code, neck(i) + depth)])])

def hs_top(code, i):
    """헤드앤숄더(천장): 고(왼쪽 어깨)-저-고(머리)-저-고(오른쪽 어깨) 뒤 넥라인 종가 이탈 → 보유 정리 신호. (꼭지들, 넥라인 함수)"""
    b = BARS[code]
    if i < 130: return None
    piv = zigzag(b, i - 130, i, 0.05)
    if len(piv) < 5: return None
    ls, l1, hd, l2, rs = piv[-5:]
    if [x[2] for x in (ls, l1, hd, l2, rs)] != ["H", "L", "H", "L", "H"] or i - rs[0] > 25: return None
    if not (hd[1] > ls[1] * 1.03 and hd[1] > rs[1] * 1.03 and abs(ls[1] - rs[1]) / max(ls[1], rs[1]) < 0.1): return None
    neck = lambda k: line_at(l1[0], l1[1], l2[0], l2[1], k)
    if not (b[i - 1]["c"] >= neck(i - 1) and b[i]["c"] < neck(i)): return None
    return (ls, l1, hd, l2, rs), neck

def hs_lines(code, piv, neck, i):
    ls, l1, hd, l2, rs = piv
    b = BARS[code]
    return [dict(kind="pattern", label="헤드앤숄더", points=[pt(code, ls[0], ls[1], "왼쪽 어깨", "H"), pt(code, l1[0], l1[1], "", "L"), pt(code, hd[0], hd[1], "머리", "H"), pt(code, l2[0], l2[1], "", "L"), pt(code, rs[0], rs[1], "오른쪽 어깨", "H")]),
            dict(kind="ray", label="넥라인", a=[b[l1[0]]["d"], px(code, l1[1])], b=[b[l2[0]]["d"], px(code, l2[1])])]

def R_dbottom(code, i):
    """쌍바닥(W): 저-고-저(첫 바닥과 4% 안, 10일 넘게 떨어짐) 뒤 가운데 고점 종가 돌파"""
    b = BARS[code]
    if i < 100: return None
    piv = zigzag(b, i - 100, i, 0.05)
    if len(piv) < 3: return None
    l1, h1, l2 = piv[-3:]
    if [x[2] for x in (l1, h1, l2)] != ["L", "H", "L"] or i - l2[0] > 25: return None
    if not (abs(l2[1] - l1[1]) / l1[1] < 0.04 and l2[0] - l1[0] >= 10): return None
    if not (b[i - 1]["c"] <= h1[1] < b[i]["c"]): return None
    low = min(l1[1], l2[1]); depth = h1[1] - low
    return dict(why=f"쌍바닥 넥라인(가운데 고점) {px(code, h1[1]):,} 돌파", stop=low * 0.98, target=h1[1] + depth, hold=30,
                lines=[dict(kind="pattern", label="쌍바닥", points=[pt(code, l1[0], l1[1], "바닥 1", "L"), pt(code, h1[0], h1[1], "", "H"), pt(code, l2[0], l2[1], "바닥 2", "L")]),
                       dict(kind="hline", label="넥라인", a=[b[h1[0]]["d"], px(code, h1[1])], b=[b[i]["d"], px(code, h1[1])])])

def R_asctri(code, i):
    """상승 삼각형: 40일 안 고점 2개 이상이 2.5% 안(평평한 천장) · 저점 2개 이상이 높아짐 → 천장 종가 돌파"""
    b = BARS[code]
    if i < 60: return None
    piv = [x for x in zigzag(b, i - 60, i, 0.04) if x[0] >= i - 40]
    hs = [x for x in piv if x[2] == "H"]; ls = [x for x in piv if x[2] == "L"]
    if len(hs) < 2 or len(ls) < 2: return None
    top = max(x[1] for x in hs)
    if (top - min(x[1] for x in hs[-2:])) / top > 0.025 or not all(ls[j + 1][1] > ls[j][1] for j in range(len(ls) - 1)): return None
    if not (b[i - 1]["c"] <= top < b[i]["c"]): return None
    height = top - ls[0][1]
    return dict(why=f"상승 삼각형 천장 {px(code, top):,} 돌파 (저점 {len(ls)}번 높아짐)", stop=ls[-1][1] * 0.98, target=top + height, hold=25,
                lines=[dict(kind="hline", label="평평한 천장(저항)", a=[b[hs[0][0]]["d"], px(code, top)], b=[b[i]["d"], px(code, top)]),
                       dict(kind="ray", label="오르는 지지선", a=[b[ls[0][0]]["d"], px(code, ls[0][1])], b=[b[ls[-1][0]]["d"], px(code, ls[-1][1])])])

def R_cup(code, i):
    """컵앤핸들: 왼쪽 테두리 → 12~35% 둥근 바닥 → 오른쪽 테두리(왼쪽과 5% 안) → 3~12% 손잡이(컵 절반 위) → 테두리 종가 돌파"""
    b = BARS[code]
    if i < 90: return None
    lk = max(range(i - 90, i - 35), key=lambda k: b[k]["h"])
    bk = min(range(lk + 5, i - 10), key=lambda k: b[k]["l"])
    rk = max(range(bk + 5, i - 3), key=lambda k: b[k]["h"], default=None)
    if rk is None: return None
    L, B, R = b[lk]["h"], b[bk]["l"], b[rk]["h"]
    depth = (L - B) / L
    if not (0.12 <= depth <= 0.35 and abs(R - L) / L < 0.05 and bk - lk >= 10 and rk - bk >= 10): return None
    hk = min(range(rk + 1, i), key=lambda k: b[k]["l"])
    H = b[hk]["l"]; drop = (R - H) / R
    if not (0.03 <= drop <= 0.12 and H > B + 0.5 * (L - B) and 3 <= i - rk <= 20): return None
    rim = max(L, R)
    if not (b[i - 1]["c"] <= rim < b[i]["c"]): return None
    return dict(why=f"컵앤핸들 테두리 {px(code, rim):,} 돌파 (컵 깊이 {depth * 100:.0f}% · 손잡이 {drop * 100:.0f}%)", stop=H * 0.98, target=rim + (L - B), hold=30,
                lines=[dict(kind="pattern", label="컵앤핸들", points=[pt(code, lk, L, "컵 왼쪽", "H"), pt(code, bk, B, "컵 바닥", "L"), pt(code, rk, R, "컵 오른쪽", "H"), pt(code, hk, H, "손잡이", "L")]),
                       dict(kind="hline", label="테두리(돌파선)", a=[b[lk]["d"], px(code, rim)], b=[b[i]["d"], px(code, rim)])])

def R_flag(code, i):
    """상승 깃발: 12일 안 15% 넘게 오른 깃대 → 4~15일 아래로 기운 깃발(깃대 절반 위) → 깃발 윗선 종가 돌파"""
    b = BARS[code]
    if i < 40: return None
    for f in range(4, 16):
        pk = i - f - 1  # 깃대 꼭대기 (깃발 시작 전날)
        if pk < 15 or b[pk]["h"] < max(x["h"] for x in b[pk - 3:pk + 1]): continue
        sk = min(range(pk - 12, pk), key=lambda k: b[k]["l"])
        pole = b[pk]["h"] - b[sk]["l"]
        if pole / b[sk]["l"] < 0.15: continue
        fl = range(pk + 1, i)
        ks = list(fl); hs = [b[k]["h"] for k in ks]; ls_ = [b[k]["l"] for k in ks]
        n = len(ks); mk = sum(ks) / n; mh = sum(hs) / n; ml = sum(ls_) / n
        den = sum((k - mk) ** 2 for k in ks)
        sh = sum((k - mk) * (h - mh) for k, h in zip(ks, hs)) / den
        sl = sum((k - mk) * (l - ml) for k, l in zip(ks, ls_)) / den
        upper = lambda k: mh + sh * (k - mk) + max(h - (mh + sh * (kk - mk)) for kk, h in zip(ks, hs))
        lower = lambda k: ml + sl * (k - mk) + min(l - (ml + sl * (kk - mk)) for kk, l in zip(ks, ls_))
        if sh >= 0 or min(ls_) < b[pk]["h"] - 0.5 * pole: continue
        if not (b[i]["c"] > upper(i) and b[i - 1]["c"] <= upper(i - 1)): continue
        return dict(why=f"상승 깃발 윗선 돌파 (깃대 +{pole / b[sk]['l'] * 100:.0f}%, 깃발 {f}일)", stop=min(ls_) * 0.98, target=b[i]["c"] + pole, hold=20,
                    lines=[dict(kind="trend", label="깃대", a=[b[sk]["d"], px(code, b[sk]['l'])], b=[b[pk]["d"], px(code, b[pk]['h'])]),
                           dict(kind="trend", label="깃발 윗선", a=[b[ks[0]]["d"], px(code, upper(ks[0]))], b=[b[i]["d"], px(code, upper(i))]),
                           dict(kind="trend", label="깃발 아랫선", a=[b[ks[0]]["d"], px(code, lower(ks[0]))], b=[b[i - 1]["d"], px(code, lower(i - 1))])])
    return None

# ── 기영이 머리(기영이대가리) 패턴 ──
#   헤드앤숄더 계열 복합형: 가운데 장대양봉으로 솟은 머리 하나(기영이의 뾰족 머리), 양쪽에 그보다 낮은 어깨 여러 개(좌우 대칭),
#   거래량은 왼쪽이 오른쪽보다 많고 줄어듦. 머리 양옆 골을 이은 목선을 종가로 깨면 완성
#   목표 = 머리 끝에서 목선까지 높이만큼 목선 아래, 손절 = 오른쪽 어깨 위
_KY = {}
def kiyoung_head(code, i):
    key = (code, i)
    if key in _KY: return _KY[key]
    _KY[key] = None
    b = BARS[code]
    if i < 100: return None
    piv = [x for x in zigzag(b, i - 100, i, 0.035) if x[0] >= i - 80]
    hs = [x for x in piv if x[2] == "H"]
    if len(hs) < 4: return None
    head = max(hs, key=lambda x: x[1])
    left = [x for x in hs if x[0] < head[0]][-3:]
    right = [x for x in hs if x[0] > head[0]][:3]
    if not left or not right or len(left) + len(right) < 3 or abs(len(left) - len(right)) > 1: return None
    sh = left + right
    # 어깨는 머리보다 5% 넘게 낮고, 어깨끼리는 비슷한 높이(10% 안)
    if not all(x[1] < head[1] * 0.96 for x in sh): return None
    if (max(x[1] for x in sh) - min(x[1] for x in sh)) / max(x[1] for x in sh) > 0.15: return None
    # 좌우 대칭: 머리 왼쪽 · 오른쪽 폭이 2배 안
    lw, rw = head[0] - left[0][0], right[-1][0] - head[0]
    if not (0.4 <= lw / max(rw, 1) <= 2.5): return None
    lows = [x for x in piv if x[2] == "L"]
    l1 = [x for x in lows if left[-1][0] < x[0] < head[0]]
    l2 = [x for x in lows if head[0] < x[0] < right[0][0]]
    if not l1 or not l2: return None
    n1, n2 = l1[-1], l2[0]
    neck = lambda k: line_at(n1[0], n1[1], n2[0], n2[1], k)
    # 거래량: 왼쪽 어깨 구간 평균 > 오른쪽 어깨 구간 평균
    vl = sum(x["v"] for x in b[left[0][0]:head[0]]) / max(1, head[0] - left[0][0])
    vr = sum(x["v"] for x in b[head[0] + 1:right[-1][0] + 1]) / max(1, right[-1][0] - head[0])
    if vl < vr * 0.8: return None
    if i - right[-1][0] > 20 or not (b[i - 1]["c"] >= neck(i - 1) and b[i]["c"] < neck(i)): return None
    height = head[1] - neck(head[0])
    target = neck(i) - height
    pts = [pt(code, x[0], x[1], "어깨", "H") for x in left] + [pt(code, head[0], head[1], "머리", "H")] + [pt(code, x[0], x[1], "어깨", "H") for x in right]
    lines = [dict(kind="pattern", label="기영이 머리", points=pts),
             dict(kind="ray", label="목선", a=[b[n1[0]]["d"], px(code, n1[1])], b=[b[n2[0]]["d"], px(code, n2[1])]),
             dict(kind="hline", label="목표(머리 높이만큼 아래)", a=[b[i]["d"], px(code, target)], b=[b[min(i + 1, len(b) - 1)]["d"], px(code, target)])]
    _KY[key] = dict(head=head, neck=neck, target=target, stop=max(x[1] for x in right) * 1.01, lines=lines, vl=vl, vr=vr, n=len(sh))
    return _KY[key]

RULES = {
    "support": (R_support, "지지선 반등", "20일 최저점을 지지선으로 긋고, 그 근처에서 양봉으로 반등하면 진입. 지지선 3% 아래 손절, +6% 또는 5일 뒤 정리"),
    "volume": (R_volume_trend, "거래량 추세", "평소 거래량의 2배 넘게 터지며 20일선 위 장대 양봉이면 진입. 그 봉 저점 이탈 손절, +12% 또는 8일 뒤 정리"),
    "pullback": (R_pullback, "눌림목", "20일선 > 60일선 정배열에서 20일선까지 눌렸다가 지지하면 진입. 20일선 4% 아래 손절, +8% 또는 10일 뒤 정리"),
    "ma": (R_ma_cross, "골든크로스 추세", "20일선이 60일선을 위로 뚫으면 진입, 종가가 20일선 아래로 내려가면 정리. 진입가 -7% 손절"),
    "box": (R_box, "박스권 돌파", "폭 18% 안의 20일 박스 상단을 거래량 1.5배로 돌파하면 진입. 박스 상단 3% 아래 손절, +15% 또는 15일 뒤 정리"),
    "rsi": (R_rsi, "RSI 과매도 탈출", "RSI(14)가 30 아래에서 위로 올라오면 진입. 최근 5일 저점 이탈 손절, RSI 60 또는 +10%에서 정리"),
    "value": (R_value, "낙폭 과대 분할 매수", "120일선보다 15% 넘게 빠지고 RSI 40 아래에서 양봉이면 진입. -12% 손절, +20% 또는 60일 뒤 정리"),
    "engulf": (R_engulf, "장악형 캔들", "20일선 근처에서 상승 장악형 캔들이 나오면 진입. 두 봉 저점 이탈 손절, +6% 또는 5일 뒤 정리"),
    "bb": (R_bb, "볼린저 하단 복귀", "종가가 밴드 하단 밖으로 나갔다가 다시 안으로 들어오면 진입. 전일 저점 이탈 손절, 밴드 중심선에서 정리"),
    "gap": (R_gap, "갭 상승 단타", "전일 고가보다 2% 넘게 갭 상승 출발하면 시가 진입, 그날 종가에 정리. -3% 손절"),
    "weekly": (R_weekly, "추세선 스윙", "오르는 저점 두 개를 이어 추세선을 긋고, 선 근처에서 반등하면 진입. 선 4% 아래 손절, +12% 또는 20일 뒤 정리"),
    "risk": (R_ma_cross, "골든크로스 + 짧은 손절", "20일선이 60일선을 위로 뚫으면 진입. 손절은 -3%로 짧게, 20일선 이탈 시 정리"),
    "trendbreak": (R_trend_break, "신고가 추세 추종", "50일 신고가를 돌파하고 20일선이 오르고 있으면 진입, 20일선 아래 종가에 정리. -8% 손절"),
    "vbo": (R_vbo, "변동성 돌파", "시가 + 전일 변동폭 × 0.5 를 넘으면 그 가격에 진입, 다음 날 시가에 정리. -3% 손절"),
    "macd": (R_macd, "MACD 반전", "0선 아래에서 MACD가 시그널선을 위로 뚫으면 진입, 다시 아래로 뚫으면 정리. -6% 손절"),
    "rsi_deep": (R_rsi_deep, "깊은 과매도 반등", "RSI(14)가 25 아래에서 위로 올라오면 조금씩 진입. 최근 5일 저점 이탈 손절, RSI 60 또는 +10%에서 정리"),
    "channel": (R_channel, "상승 채널 매매", "최근 40일 가격으로 회귀선과 평행한 채널을 긋고, 오르는 채널의 하단선에서 양봉 지지면 진입. 하단 3% 아래 손절, 상단선에서 정리"),
    "fib": (R_fib, "피보나치 되돌림", "60일 안 스윙 저점→고점(+15% 이상)에 피보나치를 긋고, 0.5~0.618 구간에서 양봉 지지면 진입. 0.786 이탈 손절, 직전 고점에서 정리"),
    "elliott": (R_elliott, "엘리어트 5파 매매", "지그재그(7%)로 0-1-2-3-4 파동을 표시하고, 엘리어트 규칙(2파 38~79% 되돌림 · 3파가 가장 김 · 4파가 1파와 안 겹침)이 맞으면 4파 저점에서 5파 진입. 4파 저점 3% 아래 손절, 5파 = 1파 길이 목표"),
    "ihs": (R_ihs, "역헤드앤숄더", "지그재그(5%) 꼭지로 왼쪽 어깨-머리-오른쪽 어깨를 찾고(머리가 양 어깨보다 3% 넘게 낮고 두 어깨 높이는 10% 안), 두 고점을 이은 넥라인을 종가로 넘으면 진입. 오른쪽 어깨 아래 손절, 머리 깊이만큼 넥라인 위가 목표"),
    "dbottom": (R_dbottom, "쌍바닥(W)", "비슷한 높이(4% 안)의 저점 두 개가 10일 넘게 떨어져 나오면 W 로 보고, 가운데 고점(넥라인)을 종가로 넘으면 진입. 두 바닥 아래 손절, 바닥 깊이만큼 위가 목표"),
    "asctri": (R_asctri, "상승 삼각형", "평평한 천장(고점 2개 이상, 2.5% 안)과 높아지는 저점을 각각 수평선 · 반직선으로 긋고, 천장을 종가로 넘으면 진입. 마지막 저점 아래 손절, 삼각형 높이만큼 위가 목표"),
    "cup": (R_cup, "컵앤핸들", "12~35% 깊이의 둥근 컵과 3~12% 손잡이를 확인하고, 테두리를 종가로 넘으면 진입. 손잡이 저점 아래 손절, 컵 깊이만큼 위가 목표"),
    "flag": (R_flag, "상승 깃발", "12일 안 15% 넘게 오른 깃대 뒤 아래로 기운 깃발(평행선 두 개)을 긋고, 깃발 윗선을 종가로 넘으면 진입. 깃발 저점 아래 손절, 깃대 길이만큼 위가 목표"),
    "kiyoung": (R_kiyoung, "기영이 머리 밈 매매", "오른 뒤 30일쯤 뾰족뾰족 옆으로 기는 구간(폭 5~20% · 꼭지 5개 이상)을 기영이 머리카락으로 보고 그 밑에 기영이 얼굴을 그려 둔다. 머리 꼭대기 위로 종가가 나오면(기영이가 손 들고 빛의 검) 산다. 머리 바닥(최대 -8%) 손절, 머리 폭의 1.5배 위가 목표, 25일 보유"),
    "kiyoung_old": (R_kiyoung_old, "기영이 머리 매매(이전)", "가운데 장대양봉으로 솟은 머리 하나와 양쪽의 낮은 어깨 여러 개(좌우 대칭, 거래량은 왼쪽 > 오른쪽)를 긋고, 머리 양옆 골을 이은 목선을 종가로 깨면 전량 정리. 머리 높이만큼 목선 아래(목표)까지 빠진 뒤 첫 반등 양봉에서 다시 사고, 평소엔 정배열 20일선 회복에서 보유"),
}
# 트레이더 이름(태그라인)과 맞춘 규칙 (data.ts NAMES 순서)
BASE_RULE = ["support", "volume", "pullback", "ma", "box", "rsi", "value", "engulf", "bb", "gap", "weekly", "risk", "trendbreak", "volume", "rsi_deep"]

def kiyoung_peaks(b, i):
    """최근 20일 안에 봉우리 3개(간격 2~7일, 이웃보다 2% 넘게 뾰족) + 거래량 감소 + 직전 저점 이탈"""
    hs = [k for k in swing_highs(b, i, 22, 2) if k < i - 1]
    if len(hs) < 3: return None
    p = hs[-3:]
    if not all(2 <= p[j + 1] - p[j] <= 7 for j in range(2)): return None
    sharp = all(b[k]["h"] > max(b[k - 2]["c"], b[min(i, k + 2)]["c"]) * 1.02 for k in p)
    if not sharp: return None
    neck = min(x["l"] for x in b[p[0]:p[2] + 1])
    vol_down = b[p[2]]["v"] < b[p[0]]["v"]
    if vol_down and b[i]["c"] < neck:
        return p, neck
    return None

FEE = {"KR": (0.00015, 0.0018), "US": (0.0007, 0.0)}

def simulate(tid, rule_key, pool, follow_p, seed):
    # 계획을 어기는 매매를 일정한 간격으로 (작은 표본에서도 이행률이 follow_p 근처로): 쌓인 몫이 1을 넘으면 그 매매는 어김
    debt = [0.5]
    def breaks():
        debt[0] += 1 - follow_p
        if debt[0] >= 1:
            debt[0] -= 1
            return True
        return False
    rnd = random.Random(seed)
    fn, rule_name, rule_desc = RULES[rule_key]
    mk = META[pool[0]]["market"]
    buy_fee, sell_tax = FEE[mk]
    dates = sorted({x["d"] for c in pool for x in BARS[c] if x["d"] >= START})
    idx = {c: {x["d"]: k for k, x in enumerate(BARS[c])} for c in pool}
    slots = len(pool)
    cash, equity_hist, pos, trades = 1.0, [], {}, []
    for d in dates:
        # 보유 관리 (청산)
        for c in list(pos):
            k = idx[c].get(d)
            if k is None: continue
            p, bar, I = pos[c], BARS[c][k], IND[c]
            p["days"] += 1
            exit_px, why = None, None
            sig = p["sig"]
            if sig.get("exit_next_open") and p["days"] >= 1:
                exit_px, why = bar["o"], "다음 날 시가 정리"
            elif bar["l"] <= p["stop"]:
                exit_px, why = min(bar["o"], p["stop"]), "손절선 도달"
            elif bar["h"] >= p["target"] and not sig.get("trail") and not sig.get("kiyoung"):
                exit_px, why = max(bar["o"], p["target"]), "목표가 도달"
            elif rule_key in ("ma", "risk", "trendbreak") and hs_top(c, k):
                piv, neck = hs_top(c, k)
                exit_px, why = bar["c"], "헤드앤숄더 천장 넥라인 이탈"
                p["lines"] = p["lines"] + hs_lines(c, piv, neck, k)
            elif sig.get("trail") and I[sig["trail"]][k] and bar["c"] < I[sig["trail"]][k]:
                exit_px, why = bar["c"], "종가 20일선 이탈"
            elif sig.get("exit_rsi") and I["rsi"][k] and I["rsi"][k] >= sig["exit_rsi"]:
                exit_px, why = bar["c"], f"RSI {I['rsi'][k]:.0f} 도달"
            elif sig.get("exit_macd") and I["macd"][k] < I["sig"][k]:
                exit_px, why = bar["c"], "MACD 데드크로스"
            elif rule_key == "bb" and I["ma20"][k] and bar["h"] >= I["ma20"][k]:
                exit_px, why = max(bar["o"], I["ma20"][k]), "밴드 중심선 도달"
            elif sig.get("kiyoung") and kiyoung_head(c, k):
                ky = kiyoung_head(c, k)
                exit_px, why = bar["c"], f"기영이 머리 완성: 어깨 {ky['n']}개 · 머리 하나 · 거래량 감소 뒤 목선 이탈 → 전량 정리"
                p["lines"] = p["lines"] + ky["lines"]
            if exit_px is None and sig.get("hold") is not None and p["days"] >= max(1, sig["hold"]) and not sig.get("trail") and not sig.get("kiyoung"):
                exit_px, why = bar["c"], f"{sig['hold']}일 보유 뒤 정리"
            if exit_px is None and sig.get("hold") == 0:
                exit_px, why = bar["c"], "당일 종가 정리"
            if exit_px is None and sig.get("kiyoung") and p["days"] >= 60 and bar["c"] < I["ma60"][k]:
                exit_px, why = bar["c"], "60일선 이탈"
            if exit_px is None: continue
            # 계획을 어긴 경우 (이행률): 손절을 미루거나 목표 전에 먼저 팔기
            followed = True
            if not p["deviated_checked"]:
                p["deviated_checked"] = True
                if breaks():
                    if why == "손절선 도달" and k + 2 < len(BARS[c]):
                        k2 = k + 2; exit_px, followed = BARS[c][k2]["c"], False
                        why = "손절선 도달했지만 2일 버티다 정리 (계획 위반)"
                    else:
                        exit_px, followed = (exit_px + p["entry"]) / 2 if exit_px > p["entry"] else exit_px, False
                        why = why + " — 목표 전에 일부 먼저 팔아 계획과 다름" if exit_px > p["entry"] else why + " (계획 위반 없음)"
                        if "위반 없음" in why: followed = True
            proceeds = p["qty"] * exit_px * (1 - buy_fee - sell_tax)
            cash += proceeds
            ret = proceeds / p["cost"] - 1
            trades.append(dict(code=c, name=META[c]["name"], entry=dict(d=p["d"], px=px(c, p["entry"]), why=p["why"]),
                               exit=dict(d=d, px=px(c, exit_px), why=why), ret=r2(ret * 100), followed=followed, lines=p["lines"]))
            del pos[c]
        # 진입
        for c in pool:
            if c in pos: continue
            k = idx[c].get(d)
            if k is None or k < 60: continue
            s = fn(c, k)
            if not s: continue
            bar = BARS[c][k]
            entry = bar["o"] if s.get("at") == "open" else (s["at"] if isinstance(s.get("at"), (int, float)) else bar["c"])
            stop = s["stop"]
            if rule_key == "risk": stop = entry * 0.97
            budget = (cash + sum(q["qty"] * BARS[q["c"]][idx[q["c"]].get(d, q["k"])]["c"] for q in pos.values())) / slots
            budget = min(budget, cash)
            if budget <= 0.0001: continue
            qty = budget / (entry * (1 + buy_fee))
            cash -= budget
            pos[c] = dict(c=c, k=k, d=d, entry=entry, stop=stop, target=s.get("target", entry * 1.1), qty=qty, cost=budget, days=0, sig=s, why=s["why"], lines=s["lines"], deviated_checked=False)
            # 같은 날 종가 청산 (갭)
            if s.get("hold") == 0:
                p = pos[c]; exit_px = bar["c"]; why = "당일 종가 정리"
                if bar["l"] <= p["stop"]: exit_px, why = p["stop"], "손절선 도달"
                elif bar["h"] >= p["target"]: exit_px, why = p["target"], "목표가 도달"
                followed = not breaks()
                if not followed and exit_px < entry: exit_px, why = bar["l"], "손절 늦어 저가 근처 정리 (계획 위반)"
                elif not followed: followed = True
                proceeds = p["qty"] * exit_px * (1 - buy_fee - sell_tax)
                cash += proceeds
                trades.append(dict(code=c, name=META[c]["name"], entry=dict(d=d, px=px(c, entry), why=s["why"]), exit=dict(d=d, px=px(c, exit_px), why=why),
                                   ret=r2((proceeds / p["cost"] - 1) * 100), followed=followed, lines=s["lines"]))
                del pos[c]
        mv = sum(q["qty"] * BARS[q["c"]][idx[q["c"]][d] if d in idx[q["c"]] else q["k"]]["c"] for q in pos.values())
        equity_hist.append((d, cash + mv))
    # 월별 수익률 · 최대 낙폭
    month_end, prev = {}, 1.0
    for d, e in equity_hist: month_end[d[:7]] = e
    monthly = []
    for mth in MONTHS:
        e = month_end.get(mth, prev)
        monthly.append(dict(month=mth, ret=r2((e / prev - 1) * 100)))
        prev = e
    peak, mdd = 0, 0
    for _, e in equity_hist:
        peak = max(peak, e); mdd = min(mdd, e / peak - 1)
    return monthly, r2(mdd * 100), trades, rule_name, rule_desc, equity_hist

def month_candles(code, mth, back=25):
    b = BARS[code]
    ks = [k for k, x in enumerate(b) if x["d"][:7] == mth]
    if not ks: return []
    lo, hi = max(0, ks[0] - back), ks[-1]
    return [[x["d"], px(code, x["o"]), px(code, x["h"]), px(code, x["l"]), px(code, x["c"]), int(x["v"])] for x in b[lo:hi + 1]]

# ── 매매가 아닌 기록: 증시 메모(시장 전체) · 종목 노트(안 산 종목 관찰) — 모두 실제 일봉에서 ──
def basket_days(market, mth):
    """그 시장 종목 전체를 같은 비중으로 묶은 바스켓의 하루 등락 (날짜, %, 그날 가장 오른 · 내린 종목)"""
    codes = KR_POOL if market == "KR" else US_POOL
    days = {}
    for c in codes:
        b = BARS[c]
        for k in range(1, len(b)):
            if b[k]["d"][:7] != mth: continue
            days.setdefault(b[k]["d"], []).append((c, (b[k]["c"] / b[k - 1]["c"] - 1) * 100))
    out = []
    for d, rs in sorted(days.items()):
        avg = sum(r for _, r in rs) / len(rs)
        up = max(rs, key=lambda x: x[1]); dn = min(rs, key=lambda x: x[1])
        out.append((d, avg, up, dn))
    return out

def month_move(code, mth):
    b = BARS[code]
    ks = [k for k, x in enumerate(b) if x["d"][:7] == mth]
    if not ks or ks[0] == 0: return None
    return (b[ks[-1]]["c"] / b[ks[0] - 1]["c"] - 1) * 100

def market_memos(market, mth, rnd):
    days = basket_days(market, mth)
    if not days: return []
    nm = "국내" if market == "KR" else "미국"
    codes = KR_POOL if market == "KR" else US_POOL
    memos = []
    worst = min(days, key=lambda x: x[1]); best = max(days, key=lambda x: x[1])
    if worst[1] < -1.2:
        memos.append(dict(type="market", d=worst[0], text=f"{nm} 대형주 바스켓 {worst[1]:+.1f}%, 이달 가장 크게 빠진 날. {META[worst[3][0]]['name']} {worst[3][1]:+.1f}%. 신규 진입은 하루 쉬고 손절선만 다시 확인."))
    if best[1] > 1.2:
        memos.append(dict(type="market", d=best[0], text=f"{nm} 바스켓 {best[1]:+.1f}% 반등. {META[best[2][0]]['name']} {best[2][1]:+.1f}%로 가장 강함. 추격 매수 대신 계획한 자리까지 기다리기."))
    moves = [(c, month_move(c, mth)) for c in codes]
    moves = [x for x in moves if x[1] is not None]
    if moves:
        avg = sum(m for _, m in moves) / len(moves)
        top = max(moves, key=lambda x: x[1]); bot = min(moves, key=lambda x: x[1])
        tone = "강세" if avg > 2 else "약세" if avg < -2 else "횡보"
        memos.append(dict(type="market", d=days[-1][0], text=f"{mth[5:].lstrip('0')}월 {nm} 시장 정리: 바스켓 {avg:+.1f}% ({tone}). 가장 강한 {META[top[0]]['name']} {top[1]:+.1f}%, 가장 약한 {META[bot[0]]['name']} {bot[1]:+.1f}%."))
    return memos

def stock_note(code, mth, rule_key):
    """그 달 안 산 종목: 마지막 거래일 기준 상태 + 기다리는 자리에 선 하나"""
    b, I = BARS[code], IND[code]
    ks = [k for k, x in enumerate(b) if x["d"][:7] == mth]
    if not ks: return None
    k = ks[-1]; c = b[k]["c"]; d = b[k]["d"]
    m20, m60, r = I["ma20"][k], I["ma60"][k], I["rsi"][k]
    hi20 = max(x["h"] for x in b[k - 19:k + 1]); lo20 = min(x["l"] for x in b[k - 19:k + 1])
    nm = META[code]["name"]
    arr = "정배열" if m20 and m60 and m20 > m60 else "역배열"
    if rule_key in ("box", "trendbreak", "volume", "gap", "vbo"):
        lvl, lab, txt = hi20, "돌파 대기선(20일 고점)", f"{nm} 종가 {px(code, c):,}, 20일 고점 {px(code, hi20):,}까지 {(hi20 / c - 1) * 100:.1f}%. 거래량 붙어 넘기 전엔 관망."
    elif rule_key in ("rsi", "rsi_deep", "value", "bb"):
        lvl, lab, txt = lo20, "관찰 저점(20일)", f"{nm} RSI {r:.0f}, 20일 저점 {px(code, lo20):,}. 과매도 신호 전이라 매수 안 함, 저점 이탈 여부만 체크."
    elif rule_key == "fib":
        lvl, lab, txt = (hi20 + lo20) / 2, "되돌림 0.5 예상", f"{nm} 20일 범위 {px(code, lo20):,}~{px(code, hi20):,}. 상승 폭이 15%가 안 돼 피보나치 대상 아님, 중간값 {px(code, (hi20 + lo20) / 2):,}만 표시."
    elif rule_key == "elliott":
        lvl, lab, txt = lo20, "파동 카운트 기준 저점", f"{nm} 파동 아직 3파 진행 중으로 보고 카운트만. 4파 확정 전 진입 안 함, 기준 저점 {px(code, lo20):,}."
    elif rule_key == "channel":
        lvl, lab, txt = lo20, "채널 하단 후보", f"{nm} {arr}, 채널 기울기 약함. 하단 후보 {px(code, lo20):,} 근처 오면 다시 그어 보기."
    else:
        lvl, lab, txt = (m20 or c), "20일선", f"{nm} {arr}, 종가 {px(code, c):,} · 20일선 {px(code, m20 or c):,} ({(c / (m20 or c) - 1) * 100:+.1f}%). 규칙 신호 없어 관찰만."
    return dict(type="stock", d=d, code=code, name=nm, text=txt,
                lines=[dict(kind="hline", label=lab, a=[b[k - 19]["d"], px(code, lvl)], b=[d, px(code, lvl)])])

# 보조지표 창: 규칙이 쓰는 보조지표만 (가격 위에 겹치지 않고 차트 아래 따로)
PANES = {"rsi": ["rsi"], "rsi_deep": ["rsi"], "value": ["rsi"], "macd": ["macd"], "volume": ["volume"], "box": ["volume"], "gap": ["volume"]}

def month_ind(code, mth, keys, back=25):
    b, I = BARS[code], IND[code]
    ks = [k for k, x in enumerate(b) if x["d"][:7] == mth]
    if not ks: return {}
    rng = range(max(0, ks[0] - back), ks[-1] + 1)
    out = {}
    if "rsi" in keys: out["rsi"] = [round(I["rsi"][k], 1) if I["rsi"][k] is not None else None for k in rng]
    if "macd" in keys:
        out["macd"] = [r2(I["macd"][k]) for k in rng]
        out["signal"] = [r2(I["sig"][k]) for k in rng]
    if "volume" in keys: out["volume"] = True  # 거래량은 봉 데이터에 이미 있음
    return out

TITLE = {
    True: ["{sym} {rule} {n}번 중 {w}번 수익", "{sym}에서 지킨 {rule} 기준", "{rule}: {sym} {best} 최고 매매", "{sym} 선 긋고 기다린 {n}번의 진입"],
    False: ["{rule} 신호가 없어 쉬어 간 달", "조건이 안 맞아 현금으로 지킨 달"],
}

# 작도로 매매하는 트레이더 (생성 트레이더 일부를 바꿈): 규칙, 소개 한 줄, 한 마디, 지표
PERSONA = {
    15: ("channel", "평행 채널을 긋고 하단에서 사는 트레이더", "채널 안에서는 하단에서 사고 상단에서 판다.", ["추세선", "지지·저항"]),
    16: ("fib", "피보나치 되돌림 0.618을 노리는 트레이더", "되돌림은 기회, 0.786 아래는 포기.", ["피보나치", "지지·저항"]),
    17: ("elliott", "엘리어트 파동으로 5파만 타는 트레이더", "파동을 세고, 규칙이 맞을 때만 탄다.", ["엘리어트 파동", "추세선"]),
    23: ("channel", "상승 채널 하단 매수 스윙 트레이더", "선을 긋기 전엔 사지 않는다.", ["추세선", "이동평균선"]),
    24: ("fib", "스윙 고점 대비 피보나치 눌림 매수", "황금비 근처에서만 움직인다.", ["피보나치", "거래량"]),
    25: ("macd", "MACD 골든크로스 반전 트레이더", "0선 아래 골든크로스만 믿는다.", ["MACD", "거래량"]),
    26: ("elliott", "4파 끝에서 5파를 기다리는 트레이더", "3파는 놓쳐도 5파는 잡는다.", ["엘리어트 파동", "거래량"]),
    31: ("channel", "미국 기술주 채널 매매", "채널 하단은 할인 구간.", ["추세선", "볼린저 밴드"]),
    34: ("fib", "피보나치와 거래량을 같이 보는 트레이더", "0.618과 거래량이 만나는 곳.", ["피보나치", "거래량"]),
    19: ("flag", "깃대와 깃발만 보는 미국 모멘텀 트레이더", "급등 뒤 쉬는 깃발에서만 탄다.", ["차트 패턴", "거래량"]),
    20: ("ihs", "역헤드앤숄더 넥라인 돌파 트레이더", "머리 깊이만큼만 기대한다.", ["차트 패턴", "추세선"]),
    21: ("dbottom", "쌍바닥(W) 넥라인 돌파 트레이더", "바닥은 두 번 확인하고 산다.", ["차트 패턴", "지지·저항"]),
    22: ("asctri", "상승 삼각형 돌파 트레이더", "천장은 평평하게, 바닥은 높아지게.", ["차트 패턴", "추세선"]),
    27: ("cup", "컵앤핸들만 기다리는 미국 성장주 트레이더", "손잡이를 넘는 날만 산다.", ["차트 패턴", "거래량"]),
    28: ("cup", "컵앤핸들 · 테두리 돌파 트레이더", "둥근 바닥이 끝나야 들어간다.", ["차트 패턴", "거래량"]),
    29: ("ihs", "역헤드앤숄더로 바닥을 잡는 트레이더", "왼쪽 어깨, 머리, 오른쪽 어깨, 그리고 넥라인.", ["차트 패턴", "지지·저항"]),
    30: ("flag", "상승 깃발 단기 스윙 트레이더", "깃대가 길수록 목표도 길다.", ["차트 패턴", "추세선"]),
    33: ("dbottom", "W 바닥과 거래량을 같이 보는 트레이더", "두 번째 바닥에서 거래량이 줄면 좋다.", ["차트 패턴", "거래량"]),
    36: ("asctri", "삼각형 수렴 돌파 트레이더", "수렴이 길수록 돌파가 세다.", ["차트 패턴", "지지·저항"]),
    38: ("elliott", "엘리어트 파동 카운트 트레이더", "세지 못하면 사지 않는다.", ["엘리어트 파동", "피보나치"]),
}

# 작도 · 패턴 트레이더 이름 (규칙과 맞게, 다른 트레이더와 안 겹치게)
PNAME = {15: "채널메이커", 16: "피보나치랩", 17: "파동카운터", 19: "깃발러너", 20: "넥라인헌터", 21: "더블바텀", 22: "삼각수렴",
         23: "채널스윙", 24: "황금비노트", 25: "MACD리버설", 26: "오파동", 27: "컵핸들US", 28: "컵앤핸들러", 29: "역헤숄노트",
         30: "깃대스윙", 31: "채널나스닥", 33: "W바닥러", 34: "피보볼륨", 36: "수렴돌파", 38: "엘리어트로그"}

summary = {}
for i in range(41):
    tid = f"t{i + 1}"
    if i == 40:
        rule_key, us = "kiyoung", False
    else:
        rule_key = PERSONA[i][0] if i in PERSONA else BASE_RULE[i % 15]
        us = i % 4 == 3 or i == 12
    pool_all = US_POOL if us else KR_POOL
    r = random.Random(i * 31 + 7)
    pool = r.sample(pool_all, 5 if rule_key in ("channel", "fib", "elliott") else 6 if rule_key in ("ihs", "dbottom", "asctri", "cup", "flag") else 3)
    if i == 40: pool = ["373220", "068270", "000270", "247540", "329180", "005930"]  # 기영이머리연구소: 기영이 머리(뾰족 박스)가 실제로 자주 나온 종목
    # 계획을 지키는 정도: 트레이더마다 50%~100% 고르게 (황금비 수열로 겹치지 않게 퍼뜨림)
    follow_p = 0.5 + 0.5 * ((i * 0.6180339887 + 0.13) % 1)
    monthly, mdd, trades, rule_name, rule_desc, eq_hist = simulate(tid, rule_key, pool, follow_p, i * 101 + 5)
    # 날마다 평가금 (시작 1 = 10000) · 달마다 첫 거래일 위치 → 화면에서 월초 기준 수익률 · 기간별 추이
    eq = [round(e * 10000) for _, e in eq_hist]
    m_idx = {}
    for k, (d, _) in enumerate(eq_hist): m_idx.setdefault(d[:7], k)
    n = len(trades)
    follow = round(sum(t["followed"] for t in trades) / n * 100) if n else 100
    # 월별 전략 내용
    months = []
    for mth in MONTHS:
        # 열람권 월 기준: 진입한 달. 앞 달에 산 뒤 이 달에 판(또는 이 달 넘게 들고 있는) 매매는 아래 '이어진 보유' 노트로
        mt = [t for t in trades if t["entry"]["d"][:7] == mth]
        carried = [t for t in trades if t["entry"]["d"][:7] < mth <= t["exit"]["d"][:7]]
        ret = next(x["ret"] for x in monthly if x["month"] == mth)
        main = max(pool, key=lambda c: sum(1 for t in mt if t["code"] == c)) if mt else pool[(MONTHS.index(mth)) % len(pool)]
        rr = random.Random(f"{tid}{mth}")
        mkt = META[pool[0]]["market"]
        notes = market_memos(mkt, mth, rr)
        traded = {t["code"] for t in mt}
        for c in pool:
            if c not in traded:
                n_ = stock_note(c, mth, rule_key)
                if n_: notes.append(n_)
        # 기영이머리연구소: 관찰 종목에 기영이 머리가 자라 있으면 얼굴을 그려 두고 손 들 때(돌파)까지 기다림
        if rule_key == "kiyoung":
            for c in pool:
                ks = [k for k, x in enumerate(BARS[c]) if x["d"][:7] == mth]
                if not ks: continue
                hr = hair_at(c, ks[-1])
                if hr:
                    notes.append(dict(type="stock", d=BARS[c][ks[-1]]["d"], code=c, name=META[c]["name"],
                                      text=f"{META[c]['name']} 기영이 머리 자라는 중 (30일 · 뾰족 꼭지 {hr['spikes']}개). 얼굴 그려 둠 — 머리 꼭대기 {px(c, hr['top']):,} 위로 종가가 나오면(손 들면) 산다.",
                                      lines=[face_doodle(c, hr)]))
        # 관찰 종목에 헤드앤숄더 천장이 완성되면 (넥라인 종가 이탈) 종목 노트로 남김
        for c in pool:
            for k, x in enumerate(BARS[c]):
                if x["d"][:7] != mth: continue
                hs = hs_top(c, k)
                if hs:
                    piv, neck = hs
                    notes.append(dict(type="stock", d=x["d"], code=c, name=META[c]["name"],
                                      text=f"{META[c]['name']} 헤드앤숄더 천장 완성: 넥라인 {px(c, neck(k)):,} 종가 이탈. 머리 {px(c, piv[2][1]):,}. 매수 보류, 보유 중이면 정리 검토.",
                                      lines=hs_lines(c, piv, neck, k)))
                    break
        for t in carried:
            done = t["exit"]["d"][:7] == mth
            notes.append(dict(type="carry", d=t["exit"]["d"] if done else mth + "-01", code=t["code"], name=t["name"],
                              text=(f"{t['entry']['d'][:7].replace('-', '년 ')}월 전략에서 산 {t['name']}({t['entry']['px']:,}) — 이 달 {t['exit']['d']} {t['exit']['why']}로 정리 ({t['ret']:+.2f}%). 매수 근거는 진입한 달 전략에 있어요."
                                    if done else f"{t['entry']['d'][:7].replace('-', '년 ')}월 전략에서 산 {t['name']} 계속 보유 중 (진입가 {t['entry']['px']:,}). 매수 근거는 진입한 달 전략에 있어요.")))
        notes.sort(key=lambda x: x["d"])
        if mt:
            wins = sum(1 for t in mt if t["ret"] > 0)
            best = max(mt, key=lambda t: t["ret"])
            # 이긴 매매가 없으면 "최고 매매" 같은 제목 대신 손절 기록 제목
            pool_t = TITLE[True] if best["ret"] > 0 else ["{sym} {rule}, 손절로 지킨 {n}번", "{sym}에서 {rule} 기준대로 끊은 달"]
            title = rr.choice(pool_t).format(sym=META[main]["name"], rule=rule_name, n=len(mt), w=wins, best=f"{best['ret']:+.1f}%")
            summary_txt = f"매매 {len(mt)}건(계획대로 {sum(t['followed'] for t in mt)}건 · 이긴 매매 {wins}건) · 종목 노트 {sum(1 for x in notes if x['type'] == 'stock')}개 · 증시 메모 {sum(1 for x in notes if x['type'] == 'market')}개"
        else:
            title = rr.choice(TITLE[False]).format(rule=rule_name)
            summary_txt = f"매매 없음 · 종목 노트 {sum(1 for x in notes if x['type'] == 'stock')}개 · 증시 메모 {sum(1 for x in notes if x['type'] == 'market')}개로 기다린 기록"
        mfollow = round(sum(t["followed"] for t in mt) / len(mt) * 100) if mt else 100
        months.append(dict(month=mth, title=title, summary=summary_txt, ret=ret, follow=mfollow, symbol=dict(code=main, name=META[main]["name"]),
                           candles=month_candles(main, mth, 50 if rule_key == "kiyoung" else 25), ind=month_ind(main, mth, PANES.get(rule_key, [])), trades=mt, notes=notes))
    detail = dict(id=tid, market=META[pool[0]]["market"], rule=dict(key=rule_key, name=rule_name, desc=rule_desc), symbols=[dict(code=c, name=META[c]["name"]) for c in pool], months=months)
    json.dump(detail, open(os.path.join(OUT, "traders", f"{tid}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    persona = dict(name=PNAME.get(i), tagline=PERSONA[i][1], quote=PERSONA[i][2], indicators=PERSONA[i][3]) if i in PERSONA else None
    summary[tid] = dict(persona=persona, eq=eq, mIdx=m_idx, asOf=eq_hist[-1][0], monthly=monthly, mdd=mdd, trades=n, follow=follow, rule=rule_name, ruleDesc=rule_desc, symbols=[META[c]["name"] for c in pool],
                        months=[dict(month=x["month"], title=x["title"], summary=x["summary"], follow=x["follow"],
                                     trades=len(x["trades"]), symbols=sorted({t["name"] for t in x["trades"]}),
                                     sample=(x["trades"][0]["entry"]["why"] if x["trades"] else next((n["text"] for n in x["notes"] if n["type"] == "stock"), "")))
                                for x in months],
                        # 확인된 사실 (구매 전 신뢰 정보): 이긴 · 진 매매 수, 가장 큰 이익 · 손실
                        facts=dict(wins=sum(1 for t in trades if t["ret"] > 0), losses=sum(1 for t in trades if t["ret"] <= 0),
                                   best=(max(trades, key=lambda t: t["ret"]) if trades else None) and {k: max(trades, key=lambda t: t["ret"])[k] for k in ("name", "ret")} | {"d": max(trades, key=lambda t: t["ret"])["entry"]["d"]},
                                   worst=(min(trades, key=lambda t: t["ret"]) if trades else None) and {k: min(trades, key=lambda t: t["ret"])[k] for k in ("name", "ret")} | {"d": min(trades, key=lambda t: t["ret"])["entry"]["d"]},
                                   followed=sum(1 for t in trades if t["followed"]),
                                   avgHold=round(sum((date.fromisoformat(t["exit"]["d"]) - date.fromisoformat(t["entry"]["d"])).days for t in trades) / len(trades), 1) if trades else 0))
    tot = 1.0
    for x in monthly: tot *= 1 + x["ret"] / 100
    print(tid, rule_key, [META[c]["name"] for c in pool], f"trades={n} follow={follow}% total={(tot - 1) * 100:+.1f}% mdd={mdd}%")

json.dump(summary, open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
