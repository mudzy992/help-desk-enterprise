export function isRemoteRequestRateLimited(
  lastRequestedAt: Date | null,
  rateLimitMinutes: number,
  now: Date = new Date(),
): boolean {
  if (lastRequestedAt === null) {
    return false;
  }
  const windowMs = rateLimitMinutes * 60 * 1000;
  return now.getTime() - lastRequestedAt.getTime() < windowMs;
}
