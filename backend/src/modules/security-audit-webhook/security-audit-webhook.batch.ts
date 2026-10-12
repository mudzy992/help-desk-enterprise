import { createHmac } from 'node:crypto';
import {
  securityAuditWebhookActionPrefixes,
  securityAuditWebhookSchemaVersion,
} from './security-audit-webhook.constants';

export type AuditWebhookCursor = {
  readonly createdAt: Date;
  readonly id: string;
};

export type AuditWebhookRow = {
  readonly id: string;
  readonly createdAt: Date;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorUserId: string | null;
  readonly requestId: string | null;
  readonly metadata: unknown;
};

/** Before any row exists the cursor sits at the epoch, so every later row is after it. */
export const auditWebhookEpochCursor: AuditWebhookCursor = {
  createdAt: new Date(0),
  id: '',
};

export function isAuditWebhookAction(action: string): boolean {
  return securityAuditWebhookActionPrefixes.some((prefix) => action.startsWith(prefix));
}

export function cursorOfRow(row: AuditWebhookRow): AuditWebhookCursor {
  return { createdAt: row.createdAt, id: row.id };
}

export function sameCursor(a: AuditWebhookCursor | null, b: AuditWebhookCursor | null): boolean {
  if (a === null || b === null) return a === b;
  return a.createdAt.getTime() === b.createdAt.getTime() && a.id === b.id;
}

/**
 * The body is the JSON that is signed, byte for byte. Every event carries its
 * audit row id, so the receiver can drop duplicates after a retry.
 */
export function buildAuditWebhookBatch(rows: readonly AuditWebhookRow[], sentAt: Date): string {
  return JSON.stringify({
    schemaVersion: securityAuditWebhookSchemaVersion,
    source: 'help-desk-enterprise',
    sentAt: sentAt.toISOString(),
    events: rows.map((row) => ({
      id: row.id,
      occurredAt: row.createdAt.toISOString(),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId,
      requestId: row.requestId,
      metadata: row.metadata ?? null,
    })),
  });
}

/** HMAC-SHA256 over `timestamp + "." + body`, hex encoded. The timestamp is in seconds. */
export function signAuditWebhookBody(secret: string, timestampSeconds: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
}
