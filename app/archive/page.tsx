// 전략보관함 첫 화면 = 내 노트 (상단 메뉴 '전략보관함'도 /archive/notes 로 바로 감)
//   다른 화면의 '전략보관함' 경로 링크(/archive)도 같은 곳으로. 구매한 전략은 /archive/purchases
import { redirect } from "next/navigation";

export default function ArchivePage() {
  redirect("/archive/notes");
}
