"use client";
// 노트 차트 그림 (2026-11-22): 트레이딩 로그 '확인하고 저장' 창에서 본 차트 그림 그대로 (GET /notes/{id}/shot)
//   본인 · 구독자만 받음. 그림이 없거나(예전 노트 · 데모) 못 받으면 fallback (그 종목 일봉 그림 등)
import { useEffect, useState, type ReactNode } from "react";
import { noteShotUrl } from "../lib/api/notes";

export default function NoteShot({ id, fallback = null, className }: { id?: string | null; fallback?: ReactNode; className?: string }) {
  const [state, setState] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    noteShotUrl(id)
      .then((url) => live && setState({ id, url }))
      .catch(() => live && setState({ id, url: null }));
    return () => {
      live = false;
    };
  }, [id]);
  const cur = id && state?.id === id ? state : null;
  if (!id || (cur && !cur.url)) return <>{fallback}</>;
  if (!cur) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={cur.url!} alt="저장할 때의 차트 (그은 선 포함)" className={className ?? "note-shot"} loading="lazy" />;
}
