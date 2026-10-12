#!/usr/bin/env node
/*
  Rotates the E2E actor passwords and stores them as repository secrets.

  Why this exists (5.4.0-f, first full E2E run): since 5.4.0-d every new password
  is checked against the Pwned Passwords range API (`private.security.hibp.enabled`,
  default ON). A configured password that appears in a breach corpus is refused
  with `400 INVALID_PASSWORD { violations: ['PWNED_PASSWORD'] }`, so global setup
  died on the harness's own reset. The harness now falls back to a generated
  password (e2e/helpers/actor-passwords.ts) — this script is the operator side of
  the same problem: pick values the deployment has no reason to refuse, once, and
  put them where the E2E job reads them.

  What it does:
    1. generates one password per actor (24 characters, all four classes, no
       `I`/`O`/`l`/`1`/`0`) that cannot collide with the offline rules: it avoids
       the product words, the parts of the account's own e-mail address (>= 4
       characters, compared after all punctuation is stripped — exactly how
       `password-policy.ts` compares them) and the label of the account's domain;
    2. writes it with `gh secret set <NAME>` (value on **stdin**, never in argv,
       never in the shell history, never printed);
    3. removes the local fallback store `e2e/.auth/actor-passwords.json`, which
       would otherwise keep a local run on an older generated value;
    4. prints only what is safe to print: the secret names, the lengths and the
       command to verify.

  What it does NOT do: the password in the database is **not** touched. The
  harness sets it on the next run — `restoreTestActorPassword` tries the new
  value, the sign-in fails, and it completes the documented admin path
  (`POST /users/:id/reset-password` + the forced change). Until an E2E run
  happens, the database still holds the old password; that is normal and needs
  no manual step.

  Usage (from the repository root):
    node scripts/rotate-e2e-actor-passwords.mjs                 # both actors
    node scripts/rotate-e2e-actor-passwords.mjs --only user
    node scripts/rotate-e2e-actor-passwords.mjs --dry-run
    node scripts/rotate-e2e-actor-passwords.mjs --repo owner/name
    node scripts/rotate-e2e-actor-passwords.mjs --print-values  # explicit, warns

  Requires `gh` (authenticated) with permission to write repository secrets.
*/

import { randomInt } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** The two actors global setup provisions; their e-mail may be overridden by env. */
export const actorSecretNames = {
  user: { secret: 'E2E_USER_PASSWORD', emailEnv: 'E2E_USER_EMAIL', defaultEmail: 'e2e.user@example.com' },
  agent: { secret: 'E2E_AGENT_PASSWORD', emailEnv: 'E2E_AGENT_EMAIL', defaultEmail: 'e2e.agent@example.com' },
};

/** Product-neutral words the offline rules always refuse (`password-policy.ts`). */
export const genericAvoidWords = ['helpdesk', 'servicedesk', 'lozinka', 'password'];

/** How long the generated password is; inside every bound of the policy (12–64). */
export const generatedPasswordLength = 24;

const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const lower = 'abcdefghijkmnopqrstuvwxyz';
const digits = '23456789';
const symbols = '!@#$%^&*-_=+?';
const alphabet = `${upper}${lower}${digits}${symbols}`;

/**
 * The words a password for this address must not contain. Mirrors the rules in
 * `backend/src/modules/authentication/security/password-policy.ts`:
 *  - the local part is split on `.`, `_` and `-`, and every piece of 4+ characters
 *    must be absent;
 *  - the domain label (`example.com` → `example`) comes from the internal-domain
 *    list the settings build into the organisation words.
 * The comparison happens on the compacted password (lower-case, punctuation
 * removed), because that is how the server compares it.
 */
export function avoidWordsForEmail(email) {
  const [localPart = '', domain = ''] = email.trim().toLowerCase().split('@');
  const nameParts = localPart.split(/[._-]+/).filter((part) => part.length >= 4);
  const domainLabel = domain.split('.')[0] ?? '';
  return [...new Set([...genericAvoidWords, ...nameParts, ...(domainLabel.length >= 4 ? [domainLabel] : [])])];
}

/** Compacted the way the policy compares: lower-case, punctuation and spaces gone. */
export function compactForComparison(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pick(from) {
  return from[randomInt(0, from.length)] ?? '';
}

/**
 * One password: 24 characters, at least one of every class, no `I`/`O`/`l`/`1`/`0`
 * (an operator may have to type it into a browser), and none of the avoided
 * words in the compacted form.
 */
export function generateActorPassword(avoidWords = genericAvoidWords) {
  const words = avoidWords.map((word) => word.trim().toLowerCase()).filter((word) => word.length > 0);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const characters = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    while (characters.length < generatedPasswordLength) characters.push(pick(alphabet));
    for (let index = characters.length - 1; index > 0; index -= 1) {
      const swap = randomInt(0, index + 1);
      const current = characters[index] ?? '';
      characters[index] = characters[swap] ?? '';
      characters[swap] = current;
    }
    const candidate = characters.join('');
    const compact = compactForComparison(candidate);
    if (!words.some((word) => compact.includes(word))) return candidate;
  }
  throw new Error('could not generate a password free of the avoided words');
}

/** `git@github.com:owner/name.git` / `https://github.com/owner/name` → `owner/name`. */
export function resolveRepoSlug(remoteUrl) {
  const trimmed = String(remoteUrl).trim().replace(/\.git$/, '');
  const ssh = trimmed.match(/^[^@]+@[^:]+:(.+)$/);
  const candidate = ssh ? ssh[1] : trimmed.replace(/^[a-z+]+:\/\/([^/]+)\//i, '');
  const cleaned = (candidate ?? '').replace(/^\/+|\/+$/g, '');
  return cleaned.split('/').slice(-2).join('/');
}

function run(command, args, input) {
  return spawnSync(command, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function resolveRepo() {
  const explicit = readArgument('--repo');
  if (explicit !== null && explicit.length > 0) return explicit;
  const remote = run('git', ['remote', 'get-url', 'origin']);
  if (remote.status !== 0 || (remote.stdout ?? '').trim().length === 0) {
    throw new Error('could not read `git remote get-url origin`; pass --repo owner/name');
  }
  return resolveRepoSlug(remote.stdout);
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const printValues = process.argv.includes('--print-values');
  const keepLocalStore = process.argv.includes('--keep-local-store');
  const only = readArgument('--only');
  const targets = Object.entries(actorSecretNames).filter(([key]) => only === null || only === key);
  if (targets.length === 0) {
    throw new Error(`--only expects one of: ${Object.keys(actorSecretNames).join(', ')}`);
  }
  const repo = dryRun && readArgument('--repo') === null ? null : resolveRepo();

  if (!dryRun) {
    const auth = run('gh', ['auth', 'status']);
    if (auth.status !== 0) {
      throw new Error('`gh auth status` failed — sign in with `gh auth login` first');
    }
  }

  for (const [actor, entry] of targets) {
    const email = process.env[entry.emailEnv]?.trim() || entry.defaultEmail;
    const password = generateActorPassword(avoidWordsForEmail(email));
    const avoid = avoidWordsForEmail(email);
    if (dryRun) {
      console.log(`[dry-run] ${entry.secret} (${actor}, ${email}): would set ${password.length} characters; avoiding ${avoid.join(', ')}`);
      continue;
    }
    if (printValues) {
      console.log(`[print] ${entry.secret}=${password}`);
    }
    // The value travels on stdin: it never appears in argv, in the shell history
    // and in `gh`'s own output.
    const result = run('gh', ['secret', 'set', entry.secret, '--repo', repo], password);
    if (result.status !== 0) {
      throw new Error(
        `gh secret set ${entry.secret} failed: ${(result.stderr ?? '').trim() || `exit ${result.status}`}`,
      );
    }
    console.log(`✔ ${entry.secret} updated (${actor}, ${email}, ${password.length} characters)`);
  }

  if (dryRun) {
    console.log('\nDry run: nothing was written. Run again without --dry-run to store the secrets.');
    return;
  }

  const store = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'e2e', '.auth', 'actor-passwords.json');
  if (existsSync(store)) {
    if (keepLocalStore) {
      console.log(`• kept ${path.relative(process.cwd(), store)} (--keep-local-store): a local run would keep using its recorded password`);
    } else {
      rmSync(store, { force: true });
      console.log(`• removed ${path.relative(process.cwd(), store)} so a local run picks up the new secret`);
    }
  }

  console.log(
    [
      '',
      'Next:',
      '  • The database is untouched — the actors still hold their old password.',
      '    The next E2E run re-sets them through the documented admin path',
      '    (POST /users/:id/reset-password + the forced change), because the new',
      '    value cannot sign in yet. Nothing to do by hand.',
      `  • To sync right now, run global setup locally:  cd e2e && npx playwright test tests/39-login-session-flow.spec.ts`,
      `  • Verify the secret names:  gh secret list --repo ${repo}`,
      '  • Then dispatch CI with an empty `specs` input (full run).',
    ].join('\n'),
  );
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  try {
    main();
  } catch (error) {
    console.error(`rotate-e2e-actor-passwords: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
