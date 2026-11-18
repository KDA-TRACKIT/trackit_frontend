// 화면 맞춤(zoom, lib/fit-script.ts)일 때 차트 마우스 좌표 바로잡기
//   페이지에 zoom 을 걸면 clientX 와 getBoundingClientRect 는 줄어든(보이는) 크기인데,
//   차트 라이브러리는 (clientX - 상자 왼쪽)을 줄기 전 CSS 크기로 써서 십자선 · 드로잉이 zoom 배율만큼 어긋난다.
//   → 차트 칸 안의 마우스 · 포인터 · 휠 이벤트를 먼저 받아, 이벤트가 난 요소 기준 거리를 zoom 으로 나눈 좌표로 다시 보낸다
//   (zoom 이 1 이면 아무것도 안 함)
import { fitZoom } from "./fit-script";

const TYPES = ["mousedown", "mousemove", "mouseup", "mouseover", "mouseout", "mouseenter", "mouseleave", "click", "dblclick", "contextmenu", "pointerdown", "pointermove", "pointerup", "pointerover", "pointerout", "pointerenter", "pointerleave", "pointercancel", "wheel"] as const;
const fixed = new WeakSet<Event>();

function clone(e: MouseEvent, x: number, y: number): MouseEvent {
  const base: MouseEventInit = {
    bubbles: e.bubbles,
    cancelable: e.cancelable,
    composed: e.composed,
    view: e.view,
    detail: e.detail,
    clientX: x,
    clientY: y,
    screenX: e.screenX,
    screenY: e.screenY,
    button: e.button,
    buttons: e.buttons,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    relatedTarget: e.relatedTarget,
  };
  if (e instanceof WheelEvent) return new WheelEvent(e.type, { ...base, deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode });
  if (e instanceof PointerEvent)
    return new PointerEvent(e.type, { ...base, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, width: e.width, height: e.height, pressure: e.pressure, tiltX: e.tiltX, tiltY: e.tiltY });
  return new MouseEvent(e.type, base);
}

/** el(차트를 담은 칸) 안의 마우스 좌표를 zoom 에 맞게 고친다. 돌려준 함수로 해제 */
export function fixZoomPointer(el: HTMLElement): () => void {
  const onEvent = (e: Event) => {
    if (fixed.has(e) || !(e instanceof MouseEvent)) return;
    const z = fitZoom();
    if (z === 1) return;
    const target = e.target as Element | null;
    if (!target || !el.contains(target)) return;
    // 버튼 · 입력칸 같은 건 그대로 (다시 보내면 눌림이 두 번 될 수 있음). 차트 그림(canvas · svg) 위만 고친다
    if (target.closest("button, a, input, select, textarea, label, [contenteditable]")) return;
    const box = target.getBoundingClientRect();
    const next = clone(e, box.left + (e.clientX - box.left) / z, box.top + (e.clientY - box.top) / z);
    fixed.add(next);
    e.stopImmediatePropagation();
    target.dispatchEvent(next);
    if (next.defaultPrevented && e.cancelable) e.preventDefault();
  };
  for (const t of TYPES) el.addEventListener(t, onEvent, { capture: true, passive: false });
  return () => {
    for (const t of TYPES) el.removeEventListener(t, onEvent, { capture: true });
  };
}
