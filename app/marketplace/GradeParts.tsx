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

export const gradeRank = (g?: Shown) => (g === "일반" || !g ? -1 : GRADES.indexOf(g));
