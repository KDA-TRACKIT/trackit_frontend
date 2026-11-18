// 배포용(production) 빌드로 띄우기 — 같은 와이파이의 다른 PC 가 빠르게 쓰도록 (개발 모드는 페이지마다 JS 20MB 넘게 받음)
//   먼저 `npx next build --webpack` 으로 빌드한 뒤: node scripts/serve-prod.mjs
//   next.config 의 output: "standalone" 라서 .next/standalone/server.js 로 띄우고, 정적 파일(.next/static · public)은 옆에 복사
//   PORT(기본 3001) · HOSTNAME(기본 0.0.0.0 = 같은 와이파이에서 접속 가능)
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 한글 폴더 이름이 깨지지 않게 fileURLToPath
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("빌드가 없어요. 먼저 `npx next build --webpack` 을 실행하세요.");
  process.exit(1);
}
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT ?? "3001", HOSTNAME: process.env.HOSTNAME_BIND ?? "0.0.0.0", NODE_ENV: "production" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
