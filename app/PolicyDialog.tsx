"use client";
// 정책 팝업: 홈 화면 아래 이용약관 · 개인정보처리방침 · 환불정책과 전략 마켓 '정책 자세히'가 같이 씀 (모양 같게)
//   <dialog> 를 body 에 붙여 두고 ref.current.showModal() 로 엶. 놓인 화면(구매 상자 · 체크박스 label 등)의
//   글자 크기 · 정렬을 물려받지 않고, 팝업 안을 눌러도 바깥 체크박스가 눌리지 않게
//   닫기: X · Esc · 팝업 바깥(어두운 배경) 누르기. 안에서 글자를 끌어 고르다 바깥에서 놓은 건 닫지 않음
import { useRef, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./policy-dialog.css";

const noop = () => () => {};

/** 팝업 상자 바깥(::backdrop)을 눌렀는지: 배경을 누르면 이벤트가 dialog 자신에게 오고, 좌표가 상자 밖 */
function onBackdrop(e: { target: EventTarget; currentTarget: HTMLDialogElement; clientX: number; clientY: number }) {
  if (e.target !== e.currentTarget) return false;
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

export default function PolicyDialog({
  ref,
  titleId,
  title,
  contentKey,
  children,
}: {
  ref: Ref<HTMLDialogElement>;
  titleId: string;
  title: string;
  /** 내용이 바뀌면 스크롤을 처음으로 (홈: 정책 종류) */
  contentKey?: string;
  children: ReactNode;
}) {
  // 서버 그림에는 없고, 브라우저에서만 body 에 붙임
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // 바깥에서 누르기 시작했는지 (누른 곳 · 뗀 곳이 둘 다 바깥일 때만 닫음)
  const downOnBackdrop = useRef(false);
  if (!mounted) return null;
  return createPortal(
    <dialog
      ref={ref}
      className="policy-dialog"
      aria-labelledby={titleId}
      onPointerDown={(e) => {
        downOnBackdrop.current = onBackdrop(e);
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && onBackdrop(e)) e.currentTarget.close();
        downOnBackdrop.current = false;
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label="닫기" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
          <X aria-hidden="true" size={20} />
        </button>
      </header>
      <div key={contentKey} className="policy-body" tabIndex={0} role="region" aria-labelledby={titleId}>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
