import { redirect } from "next/navigation";

// 나의 기록은 전략보관함 첫 화면(목록)으로 합침
export default function RecordsPage() {
  redirect("/archive");
}
