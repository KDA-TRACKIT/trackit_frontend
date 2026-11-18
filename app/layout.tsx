import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./consistency.css";
import "./auth-design.css";
import { THEME_INIT_SCRIPT } from "../lib/theme-script";
import { FIT_INIT_SCRIPT } from "../lib/fit-script";
import ThemeSync from "./ThemeSync";
import ProfileGate from "./ProfileGate";
import AuthGate from "./AuthGate";

export const metadata: Metadata = {
  title: "TRACKIT",
  description: "Trading journal and performance tracking",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme 은 아래 스크립트가 그리기 전에 넣는다 (서버 HTML 과 달라서 경고를 끈다)
    <html lang="ko" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: FIT_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        <ProfileGate />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
