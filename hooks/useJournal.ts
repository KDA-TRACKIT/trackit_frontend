"use client";
// 종목별 매매일지 (서버, 또는 로그인 전이면 이 브라우저). 저장할 때 일지가 없으면 만든다
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../lib/api/client";
import { createJournal, findJournal, storageMode, updateJournal } from "../lib/api/journals";
import type { Journal, StorageMode } from "../lib/types/journal";

type SymbolRef = { code: string; name: string; market: string };

export function useJournal(symbol: SymbolRef, timeframe: string) {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [mode, setMode] = useState<StorageMode>("local");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  /** 화면을 열 때 찾은 일지 id. 저장하면서 새로 만든 일지는 여기 넣지 않는다 (차트 다시 불러오기 기준) */
  const [foundId, setFoundId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await storageMode();
        const found = await findJournal(symbol.code, m);
        if (cancelled) return;
        setMode(m);
        setJournal(found);
        setFoundId(found?.id ?? null);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setJournal(null);
          setFoundId(null);
          setError(errorMessage(e));
        }
      } finally {
        if (!cancelled) setLoadedFor(symbol.code);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol.code]);

  const ready = loadedFor === symbol.code;
  const current = ready ? journal : null;

  /** 일지가 없으면 만들고 돌려준다 (주석 저장 전에 필요) */
  const ensure = useCallback(async (): Promise<Journal> => {
    if (current) return current;
    const created = await createJournal({ title: `${symbol.name} 매매일지`, symbol: symbol.code, market: symbol.market || "KRX", timeframe }, mode);
    setJournal(created);
    return created;
  }, [current, mode, symbol, timeframe]);

  const saveContent = useCallback(
    async (content: string) => {
      setSaving(true);
      setError(null);
      try {
        const target = await ensure();
        setJournal(await updateJournal(target.id, { content, timeframe }, mode));
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [ensure, mode, timeframe],
  );

  return { journal: current, initialJournalId: ready ? foundId : null, mode, loading: !ready, saving, error, saveContent, ensure };
}
