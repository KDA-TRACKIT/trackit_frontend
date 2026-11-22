"use client";
// 내 투자 정보: 매매 방식 · 참고 지표 · 매매 원칙
import { useState } from "react";
import { useMypage } from "../context";
import { Card, Notice, PageHead } from "../ui";
import { InvestmentFields, readInvestment } from "./InvestmentFields";

export default function InvestmentPage() {
  const { meta, saveMeta } = useMypage();
  const [value, setValue] = useState(() => readInvestment(meta));
  const dirty = JSON.stringify(value) !== JSON.stringify(readInvestment(meta));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      await saveMeta({ investment: value });
      setNote({ ok: true, msg: "저장했어요" });
    } catch (err) {
      setNote({ ok: false, msg: err instanceof Error ? err.message : "저장하지 못했어요." });
    }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="내 투자 정보" desc="나의 매매 방식과 자주 사용하는 지표를 관리하세요." />
      <Card className="mp-investment-editor" title="투자 스타일 설정">
        <InvestmentFields value={value} onChange={setValue} />
        <div style={{ marginTop: 16 }}>
          <Notice text={note} />
        </div>
      </Card>
      <div className="mp-actions">
        <button type="button" className="mp-btn" onClick={() => (setValue(readInvestment(meta)), setNote(null))} disabled={busy || !dirty}>
          취소
        </button>
        <button type="button" className="mp-btn primary" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? "저장 중…" : "변경사항 저장"}
        </button>
      </div>
    </>
  );
}
