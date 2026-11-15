import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./consistency.css";
import { THEME_INIT_SCRIPT } from "../lib/theme-script";
import ThemeSync from "./ThemeSync";

export const metadata: Metadata = {
  title: "Trackit",
  description: "Trading journal and performance tracking",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme 은 아래 스크립트가 그리기 전에 넣는다 (서버 HTML 과 달라서 경고를 끈다)
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
