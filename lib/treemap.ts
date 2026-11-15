// 사각형 나누기 (squarified treemap, Bruls et al.): 값에 비례한 넓이로, 칸이 되도록 정사각형에 가깝게
export type Rect = { x: number; y: number; w: number; h: number };

/** values 순서대로 rect 를 나눈 칸들 (값이 큰 것부터 넣어야 보기 좋음). 0 이하인 값은 넓이 0 */
export function squarify(values: number[], rect: Rect): Rect[] {
  const out: Rect[] = new Array(values.length);
  const total = values.reduce((a, v) => a + Math.max(v, 0), 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) {
    for (let i = 0; i < values.length; i++) out[i] = { x: rect.x, y: rect.y, w: 0, h: 0 };
    return out;
  }
  const scale = (rect.w * rect.h) / total;
  const areas = values.map((v) => Math.max(v, 0) * scale);
  let { x, y, w, h } = rect;
  let i = 0;

  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    if (s <= 0) return Infinity;
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min || Infinity));
  };

  while (i < areas.length) {
    const side = Math.min(w, h);
    const row: number[] = [];
    const idx: number[] = [];
    // 비율이 나빠지기 전까지 한 줄에 담는다
    while (i < areas.length) {
      const next = [...row, areas[i]];
      if (row.length && worst(next, side) > worst(row, side)) break;
      row.push(areas[i]);
      idx.push(i);
      i++;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      // 왼쪽에 세로 줄
      const colW = h > 0 ? sum / h : 0;
      let cy = y;
      row.forEach((a, k) => {
        const ch = colW > 0 ? a / colW : 0;
        out[idx[k]] = { x, y: cy, w: colW, h: ch };
        cy += ch;
      });
      x += colW;
      w -= colW;
    } else {
      // 위쪽에 가로 줄
      const rowH = w > 0 ? sum / w : 0;
      let cx = x;
      row.forEach((a, k) => {
        const cw = rowH > 0 ? a / rowH : 0;
        out[idx[k]] = { x: cx, y, w: cw, h: rowH };
        cx += cw;
      });
      y += rowH;
      h -= rowH;
    }
  }
  return out;
}
