/**
 * UUID v4. crypto.randomUUID 는 보안 주소(https · localhost)에서만 있어서,
 * 같은 와이파이의 IP(http://192.168.x.x:3001)로 열면 없음 → getRandomValues 로 직접 만든다 (이건 어디서나 됨)
 */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // 버전 4
  b[8] = (b[8] & 0x3f) | 0x80; // 변형 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
