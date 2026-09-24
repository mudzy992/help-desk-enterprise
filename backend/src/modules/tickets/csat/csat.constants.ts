export const defaultTicketCsatConfiguration = {
  enabled: true,
  scaleMax: 5,
  askOnResolved: true,
  askOnClosed: false,
  samplingRate: 1,
} as const;

export const csatConstants = {
  minimumScaleMax: 2,
  maximumScaleMax: 10,
  maximumCommentLength: 2000,
} as const;

export const csatGuardrailFingerprint = 'csat_submit';

/**
 * Safety ceiling of the CSAT summary (phase 1.1). The read is already narrowed
 * to tickets that carry a CSAT submission, so it stays small in practice; the
 * ceiling only guarantees that the statement is bounded (`LIMIT n`) instead of
 * listing every visible ticket.
 */
export const csatSummaryTicketLimit = 20_000;
