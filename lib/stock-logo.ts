// 종목 로고 정리: 받아 온 로고(백엔드 /insights/logo, 같은 주소라 캔버스로 읽힘)를 정사각형 가운데에 다시 그린다
//   출처(네이버 · 토스 · FMP)마다 여백 · 바탕 · 크기가 제각각이라 그대로 넣으면 한쪽으로 쏠리거나 둥근 모서리에 잘린다
//   (11/20 확인: 오늘의 종목에 뜰 수 있는 572종목 중 256개가 모서리 · 테두리에 닿아 잘리고, 38개가 한쪽으로 치우침)
//   1) 보이는 그림 부분만 찾아 자르고  2) 바탕색은 빼서(이음매 없이)  3) 정사각형 가운데에 같은 여백으로
//   모양별로:
//     clear  투명 바탕 로고 → 흰 칸, 여백 14%
//     icon   한 색으로 채운 동그라미 · 둥근 네모 아이콘(네이버 로고 등) → 흰 칸을 거의 채움, 여백 6%
//     white  흰 · 연회색 바탕(토스 연회색 칸 포함) → 바탕을 빼고 흰 칸, 여백 14%
//     tile   색 바탕을 꽉 채운 로고(미래에셋 주황 등) → 그 색 칸, 여백 14%
//     light  투명 바탕에 흰색으로만 그린 로고(비자 · 디즈니 · 나이키 …) → 어두운 칸, 여백 14%

export type LogoMode = "clear" | "icon" | "white" | "tile" | "light";
export type NormalizedLogo = { url: string; mode: LogoMode; fill: string };

const PAD = 0.14;
const ICON_PAD = 0.06;
/** 흰 로고를 올리는 어두운 칸 (insights.css .ins-mv-avatar.logo.light 와 같은 색) */
export const LIGHT_LOGO_BG = "#1d2330";

/**
 * 로고 그림을 out×out 정사각형 PNG(data URL)로. 보이는 점이 없으면 null.
 * 캔버스를 못 읽으면(다른 주소 그림 등) 예외 → 부르는 쪽에서 원본을 그대로 쓴다.
 */
export function normalizeLogo(img: HTMLImageElement, out = 96): NormalizedLogo | null {
  const nw = img.naturalWidth || 64;
  const nh = img.naturalHeight || 64;
  // 판단은 긴 변 160px 로 줄여서 (SVG 도 이 크기로 그려짐), 그릴 때는 원본 좌표로 다시 잘라 해상도 유지
  const W = 160;
  const s = W / Math.max(nw, nh);
  const w = Math.max(2, Math.round(nw * s));
  const h = Math.max(2, Math.round(nh * s));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return null;
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const nearWhite = (k: number) => d[k] > 225 && d[k + 1] > 225 && d[k + 2] > 225;
  const bbox = (ink: (k: number) => boolean): [number, number, number, number] | null => {
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++)
        if (ink((j * w + i) * 4)) {
          if (i < x0) x0 = i;
          if (i > x1) x1 = i;
          if (j < y0) y0 = j;
          if (j > y1) y1 = j;
        }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  };

  // 1) 보이는 점(불투명도 24 이상) 중 흰 점 · 어두운 점 비율
  let seen = 0;
  let white = 0;
  let dark = 0;
  for (let k = 0; k < d.length; k += 4) {
    if (d[k + 3] < 24) continue;
    seen++;
    if (nearWhite(k)) white++;
    else if (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2] < 170) dark++;
  }
  if (!seen) return null;
  // 흰 로고: 거의 다 흰 점이거나, 흰 점이 절반 넘고 흰 점 범위 안에 투명한 틈이 많음(흰 글자 · 흰 선)
  //   흰 판 위의 검은 글자(금호타이어)는 판에 틈이 없어 흰 로고가 아님
  const wb = bbox((k) => d[k + 3] >= 24 && nearWhite(k));
  let holes = 0;
  if (wb) {
    let area = 0;
    for (let j = wb[1]; j <= wb[3]; j++)
      for (let i = wb[0]; i <= wb[2]; i++) {
        area++;
        if (d[(j * w + i) * 4 + 3] < 24) holes++;
      }
    holes /= area;
  }
  const light = seen < w * h * 0.97 && ((white / seen > 0.85 && dark / seen < 0.03) || (white / seen > 0.5 && holes > 0.3));

  // 2) 바탕: 바깥 테두리 2px — 투명이 20% 넘으면 투명 바탕, 한 색이 60% 넘으면 그 색, 섞이면(MSFT 네 칸) 흰 바탕
  let mode: LogoMode = light ? "light" : "clear";
  let bg: [number, number, number] | null = null;
  if (!light) {
    let ring = 0;
    let clear = 0;
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (i > 1 && j > 1 && i < w - 2 && j < h - 2) continue;
        const k = (j * w + i) * 4;
        ring++;
        if (d[k + 3] < 128) {
          clear++;
          continue;
        }
        const key = `${d[k] >> 3},${d[k + 1] >> 3},${d[k + 2] >> 3}`;
        const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        b.n++;
        b.r += d[k];
        b.g += d[k + 1];
        b.b += d[k + 2];
        buckets.set(key, b);
      }
    if (clear / ring < 0.2) {
      const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
      if (top && top.n / ring >= 0.6) {
        bg = [Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)];
        // 흰색 · 연회색(토스 #f2f4f6 등)은 흰 칸으로, 그 밖의 색은 그 색 칸으로
        mode = Math.min(...bg) >= 225 && Math.max(...bg) - Math.min(...bg) <= 14 ? "white" : "tile";
      } else {
        mode = "white";
        bg = [255, 255, 255];
      }
    }
  }
  const off = (k: number, c: [number, number, number]) => Math.abs(d[k] - c[0]) + Math.abs(d[k + 1] - c[1]) + Math.abs(d[k + 2] - c[2]);
  let bb = bg ? bbox((k) => d[k + 3] >= 24 && off(k, bg!) > 48) : null;
  if (!bb) {
    // 바탕색과 다른 점이 없음(예: 검은 칸에 글자를 투명하게 뚫은 카카오뱅크 · 애보트) → 투명 바탕처럼
    mode = light ? "light" : "clear";
    bg = null;
    bb = bbox((k) => d[k + 3] >= 24 && (light || !nearWhite(k))) ?? bbox((k) => d[k + 3] >= 24);
  }
  if (!bb) return null;
  let [x0, y0, x1, y1] = bb;

  // 3) 한 색으로 채운 동그라미 · 둥근 네모 아이콘이면 칸을 거의 채움 (작게 줄이면 안 글자가 깨알만 해짐)
  let pad = PAD;
  if (mode === "clear") {
    const vb = bbox((k) => d[k + 3] >= 24);
    if (vb) {
      const bw = vb[2] - vb[0] + 1;
      const bh = vb[3] - vb[1] + 1;
      let inBox = 0;
      const cols = new Map<string, number>();
      for (let j = vb[1]; j <= vb[3]; j++)
        for (let i = vb[0]; i <= vb[2]; i++) {
          const k = (j * w + i) * 4;
          if (d[k + 3] < 24) continue;
          inBox++;
          const key = `${d[k] >> 4},${d[k + 1] >> 4},${d[k + 2] >> 4}`;
          cols.set(key, (cols.get(key) ?? 0) + 1);
        }
      const aspect = bw / bh;
      if (inBox / (bw * bh) >= 0.7 && aspect > 0.85 && aspect < 1.18 && Math.max(...cols.values()) / inBox >= 0.4) {
        mode = "icon";
        pad = ICON_PAD;
        [x0, y0, x1, y1] = vb;
      }
    }
  }

  // 4) 원본 좌표로 잘라 가운데에
  const sx = x0 / s;
  const sy = y0 / s;
  const sw = (x1 - x0 + 1) / s;
  const sh = (y1 - y0 + 1) / s;
  const box = out * (1 - 2 * pad);
  const k = Math.min(box / sw, box / sh);
  const dw = Math.max(1, Math.round(sw * k));
  const dh = Math.max(1, Math.round(sh * k));
  const t = document.createElement("canvas");
  t.width = dw;
  t.height = dh;
  const tx = t.getContext("2d", { willReadFrequently: true });
  if (!tx) return null;
  tx.imageSmoothingQuality = "high";
  tx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  if (bg) {
    // 바탕색을 투명하게 (가장자리는 부드럽게) → 새 바탕 위에 올려도 네모 자국이 안 남음
    const td = tx.getImageData(0, 0, dw, dh);
    const p = td.data;
    for (let q = 0; q < p.length; q += 4) {
      const dd = Math.abs(p[q] - bg[0]) + Math.abs(p[q + 1] - bg[1]) + Math.abs(p[q + 2] - bg[2]);
      p[q + 3] = Math.round(p[q + 3] * Math.min(1, Math.max(0, (dd - 18) / 54)));
    }
    tx.putImageData(td, 0, 0);
  }
  const o = document.createElement("canvas");
  o.width = out;
  o.height = out;
  const ox = o.getContext("2d");
  if (!ox) return null;
  const fill = mode === "tile" && bg ? `rgb(${bg.join(",")})` : mode === "light" ? LIGHT_LOGO_BG : "#fff";
  ox.fillStyle = fill;
  ox.fillRect(0, 0, out, out);
  ox.drawImage(t, Math.round((out - dw) / 2), Math.round((out - dh) / 2));
  return { url: o.toDataURL("image/png"), mode, fill };
}
