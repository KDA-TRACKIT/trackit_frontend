"use client";
// 차트 주석(드로잉·노트) 불러오기·저장. 저장 때 새로 그린 것만 POST, 지운 것은 DELETE
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../lib/api/client";
import { createAnnotation, deleteAnnotation, listAnnotations } from "../lib/api/journals";
import type { ChartAnnotation, ChartDrawing } from "../lib/types/chart";
import type { StorageMode } from "../lib/types/journal";

/** 화면 쪽 id (서버에 저장할 때 payload.clientId 로 넣어 둔 값) */
export const clientIdOf = (a: ChartAnnotation) => (typeof a.payload.clientId === "string" ? a.payload.clientId : a.id);

export function useChartAnnotations(journalId: string | null, mode: StorageMode) {
  const [saved, setSaved] = useState<ChartAnnotation[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!journalId) return;
    let cancelled = false;
    listAnnotations(journalId, mode)
      .then((list) => {
        if (cancelled) return;
        setSaved(list);
        setLoadedFor(journalId);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [journalId, mode]);

  /** 지금 화면의 드로잉 목록에 맞춰 저장본을 고친다 */
  const sync = useCallback(
    async (targetJournalId: string, drawings: ChartDrawing[]) => {
      setSaving(true);
      setError(null);
      try {
        const current = loadedFor === targetJournalId ? saved : await listAnnotations(targetJournalId, mode);
        const savedIds = new Set(current.map(clientIdOf));
        const wanted = new Set(drawings.map((d) => d.id));
        const added = await Promise.all(drawings.filter((d) => !savedIds.has(d.id)).map((d) => createAnnotation(targetJournalId, d, mode)));
        const removed = current.filter((a) => !wanted.has(clientIdOf(a)));
        await Promise.all(removed.map((a) => deleteAnnotation(a.id, mode)));
        setSaved([...current.filter((a) => wanted.has(clientIdOf(a))), ...added]);
        setLoadedFor(targetJournalId);
        return { added: added.length, removed: removed.length };
      } catch (e) {
        setError(errorMessage(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [loadedFor, mode, saved],
  );

  const ready = journalId !== null && loadedFor === journalId;
  return { annotations: ready ? saved : [], loaded: journalId === null || ready, saving, error, sync };
}
