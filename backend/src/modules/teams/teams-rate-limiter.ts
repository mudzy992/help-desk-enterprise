/**
 * Paket 3.1 (§19): Teams allows about one message per second per conversation
 * and ~50 RPS per app and tenant. This in-process limiter spaces sends; the
 * queue's retry with Retry-After covers what one process cannot see.
 */
export class TeamsRateLimiter {
  private readonly nextByConversation = new Map<string, number>();
  private globalWindowStart = 0;
  private globalCount = 0;

  constructor(
    private readonly perConversationMs = 1_000,
    private readonly globalPerSecond = 40,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async acquire(conversationId: string): Promise<void> {
    for (;;) {
      const now = this.now();
      if (now - this.globalWindowStart >= 1_000) {
        this.globalWindowStart = now;
        this.globalCount = 0;
      }
      const next = this.nextByConversation.get(conversationId) ?? 0;
      const waitConversation = Math.max(0, next - now);
      const waitGlobal = this.globalCount >= this.globalPerSecond ? 1_000 - (now - this.globalWindowStart) : 0;
      const wait = Math.max(waitConversation, waitGlobal);
      if (wait <= 0) {
        this.globalCount += 1;
        this.nextByConversation.set(conversationId, now + this.perConversationMs);
        if (this.nextByConversation.size > 5_000) this.prune(now);
        return;
      }
      await this.sleep(wait);
    }
  }

  private prune(now: number): void {
    for (const [key, value] of this.nextByConversation) if (value < now) this.nextByConversation.delete(key);
  }
}
