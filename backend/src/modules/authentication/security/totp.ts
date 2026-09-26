import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { decodeBase32, encodeBase32 } from './base32';

/*
  Paket 2.1 (M1): TOTP per RFC 6238 (HOTP RFC 4226) — SHA-1, 6 digits, 30 s,
  ±1 step. These are the only parameters every authenticator app supports.
*/
export const totpParameters = {
  digits: 6,
  periodSeconds: 30,
  window: 1,
  secretBytes: 20,
} as const;

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(totpParameters.secretBytes));
}

export function totpStep(nowMilliseconds: number): number {
  return Math.floor(nowMilliseconds / 1000 / totpParameters.periodSeconds);
}

export function hotp(secret: Buffer, counter: number, digits: number = totpParameters.digits): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpCode(base32Secret: string, nowMilliseconds: number): string {
  return hotp(decodeBase32(base32Secret), totpStep(nowMilliseconds));
}

/**
 * Returns the matched time step, or null. A step at or before `lastUsedStep`
 * is refused, so a code (or an older one) can never be replayed.
 */
export function verifyTotp(input: {
  readonly base32Secret: string;
  readonly code: string;
  readonly nowMilliseconds: number;
  readonly lastUsedStep: number | null;
}): number | null {
  const code = input.code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const secret = decodeBase32(input.base32Secret);
  const current = totpStep(input.nowMilliseconds);
  for (let delta = -totpParameters.window; delta <= totpParameters.window; delta += 1) {
    const step = current + delta;
    if (input.lastUsedStep !== null && step <= input.lastUsedStep) {
      continue;
    }
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))) {
      return step;
    }
  }
  return null;
}

export function buildOtpauthUri(input: {
  readonly issuer: string;
  readonly accountName: string;
  readonly base32Secret: string;
}): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.accountName)}`;
  const query = new URLSearchParams({
    secret: input.base32Secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(totpParameters.digits),
    period: String(totpParameters.periodSeconds),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
