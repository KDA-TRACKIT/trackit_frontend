// 지수 · 선물 · 환율 (2026-11-22, 트레이딩 로그에서 종목처럼 검색해 차트로)
//   지수: 코스피 · 코스닥 (키움 업종, KRX 공식 지수) → /charts/index/{code}
//   선물 · 환율: 거래소 연결 선물 · 환율 (백엔드가 받아 둠, 선물은 약 10분 늦음) → /charts/futures/{code}
//     okx: 실시간을 이어 붙일 OKX 무기한 선물 (CME 가격 기준으로 맞춤, CME 휴장일엔 안 붙임)
//   매매 · 기업 정보 · 수급은 없음 (가격 표시는 소수 둘째 자리, 단위 없음)

export type SpecialSymbol = { code: string; name: string; market: string; kind: "index" | "futures"; okx?: string; keywords?: string };

export const SPECIAL_SYMBOLS: SpecialSymbol[] = [
  { code: "KOSPI", name: "코스피", market: "지수", kind: "index", keywords: "kospi 코스피지수" },
  { code: "KOSDAQ", name: "코스닥", market: "지수", kind: "index", keywords: "kosdaq 코스닥지수" },
  { code: "NQ1!", name: "나스닥100 선물", market: "CME", kind: "futures", okx: "US100-USDT-SWAP", keywords: "nasdaq 나스닥 ndx us100" },
  { code: "ES1!", name: "S&P500 선물", market: "CME", kind: "futures", okx: "US500-USDT-SWAP", keywords: "s&p spx sp500 에스앤피" },
  { code: "YM1!", name: "다우 선물", market: "CBOT", kind: "futures", keywords: "dow 다우존스" },
  { code: "RTY1!", name: "러셀2000 선물", market: "CME", kind: "futures", keywords: "russell 러셀" },
  { code: "GC1!", name: "금 선물", market: "COMEX", kind: "futures", okx: "XAU-USDT-SWAP", keywords: "gold 금 xau" },
  { code: "SI1!", name: "은 선물", market: "COMEX", kind: "futures", okx: "XAG-USDT-SWAP", keywords: "silver 은 xag" },
  { code: "HG1!", name: "구리 선물", market: "COMEX", kind: "futures", okx: "XCU-USDT-SWAP", keywords: "copper 구리" },
  { code: "PL1!", name: "백금 선물", market: "NYMEX", kind: "futures", okx: "XPT-USDT-SWAP", keywords: "platinum 백금" },
  { code: "CL1!", name: "WTI 원유 선물", market: "NYMEX", kind: "futures", okx: "CL-USDT-SWAP", keywords: "wti crude oil 원유 유가" },
  { code: "BZ1!", name: "브렌트유 선물", market: "NYMEX", kind: "futures", okx: "BZ-USDT-SWAP", keywords: "brent 브렌트 원유 유가" },
  { code: "NG1!", name: "천연가스 선물", market: "NYMEX", kind: "futures", okx: "NG-USDT-SWAP", keywords: "natural gas 천연가스 가스" },
  { code: "ZC1!", name: "옥수수 선물", market: "CBOT", kind: "futures", keywords: "corn 옥수수 곡물" },
  { code: "ZS1!", name: "대두 선물", market: "CBOT", kind: "futures", keywords: "soybean 대두 콩 곡물" },
  { code: "ZW1!", name: "밀 선물", market: "CBOT", kind: "futures", keywords: "wheat 밀 곡물" },
  { code: "ZN1!", name: "미국 10년물 국채 선물", market: "CBOT", kind: "futures", keywords: "treasury 국채 금리 10년" },
  { code: "6E1!", name: "유로 선물", market: "CME", kind: "futures", keywords: "euro 유로" },
  { code: "6J1!", name: "엔 선물", market: "CME", kind: "futures", keywords: "yen 엔" },
  { code: "USDKRW", name: "원/달러 환율", market: "외환", kind: "futures", keywords: "환율 달러 원달러 usd krw" },
  { code: "JPYKRW", name: "원/엔 환율", market: "외환", kind: "futures", keywords: "환율 엔 원엔 jpy krw" },
  { code: "EURKRW", name: "원/유로 환율", market: "외환", kind: "futures", keywords: "환율 유로 원유로 eur krw" },
  { code: "USDJPY", name: "달러/엔", market: "외환", kind: "futures", keywords: "환율 엔 usd jpy" },
  { code: "EURUSD", name: "유로/달러", market: "외환", kind: "futures", keywords: "환율 유로 eur usd" },
  { code: "GBPUSD", name: "파운드/달러", market: "외환", kind: "futures", keywords: "환율 파운드 gbp usd" },
  { code: "AUDUSD", name: "호주달러/달러", market: "외환", kind: "futures", keywords: "환율 호주 aud usd" },
  { code: "NZDUSD", name: "뉴질랜드달러/달러", market: "외환", kind: "futures", keywords: "환율 뉴질랜드 nzd usd" },
  { code: "USDCHF", name: "달러/스위스프랑", market: "외환", kind: "futures", keywords: "환율 스위스 프랑 usd chf" },
  { code: "GBPJPY", name: "파운드/엔", market: "외환", kind: "futures", keywords: "환율 파운드 엔 gbp jpy" },
  { code: "DXY", name: "달러인덱스", market: "ICE", kind: "futures", keywords: "dollar index 달러인덱스 달러지수" },
];

const BY_CODE = new Map(SPECIAL_SYMBOLS.map((s) => [s.code, s]));
export const specialOf = (code: string) => BY_CODE.get(code);
export const isSpecialCode = (code: string) => BY_CODE.has(code);
export const isIndexCode = (code: string) => BY_CODE.get(code)?.kind === "index";
export const isFuturesCode = (code: string) => BY_CODE.get(code)?.kind === "futures";

/** 검색어에 맞는 지수 · 선물 · 환율 (코드 · 이름 · 별칭) */
export function searchSpecial(q: string): SpecialSymbol[] {
  const k = q.trim().toLowerCase().replace(/\s/g, "");
  if (!k) return [];
  return SPECIAL_SYMBOLS.filter((s) => [s.code, s.name, s.keywords ?? ""].some((t) => t.toLowerCase().replace(/\s/g, "").includes(k)));
}

/** 선물 일봉 자리 (그 거래일): CME 하루는 뉴욕 18:00 에 시작 → 체결 시각 + 6시간의 뉴욕 날짜. 그날 KST 정오로 */
export function futuresDailyTickTime(time: number) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date((time + 6 * 3600) * 1000));
  return Date.parse(`${ymd}T12:00:00+09:00`) / 1000;
}
