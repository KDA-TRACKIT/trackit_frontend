"use client";
// 내 노트 · 전략 판매 (2026-11-22, 비즈니스 계정만): 섹터와 제목을 정해 전략 마켓에 올림 (구독료는 트레이더 단위라 여기서 안 정함)
//   기간은 고를 수 없음 (2026-11-22): 이미 판 노트는 못 넣고, 아직 안 판 노트는 빠짐없이 들어감
//     시작 = 그 섹터의 직전 전략이 끝난 때 (처음이면 그 섹터의 첫 노트), 끝 = 지금 — 서버가 같은 규칙으로 정함
//     지키지 못한 계획 · 손실 난 매매를 기간을 골라 빼고 팔 수 없게. 직전 전략이 아직 안 끝났으면 못 만듦
//   올리기: POST /strategies { title, sector, periodEnd, sourceJournalId } → POST /strategies/{id}/listings { kind: MONTHLY, price: 0 } (마켓에 보이게 하는 판매 표시, 결제는 트레이더 구독으로)
//   판매 멈춤 · 가격 확인은 마이페이지 구독 관리에서
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { apiRequest, errorMessage } from "../../../lib/api/client";
import { MARKET_WIDE, isMarketGroup, type Memo } from "./model";

type MyStrategy = { id: string; sector: string | null; periodEnd: string | null; title: string };
type NoteGroup = { journal: { id: string; symbol: string } };

const KST = 9 * 3_600_000;
const ymd = (d: Date) => new Date(d.getTime() + KST).toISOString().slice(0, 10);
const dot = (s: string) => s.replace(/-/g, ".");
/** 오늘(KST)부터 n일 뒤 날짜 */
const dayFromNow = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));

export default function SellPanel({ memos, onClose }: { memos: Memo[]; onClose: () => void }) {
  // 팔 수 있는 섹터: 내 전략 섹터로 묶인 종목 노트만 (시장 · 뉴스 노트, 상장 시장으로만 묶인 노트는 빼고)
  const sectors = useMemo(() => {
    const m = new Map<string, { count: number; codes: Set<string>; ats: string[] }>();
    for (const x of memos) {
      if (!x.code || x.sector === MARKET_WIDE || isMarketGroup(x.sector)) continue;
      const g = m.get(x.sector) ?? { count: 0, codes: new Set<string>(), ats: [] as string[] };
      g.count += 1;
      g.codes.add(x.code);
      g.ats.push(x.at);
      m.set(x.sector, g);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count).map(([sector, g]) => ({ sector, count: g.count, codes: [...g.codes], ats: g.ats.sort() }));
  }, [memos]);

  const [mine, setMine] = useState<MyStrategy[] | null>(null);
  const [journals, setJournals] = useState<{ id: string; symbol: string }[]>([]);
  useEffect(() => {
    let live = true;
    apiRequest<MyStrategy[]>("/strategies")
      .then((v) => live && setMine(v))
      .catch(() => live && setMine([]));
    apiRequest<NoteGroup[]>("/me/notes?limit=100")
      .then((v) => live && setJournals(v.map((g) => g.journal)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const [sector, setSector] = useState("");
  /** 섹터마다 직전 전략이 끝난 시각 (이미 판 노트는 그때까지) */
  const prevEndOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of mine ?? []) if (x.sector && x.periodEnd && (!m.has(x.sector) || x.periodEnd > m.get(x.sector)!)) m.set(x.sector, x.periodEnd);
    return m;
  }, [mine]);
  /** 아직 판매하지 않은 노트 (직전 전략이 끝난 뒤, KST 'YYYY-MM-DD HH:MM:SS' 로 비교) */
  const unsoldOf = (sec: { sector: string; ats: string[] }) => {
    const end = prevEndOf.get(sec.sector);
    const at = end ? new Date(new Date(end).getTime() + 9 * 3_600_000).toISOString().slice(0, 19).replace("T", " ") : null;
    return sec.ats.filter((x) => !at || x > at);
  };
  const cur = sectors.find((s) => s.sector === sector) ?? sectors[0];
  const prevEnd = cur ? (prevEndOf.get(cur.sector) ?? null) : null;
  const today = dayFromNow(0);
  /** 직전 전략이 아직 진행 중이면 그 끝 날짜 (끝나야 다음 전략) */
  const openUntil = prevEnd && ymd(new Date(prevEnd)) > today ? ymd(new Date(prevEnd)) : null;
  const unsold = cur ? unsoldOf(cur) : [];
  const start = openUntil ? null : prevEnd ? ymd(new Date(prevEnd)) : (unsold[0]?.slice(0, 10) ?? null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  async function submit() {
    if (!cur || busy) return;
    const journal = journals.find((j) => cur.codes.includes(j.symbol));
    if (!journal) return setError("이 섹터의 매매일지를 찾지 못했어요. 트레이딩 로그에서 노트를 한 번 저장해 주세요.");
    if (openUntil) return setError("이 섹터의 직전 전략 기간이 아직 안 끝났어요.");
    if (!start || !unsold.length) return setError("이 섹터에 아직 판매하지 않은 노트가 없어요.");
    setBusy(true);
    setError(null);
    try {
      const s = await apiRequest<{ id: string }>("/strategies", {
        method: "POST",
        body: JSON.stringify({ title: title.trim() || `${cur.sector} 전략`, sector: cur.sector, sourceJournalId: journal.id }),
      });
      await apiRequest(`/strategies/${s.id}/listings`, { method: "POST", body: JSON.stringify({ kind: "MONTHLY", price: 0 }) });
      setDone(`${cur.sector} · ${dot(start)} ~ ${dot(today)} · 노트 ${unsold.length}개`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mp-modal-backdrop mm-sell-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="mm-sell" role="dialog" aria-modal="true" aria-label="전략 판매">
        <header>
          <h2>전략 판매</h2>
          <button type="button" className="mm-sell-x" onClick={onClose} disabled={busy} aria-label="닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {done ? (
          <div className="mm-sell-done">
            <strong>전략 마켓에 올렸어요</strong>
            <p>{done}</p>
            <Link href="/marketplace" className="mk-primary">
              전략 마켓에서 보기
            </Link>
          </div>
        ) : !sectors.length ? (
          <p className="mm-sell-empty">섹터로 묶인 종목 노트가 아직 없어요.</p>
        ) : (
          <>
            <label>
              <span>섹터</span>
              <select value={cur?.sector ?? ""} onChange={(e) => setSector(e.target.value)} disabled={busy}>
                {sectors.map((s) => (
                  <option key={s.sector} value={s.sector}>
                    {s.sector} · 판매 안 한 노트 {mine === null ? "…" : unsoldOf(s).length}개
                  </option>
                ))}
              </select>
            </label>
            <div className="mm-sell-period">
              <label>
                <span>시작</span>
                <input value={openUntil ? `${dot(openUntil)} 이후` : start ? dot(start) : "—"} readOnly />
              </label>
              <label>
                <span>끝</span>
                <input value={dot(today)} readOnly />
              </label>
            </div>
            <p className="mm-sell-note">
              {openUntil ? "직전 전략 기간이 끝나면 올릴 수 있어요" : `아직 판매하지 않은 노트 ${unsold.length}개가 모두 들어가요`}
            </p>
            <label>
              <span>제목</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={cur ? `${cur.sector} 전략` : ""} maxLength={80} disabled={busy} />
            </label>
            {error && <p className="mm-sell-error">{error}</p>}
            <footer>
              <button type="button" onClick={onClose} disabled={busy}>
                취소
              </button>
              <button type="button" className="primary" onClick={() => void submit()} disabled={busy || !!openUntil || !unsold.length || mine === null}>
                {busy ? "올리는 중…" : "전략 마켓에 올리기"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
