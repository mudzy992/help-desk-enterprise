/**
 * Paket 5.4.2 (stavka 4): the read model of the audit webhook export for the
 * Security metrics card. It holds only numbers, a state word, the last error
 * code and timestamps - never the address, the secret or a response body.
 *
 * Kept free of Prisma and Nest imports so the rules are testable on their own.
 */

export type SecurityAuditWebhookStatusState = 'disabled' | 'ok' | 'failing';

export type SecurityAuditWebhookStatus = {
  readonly state: SecurityAuditWebhookStatusState;
  /** First failed delivery of the current streak, ISO time; `null` when nothing is pending. */
  readonly pendingSince: string | null;
  readonly pendingMinutes: number | null;
  readonly sentTotal: number;
  readonly failedTotal: number;
  readonly droppedTotal: number;
  readonly lastSuccessAt: string | null;
  /** Error code of the last failed delivery (`HTTP_500`, `TIMEOUT`, `NETWORK`, `INVALID_URL`), `null` after a success. */
  readonly lastErrorCode: string | null;
  readonly generatedAt: string;
};

export type AuditWebhookStatusStateRow = {
  readonly pendingSince: Date | null;
  readonly sentTotal: number;
  readonly failedTotal: number;
  readonly droppedTotal: number;
  readonly lastSuccessAt: Date | null;
  readonly lastErrorCode: string | null;
};

const minuteMs = 60_000;

export function buildAuditWebhookStatus(input: {
  readonly enabled: boolean;
  readonly now: Date;
  readonly state: AuditWebhookStatusStateRow | null;
}): SecurityAuditWebhookStatus {
  const { enabled, now, state } = input;
  // A switched-off export is not failing, even if a pending mark was left behind
  // (the delivery clears it on its next tick; this keeps the card honest meanwhile).
  const pendingSince = enabled ? (state?.pendingSince ?? null) : null;
  const stateWord: SecurityAuditWebhookStatusState = !enabled ? 'disabled' : pendingSince === null ? 'ok' : 'failing';
  return {
    state: stateWord,
    pendingSince: pendingSince === null ? null : pendingSince.toISOString(),
    pendingMinutes:
      pendingSince === null ? null : Math.max(0, Math.floor((now.getTime() - pendingSince.getTime()) / minuteMs)),
    sentTotal: state?.sentTotal ?? 0,
    failedTotal: state?.failedTotal ?? 0,
    droppedTotal: state?.droppedTotal ?? 0,
    lastSuccessAt: state?.lastSuccessAt ? state.lastSuccessAt.toISOString() : null,
    lastErrorCode: state?.lastErrorCode ?? null,
    generatedAt: now.toISOString(),
  };
}
