"use client";
// 판매자 등급 배지 (닉네임 앞). 등급 산정 조건(기준값)은 화면에 보여 주지 않음 — 등급 · 가격 · 수수료만
import { GRADES, type Grade } from "../../lib/grade";
import "./grade.css";

type Shown = Grade | "일반";

/** 닉네임 앞 등급 배지. unrated(아직 첫 등급 없음)면 '–' */
export function GradeBadge({ grade, unrated, small }: { grade?: Shown; unrated?: boolean; small?: boolean }) {
  if (!grade) return null;
  if (unrated)
    return (
      <span className={`mk-grade g-U${small ? " small" : ""}`} title="아직 판매 등급 없음">
        –
      </span>
    );
  return (
    <span className={`mk-grade g-${grade === "일반" ? "N" : grade}${small ? " small" : ""}`} title={grade === "F" || grade === "일반" ? "신규 판매 중지" : `판매 등급 ${grade}`}>
      {grade}
    </span>
  );
}

/**
 * 전략 마켓 목록 등급 열: 시안 '트레이더 평가 / 등급 배지'(Figma 2096:3920) — 배경 · 테두리 없이 등급별 색 글자
 *   위 GradeBadge(그라데이션 배지)와 클래스를 나눠, CSS 가 실리는 순서에 따라 배지 모양이 섞여 나오지 않게
 */
export function GradeText({ grade, unrated }: { grade?: Shown; unrated?: boolean }) {
  if (!grade) return null;
  const g = unrated ? "U" : grade === "일반" ? "N" : grade;
  return (
    <span className={`mk-grade-text g-${g}`} title={unrated ? "아직 판매 등급 없음" : grade === "F" || grade === "일반" ? "신규 판매 중지" : `판매 등급 ${grade}`}>
      {unrated ? "–" : grade}
    </span>
  );
}

export const gradeRank = (g?: Shown) => (g === "일반" || !g ? -1 : GRADES.indexOf(g));
