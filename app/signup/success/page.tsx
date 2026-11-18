import Link from "next/link";
import AuthHeader from "../../AuthHeader";

export default function SignupSuccessPage() {
  return (
    <main className="auth-page auth-design">
      <AuthHeader title="가입 완료" />
      <section className="signup-success" aria-labelledby="signup-success-title">
        <span className="signup-success-icon"><img src="/auth/check.svg" alt="" /></span>
        <h1 id="signup-success-title">가입이 완료되었습니다.</h1>
        <p>투자 프로필을 설정하고 TRACKIT을 시작해 보세요.</p>
        <Link className="signup-success-action" href="/login">로그인 하러가기</Link>
      </section>
    </main>
  );
}
