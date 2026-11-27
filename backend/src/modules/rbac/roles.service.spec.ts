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

  type ServiceOptions = {
    /** `userRole` rows Prisma returns for the preview scan. */
    readonly assignments?: readonly Record<string, unknown>[];
    /** Authorization contexts by subjectId; default is one global AGENT. */
    readonly contexts?: Record<string, unknown>;
    /** OU id → ouPath, used by the evaluator's scope lookups. */
    readonly organizationalUnitPaths?: Record<string, string>;
    /** Known service ids, used by the evaluator's service lookup. */
    readonly serviceIds?: readonly string[];
    /** Permission keys the role currently holds (default: `ticket.merge`). */
    readonly currentPermissionKeys?: readonly string[];
    /**
     * W2.32 (`BA-rbac-05`): the distinct holders the write fences inside its
     * transaction, with the version the bump produces for each of them.
     */
    readonly holders?: readonly { readonly userId: string; readonly authzVersion: number }[];
  };

  const createService = (
    invalidateRoleHolders = jest.fn().mockResolvedValue(1),
    options: ServiceOptions = {},
  ) => {
    // BA-rbac-01 (W2.29): the preview baseline and the write's compare-and-swap
    // both read this, so a test can model "another administrator committed in
    // between" by replacing the rows between the two calls.
    const permissionRows: { permission: { key: string } }[] = (
      options.currentPermissionKeys ?? [permissionKeys.ticketMerge]
    ).map((key) => ({ permission: { key } }));
    // W2.30 (BA-rbac-02): the durable single-use claim store. `updateMany` is the
    // atomic consume (`consumedAt IS NULL` → now), so a second PUT of the same
    // token gets `count: 0` and the write is refused.
    const claims = new Map<string, { consumedAt: Date | null }>();
    const prisma: Record<string, unknown> = {
      // W2.31 (BA-rbac-03): scope coverage is resolved through the preview's own
      // client (`createAuthorizationLookups(loader, prisma)`), so the OU path and
      // the known services live here, not on the harness.
      organizationalUnit: {
        findUnique: jest
          .fn()
          .mockImplementation(async ({ where }: { where: { id: string } }) => {
            const path = options.organizationalUnitPaths?.[where.id];
            return path === undefined ? null : { ouPath: path };
          }),
      },
      service: {
        findUnique: jest
          .fn()
          .mockImplementation(async ({ where }: { where: { id: string } }) =>
            (options.serviceIds ?? []).includes(where.id) ? { id: where.id } : null,
          ),
      },
      rolePermissionPreviewClaim: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest
          .fn()
          .mockImplementation(async ({ data }: { data: { jti: string } }) => {
            claims.set(data.jti, { consumedAt: null });
            return data;
          }),
        updateMany: jest
          .fn()
          .mockImplementation(async ({ where }: { where: { jti: string } }) => {
            const row = claims.get(where.jti);
            if (row === undefined || row.consumedAt !== null) return { count: 0 };
            row.consumedAt = new Date();
            return { count: 1 };
          }),
        findUnique: jest
          .fn()
          .mockImplementation(async ({ where }: { where: { jti: string } }) => {
            const row = claims.get(where.jti);
            return row === undefined ? null : { consumedAt: row.consumedAt };
          }),
      },
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
        // W2.31 scans assignments (with their user/scope); W2.32 fences the
        // distinct holders, so the same mock answers both shapes.
        findMany: jest.fn().mockImplementation(
          async (args?: { select?: { userId?: boolean } }) =>
            args?.select?.userId === true
              ? (options.holders ?? [{ userId: 'user-1', authzVersion: 7 }]).map(
                  (holder) => ({ userId: holder.userId }),
                )
              : (options.assignments ?? [
            {
              id: 'assignment-1',
              organizationalUnitId: null,
              serviceId: null,
              organizationalUnit: null,
              service: null,
              user: {
                id: 'user-1',
                displayName: 'Agent One',
                email: 'agent@example.com',
              },
            },
          ]),
        ),
        count: jest.fn().mockResolvedValue(1),
      },
      // W2.32 (`BA-rbac-05`): the fence is a write inside the transaction.
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockImplementation(async () =>
          (options.holders ?? [{ userId: 'user-1', authzVersion: 7 }]).map(
            (holder) => ({
              id: holder.userId,
              authzVersion: holder.authzVersion,
            }),
          ),
        ),
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
    const defaultContext = createTestAuthorizationContext({
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.agent,
          permissionKeys: [permissionKeys.ticketMerge],
        }),
      ],
    });
    harness.loadBySubjectId.mockImplementation(
      async (subjectId: string) =>
        (options.contexts?.[subjectId] as never) ?? defaultContext,
    );

    // W2.32 (`BA-rbac-05`): the durable retry of the post-commit cache notice.
    const schedule = jest.fn().mockResolvedValue({ id: 'outbox-1', created: true });
    const service = new RolesService(
      prisma as never,
      { loadBySubjectId: harness.loadBySubjectId } as never,
      harness.shadowAuthorizationService,
      {
        publishCommittedRoleHolders: invalidateRoleHolders,
        invalidateRoleHolders,
      } as never,
      { load: async () => previewSigningSecret } as never,
      { schedule } as never,
    );
    type PrismaMock = {
      rolePermission: { deleteMany: jest.Mock; create: jest.Mock };
      rolePermissionPreviewClaim: {
        create: jest.Mock;
        updateMany: jest.Mock;
      };
      auditLog: { create: jest.Mock };
      user: { updateMany: jest.Mock; findMany: jest.Mock };
      userRole: { findMany: jest.Mock };
    };
    return {
      service,
      prisma: prisma as unknown as PrismaMock,
      permissionRows,
      harness,
      invalidateRoleHolders,
      schedule,
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

  // W2.31 (`BA-rbac-03`): the same removal is a different change depending on the
  // assignment's scope. Before this package every evaluation ran globally, where
  // the evaluator refuses scoped grants by construction — so an OU-scoped user
  // who really loses `ticket.merge` produced deny/deny and no sample at all.
  it('reports an OU-scoped allow→deny with the scope identity (BA-rbac-03)', async () => {
    const { service } = createService(undefined, {
      assignments: [
        {
          id: 'assignment-ou',
          organizationalUnitId: 'ou-1',
          serviceId: null,
          organizationalUnit: { id: 'ou-1', name: 'Finansije', ouPath: '/finansije' },
          service: null,
          user: { id: 'user-2', displayName: 'Agent OU', email: 'agent-ou@example.com' },
        },
      ],
      contexts: {
        'user-2': createTestAuthorizationContext({
          subjectId: 'user-2',
          assignments: [
            createTestAssignment({
              organizationalUnitId: 'ou-1',
              organizationalUnitPath: '/finansije',
              permissionKeys: [permissionKeys.ticketMerge],
            }),
          ],
        }),
      },
      organizationalUnitPaths: { 'ou-1': '/finansije' },
    });

    const preview = await service.preview(authorizationRoleKeys.agent, [], 'super-1');

    expect(preview.samples).toHaveLength(1);
    const [sample] = preview.samples;
    expect(sample?.scope).toEqual({
      kind: 'organizational-unit',
      organizationalUnitId: 'ou-1',
      organizationalUnitName: 'Finansije',
      organizationalUnitPath: '/finansije',
      serviceId: null,
      serviceName: null,
    });
    expect(sample?.assignmentId).toBe('assignment-ou');
    expect(sample?.before.decision).toBe(shadowAuthorizationDecisions.allow);
    expect(sample?.after.decision).toBe(shadowAuthorizationDecisions.deny);
    expect(preview.scopeImpacts).toEqual({
      global: 0,
      'organizational-unit': 1,
      service: 0,
      'organizational-unit-and-service': 0,
    });
  });

  it('reports a service-scoped allow→deny with the service identity (BA-rbac-03)', async () => {
    const { service } = createService(undefined, {
      assignments: [
        {
          id: 'assignment-service',
          organizationalUnitId: null,
          serviceId: 'svc-1',
          organizationalUnit: null,
          service: { id: 'svc-1', name: 'VPN' },
          user: { id: 'user-3', displayName: 'Agent VPN', email: 'agent-vpn@example.com' },
        },
      ],
      contexts: {
        'user-3': createTestAuthorizationContext({
          subjectId: 'user-3',
          assignments: [
            createTestAssignment({
              serviceId: 'svc-1',
              permissionKeys: [permissionKeys.ticketMerge],
            }),
          ],
        }),
      },
      serviceIds: ['svc-1'],
    });

    const preview = await service.preview(authorizationRoleKeys.agent, [], 'super-1');

    expect(preview.samples).toHaveLength(1);
    const [sample] = preview.samples;
    expect(sample?.scope).toMatchObject({
      kind: 'service',
      organizationalUnitId: null,
      serviceId: 'svc-1',
      serviceName: 'VPN',
    });
    expect(sample?.before.decision).toBe(shadowAuthorizationDecisions.allow);
    expect(sample?.after.decision).toBe(shadowAuthorizationDecisions.deny);
    expect(preview.scopeImpacts.service).toBe(1);
    expect(preview.scopeImpacts.global).toBe(0);
  });

  it('reports a deny→allow inside an OU+service scope (BA-rbac-03)', async () => {
    const { service } = createService(undefined, {
      currentPermissionKeys: [],
      assignments: [
        {
          id: 'assignment-both',
          organizationalUnitId: 'ou-2',
          serviceId: 'svc-2',
          organizationalUnit: { id: 'ou-2', name: 'Podrška', ouPath: '/podrska' },
          service: { id: 'svc-2', name: 'E-mail' },
          user: { id: 'user-4', displayName: 'Agent Both', email: 'agent-both@example.com' },
        },
      ],
      contexts: {
        'user-4': createTestAuthorizationContext({
          subjectId: 'user-4',
          assignments: [
            createTestAssignment({
              organizationalUnitId: 'ou-2',
              organizationalUnitPath: '/podrska',
              serviceId: 'svc-2',
              permissionKeys: [],
            }),
          ],
        }),
      },
      organizationalUnitPaths: { 'ou-2': '/podrska' },
      serviceIds: ['svc-2'],
    });

    const preview = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.ticketMerge],
      'super-1',
    );

    const [sample] = preview.samples;
    expect(sample?.scope.kind).toBe('organizational-unit-and-service');
    expect(sample?.before.decision).toBe(shadowAuthorizationDecisions.deny);
    expect(sample?.after.decision).toBe(shadowAuthorizationDecisions.allow);
    expect(preview.scopeImpacts['organizational-unit-and-service']).toBe(1);
  });

  it('counts a scope-agnostic permission in the scope and globally (BA-rbac-03)', async () => {
    // `oncall.read` ignores the scope by policy: the same OU-scoped assignment
    // really grants it everywhere, so the report must not hide the global part.
    const { service } = createService(undefined, {
      currentPermissionKeys: [permissionKeys.onCallRead],
      assignments: [
        {
          id: 'assignment-ou',
          organizationalUnitId: 'ou-1',
          serviceId: null,
          organizationalUnit: { id: 'ou-1', name: 'Finansije', ouPath: '/finansije' },
          service: null,
          user: { id: 'user-2', displayName: 'Agent OU', email: 'agent-ou@example.com' },
        },
      ],
      contexts: {
        'user-2': createTestAuthorizationContext({
          subjectId: 'user-2',
          assignments: [
            createTestAssignment({
              organizationalUnitId: 'ou-1',
              organizationalUnitPath: '/finansije',
              permissionKeys: [permissionKeys.onCallRead],
            }),
          ],
        }),
      },
      organizationalUnitPaths: { 'ou-1': '/finansije' },
    });

    const preview = await service.preview(authorizationRoleKeys.agent, [], 'super-1');

    expect(preview.samples.map((sample) => sample.scope.kind)).toEqual([
      'organizational-unit',
      'global',
    ]);
    expect(preview.scopeImpacts).toEqual({
      global: 1,
      'organizational-unit': 1,
      service: 0,
      'organizational-unit-and-service': 0,
    });
  });

  it('keeps an unscoped assignment a global effect', async () => {
    const { service } = createService();
    const preview = await service.preview(authorizationRoleKeys.agent, [], 'super-1');
    expect(preview.samples[0]?.scope).toEqual({
      kind: 'global',
      organizationalUnitId: null,
      organizationalUnitName: null,
      organizationalUnitPath: null,
      serviceId: null,
      serviceName: null,
    });
    expect(preview.scopeImpacts.global).toBe(1);
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

  it('refuses a second write with an already consumed preview (BA-rbac-02)', async () => {
    // Acceptance of the finding: the same token twice ⇒ stale/consumed and no
    // second audit row. The first PUT consumes the claim inside its transaction.
    const { service, prisma } = createService();
    // The role already holds `ticket.merge` and the preview proposes the same set,
    // so the first write changes nothing. That is the case the W2.29 baseline CAS
    // cannot catch — the set it compares is still the baseline — and the reason a
    // durable claim is needed: without it the same token could be replayed.
    const preview = await service.preview(
      authorizationRoleKeys.agent,
      [permissionKeys.ticketMerge],
      'super-1',
    );
    await service.replace({
      roleKey: authorizationRoleKeys.agent,
      permissionKeys: [permissionKeys.ticketMerge],
      previewToken: preview.previewToken,
      reason: 'Potvrda bez promjene skupa',
      actorUserId: 'super-1',
      requestId: 'req-1',
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);

    await expect(
      service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.ticketMerge],
        previewToken: preview.previewToken,
        reason: 'Ponovljeni zahtjev istog tokena',
        actorUserId: 'super-1',
        requestId: 'req-2',
      }),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_CONSUMED' } });

    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
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
    expect(invalidateRoleHolders).toHaveBeenCalledWith(role.id, [
      { userId: 'user-1', authzVersion: 7 },
    ]);
  });

  // W2.32 (`BA-rbac-05`): the invalidation used to be a post-commit side effect
  // the API could not lose. It is now two things: a fence that is part of the
  // write, and a notice about it.
  describe('durable holder fence (BA-rbac-05)', () => {
    async function replaceOnce(service: RolesService) {
      const preview = await service.preview(
        authorizationRoleKeys.agent,
        [permissionKeys.settingsWrite],
        'super-1',
      );
      return service.replace({
        roleKey: authorizationRoleKeys.agent,
        permissionKeys: [permissionKeys.settingsWrite],
        previewToken: preview.previewToken,
        reason: 'Rotacija dužnosti',
        actorUserId: 'super-1',
        requestId: 'req-1',
      });
    }

    it('bumps every holder authzVersion inside the write transaction', async () => {
      const { service, prisma, invalidateRoleHolders } = createService(
        jest.fn().mockResolvedValue(1),
        {
          holders: [
            { userId: 'user-1', authzVersion: 7 },
            { userId: 'user-2', authzVersion: 4 },
          ],
        },
      );
      await replaceOnce(service);

      expect(prisma.userRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roleId: role.id },
          distinct: ['userId'],
        }),
      );
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['user-1', 'user-2'] } },
        data: { authzVersion: { increment: 1 } },
      });
      // The notice carries the numbers the database committed, not a re-read.
      expect(invalidateRoleHolders).toHaveBeenCalledWith(role.id, [
        { userId: 'user-1', authzVersion: 7 },
        { userId: 'user-2', authzVersion: 4 },
      ]);
    });

    it('keeps the change effective when the cache notice fails', async () => {
      // Redis unreachable, invalidator broken — the removed permission must
      // still be gone, because the fence is already committed.
      const failing = jest
        .fn()
        .mockRejectedValue(new Error('redis unavailable'));
      const { service, prisma } = createService(failing);
      await expect(replaceOnce(service)).resolves.toEqual([
        permissionKeys.settingsWrite,
      ]);
      expect(failing).toHaveBeenCalledTimes(1);
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { authzVersion: { increment: 1 } },
        }),
      );
    });

    it('schedules the durable retry inside the transaction with the highest committed version', async () => {
      const { service, schedule } = createService(jest.fn(), {
        holders: [
          { userId: 'user-1', authzVersion: 7 },
          { userId: 'user-2', authzVersion: 11 },
        ],
      });
      await replaceOnce(service);
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(schedule).toHaveBeenCalledWith(expect.anything(), {
        namespace: 'authz.role-holders',
        key: role.id,
        revision: 11,
      });
    });

    it('fences and schedules nothing when the role has no holders', async () => {
      const { service, prisma, invalidateRoleHolders, schedule } = createService(
        jest.fn(),
        { holders: [] },
      );
      await replaceOnce(service);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(invalidateRoleHolders).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    });

    it('does not fence anyone when the write itself failed', async () => {
      const { service, prisma } = createService();
      prisma.rolePermission.deleteMany.mockRejectedValue(
        new Error('database is down'),
      );
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
          reason: 'Rotacija dužnosti',
          actorUserId: 'super-1',
          requestId: 'req-1',
        }),
      ).rejects.toBeDefined();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
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
