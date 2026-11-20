jest.mock('../audit-log/record-audit-entry', () => ({
  recordAuditEntry: jest.fn(async () => undefined),
}));
jest.mock('../assets/asset-link-access', () => {
  const actual =
    jest.requireActual<typeof import('../assets/asset-link-access')>(
      '../assets/asset-link-access',
    );
  return {
    ...actual,
    assetLinkAccess: jest.fn(async () => ({
      allowed: true,
      where: null,
      scope: { all: true },
    })),
  };
});

import { permissionKeys } from '../authorization/authorization.constants';
import { ChangesService } from './changes.service';
import { ChangeOwnerReconciler } from './sweep/change-owner-reconciler.service';
import { changeErrorCodes } from './changes.constants';

const scoped = { all: false, paths: ['/helpdesk'] } as const;

function managerRow(input: {
  readonly id: string;
  readonly displayName: string;
  readonly isActive?: boolean;
  readonly anonymizedAt?: Date | null;
  readonly ouPath: string;
}) {
  return {
    id: input.id,
    displayName: input.displayName,
    email: `${input.id}@example.test`,
    isActive: input.isActive ?? true,
    anonymizedAt: input.anonymizedAt ?? null,
    organizationalUnit: { ouPath: '/helpdesk' },
    userRoles: [
      {
        role: {
          key: 'CHANGE_MANAGER',
          rolePermissions: [{ permission: { key: permissionKeys.changeManage } }],
        },
        organizationalUnit: { id: 'ou-target', ouPath: input.ouPath },
        service: null,
      },
    ],
    groupMembers: [],
  };
}

function changeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'change-1',
    sequence: 7,
    title: 'Firewall upgrade',
    type: 'NORMAL',
    status: 'AUTHORIZATION',
    risk: 'MEDIUM',
    plannedStart: null,
    plannedEnd: null,
    causesDowntime: false,
    owner: { id: 'owner-1', displayName: 'Owner', email: 'owner@example.test' },
    requester: {
      id: 'requester-1',
      displayName: 'Requester',
      email: 'requester@example.test',
    },
    cabGroup: null,
    organizationalUnit: { id: 'ou-target', name: 'Network', ouPath: '/helpdesk/network' },
    services: [],
    _count: { services: 0, assets: 0 },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    description: 'd',
    reason: 'r',
    impact: 'LOW',
    likelihood: 'LOW',
    implementationPlan: null,
    backoutPlan: null,
    testPlan: null,
    communicationPlan: null,
    actualStart: null,
    actualEnd: null,
    outcome: null,
    reviewNotes: null,
    templateId: null,
    problemId: null,
    approvalRound: 1,
    conflictsAcknowledgedAt: null,
    submittedAt: null,
    authorizedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    version: 3,
    template: null,
    problem: null,
    assets: [],
    requesterUserId: 'requester-1',
    ownerUserId: 'owner-1',
    cabGroupId: null,
    organizationalUnitId: 'ou-target',
    ...overrides,
  };
}

function buildService(options: {
  readonly managers?: ReturnType<typeof managerRow>[];
  readonly row?: Record<string, unknown>;
  readonly unitPath?: string | null;
}) {
  const prisma = {
    changeRequest: {
      findFirst: jest.fn(async () => options.row ?? changeRow()),
    },
    organizationalUnit: {
      findUnique: jest.fn(async () =>
        options.unitPath === null ? null : { ouPath: options.unitPath ?? '/helpdesk/network' },
      ),
    },
    user: {
      findMany: jest.fn(async (args: { where?: { id?: { in: string[] } } }) => {
        const rows = options.managers ?? [];
        const ids = args.where?.id?.in;
        return ids === undefined ? rows : rows.filter((row) => ids.includes(row.id));
      }),
    },
    changeEvent: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    problem: { count: jest.fn(async () => 1) },
  };
  const access = {
    require: jest.fn(async () => scoped),
    scopeOf: jest.fn(async () => scoped),
    configuration: jest.fn(async () => ({ numberPrefix: 'CHG' })),
    hasPermission: jest.fn(
      (_viewer: unknown, permission: string) =>
        permission === permissionKeys.changeRead || permission === permissionKeys.changeManage,
    ),
    isCabGroupMember: jest.fn(async () => false),
    problemsEnabled: jest.fn(async () => true),
    problemNumberPrefix: jest.fn(async () => 'PRB'),
  };
  const service = new ChangesService(
    prisma as never,
    access as never,
    {} as never,
    { enqueue: jest.fn() } as never,
  );
  return { prisma, access, service };
}

describe('owner eligibility on write and in the picker (BA-changes-10)', () => {
  it('rejects a manager whose assignment does not cover the change unit', async () => {
    const { service } = buildService({
      managers: [
        managerRow({ id: 'owner-1', displayName: 'Foreign', ouPath: '/datacenter' }),
      ],
    });

    await expect(
      service.assertOwnerEligible('owner-1', 'ou-target'),
    ).rejects.toMatchObject({
      code: changeErrorCodes.ownerNotManager,
      detail: 'out_of_scope',
    });
  });

  it('accepts the manager of the change unit and of a parent unit', async () => {
    const parent = buildService({
      managers: [
        managerRow({ id: 'owner-1', displayName: 'Parent', ouPath: '/helpdesk' }),
      ],
    });
    await expect(
      parent.service.assertOwnerEligible('owner-1', 'ou-target'),
    ).resolves.toBeUndefined();

    const exact = buildService({
      managers: [
        managerRow({ id: 'owner-1', displayName: 'Exact', ouPath: '/helpdesk/network' }),
      ],
    });
    await expect(
      exact.service.assertOwnerEligible('owner-1', 'ou-target'),
    ).resolves.toBeUndefined();
  });

  it('reports deactivation, anonymization and a missing unit distinctly', async () => {
    const inactive = buildService({
      managers: [
        managerRow({
          id: 'owner-1',
          displayName: 'Gone',
          isActive: false,
          ouPath: '/helpdesk',
        }),
      ],
    });
    await expect(
      inactive.service.assertOwnerEligible('owner-1', 'ou-target'),
    ).rejects.toMatchObject({ detail: 'inactive' });

    const anonymized = buildService({
      managers: [
        managerRow({
          id: 'owner-1',
          displayName: 'Erased',
          anonymizedAt: new Date('2026-02-01T00:00:00.000Z'),
          ouPath: '/helpdesk',
        }),
      ],
    });
    await expect(
      anonymized.service.assertOwnerEligible('owner-1', 'ou-target'),
    ).rejects.toMatchObject({ detail: 'anonymized' });

    const noUnit = buildService({ unitPath: null });
    await expect(
      noUnit.service.assertOwnerEligible('owner-1', 'ou-target'),
    ).rejects.toMatchObject({ code: changeErrorCodes.unitNotFound });
  });

  it('offers only managers of the requested unit in the picker', async () => {
    const { prisma, service } = buildService({
      managers: [
        managerRow({ id: 'owner-in', displayName: 'Inside', ouPath: '/helpdesk' }),
        managerRow({ id: 'owner-out', displayName: 'Outside', ouPath: '/datacenter' }),
      ],
    });

    const result = await service.searchOwners(
      { userId: 'manager-1', homeOrganizationalUnitId: 'ou-home' } as never,
      '',
      'ou-target',
    );

    expect(result.items.map((item) => item.id)).toEqual(['owner-in']);
    // One batched principal load for the whole page, never one per candidate.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.user.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: { in: ['owner-in', 'owner-out'] } },
      }),
    );
  });

  it('falls back to the viewer home unit and stays empty without one', async () => {
    const { prisma, service } = buildService({
      managers: [managerRow({ id: 'owner-in', displayName: 'Inside', ouPath: '/helpdesk' })],
    });

    await service.searchOwners(
      { userId: 'manager-1', homeOrganizationalUnitId: 'ou-home' } as never,
      '',
    );
    expect(prisma.organizationalUnit.findUnique).toHaveBeenCalledWith({
      where: { id: 'ou-home' },
      select: { ouPath: true },
    });

    const none = await service.searchOwners(
      { userId: 'manager-1', homeOrganizationalUnitId: null } as never,
      '',
    );
    expect(none.items).toEqual([]);
  });

  it('marks a stored owner as no longer eligible in the detail', async () => {
    const { service } = buildService({
      managers: [
        managerRow({ id: 'owner-1', displayName: 'Revoked', ouPath: '/datacenter' }),
      ],
    });

    const detail = await service.get({ userId: 'manager-1' } as never, 'change-1');

    expect(detail.ownerEligible).toBe(false);

    const eligible = buildService({
      managers: [managerRow({ id: 'owner-1', displayName: 'Fine', ouPath: '/helpdesk' })],
    });
    const ok = await eligible.service.get(
      { userId: 'manager-1' } as never,
      'change-1',
    );
    expect(ok.ownerEligible).toBe(true);

    const unowned = buildService({
      row: changeRow({ ownerUserId: null, owner: null }),
    });
    const none = await unowned.service.get(
      { userId: 'manager-1' } as never,
      'change-1',
    );
    expect(none.ownerEligible).toBeNull();
  });
});

describe('stale owner reconciliation (BA-changes-10)', () => {
  function buildReconciler(options: {
    readonly existingEvent?: Record<string, unknown> | null;
  }) {
    const prisma = {
      changeRequest: {
        findMany: jest.fn(async () => [
          {
            id: 'change-1',
            ownerUserId: 'owner-1',
            organizationalUnit: { ouPath: '/helpdesk/network' },
          },
        ]),
      },
      user: {
        findMany: jest.fn(async () => [
          managerRow({ id: 'owner-1', displayName: 'Revoked', ouPath: '/datacenter' }),
        ]),
      },
      changeEvent: {
        findFirst: jest.fn(async () => options.existingEvent ?? null),
        create: jest.fn(async () => undefined),
      },
    };
    const reconciler = new ChangeOwnerReconciler(prisma as never);
    return { prisma, reconciler };
  }

  it('records the drift once per owner assignment', async () => {
    const { prisma, reconciler } = buildReconciler({});

    const result = await reconciler.reconcile();

    expect(result).toEqual({ scanned: 1, drifted: 1, recorded: 1 });
    expect(prisma.changeEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changeId: 'change-1',
        action: 'owner',
        actorUserId: null,
        detail: {
          reason: 'owner_ineligible',
          eligibility: 'out_of_scope',
          ownerUserId: 'owner-1',
        },
      }),
    });
    expect(prisma.changeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: { not: null },
          status: { notIn: ['CLOSED', 'REJECTED', 'CANCELLED'] },
        }),
      }),
    );
  });

  it('does not repeat the event for the same assignment', async () => {
    const { prisma, reconciler } = buildReconciler({
      existingEvent: {
        detail: { reason: 'owner_ineligible', ownerUserId: 'owner-1' },
      },
    });

    const result = await reconciler.reconcile();

    expect(result).toEqual({ scanned: 1, drifted: 1, recorded: 0 });
    expect(prisma.changeEvent.create).not.toHaveBeenCalled();
  });

  it('stays silent for an owner that is still eligible', async () => {
    const prisma = {
      changeRequest: {
        findMany: jest.fn(async () => [
          {
            id: 'change-1',
            ownerUserId: 'owner-1',
            organizationalUnit: { ouPath: '/helpdesk/network' },
          },
        ]),
      },
      user: {
        findMany: jest.fn(async () => [
          managerRow({ id: 'owner-1', displayName: 'Fine', ouPath: '/helpdesk' }),
        ]),
      },
      changeEvent: { findFirst: jest.fn(), create: jest.fn() },
    };
    const reconciler = new ChangeOwnerReconciler(prisma as never);

    const result = await reconciler.reconcile();

    expect(result).toEqual({ scanned: 1, drifted: 0, recorded: 0 });
    expect(prisma.changeEvent.findFirst).not.toHaveBeenCalled();
  });
});
