// 기록(확정 노트)을 백엔드 → Supabase DB 에 저장·조회 (로그인했을 때)
//   GET/POST /journals, GET/POST /journals/:id/note-versions
// 확정 노트는 서버에서 수정·삭제할 수 없고(내용 해시로 잠김), 고치려면 새 버전으로 남긴다
// 종목 없는 "시장 전반" 메모는 사용자마다 하나인 MARKET 일지에 모은다
import type { Journal } from "../types/journal";
import { apiRequest } from "./client";
import type { NoteLine } from "../../app/workshop/lineLadder";

export const MARKET_SYMBOL = "MARKET";

type NoteSummary = {
  summary?: string;
  symbolName?: string | null;
  topic?: string;
  /** 노트에 연결한 체결 (확정 시점 기준) */
  execution?: { time: string; side: string; quantity: number } | null;
  /** 노트를 쓴 시각 KST HH:MM:SS (확정 시각과 다를 수 있음) */
  noteTime?: string;
  /** 그은 선의 지지 · 저항 분류와 고른 매매 (종목 전략 · 이행률 판정에 씀) */
  lines?: NoteLine[];
  /** 뉴스 · 경제 지표 메모의 정량 전략 종목 */
  target?: { code: string; name: string };
  /** 고친 메모면 고치기 전 메모 id */
  replaces?: string;
  /** 종목 전략 정리본이면 합친 예전 메모 id 들 (화면엔 정리본 하나만, 예전 것은 기록에 그대로) */
  consolidates?: string[];
};

export type NoteVersion = {
  id: string;
  journalId: string;
  symbol: string;
  version: number;
  drawings: unknown;
  aiSummary: NoteSummary;
  aiModel: string | null;
  confirmedAt: string;
  contentHash: string;
  /** 노트 종류 (서버 판정): general 일반 · strategy 전략(아직 매매 없음) · trade 매매 노트 (2026-11-19) */
  noteType?: "general" | "strategy" | "trade";
};

/** 종목(또는 MARKET) 일지를 찾고, 없으면 만든다 */
async function journalFor(symbol: string, name: string, market: string): Promise<Journal> {
  const list = await apiRequest<Journal[]>(`/journals?symbol=${encodeURIComponent(symbol)}&limit=1`);
  if (list[0]) return list[0];
  return apiRequest<Journal>("/journals", { method: "POST", body: JSON.stringify({ title: name, symbol, market }) });
}

/** 기록 하나를 확정 노트로 저장 */
export async function saveNote(input: {
  symbol: string | null;
  symbolName: string | null;
  text: string;
  noteTime: string;
  topic?: string;
  execution?: { time: string; side: string; quantity: number } | null;
  drawings?: unknown;
  lines?: NoteLine[];
  target?: { code: string; name: string };
  replaces?: string;
  /** 종목 전략 정리본이면 합친 예전 메모 id 들 (화면엔 정리본 하나만, 예전 것은 기록에 그대로) */
  consolidates?: string[];
  /**
   * 노트 완성도 점검: plan = 종류별 필수를 다 채움, observe = 관찰 메모 (이행률의 '계획 있음'에 안 들어감)
   * kind: trade 매매 계획 · hold 보유 관리 · view 분석·전망 · review 회고. 나머지는 종류별 항목 (빈 값은 빠짐)
   */
  plan?: { status: "plan" | "observe"; kind?: string } & Partial<Record<"direction" | "entry" | "stop" | "target" | "until" | "weight" | "decision" | "reason" | "viewDir" | "level" | "diff" | "cause" | "next", string>>;
}): Promise<NoteVersion> {
  const isMarket = !input.symbol;
  const journal = await journalFor(isMarket ? MARKET_SYMBOL : input.symbol!, isMarket ? "시장 전반" : (input.symbolName ?? input.symbol!), isMarket ? "ETC" : "KRX");
  const aiSummary: NoteSummary = {
    summary: input.text,
    symbolName: input.symbolName,
    noteTime: input.noteTime,
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.execution ? { execution: input.execution } : {}),
    ...(input.lines?.length ? { lines: input.lines } : {}),
    ...(input.target ? { target: input.target } : {}),
    ...(input.replaces ? { replaces: input.replaces } : {}),
    ...(input.consolidates?.length ? { consolidates: input.consolidates } : {}),
    ...(input.plan
      ? (() => {
          const { status, kind, ...fields } = input.plan;
          return { planStatus: status, noteKind: kind, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) };
        })()
      : {}),
  };
  return apiRequest<NoteVersion>(`/journals/${journal.id}/note-versions`, {
    method: "POST",
    body: JSON.stringify({ drawings: input.drawings ?? [], aiSummary, aiModel: "user" }),
  });
}

/** 내 일지 전체의 확정 노트 (최근 일지 100개까지) */
export async function listNotes(): Promise<{ journal: Journal; notes: NoteVersion[] }[]> {
  const journals = await apiRequest<Journal[]>("/journals?limit=100");
  return Promise.all(journals.map(async (journal) => ({ journal, notes: await apiRequest<NoteVersion[]>(`/journals/${journal.id}/note-versions`) })));
}

/** 기록 지우기 = 숨김 (서버 원본은 append-only 로 남고 목록에서만 빠짐) */
export function hideNote(noteVersionId: string) {
  return apiRequest<{ id: string; hidden: boolean }>(`/note-versions/${encodeURIComponent(noteVersionId)}`, { method: "DELETE" });
}
