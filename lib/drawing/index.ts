// 기본 툴 등록. 새 툴은 tools/에 파일을 만들고 여기 한 줄 추가하면 된다.
import { registerTool } from "./registry";
import { trendLine } from "./tools/trendline";
import { horizontalLine } from "./tools/horizontal-line";
import { fibRetracement } from "./tools/fib-retracement";
import { arrow, marker, rectangle, verticalLine } from "./tools/shapes";
import { priceRange } from "./tools/measure";

registerTool(trendLine);
registerTool(horizontalLine);
registerTool(fibRetracement);
registerTool(verticalLine);
registerTool(arrow);
registerTool(marker);
registerTool(rectangle);
registerTool(priceRange);

export * from "./registry";
export * from "./types";
