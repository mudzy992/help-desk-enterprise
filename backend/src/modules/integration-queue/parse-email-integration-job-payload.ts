import type { EmailIntegrationJobPayload } from './integration-queue.types';

export function parseEmailIntegrationJobPayload(
  value: unknown,
): EmailIntegrationJobPayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.userId !== 'string' ||
    typeof record.toAddress !== 'string' ||
    typeof record.subject !== 'string' ||
    typeof record.text !== 'string' ||
    typeof record.templateKey !== 'string' ||
    typeof record.dedupeKey !== 'string'
  ) {
    return null;
  }
  return {
    userId: record.userId,
    toAddress: record.toAddress,
    subject: record.subject,
    text: record.text,
    templateKey: record.templateKey,
    dedupeKey: record.dedupeKey,
  };
}
