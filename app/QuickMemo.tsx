"use client";
// 빠른 메모: 오른쪽 아래 작은 원 (챗봇처럼, 검은 원에 캔들 차트). 트레이딩 로그 · 증시 캘린더에 기본으로 떠 있음
//   - 끌어서 옮길 수 있고(위치는 이 브라우저에 기억), × 로 숨기면 화면 오른쪽 끝의 작은 탭으로 다시 꺼냄
//   - 누르면 메모 창. 저장하면 트레이딩 로그의 기록(lib/records)으로 들어감 (로그인했으면 서버)
//   - pickable: 창이 열려 있을 때 화면에서 data-memo 가 달린 항목(종목 · 지수 · 업종 · 뉴스 · 경제 지표 · 공시 …)을 누르면
//     그 항목에 대한 메모가 됨 (그때는 원래 동작 — 차트 열기 · 링크 이동 — 대신 고르기만)
//   - 종목 없는 메모(뉴스 · 경제 지표 · 공시 · 시장)는 정량 전략 칸(선택): 종목 · 매수/매도 · 가격 (2026-11-19 회의)
//     예) 삼성전자 210,000원에 매도 → 그 종목 전략에 매도 가격선(저항)으로 쌓여 이행률 · 일관성 계산에 들어감
import Link from "next/link";
import { Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addRecord, initRecordSource, kstNow, recordSource } from "../lib/records";
import { parseMemo, targetLabel, type MemoTarget } from "../lib/memo-target";
import { searchAllSymbols, type SymbolInfo } from "../lib/market-data";
import { uuid } from "../lib/uuid";
import "./quick-memo.css";

const KEY = "trackit:quick-memo";
const TOPICS = ["시장 흐름", "거시경제", "공시", "뉴스", "업종·테마", "기타"];
const SIZE = 56;
const MARGIN = 16;
type Saved = { x: number; y: number; hidden: boolean }; // x · y = 오른쪽 · 아래에서 떨어진 거리

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "") as Saved;
    if (typeof v.x === "number" && typeof v.y === "number") return { x: v.x, y: v.y, hidden: !!v.hidden };
  } catch {}
  return { x: 28, y: 28, hidden: false };
}

export default function QuickMemo({ base = null, pickable = false }: { base?: MemoTarget | null; pickable?: boolean }) {
  const [pos, setPos] = useState<Saved | null>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<MemoTarget | null>(base);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 정량 전략 (종목 없는 메모만): 종목 · 매수/매도 · 가격
  const [stock, setStock] = useState<SymbolInfo | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SymbolInfo[]>([]);
  const [side, setSide] = useState<"매수" | "매도">("매수");
  const [price, setPrice] = useState("");
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setPos(load()), []);
  useEffect(() => void initRecordSource(), []);
  // 트레이딩 로그에서 차트 종목이 바뀌면 기본 대상도 따라감 (직접 고른 게 없을 때)
  const baseKey = base ? JSON.stringify(base) : "";
  useEffect(() => {
    setTarget((t) => (!t || t.kind === "stock" ? base : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey]);

  const save = (next: Saved) => {
    setPos(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };
  const clamp = (x: number, y: number) => ({
    x: Math.max(MARGIN, Math.min(window.innerWidth - SIZE - MARGIN, x)),
    y: Math.max(MARGIN, Math.min(window.innerHeight - SIZE - MARGIN, y)),
  });

  // 창 크기가 바뀌어 원이 화면 밖으로 나가지 않게
  useEffect(() => {
    const fit = () => setPos((p) => (p ? { ...p, ...clamp(p.x, p.y) } : p));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // 항목 고르기: 창이 열려 있을 때 data-memo 요소를 누르면 그게 메모 대상
  useEffect(() => {
    if (!open || !pickable) return;
    document.body.classList.add("memo-picking");
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-memo]");
      if (!el || panelRef.current?.contains(el) || (e.target as HTMLElement).closest("[data-memo-skip]")) return;
      const t = parseMemo(el.dataset.memo);
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(t);
      setMsg(null);
      textRef.current?.focus();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.body.classList.remove("memo-picking");
      document.removeEventListener("click", onClick, true);
    };
  }, [open, pickable]);

  // 종목 검색 (잠깐 멈추면)
  useEffect(() => {
    const word = q.trim();
    if (!word) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchAllSymbols(word, ac.signal)
        .then((list) => setFound(list.slice(0, 6)))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!pos) return null;

  if (pos.hidden) {
    return (
      <button type="button" className="qm-restore" onClick={() => save({ ...pos, hidden: false })} aria-label="빠른 메모 다시 꺼내기" title="빠른 메모 다시 꺼내기">
        <Pencil size={15} aria-hidden />
      </button>
    );
  }

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    drag.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    setPos({ ...pos, ...clamp(d.x - dx, d.y - dy) });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) save(pos);
    else setOpen((o) => !o);
  };

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setMsg(null);
    const now = kstNow();
    // 정량 전략: 종목 · 가격을 다 적었을 때만 (매수 = 지지 가격선, 매도 = 저항 가격선)
    const p = Number(price.replace(/[^\d.]/g, ""));
    const quant =
      target?.kind !== "stock" && stock && p > 0
        ? {
            target: { code: stock.code, name: stock.name },
            lines: [{ key: `memo:${uuid()}`, price: p, label: `메모 ${side}`, role: side === "매수" ? ("SUPPORT" as const) : ("RESISTANCE" as const), auto: false, trade: side }],
          }
        : {};
    const tail = "target" in quant ? `\n[전략] ${stock!.name} ${p.toLocaleString("ko-KR")}원에 ${side}` : "";
    const common = { date: now.date, noteTime: now.time, executionTime: null, ...quant };
    const result =
      target?.kind === "stock"
        ? await addRecord({ ...common, symbol: target.code, symbolName: target.name, text: target.note ? `[${target.note}] ${body}` : body })
        : target?.kind === "topic"
          ? await addRecord({ ...common, symbol: null, symbolName: null, topic: target.topic, text: `[${target.label}] ${body}${tail}` })
          : await addRecord({ ...common, symbol: null, symbolName: null, topic, text: `${body}${tail}` });
    setBusy(false);
    if (!result.ok) return setMsg({ ok: false, text: result.error ?? "저장하지 못했어요." });
    setText("");
    setStock(null);
    setPrice("");
    setMsg({ ok: true, text: recordSource() === "server" ? "저장했어요" : "이 브라우저에 저장했어요 (로그인하면 계정에 저장)" });
  }

  // 창은 원 위쪽에 (원이 위쪽에 있으면 아래쪽에), 오른쪽 끝을 원과 맞춤
  const below = pos.y > window.innerHeight / 2;
  const panelStyle: React.CSSProperties = {
    right: Math.min(pos.x, window.innerWidth - 340 - MARGIN),
    ...(below ? { top: window.innerHeight - pos.y + 10 } : { bottom: pos.y + SIZE + 10 }),
  };

  return (
    <>
      <div className="qm-bubble-wrap" style={{ right: pos.x, bottom: pos.y }}>
        <button
          type="button"
          className={`qm-bubble${open ? " open" : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen((o) => !o))}
          aria-label={open ? "빠른 메모 닫기" : "빠른 메모 열기"}
          aria-expanded={open}
          title="빠른 메모 (끌어서 옮기기)"
        >
          {open ? (
            <X size={22} aria-hidden />
          ) : (
            // 연필 (검은 원 + 꿀벌 노란색, 글자 없음)
            <Pencil size={26} strokeWidth={2.2} aria-hidden />
          )}
        </button>
        {!open && (
          <button type="button" className="qm-hide" onClick={() => save({ ...pos, hidden: true })} aria-label="빠른 메모 숨기기" title="숨기기 (오른쪽 끝 탭으로 다시 꺼내요)">
            ×
          </button>
        )}
      </div>

      {open && (
        <div ref={panelRef} className="qm-panel" style={panelStyle} role="dialog" aria-label="빠른 메모">
          <div className="qm-head">
            <strong>빠른 메모</strong>
            <Link href="/archive">기록 보기 ›</Link>
          </div>

          <div className="qm-target">
            {target ? (
              <span className="qm-chip">
                {targetLabel(target)}
                <button type="button" onClick={() => setTarget(base?.kind === "stock" && target.kind !== "stock" ? base : null)} aria-label="메모 대상 지우기">
                  ×
                </button>
              </span>
            ) : (
              <div className="qm-topics" role="radiogroup" aria-label="메모 주제">
                {TOPICS.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={topic === t} className={topic === t ? "on" : ""} onClick={() => setTopic(t)}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            {pickable && <p className="qm-hint">화면에서 지수 · 종목 · 업종 · 뉴스 · 경제 지표 · 공시를 누르면 그 항목에 대한 메모가 돼요</p>}
          </div>

          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => (setText(e.target.value), setMsg(null))}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && void submit()}
            rows={4}
            autoFocus
            placeholder={target ? `${target.kind === "stock" ? target.name : target.label}에 대한 생각` : "지금 든 생각을 남겨 두세요"}
            aria-label="메모"
          />
          {target?.kind !== "stock" && (
            <div className="qm-quant" aria-label="정량 전략">
              {stock ? (
                <span className="qm-chip">
                  {stock.name}
                  <button type="button" onClick={() => setStock(null)} aria-label="종목 지우기">
                    ×
                  </button>
                </span>
              ) : (
                <div className="qm-quant-search">
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      if (!e.target.value.trim()) setFound([]);
                    }}
                    placeholder="종목"
                    aria-label="전략 종목"
                  />
                  {q.trim() && found.length > 0 && (
                    <ul>
                      {found.map((f) => (
                        <li key={`${f.code}${f.exchange ?? ""}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setStock(f);
                              setQ("");
                              setFound([]);
                            }}
                          >
                            {f.name} <small>{f.code}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <input className="qm-quant-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="가격" aria-label="전략 가격" />
              <span className="qm-quant-side" role="radiogroup" aria-label="매수 · 매도">
                {(["매수", "매도"] as const).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={side === s} className={side === s ? `on ${s === "매수" ? "buy" : "sell"}` : ""} onClick={() => setSide(s)}>
                    {s}
                  </button>
                ))}
              </span>
            </div>
          )}

          <div className="qm-foot">
            {msg ? <small className={msg.ok ? "ok" : "err"}>{msg.text}</small> : <small>Ctrl + Enter 로 저장</small>}
            <button type="button" className="qm-save" onClick={() => void submit()} disabled={!text.trim() || busy}>
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
