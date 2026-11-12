"use client";

import { useState } from "react";
import type { Journal, StorageMode } from "../../lib/types/journal";

type Props = {
  journal: Journal | null;
  mode: StorageMode;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onSave: (content: string) => Promise<boolean>;
  /** 입력 중인 내용을 AI 분석 요청에 같이 보내기 위해 위로 알림 */
  onDraftChange: (content: string) => void;
};

/** 매매일지 입력 (journal.content). 저장 전 내용도 AI 분석에 함께 보낸다 */
export default function JournalEditor({ journal, mode, loading, saving, error, onSave, onDraftChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const value = draft ?? journal?.content ?? "";
  const dirty = draft !== null && draft !== (journal?.content ?? "");

  return (
    <section className="ai-journal">
      <div className="ai-journal-head">
        <b>매매일지</b>
        <span className={`ai-storage ${mode}`}>{mode === "server" ? "서버 저장" : "이 브라우저에 저장 · 로그인하면 서버에 저장돼요"}</span>
      </div>
      <textarea
        value={value}
        disabled={loading}
        placeholder={loading ? "불러오는 중…" : "진입 근거, 손절·목표가, 지켜볼 조건을 적어두세요."}
        onChange={(e) => {
          setDraft(e.target.value);
          onDraftChange(e.target.value);
        }}
        rows={4}
      />
      <div className="ai-journal-foot">
        <small>{error ? <span className="error">{error}</span> : savedAt ? `${savedAt} 저장됨` : journal ? "저장된 일지" : "아직 저장 안 됨"}</small>
        <button
          className="ai-btn ghost"
          disabled={!dirty || saving}
          onClick={async () => {
            if (await onSave(value)) {
              setDraft(null);
              setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" }));
            }
          }}
        >
          {saving ? "저장 중…" : "일지 저장"}
        </button>
      </div>
    </section>
  );
}
