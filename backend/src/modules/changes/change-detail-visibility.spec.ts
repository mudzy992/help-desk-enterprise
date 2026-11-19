jest.mock('../audit-log/record-audit-entry', () => ({
  recordAuditEntry: jest.fn(async () => undefined),
}));

// The CMDB grant is a separate boundary (BA-changes-02); this suite is about the
// projection, so the asset link is resolved globally.
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
import {
  changeDetailLevel,
  projectChangeEventDetail,
} from './change-visibility';

const scoped = { all: false, paths: ['/helpdesk'] } as const;

function changeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'change-1',
    sequence: 7,
    title: 'Firewall upgrade',
    type: 'NORMAL',
    status: 'AUTHORIZATION',
    risk: 'MEDIUM',
    plannedStart: new Date('2030-05-01T10:00:00.000Z'),
    plannedEnd: new Date('2030-05-01T12:00:00.000Z'),
    causesDowntime: true,
    owner: { id: 'owner-1', displayName: 'Owner', email: 'owner@example.test' },
    requester: {
      id: 'requester-1',
      displayName: 'Requester',
      email: 'requester@example.test',
    },
    cabGroup: { id: 'cab-1', name: 'CAB' },
    organizationalUnit: { id: 'ou-2', name: 'Network', ouPath: '/network' },
    services: [{ service: { id: 'service-1', name: 'VPN' } }],
    _count: { services: 1, assets: 3 },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    description: 'Upgrade the firewall',
    reason: 'Vendor end of support',
    impact: 'Branch traffic',
    likelihood: 'Medium',
    implementationPlan: 'Replace the appliance',
    backoutPlan: 'Restore the snapshot',
    testPlan: 'Run the smoke suite',
    communicationPlan: 'Notify the branches',
    actualStart: null,
    actualEnd: null,
    outcome: 'SUCCESSFUL',
    reviewNotes: 'Internal review of the rollout',
    templateId: 'template-1',
    problemId: 'problem-1',
    approvalRound: 2,
    conflictsAcknowledgedAt: null,
    submittedAt: new Date('2026-01-03T00:00:00.000Z'),
    authorizedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: 'Internal cancellation note',
    version: 4,
    template: { id: 'template-1', name: 'Standard change' },
    problem: {
      id: 'problem-1',
      sequence: 3,
      title: 'Recurring outages',
      status: 'OPEN',
    },
    assets: [
      {
        asset: {
          id: 'asset-1',
          assetTag: 'A-1',
          name: 'Branch switch',
          organizationalUnit: { ouPath: '/datacenter' },
        },
      },
    ],
    requesterUserId: 'requester-1',
    ownerUserId: 'owner-1',
    cabGroupId: 'cab-1',
    organizationalUnitId: 'ou-2',
    ...overrides,
  };
}

function buildService(options: {
  readonly scope?: { all: true } | { all: false; paths: readonly string[] };
  readonly permissions?: readonly string[];
  readonly cabMember?: boolean;
  readonly row?: Record<string, unknown>;
}) {
  const scope = options.scope ?? scoped;
  const permissions = new Set(options.permissions ?? []);
  const prisma = {
    changeRequest: {
      findFirst: jest.fn(async () => options.row ?? changeRow()),
    },
    changeEvent: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    user: { findMany: jest.fn(async (): Promise<unknown[]> => []) },
    groupMember: { count: jest.fn(async () => (options.cabMember ? 1 : 0)) },
    problem: { count: jest.fn(async () => 1) },
  };
  const access = {
    require: jest.fn(async () => scope),
    scopeOf: jest.fn(async () => scope),
    configuration: jest.fn(async () => ({ numberPrefix: 'CHG' })),
    hasPermission: jest.fn(
      (_viewer: unknown, permission: string) => permissions.has(permission),
    ),
    isCabGroupMember: jest.fn(async () => options.cabMember === true),
    isCabMember: jest.fn(
      async () => options.cabMember === true && permissions.has(permissionKeys.changeApprove),
    ),
    problemNumberPrefix: jest.fn(async () => 'PRB'),
    problemsEnabled: jest.fn(async () => true),
  };
  const service = new ChangesService(
    prisma as never,
    access as never,
    {} as never,
    { enqueue: jest.fn() } as never,
  );
  return { prisma, access, service };
}

describe('change detail level (BA-changes-09)', () => {
  it('keeps the full record for readers inside the unit scope', () => {
    expect(
      changeDetailLevel({
        inScope: true,
        isRequester: true,
        isOwner: false,
        isCabMember: true,
        canApprove: true,
      }),
    ).toBe('full');
  });

  it('gives requester and owner the plan they are accountable for', () => {
    const level = changeDetailLevel({
      inScope: false,
      isRequester: true,
      isOwner: false,
      isCabMember: false,
      canApprove: false,
    });
    expect(level).toBe('participant');
  });

  it('splits CAB members by their voting right', () => {
    const voter = changeDetailLevel({
      inScope: false,
      isRequester: false,
      isOwner: false,
      isCabMember: true,
      canApprove: true,
    });
    const observer = changeDetailLevel({
      inScope: false,
      isRequester: false,
      isOwner: false,
      isCabMember: true,
      canApprove: false,
    });
    expect([voter, observer]).toEqual(['voter', 'observer']);
  });

  it('falls back to the narrowest projection when no clause matches', () => {
    expect(
      changeDetailLevel({
        inScope: false,
        isRequester: false,
        isOwner: false,
        isCabMember: false,
        canApprove: true,
      }),
    ).toBe('observer');
  });
});

describe('change detail projection (BA-changes-09)', () => {
  it('serves in-scope readers everything, including assets and the problem link', async () => {
    const { service } = buildService({
      scope: { all: false, paths: ['/network'] },
      permissions: [permissionKeys.changeRead, permissionKeys.problemRead],
    });

    const detail = await service.get({ userId: 'reader-1' } as never, 'change-1');

    expect(detail.detailLevel).toBe('full');
    expect(detail.redactedFields).toEqual([]);
    expect(detail.implementationPlan).toBe('Replace the appliance');
    expect(detail.assets).toHaveLength(1);
    expect(detail.problem).toMatchObject({ number: 'PRB000003' });
  });

  it('gives the requester outside the scope the plan but no foreign links', async () => {
    const { access, service } = buildService({
      permissions: [permissionKeys.changeRead, permissionKeys.changeRequest],
    });

    const detail = await service.get(
      { userId: 'requester-1' } as never,
      'change-1',
    );

    expect(detail.detailLevel).toBe('participant');
    expect(detail.implementationPlan).toBe('Replace the appliance');
    expect(detail.reviewNotes).toBe('Internal review of the rollout');
    expect(detail.assets).toEqual([]);
    expect(detail.problem).toBeNull();
    expect(detail.redactedFields).toEqual(['assets', 'problem']);
    // The membership query is not paid for a known participant.
    expect(access.isCabGroupMember).not.toHaveBeenCalled();
  });

  it('gives a CAB voter the plans to evaluate but not the outcome or links', async () => {
    const { service } = buildService({
      permissions: [permissionKeys.changeRead, permissionKeys.changeApprove],
      cabMember: true,
    });

    const detail = await service.get(
      { userId: 'cab-voter' } as never,
      'change-1',
    );

    expect(detail.detailLevel).toBe('voter');
    expect(detail.backoutPlan).toBe('Restore the snapshot');
    expect(detail.reviewNotes).toBeNull();
    expect(detail.outcome).toBeNull();
    expect(detail.template).toBeNull();
    expect(detail.assets).toEqual([]);
    expect(detail.problem).toBeNull();
    expect(detail.redactedFields).toEqual(
      expect.arrayContaining(['assets', 'problem', 'outcome', 'reviewNotes']),
    );
  });

  it('gives a non-voting CAB member only the lifecycle record', async () => {
    const { service } = buildService({
      permissions: [permissionKeys.changeRead],
      cabMember: true,
    });

    const detail = await service.get(
      { userId: 'cab-reader' } as never,
      'change-1',
    );

    expect(detail.detailLevel).toBe('observer');
    expect(detail.description).toBeNull();
    expect(detail.implementationPlan).toBeNull();
    expect(detail.outcome).toBeNull();
    expect(detail.assets).toEqual([]);
    expect(detail.problem).toBeNull();
    expect(detail.redactedFields).toEqual(
      expect.arrayContaining([
        'description',
        'implementationPlan',
        'assets',
        'problem',
      ]),
    );
    // Lifecycle facts stay visible for everyone who may read the change.
    expect(detail.status).toBe('AUTHORIZATION');
    expect(detail.plannedStart).toBe('2030-05-01T10:00:00.000Z');
  });

  it('redacts event diffs for participants but keeps the lifecycle facts', async () => {
    const { prisma, service } = buildService({
      permissions: [permissionKeys.changeRead, permissionKeys.changeRequest],
    });
    prisma.changeEvent.findMany.mockResolvedValueOnce([
      {
        id: 'event-1',
        action: 'status',
        actorUserId: 'manager-1',
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
        detail: {
          from: 'ASSESSMENT',
          to: 'AUTHORIZATION',
          reason: 'Ready for CAB',
          changes: { risk: { from: 'LOW', to: 'MEDIUM' } },
          voterSnapshot: { round: 2, voters: ['u1'], quorum: 1 },
        },
      },
    ]);

    const events = await service.events(
      { userId: 'requester-1' } as never,
      'change-1',
    );

    expect(events.items[0]?.detail).toEqual({
      from: 'ASSESSMENT',
      to: 'AUTHORIZATION',
      reason: 'Ready for CAB',
    });
  });

  it('leaves event details untouched for in-scope readers', () => {
    const detail = {
      from: 'SCHEDULED',
      to: 'CANCELLED',
      changes: { plannedStart: { from: 'a', to: 'b' } },
    };
    expect(projectChangeEventDetail(detail, 'full')).toBe(detail);
    expect(projectChangeEventDetail(detail, 'participant')).toEqual({
      from: 'SCHEDULED',
      to: 'CANCELLED',
    });
    expect(projectChangeEventDetail('not-an-object', 'voter')).toEqual({});
  });
});
