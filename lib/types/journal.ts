// 매매일지 (백엔드 Journal 모델 중 화면에서 쓰는 필드)
export type Journal = {
  id: string;
  title: string;
  symbol: string;
  market: string;
  /** 이 종목이 든 내 전략의 섹터 (목록 응답에만, 없으면 null) */
  sector?: string | null;
  /** 종목 목록에서 찾은 상장 시장 (KOSPI · KOSDAQ …, 목록 응답에만) */
  listedMarket?: string | null;
  timeframe: string | null;
  content: string | null;
  status?: string;
  createdAt: string;
  updatedAt?: string;
};

/** server = 백엔드에 저장, local = 로그인 전이라 이 브라우저에만 저장 */
export type StorageMode = "server" | "local";
