/** Package 1.6: "ping-pong" starts at this many forwards (mirrors the report default). */
export const forwardWarningThreshold = 3;

export type TicketForwardFacts = {
  readonly forwardCount?: number;
  readonly lastForwardedAt?: string | null;
  readonly lastForwardFromGroupName?: string | null;
};

export function forwardCountOf(ticket: TicketForwardFacts): number {
  return typeof ticket.forwardCount === "number" && ticket.forwardCount > 0 ? ticket.forwardCount : 0;
}

export function isForwardPingPong(ticket: TicketForwardFacts): boolean {
  return forwardCountOf(ticket) >= forwardWarningThreshold;
}

/** Tooltip parts: when and from which group the last forward came. */
export function describeLastForward(
  ticket: TicketForwardFacts,
  locale: string,
): { readonly when: string | null; readonly from: string | null } {
  const date = ticket.lastForwardedAt ? new Date(ticket.lastForwardedAt) : null;
  const when =
    date === null || Number.isNaN(date.getTime())
      ? null
      : new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
  const from = ticket.lastForwardFromGroupName?.trim() ? ticket.lastForwardFromGroupName.trim() : null;
  return { when, from };
}
