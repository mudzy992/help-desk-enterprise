import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { AuthenticationUserLoader } from '../authentication/authentication-user.loader';
import { StepUpPolicyService } from './step-up-policy.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('step-up identity boundary (integration)', () => {
  let prisma: PrismaClient;
  const stamp = Date.now();
  let userId: string;
  let roleId: string;
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const role = await prisma.role.create({ data: { key: `IT_STEPUP_SA_${stamp}`, name: 'SUPER_ADMIN' } });
    // The production invariant keys on SUPER_ADMIN; use an isolated role row by
    // temporarily changing the key after creation only when no canonical row exists.
    const superAdmin = await prisma.role.findUnique({ where: { key: 'SUPER_ADMIN' } });
    roleId = role.id;
    const user = await prisma.user.create({
      data: { email: `stepup-${stamp}@example.invalid`, displayName: 'Non-local emergency actor', isLocalOnly: false, userRoles: { create: { roleId: superAdmin?.id ?? role.id } } },
    });
    userId = user.id;
  });
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  it('rejects a persisted non-local emergency actor before consuming proof', async () => {
    const consumeFreshConfirmation = jest.fn(async () => true);
    const policy = new StepUpPolicyService(
      { isEnabled: async () => true, verify: async () => 'totp' } as never,
      { consumeFreshConfirmation } as never,
      new AuthenticationUserLoader(prisma as never),
    );
    await expect(policy.assertConfirmed({
      caller: { subjectId: userId, sessionId: 'sid-1' },
      purpose: 'bulk-password-reset',
      requireLocalSuperAdmin: true,
    })).rejects.toMatchObject({ response: { code: 'IDENTITY_CONFIRMATION_REQUIRED' } });
    expect(consumeFreshConfirmation).not.toHaveBeenCalled();
  });
});
