// 지표 계산용 배열 함수. 모두 입력과 같은 길이, 값이 없는 칸은 null
export type Series = (number | null)[];

export function sma(values: Series, n: number): Series {
  const out: Series = [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null) {
      sum += v;
      count++;
    }
    const drop = i >= n ? values[i - n] : null;
    if (i >= n && drop !== null) {
      sum -= drop;
      count--;
    }
    out.push(i >= n - 1 && count === n ? sum / n : null);
  }
  return out;
}

/** 지수이동평균. 첫 값은 앞 n개의 단순 평균 (null 은 건너뛰고 시작) */
export function ema(values: Series, n: number): Series {
  const k = 2 / (n + 1);
  const out: Series = [];
  let prev: number | null = null;
  let seed: number[] = [];
  for (const v of values) {
    if (v === null) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      seed.push(v);
      if (seed.length === n) {
        prev = seed.reduce((a, b) => a + b, 0) / n;
        seed = [];
        out.push(prev);
      } else out.push(null);
      continue;
    }
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** 와일더 이동평균 (RSI·ATR·ADX 용) */
export function rma(values: Series, n: number): Series {
  const out: Series = [];
  let prev: number | null = null;
  let seed: number[] = [];
  for (const v of values) {
    if (v === null) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      seed.push(v);
      if (seed.length === n) {
        prev = seed.reduce((a, b) => a + b, 0) / n;
        seed = [];
        out.push(prev);
      } else out.push(null);
      continue;
    }
    prev = (prev * (n - 1) + v) / n;
    out.push(prev);
  }
  return out;
}

export function wma(values: Series, n: number): Series {
  const denom = (n * (n + 1)) / 2;
  return values.map((_, i) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let j = 0; j < n; j++) {
      const v = values[i - n + 1 + j];
      if (v === null) return null;
      s += v * (j + 1);
    }
    return s / denom;
  });
}

export function stdev(values: Series, n: number): Series {
  const mean = sma(values, n);
  return values.map((_, i) => {
    const m = mean[i];
    if (m === null) return null;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) sq += ((values[j] as number) - m) ** 2;
    return Math.sqrt(sq / n);
  });
}

/** 최근 n칸 최댓값/최솟값 (창 안에 null 이 있으면 null) */
export function highest(values: Series, n: number): Series {
  return rolling(values, n, (w) => Math.max(...w));
}

export function lowest(values: Series, n: number): Series {
  return rolling(values, n, (w) => Math.min(...w));
}

function rolling(values: Series, n: number, fn: (window: number[]) => number): Series {
  return values.map((_, i) => {
    if (i < n - 1) return null;
    const w = values.slice(i - n + 1, i + 1);
    return w.some((v) => v === null) ? null : fn(w as number[]);
  });
}

/** 두 배열을 칸마다 계산 (어느 쪽이든 null 이면 null) */
export function zip(a: Series, b: Series, fn: (x: number, y: number) => number): Series {
  return a.map((x, i) => (x === null || b[i] === null ? null : fn(x, b[i] as number)));
}

export function map(a: Series, fn: (x: number, i: number) => number | null): Series {
  return a.map((x, i) => (x === null ? null : fn(x, i)));
}

/** n칸 앞 값과의 차이·비율용 */
export function shift(a: Series, n: number): Series {
  return a.map((_, i) => (i - n >= 0 && i - n < a.length ? a[i - n] : null));
}
