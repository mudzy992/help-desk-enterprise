export const guardrailModes = ['warn_only', 'soft_block'] as const;
export type GuardrailMode = (typeof guardrailModes)[number];

export const guardrailClaimKinds = {
  automation: 'automation',
  event: 'event',
} as const;
export type GuardrailClaimKind =
  (typeof guardrailClaimKinds)[keyof typeof guardrailClaimKinds];

export const defaultTicketGuardrailsConfiguration = {
  enabled: true,
  duplicateWindowMinutes: 2,
  similarityThreshold: 0.9,
  mode: 'warn_only' as GuardrailMode,
  confirmAboveRecipients: 200,
  maxRepeatsPerSubject: 3,
} as const;

export const disabledTicketGuardrailsConfiguration = {
  ...defaultTicketGuardrailsConfiguration,
  enabled: false,
} as const;
