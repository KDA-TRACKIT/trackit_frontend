/** Empty or malformed metadata does not count as saved investment information. */
export function hasSavedInvestment(meta: Record<string, unknown>): boolean {
  const value = meta.investment;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const investment = value as Record<string, unknown>;
  return ["market", "period", "otherIndicators", "principle"].some((key) => typeof investment[key] === "string" && investment[key].trim().length > 0)
    || ["styles", "indicators"].some((key) => Array.isArray(investment[key]) && investment[key].some((item: unknown) => typeof item === "string" && item.trim().length > 0));
}
