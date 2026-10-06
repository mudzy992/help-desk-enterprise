import { ConflictException } from '@nestjs/common';
import { authenticationConstants } from '../authentication/authentication.constants';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { createInMemoryInstallSuperAdminPrisma } from './create-in-memory-install-super-admin-prisma';
import { InstallSuperAdminService } from './install-super-admin.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const password = 'correct-horse-battery';
const hashPassword = (value: string) => hashLocalPassword(value, 4);

function createService() {
  const memory = createInMemoryInstallSuperAdminPrisma();
  return {
    memory,
    service: new InstallSuperAdminService(
      memory.prisma as unknown as PrismaService,
    ),
  };
}

describe('InstallSuperAdminService', () => {
  it('creates SuperAdmin as a local-only user with a hashed password', async () => {
    const { memory, service } = createService();
    const created = await service.create(
      {
        email: 'Admin@Example.com',
        displayName: '  Direkcija IKT  ',
        password,
      },
      hashPassword,
    );
    const stored = memory.getUserByEmail('admin@example.com');
    expect(created).toEqual({
      userId: stored?.id,
      email: 'admin@example.com',
      displayName: 'Direkcija IKT',
      isLocalOnly: true,
    });
    expect(created).not.toHaveProperty('password');
    expect(created).not.toHaveProperty('localPasswordHash');
    expect(JSON.stringify(created)).not.toContain(password);
    expect(stored?.isLocalOnly).toBe(true);
    expect(stored?.entraObjectId).toBeNull();
    expect(stored?.localPasswordHash).toEqual(expect.stringMatching(/^\$2[aby]\$/));
    expect(stored?.localPasswordHash).not.toBe(password);
    expect(stored?.localPasswordHash).not.toContain(password);
    await expect(service.getStatus()).resolves.toEqual({ superAdmin: created });
  });

  it('rejects invalid SuperAdmin credentials before persistence', async () => {
    const { memory, service } = createService();
    await expect(
      service.create(
        { email: 'not-an-email', displayName: 'Admin', password },
        hashPassword,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_SUPER_ADMIN_CREDENTIALS' } });
    await expect(
      service.create(
        { email: 'admin@example.com', displayName: ' ', password },
        hashPassword,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_SUPER_ADMIN_CREDENTIALS' } });
    // Paket 5.1 (M1 #1): a weak password is now its own failure with the list
    // of broken rules, not the generic "credentials are invalid".
    await expect(
      service.create(
        {
          email: 'admin@example.com',
          displayName: 'Admin',
          password: 'short',
        },
        hashPassword,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PASSWORD_POLICY_VIOLATIONS',
        // "short" is also on the common-password list; both rules are reported.
        violations: expect.arrayContaining(['TOO_SHORT']),
      },
    });
    await expect(
      service.create(
        {
          email: 'admin@example.com',
          displayName: 'Admin',
          password: 'admin@example.com',
        },
        hashPassword,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PASSWORD_POLICY_VIOLATIONS',
        // The address is both the whole password and its local part.
        violations: expect.arrayContaining(['SAME_AS_EMAIL']),
      },
    });
    expect(memory.getUserByEmail('admin@example.com')).toBeUndefined();
  });

  it('applies the policy read from settings, not just the shipped default', async () => {
    const memory = createInMemoryInstallSuperAdminPrisma();
    const loader = {
      load: async () => ({
        mfaRequiredForAdmins: true,
        mfaAllowOptional: true,
        mfaIssuerName: 'Help Desk',
        passwordMinLength: 24,
        passwordMaxLength: 128,
        passwordBlocklistEnabled: false,
        passwordOrganisationWords: [],
        passwordHistoryCount: 0,
        passwordMaxAgeDays: 0,
        superAdminPasswordMaxAgeDays: 365,
        sessionsMaxPerUser: 0,
        sessionsNewDeviceAlert: true,
      }),
    };
    const service = new InstallSuperAdminService(
      memory.prisma as unknown as PrismaService,
      loader as never,
    );
    expect(await service.getPasswordPolicy()).toEqual({
      minLength: 24,
      maxLength: 128,
      blocklistEnabled: false,
    });
    await expect(
      service.create(
        { email: 'admin@example.com', displayName: 'Admin', password: 'correct-horse-battery' },
        hashPassword,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PASSWORD_POLICY_VIOLATIONS', violations: ['TOO_SHORT'] },
    });
  });

  it('never breaks installation when the settings cannot be read', async () => {
    const memory = createInMemoryInstallSuperAdminPrisma();
    const service = new InstallSuperAdminService(
      memory.prisma as unknown as PrismaService,
      {
        load: async () => {
          throw new Error('settings unavailable');
        },
      } as never,
    );
    expect(await service.getPasswordPolicy()).toEqual({
      minLength: 12,
      maxLength: 128,
      blocklistEnabled: true,
    });
    await expect(
      service.create(
        { email: 'admin@example.com', displayName: 'Admin', password: password },
        hashPassword,
      ),
    ).resolves.toMatchObject({ email: 'admin@example.com' });
  });

  it('rejects a second initial SuperAdmin through the install flow', async () => {
    const { memory, service } = createService();
    await service.create(
      {
        email: 'admin@example.com',
        displayName: 'Admin',
        password,
      },
      hashPassword,
    );
    await expect(
      service.create(
        {
          email: 'other@example.com',
          displayName: 'Other',
          password,
        },
        hashPassword,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(memory.getUserByEmail('other@example.com')).toBeUndefined();
  });

  it('rejects an email already used by another user', async () => {
    const { memory, service } = createService();
    memory.seedUser({
      id: 'user-existing',
      email: 'admin@example.com',
      displayName: 'Existing',
      isActive: true,
      isLocalOnly: false,
      localPasswordHash: null,
      entraObjectId: 'entra-1',
    });
    await expect(
      service.create(
        {
          email: 'admin@example.com',
          displayName: 'Admin',
          password,
        },
        hashPassword,
      ),
    ).rejects.toMatchObject({ response: { code: 'SUPER_ADMIN_EMAIL_TAKEN' } });
    expect(memory.getUser('user-existing')?.isLocalOnly).toBe(false);
  });

  it('does not expose a SuperAdmin role that is not local-only', async () => {
    const { memory, service } = createService();
    memory.seedUser(
      {
        id: 'broken-admin',
        email: 'broken@example.com',
        displayName: 'Broken',
        isActive: true,
        isLocalOnly: false,
        localPasswordHash: null,
        entraObjectId: 'entra-1',
      },
      authenticationConstants.superAdminRoleKey,
    );
    await expect(service.getStatus()).resolves.toEqual({ superAdmin: null });
    await expect(
      service.create(
        {
          email: 'admin@example.com',
          displayName: 'Admin',
          password,
        },
        hashPassword,
      ),
    ).rejects.toMatchObject({ response: { code: 'SUPER_ADMIN_ALREADY_EXISTS' } });
  });
});
