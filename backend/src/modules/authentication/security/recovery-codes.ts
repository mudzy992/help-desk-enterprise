import { createHash, randomInt } from 'node:crypto';

/** Paket 2.1 (M4): 10 single-use codes "xxxxx-xxxxx", stored as SHA-256. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i
export const recoveryCodeCount = 10;

export function generateRecoveryCodes(count: number = recoveryCodeCount): string[] {
  return Array.from({ length: count }, () => {
    let code = '';
    for (let index = 0; index < 10; index += 1) {
      code += ALPHABET[randomInt(ALPHABET.length)];
    }
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

export function normalizeRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashRecoveryCode(input: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(input)).digest('hex');
}

export function looksLikeRecoveryCode(input: string): boolean {
  return normalizeRecoveryCode(input).length === 10 && /[a-z]/.test(normalizeRecoveryCode(input));
}
