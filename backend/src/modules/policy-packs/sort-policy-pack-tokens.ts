export function sortPolicyPackTokens(
  values: readonly string[],
): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}
