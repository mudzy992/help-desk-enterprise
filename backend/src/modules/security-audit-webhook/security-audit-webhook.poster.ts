import {
  securityAuditWebhookHeaders,
  securityAuditWebhookTimeoutMilliseconds,
} from './security-audit-webhook.constants';
import { signAuditWebhookBody } from './security-audit-webhook.batch';

export type AuditWebhookPostResult = { readonly ok: true } | { readonly ok: false; readonly code: string };

export type AuditWebhookPoster = (input: {
  readonly url: string;
  readonly secret: string;
  readonly body: string;
  readonly now: Date;
}) => Promise<AuditWebhookPostResult>;

export type AuditWebhookFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Posts one signed batch. Failures are reduced to a short code (HTTP_<status>,
 * TIMEOUT, NETWORK, INVALID_URL): the response body, the URL and the secret are
 * never logged or stored. Redirects are refused so a receiver cannot bounce the
 * signed request to another host.
 */
export function createAuditWebhookPoster(fetchImpl: AuditWebhookFetch = fetch): AuditWebhookPoster {
  return async ({ url, secret, body, now }) => {
    if (!isValidAuditWebhookUrl(url)) return { ok: false, code: 'INVALID_URL' };
    const timestampSeconds = Math.floor(now.getTime() / 1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), securityAuditWebhookTimeoutMilliseconds);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          [securityAuditWebhookHeaders.timestamp]: String(timestampSeconds),
          [securityAuditWebhookHeaders.signature]: `sha256=${signAuditWebhookBody(secret, timestampSeconds, body)}`,
        },
        body,
      });
      await response.body?.cancel().catch(() => undefined);
      if (response.status >= 200 && response.status < 300) return { ok: true };
      return { ok: false, code: `HTTP_${response.status}` };
    } catch (error) {
      return {
        ok: false,
        code: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

export function isValidAuditWebhookUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.username === '' && parsed.password === ''
    );
  } catch {
    return false;
  }
}
