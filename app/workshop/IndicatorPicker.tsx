"use client";
// 지표 창: 검색·분류로 찾아 추가하고, 올린 지표는 설정(기간 등)·숨김·삭제
import { useEffect, useMemo, useState } from "react";
import ColorSwatches from "./ColorSwatches";
import { INDICATOR_CATEGORIES, INDICATOR_LIBRARY, getIndicator, instanceLabel, type IndicatorDef, type IndicatorInstance } from "../../lib/indicators";
import { readUserStorage, userStorageKey } from "../../lib/supabase-browser";

type Props = {
  instances: IndicatorInstance[];
  onAdd: (id: string) => void;
  onUpdate: (uid: string, patch: Partial<IndicatorInstance>) => void;
  onRemove: (uid: string) => void;
  onClose: () => void;
};

const PLACE_LABEL = {
  overlay: "차트 위",
  separate: "차트 아래",
  volume: "차트 아래",
} as const;

/** 위치: 가격 위에 겹쳐 그리는 것 / 가격 차트 밑에 따로 그리는 것 */
type Position = "above" | "below";
const positionOf = (placement: IndicatorDef["placement"]): Position => (placement === "overlay" ? "above" : "below");
const POSITION_TITLE: Record<Position, string> = {
  above: "차트 위 · 가격 캔들 위에 겹쳐 그려요",
  below: "차트 아래 · 가격 밑 별도 창에 그려요",
};
const POSITION_NAV: { key: string; label: string; position: Position }[] = [
  { key: "pos:above", label: "차트 위", position: "above" },
  { key: "pos:below", label: "차트 아래", position: "below" },
];

/** 즐겨찾기한 지표 id (이 브라우저에 사용자별로 저장) */
const FAVORITE_STORE = "trackit:indicator-favorites";

function loadFavorites(): string[] {
  try {
    const saved = JSON.parse(readUserStorage(FAVORITE_STORE) ?? "");
    if (Array.isArray(saved)) return saved.filter((id) => typeof id === "string");
  } catch {
    // 처음이면 없음
  }
  return [];
}

export default function IndicatorPicker({ instances, onAdd, onUpdate, onRemove, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  // 즐겨찾기가 있으면 즐겨찾기 탭부터 연다
  const [category, setCategory] = useState<string>(() => (loadFavorites().length ? "즐겨찾기" : "전체"));

  function toggleFavorite(id: string) {
    setFavorites((list) => {
      const next = list.includes(id) ? list.filter((f) => f !== id) : [...list, id];
      localStorage.setItem(userStorageKey(FAVORITE_STORE), JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INDICATOR_LIBRARY.filter(
      (d) =>
        (category === "전체" ||
          (category === "즐겨찾기"
            ? favorites.includes(d.id)
            : category.startsWith("pos:")
              ? positionOf(d.placement) === POSITION_NAV.find((n) => n.key === category)?.position
              : d.category === category)) &&
        (!q || `${d.name} ${d.short} ${d.description}`.toLowerCase().includes(q)),
    );
  }, [query, category, favorites]);

  function renderItem(d: IndicatorDef) {
    const count = instances.filter((i) => i.id === d.id).length;

    const fav = favorites.includes(d.id);
    return (
      <li key={d.id}>
        <button
          className={`ind-star${fav ? " on" : ""}`}
          onClick={() => toggleFavorite(d.id)}
          aria-pressed={fav}
          aria-label={fav ? `${d.name} 즐겨찾기 해제` : `${d.name} 즐겨찾기`}
          title={fav ? "즐겨찾기 해제" : "즐겨찾기"}
        >
          {fav ? "★" : "☆"}
        </button>
        <button className="ind-add" onClick={() => onAdd(d.id)} title="차트에 추가">
          <span>
            <strong>{d.name}</strong>
            <em>{PLACE_LABEL[d.placement]}</em>
            {count > 0 && <b>{count}개 적용</b>}
          </span>
          <small>{d.description}</small>
          <i>＋</i>
        </button>
      </li>
    );
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ind-modal" role="dialog" aria-modal="true" aria-label="지표">
        <header>
          <h2>지표</h2>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름으로 찾기 (예: RSI, 볼린저, 이동평균)" aria-label="지표 검색" />
          <button className="ind-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="ind-body">
          <nav aria-label="분류">
            <h6>위치</h6>
            {POSITION_NAV.map((n) => (
              <button key={n.key} className={category === n.key ? "active" : ""} onClick={() => setCategory(n.key)}>
                {n.label}
                <small>{INDICATOR_LIBRARY.filter((d) => positionOf(d.placement) === n.position).length}</small>
              </button>
            ))}
            <h6>분류</h6>
            {["즐겨찾기", "전체", ...INDICATOR_CATEGORIES].map((c) => (
              <button key={c} className={`${category === c ? "active" : ""}${c === "즐겨찾기" ? " fav" : ""}`} onClick={() => setCategory(c)}>
                {c === "즐겨찾기" ? "★ 즐겨찾기" : c}
                <small>{c === "즐겨찾기" ? favorites.length : c === "전체" ? INDICATOR_LIBRARY.length : INDICATOR_LIBRARY.filter((d) => d.category === c).length}</small>
              </button>
            ))}
          </nav>

          <ul className="ind-list">
            {list.length === 0 && <li className="ind-empty">{category === "즐겨찾기" && !query.trim() ? "지표 옆 ☆ 를 누르면 여기에 모여요." : "찾는 지표가 없어요."}</li>}
            {(["above", "below"] as const).flatMap((pos) => {
              const items = list.filter((d) => positionOf(d.placement) === pos);
              if (!items.length) return [];
              return [
                <li key={`h-${pos}`} className="ind-pos-head">
                  {POSITION_TITLE[pos]}
                </li>,
                ...items.map((d) => renderItem(d)),
              ];
            })}
          </ul>

          <section className="ind-active" aria-label="적용 중">
            <h3>적용 중 {instances.length}</h3>
            {instances.length === 0 && <p className="ind-empty">왼쪽에서 지표를 눌러 추가하세요.</p>}
            {instances.map((inst) => {
              const def = getIndicator(inst.id);
              if (!def) return null;
              const colors = inst.colors ?? def.outputs.map((o) => o.color);
              return (
                <div key={inst.uid} className={`ind-item${inst.visible ? "" : " hidden"}`}>
                  <div className="ind-item-head">
                    <i style={{ background: colors[0] }} />
                    <strong>{instanceLabel(def, inst.params)}</strong>
                    <button onClick={() => onUpdate(inst.uid, { visible: !inst.visible })} title={inst.visible ? "숨기기" : "보이기"}>
                      {inst.visible ? "숨김" : "보임"}
                    </button>
                    <button onClick={() => onRemove(inst.uid)} title="삭제">
                      삭제
                    </button>
                  </div>
                  {def.params.length > 0 && (
                    <div className="ind-params">
                      {def.params.map((p) => (
                        <label key={p.key}>
                          <span>{p.label}</span>
                          <input
                            type="number"
                            value={inst.params[p.key] ?? p.default}
                            min={p.min}
                            max={p.max}
                            step={p.step ?? 1}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isFinite(v) || v < (p.min ?? 0) || (v <= 0 && (p.min ?? 1) > 0)) return;
                              onUpdate(inst.uid, {
                                params: {
                                  ...inst.params,
                                  [p.key]: Math.min(p.max ?? v, Math.max(p.min ?? v, v)),
                                },
                              });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {/* 선마다 색: 기본 견본 + 직접 고르기 */}
                  <div className="ind-colors">
                    {def.outputs.map((o, k) =>
                      o.colorBy ? null : (
                        <div key={o.key}>
                          <span>{def.outputs.length > 1 ? o.label : "색"}</span>
                          <ColorSwatches
                            value={colors[k]}
                            label={`${o.label} 색`}
                            onChange={(c) =>
                              onUpdate(inst.uid, {
                                colors: colors.map((old, j) => (j === k ? c : old)),
                              })
                            }
                          />
                        </div>
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
