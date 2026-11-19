"use client";
// 장바구니: 담아 둔 월별 전략을 트레이더별로 모아 보여 줌
//   열람권은 트레이더별로 사서 한 장에 한 달을 열기 때문에, 트레이더마다 "모자란 장수"만큼 한 번에 사고 → 각 전략을 열람권으로 연다
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import SiteHeader from "../../SiteHeader";
import { monthLabel, pct, sellable, strategiesOf, tone, traderById, won } from "../data";
import { PassBuyButton, StrategyButton, useNotice } from "../parts";
import { PURCHASE_NOTICE } from "../policy";
import { removeFromCart, useCart } from "../../../lib/cart";
import { opened, unusedPasses, usePasses } from "../../../lib/purchases";
import "../marketplace.css";

export default function CartPage() {
  const cart = useCart();
  const passes = usePasses();
  const { notify, node } = useNotice();
  const [agreed, setAgreed] = useState(false);

  // 트레이더별로 묶기 (담은 순서 유지)
  const groups = [...new Set(cart.map((c) => c.traderId))].flatMap((id) => {
    const t = traderById(id);
    if (!t) return [];
    const all = strategiesOf(t);
    const items = cart.filter((c) => c.traderId === id).flatMap((c) => all.filter((s) => s.month === c.month));
    const locked = items.filter((s) => !opened(passes, id, s.month));
    const need = Math.max(0, locked.length - unusedPasses(passes, id).length);
    return [{ t, items, need }];
  });
  const total = groups.reduce((a, g) => a + (sellable(g.t) ? g.need * g.t.price : 0), 0);

  return (
    <main className="mk-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap mk-cart">
        <Link href="/marketplace" className="mk-back">
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          트레이더 목록
        </Link>
        <h1 className="mk-title">장바구니</h1>
        <p className="mk-cart-desc">열어 보고 싶은 전략을 모아 두는 곳이에요. 열람권은 트레이더별로 사고, 한 장으로 한 달 전략을 열어요.</p>

        {!groups.length ? (
          <p className="mk-card mk-empty">
            담은 전략이 없어요. 트레이더의 월별 전략에서 <b>담기</b>를 눌러 보세요. <Link href="/marketplace">트레이더 보러 가기</Link>
          </p>
        ) : (
          <>
            {groups.map(({ t, items, need }) => (
              <section key={t.id} className="mk-card mk-cart-group">
                <div className="mk-cart-head">
                  <Link href={`/marketplace/${t.id}`}>
                    <strong>{t.name}</strong>
                  </Link>
                  <small>열람권 1장 {sellable(t) ? won(t.price) : "판매 중지"} · 남은 열람권 {unusedPasses(passes, t.id).length}장</small>
                </div>
                <ul>
                  {items.map((s) => (
                    <li key={s.month}>
                      <div>
                        <small>{monthLabel(s.month)}</small>
                        <Link href={`/marketplace/${t.id}/strategies/${s.month}`}>{s.title}</Link>
                      </div>
                      <span className={tone(s.ret)}>{pct(s.ret)}</span>
                      <StrategyButton trader={t} strategy={s} className="mk-soft" notify={notify} />
                      <button type="button" className="mk-cart-remove" onClick={() => removeFromCart(t.id, s.month)} aria-label={`${s.title} 빼기`} title="장바구니에서 빼기">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                {need > 0 && sellable(t) && (
                  <div className="mk-cart-buy">
                    <span>
                      열람권 <b>{need}장</b> 더 필요 · {won(need * t.price)}
                    </span>
                    <PassBuyButton trader={t} quantity={need} label={`열람권 ${need}장 구매하기`} notify={notify} disabled={!agreed} />
                  </div>
                )}
              </section>
            ))}
            <div className="mk-card mk-cart-total">
              <div>
                <span>모자란 열람권 합계</span>
                <b>{won(total)}</b>
              </div>
              <label className="mk-agree">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>
                  {PURCHASE_NOTICE} <Link href="/marketplace/policy">정책 자세히</Link>
                </span>
              </label>
              <small>결제는 트레이더별로 따로 해요. 산 뒤 각 전략의 &quot;열람권으로 열기&quot;를 누르면 열려요.</small>
            </div>
          </>
        )}
      </div>
      {node}
    </main>
  );
}
