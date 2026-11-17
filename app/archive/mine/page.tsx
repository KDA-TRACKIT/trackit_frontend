"use client";
// 아카이브 · 내 전략: 내가 만든 전략(서버 GET /strategies) + AI로 만든 초안(이 브라우저)을 한 표로
//   표에서 고르면 아래에 전략 상세 · 성과 분석. 판매 가격 · 판매 설정은 마이페이지 판매 관리에서
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import SiteHeader from "../../SiteHeader";
import { apiRequest, errorMessage } from "../../../lib/api/client";
import { removeDraft, sourceLabel, useDrafts, type Draft } from "../drafts";
import { monthLabel } from "../../marketplace/data";
import "../../marketplace/marketplace.css";
import "../archive.css";

type MyStrategy = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  archivedAt: string | null;
  listings: { id: string; kind: "MONTHLY" | "ALL"; price: string | number; status: string }[];
  versions: { version: number; createdAt: string }[];
  _count: { versions: number };
};

type Row = { key: string; title: string; target: string; created: string; status: string; tone: string; server?: MyStrategy; draft?: Draft };

const won = (n: string | number) => `₩${Math.round(Number(n)).toLocaleString("ko-KR")}`;
const ym = (v: number) => `${String(v).slice(0, 4)}년 ${String(v).slice(4)}월`;
const day = (iso: string) => iso.slice(0, 10).replaceAll("-", ".");

export default function MyStrategiesPage() {
  const [list, setList] = useState<MyStrategy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drafts = useDrafts();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(() => {
    const d = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("draft");
    return d ? `d-${d}` : null;
  });

  useEffect(() => {
    apiRequest<MyStrategy[]>("/strategies")
      .then(setList)
      .catch((e) => {
        setList([]);
        setError(errorMessage(e));
      });
  }, []);

  const rows: Row[] = useMemo(
    () => [
      ...drafts.map((d) => ({ key: `d-${d.id}`, title: d.title, target: d.note.replace("다루는 종목: ", "") || "—", created: d.createdAt, status: "초안", tone: "draft", draft: d })),
      ...(list ?? []).map((s) => {
        const selling = s.listings.some((l) => l.status === "ACTIVE");
        return {
          key: s.id,
          title: s.title,
          target: s.description ?? "—",
          created: s.createdAt,
          status: s.archivedAt ? "보관" : selling ? "판매 중" : s.status === "PUBLISHED" ? "공개" : "작성 중",
          tone: selling ? "sell" : s.status === "PUBLISHED" ? "pub" : "draft",
          server: s,
        };
      }),
    ],
    [drafts, list],
  );
  const word = q.trim().toLowerCase();
  const shown = rows.filter((r) => !word || `${r.title} ${r.target}`.toLowerCase().includes(word));
  const picked = rows.find((r) => r.key === sel) ?? rows[0];
  const selling = rows.filter((r) => r.tone === "sell").length;

  return (
    <main className="mk-page ar-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <nav className="ar-crumb">
          <Link href="/archive">아카이브</Link> / <b>내 전략</b>
        </nav>
        <div className="ar-hub-head">
          <div>
            <h1 className="mk-title">내 전략</h1>
          </div>
          <Link href="/archive/ai" className="ar-new">
            <Plus size={16} /> 새 전략 작성
          </Link>
        </div>

        <div className="ar-stats">
          <div className="mk-card">
            <small>전체 전략 수</small>
            <strong>{list === null ? "—" : `${rows.length}개`}</strong>
            <span>작성한 모든 전략</span>
          </div>
          <div className="mk-card">
            <small>판매 중</small>
            <strong>{list === null ? "—" : `${selling}개`}</strong>
            <span>
              <Link href="/mypage/sales/strategies">판매 관리 ›</Link>
            </span>
          </div>
          <div className="mk-card">
            <small>초안</small>
            <strong>{drafts.length}개</strong>
            <span>AI로 만든 전략 · 이 브라우저에 저장</span>
          </div>
        </div>
        {error && <p className="ar-note">{error}</p>}

        <section className="mk-card ar-table-card">
          <div className="ar-sec-head">
            <div>
              <h3>전략 목록</h3>
            </div>
            <label className="ar-search">
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="전략명 또는 종목 검색" aria-label="전략 검색" />
            </label>
          </div>
          {list === null ? (
            <p className="ar-empty-s">불러오는 중…</p>
          ) : !rows.length ? (
            <div className="mk-empty">
              아직 만든 전략이 없어요. 아카이브의 기록을 골라 AI로 전략을 만들어 보세요.
              <br />
              <Link href="/archive/ai" className="ar-link">
                AI 전략 만들기 ›
              </Link>
            </div>
          ) : (
            <table className="ar-table">
              <thead>
                <tr>
                  <th>전략명</th>
                  <th>대상 종목 · 설명</th>
                  <th>작성일</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className={picked?.key === r.key ? "on" : ""} onClick={() => setSel(r.key)}>
                    <td>
                      <b>{r.title}</b>
                    </td>
                    <td>{r.target}</td>
                    <td>{day(r.created)}</td>
                    <td>
                      <span className={`ar-st ${r.tone}`}>{r.status}</span>
                    </td>
                    <td>
                      <button type="button" className="ar-textbtn" onClick={() => setSel(r.key)}>
                        상세 보기 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {picked && (
          <div className="ar-detail">
            <section className="mk-card ar-detail-main">
              <h3>전략 상세</h3>
              <h4>
                {picked.title}
                {picked.draft && picked.target !== "—" ? ` · ${picked.target}` : ""}
              </h4>
              {picked.draft ? (
                <>
                  <Field label="진입 조건" value={picked.draft.entry} />
                  <Field label="청산 조건" value={picked.draft.exit} />
                  <Field label="손절 기준" value={picked.draft.stop} />
                  <Field label="전략 설명" value={`${monthLabel(picked.draft.month)} · ${picked.draft.style} · 위험도 ${picked.draft.risk}${picked.draft.indicators.length ? ` · ${picked.draft.indicators.join(", ")}` : ""}`} />
                  <div className="ar-detail-foot">
                    <b>근거 재료 {picked.draft.sources.length}개</b>
                    <p>{picked.draft.sources.map(sourceLabel).join("  ·  ")}</p>
                    <div className="ar-actions">
                      <button type="button" className="mk-ghost" onClick={() => removeDraft(picked.draft!.id)}>
                        초안 삭제
                      </button>
                      <Link href="/mypage/sales/strategies" className="mk-primary">
                        판매 전략으로 등록 ›
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                picked.server && (
                  <>
                    <Field label="전략 설명" value={picked.server.description ?? ""} />
                    <Field
                      label="판매"
                      value={
                        picked.server.listings
                          .map((l) => `${l.kind === "MONTHLY" ? "한 달" : "전체"} ${won(l.price)}${l.status === "ACTIVE" ? " (판매 중)" : ""}`)
                          .join(" · ") || "판매 안 함"
                      }
                    />
                    <Field label="기록된 달" value={picked.server.versions.map((v) => ym(v.version)).join(", ") || `${picked.server._count.versions}개`} />
                    <div className="ar-detail-foot">
                      <Link href="/mypage/sales/strategies" className="ar-textbtn">
                        판매 · 매매일지 연결 관리 →
                      </Link>
                    </div>
                  </>
                )
              )}
            </section>
            <section className="mk-card ar-detail-perf">
              <h3>성과 분석</h3>
              {["수익률", "승률", "MDD", "손익비"].map((k) => (
                <div key={k} className="ar-perf-row">
                  <span>{k}</span>
                  <strong>—</strong>
                </div>
              ))}
              <small>전략에 실제 거래가 연결되면 자동으로 집계해요.</small>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ar-field">
      <b>{label}</b>
      <p className={value ? "" : "miss"}>{value || "아직 적지 않았어요"}</p>
    </div>
  );
}
