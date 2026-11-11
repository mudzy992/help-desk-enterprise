import type { InboundMessage } from './inbound-email.types';
import { normalizeAuthservId } from './normalize-authserv-id';

export type SenderAuthenticationVerdict = 'pass' | 'fail' | 'none';

function resultForMethod(results: string, method: 'dmarc' | 'spf' | 'dkim'): string | null {
  for (const segment of results.split(';')) {
    const match = /^\s*([a-z][a-z0-9_-]*)=([a-z]+)(?=\s|$)/iu.exec(segment);
    if (match?.[1].toLowerCase() === method) return match[2].toLowerCase();
  }
  return null;
}

/**
 * Trust only the first Authentication-Results header when its authserv-id is
 * the exact operator-configured receiver. ARC and Exchange's AuthAs shortcut
 * are intentionally not used: neither proves that the value was added by the
 * configured receiving server. The mail boundary must strip/overwrite
 * sender-supplied Authentication-Results headers or prepend its own result.
 */
export function checkSenderAuthentication(
  message: InboundMessage,
  trustedAuthservId: string,
): SenderAuthenticationVerdict {
  const trustedId = normalizeAuthservId(trustedAuthservId);
  if (trustedId === null) return 'none';

  const top = message.headers.get('authentication-results')?.[0];
  if (typeof top !== 'string') return 'none';
  const separator = top.indexOf(';');
  if (separator < 0) return 'none';

  const [headerAuthservId, version, ...extra] = top.slice(0, separator).trim().split(/\s+/u);
  if (
    headerAuthservId === undefined ||
    extra.length > 0 ||
    (version !== undefined && !/^\d+$/u.test(version)) ||
    normalizeAuthservId(headerAuthservId) !== trustedId
  ) {
    return 'none';
  }

  const results = top.slice(separator + 1);
  const dmarc = resultForMethod(results, 'dmarc');
  if (dmarc === 'pass' || dmarc === 'bestguesspass') return 'pass';
  const spf = resultForMethod(results, 'spf');
  const dkim = resultForMethod(results, 'dkim');
  if (spf === 'pass' && dkim === 'pass') return 'pass';
  if (dmarc === 'fail' || spf === 'fail' || dkim === 'fail') return 'fail';
  return 'none';
}
