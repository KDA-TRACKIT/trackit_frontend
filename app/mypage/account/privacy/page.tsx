"use client";
// 개인정보 및 공개 설정 (시안 없음: 계정 설정 카드의 세 항목을 켜고 끄는 화면)
import { useState } from "react";
import { useMypage } from "../../context";
import { Card, Notice, PageHead } from "../../ui";
import { readPrivacy, type Privacy } from "./privacy";

const ITEMS: { key: keyof Privacy; title: string; desc: string }[] = [
  { key: "profilePublic", title: "프로필 공개", desc: "닉네임, 소개, 투자 스타일" },
  { key: "trustConsent", title: "신뢰도 점수 활용", desc: "내 기록으로 점수 계산 · 언제든 끌 수 있어요" },
  { key: "notifications", title: "서비스 알림", desc: "판매, 정산, 공지" },
];

export default function PrivacyPage() {
  const { meta, saveMeta } = useMypage();
  const [value, setValue] = useState(() => readPrivacy(meta));
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(key: keyof Privacy) {
    const next = { ...value, [key]: !value[key] };
    setValue(next);
    setBusy(true);
    try {
      await saveMeta({ privacy: next });
      setNote({ ok: true, msg: "저장했어요" });
    } catch (err) {
      setValue(value);
      setNote({ ok: false, msg: err instanceof Error ? err.message : "저장하지 못했어요." });
    }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="개인정보 및 공개 설정" parent={["계정 설정", "/mypage/account"]} />
      <Card>
        <div className="mp-list">
          {ITEMS.map((it) => (
            <div key={it.key} style={{ gridTemplateColumns: "216px 1fr auto", minHeight: 64 }}>
              <strong>{it.title}</strong>
              <span>{it.desc}</span>
              <button type="button" role="switch" className="mp-switch" aria-checked={value[it.key]} aria-label={it.title} disabled={busy} onClick={() => void toggle(it.key)} />
            </div>
          ))}
        </div>
        <Notice text={note} />
      </Card>
    </>
  );
}
