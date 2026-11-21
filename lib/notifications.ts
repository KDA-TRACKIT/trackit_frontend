"use client";
// 상단 종 알림: 판매(내 전략을 누가 샀을 때) + 즐겨찾기한 트레이더의 새 전략
//   서버 GET /me/notifications (로그인했을 때, 즐겨찾기 중 실제 계정 id 는 ?owners= 로)
//   + 전략 마켓 예시 트레이더(아직 서버 데이터가 아님)는 예시 데이터의 가장 최근 전략으로
//   읽은 시각은 이 브라우저에 두고, 그 뒤 알림만 "새 알림" 점
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api/client";
import { useFavorites, type Favorite } from "./favorites";
import { periodLabel, strategiesOf, traderById } from "../app/marketplace/data";
import { readHits, type AlertHit } from "./strategy-use";

export type AppNotification = { id: string; kind: "sale" | "favorite" | "match"; at: string; title: string; body: string; href: string };

const SEEN = "trackit:noti-seen";
const DAYS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 예시 트레이더 즐겨찾기 → 그 트레이더의 가장 최근 전략 알림 */
function sampleFavorites(favs: Favorite[]): AppNotification[] {
  const since = Date.now() - DAYS * 86_400_000;
  return favs.flatMap((f) => {
    const t = traderById(f.id);
    if (!t) return [];
    const s = strategiesOf(t)[0];
    if (!s) return [];
    const at = new Date(`${s.start}T09:00:00+09:00`);
    if (at.getTime() < since) return [];
    return [{ id: `sample:${t.id}:${s.key}`, kind: "favorite" as const, at: at.toISOString(), title: `${t.name}님이 새 전략을 올렸어요`, body: `${periodLabel(s, t.asOf)} · ${s.title}`, href: `/marketplace/${t.id}/strategies` }];
  });
}

export function useNotifications(loggedIn: boolean) {
  const favs = useFavorites();
  const [server, setServer] = useState<AppNotification[]>([]);
  const [seen, setSeen] = useState<string>("");
  const owners = favs.map((f) => f.id).filter((id) => UUID.test(id)).join(",");

  useEffect(() => setSeen(localStorage.getItem(SEEN) ?? ""), []);
  // 산 전략 '같은 상황 알림'으로 찾은 자리 (이 브라우저에 저장)
  const [hits, setHits] = useState<AlertHit[]>([]);
  useEffect(() => {
    const sync = () => setHits(readHits());
    sync();
    window.addEventListener("trackit:strategy-alerts", sync);
    return () => window.removeEventListener("trackit:strategy-alerts", sync);
  }, []);
  useEffect(() => {
    if (!loggedIn) return setServer([]);
    let alive = true;
    const load = () =>
      apiRequest<AppNotification[]>(`/me/notifications${owners ? `?owners=${owners}` : ""}`)
        .then((list) => alive && setServer(list))
        .catch(() => {}); // 서버가 꺼져 있으면 예시 알림만
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [loggedIn, owners]);

  const matches: AppNotification[] = hits.map((h) => ({
    id: `match:${h.id}`,
    kind: "match",
    at: h.at,
    title: `${h.name}: ${h.traderName}님이 산 자리와 비슷해요 (${h.score}점)`,
    body: `${h.caseName} ${h.caseDate.slice(5).replace("-", ".")} 매수 때와 상황이 비슷해요`,
    href: `/workshop?symbol=${encodeURIComponent(h.code)}&name=${encodeURIComponent(h.name)}`,
  }));
  const items = [...server, ...sampleFavorites(favs), ...matches].sort((a, b) => b.at.localeCompare(a.at));
  const unread = items.filter((n) => !seen || n.at > seen).length;
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(SEEN, now);
    setSeen(now);
  }, []);
  return { items, unread, markSeen, favorites: favs.length };
}
