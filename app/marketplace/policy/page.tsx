// 전략 쇼핑 이용 정책: 열람권 · 월 기준 · 수정 · 비공개 · 환불
import Link from "next/link";
import SiteHeader from "../../SiteHeader";
import { POLICY } from "../policy";
import "../marketplace.css";

export default function PolicyPage() {
  return (
    <main className="mk-page">
      <SiteHeader active="marketplace" />
      <div className="mk-wrap mk-narrow">
        <Link href="/marketplace" className="mk-back">
          ‹ 전략 쇼핑
        </Link>
        <h1 className="mk-title">전략 쇼핑 이용 정책</h1>
        <p className="mk-policy-lead">전략 쇼핑은 개인 간 유료 거래예요. 사기 전에 아래 내용을 확인해 주세요.</p>
        {POLICY.map((sec) => (
          <section key={sec.title} className="mk-card mk-policy">
            <h2>{sec.title}</h2>
            <ul>
              {sec.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
