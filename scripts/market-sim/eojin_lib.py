"""
어진냥이(데모 판매자) 공통: sim.py 를 고치지 않고 함수만 가져다 씀
  - sim.py 의 앞부분(규칙 · 지표 · 메모 함수, 맨 아래 41명 생성 루프 전까지)을 이 모듈 이름공간에서 실행
  - 기간 · 쉬는 돈 지수만 어진냥이용으로 바꿈: 2023-01 ~ 2026-11, 쉬는 돈은 QQQ (bench.json 은 2024-11-20부터라 전 구간 QQQ 로 통일)
  - simulate 는 sim.py 원문을 가져와 '끝 날짜(end)' 와 '끝에 남은 보유 정리' 만 덧붙여 씀 (1기 → 2기 이어 붙이기용)
"""
import os, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
# 데모 판매자 9명은 TRACKIT_CANDLES(일봉 폴더) · TRACKIT_MKT(시장 기준 종목) 로 바꿔 씀 (기본 = 어진냥이)
CANDLES = os.environ.get("TRACKIT_CANDLES") or os.path.join(ROOT, "data", "market-sim-eojin", "candles")
MKT = os.environ.get("TRACKIT_MKT") or "QQQ"
SIM_SRC = open(os.path.join(HERE, "sim.py"), encoding="utf-8").read()

# sim.py 맨 아래 41명 생성 루프(summary = {}) 앞까지만
head = SIM_SRC[: SIM_SRC.index("\nsummary = {}\n")]
_argv = sys.argv
sys.argv = ["sim.py", CANDLES, os.path.join(ROOT, "data", "market-sim-eojin", "_unused")]
NS = {"__name__": "sim_reuse", "__file__": os.path.join(HERE, "sim.py")}
exec(compile(head, "sim.py", "exec"), NS)
sys.argv = _argv

# ── 어진냥이 기간 ──
MONTHS = []
y, m = 2023, 1
while (y, m) <= (2026, 11):
    MONTHS.append(f"{y}-{m:02d}")
    m += 1
    if m > 12: y, m = y + 1, 1
NS["MONTHS"] = MONTHS
NS["START"] = MONTHS[0] + "-01"

# 쉬는 돈 = 시장 기준 종목(어진냥이 QQQ) 그날 종가 등락. 국내 · 미국 같은 표에 넣음
_M = NS["BARS"][MKT]
_idle = {_M[k]["d"]: _M[k]["c"] / _M[k - 1]["c"] - 1 for k in range(1, len(_M))}
NS["IDLE_RET"] = {"US": _idle, "KR": _idle}
# 증시 메모 바스켓 · 종목 풀에서 시장 기준 종목은 뺌
NS["US_POOL"] = [c for c in NS["US_POOL"] if c not in (MKT, "TQQQ")]
NS["KR_POOL"] = [c for c in NS["KR_POOL"] if c != MKT]

AI = ["NVDA", "AMD", "AVGO", "MSFT", "META", "PLTR", "GOOGL"]
BIO_THEME = ["MRNA", "NVAX", "BNTX", "PLUG", "LCID", "AMC", "GME"]

# ── simulate: 원문 + end(이 날까지만) · close_at_end(끝에 남은 보유를 그날 종가로 정리) · cash0(시작 자금) ──
s0 = SIM_SRC.index("def simulate(")
s1 = SIM_SRC.index("\ndef month_candles(")
sim_src = SIM_SRC[s0:s1]
sim_src = sim_src.replace("def simulate(tid, rule_key, pool, follow_p, seed):", "def simulate2(tid, rule_key, pool, follow_p, seed, start=None, end=None, cash0=1.0, close_at_end=False, months=None, slots_n=None):")
sim_src = sim_src.replace('dates = sorted({x["d"] for c in pool for x in BARS[c] if x["d"] >= START})',
                          'dates = sorted({x["d"] for c in pool for x in BARS[c] if x["d"] >= (start or START) and (end is None or x["d"] <= end)})')
sim_src = sim_src.replace("cash, equity_hist, pos, trades = 1.0, [], {}, []", "cash, equity_hist, pos, trades = cash0, [], {}, []")
# 끝에 남은 보유 정리 (전환 시점: 깨닫고 1기 종목을 모두 정리)
sim_src = sim_src.replace("    # 월별 수익률 · 최대 낙폭\n",
"""    if close_at_end and pos and dates:
        d = dates[-1]
        for c in list(pos):
            p = pos[c]; k = idx[c].get(d, p["k"]); exit_px = BARS[c][k]["c"]
            proceeds = p["qty"] * exit_px * (1 - buy_fee - sell_tax)
            cash += proceeds
            trades.append(dict(code=c, name=META[c]["name"], entry=dict(d=p["d"], px=px(c, p["entry"]), why=p["why"]),
                               exit=dict(d=d, px=px(c, exit_px), why="전략을 바꾸며 전량 정리"), ret=r2((proceeds / p["cost"] - 1) * 100), followed=True, lines=p["lines"]))
            del pos[c]
        equity_hist[-1] = (d, cash)
    # 월별 수익률 · 최대 낙폭
""")
sim_src = sim_src.replace("    for mth in MONTHS:\n        e = month_end.get(mth, prev)", "    for mth in (months or MONTHS):\n        e = month_end.get(mth, prev)")
sim_src = sim_src.replace("month_end, prev = {}, 1.0", "month_end, prev = {}, cash0")
sim_src = sim_src.replace("    slots = len(pool)\n", "    slots = slots_n or len(pool)\n")
assert "slots_n or len(pool)" in sim_src and sim_src.count("simulate2") == 1 and "close_at_end and pos" in sim_src and "(months or MONTHS)" in sim_src
# 매매 기록에 계획(손절 · 목표 가격)도 남김 (매매 메모에 씀)
sim_src = sim_src.replace('why=p["why"]),', 'why=p["why"], stop=px(c, p["stop"]), target=px(c, p["target"])),')
assert sim_src.count('stop=px(c, p["stop"])') >= 2
exec(compile(sim_src, "sim.py:simulate", "exec"), NS)

def g(name):
    return NS[name]
