export class BulkBroadcastRateLimiter {
  private readonly stamps = new Map<string, number[]>();

  consume(actorUserId: string, limitPerMinute: number, now = Date.now()): boolean {
    const windowStart = now - 60_000;
    const recent = (this.stamps.get(actorUserId) ?? []).filter(
      (stamp) => stamp >= windowStart,
    );
    if (recent.length >= limitPerMinute) {
      return false;
    }
    recent.push(now);
    this.stamps.set(actorUserId, recent);
    return true;
  }
}

export const bulkBroadcastRateLimiter = new BulkBroadcastRateLimiter();
