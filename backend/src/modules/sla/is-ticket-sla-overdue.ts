type TicketSlaOverdueFlags = {
  readonly isResponseBreached: boolean;
  readonly isResolutionBreached: boolean;
};

export function isTicketSlaOverdue(
  state: TicketSlaOverdueFlags | null | undefined,
): boolean {
  if (state === null || state === undefined) {
    return false;
  }
  return state.isResponseBreached || state.isResolutionBreached;
}
