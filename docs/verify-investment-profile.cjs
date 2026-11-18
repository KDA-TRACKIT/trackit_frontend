const assert = require("node:assert/strict");
const { hasSavedInvestment } = require("../lib/investment-profile.ts");

for (const investment of [undefined, null, {}, [], "invalid", { market: "  ", styles: [], indicators: [] }, { styles: [null, 42, " "] }, { unknown: "value" }]) {
  assert.equal(hasSavedInvestment({ investment }), false, `Unexpected saved profile: ${JSON.stringify(investment)}`);
}
for (const investment of [{ market: "미국 주식" }, { styles: ["스윙"] }, { indicators: ["RSI"] }, { otherIndicators: "VWAP" }, { principle: "손절가를 정합니다" }, { period: "장기" }]) {
  assert.equal(hasSavedInvestment({ investment }), true, `Missing saved profile: ${JSON.stringify(investment)}`);
}
assert.equal(hasSavedInvestment({ nickname: "사용자" }), false);
console.log("Investment profile checks passed (15 cases).");
