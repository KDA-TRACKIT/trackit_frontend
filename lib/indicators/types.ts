// 지표 정의 형식. 새 지표는 library.ts 에 정의 하나를 추가하면 메뉴·차트·저장이 모두 따라온다
import type { Bar } from "../mock/workshop";

import type { FlowDay } from "../market-data";

export type IndicatorCategory = "추세" | "모멘텀" | "변동성" | "거래량" | "수급";

/** 봉 밖에서 가져오는 데이터 (수급: 일봉 시각 → 그날 값) */
export type IndicatorExt = { flows?: Map<number, FlowDay> };

export type ParamDef = {
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
};

export type OutputDef = {
  key: string;
  label: string;
  kind: "line" | "histogram" | "dots";
  color: string;
  dashed?: boolean;
  /** histogram 색: sign = 0 위/아래, candle = 그 봉의 양봉/음봉 */
  colorBy?: "sign" | "candle";
};

export type IndicatorDef = {
  id: string;
  name: string;
  /** 범례·목록에 쓰는 짧은 이름 (예: MA, RSI) */
  short: string;
  category: IndicatorCategory;
  description: string;
  /** overlay = 가격 차트 위, separate = 아래 보조 창, volume = 가격 차트 아래쪽에 별도 눈금으로 겹침 */
  placement: "overlay" | "separate" | "volume";
  params: ParamDef[];
  outputs: OutputDef[];
  /** 추가할 때 한 번에 여러 개를 올리는 기본 묶음 (예: 이동평균 5·20·60·120). 각각 첫 선 색 */
  presets?: { params: Record<string, number>; color: string }[];
  /** 보조 창 기준선 (예: RSI 70/30) */
  levels?: number[];
  /** 봉 말고 더 받아야 하는 데이터 (flows = 키움 일별 수급, 일봉에서만) */
  data?: "flows";
  /** 있으면 쓰고 없으면 봉으로 추정하는 데이터 (CVD: 일봉은 체결강도, 분·시간봉은 추정) */
  optionalData?: "flows";
  /** 봉 순서와 같은 길이의 배열. 값이 없는 앞부분은 null */
  compute(bars: Bar[], p: Record<string, number>, ext?: IndicatorExt): Record<string, (number | null)[]>;
};

/** 차트에 올린 지표 하나 (같은 지표를 여러 번 올릴 수 있음) */
export type IndicatorInstance = {
  uid: string;
  id: string;
  params: Record<string, number>;
  visible: boolean;
  /** 출력별 색 (같은 지표를 여러 개 올릴 때 구분용) */
  colors?: string[];
};
