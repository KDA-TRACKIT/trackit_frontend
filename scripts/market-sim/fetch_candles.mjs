// 전략 더미 데이터용 실제 일봉 받기 (키움 ka10081 국내 · usa06012 미국). 키는 백엔드 .env.local 에서 읽고 출력하지 않음
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BE = process.argv[2];
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(path.join(BE, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const mode = (env.KIWOOM_MODE ?? "demo").toLowerCase() === "real" ? "real" : "mock";
const BASE = mode === "real" ? "https://api.kiwoom.com" : "https://mockapi.kiwoom.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function token() {
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: env.KIWOOM_APPKEY, secretkey: env.KIWOOM_SECRETKEY }),
  });
  const d = await res.json();
  if (!d.token) throw new Error("token failed: " + (d.return_msg ?? res.status));
  return d.token;
}
const TOKEN = await token();

async function call(apiId, p, body, cont) {
  for (let tryNo = 0; tryNo < 5; tryNo++) {
    const headers = { "content-type": "application/json;charset=UTF-8", "api-id": apiId, authorization: `Bearer ${TOKEN}` };
    if (cont) Object.assign(headers, { "cont-yn": "Y", "next-key": cont });
    const res = await fetch(`${BASE}${p}`, { method: "POST", headers, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 429 || d.return_code === 5) {
      await sleep(1200 * (tryNo + 1));
      continue;
    }
    return { d, contYn: res.headers.get("cont-yn"), nextKey: res.headers.get("next-key") };
  }
  throw new Error(apiId + " rate limited");
}
const num = (v) => Math.abs(Number(String(v ?? "").replace(/[+,]/g, "")) || 0);
const FROM = "20240601";

async function kr(code) {
  const rows = [];
  let cont = null;
  for (let page = 0; page < 4; page++) {
    const { d, contYn, nextKey } = await call("ka10081", "/api/dostk/chart", { stk_cd: code, base_dt: "20261116", upd_stkpc_tp: "1" }, cont);
    const list = d.stk_dt_pole_chart_qry ?? [];
    rows.push(...list);
    const oldest = list.at(-1)?.dt ?? "99999999";
    if (contYn !== "Y" || !nextKey || oldest < FROM) break;
    cont = nextKey;
    await sleep(400);
  }
  return rows;
}
async function us(code, ex) {
  const rows = [];
  let cont = null;
  for (let page = 0; page < 10; page++) {
    const { d, contYn, nextKey } = await call("usa06012", "/api/us/chart", { stex_tp: ex, stk_cd: code, strt_dt: "20261116", upd_stkpc_tp: "1", exrt_appl_tp: "0" }, cont);
    const key = Object.keys(d).find((k) => Array.isArray(d[k]));
    const list = key ? d[key] : [];
    if (!list.length) {
      if (page === 0) console.log(code, "empty", d.return_code, d.return_msg);
      break;
    }
    rows.push(...list);
    const oldest = list.map((r) => String(r.dt ?? "")).sort()[0] ?? "99999999";
    if (contYn !== "Y" || !nextKey || oldest < FROM) break;
    cont = nextKey;
    await sleep(400);
  }
  return rows;
}
function bars(rows) {
  const m = new Map();
  for (const r of rows) {
    const dt = String(r.dt ?? "");
    if (!/^\d{8}$/.test(dt) || dt < FROM) continue;
    const close = num(r.cur_prc);
    if (!close) continue;
    m.set(dt, [dt, num(r.open_pric) || close, num(r.high_pric) || close, num(r.low_pric) || close, close, num(r.trde_qty ?? r.acc_trde_qty)]);
  }
  return [...m.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

const KR = { "005930": "삼성전자", "000660": "SK하이닉스", "035420": "NAVER", "005380": "현대차", "035720": "카카오", "068270": "셀트리온", "373220": "LG에너지솔루션", "012450": "한화에어로스페이스", "042700": "한미반도체", "247540": "에코프로비엠", "086520": "에코프로", "196170": "알테오젠", "105560": "KB금융", "329180": "HD현대중공업", "000270": "기아", "028300": "HLB" };
const US = { NVDA: "엔비디아", AAPL: "애플", MSFT: "마이크로소프트", TSLA: "테슬라", AMZN: "아마존", META: "메타", GOOGL: "알파벳", AMD: "AMD", PLTR: "팔란티어", AVGO: "브로드컴" };

const meta = {};
for (const [code, name] of Object.entries(KR)) {
  const b = bars(await kr(code));
  writeFileSync(path.join(OUT, `${code}.json`), JSON.stringify(b));
  meta[code] = { name, market: "KR", n: b.length, from: b[0]?.[0], to: b.at(-1)?.[0] };
  console.log(code, name, b.length, b[0]?.[0], b.at(-1)?.[0]);
  await sleep(300);
}
for (const [code, name] of Object.entries(US)) {
  const b = bars(await us(code, "ND"));
  writeFileSync(path.join(OUT, `${code}.json`), JSON.stringify(b));
  meta[code] = { name, market: "US", n: b.length, from: b[0]?.[0], to: b.at(-1)?.[0] };
  console.log(code, name, b.length, b[0]?.[0], b.at(-1)?.[0]);
  await sleep(300);
}
writeFileSync(path.join(OUT, "_meta.json"), JSON.stringify(meta, null, 1));
