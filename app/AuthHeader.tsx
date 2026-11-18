import Link from "next/link";
import SiteHeader from "./SiteHeader";

/** 인증 화면은 공통 로고와 높이를 유지하고 현재 가입 단계만 표시한다. */
export default function AuthHeader({ title, login = false }: { title?: string; login?: boolean }) {
  return (
    <div className="auth-design-header">
      <SiteHeader menu={false} right={login ? <Link className="auth-header-login" href="/login">로그인</Link> : false} />
      {title && <span className="auth-header-title">{title}</span>}
    </div>
  );
}
