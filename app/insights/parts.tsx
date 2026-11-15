"use client";
// 투자 정보 칸 공통 조각: 카드 머리 · 불러오는 중 · 오류 · 빠진 키 안내 · 숫자 형식
export const pct = (n: number | null, d = 2) => (n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}%`);
export const tone = (n: number | null) => (n === null || n === 0 ? "" : n > 0 ? "up" : "down");
export const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

/** 백만원 → "1,234억" */
export const eok = (millions: number) => `${millions < 0 ? "−" : ""}${Math.round(Math.abs(millions) / 100).toLocaleString("ko-KR")}억`;

export function CardHead({ title, meta, children }: { title: string; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="ins-head">
      <div className="ins-title">
        <h2>{title}</h2>
        {meta && <span className="ins-meta">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

export function Loading({ height = 160 }: { height?: number }) {
  return (
    <div className="ins-state" style={{ height }}>
      <span className="ins-spinner" aria-hidden />
    </div>
  );
}

export function Failed({ message, onRetry, height = 160 }: { message: string; onRetry: () => void; height?: number }) {
  return (
    <div className="ins-state" style={{ height }}>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

const KEY_INFO: Record<string, { what: string; url: string }> = {
  FRED_API_KEY: { what: "미국 지수·금리·물가·발표 일정", url: "https://fredaccount.stlouisfed.org/apikeys" },
  ECOS_API_KEY: { what: "환율·한국 물가", url: "https://ecos.bok.or.kr/api/#/AuthKeyApply" },
  DART_API_KEY: { what: "공시", url: "https://opendart.fss.or.kr" },
};

/** 서버에 키가 없을 때: 무엇이 빠졌고 어디에 넣는지 한 줄 */
export function MissingKeys({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <p className="ins-missing">
      {keys.map((k) => (
        <span key={k}>
          {KEY_INFO[k]?.what ?? k}: 백엔드 <code>.env.local</code> 에 <code>{k}</code> 추가 ·{" "}
          <a href={KEY_INFO[k]?.url} target="_blank" rel="noreferrer">
            무료 발급
          </a>
        </span>
      ))}
    </p>
  );
}
