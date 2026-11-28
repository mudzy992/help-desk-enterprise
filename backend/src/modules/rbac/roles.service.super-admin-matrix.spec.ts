import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { mapRbacError } from './map-rbac-error';
import { RbacError } from './rbac.error';
import { signRolePermissionPreviewToken } from './role-permission-preview-token';
import { RolesService } from './roles.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W2.36b: a local SuperAdmin who opens "Permisije" and tries to add a permission
 * to the SUPER_ADMIN row got "Nemate dozvolu za upravljanje permisijama uloga."
 *
 * The refusal is correct — runtime SuperAdmin authority is the whole catalog, so
 * the matrix is cosmetic and locked — but the *report* was wrong: the write threw
 * `SYSTEM_ROLE_PERMISSIONS_IMMUTABLE`, `mapRbacError` had no branch for it and
 * fell through to `ForbiddenException`, which the frontend renders as "you are
 * not allowed to manage role permissions" to the exact account that is.
 *
 * These tests pin the user-visible contract: 409 + a code the panel can name.
 */
describe('SuperAdmin permission matrix is locked, not forbidden (W2.36b)', () => {
  const previewSigningSecret = 'test-preview-signing-secret-value-0123456789';
  const superAdminRole = {
    id: 'role-super-admin',
    key: authorizationRoleKeys.superAdmin,
    name: 'SuperAdmin',
  };

  function createService() {
    const prisma: Record<string, unknown> = {
      role: { findUnique: jest.fn().mockResolvedValue(superAdminRole) },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
      rolePermissionPreviewClaim: {
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      // The refusal is thrown inside the write transaction, so the mock has to
      // run the callback: a refusal that never reaches the invariant would pass
      // even if the guard had been removed.
      $transaction: jest.fn(
        async (
          callback: (client: unknown) => Promise<unknown>,
        ): Promise<unknown> => callback(prisma),
      ),
    };
    const service = new RolesService(
      prisma as never,
      {} as never,
      {} as never,
      undefined,
      { load: async () => previewSigningSecret } as never,
    );
    return { service, prisma };
  }

  it('answers a PUT on the SuperAdmin matrix with 409, not 403', async () => {
    const { service, prisma } = createService();
    const previewToken = signRolePermissionPreviewToken(
      {
        jti: 'preview-super-admin',
        roleKey: authorizationRoleKeys.superAdmin,
        permissionKeys: [permissionKeys.ticketMerge],
        baselinePermissionKeys: [],
        actorUserId: 'local-super-admin',
      },
      previewSigningSecret,
    );

    const thrown = await service
      .replace({
        roleKey: authorizationRoleKeys.superAdmin,
        permissionKeys: [permissionKeys.ticketMerge],
        previewToken,
        reason: 'SuperAdmin treba organizationalUnit.manage',
        actorUserId: 'local-super-admin',
        requestId: 'req-super-admin-matrix',
      })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(thrown).not.toBeInstanceOf(ForbiddenException);
    expect((thrown as ConflictException).getStatus()).toBe(409);
    expect((thrown as ConflictException).getResponse()).toMatchObject({
      code: 'SYSTEM_ROLE_PERMISSIONS_IMMUTABLE',
    });
    // Nothing changed: no matrix write, no audit row, no holder fence.
    expect(
      (prisma.rolePermission as { deleteMany: jest.Mock }).deleteMany,
    ).not.toHaveBeenCalled();
    expect(
      (prisma.auditLog as { create: jest.Mock }).create,
    ).not.toHaveBeenCalled();
    expect(
      (prisma.user as { updateMany: jest.Mock }).updateMany,
    ).not.toHaveBeenCalled();
  });

  it('keeps the 403 branch for codes that really are authorization failures', () => {
    expect(() => mapRbacError(new RbacError('FORBIDDEN'))).toThrow(
      ForbiddenException,
    );
  });
});
