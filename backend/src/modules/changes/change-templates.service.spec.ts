jest.mock('../audit-log/record-audit-entry', () => ({
  recordAuditEntry: jest.fn(async () => undefined),
}));

import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { ChangeTemplatesService } from './change-templates.service';
import { ChangeError, changeErrorCodes } from './changes.constants';

type Args = Record<string, unknown>;

const viewer = { userId: 'manager-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const revision = '2027-01-01T10:00:00.000Z';
const nextRevision = '2027-01-01T10:05:00.000Z';

const row = {
  name: 'Restart aplikacijskog servisa',
  description: 'Kratak prekid.',
  implementationPlan: 'Restart u terminu.',
  backoutPlan: 'Vraćanje prethodne instance.',
  testPlan: null,
  impact: 'LOW' as const,
  likelihood: 'MEDIUM' as const,
  causesDowntime: false,
  isActive: true,
  updatedAt: new Date(revision),
  services: [{ serviceId: 'svc-1' }, { serviceId: 'svc-2' }],
};

function storedTemplate() {
  return {
    id: 'template-1',
    ...row,
    impact: 'LOW' as const,
    createdAt: new Date('2026-12-01T09:00:00.000Z'),
    updatedAt: new Date(nextRevision),
    services: [{ service: { id: 'svc-1', name: 'Servis 1' } }],
    _count: { changes: 2 },
  };
}

const dto = {
  name: 'Restart uz najavu',
  description: 'Kratak prekid.',
  implementationPlan: 'Restart uz najavu korisnicima.',
  backoutPlan: 'Vraćanje prethodne instance.',
  testPlan: null,
  impact: 'MEDIUM' as const,
  likelihood: 'MEDIUM' as const,
  causesDowntime: false,
  isActive: true,
  serviceIds: ['svc-1', 'svc-3'],
};

function buildService() {
  const transaction = {
    changeTemplate: {
      findUnique: jest.fn(async (_args: Args): Promise<unknown> => row),
      findUniqueOrThrow: jest.fn(async (_args: Args): Promise<unknown> => ({ updatedAt: new Date(nextRevision) })),
      updateMany: jest.fn(async (_args: Args): Promise<unknown> => ({ count: 1 })),
    },
    changeTemplateService: {
      deleteMany: jest.fn(async (_args: Args): Promise<unknown> => ({ count: 2 })),
      createMany: jest.fn(async (_args: Args): Promise<unknown> => ({ count: 2 })),
    },
  };
  const prisma = {
    service: { count: jest.fn(async (_args: Args): Promise<number> => 2) },
    changeTemplate: { findUnique: jest.fn(async (_args: Args): Promise<unknown> => storedTemplate()) },
    $transaction: jest.fn(async (work: (tx: unknown) => unknown): Promise<unknown> => work(transaction)),
  };
  const access = {
    require: jest.fn(async () => ({ all: true })),
    hasPermission: jest.fn(() => true),
  };
  const service = new ChangeTemplatesService(prisma as never, access as never);
  return { prisma, access, service, transaction };
}

async function expectChangeError(run: Promise<unknown>, code: string) {
  await expect(run).rejects.toBeInstanceOf(ChangeError);
  await expect(run).rejects.toMatchObject({ code });
}

describe('change template conditional save (BA-changes-15)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an edit whose If-Match revision is older than the row', async () => {
    const { service, transaction } = buildService();

    await expectChangeError(
      service.update(viewer as never, 'template-1', dto as never, '"2026-12-31T10:00:00.000Z"'),
      changeErrorCodes.templateStale,
    );
    expect(transaction.changeTemplate.updateMany).not.toHaveBeenCalled();
    expect(recordAuditEntry).not.toHaveBeenCalled();
  });

  it('rejects an edit that carries no revision at all', async () => {
    const { service, transaction } = buildService();

    await expectChangeError(
      service.update(viewer as never, 'template-1', dto as never, undefined),
      changeErrorCodes.templateRevisionRequired,
    );
    expect(transaction.changeTemplate.updateMany).not.toHaveBeenCalled();
  });

  it('accepts the quoted entity tag the API returned', async () => {
    const { service, transaction } = buildService();

    await service.update(viewer as never, 'template-1', dto as never, `W/"${revision}"`);

    expect(transaction.changeTemplate.updateMany).toHaveBeenCalledTimes(1);
  });

  it('fails closed when another editor moved the row between read and write', async () => {
    const { service, transaction } = buildService();
    transaction.changeTemplate.updateMany.mockResolvedValueOnce({ count: 0 });

    await expectChangeError(
      service.update(viewer as never, 'template-1', dto as never, revision),
      changeErrorCodes.templateStale,
    );
    expect(transaction.changeTemplateService.deleteMany).not.toHaveBeenCalled();
    expect(recordAuditEntry).not.toHaveBeenCalled();
  });

  it('compares the row inside the transaction and replaces the service links', async () => {
    const { service, transaction } = buildService();

    await service.update(viewer as never, 'template-1', dto as never, revision);

    expect(transaction.changeTemplate.findUnique).toHaveBeenCalledTimes(1);
    expect(transaction.changeTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: 'template-1', updatedAt: row.updatedAt },
      data: expect.objectContaining({
        name: 'Restart uz najavu',
        impact: 'MEDIUM',
        updatedAt: expect.any(Date),
      }),
    });
    expect(transaction.changeTemplateService.deleteMany).toHaveBeenCalledWith({
      where: { templateId: 'template-1' },
    });
    expect(transaction.changeTemplateService.createMany).toHaveBeenCalledWith({
      data: [
        { templateId: 'template-1', serviceId: 'svc-1' },
        { templateId: 'template-1', serviceId: 'svc-3' },
      ],
    });
  });

  it('writes one audit row naming both revisions and the changed fields', async () => {
    const { service } = buildService();

    await service.update(viewer as never, 'template-1', dto as never, revision);

    expect(recordAuditEntry).toHaveBeenCalledTimes(1);
    const entry = (recordAuditEntry as jest.Mock).mock.calls[0]?.[1] as {
      action: string;
      entityId: string;
      actorUserId: string;
      metadata: Record<string, unknown>;
    };
    expect(entry).toMatchObject({
      action: 'change.template_saved',
      entityId: 'template-1',
      actorUserId: 'manager-1',
    });
    expect(entry.metadata).toMatchObject({
      operation: 'updated',
      changedFields: ['name', 'impact', 'implementationPlan', 'services'],
      textChanged: ['implementationPlan'],
      name: 'Restart uz najavu',
      previousName: 'Restart aplikacijskog servisa',
      servicesAdded: 1,
      servicesRemoved: 1,
      previousRevision: revision,
      revision: nextRevision,
    });
    // Plans are the record; the audit row must not duplicate their text.
    expect(JSON.stringify(entry.metadata)).not.toContain('Restart uz najavu korisnicima.');
  });

  it('skips the write and the audit row when the save changes nothing', async () => {
    const { service, transaction } = buildService();

    await service.update(
      viewer as never,
      'template-1',
      { ...dto, name: row.name, implementationPlan: row.implementationPlan, impact: 'LOW', serviceIds: ['svc-2', 'svc-1'] } as never,
      revision,
    );

    expect(transaction.changeTemplate.updateMany).not.toHaveBeenCalled();
    expect(recordAuditEntry).not.toHaveBeenCalled();
  });

  it('reports a missing template instead of creating a revision conflict', async () => {
    const { service, transaction } = buildService();
    transaction.changeTemplate.findUnique.mockResolvedValueOnce(null);

    await expectChangeError(
      service.update(viewer as never, 'missing', dto as never, revision),
      changeErrorCodes.templateNotFound,
    );
  });
});
