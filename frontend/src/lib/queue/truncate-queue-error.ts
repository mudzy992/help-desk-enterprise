export function truncateQueueError(
  value: string | null,
  maximumLength = 160,
): string {
  if (value === null || value.trim().length === 0) {
    return "";
  }
  if (value.length <= maximumLength) {
    return value;
  }
  return `${value.slice(0, maximumLength)}…`;
}
