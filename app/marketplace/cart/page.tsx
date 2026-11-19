import { redirect } from "next/navigation";

// 기존 장바구니 주소로 방문하면 전략 마켓으로 이동합니다.
export default function CartPage() {
  redirect("/marketplace");
}
