jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { randomBytes } from 'node:crypto';
import { defaultAccountSecurityPolicy } from './account-security-policy';
import { MfaService } from './mfa.service';
import { decryptMfaSecret, readMfaEncryptionKey } from './mfa-secret-cipher';
import { totpCode, verifyTotp } from './totp';

type Row = {
  userId: string;
  enabledAt: Date | null;
  secretEncrypted: string | null;
  pendingSecretEncrypted: string | null;
  pendingCreatedAt: Date | null;
  lastUsedStep: bigint | null;
  lastUsedAt: Date | null;
};

/** In-memory UserMfa with the same row semantics Postgres gives (unique userId, atomic updateMany). */
function fakePrisma() {
  const rows = new Map<string, Row>();
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const matches = (row: Row, where: Record<string, unknown>): boolean => {
    if (where.userId !== undefined && row.userId !== where.userId) return false;
    if ('enabledAt' in where && where.enabledAt === null && row.enabledAt !== null) return false;
    const or = where.OR as Record<string, unknown>[] | undefined;
    if (or === undefined) return true;
    return or.some((clause) => {
      if ('pendingSecretEncrypted' in clause) return row.pendingSecretEncrypted === null;
      const created = clause.pendingCreatedAt as null | { lt: Date };
      if (created === null) return row.pendingCreatedAt === null;
      return row.pendingCreatedAt !== null && row.pendingCreatedAt < created.lt;
    });
  };
  const userMfa = {
    findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
      await tick();
      const row = rows.get(where.userId);
      return row === undefined ? null : { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      await tick();
      let count = 0;
      for (const row of rows.values()) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    }),
    create: jest.fn(async ({ data }: { data: Partial<Row> & { userId: string } }) => {
      await tick();
      if (rows.has(data.userId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const row: Row = {
        enabledAt: null,
        secretEncrypted: null,
        pendingSecretEncrypted: null,
        pendingCreatedAt: null,
        lastUsedStep: null,
        lastUsedAt: null,
        ...data,
      };
      rows.set(data.userId, row);
      return row;
    }),
  };
  return { prisma: { userMfa }, rows };
}

const subject = { id: 'u-1', email: 'amra@example.com', localPasswordHash: 'hash', entraObjectId: null, roleKeys: ['ADMIN'] };

describe('MfaService enrollment', () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });
  afterAll(() => {
    process.env.MFA_ENCRYPTION_KEY = previousKey;
  });

  function service() {
    const fake = fakePrisma();
    const notifier = { audit: jest.fn(async () => undefined), notify: jest.fn(async () => undefined) };
    return { mfa: new MfaService(fake.prisma as never, notifier as never), ...fake };
  }

  it('returns the same secret to two parallel starts (StrictMode double mount)', async () => {
    const { mfa } = service();
    const [first, second] = await Promise.all([
      mfa.startEnrollment(subject, defaultAccountSecurityPolicy),
      mfa.startEnrollment(subject, defaultAccountSecurityPolicy),
    ]);
    expect(second.secret).toBe(first.secret);
    expect(second.otpauthUri).toBe(first.otpauthUri);
  });

  it('keeps the scanned secret on a later start (reload): the stored secret yields the phone code', async () => {
    const { mfa, rows } = service();
    const scanned = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    const reloaded = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    expect(reloaded.secret).toBe(scanned.secret);
    const stored = decryptMfaSecret(rows.get('u-1')!.pendingSecretEncrypted!, readMfaEncryptionKey());
    const now = Date.now();
    expect(verifyTotp({ base32Secret: stored, code: totpCode(scanned.secret, now), nowMilliseconds: now, lastUsedStep: null })).not.toBeNull();
  });

  it('issues a fresh secret once the pending one is close to expiry', async () => {
    const { mfa, rows } = service();
    const old = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    rows.get('u-1')!.pendingCreatedAt = new Date(Date.now() - 14 * 60 * 1000);
    const fresh = await mfa.startEnrollment(subject, defaultAccountSecurityPolicy);
    expect(fresh.secret).not.toBe(old.secret);
  });
});
