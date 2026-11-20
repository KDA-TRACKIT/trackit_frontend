"use client";
// 전략보관함 · AI로 새 전략 만들기: 재료 고르기(목록 · 보드 · 차트) → 요청 → 초안 미리보기 → 전략보관함(내 전략)에 저장
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Pencil, Sparkles, X } from "lucide-react";
import SiteHeader from "../../SiteHeader";
import { KINDS, countBy, filterItems, useArchive, type ItemKind } from "../items";
import { ItemCard, KindTag, PurchasedCards, ViewToggle, type View } from "../parts";
import { SymbolPeriodFilter } from "../ListView";
import BoardView from "../BoardView";
import ChartView from "../ChartView";
import { compose, saveDraft, type Draft } from "../drafts";
import { monthLabel } from "../../marketplace/data";
import BeeLoader from "../../BeeLoader";

const MAX = 10;

export default function AiBuilder({ initialPick = [] }: { initialPick?: string[] }) {
  const router = useRouter();
  const { items, loading } = useArchive();
  const [view, setView] = useState<View>("list");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialPick));
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [full, setFull] = useState(false);

  const pick = (ids: string[], on: boolean) => {
    setPicked((cur) => {
      const n = new Set(cur);
      for (const id of ids) {
        if (!on) n.delete(id);
        else if (n.size < MAX) n.add(id);
      }
      setFull(on && ids.some((id) => !n.has(id)));
      return n;
    });
  };
  const chosen = items.filter((i) => picked.has(i.id));
  const step = draft ? 3 : chosen.length ? 2 : 1;

  return (
    <main className="mk-page ar-page">
      <SiteHeader active="archive" />
      <div className="mk-wrap ar-wrap">
        <nav className="ar-crumb">
          <Link href="/archive">전략보관함</Link> / <b>AI 전략 만들기</b>
        </nav>
        <div className="ar-hub-head">
          <div>
            <h1 className="mk-title">
              AI로 새 전략 만들기 <span className="ar-ai-badge">✦ AI</span>
            </h1>
            <ol className="ar-steps">
              <li className={step >= 1 ? "on" : ""}>
                <b>1</b>재료 고르기
              </li>
              <li className={step >= 2 ? "on" : ""}>
                <b>2</b>조건 설정
              </li>
              <li className={step >= 3 ? "on" : ""}>
                <b>3</b>전략 만들기
              </li>
            </ol>
          </div>
          <div className="ar-hub-tools col">
            <ViewToggle view={view} onView={setView} />
          </div>
        </div>

        {view === "list" ? (
          <div className="ar-ai">
            <PickList items={items} loading={loading} picked={picked} onPick={pick} full={full} />
            <div className="ar-ai-side">
              <Request chosen={chosen} picked={picked} onPick={pick} onClear={() => setPicked(new Set())} request={request} onRequest={setRequest} onMake={() => setDraft(compose(chosen, request))} />
              {draft && <Preview draft={draft} setDraft={setDraft} editing={editing} setEditing={setEditing} onRetry={() => setDraft(compose(chosen, request))} onSave={() => (saveDraft(draft), router.push(`/archive/mine?draft=${draft.id}`))} />}
            </div>
          </div>
        ) : (
          <>
            {view === "board" ? <BoardView items={items} picked={picked} onPick={pick} /> : <ChartView items={items} picked={picked} onPick={pick} />}
            {view === "chart" && (
              <>
                <div className="ar-section-title">
                  <h3>
                    구독한 전략 <small>{chosen.filter((i) => i.kind === "strategy").length}개 담음</small>
                  </h3>
                  <Link href="/archive/purchases">구독 목록 ›</Link>
                </div>
                <PurchasedCards items={items.filter((i) => i.kind === "strategy")} picked={picked} onPick={(id) => pick([id], !picked.has(id))} cta="shop" />
              </>
            )}
            <div className="ar-ai-bottom">
              <Request chosen={chosen} picked={picked} onPick={pick} onClear={() => setPicked(new Set())} request={request} onRequest={setRequest} onMake={() => setDraft(compose(chosen, request))} />
              {draft && <Preview draft={draft} setDraft={setDraft} editing={editing} setEditing={setEditing} onRetry={() => setDraft(compose(chosen, request))} onSave={() => (saveDraft(draft), router.push(`/archive/mine?draft=${draft.id}`))} />}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function PickList({ items, loading, picked, onPick, full }: { items: ReturnType<typeof useArchive>["items"]; loading: boolean; picked: Set<string>; onPick: (ids: string[], on: boolean) => void; full: boolean }) {
  const [kind, setKind] = useState<ItemKind | "all">("all");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [days, setDays] = useState(0);
  const base = useMemo(() => filterItems(items, { symbol, days }), [items, symbol, days]);
  const c = countBy(base);
  const shown = kind === "all" ? base : base.filter((i) => i.kind === kind);
  return (
    <div className="ar-ai-main">
      <SymbolPeriodFilter
        items={items}
        symbol={symbol}
        onSymbol={setSymbol}
        days={days}
        onDays={setDays}
        kinds={
          <div className="ar-frow">
            <span>분류</span>
            <div className="ar-chips">
              <button type="button" className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>
                전체 {base.length}
              </button>
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={kind === k.key ? "on" : ""} onClick={() => setKind(k.key)}>
                  {k.key === "journal" ? "매매 노트" : k.label} {c[k.key]}
                </button>
              ))}
            </div>
          </div>
        }
      />
      <div className="ar-result">
        <strong>
          전체 기록 {shown.length}개 <span className="ar-pill on">{picked.size}개 선택됨</span>
        </strong>
        {full && <small className="ar-warn">최대 {MAX}개까지 고를 수 있어요</small>}
      </div>
      {loading && !items.length ? (
        <div className="mk-card mk-empty"><BeeLoader /></div>
      ) : !shown.length ? (
        <div className="mk-card mk-empty">고를 수 있는 기록이 없어요. 트레이딩 로그에서 기록을 남기거나 전략 마켓에서 전략을 열어 보세요.</div>
      ) : (
        <div className="ar-grid">
          {shown.map((i) => (
            <ItemCard key={i.id} item={i} picked={picked.has(i.id)} onPick={() => onPick([i.id], !picked.has(i.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function Request({
  chosen,
  onPick,
  onClear,
  request,
  onRequest,
  onMake,
}: {
  chosen: ReturnType<typeof useArchive>["items"];
  picked: Set<string>;
  onPick: (ids: string[], on: boolean) => void;
  onClear: () => void;
  request: string;
  onRequest: (s: string) => void;
  onMake: () => void;
}) {
  return (
    <section className="mk-card ar-req">
      <h3>어떤 전략을 만들까요?</h3>
      <div className="ar-req-head">
        <b>
          선택한 재료 <em>{chosen.length}</em> / {MAX}
        </b>
        {chosen.length > 0 && (
          <button type="button" onClick={onClear}>
            전체 해제
          </button>
        )}
      </div>
      {chosen.length ? (
        <ul className="ar-req-list">
          {chosen.map((i) => (
            <li key={i.id}>
              <KindTag kind={i.kind} />
              <span>
                {i.title}
                {i.symbolName ? ` · ${i.symbolName}` : ""}
              </span>
              <button type="button" aria-label="빼기" onClick={() => onPick([i.id], false)}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ar-empty-s">왼쪽(또는 위)에서 재료를 골라 주세요.</p>
      )}
      <label className="ar-req-ask">
        <b>AI에게 요청하기 (선택)</b>
        <textarea value={request} maxLength={300} onChange={(e) => onRequest(e.target.value)} placeholder="예: 지지선 반등 진입 조건에 거래량 돌파 확인을 더하고, 손절 기준을 −3%로 명확하게 정리해 줘." rows={4} />
        <small>{request.length} / 300</small>
      </label>
      <button type="button" className="ar-make" disabled={!chosen.length} onClick={onMake}>
        <Sparkles size={16} />
        선택한 {chosen.length}개로 AI 전략 만들기
      </button>
    </section>
  );
}

function Preview({
  draft,
  setDraft,
  editing,
  setEditing,
  onRetry,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  editing: boolean;
  setEditing: (b: boolean) => void;
  onRetry: () => void;
  onSave: () => void;
}) {
  const field = (key: "entry" | "exit" | "stop", label: string) => (
    <div className="ar-pv-field">
      <small>{label}</small>
      {editing ? (
        <textarea value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} rows={2} placeholder="직접 적어 주세요" />
      ) : draft[key] ? (
        <p>{draft[key]}</p>
      ) : (
        <p className="ar-pv-miss">재료에서 찾지 못했어요. ✎ 수정을 눌러 직접 적어 주세요.</p>
      )}
    </div>
  );
  return (
    <section className="mk-card ar-preview">
      <div className="ar-pv-head">
        <h3>
          <Sparkles size={15} /> AI가 만든 전략 미리보기
        </h3>
        <button type="button" onClick={() => setEditing(!editing)}>
          <Pencil size={13} /> {editing ? "다 고쳤어요" : "수정"}
        </button>
      </div>
      <div className="ar-pv-title">
        <span className="ar-pill">{monthLabel(draft.month)}</span>
        {editing ? <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="전략 이름" /> : <strong>{draft.title}</strong>}
      </div>
      <div className="ar-pv-chips">
        <span>
          매매 방식 <b>{draft.style}</b>
        </span>
        <span className={draft.risk === "확인 필요" ? "warn" : ""}>
          위험도 <b>{draft.risk}</b>
        </span>
        <span>
          참고 지표 <b>{draft.indicators.join(" · ") || "—"}</b>
        </span>
      </div>
      {field("entry", "진입 조건")}
      {field("exit", "청산 조건")}
      {field("stop", "손절 기준")}
      {draft.request && (
        <div className="ar-pv-field">
          <small>요청 사항</small>
          <p>{draft.request}</p>
        </div>
      )}
      <div className="ar-pv-src">
        <small>근거로 사용한 재료</small>
        <div>
          {draft.sources.map((s, k) => (
            <span key={k} className={`ar-tag ar-k-${s.kind}`} title={`${s.date} · ${s.title}`}>
              {KINDS.find((x) => x.key === s.kind)!.label}
            </span>
          ))}
        </div>
      </div>
      <p className="ar-pv-fine">고른 재료에 적힌 내용으로만 정리했어요. 투자 결과를 보장하지 않아요.</p>
      <div className="ar-pv-act">
        <button type="button" className="mk-ghost" onClick={onRetry}>
          다시 만들기
        </button>
        <button type="button" className="mk-primary" onClick={onSave}>
          전략보관함에 저장
        </button>
      </div>
    </section>
  );
}
