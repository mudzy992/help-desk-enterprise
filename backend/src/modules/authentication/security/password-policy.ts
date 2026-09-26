import { dictionary } from '@zxcvbn-ts/language-common';

/*
  Paket 2.1 (M7): local password rules. The blocklist is offline — ~49 000
  common passwords (zxcvbn-ts "passwords-common", MIT) plus organisation
  words and parts of the user's own e-mail. Nothing leaves the network.
*/
export type PasswordPolicy = {
  readonly minLength: number;
  readonly maxLength: number;
  readonly blocklistEnabled: boolean;
};

export type PasswordViolation =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'BLANK'
  | 'SAME_AS_EMAIL'
  | 'COMMON_PASSWORD'
  | 'CONTAINS_ORGANISATION_WORD'
  | 'CONTAINS_EMAIL_NAME';

const ORGANISATION_WORDS = ['epbih', 'elektroprivreda', 'helpdesk', 'ephelpdesk', 'lozinka', 'password'];

let common: Set<string> | null = null;
function commonPasswords(): Set<string> {
  if (common === null) {
    const list = (dictionary as Record<string, readonly string[]>)['passwords-common'] ?? [];
    common = new Set(list.map((entry) => entry.toLowerCase()));
  }
  return common;
}

/** Strips trailing digits/symbols: "Summer2026!" → "summer". */
function stem(value: string): string {
  return value.toLowerCase().replace(/[^a-z]+$/g, '').replace(/^[^a-z]+/g, '');
}

export function checkPassword(password: string, email: string, policy: PasswordPolicy): PasswordViolation[] {
  const violations: PasswordViolation[] = [];
  if (!/\S/.test(password)) violations.push('BLANK');
  if (password.length < policy.minLength) violations.push('TOO_SHORT');
  if (password.length > policy.maxLength) violations.push('TOO_LONG');
  const lower = password.toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (lower === normalizedEmail) violations.push('SAME_AS_EMAIL');
  if (policy.blocklistEnabled) {
    const set = commonPasswords();
    if (set.has(lower) || set.has(stem(password))) violations.push('COMMON_PASSWORD');
    const compact = lower.replace(/[^a-z0-9]/g, '');
    if (ORGANISATION_WORDS.some((word) => compact.includes(word))) violations.push('CONTAINS_ORGANISATION_WORD');
    const localPart = normalizedEmail.split('@')[0] ?? '';
    const nameParts = localPart.split(/[._-]+/).filter((part) => part.length >= 4);
    if (nameParts.some((part) => compact.includes(part))) violations.push('CONTAINS_EMAIL_NAME');
  }
  return violations;
}
