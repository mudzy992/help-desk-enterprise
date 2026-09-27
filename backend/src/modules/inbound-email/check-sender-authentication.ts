import type { InboundMessage } from './inbound-email.types';

export type SenderAuthenticationVerdict = 'pass' | 'fail' | 'none';

/**
 * Paket 2.3 (R5): reads `Authentication-Results` added by the receiving
 * server (Exchange Online, Gmail). Pass = DMARC pass, or SPF pass + DKIM pass.
 * Exchange Online marks internal mail with `X-MS-Exchange-Organization-AuthAs:
 * Internal`, which also counts as pass. Only the topmost results header is
 * trusted (the one added by our own mail server).
 */
export function checkSenderAuthentication(message: InboundMessage): SenderAuthenticationVerdict {
  const authAs = (message.headers.get('x-ms-exchange-organization-authas') ?? [])[0]?.toLowerCase();
  if (authAs === 'internal') return 'pass';
  const results = message.headers.get('authentication-results') ?? message.headers.get('arc-authentication-results');
  const top = results?.[0]?.toLowerCase();
  if (top === undefined) return 'none';
  const verdict = (method: string) => new RegExp(`\\b${method}=([a-z]+)`).exec(top)?.[1] ?? null;
  const dmarc = verdict('dmarc');
  if (dmarc === 'pass' || dmarc === 'bestguesspass') return 'pass';
  if (verdict('spf') === 'pass' && verdict('dkim') === 'pass') return 'pass';
  if (dmarc === 'fail' || verdict('spf') === 'fail' || verdict('dkim') === 'fail') return 'fail';
  return 'none';
}
