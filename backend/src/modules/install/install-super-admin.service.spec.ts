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
    await expect(
      service.create(
        {
          email: 'admin@example.com',
          displayName: 'Admin',
          password: 'short',
        },
        hashPassword,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_SUPER_ADMIN_CREDENTIALS' } });
    await expect(
      service.create(
        {
          email: 'admin@example.com',
          displayName: 'Admin',
          password: 'admin@example.com',
        },
        hashPassword,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_SUPER_ADMIN_CREDENTIALS' } });
    expect(memory.getUserByEmail('admin@example.com')).toBeUndefined();
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
