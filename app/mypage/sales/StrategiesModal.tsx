"use client";
// 나의 전략 (시안 2026-11-18 모달): 등록한 전략의 공개 상태와 열람 현황
import Link from "next/link";
import { Modal } from "../ui";
import { day, saleState, type MyStrategy } from "./data";
import BeeLoader from "../../BeeLoader";

export default function StrategiesModal({ strategies, views, onClose }: { strategies: MyStrategy[] | null; views: Map<string, { buyers: number }>; onClose: () => void }) {
  return (
    <Modal label="나의 전략" onClose={onClose}>
      <div className="mp-strat-modal">
        <div className="mp-modal-head">
          <div>
            <h2>나의 전략</h2>
            <p>등록한 투자 전략의 공개 상태와 열람 현황</p>
          </div>
          <button type="button" className="mp-x" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mp-grid-table plain" style={{ ["--cols" as string]: "2fr 1fr 1fr 0.8fr 0.7fr" }}>
          <div className="th">
            <span>전략명</span>
            <span>등록일</span>
            <span>공개 상태</span>
            <span>열람 수</span>
            <span>관리</span>
          </div>
          {(strategies ?? []).map((s) => {
            const st = saleState(s);
            return (
              <div key={s.id} className="tr">
                <span className="clip" title={s.title}>
                  {s.title}
                </span>
                <span className="num">{day(s.createdAt)}</span>
                <span>
                  <em className={`mp-status${st.tone === "on" ? "" : st.tone === "pause" ? " wait" : " off"}`}>{st.label}</em>
                </span>
                <span className="num">{(views.get(s.id)?.buyers ?? 0).toLocaleString("ko-KR")}회</span>
                <span>
                  <Link className="mp-text-link" href="/mypage/sales/strategies">
                    관리
                  </Link>
                </span>
              </div>
            );
          })}
        </div>
        {strategies === null && <BeeLoader size="sm" />}
        {strategies?.length === 0 && <p className="mp-strat-empty">등록된 전략이 없습니다.</p>}
      </div>
    </Modal>
  );
}
