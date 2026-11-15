"use client";
// 모든 화면에서 테마를 시스템 설정·저장된 값과 계속 맞춰 둔다 (화면에는 아무것도 그리지 않음)
import { useEffect } from "react";
import { watchTheme } from "../lib/theme";

export default function ThemeSync() {
  useEffect(() => watchTheme(), []);
  return null;
}
