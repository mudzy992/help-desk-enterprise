export function matchesTicketListSearchQuery(
  ticket: { readonly ticketNumber: string; readonly title: string },
  query: string | undefined,
): boolean {
  const needle = query?.trim().toLowerCase() ?? '';
  if (needle.length === 0) {
    return true;
  }
  return (
    ticket.ticketNumber.toLowerCase().includes(needle) ||
    ticket.title.toLowerCase().includes(needle)
  );
}
