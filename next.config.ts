import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 전략 내용(data/market-sim)은 공개 폴더가 아니라 서버 라우트(/strategy-data)만 읽음 → 빌드 결과에 같이 넣음
  outputFileTracingIncludes: { "/strategy-data/[id]/[key]": ["./data/market-sim/**"] },
  // 같은 와이파이의 다른 PC가 http://<내 IP>:3001 로 개발 서버에 들어올 수 있게
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // 백엔드로 넘기는 요청 대기 시간 (기본 30초). 1초봉 첫 요청은 백엔드가 30초쯤 걸려 끊기고 500 이 났다
  experimental: { proxyTimeout: 120_000 },
  // 다른 PC 에서 http://<내 IP>:3001 로 열면 API 도 3001 로 부르고(lib/api-url.ts), 여기서 백엔드로 넘긴다
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
    // AI(Gemini) 요청만 Gemini 키가 있는 백엔드로 보낼 때: AI_API_URL (예: 팀원 PC http://192.168.1.11:3000). 비우면 기본 백엔드
    //   키는 그 백엔드에만 있고, 프론트 · 이 PC 에는 없어도 됨. 빌드할 때 정해짐
    const ai = (process.env.AI_API_URL || api).replace(/\/$/, "");
    return [
      { source: "/api/v1/ai/:path*", destination: `${ai}/api/v1/ai/:path*` },
      { source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
