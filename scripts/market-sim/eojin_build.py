"""
어진냥이(t42) 만들기 — 확정 조합 (2026-11-20, 어진냥이_규칙비교.md)
  1기 2023-01 ~ 2023-10: 바이오 · 테마 6종목, 거래량 급등 추격(sim.py volume), 이행률 0.45, 슬롯 4, 쉬는 돈 현금. 끝에 전량 정리
  2기 2023-11 ~ 2026-11: AI 7종목 20·60일선 골든크로스 + 나스닥 급락 때 나스닥100 직전 스윙 저점 맥점에서 TQQQ, 이행률 0.92, 슬롯 3, 쉬는 돈 QQQ
  숫자는 전부 실제 일봉 계산. 문장은 그 숫자로만 만든다
출력 (추가만, 기존 키 · 파일은 그대로)
  app/marketplace/sim.json 에 "t42"
  data/market-sim/t42.json
실행: python scripts/market-sim/eojin_build.py
"""
import json, os, random
from datetime import date
import eojin_lib as E
import eojin_rules as R

NS = E.NS
BARS, IND, META, px, r2 = NS["BARS"], NS["IND"], NS["META"], NS["px"], NS["r2"]
sim = NS["simulate2"]
QQQ_IDLE = NS["IDLE_RET"]
CASH = {"US": {}, "KR": {}}

P1 = ["MRNA", "NVAX", "PLUG", "LCID", "AMC", "GME"]
P2 = E.AI + ["TQQQ"]
T1_END = "2023-10"
M1 = [m for m in E.MONTHS if m <= T1_END]
M2 = [m for m in E.MONTHS if m > T1_END]
KO = {"MRNA": "모더나", "NVAX": "노바백스", "PLUG": "플러그파워", "LCID": "루시드", "AMC": "AMC", "GME": "게임스탑",
      "NVDA": "엔비디아", "AMD": "AMD", "AVGO": "브로드컴", "MSFT": "마이크로소프트", "META": "메타", "PLTR": "팔란티어", "GOOGL": "알파벳", "TQQQ": "TQQQ", "QQQ": "나스닥100"}
for c in KO: META[c]["name"] = KO[c]
GROUP = {"MRNA": "바이오", "NVAX": "바이오", "PLUG": "수소 테마", "LCID": "전기차 테마", "AMC": "밈 주식", "GME": "밈 주식"}

# ── 1기 ──
NS["IDLE_RET"] = CASH
m1, _, t1, *_rest, eq1 = sim("t42", "volume", P1, 0.45, 7, start="2023-01-01", end="2023-10-31", close_at_end=True, months=M1, slots_n=4)
e1 = eq1[-1][1]
# ── 2기 ──
NS["IDLE_RET"] = QQQ_IDLE
KEY2 = R.combo_tqqq("ma", "swing")
m2, _, t2, *_rest, eq2 = sim("t42", KEY2, P2, 0.92, 11, start="2023-11-01", end="2026-11-30", cash0=e1, months=M2, slots_n=3)
for t in t1: t["phase"] = 1
for t in t2: t["phase"] = 2
trades = t1 + t2
eq_hist = eq1 + eq2
monthly = m1 + m2

def mdd_of(hist):
    peak, mdd = 0, 0
    for _, e in hist:
        peak = max(peak, e); mdd = min(mdd, e / peak - 1)
    return r2(mdd * 100)

# ── 매매 메모 ──
def vol_ratio(code, d):
    b, I = BARS[code], IND[code]
    k = next(i for i, x in enumerate(b) if x["d"] == d)
    return b[k]["v"] / I["v20"][k - 1] if I["v20"][k - 1] else 0, (b[k]["c"] / b[k - 1]["c"] - 1) * 100

WEAK = ["{n} {g} 소식에 거래량 {v:.1f}배, 하루 {r:+.1f}% 급등. 더 갈 것 같아서 따라 샀음",
        "{n} 오늘 {r:+.1f}%. 커뮤니티에서 다들 산다길래 들어감 (거래량 {v:.1f}배)",
        "{n} 거래량 {v:.1f}배 터짐. {g} 뉴스 나온 듯, 일단 탐",
        "{n} {r:+.1f}% 장대양봉. 놓치면 아까울 것 같아서 샀음"]
for k, t in enumerate(t1):
    v, r = vol_ratio(t["code"], t["entry"]["d"])
    t["entry"]["why"] = WEAK[k % len(WEAK)].format(n=t["name"], g=GROUP[t["code"]], v=v, r=r)
    t["memo"] = "trade"

def money(v): return f"${v:,.2f}"
for t in t2:
    t["memo"] = "trade"
    if t["code"] == "TQQQ":
        t["method"] = "TQQQ 맥점"
        t["entry"]["why"] = f"[방법 2 · 하락장 맥점] {t['entry']['why']}. 손절 {money(t['entry']['stop'])}, 목표 {money(t['entry']['target'])}"
        # 맥점은 나스닥100 가격이라 TQQQ 차트에는 같은 날 TQQQ 저점으로 옮겨 그음
        tb = {x["d"]: x for x in BARS["TQQQ"]}
        for ln in t["lines"]:
            if ln.get("kind") == "hline" and ln["a"][0] in tb:
                v = round(tb[ln["a"][0]]["l"], 2)
                ln["a"] = [ln["a"][0], v]; ln["b"] = [ln["b"][0], v]
                ln["label"] = "맥점: 나스닥100 스윙 저점 날 TQQQ 저점"
    else:
        t["method"] = "골든크로스"
        t["entry"]["why"] = f"[방법 1 · 골든크로스] {t['entry']['why']}. 진입 {money(t['entry']['px'])}, 손절 {money(t['entry']['stop'])}(-7%), 목표 {money(t['entry']['target'])}, 종가가 20일선 아래면 정리"

# ── 전환점 복기 (분석 메모, 2023-10 말) ──
def period_ret(code, a, b):
    xs = [x for x in BARS[code] if a <= x["d"] <= b]
    return (xs[-1]["c"] / xs[0]["o"] - 1) * 100
n1 = len(t1)
loss1 = [t for t in t1 if t["ret"] <= 0]
viol = [t for t in t1 if not t["followed"]]
viol_loss = sum(t["ret"] for t in viol if t["ret"] < 0)
all_loss = sum(t["ret"] for t in loss1)
pool_ret = sum(period_ret(c, "2023-01-01", "2023-10-31") for c in P1) / len(P1)
q_ret = period_ret("QQQ", "2023-01-01", "2023-10-31")
ai_ret = sum(period_ret(c, "2023-01-01", "2023-10-31") for c in E.AI) / len(E.AI)
share = viol_loss / all_loss * 100 if all_loss else 0
turn_text = (f"1기 복기 (2023-01~10). 매매 {n1}건 중 손실 {len(loss1)}건, 계획을 어긴 매매 {len(viol)}건. "
             f"어긴 매매의 손실 합 {viol_loss:+.0f}%p, 전체 손실 합 {all_loss:+.0f}%p의 {share:.0f}%. "
             + ("손절을 안 지킨 매매가 손실의 대부분이었다. " if share >= 50 else "손실은 계획을 어긴 매매만이 아니라 진입 자체에서 났다. ")
             + f"산 종목(바이오 · 테마 6개) 평균 {pool_ret:+.1f}%, 같은 기간 나스닥100 {q_ret:+.1f}%, AI 기술주 7개 평균 {ai_ret:+.1f}%. "
             f"근거 없이 급등만 보고 산 게 문제. 계좌 {(e1 - 1) * 100:+.1f}%에서 멈추고 전략을 바꾼다: "
             "AI 기술주만, 20일선이 60일선을 뚫을 때 사고 손절은 -7%로 정해 둔다. 시장이 크게 빠지면 나스닥100 직전 저점에서 TQQQ로만 받는다.")

# ── 시장 하락기 손실 복기 (2기 손실 매매마다) ──
QB = BARS["QQQ"]; QIx = {x["d"]: k for k, x in enumerate(QB)}
QI_ = IND["QQQ"]
def q_drop(d):
    k = QIx[d]
    hi = max(x["h"] for x in QB[max(0, k - 60): k + 1])
    return (QB[k]["c"] / hi - 1) * 100
reviews = []
for t in t2:
    if t["ret"] >= 0: continue
    d_in, d_out = t["entry"]["d"], t["exit"]["d"]
    if not any(R.DOWN.get(x["d"]) for x in QB if d_in <= x["d"] <= d_out): continue
    md = q_drop(d_out)
    k_in = QIx[d_in]
    below20 = QI_["ma20"][k_in] and QB[k_in]["c"] < QI_["ma20"][k_in]
    cause = "시장 탓이 크다" if abs(md) * (3 if t["code"] == "TQQQ" else 1) >= abs(t["ret"]) * 0.7 else "종목 탓이 크다"
    kept = "계획대로 손절" if t["followed"] else "손절을 늦춤"
    nxt = ("나스닥100이 20일선 아래일 때는 신규 진입 비중을 절반으로" if below20 else
           "급락 첫 주에는 맥점 첫 터치를 건너뛰고 두 번째 지지 확인 뒤 진입" if t["code"] == "TQQQ" else
           "지수가 하락 구간이면 골든크로스 신호도 하루 더 확인")
    reviews.append(dict(type="review", d=d_out, code=t["code"], name=t["name"],
                        text=(f"손실 복기: {t['name']} {d_in} {money(t['entry']['px'])} → {d_out} {money(t['exit']['px'])} ({t['ret']:+.1f}%). "
                              f"같은 때 나스닥100 60일 고점 대비 {md:+.1f}% → {cause}. {kept}해서 손실은 {t['ret']:+.1f}%로 끝남. 다음엔 {nxt}.")))

# ── 2기 종목 노트 (안 산 종목: 피보나치 · 수평선 · 추세선) ──
FIBS = NS["FIB"]
def note_p2(code, mth):
    b, I = BARS[code], IND[code]
    ks = [k for k, x in enumerate(b) if x["d"][:7] == mth]
    if not ks: return None
    k = ks[-1]; c = b[k]["c"]; d = b[k]["d"]; nm = META[code]["name"]
    lo_k = min(range(k - 60, k - 5), key=lambda j: b[j]["l"])
    hi_k = max(range(lo_k + 1, k + 1), key=lambda j: b[j]["h"])
    L, H = b[lo_k]["l"], b[hi_k]["h"]
    m20, m60 = I["ma20"][k], I["ma60"][k]
    gap = (m20 / m60 - 1) * 100 if m20 and m60 else 0
    if H / L >= 1.15 and hi_k < k:
        l5, l618 = H - 0.5 * (H - L), H - 0.618 * (H - L)
        lines = [dict(kind="trend", label="저점→고점", a=[b[lo_k]["d"], px(code, L)], b=[b[hi_k]["d"], px(code, H)])]
        for f in FIBS:
            v = H - f * (H - L)
            lines.append(dict(kind="hline", label=f"피보나치 {f:g}", a=[b[hi_k]["d"], px(code, v)], b=[d, px(code, v)]))
        txt = f"{nm} {money(L)}→{money(H)} 상승분 되돌림. 0.5~0.618({money(l618)}~{money(l5)}) 오면 지지 확인. 지금 {money(c)}, 20일선은 60일선 {gap:+.1f}%."
    else:
        lv = min(x["l"] for x in b[k - 19:k + 1])
        lines = [dict(kind="hline", label="20일 저점 지지", a=[b[k - 19]["d"], px(code, lv)], b=[d, px(code, lv)])]
        lows = NS["swing_lows"](b, k, look=60, w=3)
        if len(lows) >= 2 and b[lows[-1]]["l"] > b[lows[-2]]["l"]:
            a, z = lows[-2], lows[-1]
            lines.append(dict(kind="trend", label="오르는 저점 추세선", a=[b[a]["d"], px(code, b[a]["l"])], b=[b[z]["d"], px(code, b[z]["l"])]))
        txt = (f"{nm} 지금 {money(c)}, 20일 저점 {money(lv)}. 20일선이 60일선보다 {gap:+.1f}% "
               + ("위라 이미 골든크로스 뒤, 추격 안 함." if gap > 0 else "아래, 위로 뚫는 날 진입 검토."))
    return dict(type="stock", d=d, code=code, name=nm, text=txt, lines=lines)

def note_p1(code, mth):
    b = BARS[code]
    ks = [k for k, x in enumerate(b) if x["d"][:7] == mth]
    if not ks: return None
    k = ks[-1]
    mv = (b[k]["c"] / b[ks[0] - 1]["c"] - 1) * 100 if ks[0] else 0
    return dict(type="stock", d=b[k]["d"], code=code, name=META[code]["name"], text=f"{META[code]['name']} 이번 달 {mv:+.1f}%. 뉴스 뜨면 다시 볼 것", lines=[])

# ── 월별 ──
def month_ind2(code, mth, back=25):
    out = NS["month_ind"](code, mth, ["macd", "rsi"], back)
    b, I = BARS[code], IND[code]
    ks = [k for k, x in enumerate(b) if x["d"][:7] == mth]
    if ks:
        rng = range(max(0, ks[0] - back), ks[-1] + 1)
        out["ma"] = {str(n): [px(code, I[f"ma{n}"][k]) if I[f"ma{n}"][k] else None for k in rng] for n in (5, 20, 60, 120, 200)}
    return out

TITLE = NS["TITLE"]
months = []
for mth in E.MONTHS:
    p1 = mth <= T1_END
    pool = P1 if p1 else P2
    tr = t1 if p1 else t2
    mt = [t for t in tr if t["entry"]["d"][:7] == mth]
    carried = [t for t in tr if t["entry"]["d"][:7] < mth <= t["exit"]["d"][:7]]
    ret = next(x["ret"] for x in monthly if x["month"] == mth)
    main = max(pool, key=lambda c: sum(1 for t in mt if t["code"] == c)) if mt else pool[E.MONTHS.index(mth) % len(pool)]
    rr = random.Random(f"t42{mth}")
    NS["US_POOL"] = [c for c in pool if c != "TQQQ"]
    # 1기는 분석 메모가 거의 없음 (증시 메모 없이 짧은 종목 메모만)
    notes = [] if p1 else NS["market_memos"]("US", mth, rr)
    traded = {t["code"] for t in mt}
    for c in pool:
        if c in traded or c == "TQQQ": continue
        n_ = note_p1(c, mth) if p1 else note_p2(c, mth)
        if n_: notes.append(n_)
    for t in carried:
        done = t["exit"]["d"][:7] == mth
        notes.append(dict(type="carry", d=t["exit"]["d"] if done else mth + "-01", code=t["code"], name=t["name"],
                          text=(f"{t['entry']['d'][:7].replace('-', '년 ')}월에 산 {t['name']}({money(t['entry']['px'])}) — {t['exit']['d']} {t['exit']['why']} ({t['ret']:+.2f}%)."
                                if done else f"{t['entry']['d'][:7].replace('-', '년 ')}월에 산 {t['name']} 계속 보유 (진입가 {money(t['entry']['px'])}).")))
    notes += [x for x in reviews if x["d"][:7] == mth]
    if mth == T1_END:
        notes.append(dict(type="review", d=eq1[-1][0], text=turn_text))
    notes.sort(key=lambda x: x["d"])
    if mt:
        wins = sum(1 for t in mt if t["ret"] > 0)
        best = max(mt, key=lambda t: t["ret"])
        rule_name = "급등 따라 사기" if p1 else ("TQQQ 맥점" if all(t["code"] == "TQQQ" for t in mt) else "골든크로스")
        pool_t = TITLE[True] if best["ret"] > 0 else ["{sym} {rule}, 손절로 지킨 {n}번", "{sym}에서 {rule} 기준대로 끊은 달"]
        if p1: pool_t = ["{sym} {rule} {n}번", "{sym} 따라 산 {n}번"]
        title = rr.choice(pool_t).format(sym=META[main]["name"], rule=rule_name, n=len(mt), w=wins, best=f"{best['ret']:+.1f}%")
    else:
        title = "신호가 없어 쉬어 간 달" if not p1 else "따라 살 급등이 없던 달"
    if mth == T1_END: title = "1기 복기: 급등 추격을 멈춘 달"
    if mth == "2023-11": title = "AI 기술주 골든크로스로 다시 시작"
    summary = f"매매 {len(mt)}건 · 노트 {sum(1 for x in notes if x['type'] != 'carry')}개"
    follow_m = round(sum(t["followed"] for t in mt) / len(mt) * 100) if mt else 100
    months.append(dict(month=mth, title=title, summary=summary, ret=ret, follow=follow_m, phase=1 if p1 else 2,
                       symbol=dict(code=main, name=META[main]["name"]),
                       candles=NS["month_candles"](main, mth, 25), ind=month_ind2(main, mth), trades=mt, notes=notes))

# ── 요약 ──
eq = [round(e * 10000) for _, e in eq_hist]
m_idx = {}
for k, (d, _) in enumerate(eq_hist): m_idx.setdefault(d[:7], k)
n = len(trades)
follow = round(sum(t["followed"] for t in trades) / n * 100)
def hold(t): return (date.fromisoformat(t["exit"]["d"]) - date.fromisoformat(t["entry"]["d"])).days
best = max(trades, key=lambda t: t["ret"]); worst = min(trades, key=lambda t: t["ret"])
RULE = "골든크로스 · 하락장 TQQQ 맥점"
RULE_DESC = ("AI 기술주는 20일선이 60일선을 위로 뚫을 때 사고(손절 -7%, 종가가 20일선 아래면 정리), "
             "나스닥이 급락하면 나스닥100 직전 스윙 저점(맥점)에서 양봉 지지를 확인하고 TQQQ를 산다(손절 -9%, 직전 고점 회복이 목표).")
syms = [META[c]["name"] for c in P2]
summary = dict(persona=None, eq=eq, mIdx=m_idx, asOf=eq_hist[-1][0], monthly=monthly, mdd=mdd_of(eq_hist), trades=n, follow=follow,
               rule=RULE, ruleDesc=RULE_DESC, symbols=syms,
               months=[dict(month=x["month"], title=x["title"], summary=x["summary"], follow=x["follow"], stats=NS["month_stats"](x),
                            trades=len(x["trades"]), symbols=sorted({t["name"] for t in x["trades"]}),
                            sample=(x["trades"][0]["entry"]["why"] if x["trades"] else next((nn["text"] for nn in x["notes"] if nn["type"] in ("stock", "review")), "")))
                       for x in months],
               facts=dict(wins=sum(1 for t in trades if t["ret"] > 0), losses=sum(1 for t in trades if t["ret"] <= 0),
                          best=dict(name=best["name"], ret=best["ret"], d=best["entry"]["d"]), worst=dict(name=worst["name"], ret=worst["ret"], d=worst["entry"]["d"]),
                          followed=sum(1 for t in trades if t["followed"]), avgHold=round(sum(hold(t) for t in trades) / n, 1)))
detail = dict(id="t42", market="US", rule=dict(key=KEY2, name=RULE, desc=RULE_DESC), symbols=[dict(code=c, name=META[c]["name"]) for c in P2],
              phases=[dict(n=1, from_="2023-01", to=T1_END, label="바이오 · 테마 급등 추격", symbols=[META[c]["name"] for c in P1]),
                      dict(n=2, from_="2023-11", to="2026-11", label="AI 기술주 골든크로스 · TQQQ 맥점", symbols=syms)],
              revisions=[dict(d="2023-11-01", kind="UPDATE", text=turn_text)],
              months=months)

ROOT = E.ROOT
sim_path = os.path.join(ROOT, "app", "marketplace", "sim.json")
S = json.load(open(sim_path, encoding="utf-8"))
S["t42"] = summary
json.dump(S, open(sim_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(detail, open(os.path.join(ROOT, "data", "market-sim", "t42.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# ── 결과 보고 ──
def stat(ts, hist, label):
    nn = len(ts)
    return (f"{label}: 수익 {(hist[-1][1] / (hist[0][1] if label.startswith('2') else 1.0) - 1) * 100:+.1f}% · MDD {mdd_of(hist)}% · 매매 {nn} · "
            f"이행률 {sum(t['followed'] for t in ts) / nn * 100:.0f}% · 승률 {sum(t['ret'] > 0 for t in ts) / nn * 100:.0f}% ({sum(t['ret'] > 0 for t in ts)}승 {sum(t['ret'] <= 0 for t in ts)}패)")
print(stat(t1, eq1, "1기 2023-01~10"))
print(f"2기 2023-11~2026-11: 수익 {(eq2[-1][1] / e1 - 1) * 100:+.1f}% · MDD {mdd_of(eq2)}% · 매매 {len(t2)} · 이행률 {sum(t['followed'] for t in t2) / len(t2) * 100:.0f}% · 승률 {sum(t['ret'] > 0 for t in t2) / len(t2) * 100:.0f}% ({sum(t['ret'] > 0 for t in t2)}승 {sum(t['ret'] <= 0 for t in t2)}패)")
print(f"전체: {(eq_hist[-1][1] - 1) * 100:+.1f}% · MDD {mdd_of(eq_hist)}% · 매매 {n} · 이행률 {follow}%")
print(f"복기 메모: 전환점 1 + 하락기 손실 {len(reviews)}")
print("월별 노트 수 최소:", min(sum(1 for x in m['notes'] if x['type'] != 'carry') + len(m['trades']) for m in months),
      "| 5개 미만 달:", [m["month"] for m in months if sum(1 for x in m['notes'] if x['type'] != 'carry') + len(m['trades']) < 5])
print(turn_text)
