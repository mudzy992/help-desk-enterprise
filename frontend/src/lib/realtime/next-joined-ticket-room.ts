export function nextJoinedTicketRoom(
  previousTicketId: string | null,
  nextTicketId: string | undefined,
): { readonly leave: string | null; readonly join: string | null } {
  const next = nextTicketId === undefined || nextTicketId.length === 0 ? null : nextTicketId;
  if (previousTicketId === next) {
    return { leave: null, join: null };
  }
  return { leave: previousTicketId, join: next };
}
