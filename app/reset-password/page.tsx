// 비밀번호 찾기는 로그인 화면의 모달로 옮김 (예전 주소로 와도 그 모달이 열리게)
import { redirect } from "next/navigation";

export default function ResetPasswordPage() {
  redirect("/login?find=pw");
}
