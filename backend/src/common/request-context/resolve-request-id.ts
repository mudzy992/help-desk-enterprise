import { randomUUID } from 'node:crypto';
import { readRequestIdHeader } from './read-request-id-header';

export function resolveRequestId(headers: unknown): string {
  return readRequestIdHeader(headers) ?? randomUUID();
}
