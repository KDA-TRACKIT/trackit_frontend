/**
 * 전략 댓글 거르기 — 백엔드 lib/market/comment-filter.ts 와 같은 규칙 (서버가 최종 판단, 여기는 쓰는 중에 미리 알려 줌 — 둘을 같이 고칠 것)
 *   1) 개인정보 · 연락처: 휴대폰 · 전화번호, 이메일, 주민등록번호, 카드 · 계좌번호, 링크(URL · 도메인), 메신저 아이디(카톡 · 오픈채팅 · 텔레그램 · @아이디)
 *   2) 전략 세부 내용 (산 사람만 볼 수 있는 내용이 퍼지지 않게): 진입 · 손절 · 목표가 같은 가격 · 조건 + 숫자, 숫자가 너무 많은 글
 *   3) 길이: 2~300자
 * 숫자 사이에 띄어쓰기 · 점 · 하이픈을 넣거나 한글 숫자(공일공)로 쓴 번호도 잡는다
 */
export type FilterResult = { ok: true; body: string } | { ok: false; code: string; reason: string };

const MAX = 300;
const MIN = 2;

const HANGUL_DIGITS: Record<string, string> = { 공: "0", 영: "0", 일: "1", 이: "2", 삼: "3", 사: "4", 오: "5", 육: "6", 칠: "7", 팔: "8", 구: "9" };

/**
 * 번호 찾기용: 한글 숫자를 숫자로, 숫자 사이 구분자(공백 · . · - · _ · /)를 지움
 *   한글 숫자는 3글자 넘게 이어질 때만 (공일공 · 일이삼사). "5일 20일" 의 일(날) 같은 건 바꾸지 않음
 */
function digitsView(text: string) {
  const converted = text.replace(/[공영일이삼사오육칠팔구](?:[\s.\-_/]*[공영일이삼사오육칠팔구]){2,}/g, (run) => run.replace(/[공영일이삼사오육칠팔구]/g, (c) => HANGUL_DIGITS[c]));
  return converted.replace(/(?<=\d)[\s.\-_/]+(?=\d)/g, "");
}

const RULES: { code: string; reason: string; test: (raw: string, digits: string) => boolean }[] = [
  {
    code: "PHONE",
    reason: "전화번호 같은 연락처는 쓸 수 없어요.",
    test: (_raw, d) => /(?:\+?82|0)1[016789]\d{7,8}/.test(d) || /(?<!\d)0(?:2|[3-6][1-5])\d{7,8}(?!\d)/.test(d),
  },
  { code: "EMAIL", reason: "이메일 주소는 쓸 수 없어요.", test: (raw) => /[\w.+-]+\s*(@|＠|\(at\)|\[at\]|골뱅이)\s*[\w-]+\s*(\.|닷|\(dot\))\s*[a-z]{2,}/i.test(raw) },
  { code: "RRN", reason: "주민등록번호 같은 개인정보는 쓸 수 없어요.", test: (_raw, d) => /(?<!\d)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/.test(d) },
  { code: "CARD", reason: "카드 · 계좌번호 같은 금융 정보는 쓸 수 없어요.", test: (raw, d) => /(?<!\d)\d{13,19}(?!\d)/.test(d) || /(계좌|입금|송금|카드번호)/.test(raw) && /\d{6,}/.test(d) },
  { code: "LINK", reason: "링크나 다른 사이트 주소는 쓸 수 없어요.", test: (raw) => /(https?:\/\/|www\.|[a-z0-9-]+\s*\.\s*(com|net|kr|co|io|me|ly|gg|app|link|xyz)\b)/i.test(raw) },
  {
    code: "MESSENGER",
    reason: "카톡 · 오픈채팅 · 텔레그램 아이디 같은 연락 수단은 쓸 수 없어요.",
    test: (raw) => /(카톡|카카오톡|오픈\s*채팅|오카방|텔레그램|텔레|라인\s*아이디|디엠|DM|인스타|kakao|telegram|t\.me)/i.test(raw) || /(?<![\w@])@[a-z0-9_.]{3,}/i.test(raw) || /(아이디|id)\s*[:：]?\s*[a-z0-9_.]{4,}/i.test(raw),
  },
  {
    code: "STRATEGY_DETAIL",
    reason: "진입 · 손절 · 목표가 같은 전략의 구체적인 가격 · 조건은 쓸 수 없어요. 느낀 점 위주로 남겨 주세요.",
    test: (raw) =>
      /(진입|매수|매도|손절|익절|목표|청산|지지|저항|이평|이동평균|rsi|macd|볼린저|돌파)\s*(가|선|가격|구간|라인|조건|값|기준)?\s*[:：은는이가을를]?\s*[0-9][0-9,.]*\s*(원|%|프로|퍼센트|일|분|봉|선)?/i.test(raw) ||
      /[0-9][0-9,.]{2,}\s*원\s*(에서|부터|까지|에|이하|이상|돌파|이탈)/.test(raw),
  },
  { code: "TOO_MANY_NUMBERS", reason: "숫자가 너무 많아요. 전략 내용이 그대로 드러나지 않게 줄여 주세요.", test: (raw) => (raw.match(/\d+(?:[.,]\d+)*/g) ?? []).length > 4 },
];

/** Q&A 는 구독자 · 판매자만 보므로 전략 세부 내용(가격 · 숫자)은 쓸 수 있고 더 길게 (개인정보 · 연락처는 똑같이 막음) */
const QNA_MAX = 600;
const DETAIL_RULES = new Set(["STRATEGY_DETAIL", "TOO_MANY_NUMBERS"]);

export function filterComment(input: unknown, opts: { qna?: boolean } = {}): FilterResult {
  const body = String(input ?? "").replace(/\s+/g, " ").trim();
  const max = opts.qna ? QNA_MAX : MAX;
  if (body.length < MIN) return { ok: false, code: "TOO_SHORT", reason: "두 글자 이상 써 주세요." };
  if (body.length > max) return { ok: false, code: "TOO_LONG", reason: opts.qna ? `${max}자까지 쓸 수 있어요.` : `${max}자까지 쓸 수 있어요. 전략 내용을 길게 옮기지 말고 느낀 점만 남겨 주세요.` };
  const digits = digitsView(body);
  for (const rule of RULES) if (!(opts.qna && DETAIL_RULES.has(rule.code)) && rule.test(body, digits)) return { ok: false, code: rule.code, reason: rule.reason };
  return { ok: true, body };
}

/**
 * 투자 조언 요청 · 제공 거르기 (Q&A, 2026-11-21): 질문은 이미 공개된 기록에 대한 설명만. 개별 투자 상담처럼 보이는 글은 올리기 전에 막음
 *   질문(ask): 지금 사도/팔아도 되는지, 종목 · 매수 추천, 내 계좌 · 보유 종목 상담, 앞으로 오를지
 *   답(answer): 사라 · 팔라 같은 권유, 종목 추천, 수익 보장
 * 규칙으로 먼저 거르고, 서버는 AI 가 켜져 있으면 한 번 더 분류함 (lib/market/feedback.ts)
 */
const ADVICE_ASK = [
  /(지금|오늘|내일|이번\s*주|당장|아직)\s*[^.?!]{0,20}(사도|살까|사야|매수해도|매수할까|들어가도|들어갈까|타도|팔아도|팔까|팔아야|매도해도|매도할까|정리할까|손절할까|물타|불타)/,
  /(추천|찍어|골라)\s*(해|좀|주|줘|부탁)/,
  /(종목|매수|매도)\s*추천/,
  /(제|내|저의|저희)\s*(계좌|포트|포트폴리오|보유\s*종목|평단|물린|종목)/,
  /(얼마|어디)(에|에서|까지|쯤)\s*[^.?!]{0,10}(사|팔|매수|매도|손절|익절)[^.?!]{0,6}(될까|되나|할까|하나|좋을까|해야)/,
  /(오를까|떨어질까|내릴까|갈까요|반등할까|더\s*갈까|전망\s*(어떻|좀|알려))/,
  /(리딩|단톡|개인\s*상담|1\s*[:대]\s*1|일대일|과외|대신\s*(매매|운용)|맡기)/,
];
const ADVICE_ANSWER = [
  /(사세요|사십시오|사시면|매수하세요|매수하시면|들어가세요|담으세요|타세요|파세요|매도하세요|정리하세요|손절하세요|홀딩하세요|버티세요)/,
  /(추천\s*(합니다|드려|드립니다|해요|종목)|강력\s*추천|매수\s*추천)/,
  /(무조건|반드시|확실히|틀림없이)\s*[^.?!]{0,12}(오릅|오를|갑니다|수익|상승)/,
  /(수익|원금)\s*(보장|확정)/,
  /(리딩|단톡|개인\s*상담|1\s*[:대]\s*1|일대일|대신\s*(매매|운용)|맡기시)/,
];
export function filterAdvice(input: unknown, role: "ask" | "answer"): FilterResult {
  const body = String(input ?? "").replace(/\s+/g, " ").trim();
  const hit = (role === "ask" ? ADVICE_ASK : ADVICE_ANSWER).some((re) => re.test(body));
  if (!hit) return { ok: true, body };
  return role === "ask"
    ? { ok: false, code: "ADVICE_REQUEST", reason: "사도 되는지 · 종목 추천 같은 투자 상담은 물을 수 없어요. 공개된 기록(왜 그렇게 했는지)에 대해 물어 주세요." }
    : { ok: false, code: "ADVICE", reason: "사라 · 팔라 같은 권유나 종목 추천은 답으로 쓸 수 없어요. 공개한 기록에 대한 설명만 써 주세요." };
}

