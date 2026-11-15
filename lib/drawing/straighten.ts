// 손으로 그린 획(펜·마우스)이 거의 곧으면 직선 두 점으로 바꾼다 (화면 픽셀 좌표 기준)
// - 자동: 손을 뗐을 때 살짝 삐뚤한 정도면 직선으로
// - 길게 누름: 끝에서 잠깐 멈추면 더 삐뚤어도 직선으로 (아이패드 메모의 "멈추면 반듯하게"와 같은 방식)
import type { PixelPoint } from "./types";

export type StraightenMode = "auto" | "hold";

/** 이보다 짧은 획은 바꾸지 않는다 (점·짧은 체크 표시) */
const MIN_LENGTH = 24;
/** 수평·수직에서 이 각도(도) 안쪽이면 딱 맞춘다 */
const AXIS_SNAP_DEG = 4;
/** 모드별 허용치: 선에서 벗어난 최대 거리(길이 대비), 실제 이동 거리 / 양끝 거리 */
const LIMIT: Record<StraightenMode, { dev: number; devMin: number; wander: number }> = {
  auto: { dev: 0.07, devMin: 5, wander: 1.2 },
  hold: { dev: 0.2, devMin: 8, wander: 1.5 },
};

/**
 * 곧게 펼 수 있으면 직선의 두 끝점(화면 좌표), 아니면 null.
 * 끝점은 가장 잘 맞는 직선(최소제곱) 위로 옮긴 처음·마지막 점이라, 시작·끝 위치는 손으로 그린 그대로다
 */
export function straightenStroke(pts: PixelPoint[], mode: StraightenMode): [PixelPoint, PixelPoint] | null {
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  if (chord < MIN_LENGTH) return null;

  // 왔다 갔다 하거나 크게 휜 획은 제외: 실제로 움직인 거리가 양끝 거리보다 너무 길면
  let path = 0;
  for (let i = 1; i < pts.length; i++) path += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const limit = LIMIT[mode];
  if (path / chord > limit.wander) return null;

  // 가장 잘 맞는 직선: 점들의 평균을 지나고, 퍼진 방향(주성분)을 따른다
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);

  // 수평·수직 근처면 딱 맞춤
  const deg = (((angle * 180) / Math.PI) % 180 + 180) % 180;
  if (deg < AXIS_SNAP_DEG || deg > 180 - AXIS_SNAP_DEG) angle = 0;
  else if (Math.abs(deg - 90) < AXIS_SNAP_DEG) angle = Math.PI / 2;

  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  // 선에서 가장 멀리 벗어난 점이 허용치 안이어야 한다
  let maxDev = 0;
  for (const p of pts) maxDev = Math.max(maxDev, Math.abs((p.x - mx) * uy - (p.y - my) * ux));
  if (maxDev > Math.max(limit.devMin, limit.dev * chord)) return null;

  const project = (p: PixelPoint): PixelPoint => {
    const t = (p.x - mx) * ux + (p.y - my) * uy;
    return { x: mx + t * ux, y: my + t * uy };
  };
  return [project(first), project(last)];
}
