"use client";
// 기본 색 견본 + 직접 고르기 (지표 선·드로잉 공통)
import { COLOR_SWATCHES } from "../../lib/indicators";

export default function ColorSwatches({ value, onChange, label }: { value: string; onChange: (color: string) => void; label?: string }) {
  const custom = !COLOR_SWATCHES.includes(value.toLowerCase());
  return (
    <div className="ws-swatches" role="group" aria-label={label ?? "색"}>
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          className={value.toLowerCase() === c ? "on" : ""}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
          aria-pressed={value.toLowerCase() === c}
          title={c}
        />
      ))}
      <label className={`ws-swatch-custom${custom ? " on" : ""}`} title="직접 고르기" style={custom ? { background: value } : undefined}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="직접 고르기" />
        {custom ? "" : "＋"}
      </label>
    </div>
  );
}
