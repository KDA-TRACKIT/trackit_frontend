"""
공개 자료로 다시 구성한 가명 판매자(t43 미리미리 · t44 정렬주의자 · t45 엠빅딜) → 전략 마켓 데이터 (2026-11-21)
  입력  data/market-sim-public/sellers/tNN.json — 백엔드 scripts/public-sellers/data 와 같은 파일 (매매 · 노트 · 추정 시작 보유분)
        data/market-sim-public/closes/{종목}.json — 저장소 일봉(market-data/daily)의 종가 [날짜, 종가], 2026-11-12까지
  출력  (추가만, 다른 트레이더 키 · 파일은 그대로) app/marketplace/sim.json 의 tNN, data/market-sim/tNN.json
  규칙
    - 숫자는 넣은 매매와 종가로만 계산. 평가금(eq)은 시간가중 수익률: 매수 · 매도로 들고 나는 돈은 수익에서 뺌
      추정 시작 보유분은 그날 종가에 산 것으로 봄 (매매로는 안 셈, 기간 시작 뒤 수익만)
    - 안 판 물량은 '보유 중' 매매: exit = 기준일(마지막 종가)로 평가, open = true (화면은 매도로 그리지 않음)
      일부만 판 매수는 판 몫(청산)과 남은 몫(보유 중)으로 나눔
    - 사전 기록(entry.why): DB 적재와 같은 판정 — 같은 종목 일지에서 주문 전에 확정된, 관찰이 아닌 가장 최근 노트 — 이 있는 매매만
    - 계획대로(followed): 주문 전 계획 노트의 가격과 ±1.5% 안이면 true, 벗어나면 false, 계획이 없으면 null (이행률에서 빼고 '—')
    - 시각은 DB 적재와 같게: 노트는 날짜마다 18:00 KST 부터 1분씩, 매매는 15:20 KST 부터 10초씩 (주문 = 체결 1분 전)
    - 전략 = 판매자가 끊은 기간 (아래 PLAN). 노트가 없는 긴 보유 기간은 전략으로 팔지 않음 (빈 전략을 만들지 않음)
    - 달 기록에 일봉은 넣지 않음 (candles = []): 화면이 열 때 일봉 API(/charts/{종목}/bars)로 받음
실행: python3 scripts/market-sim/public_build.py
"""
import json, os
from collections import Counter
from datetime import date, datetime, timedelta

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SRC = os.path.join(ROOT, "data", "market-sim-public")
AS_OF = "2026-11-12"
MARKET = "MARKET"

# ── 판매자마다: 매매 규칙(한 줄 이름 · 설명), 종목 섹터, 전략(제목 · 기간 [시작, 끝)), 특별한 달 제목 ──
PLAN = {
    "t43": dict(
        rule=("나눠 사서 오래 보유", "저평가된 국내 중소형주를 여러 번에 나눠 모으고, 지분이 커지면 대량보유 보고로 알린다. 판 기록 없이 들고 간다."),
        sectors={"026890": "금융", "079940": "IT 서비스"},
        strategies=[("스틱인베스트먼트 꾸준히 모으기", "2025-04-01", "2025-08-01"),
                    ("스틱인베스트먼트 · 가비아 지분 모으기", "2025-08-01", "2026-01-01"),
                    ("스틱인베스트먼트 최대주주 되기", "2026-01-01", "2026-08-01"),
                    ("가비아 매각 계약 · 보유 점검", "2026-10-01", "2026-12-01")],
        titles={"2026-01": "창업 회장 지분을 12,600원에 사기로 계약", "2026-03": "창업 회장 지분 인수로 최대주주가 됨",
                "2026-10": "가비아 보유분을 53,000원에 넘기기로 계약", "2026-11": "보유 점검 · 시장 노트"},
    ),
    "t44": dict(
        rule=("공개 요구 · 공개매수 참여", "지분을 가진 회사에 공개 서한으로 주주환원과 지배구조 개선을 요구하고, 가격이 정해진 공개매수가 오면 적어 둔 계획 가격에 참여한다."),
        sectors={"175330": "금융", "244920": "금융", "079940": "IT 서비스"},
        strategies=[("JB금융 2대 주주로 주주환원 요구", "2022-05-01", "2023-07-01"),
                    ("에이플러스에셋 · 가비아 공개매수", "2025-11-01", "2026-01-01"),
                    ("가비아 중복상장 해소 요구 · 매각 합의", "2026-07-01", "2026-11-01"),
                    ("JB금융 일부 차익 실현 · 보유 점검", "2026-11-01", "2026-12-01")],
        titles={"2022-05": "JB금융 지분 14%를 블록으로 넘겨받음", "2023-04": "이사회에 공개 서한", "2025-11": "에이플러스에셋 · 가비아 공개매수 시작",
                "2025-12": "두 공개매수 결과대로 삼", "2026-10": "가비아 매각 합의", "2026-11": "JB금융 300만주 블록딜 · 보유 점검"},
    ),
    "t45": dict(
        rule=("공개매수로 한 번에 사기", "살 가격과 수량을 공개매수로 먼저 발표하고, 발표한 값에 한 번에 산다. 산 뒤에는 팔지 않고 들고 간다."),
        sectors={"010130": "소재 · 비철"},
        strategies=[("고려아연 공개매수", "2024-09-01", "2024-11-01"),
                    ("고려아연 보유 · 실적 점검", "2026-10-01", "2026-12-01")],
        titles={"2024-09": "공개매수 시작, 가격을 75만원으로 올림", "2024-10": "83만원으로 다시 올려 1,105,163주를 삼"},
    ),
}


def r2(x):
    return round(x + 0.0, 2)


def months_between(a, b):
    """a, b = 'YYYY-MM' (둘 다 포함)"""
    y, m = int(a[:4]), int(a[5:7])
    out = []
    while f"{y}-{m:02d}" <= b:
        out.append(f"{y}-{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def load_closes(code):
    rows = json.load(open(os.path.join(SRC, "closes", f"{code}.json"), encoding="utf-8"))
    return {d: c for d, c in rows}


def build(tid):
    D = json.load(open(os.path.join(SRC, "sellers", f"{tid}.json"), encoding="utf-8"))
    P = PLAN[tid]
    name_of = {s["code"]: s["name"] for s in D["symbols"]}
    codes = [s["code"] for s in D["symbols"]]
    closes = {c: load_closes(c) for c in codes}

    # ── 시각 (gen_sql.mjs 와 같은 규칙) ──
    per = Counter()
    notes = []
    for k, n in enumerate(D["notes"]):
        i = per[n["d"]]
        per[n["d"]] += 1
        notes.append(dict(n, k=k, at=datetime.fromisoformat(n["d"]) + timedelta(hours=18, minutes=i)))
    per = Counter()
    trades = []
    for k, t in sorted(enumerate(D["trades"]), key=lambda x: (x[1]["d"], x[0])):
        i = per[t["d"]]
        per[t["d"]] += 1
        fill = datetime.fromisoformat(t["d"]) + (timedelta(hours=int(t["time"][:2]), minutes=int(t["time"][3:5])) if t.get("time") else timedelta(hours=15, minutes=20, seconds=10 * i))
        trades.append(dict(t, k=k, fill=fill, order=fill - timedelta(minutes=1)))

    # ── 판정 (lib/notes/service.ts judge · gen_sql.mjs 와 같게) ──
    for t in trades:
        before = [n for n in notes if n["code"] == t["code"] and n["at"] < t["order"]]
        basis = [n for n in before if n["kind"] != "observe"]
        plans = [n for n in before if n["kind"] == "plan" and n.get("entry")]
        t["basis"] = basis[-1] if basis else None
        plan = plans[-1] if plans else None
        side = "SELL" if plan and plan.get("direction") == "SHORT" else "BUY"
        t["plan"] = plan
        t["followed"] = (abs(t["px"] / plan["entry"] - 1) <= 0.015) if plan and side == t["side"] else None

    first_line = lambda s: s.split("\n")[0].strip()
    money = lambda v: f"{v:,.0f}원"

    # ── 거래일 · 종가 ──
    start_m = min([n["d"][:7] for n in notes] + [t["d"][:7] for t in trades] + [h["d"][:7] for h in D.get("start_holdings") or []])
    days = sorted({d for c in codes for d in closes[c] if start_m <= d[:7] and d <= AS_OF})
    last_close = {}

    def close_on(code, d):
        """그날(없으면 그 전 마지막) 종가"""
        if d in closes[code]:
            return closes[code][d]
        prev = [x for x in closes[code] if x <= d]
        if not prev:
            raise SystemExit(f"{tid}: {code} {d} 종가 없음")
        return closes[code][max(prev)]

    # ── 평가금: 시간가중 수익률 (추정 시작 보유분 + 매수는 들어온 돈, 매도는 나간 돈) ──
    flows = {}
    for h in D.get("start_holdings") or []:
        flows.setdefault(h["d"], []).append((h["code"], h["qty"], h["px"]))
    for t in trades:
        flows.setdefault(t["d"], []).append((t["code"], t["qty"] if t["side"] == "BUY" else -t["qty"], t["px"]))
    for d in flows:
        if d < days[0]:
            raise SystemExit(f"{tid}: {d} 매매가 거래일 범위({days[0]}~) 전")
    qty = Counter()
    eq, e, prev_v = [], 1.0, 0.0
    for d in days:
        f = 0.0
        for code, q, px in flows.get(d, []):
            qty[code] += q
            f += q * px
        v = sum(q * close_on(c, d) for c, q in qty.items() if q)
        if prev_v > 0:
            r = (v - f) / prev_v - 1
        elif f > 0:
            r = v / f - 1
        else:
            r = 0.0
        e *= 1 + r
        eq.append((d, e))
        prev_v = v
    m_idx = {}
    for k, (d, _) in enumerate(eq):
        m_idx.setdefault(d[:7], k)
    month_end = {}
    for d, val in eq:
        month_end[d[:7]] = val
    all_months = months_between(start_m, AS_OF[:7])
    monthly, prev = [], 1.0
    for m in all_months:
        val = month_end.get(m, prev)
        monthly.append(dict(month=m, ret=r2((val / prev - 1) * 100)))
        prev = val
    peak, mdd = 0.0, 0.0
    for _, val in eq:
        peak = max(peak, val)
        mdd = min(mdd, val / peak - 1)

    # ── 매매 → 마켓 매매(진입 · 청산 한 쌍). 매도는 먼저 산 것부터 (일부만 판 매수는 나눔) ──
    lots, recs = [], []
    for t in trades:
        if t["side"] == "BUY":
            lots.append(dict(t=t, left=t["qty"]))
            continue
        need = t["qty"]
        for lot in lots:
            if lot["t"]["code"] != t["code"] or lot["left"] <= 0 or need <= 0:
                continue
            q = min(need, lot["left"])
            lot["left"] -= q
            need -= q
            recs.append(dict(buy=lot["t"], sell=t, qty=q))
        if need > 0:
            raise SystemExit(f"{tid}: {t['d']} {t['code']} 매도 수량이 산 수량보다 많음 (추정 시작 보유분 매도는 아직 안 다룸)")
    for lot in lots:
        if lot["left"] > 0:
            recs.append(dict(buy=lot["t"], sell=None, qty=lot["left"]))
    recs.sort(key=lambda r: (r["buy"]["fill"], r["sell"]["fill"] if r["sell"] else datetime.max))

    def plan_line(t):
        p = t["plan"]
        if not p:
            return []
        short = p.get("direction") == "SHORT"
        return [dict(kind="hline", label=f"{'매도' if short else '매수'} 계획가 {money(p['entry'])}", a=[p["d"], p["entry"]], b=[t["d"], p["entry"]])]

    def why(t):
        b = t["basis"]
        if not b:
            return ""
        return first_line(b["text"]) if b["d"] == t["d"] else f"({b['d'][5:7]}/{b['d'][8:10]} 노트) {first_line(b['text'])}"

    sim_trades = []
    for r in recs:
        b, s = r["buy"], r["sell"]
        held = s is None
        exit_px = close_on(b["code"], AS_OF) if held else s["px"]
        if held:
            split = any(x["buy"] is b and x["sell"] is not None for x in recs)  # 일부만 판 매수의 남은 몫
            left = f"남은 {r['qty']:,}주 " if split else ""
            exit_ = dict(d=AS_OF, px=exit_px, why=f"{left}보유 중 — {AS_OF} 종가로 평가 (아직 팔지 않음)")
        else:
            same_day = [n for n in notes if n["code"] == s["code"] and n["d"] == s["d"]]
            exit_ = dict(d=s["d"], px=s["px"], why=first_line(same_day[0]["text"]) if same_day else "매도")
        followed = s["followed"] if s is not None and s["followed"] is not None else b["followed"]
        tr = dict(code=b["code"], name=name_of[b["code"]], entry=dict(d=b["d"], px=b["px"], why=why(b)), exit=exit_,
                  ret=r2((exit_px / b["px"] - 1) * 100), followed=followed, lines=plan_line(b) + (plan_line(s) if s else []), memo="trade")
        if held:
            tr["open"] = True
        tr["_qty"] = r["qty"]
        sim_trades.append(tr)

    # ── 노트 → 마켓 노트 ──
    TYPE = {"plan": "stock", "analysis": "stock", "observe": "stock", "review": "review", "market": "market"}

    def sim_note(n):
        out = dict(type=TYPE[n["kind"]], d=n["d"], text=n["text"].strip())
        if n["code"] != MARKET:
            out.update(code=n["code"], name=name_of[n["code"]])
        lines = []
        if n["kind"] == "plan" and n.get("entry") and n["d"] <= AS_OF:
            end = min([d for d in days if d[:7] == n["d"][:7]][-1] if any(d[:7] == n["d"][:7] for d in days) else AS_OF, AS_OF)
            short = n.get("direction") == "SHORT"
            if end > n["d"]:
                lines.append(dict(kind="hline", label=f"{'매도' if short else '매수'} 계획가 {money(n['entry'])}", a=[n["d"], n["entry"]], b=[end, n["entry"]]))
        out["lines"] = lines
        return out

    sim_notes = [sim_note(n) for n in notes]

    # ── 달 기록 ──
    def held_main(m):
        """그 달 말에 가장 크게 들고 있던 종목 (매매 · 노트가 없는 달의 대표 종목)"""
        q = Counter()
        for h in D.get("start_holdings") or []:
            if h["d"][:7] <= m:
                q[h["code"]] += h["qty"]
        for t in trades:
            if t["d"][:7] <= m:
                q[t["code"]] += t["qty"] if t["side"] == "BUY" else -t["qty"]
        best = None
        for c, n in q.items():
            ds = [x for x in closes[c] if x[:7] <= m]
            if n <= 0 or not ds:
                continue
            val = n * closes[c][max(ds)]
            if best is None or val > best[0]:
                best = (val, c)
        return best[1] if best else codes[0]

    def month_record(m):
        mt = [t for t in sim_trades if t["entry"]["d"][:7] == m]
        exits = [t for t in sim_trades if not t.get("open") and t["exit"]["d"][:7] == m and t["entry"]["d"][:7] != m]
        mn = [n for n in sim_notes if n["d"][:7] == m]
        cnt = Counter(t["code"] for t in mt + exits)
        if cnt:
            main = cnt.most_common(1)[0][0]
        elif any(n.get("code") for n in mn):
            main = Counter(n["code"] for n in mn if n.get("code")).most_common(1)[0][0]
        else:
            main = held_main(m)
        judged = [t for t in mt + exits if t["followed"] is not None]
        follow = round(sum(t["followed"] for t in judged) / len(judged) * 100) if judged else None
        if m in P["titles"]:
            title = P["titles"][m]
        elif mt:
            by = Counter(t["name"] for t in mt)
            title = " · ".join(f"{k} {v}번" for k, v in by.items()) + (" 나눠 삼" if sum(by.values()) > 1 else " 매수")
        elif exits:
            title = " · ".join(sorted({t["name"] for t in exits})) + " 일부 매도"
        elif mn:
            stock = [n for n in mn if n["type"] != "market"]
            mk = len(mn) - len(stock)
            title = (f"{name_of[main]} 노트 {len(stock)}개" if stock else "") + (" · " if stock and mk else "") + (f"시장 노트 {mk}개" if mk else "")
        else:
            title = f"{name_of[main]} 들고 기다린 달"
        ret = next(x["ret"] for x in monthly if x["month"] == m)
        # 이 달에 판 매매(앞 달에 산 것)는 '이어진 보유'로 남김 (판 날 · 이유 · 수익률)
        carry = [dict(type="carry", d=t["exit"]["d"], code=t["code"], name=t["name"],
                      text=f"{t['entry']['d'][:7].replace('-', '년 ')}월에 산 {t['name']}({money(t['entry']['px'])}) 중 {t['_qty']:,}주 — {t['exit']['d']} {money(t['exit']['px'])}에 매도 ({t['ret']:+.2f}%).")
                 for t in exits]
        notes_m = sorted(mn + carry, key=lambda n: n["d"])
        return dict(month=m, title=title, summary=f"매매 {len(mt)}건 · 노트 {len(mn)}개", ret=ret, follow=follow, phase=1,
                    symbol=dict(code=main, name=name_of[main]), candles=[], trades=mt, notes=notes_m)

    records = {m: month_record(m) for m in all_months}

    def stats(rec):
        m = rec["month"]
        ds = {n["d"] for n in rec["notes"] if n["d"][:7] == m}
        ds |= {t[k]["d"] for t in rec["trades"] for k in ("entry", "exit") if t[k]["d"][:7] == m and not (k == "exit" and t.get("open"))}
        return dict(days=len(ds), trades=len(rec["trades"]), stock=sum(n["type"] == "stock" for n in rec["notes"]), market=sum(n["type"] == "market" for n in rec["notes"]))

    def sample(recs_):
        for rec in recs_:
            for t in rec["trades"]:
                if t["entry"]["why"]:
                    return t["entry"]["why"]
        for rec in recs_:
            for n in rec["notes"]:
                if n["type"] in ("stock", "review"):
                    return first_line(n["text"])
        return ""

    # ── 전략 ──
    ret_of = {x["month"]: x["ret"] for x in monthly}
    detail_strats, summary_strats = [], []
    used = set()
    for k, (title, start, end) in enumerate(P["strategies"]):
        ms = [m for m in all_months if start[:7] <= m < end[:7]]
        if not ms or used & set(ms):
            raise SystemExit(f"{tid}: 전략 '{title}' 기간이 비었거나 다른 전략과 겹침")
        used |= set(ms)
        rs = [records[m] for m in ms]
        tr = [t for r in rs for t in r["trades"]]
        n_notes = sum(1 for r in rs for n in r["notes"] if n["type"] != "carry")
        if not tr and not n_notes:
            raise SystemExit(f"{tid}: 전략 '{title}' 에 매매 · 노트가 없음 (빈 전략은 팔지 않음)")
        seen = []
        for r in rs:
            for x in r["trades"] + r["notes"]:
                c = x.get("code")
                if c and c in P["sectors"] and P["sectors"][c] not in seen:
                    seen.append(P["sectors"][c])
        order = list(dict.fromkeys(P["sectors"].values()))  # 섹터 순서는 PLAN 에 적은 순서로 (전략마다 같게)
        sector = " · ".join(sorted(seen, key=order.index)) or P["sectors"][codes[0]]
        g = 1.0
        for m in ms:
            g *= 1 + ret_of[m] / 100
        judged = [t for r in rs for t in r["trades"] + [x for x in sim_trades if not x.get("open") and x["exit"]["d"][:7] == r["month"] and x["entry"]["d"][:7] != r["month"]] if t["followed"] is not None]
        rule = dict(name=P["rule"][0], desc=P["rule"][1])
        base = dict(sector=sector, title=title, rule=rule, start=start, end=end, months=ms, trades=len(tr), notes=n_notes, memos=len(tr) + n_notes, key=f"s{k + 1}")
        detail_strats.append(dict(base))
        st = [stats(r) for r in rs]
        summary_strats.append(dict(base, ret=r2((g - 1) * 100),
                                   follow=round(sum(t["followed"] for t in judged) / len(judged) * 100) if judged else None,
                                   stats={f: sum(s[f] for s in st) for f in ("days", "trades", "stock", "market")},
                                   symbols=sorted({t["name"] for t in tr}), sample=sample(rs)))

    # ── 요약 (sim.json) ──
    judged_all = [t for t in sim_trades if t["followed"] is not None]
    hold = lambda t: (date.fromisoformat(t["exit"]["d"]) - date.fromisoformat(t["entry"]["d"])).days
    best = max(sim_trades, key=lambda t: t["ret"])
    worst = min(sim_trades, key=lambda t: t["ret"])
    sectors = sorted({s["sector"] for s in summary_strats})
    summary = dict(
        persona=None, eq=[round(val * 10000) for _, val in eq], mIdx=m_idx, asOf=AS_OF, monthly=monthly, mdd=r2(mdd * 100), trades=len(sim_trades),
        follow=round(sum(t["followed"] for t in judged_all) / len(judged_all) * 100) if judged_all else None,
        rule=P["rule"][0], ruleDesc=P["rule"][1], symbols=[name_of[c] for c in codes],
        months=[dict(month=r["month"], title=r["title"], summary=r["summary"], follow=r["follow"], stats=stats(r), trades=len(r["trades"]),
                     symbols=sorted({t["name"] for t in r["trades"]}), sample=sample([r])) for r in records.values()],
        facts=dict(wins=sum(1 for t in sim_trades if t["ret"] > 0), losses=sum(1 for t in sim_trades if t["ret"] <= 0),
                   best=dict(name=best["name"], ret=best["ret"], d=best["entry"]["d"]), worst=dict(name=worst["name"], ret=worst["ret"], d=worst["entry"]["d"]),
                   followed=sum(1 for t in sim_trades if t["followed"]), avgHold=round(sum(hold(t) for t in sim_trades) / len(sim_trades), 1)),
        strategies=summary_strats,
    )
    if len(sectors) == 1:
        summary["sector"] = sectors[0]
    for t in sim_trades:
        t.pop("_qty", None)
    detail = dict(id=tid, market="KR", rule=dict(key="public-reconstructed", name=P["rule"][0], desc=P["rule"][1]),
                  symbols=[dict(code=c, name=name_of[c]) for c in codes], strategies=detail_strats, phases=[], revisions=[],
                  months=[records[m] for m in sorted(used)])
    pre = sum(1 for t in trades if t["basis"])
    report = dict(id=tid, name=D["name"], days=len(days), months=len(all_months), ret=r2((eq[-1][1] - 1) * 100), mdd=summary["mdd"],
                  trades=len(trades), recs=len(sim_trades), open=sum(1 for t in sim_trades if t.get("open")), pre=f"{pre}/{len(trades)}",
                  follow=summary["follow"], strategies=[(s["key"], s["title"], s["months"][0], s["months"][-1], s["trades"], s["notes"], s["ret"]) for s in summary_strats])
    return summary, detail, report


if __name__ == "__main__":
    sim_path = os.path.join(ROOT, "app", "marketplace", "sim.json")
    S = json.load(open(sim_path, encoding="utf-8"))
    for tid in PLAN:
        summary, detail, report = build(tid)
        S[tid] = summary
        json.dump(detail, open(os.path.join(ROOT, "data", "market-sim", f"{tid}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(json.dumps(report, ensure_ascii=False))
    json.dump(S, open(sim_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
