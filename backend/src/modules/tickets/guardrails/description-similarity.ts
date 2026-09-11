export function tokenizeComparableText(value: string): readonly string[] {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function descriptionSimilarity(left: string, right: string): number {
  const leftTokens = tokenizeComparableText(left);
  const rightTokens = tokenizeComparableText(right);
  if (leftTokens.length === 0 && rightTokens.length === 0) {
    return 1;
  }
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (leftSet.size + rightSet.size - intersection);
}
