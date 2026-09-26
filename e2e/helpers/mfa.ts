import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/*
  Paket 2.1: SUPER_ADMIN must use two-step verification, so the E2E harness
  enrols the test super admin once (global setup) and keeps the TOTP secret in
  a git-ignored file. Codes are computed here (RFC 6238, SHA-1, 6 digits, 30 s).

  The server refuses a time step at or before the last one used (replay
  protection) and accepts ±1 step, so up to two sign-ins fit in one 30 s
  window; a third one waits for the next step.
*/
const STORE = path.resolve(__dirname, '..', '.auth', 'mfa.json');
const PERIOD_MS = 30_000;

type Entry = { secret: string; lastStep: number };
type Store = Record<string, Entry>;

function readStore(): Store {
  if (!existsSync(STORE)) return {};
  try {
    return JSON.parse(readFileSync(STORE, 'utf8')) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  mkdirSync(path.dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(store, null, 2));
}

export function saveMfaSecret(email: string, secret: string, usedStep: number): void {
  const store = readStore();
  store[email.toLowerCase()] = { secret, lastStep: usedStep };
  writeStore(store);
}

export function readMfaSecret(email: string): string | null {
  return readStore()[email.toLowerCase()]?.secret ?? process.env.E2E_SUPERADMIN_TOTP_SECRET ?? null;
}

function decodeBase32(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpForStep(secret: string, step: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

export function currentStep(): number {
  return Math.floor(Date.now() / PERIOD_MS);
}

/** Next unused code for the account; waits for a new time step when needed. */
export async function nextTotpCode(email: string): Promise<string> {
  const secret = readMfaSecret(email);
  if (secret === null) {
    throw new Error(`[e2e] no TOTP secret for ${email} — run global setup or set E2E_SUPERADMIN_TOTP_SECRET`);
  }
  const store = readStore();
  const lastStep = store[email.toLowerCase()]?.lastStep ?? -1;
  let step = Math.max(currentStep(), lastStep + 1);
  if (step > currentStep() + 1) {
    await new Promise((resolve) => setTimeout(resolve, (step - 1) * PERIOD_MS - Date.now() + 250));
    step = Math.max(currentStep(), lastStep + 1);
  }
  store[email.toLowerCase()] = { secret, lastStep: step };
  writeStore(store);
  return totpForStep(secret, step);
}
