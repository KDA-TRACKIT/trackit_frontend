// OKX 공개 시세 (2026-11-22): CME · NYMEX · COMEX 선물 차트의 실시간을 이어 붙일 때 씀 (지수 · 금속 · 에너지 무기한 선물)
//   키 없이 브라우저에서 바로 부름 (OKX 가 CORS 허용)
//   실시간: wss://ws.okx.com:8443/ws/v5/public trades 채널
//   맞춤: 그 분의 CME 종가 ÷ 같은 분의 OKX 종가 (선물 프리미엄만큼 차이가 나서)

const REST = "https://www.okx.com/api/v5";

/** t(초)가 들어간 1분봉의 OKX 종가 (없으면 null) */
export async function okxCloseAt(inst: string, t: number, signal?: AbortSignal): Promise<number | null> {
  const minute = Math.floor(t / 60) * 60;
  const res = await fetch(`${REST}/market/history-candles?instId=${inst}&bar=1m&after=${(minute + 60) * 1000}&limit=1`, { signal, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { code?: string; data?: string[][] } | null;
  const row = body?.code === "0" ? body.data?.[0] : undefined;
  return row && Math.floor(Number(row[0]) / 1000) === minute ? Number(row[4]) : null;
}

/** 실시간 체결. 끊기면 3초 뒤 다시 붙음. 반환 함수로 해제 */
export function openOkxStream(inst: string, onTrade: (t: { time: number; price: number; volume: number }) => void) {
  let ws: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const connect = () => {
    ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
    ws.onopen = () => {
      ws?.send(JSON.stringify({ op: "subscribe", args: [{ channel: "trades", instId: inst }] }));
      ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
    };
    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      try {
        const msg = JSON.parse(String(e.data)) as { data?: { px: string; sz: string; ts: string }[] };
        for (const t of msg.data ?? []) onTrade({ time: Math.floor(Number(t.ts) / 1000), price: Number(t.px), volume: Number(t.sz) });
      } catch {
        // 알 수 없는 메시지는 버림
      }
    };
    ws.onclose = () => {
      if (ping) clearInterval(ping);
      if (!closed) retry = setTimeout(connect, 3000);
    };
  };
  connect();
  return () => {
    closed = true;
    if (ping) clearInterval(ping);
    if (retry) clearTimeout(retry);
    ws?.close();
  };
}
