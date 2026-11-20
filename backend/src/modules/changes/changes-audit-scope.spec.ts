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

import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangesService } from './changes.service';

const auditMock = recordAuditEntry as jest.MockedFunction<typeof recordAuditEntry>;

function changeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'change-1',
    sequence: 7,
    title: 'Firewall upgrade',
    type: 'NORMAL',
    status: 'DRAFT',
    risk: 'MEDIUM',
    impact: 'MEDIUM',
    likelihood: 'MEDIUM',
    plannedStart: null,
    plannedEnd: null,
    causesDowntime: false,
    description: 'Short description',
    reason: null,
    implementationPlan: null,
    backoutPlan: null,
    testPlan: null,
    communicationPlan: null,
    owner: null,
    requester: { id: 'requester-1', displayName: 'Requester', email: 'r@example.test' },
    cabGroup: null,
    organizationalUnit: { id: 'ou-1', name: 'Network', ouPath: '/helpdesk/network' },
    services: [],
    assets: [],
    template: null,
    problem: null,
    _count: { services: 0, assets: 0 },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
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
    requesterUserId: 'requester-1',
    ownerUserId: null,
    cabGroupId: null,
    organizationalUnitId: 'ou-1',
    ...overrides,
  };
}

function build(options: { readonly row?: Record<string, unknown> } = {}) {
  let row = options.row ?? changeRow();
  const transaction = {
    changeRequest: { updateMany: jest.fn(async () => ({ count: 1 })) },
    changeEvent: { create: jest.fn(async () => undefined) },
    changeRequestService: { deleteMany: jest.fn(), createMany: jest.fn() },
    changeRequestAsset: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    changeRequest: {
      findFirst: jest.fn(async () => row),
      updateMany: transaction.changeRequest.updateMany,
    },
    changeEvent: { create: jest.fn(async () => undefined), findMany: jest.fn(async () => []) },
    problem: { count: jest.fn(async () => 1) },
    user: { findMany: jest.fn(async () => []) },
    organizationalUnit: { findUnique: jest.fn(async () => ({ ouPath: '/helpdesk/network' })) },
    $transaction: jest.fn(async (operation: (client: unknown) => Promise<unknown>) =>
      operation(transaction),
    ),
  };
  const access = {
    require: jest.fn(async () => ({ all: true })),
    requireUnitInScope: jest.fn(async () => undefined),
    scopeOf: jest.fn(async () => ({ all: true })),
    configuration: jest.fn(async () => ({
      numberPrefix: 'CHG',
      freezePeriods: [],
      timeZone: 'Europe/Sarajevo',
      leadTimeHours: 0,
    })),
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
  return {
    access,
    prisma,
    service,
    transaction,
    setRow: (next: Record<string, unknown>) => {
      row = next;
    },
  };
}

const viewer = { userId: 'manager-1', homeOrganizationalUnitId: 'ou-1' } as never;

describe('canonical audit for change update and claim (BA-changes-11)', () => {
  beforeEach(() => auditMock.mockClear());

  it('writes change.updated with the reference diff and no free text', async () => {
    const harness = build();

    await harness.service.update(viewer, 'change-1', {
      version: 3,
      title: 'Firewall upgrade v2',
      description: 'A much longer new description that must not reach the audit log',
      impact: 'HIGH',
      ownerUserId: null,
    });

    const call = auditMock.mock.calls.at(-1);
    expect(call).toBeDefined();
    const [, input] = call!;
    expect(input).toMatchObject({
      action: auditLogActions.changeUpdated,
      entityType: auditLogEntityTypes.change,
      entityId: 'change-1',
      organizationalUnitId: 'ou-1',
      actorUserId: 'manager-1',
    });
    expect(input.metadata).toMatchObject({
      changedFields: expect.arrayContaining(['title', 'impact', 'description']),
      textChanged: ['description'],
      impact: 'HIGH',
      previousImpact: 'MEDIUM',
    });
    // Minimization: neither the old nor the new free text is copied.
    const serialized = JSON.stringify(input.metadata);
    expect(serialized).not.toContain('much longer new description');
    expect(serialized).not.toContain('Firewall upgrade v2');
  });

  it('fires once per write, inside the same transaction as the event', async () => {
    const harness = build();

    await harness.service.update(viewer, 'change-1', { version: 3, title: 'Renamed change' });

    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(harness.transaction.changeEvent.create).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledTimes(1);
    // The audit client is the transaction, not the root client: a failed audit
    // must roll back the change and the event with it.
    expect(auditMock.mock.calls[0]?.[0]).toBe(harness.transaction);
  });

  it('writes nothing when the update changes nothing', async () => {
    const harness = build();

    await harness.service.update(viewer, 'change-1', { version: 3, title: 'Firewall upgrade' });

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('partitions the entry into the destination unit when the change moves', async () => {
    const harness = build();

    await harness.service.update(viewer, 'change-1', {
      version: 3,
      organizationalUnitId: 'ou-2',
    });

    const [, input] = auditMock.mock.calls.at(-1)!;
    expect(input.organizationalUnitId).toBe('ou-2');
    expect(input.metadata).toMatchObject({
      organizationalUnitId: 'ou-2',
      previousOrganizationalUnitId: 'ou-1',
    });
  });

  it('audits a claim with both owners and the change unit', async () => {
    const harness = build({ row: changeRow({ ownerUserId: 'owner-old' }) });

    await harness.service.claim(viewer, 'change-1');

    const [, input] = auditMock.mock.calls.at(-1)!;
    expect(input).toMatchObject({
      action: auditLogActions.changeClaimed,
      entityType: auditLogEntityTypes.change,
      entityId: 'change-1',
      organizationalUnitId: 'ou-1',
      actorUserId: 'manager-1',
      metadata: { ownerUserId: 'manager-1', previousOwnerUserId: 'owner-old' },
    });
    expect(auditMock.mock.calls[0]?.[0]).toBe(harness.transaction);
  });

  it('does not audit a claim by the current owner', async () => {
    const harness = build({ row: changeRow({ ownerUserId: 'manager-1' }) });

    await harness.service.claim(viewer, 'change-1');

    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});
