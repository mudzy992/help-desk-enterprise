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
  const headers = readHeaders(record.headers);
  return {
    userId: record.userId,
    toAddress: record.toAddress,
    subject: record.subject,
    text: record.text,
    templateKey: record.templateKey,
    dedupeKey: record.dedupeKey,
    ...(typeof record.html === 'string' ? { html: record.html } : {}),
    ...(typeof record.replyTo === 'string' ? { replyTo: record.replyTo } : {}),
    ...(typeof record.messageId === 'string' ? { messageId: record.messageId } : {}),
    ...(headers === null ? {} : { headers }),
  };
}

function readHeaders(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const result: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value)) {
    // Only safe header names/values survive a round trip through the queue.
    if (/^[A-Za-z][A-Za-z0-9-]*$/.test(name) && typeof headerValue === 'string' && !/[\r\n]/.test(headerValue)) {
      result[name] = headerValue;
    }
  }
  return result;
}
