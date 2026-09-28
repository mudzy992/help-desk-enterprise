import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../modules/audit-log/audit-log.constants';
import { recordAuditEntry } from '../modules/audit-log/record-audit-entry';
import { readMfaEncryptionKey, readPreviousMfaEncryptionKey } from '../modules/authentication/security/mfa-secret-cipher';
import { reencryptMfaSecrets, type MfaReencryptStore } from '../modules/authentication/security/reencrypt-mfa-secrets';
import { readConfiguredInstallToken } from '../modules/install/install-token';
import { deriveReplyTokenSecret } from '../modules/notifications/email/reply-token';
import { deriveTombstoneKey } from '../modules/privacy/anonymization/tombstones';
import { deriveExportMasterKey } from '../modules/privacy/export/export-cipher';
import { formatPinnedSecret, readExplicitSecret } from '../common/security/read-explicit-secret';
import type { PrismaService } from '../common/prisma/prisma.service';

/*
  Secret rotation helper (ops/runbook/rotacija-tajni.md). Never prints a secret,
  except `pins`, whose whole purpose is to print the derived keys once.

    node dist/src/cli/secrets.js status
    node dist/src/cli/secrets.js pins
    node dist/src/cli/secrets.js reencrypt-mfa [--apply] [--reason "..."]

  Exit codes: 0 ok · 1 action needed / failed · 2 usage or configuration error.
*/

type Env = NodeJS.ProcessEnv;
type DependentKey = { readonly env: string; readonly label: string; readonly derive: (env: Env) => Buffer | null };

export const dependentKeys: readonly DependentKey[] = [
  { env: 'INBOUND_EMAIL_TOKEN_SECRET', label: 'reply tokens (2.3)', derive: deriveReplyTokenSecret },
  { env: 'PRIVACY_TOMBSTONE_KEY', label: 'anonymization tombstones (2.6)', derive: deriveTombstoneKey },
  { env: 'PRIVACY_EXPORT_KEY', label: 'export encryption (2.6)', derive: deriveExportMasterKey },
];

export function describeDependentKey(key: DependentKey, env: Env): 'pinned' | 'explicit' | 'derived' | 'missing' {
  const explicit = readExplicitSecret(env[key.env]);
  if (explicit !== null) return explicit.pinned ? 'pinned' : 'explicit';
  return key.derive(env) === null ? 'missing' : 'derived';
}

function prismaFromEnv(): PrismaClient | null {
  const connectionString = process.env.DATABASE_URL;
  return connectionString ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) }) : null;
}

function mfaStore(prisma: PrismaClient): MfaReencryptStore {
  return {
    listRows: (afterUserId, take) =>
      prisma.userMfa.findMany({
        where: {
          ...(afterUserId === null ? {} : { userId: { gt: afterUserId } }),
          OR: [{ secretEncrypted: { not: null } }, { pendingSecretEncrypted: { not: null } }],
        },
        select: { userId: true, secretEncrypted: true, pendingSecretEncrypted: true },
        orderBy: { userId: 'asc' },
        take,
      }),
    compareAndSet: async (userId, column, expected, next) => {
      const result = await prisma.userMfa.updateMany({
        where: { userId, [column]: expected },
        data: { [column]: next },
      });
      return result.count === 1;
    },
  };
}

async function status(env: Env): Promise<number> {
  let attention = 0;
  const say = (line: string) => console.log(line);
  const current = readMfaEncryptionKey(env.MFA_ENCRYPTION_KEY);
  const previous = readPreviousMfaEncryptionKey(env.MFA_ENCRYPTION_KEY_PREVIOUS);
  say(`MFA_ENCRYPTION_KEY           ${current === null ? 'MISSING or not 32 bytes' : 'ok'}`);
  say(`MFA_ENCRYPTION_KEY_PREVIOUS  ${env.MFA_ENCRYPTION_KEY_PREVIOUS?.trim() ? (previous === null ? 'INVALID (not 32 bytes)' : 'set (rotation in progress)') : 'not set'}`);
  if (current === null) attention += 1;
  for (const key of dependentKeys) {
    const state = describeDependentKey(key, env);
    const previousSet = key.env !== 'PRIVACY_EXPORT_KEY' && Boolean(env[`${key.env}_PREVIOUS`]?.trim());
    say(`${key.env.padEnd(28)} ${state}${previousSet ? ' (+ _PREVIOUS set)' : ''} — ${key.label}`);
    if (state === 'derived') {
      say(`  ! derived from MFA_ENCRYPTION_KEY: pin it (secrets.js pins) before rotating MFA_ENCRYPTION_KEY`);
      attention += 1;
    }
  }
  const install = readConfiguredInstallToken(env);
  say(`INSTALL_TOKEN                ${install === null ? 'not set (wizard closed — recommended after installation)' : 'set'}`);

  const prisma = prismaFromEnv();
  if (prisma === null) {
    say('DATABASE_URL not set — database checks skipped');
    return attention === 0 ? 0 : 1;
  }
  try {
    if (current !== null) {
      const report = await reencryptMfaSecrets({ store: mfaStore(prisma), currentKey: current, previousKey: previous, apply: false });
      say(`MFA secrets: current_key=${report.alreadyCurrent} previous_key=${report.reencrypted} unreadable=${report.unreadable.length}`);
      for (const row of report.unreadable) say(`  ! unreadable user=${row.userId} column=${row.column} (needs reset-mfa)`);
      if (report.reencrypted > 0 || report.unreadable.length > 0) attention += 1;
    }
    const erasures = await prisma.privacyErasure.count({ where: { status: 'COMPLETED', NOT: { tombstones: { isEmpty: true } } } });
    const readyExports = await prisma.privacyExport.count({ where: { status: 'READY', expiresAt: { gt: new Date() } } });
    say(`Completed erasures with tombstones: ${erasures}${erasures > 0 ? ' (rotating PRIVACY_TOMBSTONE_KEY needs PRIVACY_TOMBSTONE_KEY_PREVIOUS)' : ''}`);
    say(`Downloadable exports: ${readyExports}${readyExports > 0 ? ' (become unreadable if PRIVACY_EXPORT_KEY changes)' : ''}`);
  } finally {
    await prisma.$disconnect();
  }
  say(attention === 0 ? 'status=ok' : `status=attention (${attention})`);
  return attention === 0 ? 0 : 1;
}

function pins(env: Env): number {
  if (readMfaEncryptionKey(env.MFA_ENCRYPTION_KEY) === null) {
    console.error('MFA_ENCRYPTION_KEY is missing or not 32 bytes — nothing is derived, nothing to pin');
    return 2;
  }
  let printed = 0;
  console.error('# SENSITIVE: store these values in the secret store, then set them in the environment.');
  for (const key of dependentKeys) {
    const state = describeDependentKey(key, env);
    if (state !== 'derived') {
      console.error(`# ${key.env}: ${state} — no pin needed`);
      continue;
    }
    console.log(`${key.env}=${formatPinnedSecret(key.derive(env)!)}`);
    printed += 1;
  }
  if (printed === 0) console.error('# all dependent keys are already independent of MFA_ENCRYPTION_KEY');
  return 0;
}

async function reencryptMfa(env: Env, apply: boolean, reason: string | null): Promise<number> {
  const current = readMfaEncryptionKey(env.MFA_ENCRYPTION_KEY);
  const previous = readPreviousMfaEncryptionKey(env.MFA_ENCRYPTION_KEY_PREVIOUS);
  if (current === null) {
    console.error('MFA_ENCRYPTION_KEY (the NEW key) is missing or not 32 bytes');
    return 2;
  }
  if (previous === null) {
    console.error('MFA_ENCRYPTION_KEY_PREVIOUS (the OLD key) is missing or not 32 bytes');
    return 2;
  }
  if (previous.equals(current)) {
    console.error('MFA_ENCRYPTION_KEY_PREVIOUS equals MFA_ENCRYPTION_KEY — nothing to rotate');
    return 2;
  }
  if (apply && (!reason || reason.length < 5)) {
    console.error('--apply needs --reason "<at least 5 characters>"');
    return 2;
  }
  const prisma = prismaFromEnv();
  if (prisma === null) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  try {
    const report = await reencryptMfaSecrets({ store: mfaStore(prisma), currentKey: current, previousKey: previous, apply });
    console.log(
      `scanned=${report.scannedRows} already_current=${report.alreadyCurrent} ${apply ? 'reencrypted' : 'to_reencrypt'}=${report.reencrypted}` +
        ` concurrent_skip=${report.skippedConcurrentChange} unreadable=${report.unreadable.length}${apply ? '' : ' (dry run; add --apply)'}`,
    );
    for (const row of report.unreadable) console.log(`unreadable user=${row.userId} column=${row.column}`);
    if (apply) {
      await recordAuditEntry(prisma as unknown as PrismaService, {
        action: auditLogActions.securityMfaSecretsReencrypted,
        entityType: auditLogEntityTypes.securityKey,
        entityId: 'MFA_ENCRYPTION_KEY',
        actorUserId: null,
        metadata: {
          reason,
          via: 'server',
          reencrypted: report.reencrypted,
          alreadyCurrent: report.alreadyCurrent,
          unreadable: report.unreadable.length,
          concurrentSkip: report.skippedConcurrentChange,
        } as never,
      });
    }
    // Done only when nothing is left on the old key: a concurrent skip needs a re-run.
    return report.unreadable.length === 0 && report.skippedConcurrentChange === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

function readArgument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value.trim() : null;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command === 'status') return status(process.env);
  if (command === 'pins') return pins(process.env);
  if (command === 'reencrypt-mfa') return reencryptMfa(process.env, process.argv.includes('--apply'), readArgument('reason'));
  console.error('Usage: secrets <status | pins | reencrypt-mfa [--apply --reason "..."]>');
  return 2;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(`secrets failed: ${(error as Error).message}`);
      process.exit(1);
    });
}
