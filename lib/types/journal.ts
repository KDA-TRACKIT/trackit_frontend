// 매매일지 (백엔드 Journal 모델 중 화면에서 쓰는 필드)
export type Journal = {
  id: string;
  title: string;
  symbol: string;
  market: string;
  timeframe: string | null;
  content: string | null;
  status?: string;
  createdAt: string;
  updatedAt?: string;
};

/** server = 백엔드에 저장, local = 로그인 전이라 이 브라우저에만 저장 */
export type StorageMode = "server" | "local";
