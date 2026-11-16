import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 같은 와이파이의 다른 PC가 http://<내 IP>:3001 로 개발 서버에 들어올 수 있게
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // 다른 PC 에서 http://<내 IP>:3001 로 열면 API 도 3001 로 부르고(lib/api-url.ts), 여기서 백엔드로 넘긴다
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
    return [{ source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` }];
  },
};

export default nextConfig;
