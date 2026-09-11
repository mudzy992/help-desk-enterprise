export function calculateTimeLogDurationSeconds(
  startedAt: Date,
  endedAt: Date,
): number {
  return Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
  );
}
