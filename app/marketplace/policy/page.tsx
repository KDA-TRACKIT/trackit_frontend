import { redirect } from "next/navigation";

// 예전 '전략 마켓 이용 정책' 주소로 오면 전략 마켓으로 이동합니다.
//   정책은 이제 구독 구매 상자의 '정책 자세히' 팝업에서 봐요 (app/marketplace/policy.ts · PolicyDialog)
export default function PolicyPage() {
  redirect("/marketplace");
}
