// 기록(확정 노트)을 백엔드 → Supabase DB 에 저장·조회 (로그인했을 때)
//   GET/POST /journals, GET/POST /journals/:id/note-versions
// 확정 노트는 서버에서 수정·삭제할 수 없고(내용 해시로 잠김), 고치려면 새 버전으로 남긴다
// 종목 없는 "시장 전반" 메모는 사용자마다 하나인 MARKET 일지에 모은다
import type { Journal } from "../types/journal";
import { apiRequest } from "./client";

export const MARKET_SYMBOL = "MARKET";

type NoteSummary = {
  summary?: string;
  symbolName?: string | null;
  topic?: string;
  /** 노트에 연결한 체결 (확정 시점 기준) */
  execution?: { time: string; side: string; quantity: number } | null;
  /** 노트를 쓴 시각 KST HH:MM:SS (확정 시각과 다를 수 있음) */
  noteTime?: string;
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
}): Promise<NoteVersion> {
  const isMarket = !input.symbol;
  const journal = await journalFor(isMarket ? MARKET_SYMBOL : input.symbol!, isMarket ? "시장 전반" : (input.symbolName ?? input.symbol!), isMarket ? "ETC" : "KRX");
  const aiSummary: NoteSummary = {
    summary: input.text,
    symbolName: input.symbolName,
    noteTime: input.noteTime,
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.execution ? { execution: input.execution } : {}),
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
