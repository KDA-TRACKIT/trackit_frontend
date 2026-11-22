// 트레이더 상세 '거래내역' 탭 (2026-11-22): 구독 없이 누구나 보는 최근 거래 10회
//   최근 7영업일 안에 사거나 판 거래 · 아직 보유 중인 거래는 빼고 (구독자에게만 보이는 최신 매매가 새지 않게), 끝난 거래만 최근 것부터 10개
//   원본은 전략 내용과 같은 data/market-sim/{id}.json (공개 폴더 아님). 매매 근거 · 그은 선 · 노트는 보내지 않음
import { readFile } from "node:fs/promises";
import path from "node:path";
import { traderById } from "../../../marketplace/data";

const DIR = path.join(process.cwd(), "data", "market-sim");

type Trade = { code: string; name: string; entry: { d: string }; exit?: { d: string } | null; ret: number; followed: boolean | null; open?: boolean };

/** 오늘(KST)부터 거꾸로 n번째 영업일(월~금) 날짜 "YYYY-MM-DD" — 이 날 이후(포함) 거래는 뺌 */
function cutoffDate(n: number, now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3_600_000);
  let count = 0;
  for (;;) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    if (count >= n) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() - 1);
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^t\d{1,3}$/.test(id) || !traderById(id)) return Response.json({ error: "트레이더를 찾을 수 없어요." }, { status: 404 });
  let detail: { months?: { month: string; trades?: Trade[] }[] };
  try {
    detail = JSON.parse(await readFile(path.join(DIR, `${id}.json`), "utf8"));
  } catch {
    return Response.json({ error: "거래 내역을 찾을 수 없어요." }, { status: 404 });
  }
  const cutoff = cutoffDate(7);
  const seen = new Set<string>();
  const trades = (detail.months ?? [])
    .flatMap((m) => m.trades ?? [])
    .filter((t) => {
      const key = `${t.code}:${t.entry.d}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return !t.open && !!t.exit?.d && t.entry.d < cutoff && t.exit.d < cutoff;
    })
    .sort((a, b) => (b.exit!.d + b.entry.d).localeCompare(a.exit!.d + a.entry.d))
    .slice(0, 10)
    .map((t) => ({ code: t.code, name: t.name, entry: t.entry.d, exit: t.exit!.d, ret: t.ret, followed: t.followed }));
  return Response.json({ trades, cutoff }, { headers: { "Cache-Control": "public, max-age=300" } });
}
