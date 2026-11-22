"use client";
// 소개 페이지 스크롤 도우미 (2026-11-22, 한 화면씩 넘기기 대신)
//   - 위쪽 바: 내려가면 그림자 (바는 CSS sticky 로 늘 위에 — '시작하기'를 언제든 누를 수 있게)
//   - data-reveal 이 붙은 장: 화면에 들어올 때 살짝 떠오르며 나타남 (한 번만). JS 가 안 돌면 처음부터 보임
//   - '기능 둘러보기 ↓' · '맨 위로 ↑' 같은 페이지 안 이동을 부드럽게
//   기기에서 '동작 줄이기'를 켜면 나타남 · 부드러운 이동 없이 바로
import { useEffect } from "react";

export default function IntroScroll() {
  useEffect(() => {
    const root = document.getElementById("intro-top");
    if (!root) return;
    const html = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onScroll = () => root.toggleAttribute("data-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    let io: IntersectionObserver | null = null;
    if (!reduce && "IntersectionObserver" in window) {
      root.setAttribute("data-reveal-ready", "");
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.setAttribute("data-shown", "");
            io?.unobserve(e.target);
          }
        },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
      );
      root.querySelectorAll("[data-reveal]").forEach((el) => io?.observe(el));
      html.style.scrollBehavior = "smooth";
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
      root.removeAttribute("data-reveal-ready");
      html.style.scrollBehavior = "";
    };
  }, []);
  return null;
}
