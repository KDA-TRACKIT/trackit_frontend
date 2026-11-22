"use client";

import { Bookmark, CalendarDays, ChartCandlestick, NotebookPen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const icons = {
  bookmark: Bookmark,
  calendar: CalendarDays,
  candlestick: ChartCandlestick,
  notebook: NotebookPen,
};

export type HeaderDropdownItem = { label: string; href: string; icon: keyof typeof icons };

export default function HeaderDropdown({ label, items }: { label: string; items: HeaderDropdownItem[] }) {
  const pathname = usePathname()?.replace(/\/$/, "");

  return (
    <div className="gnb-drop-menu" role="group" aria-label={label}>
      {items.map(({ label, href, icon }) => {
        const Icon = icons[icon];
        const current = pathname === href ? "page" : pathname?.startsWith(`${href}/`) ? "location" : undefined;

        return (
          <Link key={href} href={href} aria-current={current}>
            <span className="gnb-drop-icon"><Icon size={16} aria-hidden="true" /></span>
            {label}
          </Link>
        );
      })}
    </div>
  );
}
