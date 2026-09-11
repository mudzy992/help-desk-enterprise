import type { GuardrailClaimKind, GuardrailMode } from './guardrails.constants';

export type TicketGuardrailsConfiguration = {
  readonly enabled: boolean;
  readonly duplicateWindowMinutes: number;
  readonly similarityThreshold: number;
  readonly mode: GuardrailMode;
  readonly confirmAboveRecipients: number;
  readonly maxRepeatsPerSubject: number;
};

export type DuplicateTicketMatch = {
  readonly ticketId: string;
  readonly ticketNumber: string;
  readonly similarity: number;
};

export type GuardrailClaimInput = {
  readonly kind: GuardrailClaimKind;
  readonly subjectKey: string;
  readonly fingerprint: string;
  readonly ticketId?: string | null;
  readonly actorUserId?: string | null;
  readonly now?: Date;
};

export type GuardrailClaimDecision = {
  readonly allowed: boolean;
  readonly reason: 'claimed' | 'duplicate' | 'loop' | 'disabled';
};

export type GuardrailClaimRecord = {
  readonly id: string;
  readonly kind: string;
  readonly subjectKey: string;
  readonly fingerprint: string;
  readonly ticketId: string | null;
  readonly actorUserId: string | null;
  readonly claimedAt: Date;
  readonly expiresAt: Date | null;
};
