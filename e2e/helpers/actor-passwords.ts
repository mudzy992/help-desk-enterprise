import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/*
  Paket 5.4.0-f (fix after the first full E2E run): a deployment wrote a password
  through the forced-change screen and the server answered

    INVALID_PASSWORD { violations: ['PWNED_PASSWORD'] }

  because since 5.4.0-d a new password is checked against the Pwned Passwords
  range API (`private.security.hibp.enabled`, **default ON**). The harness used
  to assume the configured actor password is always accepted, so global setup
  died the moment the deployment had the check on and the configured value was
  in the breach corpus.

  Falling back to a generated password is the honest way out: the value still has
  to pass every rule the deployment enforces (length, offline blocklist, e-mail
  and organisation words, history, and the range check) — it is only chosen so
  that no corpus contains it. A refused configured password is never masked: the
  run logs a warning naming the actor and the violation, so a stale secret stays
  visible.

  The value lives under `.auth/` (git-ignored, the same place the TOTP secret
  lives) and only for that one run; `readE2EEnvironment()` prefers it over the
  configured value, which is what keeps every sign-in of the run consistent.
*/

const STORE = path.resolve(__dirname, '..', '.auth', 'actor-passwords.json');

type Store = Record<string, string>;

function readStore(): Store {
  if (!existsSync(STORE)) return {};
  try {
    const parsed = JSON.parse(readFileSync(STORE, 'utf8')) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

/** The password this run had to set for the actor, or null when none was needed. */
export function readRecordedActorPassword(email: string): string | null {
  const value = readStore()[email.trim().toLowerCase()];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Remembers a generated password so the whole run uses one value. Never logged. */
export function recordActorPassword(email: string, password: string): void {
  const store = readStore();
  store[email.trim().toLowerCase()] = password;
  mkdirSync(path.dirname(STORE), { recursive: true });
  writeFileSync(STORE, `${JSON.stringify(store, null, 2)}\n`);
}

/** How many generated candidates to try before giving up on an actor. */
export const generatedPasswordAttempts = 3;

const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const lower = 'abcdefghijkmnopqrstuvwxyz';
const digits = '23456789';
const symbols = '!@#$%^&*-_=+?';
const alphabet = `${upper}${lower}${digits}${symbols}`;

function pick(from: string): string {
  return from[randomInt(0, from.length)] ?? '';
}

/**
 * A 32-character password with at least one character of every class.
 *
 * Note the letters that are out (`I`, `O`, `l`, `1`, `0`): an operator who has
 * to type one of these passwords by hand should not be able to confuse them.
 * The password is never printed by the harness — it goes straight into the
 * store file and the API calls.
 */
export function generateActorPassword(): string {
  const length = 32;
  const characters = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (characters.length < length) {
    characters.push(pick(alphabet));
  }
  // Fisher–Yates, so the guaranteed classes are not always in the first slots.
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomInt(0, index + 1);
    const current = characters[index] ?? '';
    characters[index] = characters[swap] ?? '';
    characters[swap] = current;
  }
  return characters.join('');
}
