import { redirect } from "next/navigation";

// 예전 주소: 용어를 '메모' → '노트'로 바꾸며 내 노트는 /archive/notes 로 옮김
export default function OldMemosPage() {
  redirect("/archive/notes");
}
