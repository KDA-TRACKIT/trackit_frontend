import AiBuilder from "./AiBuilder";
import "../../marketplace/marketplace.css";
import "../archive.css";

// ?memo=<메모 id>: 내 메모 '이 메모로 AI전략 만들기'에서 오면 그 메모를 미리 담아 둠
export default async function AiStrategyPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { memo } = await searchParams;
  return <AiBuilder initialPick={typeof memo === "string" && memo ? [memo] : []} />;
}
