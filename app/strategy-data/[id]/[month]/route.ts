// 전략 마켓 월별 전략 내용 (매매 · 그은 선 · 그 달 차트) — 구독을 확인한 뒤 그 달 것만 보냄
//   원본은 공개 폴더(public)가 아니라 서버만 읽는 data/market-sim/{id}.json 에 둠 → 주소로 통째로 받아 갈 수 없음
//   무료(첫 번째) 전략은 누구나, 나머지는 로그인한 사람이 그 트레이더를 구독 중일 때만 (백엔드 /me/subscriptions, lib/purchases 와 같은 계산)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { strategiesOf, traderById } from "../../../marketplace/data";
import { canView, toRecords, type Subscription } from "../../../../lib/subscription";

type Legacy = { id: string; traderId: string; traderName: string; orderId: string; amount: number; approvedAt: string | null; receiptUrl: string | null; used: { month: string; title: string; at: string } | null };

const DIR = path.join(process.cwd(), "data", "market-sim");
const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const noStore = { "Cache-Control": "private, no-store" };


/** 구독 중이거나 예전에 연 달인지 (구독 = /me/subscriptions, 예전 기록 = /me/passes · lib/subscription 과 같은 계산) */
async function opened(auth: string, traderId: string, month: string) {
  const get = async <T,>(p: string): Promise<T[]> => {
    const res = await fetch(`${API}/api/v1${p}`, { headers: { Authorization: auth }, cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: T[] } | T[];
    return Array.isArray(body) ? body : (body.data ?? []);
  };
  const [legacy, subs] = await Promise.all([get<Legacy>("/me/passes"), get<Subscription>("/me/subscriptions")]);
  return canView(toRecords(subs, legacy), traderId, month);
}

export async function GET(request: Request, context: { params: Promise<{ id: string; month: string }> }) {
  const { id, month } = await context.params;
  if (!/^t\d{1,3}$/.test(id) || !/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "잘못된 주소예요." }, { status: 400, headers: noStore });
  const trader = traderById(id);
  const strategy = trader ? strategiesOf(trader).find((s) => s.month === month) : undefined;
  if (!trader || !strategy) return Response.json({ error: "전략을 찾을 수 없어요." }, { status: 404, headers: noStore });

  if (!strategy.free) {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return Response.json({ error: "로그인하고 구독하면 볼 수 있어요." }, { status: 401, headers: noStore });
    if (!(await opened(auth, id, month))) return Response.json({ error: "구독 중이 아니에요." }, { status: 403, headers: noStore });
  }

  let detail: { id: string; market: string; rule: unknown; symbols: unknown; months: { month: string }[] };
  try {
    detail = JSON.parse(await readFile(path.join(DIR, `${id}.json`), "utf8"));
  } catch {
    return Response.json({ error: "전략 내용을 찾을 수 없어요." }, { status: 404, headers: noStore });
  }
  const m = detail.months.find((x) => x.month === month);
  if (!m) return Response.json({ error: "이 달 전략 내용이 없어요." }, { status: 404, headers: noStore });
  // 그 달 하나만 (다른 달은 보내지 않음)
  return Response.json({ id: detail.id, market: detail.market, rule: detail.rule, symbols: detail.symbols, months: [m] }, { headers: noStore });
}
