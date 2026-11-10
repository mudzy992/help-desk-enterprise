/** A new card may have been created; replay without reconciliation can duplicate it. */
export class TeamsDeliveryOutcomeUnknownError extends Error {
  constructor() {
    super('Teams delivery outcome is unknown; automatic resend is blocked.');
    this.name = TeamsDeliveryOutcomeUnknownError.name;
  }
}
