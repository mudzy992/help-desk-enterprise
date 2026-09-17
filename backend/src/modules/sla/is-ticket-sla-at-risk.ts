type TicketSlaAtRiskFlags = {
  readonly isResponseAtRisk: boolean;
  readonly isResolutionAtRisk: boolean;
  readonly isResponseBreached?: boolean;
  readonly isResolutionBreached?: boolean;
};

export function isTicketSlaAtRisk(
  state: TicketSlaAtRiskFlags | null | undefined,
): boolean {
  if (state === null || state === undefined) {
    return false;
  }
  if (state.isResponseBreached === true || state.isResolutionBreached === true) {
    return false;
  }
  return state.isResponseAtRisk || state.isResolutionAtRisk;
}
