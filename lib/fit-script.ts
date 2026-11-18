// 화면 맞춤: 폭 801~1439px 에서는 배치를 바꾸지 않고 1440px 화면을 통째로 줄여 보여 준다 (CSS zoom)
//   800px 이하(폰)는 지금처럼 배치를 바꾼다 (CSS 의 max-width:800px 규칙), 1440px 이상은 그대로
//   zoom 을 걸면 vw · vh 단위도 같이 줄어들어서, 화면 크기는 --vw · --vh (zoom 을 되돌린 1% 크기)로 쓴다
//   예: 100vh → calc(100 * var(--vh, 1vh))
// 서버 layout 의 <head> 에 넣어 첫 그림 전에 적용 (깜빡임 방지), 창 크기가 바뀌면 다시 계산
export const FIT_DESIGN_WIDTH = 1440;
export const FIT_MIN_WIDTH = 801;

export const FIT_INIT_SCRIPT = `(function(){try{var D=${FIT_DESIGN_WIDTH},M=${FIT_MIN_WIDTH},h=document.documentElement;function f(){var w=window.innerWidth,z=w>=M&&w<D?w/D:1;h.style.zoom=z===1?"":String(z);h.style.setProperty("--fit",String(z));h.style.setProperty("--vw",w/z/100+"px");h.style.setProperty("--vh",window.innerHeight/z/100+"px")}f();window.addEventListener("resize",f)}catch(e){}})();`;

/** 지금 화면 맞춤 배율 (zoom). 마우스 좌표(clientX)를 요소 안 CSS 좌표로 바꿀 때 나눈다 */
export function fitZoom(): number {
  if (typeof document === "undefined") return 1;
  const z = Number(getComputedStyle(document.documentElement).getPropertyValue("--fit"));
  return z > 0 ? z : 1;
}
