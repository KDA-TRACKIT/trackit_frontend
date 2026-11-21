"use client";
// 홈 꿀벌 안내 (2026-11-20): 처음 가입하고 들어온 사람에게 꿀벌이 기능을 하나씩 짚어 줌
//   저절로 뜨는 건 가입하고 처음 로그인했을 때 한 번뿐 (2026-11-21). 그 밖엔 오른쪽 아래 꿀벌을 눌러야 뜸
//     처음인지 = 계정에 '봤음' 표시(bee_guide_seen)가 없고 가입한 지 7일 안 (이메일 인증이 늦어도 첫 로그인을 놓치지 않게).
//     뜨는 순간 계정에 '봤음'을 남겨서 다른 기기 · 브라우저에서 다시 로그인해도 저절로 뜨지 않음. 예전에 가입한 계정은 저절로 뜨지 않음
//   메뉴 · 홈 카드에 불을 비추고(나머지는 어둡게) 꿀벌 말풍선으로 설명, 다음 · 이전 · 건너뛰기
//   오른쪽 아래 꿀벌 버튼으로 언제든 다시 보기
//   다른 팝업(투자 정보 입력 등)이 떠 있으면 닫힐 때까지 기다렸다가 시작
//   페이지 배율(html zoom)이 달라도 위치가 맞게: 안내 층 자신의 화면 크기 대비로 잼
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabase-browser";
import "./home-bee-guide.css";

type Step = { target?: string; title: string; body: string };
// 화면 순서대로: 위 메뉴를 왼쪽 → 오른쪽으로, 그다음 홈을 위 → 아래로
const STEPS: Step[] = [
  { title: "안녕! 나는 트래킷 꿀벌이야 🐝", body: "트래킷은 매매 전에 계획을 남기고, 실제 매매가 그 계획대로였는지 검증하는 곳이야. 위 메뉴부터 오른쪽으로, 그다음 아래로 1분만 같이 둘러보자!" },
  { target: '.gnb-main a[href="/workshop"]', title: "투자작업실", body: "차트에 지지 · 저항선을 긋고 매수 · 손절 · 목표를 먼저 적어 둬. 'AI 분석 후 저장'을 누르면 매매 전에 남긴 '사전 기록'이 돼서, 결과를 보고 끼워 맞출 수 없어. 증시 캘린더(뉴스 · 공시 · 경제 일정)도 여기 있어." },
  { target: '.gnb-main a[href="/marketplace"]', title: "전략마켓", body: "실제 체결로 검증된 트레이더를 구독하고 전략을 봐. 수익률만이 아니라 이행률 · 손실 사례까지 같이 보여." },
  { target: '.gnb-main a[href="/archive/notes"]', title: "전략보관함", body: "내 노트를 날짜 · 종목별로 모아 보고, '복기형'에서 계획 vs 실제(늦은 손절 · 이른 익절)를 확인해. '전략 분석'에선 AI 에게 내 전략과 매매를 근거로 물어볼 수 있어." },
  { target: ".gnb-bell-box", title: "알림", body: "즐겨찾기한 트레이더가 새 전략을 올리거나, 산 전략과 비슷한 자리가 내 관심 종목에 나오면 여기로 알려 줘." },
  { target: ".gnb-avatar", title: "마이페이지 · 증권사 연결", body: "마이페이지 → 지갑에서 증권사를 연결하면 체결이 자동으로 들어와서 노트와 이어져. 투자 성향 · 판매 관리도 여기서 해." },
  { target: ".home-overview", title: "내 이행률 · 수익", body: "체결이 들어오면 내가 계획대로 사고팔았는지(이행률)와 이번 달 수익을 여기서 바로 보여 줘." },
  { target: "#trader-board", title: "트레이더 리더보드", body: "지금 잘하고 있는 트레이더야. 마음에 드는 사람은 즐겨찾기 하면 새 전략이 올라올 때 알려 줄게." },
  { target: ".home-weekly", title: "이번 주 기록", body: "요일마다 내 체결과 노트를 모아 보여 줘. 날짜를 누르면 그날 남긴 노트와 매매를 바로 볼 수 있어." },
  { title: "준비 끝! 첫 계획부터 남겨 볼까?", body: "관심 있는 종목 차트에 선 하나 긋고 '어디서 사고, 어디서 틀렸다고 볼지' 적어 두면 시작이야. 오른쪽 아래 꿀벌 버튼을 누르면 이 안내를 언제든 다시 볼 수 있어." },
];
const doneKey = (userId: string) => `trackit:bee-guide:${userId}`;
/** 가입한 뒤 이 기간 안의 로그인을 '처음'으로 봄 */
const FIRST_LOGIN_DAYS = 7;

export default function HomeBeeGuide({ userId, createdAt, seen }: { userId: string; /** 가입한 시각 */ createdAt: string | null; /** 계정에 '꿀벌 안내 봤음'이 남아 있는지 */ seen: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** 안내 층의 크기(CSS px). 페이지 배율이 있어도 이 층 기준으로 재면 위치가 맞음 */
  const [view, setView] = useState({ w: 1200, h: 800 });
  const layer = useRef<HTMLDivElement>(null);

  // 가입하고 처음 로그인했을 때만 저절로 시작 (다른 팝업이 떠 있으면 닫힐 때까지 기다림)
  useEffect(() => {
    const joined = createdAt ? Date.parse(createdAt) : NaN;
    const fresh = Number.isFinite(joined) && Date.now() - joined < FIRST_LOGIN_DAYS * 86_400_000;
    let done = seen || !fresh;
    try {
      done ||= localStorage.getItem(doneKey(userId)) === "done";
    } catch {
      done = true;
    }
    if (done) return;
    const timer = setInterval(() => {
      if (document.querySelector("dialog[open]")) return;
      clearInterval(timer);
      // 뜨는 순간 '봤음'을 남김 (중간에 창을 닫아도 다음 로그인에 또 뜨지 않게): 이 브라우저 + 계정
      try {
        localStorage.setItem(doneKey(userId), "done");
      } catch {
        // 저장이 안 돼도 계정 표시로 막음
      }
      void getSupabaseBrowser()?.auth.updateUser({ data: { bee_guide_seen: true } }).catch(() => {});
      setStep(0);
    }, 600);
    return () => clearInterval(timer);
  }, [userId, createdAt, seen]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(doneKey(userId), "done");
    } catch {
      // 저장이 안 되면 다음에 또 뜰 뿐
    }
    setStep(null);
  }, [userId]);

  // 비출 곳 재기 (화면 안으로 스크롤한 뒤)
  const cur = step === null ? null : STEPS[step];
  useLayoutEffect(() => {
    if (!cur) return;
    const el = cur.target ? document.querySelector<HTMLElement>(cur.target) : null;
    // 화면 좌표(배율 적용) → 안내 층 좌표(CSS px): 층 자신의 화면 크기와 CSS 크기 비율로 나눔
    const measure = () => {
      const root = layer.current;
      if (!root) return;
      const lr = root.getBoundingClientRect();
      const sx = lr.width / (root.offsetWidth || 1) || 1;
      const sy = lr.height / (root.offsetHeight || 1) || 1;
      setView({ w: root.offsetWidth, h: root.offsetHeight });
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ x: (r.left - lr.left) / sx, y: (r.top - lr.top) / sy, w: r.width / sx, h: r.height / sy });
    };
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    const t = setTimeout(measure, 450);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [cur]);

  // 키보드: ← → · Esc
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setStep((s) => (s === null ? s : Math.min(STEPS.length - 1, s + 1)));
      else if (e.key === "ArrowLeft") setStep((s) => (s === null ? s : Math.max(0, s - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, finish]);

  if (step === null || !cur)
    return (
      <button type="button" className="bee-replay" onClick={() => setStep(0)} aria-label="꿀벌 안내 다시 보기" title="꿀벌 안내 다시 보기">
        <Image src="/images/home-bee.png" alt="" width={44} height={44} />
      </button>
    );

  const last = step === STEPS.length - 1;
  const vw = view.w;
  const vh = view.h;
  const PAD = 8;
  // 말풍선: 비춘 곳 아래(공간이 없으면 위), 가운데 단계는 화면 가운데
  const W = Math.min(380, vw - 32);
  let bubble: React.CSSProperties;
  if (rect) {
    const below = rect.y + rect.h + PAD + 230 < vh;
    const left = Math.max(16, Math.min(vw - W - 16, rect.x + rect.w / 2 - W / 2));
    bubble = below ? { left, top: rect.y + rect.h + PAD + 14, width: W } : { left, bottom: vh - rect.y + PAD + 14, width: W };
  } else bubble = { left: vw / 2 - W / 2, top: vh / 2 - 140, width: W };

  return (
    <div ref={layer} className="bee-guide" role="dialog" aria-modal="true" aria-labelledby="bee-guide-title">
      {rect ? (
        <div className="bee-spot" style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }} />
      ) : (
        <div className="bee-dim" />
      )}
      <div className={`bee-bubble${rect ? "" : " center"}`} style={bubble}>
        <Image className="bee-face" src="/images/home-bee.png" alt="" width={84} height={84} />
        <small className="bee-count">
          {step + 1} / {STEPS.length}
        </small>
        <h3 id="bee-guide-title">{cur.title}</h3>
        <p>{cur.body}</p>
        {last ? (
          <div className="bee-actions">
            <Link className="bee-primary" href="/workshop" onClick={finish}>
              첫 계획 남기러 가기
            </Link>
            <Link className="bee-ghost" href="/mypage/wallet" onClick={finish}>
              증권사 연결하기
            </Link>
            <button type="button" className="bee-text" onClick={finish}>
              둘러볼게요
            </button>
          </div>
        ) : (
          <div className="bee-actions">
            <button type="button" className="bee-text" onClick={finish}>
              건너뛰기
            </button>
            <span className="bee-dots" aria-hidden>
              {STEPS.map((_, i) => (
                <i key={i} className={i === step ? "on" : ""} />
              ))}
            </span>
            {step > 0 && (
              <button type="button" className="bee-ghost" onClick={() => setStep(step - 1)}>
                이전
              </button>
            )}
            <button type="button" className="bee-primary" onClick={() => setStep(step + 1)} autoFocus>
              {step === 0 ? "같이 둘러보기" : "다음"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
