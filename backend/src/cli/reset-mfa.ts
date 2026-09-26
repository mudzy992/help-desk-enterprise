import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { createRedisClient } from '../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../common/redis/load-redis-configuration';
import { auditLogActions, auditLogEntityTypes } from '../modules/audit-log/audit-log.constants';
import { recordAuditEntry } from '../modules/audit-log/record-audit-entry';
import { authenticationConstants } from '../modules/authentication/authentication.constants';
import { SessionRevocationStore } from '../modules/authentication/session-revocation.store';
import type { PrismaService } from '../common/prisma/prisma.service';

/*
  Paket 2.1 (M5): server-side MFA reset — the way back in when the only
  SUPER_ADMIN lost the authenticator and every recovery code. Requires shell
  access to the backend container, which is the trust boundary here.

    node dist/src/cli/reset-mfa.js --email admin@firma.ba --reason "izgubljen telefon"
*/

function readArgument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value.trim() : null;
}

async function main(): Promise<number> {
  const email = readArgument('email')?.toLowerCase() ?? null;
  const reason = readArgument('reason');
  if (!email || !reason || reason.length < 5) {
    console.error('Usage: reset-mfa --email <address> --reason "<at least 5 characters>"');
    return 2;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  let redis: ReturnType<typeof createRedisClient> | null = null;
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user === null) {
      console.error(`No user with e-mail ${email}`);
      return 1;
    }
    await prisma.$transaction([
      prisma.userMfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.userMfa.deleteMany({ where: { userId: user.id } }),
      prisma.userSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'mfa_reset' },
      }),
    ]);
    await recordAuditEntry(prisma as unknown as PrismaService, {
      action: auditLogActions.authMfaReset,
      entityType: auditLogEntityTypes.user,
      entityId: user.id,
      actorUserId: null,
      metadata: { reason, via: 'server' } as never,
    });
    try {
      redis = createRedisClient(loadRedisConfiguration(process.env));
      await new SessionRevocationStore(redis).revokeAllForUser(user.id, authenticationConstants.sessionTtlSeconds);
    } catch (error) {
      console.warn(`Sessions revoked in the database; Redis cutoff not written (${String(error)}). Active tokens expire within 1 h.`);
    }
    console.log(`MFA reset for ${email}. The user sets MFA up again at the next sign-in.`);
    return 0;
  } finally {
    await prisma.$disconnect();
    redis?.disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
