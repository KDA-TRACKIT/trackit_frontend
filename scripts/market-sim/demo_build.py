"""
데모 판매자 9명 (2026-11-20 사용자 결정: 기존 41명 → 9명, 어진냥이처럼 정교하게). 시장마다 한 번씩 실행
  TRACKIT_CANDLES=data/market-sim-demo/KR TRACKIT_MKT=KRMKT python demo_build.py KR
  TRACKIT_CANDLES=data/market-sim-demo/US TRACKIT_MKT=SPY   python demo_build.py US
  - 한 사람 = 한 섹터 · 한 규칙(sim.py R_*), 2023-01 ~ 2026-11, 실제 일봉(수정주가). 쉬는 돈은 시장 기준(국내 대형주 바스켓 / SPY)
  - 메모: 매매 메모(진입 근거 · 손절 · 목표), 안 산 종목 노트(피보나치 · 수평선 · 추세선), 증시 메모, 시장 하락 구간 손실 복기
  - 전략 = 판매자가 섹터 안에서 끊은 기간 (메모가 memos 개 쌓인 달 끝에서 끊음, 사람마다 다름). 다음 전략은 직전 전략 끝부터 (eojin_lib.cut_strategies · DB 시드에 씀)
  숫자는 전부 코드 계산, 문장은 그 숫자로만
출력: app/marketplace/sim.json 의 t1~t9 (기존 t1~t41 키는 이 스크립트가 지우고 t42 어진냥이는 그대로), data/market-sim/t1~t9.json
"""
import json, os, random, sys
from datetime import date
import eojin_lib as E
import eojin_rules as R

MK = sys.argv[1]
NS = E.NS
BARS, IND, META, px, r2 = NS["BARS"], NS["IND"], NS["META"], NS["px"], NS["r2"]
sim = NS["simulate2"]

TRADERS = {
    "KR": [
        dict(id="t1", name="깃발러너", sector="반도체", rule="flag", follow=0.9, seed=11, memos=25, pool=["005930", "000660", "042700", "000990", "058470"]),
        dict(id="t2", name="트렌드픽", sector="2차전지", rule="box", follow=0.84, seed=12, memos=30, pool=["373220", "086520", "247540", "003670", "006400"]),
        dict(id="t3", name="밸류버스", sector="바이오", rule="value", follow=0.93, seed=13, memos=40, pool=["068270", "196170", "028300", "207940", "000100"]),
        dict(id="t4", name="원트로그", sector="자동차", rule="pullback", follow=0.8, seed=14, memos=20, pool=["005380", "000270", "012330", "204320"]),
        dict(id="t5", name="황금비노트", sector="방산 · 조선", rule="fib", follow=0.88, seed=15, memos=35, pool=["012450", "329180", "079550", "064350", "042660"]),
        dict(id="t6", name="MACD리버설", sector="금융", rule="macd", follow=0.95, seed=16, memos=30, pool=["105560", "055550", "086790", "316140", "138040"]),
        dict(id="t7", name="볼밴헌터", sector="인터넷 · 게임", rule="bb", follow=0.86, seed=17, memos=25, pool=["035420", "035720", "259960", "036570"]),
    ],
    "US": [
        dict(id="t8", name="스윙도크", sector="미국 빅테크", rule="weekly", follow=0.9, seed=18, memos=30, pool=["AAPL", "MSFT", "GOOGL", "AMZN", "META"]),
        dict(id="t9", name="모멘텀랩", sector="미국 헬스케어", rule="ma", follow=0.92, seed=19, memos=45, pool=["LLY", "UNH", "JNJ", "ABBV", "MRK"]),
    ],
}[MK]
SLOTS = 3
MONTHS = E.MONTHS
money = (lambda v: f"${v:,.2f}") if MK == "US" else (lambda v: f"{int(round(v)):,}원")
MKT_NAME = "국내 대형주" if MK == "KR" else "S&P500"
QB = BARS[E.MKT]
QIx = {x["d"]: k for k, x in enumerate(QB)}


def mdd_of(hist):
    peak, mdd = 0, 0
    for _, e in hist:
        peak = max(peak, e); mdd = min(mdd, e / peak - 1)
    return r2(mdd * 100)


def m_drop(d):
    k = QIx.get(d)
    if k is None: return 0.0
    hi = max(x["h"] for x in QB[max(0, k - 60): k + 1])
    return (QB[k]["c"] / hi - 1) * 100


def stock_note(code, mth):
    """안 산 종목: 60일 저점→고점이 15% 넘으면 피보나치, 아니면 20일 저점 수평선 + 오르는 저점 추세선"""
    b, I = BARS[code], IND[code]
    ks = [k for k, x in enumerate(b) if x["d"][:7] == mth]
    if not ks or ks[-1] < 70: return None
    k = ks[-1]; c = b[k]["c"]; d = b[k]["d"]; nm = META[code]["name"]
    lo_k = min(range(k - 60, k - 5), key=lambda j: b[j]["l"])
    hi_k = max(range(lo_k + 1, k + 1), key=lambda j: b[j]["h"])
    L, H = b[lo_k]["l"], b[hi_k]["h"]
    m20, m60 = I["ma20"][k], I["ma60"][k]
    gap = (m20 / m60 - 1) * 100 if m20 and m60 else 0
    if H / L >= 1.15 and hi_k < k:
        l5, l618 = H - 0.5 * (H - L), H - 0.618 * (H - L)
        lines = [dict(kind="trend", label="저점→고점", a=[b[lo_k]["d"], px(code, L)], b=[b[hi_k]["d"], px(code, H)])]
        for f in NS["FIB"]:
            v = H - f * (H - L)
            lines.append(dict(kind="hline", label=f"피보나치 {f:g}", a=[b[hi_k]["d"], px(code, v)], b=[d, px(code, v)]))
        txt = f"{nm} {money(L)}→{money(H)} 상승분 되돌림. 0.5~0.618({money(l618)}~{money(l5)}) 오면 지지 확인. 지금 {money(c)}."
    else:
        lv = min(x["l"] for x in b[k - 19:k + 1])
        lines = [dict(kind="hline", label="20일 저점 지지", a=[b[k - 19]["d"], px(code, lv)], b=[d, px(code, lv)])]
        lows = NS["swing_lows"](b, k, look=60, w=3)
        if len(lows) >= 2 and b[lows[-1]]["l"] > b[lows[-2]]["l"]:
            a, z = lows[-2], lows[-1]
            lines.append(dict(kind="trend", label="오르는 저점 추세선", a=[b[a]["d"], px(code, b[a]["l"])], b=[b[z]["d"], px(code, b[z]["l"])]))
        txt = f"{nm} 지금 {money(c)}, 20일 저점 {money(lv)}. 20일선은 60일선 대비 {gap:+.1f}%, 규칙 신호 없어 관찰."
    return dict(type="stock", d=d, code=code, name=nm, text=txt, lines=lines)


def build(cfg):
    rule_fn, rule_name, rule_desc = NS["RULES"][cfg["rule"]]
    pool = cfg["pool"]
    monthly, mdd, trades, _rn, _rd, eq = sim(cfg["id"], cfg["rule"], pool, cfg["follow"], cfg["seed"], start="2023-01-01", end="2026-11-30", months=MONTHS, slots_n=SLOTS)
    for t in trades:
        t["memo"] = "trade"
        st, tg = t["entry"].get("stop"), t["entry"].get("target")
        t["entry"]["why"] = f"[{rule_name}] {t['entry']['why']}. 진입 {money(t['entry']['px'])}" + (f", 손절 {money(st)}" if st else "") + (f", 목표 {money(tg)}" if tg else "")
    # 시장 하락 구간 손실 복기
    reviews = []
    for t in trades:
        if t["ret"] >= 0: continue
        d_in, d_out = t["entry"]["d"], t["exit"]["d"]
        if not any(R.DOWN.get(x["d"]) for x in QB if d_in <= x["d"] <= d_out): continue
        md = m_drop(d_out)
        cause = "시장 탓이 크다" if abs(md) >= abs(t["ret"]) * 0.7 else "종목 탓이 크다"
        kept = "계획대로 손절" if t["followed"] else "손절을 늦춤"
        k_in = QIx.get(d_in)
        below = k_in is not None and IND[E.MKT]["ma20"][k_in] and QB[k_in]["c"] < IND[E.MKT]["ma20"][k_in]
        nxt = f"{MKT_NAME}이 20일선 아래일 때는 신규 진입 비중을 절반으로" if below else "시장이 하락 구간이면 신호를 하루 더 확인"
        reviews.append(dict(type="review", d=d_out, code=t["code"], name=t["name"],
                            text=f"손실 복기: {t['name']} {d_in} {money(t['entry']['px'])} → {d_out} {money(t['exit']['px'])} ({t['ret']:+.1f}%). 같은 때 {MKT_NAME} 60일 고점 대비 {md:+.1f}% → {cause}. {kept}해서 {t['ret']:+.1f}%로 끝남. 다음엔 {nxt}."))
    months = []
    for mth in MONTHS:
        mt = [t for t in trades if t["entry"]["d"][:7] == mth]
        carried = [t for t in trades if t["entry"]["d"][:7] < mth <= t["exit"]["d"][:7]]
        ret = next(x["ret"] for x in monthly if x["month"] == mth)
        main = max(pool, key=lambda c: sum(1 for t in mt if t["code"] == c)) if mt else pool[MONTHS.index(mth) % len(pool)]
        rr = random.Random(f"{cfg['id']}{mth}")
        notes = NS["market_memos"](MK, mth, rr)
        traded = {t["code"] for t in mt}
        for c in pool:
            if c in traded: continue
            n_ = stock_note(c, mth)
            if n_: notes.append(n_)
        for t in carried:
            done = t["exit"]["d"][:7] == mth
            if not done: continue  # 아직 들고 있는 종목은 '보유 중'으로 드러내지 않음 (사후 공개: 청산한 달에만 남김, 2026-11-21)
            notes.append(dict(type="carry", d=t["exit"]["d"] if done else mth + "-01", code=t["code"], name=t["name"],
                              text=(f"{t['entry']['d'][:7].replace('-', '년 ')}월에 산 {t['name']}({money(t['entry']['px'])}) — {t['exit']['d']} {t['exit']['why']} ({t['ret']:+.2f}%)."
                                    if done else f"{t['entry']['d'][:7].replace('-', '년 ')}월에 산 {t['name']} 계속 보유 (진입가 {money(t['entry']['px'])}).")))
        notes += [x for x in reviews if x["d"][:7] == mth]
        notes.sort(key=lambda x: x["d"])
        if mt:
            wins = sum(1 for t in mt if t["ret"] > 0)
            best = max(mt, key=lambda t: t["ret"])
            pool_t = NS["TITLE"][True] if best["ret"] > 0 else ["{sym} {rule}, 손절로 지킨 {n}번", "{sym}에서 {rule} 기준대로 끊은 달"]
            title = rr.choice(pool_t).format(sym=META[main]["name"], rule=rule_name, n=len(mt), w=wins, best=f"{best['ret']:+.1f}%")
        else:
            title = rr.choice(NS["TITLE"][False]).format(rule=rule_name)
        summary = f"매매 {len(mt)}건 · 노트 {sum(1 for x in notes if x['type'] != 'carry')}개"
        follow_m = round(sum(t["followed"] for t in mt) / len(mt) * 100) if mt else 100
        ind = NS["month_ind"](main, mth, ["macd", "rsi"], 25)
        ks = [k for k, x in enumerate(BARS[main]) if x["d"][:7] == mth]
        if ks:
            rng = range(max(0, ks[0] - 25), ks[-1] + 1)
            ind["ma"] = {str(n): [px(main, IND[main][f"ma{n}"][k]) if IND[main][f"ma{n}"][k] else None for k in rng] for n in (5, 20, 60, 120, 200)}
        months.append(dict(month=mth, title=title, summary=summary, ret=ret, follow=follow_m, symbol=dict(code=main, name=META[main]["name"]),
                           candles=NS["month_candles"](main, mth, 25), ind=ind, trades=mt, notes=notes))
    # 전략 = 판매자가 섹터 안에서 끊은 기간 (메모가 cfg["memos"]개 쌓인 달 끝에서 끊음, 다음 전략은 직전 끝부터)
    strategies, strategy_cards = E.cut_strategies(months, monthly, cfg["sector"], rule_name, cfg["memos"], "2026-12-01")
    for k, (a, b) in enumerate(zip(strategies, strategy_cards)): a["key"] = b["key"] = f"s{k + 1}"
    eqv = [round(e * 10000) for _, e in eq]
    m_idx = {}
    for k, (d, _) in enumerate(eq): m_idx.setdefault(d[:7], k)
    n = len(trades)
    follow = round(sum(t["followed"] for t in trades) / n * 100) if n else 100
    hold = lambda t: (date.fromisoformat(t["exit"]["d"]) - date.fromisoformat(t["entry"]["d"])).days
    best = max(trades, key=lambda t: t["ret"]); worst = min(trades, key=lambda t: t["ret"])
    summary = dict(persona=None, eq=eqv, mIdx=m_idx, asOf=eq[-1][0], monthly=monthly, mdd=mdd_of(eq), trades=n, follow=follow,
                   rule=rule_name, ruleDesc=rule_desc, symbols=[META[c]["name"] for c in pool], sector=cfg["sector"], strategies=strategy_cards,
                   months=[dict(month=x["month"], title=x["title"], summary=x["summary"], follow=x["follow"], stats=NS["month_stats"](x),
                                trades=len(x["trades"]), symbols=sorted({t["name"] for t in x["trades"]}),
                                sample=(x["trades"][0]["entry"]["why"] if x["trades"] else next((nn["text"] for nn in x["notes"] if nn["type"] in ("stock", "review")), "")))
                           for x in months],
                   facts=dict(wins=sum(1 for t in trades if t["ret"] > 0), losses=sum(1 for t in trades if t["ret"] <= 0),
                              best=dict(name=best["name"], ret=best["ret"], d=best["entry"]["d"]), worst=dict(name=worst["name"], ret=worst["ret"], d=worst["entry"]["d"]),
                              followed=sum(1 for t in trades if t["followed"]), avgHold=round(sum(hold(t) for t in trades) / n, 1)))
    detail = dict(id=cfg["id"], market=MK, sector=cfg["sector"], rule=dict(key=cfg["rule"], name=rule_name, desc=rule_desc),
                  symbols=[dict(code=c, name=META[c]["name"]) for c in pool], strategies=strategies, revisions=[], slots=SLOTS, months=months)
    print(f"{cfg['id']} {cfg['name']} {cfg['sector']} {rule_name}: 전체 {(eq[-1][1] - 1) * 100:+.1f}% · MDD {mdd_of(eq)}% · 매매 {n} · 이행률 {follow}% · {summary['facts']['wins']}승 {summary['facts']['losses']}패 · 복기 {len(reviews)} · 전략 {len(strategies)}개 · 달별 노트 최소 {min(sum(1 for x in m['notes'] if x['type'] != 'carry') + len(m['trades']) for m in months)}")
    return summary, detail


ROOT = E.ROOT
sim_path = os.path.join(ROOT, "app", "marketplace", "sim.json")
S = json.load(open(sim_path, encoding="utf-8"))
# 기존 시뮬레이션 트레이더(t1~t41)는 9명으로 대체 (t42 어진냥이는 그대로)
KEEP = {"t42"} | {f"t{i}" for i in range(1, 10)}
for k in [k for k in S if k not in KEEP]:
    del S[k]
for cfg in TRADERS:
    summary, detail = build(cfg)
    S[cfg["id"]] = summary
    json.dump(detail, open(os.path.join(ROOT, "data", "market-sim", f"{cfg['id']}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(S, open(sim_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("sim.json keys:", sorted(S, key=lambda k: int(k[1:])))
