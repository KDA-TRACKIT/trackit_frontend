"use client";
// 경제 캘린더: 이번 주 세계 지표(시각·중요도·예상·이전) + FOMC·금통위·미국 지표 발표일 + 달력(점)
import { memoAttr } from "../../lib/memo-target";
import { useState } from "react";
import { getEconCalendar, type EconEvent } from "../../lib/api/insights";
import { CardHead, Failed, Loading, MissingKeys } from "./parts";
import { useLoad } from "./useLoad";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const COUNTRY: Record<EconEvent["country"], string> = {
  KR: "한국",
  US: "미국",
  CN: "중국",
  JP: "일본",
  EU: "유로",
};
/** 나라 고르기 (체크박스). 전체를 고르면 다른 나라 일정(받아 둔 경우)도 다 보임 */
type Nation = "US" | "KR" | "JP";
const NATIONS: [Nation, string][] = [
  ["US", "미국"],
  ["KR", "한국"],
  ["JP", "일본"],
];
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

/** 한국 시간 오늘 · 이번 주 월~일 */
function thisWeek() {
  const now = Date.now() + 9 * 3_600_000;
  const mon = now - ((new Date(now).getUTCDay() + 6) % 7) * 86_400_000;
  return { today: ymd(now), from: ymd(mon), to: ymd(mon + 6 * 86_400_000) };
}
function dday(date: string, today: string) {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  return days === 0
    ? "오늘"
    : days === 1
      ? "내일"
      : days < 0
        ? ""
        : `D-${days}`;
}
const stars = (n: number) => "★".repeat(n) + "☆".repeat(3 - n);

/** 달력: 일정 있는 날에 점 (그날 가장 중요한 일정 기준), 누르면 그날만 */
function MonthGrid({
  events,
  today,
  picked,
  onPick,
}: {
  events: EconEvent[];
  today: string;
  picked: string | null;
  onPick: (d: string | null) => void;
}) {
  const [month, setMonth] = useState(() => ({
    y: Number(today.slice(0, 4)),
    m: Number(today.slice(5, 7)),
  }));
  const top = new Map<string, number>();
  for (const e of events)
    top.set(e.date, Math.max(top.get(e.date) ?? 0, e.impact));
  const prefix = `${month.y}-${String(month.m).padStart(2, "0")}`;
  const first = new Date(Date.UTC(month.y, month.m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const move = (k: number) =>
    setMonth(({ y, m }) =>
      m + k < 1
        ? { y: y - 1, m: 12 }
        : m + k > 12
          ? { y: y + 1, m: 1 }
          : { y, m: m + k },
    );
  return (
    <div className="ins-cal-grid">
      <div className="ins-month">
        <button type="button" onClick={() => move(-1)} aria-label="이전 달">
          ‹
        </button>
        <strong>
          {month.y}.{String(month.m).padStart(2, "0")}
        </strong>
        <button type="button" onClick={() => move(1)} aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="grid">
        {WEEK.map((w) => (
          <span key={w} className="wk">
            {w}
          </span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = `${prefix}-${String(i + 1).padStart(2, "0")}`;
          const lv = top.get(d);
          return (
            <button
              key={d}
              type="button"
              className={`${d === today ? "today" : ""}${picked === d ? " on" : ""}`}
              disabled={!lv}
              aria-pressed={picked === d}
              aria-label={`${month.m}월 ${i + 1}일${lv ? " 일정 있음" : ""}`}
              onClick={() => onPick(picked === d ? null : d)}
            >
              {i + 1}
              {lv ? <i className={`dot l${lv}`} /> : null}
            </button>
          );
        })}
      </div>
      <p className="legend">
        <i className="dot l3" /> 중요 <i className="dot l2" /> 보통
      </p>
    </div>
  );
}

type Range = "past" | "week" | "upcoming";

export function EconCalendar() {
  const { data, error, reload } = useLoad(
    "calendar",
    getEconCalendar,
    // 발표 5분 전부터 값이 나올 때까지는 10초마다, 그 밖에는 다음 발표 5분 전에 (길어도 30분)
    (d) => {
      if (d?.live) return 10_000;
      const until = d?.nextAt ? Date.parse(d.nextAt) - 5 * 60_000 - Date.now() : Infinity;
      return Math.max(10_000, Math.min(30 * 60_000, until));
    },
  );
  const [week] = useState(thisWeek);
  /** null: 이번 주에 일정이 있으면 이번 주, 없으면(주말 등) 다가오는 일정 */
  const [rangePick, setRange] = useState<Range | null>(null);
  const [onlyTop, setOnlyTop] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  /** 볼 나라 (처음엔 전체) */
  const [nations, setNations] = useState<Set<Nation>>(() => new Set(NATIONS.map(([k]) => k)));
  const allNations = nations.size === NATIONS.length;
  const toggleNation = (k: Nation) =>
    setNations((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const all = (data?.events ?? []).filter(
    (e) => (!onlyTop || e.impact === 3) && (allNations || nations.has(e.country as Nation)),
  );
  const range: Range =
    rangePick ??
    (all.some((e) => e.date >= week.today && e.date <= week.to)
      ? "week"
      : "upcoming");
  const pickedLabel = picked
    ? `${Number(picked.slice(5, 7))}월 ${Number(picked.slice(8))}일 (${WEEK[new Date(`${picked}T00:00:00Z`).getUTCDay()]})`
    : null;
  const shown = all.filter((e) =>
    picked
      ? e.date === picked
      : range === "past"
        ? e.date < week.today
        : range === "week"
          ? e.date >= week.from && e.date <= week.to
          : e.date >= week.today,
  );
  // 지난 일정은 최근 것부터
  if (!picked && range === "past") shown.reverse();
  const groups: [string, EconEvent[]][] = [];
  for (const e of shown) {
    const last = groups[groups.length - 1];
    if (last && last[0] === e.date) last[1].push(e);
    else groups.push([e.date, [e]]);
  }

  return (
    <section className="ins-card">
      <CardHead title="경제 캘린더">
        <div className="ins-cal-ctl">
          <div className="ins-cal-nations" role="group" aria-label="나라">
            <label>
              <input
                type="checkbox"
                checked={allNations}
                onChange={() => setNations(new Set(allNations ? [] : NATIONS.map(([k]) => k)))}
              />
              전체
            </label>
            {NATIONS.map(([k, label]) => (
              <label key={k}>
                <input type="checkbox" checked={nations.has(k)} onChange={() => toggleNation(k)} />
                {label}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="ins-toggle"
            aria-pressed={onlyTop}
            onClick={() => setOnlyTop(!onlyTop)}
          >
            ★★★만
          </button>
          <div className="ins-seg" role="radiogroup" aria-label="기간">
            {(
              [
                ["past", "지난 일정"],
                ["week", "이번 주"],
                ["upcoming", "다가오는 일정"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={!picked && range === k}
                onClick={() => {
                  setPicked(null);
                  setRange(k);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHead>
      {error && !data ? (
        <Failed message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="ins-cal-wrap">
            <MonthGrid
              events={all}
              today={week.today}
              picked={picked}
              onPick={setPicked}
            />
            {/* 오른쪽: 고른 날(없으면 이번 주 · 다가오는 일정) 내용. 달력 높이에 맞춰 따로 스크롤 */}
            <div className="ins-cal-side">
              <div className="ins-cal-side-head">
                <strong>
                  {pickedLabel ??
                    (range === "past"
                      ? "지난 일정"
                      : range === "week"
                        ? "이번 주"
                        : "다가오는 일정")}
                </strong>
                <span>{shown.length}개</span>
                {picked && (
                  <button type="button" onClick={() => setPicked(null)}>
                    전체 보기
                  </button>
                )}
              </div>
              {groups.length === 0 ? (
                <div className="ins-state" style={{ height: 160 }}>
                  <p>
                    {picked
                      ? "이날 일정이 없어요"
                      : range === "week"
                        ? "이번 주 남은 일정이 없어요"
                        : "일정이 없어요"}
                  </p>
                </div>
              ) : (
                <ul
                  className="ins-cal"
                  key={`${picked ?? range}${onlyTop ? "*" : ""}`}
                >
                  {/* 열 이름: 값과 같은 칸에 맞춰, 스크롤해도 위에 붙어 있게 */}
                  <li className="cols-row" aria-hidden>
                    <div className="ev">
                      <span className="v">실제</span>
                      <span className="v">예상</span>
                      <span className="v">이전</span>
                    </div>
                  </li>
                  {groups.map(([date, list]) => {
                    const dd = dday(date, week.today);
                    return (
                      <li
                        key={date}
                        className={date < week.today ? "past" : ""}
                      >
                        <div className="when">
                          <strong>
                            {Number(date.slice(5, 7))}.{Number(date.slice(8))}
                          </strong>
                          <span>
                            {WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()]}
                          </span>
                          {dd && (
                            <em className={dd === "오늘" ? "today" : ""}>
                              {dd}
                            </em>
                          )}
                        </div>
                        <div className="what">
                          {list.map((e) => (
                            <div
                              key={`${e.time ?? ""}${e.title}`}
                              className="ev"
                              {...memoAttr({ kind: "topic", topic: "거시경제", label: `${Number(date.slice(5, 7))}.${Number(date.slice(8))} ${e.title}` })}
                            >
                              <span className="t">{e.time ?? ""}</span>
                              <span
                                className={`imp l${e.impact}`}
                                aria-label={`중요도 ${e.impact}`}
                              >
                                {stars(e.impact)}
                              </span>
                              <span
                                className={`chip ${e.country === "KR" ? "kr" : "us"}`}
                              >
                                {COUNTRY[e.country]}
                              </span>
                              <span className="title">{e.title}</span>
                              <span
                                className={`v act${e.actual ? "" : " none"}`}
                              >
                                {e.actual ?? "–"}
                              </span>
                              <span className={`v${e.forecast ? "" : " none"}`}>
                                {e.forecast ?? "–"}
                              </span>
                              <span className={`v${e.previous ? "" : " none"}`}>
                                {e.previous ?? "–"}
                              </span>
                              {e.note && !e.time && <small>{e.note}</small>}
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <MissingKeys keys={data.missing} />
        </>
      )}
    </section>
  );
}
