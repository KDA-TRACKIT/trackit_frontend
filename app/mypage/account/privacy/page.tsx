"use client";
// 개인정보 공개 설정 (시안 2026-11-18): 내 프로필 항목 · 내 투자 정보 항목을 하나씩 공개/비공개. 닉네임은 항상 공개
import { useState } from "react";
import { useRouter } from "next/navigation";
import { metaText, useMypage } from "../../context";
import { ProfileAvatar } from "../../profile/ProfileAvatar";
import { readInvestment } from "../../investment/InvestmentFields";
import { Card, Modal, Notice, PageHead, PublicToggle } from "../../ui";
import { INVEST_ITEMS, PROFILE_ITEMS, readPrivacy, type PrivacyItem } from "./privacy";

export default function PrivacyPage() {
  const { meta, saveMeta, user, profile } = useMypage();
  const [preview, setPreview] = useState(false);
  const router = useRouter();
  const saved = readPrivacy(meta);
  const [items, setItems] = useState(saved.items);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: PrivacyItem, v: boolean) => setItems((cur) => ({ ...cur, [k]: v }));

  const group = (list: readonly { key: PrivacyItem }[]) => {
    const on = list.filter((it) => items[it.key]).length;
    return { all: on === list.length, mixed: on > 0 && on < list.length };
  };
  const setGroup = (list: readonly { key: PrivacyItem }[], v: boolean) => setItems((cur) => ({ ...cur, ...Object.fromEntries(list.map((it) => [it.key, v])) }));

  async function save() {
    setBusy(true);
    try {
      await saveMeta({ privacy: { ...saved, profilePublic: Object.values(items).some(Boolean), items } });
      setNote({ ok: true, msg: "저장했어요" });
    } catch (err) {
      setNote({ ok: false, msg: err instanceof Error ? err.message : "저장하지 못했어요." });
    }
    setBusy(false);
  }

  const section = (title: string, list: readonly { key: PrivacyItem; title: string }[], head?: React.ReactNode) => {
    const g = group(list);
    return (
      <Card className="mp-scope">
        <div className="mp-scope-row head">
          <div>
            <h2>{title}</h2>
          </div>
          <PublicToggle label={`${title} 전체`} value={g.all} mixed={g.mixed} onChange={(v) => setGroup(list, v)} />
        </div>
        {head}
        {list.map((it) => (
          <div key={it.key} className="mp-scope-row">
            <div>
              <strong>{it.title}</strong>
            </div>
            <PublicToggle label={it.title} value={items[it.key]} onChange={(v) => set(it.key, v)} />
          </div>
        ))}
      </Card>
    );
  };

  return (
    <>
      <PageHead title="개인정보 공개 설정" parent={["계정 설정", "/mypage/account"]} />
      {section(
        "내 프로필 항목",
        PROFILE_ITEMS,
        <div className="mp-scope-row">
          <div>
            <strong>
              닉네임 <span className="mp-chip-tag">항상 공개</span>
            </strong>
          </div>
        </div>,
      )}
      {section("내 투자 정보 항목", INVEST_ITEMS)}
      <Notice text={note} />
      <div className="mp-actions spread">
        <button type="button" className="mp-link" onClick={() => setPreview(true)}>
          다른 사용자에게 보이는 내 프로필 미리보기 →
        </button>
        <div>
          <button type="button" className="mp-btn" onClick={() => router.push("/mypage/account")} disabled={busy}>
            취소
          </button>
          <button type="button" className="mp-btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? "저장 중…" : "변경사항 저장"}
          </button>
        </div>
      </div>
      {preview && <Preview items={items} onClose={() => setPreview(false)} name={profile.name} meta={meta} handle={metaText(meta, "handle") || user.email?.split("@")[0] || ""} />}
    </>
  );
}

/** 지금 고른 공개 범위대로 다른 사람에게 보이는 모습 (저장 전에도) */
function Preview({ items, onClose, name, meta, handle }: { items: Record<PrivacyItem, boolean>; onClose: () => void; name: string; meta: Record<string, unknown>; handle: string }) {
  const inv = readInvestment(meta);
  const bio = metaText(meta, "bio");
  const rows: [PrivacyItem, string, string][] = [
    ["market", "주요 투자 시장", inv.market],
    ["horizon", "주요 투자 기간", inv.period],
    ["styles", "나의 매매 방식", inv.styles.join(", ")],
    ["indicators", "자주 쓰는 참고 지표", [...inv.indicators, inv.otherIndicators].filter(Boolean).join(", ")],
    ["principles", "나의 매매 원칙", inv.principle],
  ];
  const shown = rows.filter(([k, , v]) => items[k] && v);
  return (
    <Modal label="내 프로필 미리보기" onClose={onClose}>
      <div className="mp-modal-head">
        <div>
          <h2>내 프로필 미리보기</h2>
          <p>저장하지 않은 선택도 반영돼요.</p>
        </div>
        <button type="button" className="mp-x" aria-label="닫기" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="mp-preview">
        <div className="mp-profile">
          <ProfileAvatar size={56} preview={items.image ? undefined : ""} />
          <div>
            <h2>{name}</h2>
            {items.handle && <span className="id">@{handle}</span>}
          </div>
        </div>
        {items.bio && bio && <p className="mp-preview-bio">{bio}</p>}
        {shown.length ? (
          <dl>
            {shown.map(([k, t, v]) => (
              <div key={k}>
                <dt>{t}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mp-muted">공개된 투자 정보가 없어요.</p>
        )}
      </div>
    </Modal>
  );
}
