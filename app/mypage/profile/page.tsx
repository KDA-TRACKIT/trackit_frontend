"use client";
// 내 프로필: 사진 · 닉네임 · 소개. 닉네임·소개는 Supabase user_metadata 에 저장
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { metaText, useMypage } from "../context";
import { Card, Notice, PageHead } from "../ui";
import { ProfileAvatar, setLocalAvatar, shrinkImage, useLocalAvatar } from "./ProfileAvatar";

export default function ProfilePage() {
  const { user, profile, meta, saveMeta } = useMypage();
  const router = useRouter();
  const local = useLocalAvatar(user.id);
  const [nickname, setNickname] = useState(profile.name);
  const [bio, setBio] = useState(metaText(meta, "bio"));
  // undefined = 바꾸지 않음, null = 기본 이미지로, 문자열 = 새 사진
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handle = metaText(meta, "handle") || user.email?.split("@")[0] || "";
  const dirty = nickname.trim() !== profile.name || bio.trim() !== metaText(meta, "bio") || photo !== undefined;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setNote({ ok: false, msg: "JPG, PNG 이미지만 올릴 수 있어요." });
    try {
      setPhoto(await shrinkImage(file));
    } catch (err) {
      setNote({ ok: false, msg: err instanceof Error ? err.message : "이미지를 읽지 못했어요." });
    }
  }

  async function save() {
    if (!nickname.trim()) return setNote({ ok: false, msg: "닉네임을 입력해 주세요." });
    setBusy(true);
    setNote(null);
    try {
      await saveMeta({ nickname: nickname.trim(), bio: bio.trim() });
      if (photo !== undefined) setLocalAvatar(user.id, photo);
      setPhoto(undefined);
      setNote({ ok: true, msg: "저장했어요" });
    } catch (err) {
      setNote({ ok: false, msg: err instanceof Error ? err.message : "저장하지 못했어요." });
    }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="내 프로필" desc="프로필 이미지, 닉네임, 소개를 한곳에서 관리하세요." />
      <Card title="프로필 정보" desc="닉네임과 프로필 소개는 다른 사용자에게 공개될 수 있습니다.">
        <div className="mp-form">
          <div className="mp-field">
            <span>프로필 이미지</span>
            <div className="mp-photo">
              <ProfileAvatar size={80} preview={photo === undefined ? local : photo} />
              <div className="btns">
                <div>
                  <button type="button" className="mp-btn" onClick={() => fileRef.current?.click()}>
                    사진 변경
                  </button>
                  <button type="button" className="mp-btn" onClick={() => setPhoto(null)}>
                    기본 이미지
                  </button>
                </div>
                <small className="mp-hint">JPG, PNG 이미지 · 권장 1:1 비율</small>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => void pick(e)} />
            </div>
          </div>
          <div className="mp-sep" />
          <div className="mp-row-2">
            <label className="mp-field">
              <span>닉네임</span>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} placeholder="트레이더 닉네임" />
            </label>
            <label className="mp-field">
              <span>표시 아이디</span>
              <input value={`@${handle}`} readOnly />
              <small>아이디 변경은 계정 설정에서 관리합니다.</small>
            </label>
          </div>
          <label className="mp-field">
            <span>프로필 소개</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 200))} placeholder="나만의 매매 전략과 투자 기록을 공유합니다." />
            <small className="mp-count-left">{bio.length}/200자 · 다른 사용자에게 공개되는 소개 문구입니다.</small>
          </label>
          <Notice text={note} />
        </div>
      </Card>
      <div className="mp-actions">
        <button type="button" className="mp-btn" onClick={() => router.push("/mypage")} disabled={busy}>
          취소
        </button>
        <button type="button" className="mp-btn primary" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? "저장 중…" : "변경사항 저장"}
        </button>
      </div>
    </>
  );
}
