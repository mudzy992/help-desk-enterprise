import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import { rolePermissionPreviewTokenTtlSeconds } from './role-permission-preview-token';
import { createTestAuthorizationHarness } from '../authorization/create-test-authorization-harness';
import { shadowAuthorizationDecisions } from '../authorization/shadow-authorization.types';
import { RolesService } from './roles.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RolesService preview and replace', () => {
  // Paket 5.1 (M4 B2): the preview is signed and the write only accepts a token
  // that matches the reviewed set, the actor and the 15-minute window.
  const previewSigningSecret = 'test-preview-signing-secret-value-0123456789';
  const role = { id: 'role-agent', key: authorizationRoleKeys.agent, name: 'Agent' };
  const permissionMerge = { id: 'perm-merge', key: permissionKeys.ticketMerge };
  const permissionSettings = {
    id: 'perm-settings',
    key: permissionKeys.settingsWrite,
  };

  const createService = (invalidateRoleHolders = jest.fn().mockResolvedValue(1)) => {
    // BA-rbac-01 (W2.29): the preview baseline and the write's compare-and-swap
    // both read this, so a test can model "another administrator committed in
    // between" by replacing the rows between the two calls.
    const permissionRows: { permission: { key: string } }[] = [
      { permission: { key: permissionKeys.ticketMerge } },
    ];
    const prisma: Record<string, unknown> = {
      role: {
        findUnique: jest.fn().mockResolvedValue(role),
        findMany: jest.fn(),
      },
      rolePermission: {
        findMany: jest
          .fn()
          .mockImplementation(async () => permissionRows.map((row) => ({ ...row }))),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      permission: {
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { key: string } }) => {
          if (where.key === permissionKeys.ticketMerge) {
            return permissionMerge;
          }
          if (where.key === permissionKeys.settingsWrite) {
            return permissionSettings;
          }
          return null;
        }),
        create: jest.fn(),
      },
      userRole: {
        findMany: jest.fn().mockResolvedValue([
          {
            user: {
              id: 'user-1',
              displayName: 'Agent One',
              email: 'agent@example.com',
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>): Promise<unknown> =>
        callback(prisma),
      ),
      $executeRaw: jest.fn(),
    };
    const harness = createTestAuthorizationHarness();
    harness.loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            permissionKeys: [permissionKeys.ticketMerge],
          }),
        ],
      }),
    );
    const service = new RolesService(
      prisma as never,
      { loadBySubjectId: harness.loadBySubjectId } as never,
      harness.shadowAuthorizationService,
      { invalidateRoleHolders } as never,
      { load: async () => previewSigningSecret } as never,
    );
    type PrismaMock = {
      rolePermission: { deleteMany: jest.Mock; create: jest.Mock };
      auditLog: { create: jest.Mock };
    };
    return {
      service,
      prisma: prisma as unknown as PrismaMock,
      permissionRows,
      harness,
      invalidateRoleHolders,
    };
  };

  it('preview reports lost access when ticket.merge is removed from agent', async () => {
    const { service } = createService();
    const preview = await service.preview(authorizationRoleKeys.agent, [], 'super-1');
    expect(preview.removedPermissionKeys).toEqual([permissionKeys.ticketMerge]);
    expect(preview.samples.length).toBeGreaterThan(0);
    expect(preview.samples[0]?.before.decision).toBe(
      shadowAuthorizationDecisions.allow,
    );
    expect(preview.samples[0]?.after.decision).toBe(
      shadowAuthorizationDecisions.deny,
    );
  });

  it('replace swaps role permissions and writes audit metadata', async () => {
    const { service, prisma } = createService();
    const preview = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.settingsWrite],
      'super-1',
    );
    const next = await service.replace({
      roleKey: authorizationRoleKeys.agent,
      permissionKeys: [permissionKeys.settingsWrite],
      previewToken: preview.previewToken,
      reason: 'Agent dobija pristup postavkama zbog nove dužnosti',
      actorUserId: 'super-1',
      requestId: 'req-1',
    });
    expect(next).toEqual([permissionKeys.settingsWrite]);
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: role.id },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
    const [auditCall] = (
      prisma as unknown as { auditLog: { create: jest.Mock } }
    ).auditLog.create.mock.calls;
    expect(auditCall?.[0].data.metadata).toMatchObject({
      reason: 'Agent dobija pristup postavkama zbog nove dužnosti',
      nextPermissionKeys: [permissionKeys.settingsWrite],
      // BA-rbac-01 (W2.29): the recorded "previous" state is the one the write
      // actually replaced — read inside the transaction, not before it.
      previousPermissionKeys: [permissionKeys.ticketMerge],
    });
    expect(typeof auditCall?.[0].data.metadata.previewedAt).toBe('string');
  });

  it('refuses a write without the preview token', async () => {
    const { service } = createService();
    await expect(
      service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.settingsWrite],
        previewToken: '',
        reason: 'Bez pregleda',
        actorUserId: 'super-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_REQUIRED' } });
  });

  it('refuses a write whose preview expired', async () => {
    const { service } = createService();
    const preview = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.settingsWrite],
      'super-1',
    );
    // The token itself is fine; the clock has moved past its 15-minute window.
    const later = Date.now() + (rolePermissionPreviewTokenTtlSeconds + 1) * 1000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(later);
    try {
      await expect(
        service.replace({
          roleKey: authorizationRoleKeys.agent,
          permissionKeys: [permissionKeys.settingsWrite],
          previewToken: preview.previewToken,
          reason: 'Istekao pregled',
          actorUserId: 'super-1',
          requestId: 'req-1',
        }),
      ).rejects.toMatchObject({ response: { code: 'PREVIEW_STALE' } });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('refuses a write whose permission set differs from the previewed one', async () => {
    const { service } = createService();
    const preview = await service.preview(authorizationRoleKeys.agent, [], 'super-1');
    await expect(
      service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.settingsWrite],
        previewToken: preview.previewToken,
        reason: 'Drugi skup',
        actorUserId: 'super-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_STALE' } });
  });

  it('refuses a preview that another administrator ran', async () => {
    const { service } = createService();
    const preview = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.settingsWrite],
      'super-1',
    );
    await expect(
      service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.settingsWrite],
        previewToken: preview.previewToken,
        reason: 'Tuđi pregled',
        actorUserId: 'super-2',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_STALE' } });
  });

  it('refuses a write without a reason', async () => {
    const { service } = createService();
    const preview = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.settingsWrite],
      'super-1',
    );
    await expect(
      service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.settingsWrite],
        previewToken: preview.previewToken,
        reason: '   ',
        actorUserId: 'super-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_REQUIRED' } });
  });

  it('refuses a preview made stale by another administrator\'s commit (BA-rbac-01)', async () => {
    // Two SuperAdmins: A previews while the role holds [ticket.merge]; B commits
    // [ticket.merge, settings.write]; A's PUT arrives afterwards. Before W2.29 the
    // token was still valid and A silently overwrote B.
    const { service, prisma, permissionRows, invalidateRoleHolders } = createService();
    const previewA = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.settingsWrite],
      'super-1',
    );
    permissionRows.push({ permission: { key: permissionKeys.settingsWrite } });

    await expect(
      service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.settingsWrite],
        previewToken: previewA.previewToken,
        reason: 'Pregled prije tuđe izmjene',
        actorUserId: 'super-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_STALE' } });

    // Nothing was written and nothing was audited, and the holders were left alone.
    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rolePermission.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(invalidateRoleHolders).not.toHaveBeenCalled();
  });

  it('accepts the second administrator after they run a fresh preview', async () => {
    const { service, permissionRows } = createService();
    permissionRows.push({ permission: { key: permissionKeys.settingsWrite } });
    // B previews the *current* state, so the baseline is the state it will replace.
    const previewB = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.settingsWrite],
      'super-2',
    );
    await expect(
      service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.settingsWrite],
        previewToken: previewB.previewToken,
        reason: 'Ponovni pregled poslije tuđe izmjene',
        actorUserId: 'super-2',
        requestId: 'req-2',
      }),
    ).resolves.toEqual([permissionKeys.settingsWrite]);
  });

  it('invalidates every holder of the role whose permissions changed', async () => {
    // Phase 2.2 (plan §2.2): a permission of a role is cached inside the
    // principal context of each holder, so all of them are dropped.
    const { service, invalidateRoleHolders } = createService();
    const preview = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.settingsWrite],
      'super-1',
    );
    await service.replace({
      roleKey: authorizationRoleKeys.agent,
      permissionKeys: [permissionKeys.settingsWrite],
      previewToken: preview.previewToken,
      reason: 'Rotacija dužnosti',
      actorUserId: 'super-1',
      requestId: 'req-1',
    });
    expect(invalidateRoleHolders).toHaveBeenCalledTimes(1);
    expect(invalidateRoleHolders).toHaveBeenCalledWith(role.id);
  });

  it('does not invalidate anyone when the write failed', async () => {
    const { service, prisma, invalidateRoleHolders } = createService();
    const preview = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.settingsWrite],
      'super-1',
    );
    prisma.rolePermission.deleteMany.mockRejectedValue(new Error('database is down'));
    await expect(
      service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.settingsWrite],
        previewToken: preview.previewToken,
        reason: 'Rotacija dužnosti',
        actorUserId: 'super-1',
        requestId: 'req-1',
      }),
    ).rejects.toBeDefined();
    // Nothing changed, so nothing may be dropped: an unnecessary invalidation
    // would only cost a reload.
    expect(invalidateRoleHolders).not.toHaveBeenCalled();
  });
});
