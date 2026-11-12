import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trackit",
  description: "Trading journal and performance tracking",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
