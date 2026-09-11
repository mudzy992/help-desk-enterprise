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
