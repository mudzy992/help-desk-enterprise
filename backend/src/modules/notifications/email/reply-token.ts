import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/*
  Paket 2.3 (R4): the Message-ID of an outgoing ticket e-mail carries a signed
  reply token, so the reply's In-Reply-To / References identify the ticket and
  the original recipient without trusting the subject line.

    <r.<ticketId>.<recipientId>.<nonce>.<signature>@<domain>>

  nonce     = first 10 hex of sha256(dedupeKey:recipientId) → unique per event
  signature = first 20 hex of HMAC-SHA256(secret, "r.<ticketId>.<recipientId>.<nonce>")

  Secret: INBOUND_EMAIL_TOKEN_SECRET, or derived (HKDF) from MFA_ENCRYPTION_KEY.
  Without either, the old unsigned Message-ID is used and replies are matched
  by the ticket number in the subject only.
*/

const idPattern = /^[a-z0-9]{8,40}$/i;
const tokenPattern = /<?r\.([a-z0-9]{8,40})\.([a-z0-9]{8,40})\.([0-9a-f]{10})\.([0-9a-f]{20})@[^>\s]+>?/gi;

export function readReplyTokenSecret(environment: NodeJS.Dict<string> = process.env): Buffer | null {
  const explicit = environment.INBOUND_EMAIL_TOKEN_SECRET?.trim();
  if (explicit !== undefined && explicit.length >= 16) {
    return Buffer.from(explicit, 'utf8');
  }
  const mfa = environment.MFA_ENCRYPTION_KEY?.trim();
  if (mfa === undefined || mfa.length === 0) return null;
  const key = Buffer.from(mfa, 'base64');
  if (key.length !== 32) return null;
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'ephelpdesk-inbound-reply-token', 32));
}

function sign(secret: Buffer, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex').slice(0, 20);
}

export function createReplyTokenMessageId(input: {
  readonly secret: Buffer;
  readonly ticketId: string;
  readonly recipientId: string;
  readonly dedupeKey: string;
  readonly domain: string;
}): string | null {
  if (!idPattern.test(input.ticketId) || !idPattern.test(input.recipientId)) return null;
  const nonce = createHash('sha256').update(`${input.dedupeKey}:${input.recipientId}`).digest('hex').slice(0, 10);
  const payload = `r.${input.ticketId}.${input.recipientId}.${nonce}`;
  return `<${payload}.${sign(input.secret, payload)}@${input.domain}>`;
}

export type VerifiedReplyToken = { readonly ticketId: string; readonly recipientId: string };

/** Scans header values (In-Reply-To, References) for the first valid token. */
export function findReplyToken(headerValues: readonly string[], secret: Buffer | null): VerifiedReplyToken | null {
  if (secret === null) return null;
  for (const value of headerValues) {
    for (const match of value.matchAll(tokenPattern)) {
      const [, ticketId, recipientId, nonce, signature] = match as unknown as [string, string, string, string, string];
      const expected = Buffer.from(sign(secret, `r.${ticketId}.${recipientId}.${nonce}`), 'utf8');
      const actual = Buffer.from(signature.toLowerCase(), 'utf8');
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
        return { ticketId, recipientId };
      }
    }
  }
  return null;
}

/** The stable thread root of 1.5 (`<ticket-<id>@domain>`), unsigned. */
export function findThreadRootTicketId(headerValues: readonly string[]): string | null {
  for (const value of headerValues) {
    const match = /<ticket-([a-z0-9]{8,40})@[^>\s]+>/i.exec(value);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}
