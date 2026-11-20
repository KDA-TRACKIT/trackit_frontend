// 어진냥이(데모 판매자)용 미국 일봉 받기 (키움 usa06012). 기존 fetch_candles.mjs 는 그대로 둠
//   다른 점: 시작일을 인자로(기본 2022-06-01), 페이지 제한 없음(시작일까지), 거래소를 종목마다(나스닥 ND · 뉴욕 NY · 아멕스 NA)
//   키는 백엔드 .env.local 에서 읽고 출력하지 않음
//   node fetch_candles_eojin.mjs <백엔드 폴더> <저장 폴더> [YYYYMMDD 시작일]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BE = process.argv[2];
const OUT = process.argv[3];
const FROM = process.argv[4] ?? "20220601";
if (!BE || !OUT || !/^\d{8}$/.test(FROM)) throw new Error("usage: node fetch_candles_eojin.mjs <backend> <out> [YYYYMMDD]");
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
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");

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

async function call(body, cont) {
  for (let tryNo = 0; tryNo < 6; tryNo++) {
    const headers = { "content-type": "application/json;charset=UTF-8", "api-id": "usa06012", authorization: `Bearer ${TOKEN}` };
    if (cont) Object.assign(headers, { "cont-yn": "Y", "next-key": cont });
    const res = await fetch(`${BASE}/api/us/chart`, { method: "POST", headers, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 429 || d.return_code === 5) {
      await sleep(1200 * (tryNo + 1));
      continue;
    }
    return { d, contYn: res.headers.get("cont-yn"), nextKey: res.headers.get("next-key") };
  }
  throw new Error("usa06012 rate limited");
}
const num = (v) => Math.abs(Number(String(v ?? "").replace(/[+,]/g, "")) || 0);

async function us(code, ex) {
  const rows = [];
  let cont = null;
  for (let page = 0; page < 60; page++) {
    const { d, contYn, nextKey } = await call({ stex_tp: ex, stk_cd: code, strt_dt: today, upd_stkpc_tp: "1", exrt_appl_tp: "0" }, cont);
    const key = Object.keys(d).find((k) => Array.isArray(d[k]));
    const list = key ? d[key] : [];
    if (!list.length) {
      if (page === 0) console.log(code, ex, "empty", d.return_code, d.return_msg);
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

// 2기 AI 기술주 후보 · 1기 바이오 · 테마 후보 · 시장 지수 대용(QQQ)
const SYMBOLS = {
  NVDA: ["엔비디아", "ND", "AI"], AMD: ["AMD", "ND", "AI"], AVGO: ["브로드컴", "ND", "AI"], MSFT: ["마이크로소프트", "ND", "AI"],
  META: ["메타", "ND", "AI"], PLTR: ["팔란티어", "ND", "AI"], GOOGL: ["알파벳", "ND", "AI"],
  MRNA: ["모더나", "ND", "BIO"], NVAX: ["노바백스", "ND", "BIO"], BNTX: ["바이오엔테크", "ND", "BIO"],
  PLUG: ["플러그파워", "ND", "THEME"], LCID: ["루시드", "ND", "THEME"], AMC: ["AMC", "NY", "THEME"], GME: ["게임스탑", "NY", "THEME"],
  QQQ: ["나스닥100 ETF", "ND", "INDEX"],
  TQQQ: ["나스닥100 3배 ETF", "ND", "LEVER"],
};
// 5번째 인자로 종목을 고르면 그것만 받고, 기존 _meta.json 에 더함
const ONLY = process.argv[5]?.split(",").filter(Boolean);

let meta = {};
try {
  if (ONLY) meta = JSON.parse(readFileSync(path.join(OUT, "_meta.json"), "utf8"));
} catch {}
for (const [code, [name, ex, group]] of Object.entries(SYMBOLS)) {
  if (ONLY && !ONLY.includes(code)) continue;
  let b = bars(await us(code, ex));
  // 거래소를 잘못 짚었으면 다른 거래소로 한 번 더
  for (const alt of ["ND", "NY", "NA"]) {
    if (b.length || alt === ex) continue;
    b = bars(await us(code, alt));
    if (b.length) meta[code] = { exchangeUsed: alt };
  }
  writeFileSync(path.join(OUT, `${code}.json`), JSON.stringify(b));
  meta[code] = { ...meta[code], name, group, exchange: ex, market: "US", n: b.length, from: b[0]?.[0], to: b.at(-1)?.[0] };
  console.log(code, ex, b.length, b[0]?.[0], b.at(-1)?.[0]);
  await sleep(300);
}
writeFileSync(path.join(OUT, "_meta.json"), JSON.stringify(meta, null, 1));
