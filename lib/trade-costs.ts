// 주문 창 거래비용 (요율은 백엔드 GET /charts/{code}/costs — lib/brokers/costs.ts 와 같은 값)
//   수수료 = 체결금액 × 수수료율 (매수·매도), 매도세 = 매도 체결금액 × 세율. 둘 다 원 미만 절사
// 소수 곱셈 오차로 1원 틀리지 않게 요율을 백만분율 정수로 바꿔 계산한다
export type CostRates = { fee: number; sellTax: number };

const micro = (rate: number) => Math.round(rate * 1_000_000);
const cut = (amount: number, rate: number) => Math.floor((amount * micro(rate)) / 1_000_000);

export function orderCosts(side: "매수" | "매도", price: number, quantity: number, rates: CostRates) {
  const amount = price * quantity;
  const fee = cut(amount, rates.fee);
  const tax = side === "매도" ? cut(amount, rates.sellTax) : 0;
  // 매수: 내야 할 돈 = 금액 + 수수료 · 매도: 받을 돈 = 금액 − 수수료 − 세금
  const settle = side === "매수" ? amount + fee : amount - fee - tax;
  return { amount, fee, tax, settle };
}

/** 현금으로 살 수 있는 최대 수량 (수수료 포함해 현금을 넘지 않게) */
export function maxBuyQuantity(cash: number, price: number, rates: CostRates) {
  if (price <= 0) return 0;
  let q = Math.floor(cash / (price * (1 + rates.fee)));
  while (q > 0 && orderCosts("매수", price, q, rates).settle > cash) q--;
  while (orderCosts("매수", price, q + 1, rates).settle <= cash) q++;
  return q;
}

export const pctText = (rate: number) => `${+(rate * 100).toFixed(4)}%`;
