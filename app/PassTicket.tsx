// 열람권 티켓 그림 (Figma '아카이브 / 열람권 티켓', 32×20). 색은 "열람권으로 열기" 버튼과 같은 꿀색 #E8A400
//   장수는 옆에 글자로 따로 보여 주므로 그림은 화면 읽기에서 뺌 (aria-hidden). 모양 · 배치는 archive.css 의 .pass-*

const BODY = "M4 0H28A4 4 0 0 1 32 4V7A3 3 0 0 0 32 13V16A4 4 0 0 1 28 20H4A4 4 0 0 1 0 16V13A3 3 0 0 0 0 7V4A4 4 0 0 1 4 0Z";

/** 이 장수부터 가운데에 ⋯ 를 얹어 줄여 보여 줌 */
const SHORT_FROM = 7;

/** 티켓 한 장. ring: 겹칠 때 바탕색 테두리로 앞뒤 티켓을 갈라 줌 */
export function PassTicket({ ring = false }: { ring?: boolean }) {
  return (
    <svg className="pass-ticket" width={32} height={20} viewBox="0 0 32 20" fill="none" aria-hidden="true" focusable="false">
      {ring && <path d={BODY} stroke="var(--c-surface, #fff)" strokeWidth={2.4} />}
      <path d={BODY} fill="#E8A400" />
      <path d="M10.5 4.5V15.5" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.2} strokeDasharray="1.6 1.8" strokeLinecap="round" />
      <path d="M21.25 6.5L24.28 8.25V11.75L21.25 13.5L18.22 11.75V8.25Z" fill="#fff" />
    </svg>
  );
}

/**
 * 장수만큼 티켓을 겹쳐 쌓음. 묶음은 감싼 칸 너비(= 위 '보유 열람권' 글자 너비)에 딱 맞게 끝남
 *   1장: 한 장 · 2~6장: 모두 겹쳐 칸 끝까지
 *   7장 이상: 티켓 7장을 같은 간격으로 겹쳐 그리고, 가운데에 ⋯ (⋯ 바로 뒤 작은 부분만 흐리게)
 *   (가운데는 생략, 정확한 장수는 옆 글자)
 */
export function PassTickets({ count }: { count: number }) {
  if (count <= 0) return null;
  const short = count >= SHORT_FROM;
  const n = short ? SHORT_FROM : count;
  return (
    <span className={short ? "pass-stack is-short" : "pass-stack"} style={{ ["--n" as string]: n }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <PassTicket key={i} ring={n > 1} />
      ))}
      {short && (
        <span className="pass-more">
          <i className="pass-more-blur" />
          <svg width="12" height="4" viewBox="0 0 12 4" focusable="false">
            <circle cx="2" cy="2" r="1.4" fill="currentColor" />
            <circle cx="6" cy="2" r="1.4" fill="currentColor" />
            <circle cx="10" cy="2" r="1.4" fill="currentColor" />
          </svg>
        </span>
      )}
    </span>
  );
}
