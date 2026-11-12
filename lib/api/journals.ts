// 매매일지 · 차트 주석 (백엔드에 이미 있는 API)
//   GET/POST  /journals, GET/PATCH /journals/:id
//   GET/POST  /journals/:id/annotations, DELETE /annotations/:id
// 로그인 전(토큰 없음)이면 같은 모양으로 이 브라우저 localStorage 에 저장한다 → 로그인하면 서버 저장으로 바뀜
import type { ChartAnnotation, ChartDrawing } from "../types/chart";
import type { Journal, StorageMode } from "../types/journal";
import { accessToken, apiRequest } from "./client";

const LOCAL_KEY = "trackit:local-journals";

type LocalStore = { journals: Journal[]; annotations: ChartAnnotation[] };

function readLocal(): LocalStore {
  if (typeof window === "undefined") return { journals: [], annotations: [] };
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "") as LocalStore;
  } catch {
    return { journals: [], annotations: [] };
  }
}

function writeLocal(store: LocalStore) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

export async function storageMode(): Promise<StorageMode> {
  return (await accessToken()) ? "server" : "local";
}

/** 종목의 가장 최근 일지 (없으면 null) */
export async function findJournal(symbol: string, mode: StorageMode): Promise<Journal | null> {
  if (mode === "local") return readLocal().journals.find((j) => j.symbol === symbol) ?? null;
  const list = await apiRequest<Journal[]>(`/journals?symbol=${encodeURIComponent(symbol)}&limit=1`);
  return list[0] ?? null;
}

export async function createJournal(input: { title: string; symbol: string; market: string; timeframe?: string; content?: string }, mode: StorageMode): Promise<Journal> {
  if (mode === "local") {
    const store = readLocal();
    const journal: Journal = {
      id: crypto.randomUUID(),
      title: input.title,
      symbol: input.symbol,
      market: input.market,
      timeframe: input.timeframe ?? null,
      content: input.content ?? null,
      createdAt: new Date().toISOString(),
    };
    store.journals.unshift(journal);
    writeLocal(store);
    return journal;
  }
  return apiRequest<Journal>("/journals", { method: "POST", body: JSON.stringify(input) });
}

export async function updateJournal(id: string, patch: Partial<Pick<Journal, "title" | "content" | "timeframe">>, mode: StorageMode): Promise<Journal> {
  if (mode === "local") {
    const store = readLocal();
    const journal = store.journals.find((j) => j.id === id);
    if (!journal) throw new Error("일지를 찾을 수 없어요.");
    Object.assign(journal, patch, { updatedAt: new Date().toISOString() });
    writeLocal(store);
    return journal;
  }
  return apiRequest<Journal>(`/journals/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function listAnnotations(journalId: string, mode: StorageMode): Promise<ChartAnnotation[]> {
  if (mode === "local") return readLocal().annotations.filter((a) => a.journalId === journalId);
  return apiRequest<ChartAnnotation[]>(`/journals/${journalId}/annotations`);
}

export async function createAnnotation(journalId: string, drawing: ChartDrawing, mode: StorageMode): Promise<ChartAnnotation> {
  if (mode === "local") {
    const store = readLocal();
    const annotation: ChartAnnotation = { ...drawing, payload: { ...drawing.payload, clientId: drawing.id }, id: crypto.randomUUID(), journalId, createdAt: new Date().toISOString() };
    store.annotations.push(annotation);
    writeLocal(store);
    return annotation;
  }
  // 서버 id는 서버가 정한다. 화면 쪽 id는 payload.clientId 로 보관
  return apiRequest<ChartAnnotation>(`/journals/${journalId}/annotations`, {
    method: "POST",
    body: JSON.stringify({ type: drawing.type, payload: { ...drawing.payload, clientId: drawing.id } }),
  });
}

export async function deleteAnnotation(annotationId: string, mode: StorageMode): Promise<void> {
  if (mode === "local") {
    const store = readLocal();
    store.annotations = store.annotations.filter((a) => a.id !== annotationId);
    writeLocal(store);
    return;
  }
  await apiRequest(`/annotations/${annotationId}`, { method: "DELETE" });
}
