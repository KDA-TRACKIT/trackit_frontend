"use client";
// 소개 페이지를 애플 사이트처럼 한 화면씩 넘김 (2026-11-22)
//   - 휠: 한 번 굴리면 다음(또는 이전) 장으로 부드럽게 이동하고, 도착할 때까지 · 트랙패드 관성이 멈출 때까지 다음 휠은 무시
//     (CSS scroll-snap 만 쓰면 휠 한 칸(≈100px)이 가까운 장으로 되돌아가 버려 넘어가지 않음)
//   - 키보드 · 스크롤바 · 터치는 html 의 scroll-snap(y mandatory)이 장 시작에 멈춰 줌
//   - 장 = data-snap 이 붙은 요소 (start: 그 요소 위끝, end: 그 요소 아래끝이 화면 아래에 오게). 높이 · 정렬은 landing.module.css '한 화면씩'
//   - 좁은 화면 · 낮은 화면에선 장 높이가 제각각이라 끔. 소개를 떠나면(로그인 등) 원래대로
import { useEffect } from "react";

const QUERY = "(min-width: 801px) and (min-height: 640px)";
const MIN_MS = 850; // 한 장 넘기는 데 잡는 최소 시간
const QUIET_MS = 180; // 휠(트랙패드 관성)이 이만큼 조용해야 다음 장 허용

function stops() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const tops = [...document.querySelectorAll<HTMLElement>("[data-snap]")].map((el) => {
    const r = el.getBoundingClientRect();
    const top = el.dataset.snap === "end" ? r.bottom + window.scrollY - window.innerHeight : r.top + window.scrollY;
    return Math.round(Math.max(0, Math.min(max, top)));
  });
  return [...new Set(tops)].sort((a, b) => a - b);
}

export default function IntroSnap() {
  useEffect(() => {
    const html = document.documentElement;
    const mq = window.matchMedia(QUERY);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let busyUntil = 0;
    let lastWheel = 0;
    let needQuiet = false;

    const onWheel = (e: WheelEvent) => {
      if (!mq.matches || e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      const now = performance.now();
      const gap = now - lastWheel;
      lastWheel = now;
      if (now < busyUntil) return;
      // 한 장 넘긴 뒤엔 휠이 한 번 멈춰야(트랙패드 관성 끝) 다음 장
      if (needQuiet) {
        if (gap < QUIET_MS) return;
        needQuiet = false;
      }
      if (Math.abs(e.deltaY) < 2) return;
      const list = stops();
      const y = window.scrollY;
      const dir = Math.sign(e.deltaY);
      // 지금 위치에서 그 방향으로 가장 가까운 장 (장 사이 어중간한 곳이면 그 방향의 다음 장)
      const next = dir > 0 ? list.find((t) => t > y + 4) : [...list].reverse().find((t) => t < y - 4);
      if (next === undefined) return;
      busyUntil = now + MIN_MS;
      needQuiet = true;
      window.scrollTo({ top: next, behavior: reduce.matches ? "auto" : "smooth" });
    };

    const apply = () => {
      html.style.scrollSnapType = mq.matches ? "y mandatory" : "";
    };
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("wheel", onWheel);
      html.style.scrollSnapType = "";
    };
  }, []);
  return null;
}
