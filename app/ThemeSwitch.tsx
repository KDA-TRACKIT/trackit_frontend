"use client";
// 테마 고르기 (시스템 / 라이트 / 다크) — 계정 메뉴와 마이페이지 계정 설정에서 씀
import { THEME_LABEL, setTheme, useThemePref, type ThemePref } from "../lib/theme";

const ORDER: ThemePref[] = ["system", "light", "dark"];

export default function ThemeSwitch({ className = "theme-seg" }: { className?: string }) {
  const pref = useThemePref();
  return (
    <div className={className} role="radiogroup" aria-label="화면 테마">
      {ORDER.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={pref === p} onClick={() => setTheme(p)}>
          {THEME_LABEL[p]}
        </button>
      ))}
    </div>
  );
}
