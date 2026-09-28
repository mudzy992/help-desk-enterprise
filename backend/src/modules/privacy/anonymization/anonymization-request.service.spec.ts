jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../privacy-identity-confirmer', () => ({ PrivacyIdentityConfirmer: class PrivacyIdentityConfirmer {} }));
jest.mock('../../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));
jest.mock('./anonymization.service', () => ({ AnonymizationService: class AnonymizationService {} }));

import { AnonymizationRequestService } from './anonymization-request.service';

const actor = { principal: { subjectId: 'admin-1' }, requestId: 'r', sessionId: 's' } as never;

function setup(overrides: { blockers?: string[]; email?: string; requireSecondApprover?: boolean } = {}) {
  process.env.PRIVACY_TOMBSTONE_KEY = 'unit-test-tombstone-key-012345';
  const created: unknown[] = [];
  const transaction = {
    $queryRaw: jest.fn(async () => []),
    privacyErasure: {
      count: jest.fn(async () => 0),
      create: jest.fn(async (args: unknown) => {
        created.push(args);
        return { id: 'er-1' };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => ({ userId: 'u-1' })),
    },
    auditLog: {},
    $executeRaw: jest.fn(),
  };
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ email: overrides.email ?? 'amra@epbih.ba' })) },
    dataSubjectRequest: { count: jest.fn(async () => 1) },
    privacyErasure: {
      findUnique: jest.fn(async () => ({
        id: 'er-1',
        userId: 'u-1',
        status: 'PENDING_APPROVAL',
        requestedByUserId: 'admin-1',
        approvalDeadline: new Date(Date.now() + 86_400_000),
      })),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(transaction)),
  };
  const anonymization = {
    blockers: jest.fn(async () => overrides.blockers ?? []),
    preview: jest.fn(async () => ({ ticketsInScope: 1, ticketsOnLegalHold: 0, textReplacements: 2, examples: [], counts: {} })),
    allocatePseudonym: jest.fn(async () => ({ tag: 'AB12', displayName: 'Bivši korisnik #AB12', email: 'x' })),
    getErasure: jest.fn(async (id: string) => ({ id })),
  };
  const confirmer = { confirm: jest.fn(async () => 'mfa') };
  const loader = {
    load: jest.fn(async () => ({ requireSecondApprover: overrides.requireSecondApprover ?? false, deleteOwnAttachmentsDefault: false })),
  };
  const queue = { add: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) };
  const service = new AnonymizationRequestService(
    prisma as never,
    anonymization as never,
    confirmer as never,
    loader as never,
    queue as never,
  );
  return { service, queue, confirmer, created, transaction };
}

describe('AnonymizationRequestService (§6.1)', () => {
  it('refuses a blocked user before asking for MFA', async () => {
    const { service, confirmer } = setup({ blockers: ['active'] });
    await expect(service.request('u-1', { confirmEmail: 'amra@epbih.ba' }, actor)).rejects.toMatchObject({
      code: 'ANONYMIZATION_BLOCKED',
    });
    expect(confirmer.confirm).not.toHaveBeenCalled();
  });

  it('requires the typed e-mail to match (case-insensitive)', async () => {
    const { service } = setup();
    await expect(service.request('u-1', { confirmEmail: 'other@epbih.ba' }, actor)).rejects.toMatchObject({
      code: 'CONFIRMATION_MISMATCH',
    });
  });

  it('queues the job directly without four-eyes', async () => {
    const { service, queue, created } = setup();
    await service.request('u-1', { confirmEmail: 'AMRA@epbih.ba', code: '123456' }, actor);
    expect(created[0]).toMatchObject({ data: { status: 'QUEUED', approvalDeadline: null } });
    expect(queue.add).toHaveBeenCalledWith('anonymize-user', { erasureId: 'er-1' }, expect.objectContaining({ jobId: 'anonymize-user-er-1' }));
  });

  it('waits for approval with four-eyes and does not queue', async () => {
    const { service, queue, created } = setup({ requireSecondApprover: true });
    await service.request('u-1', { confirmEmail: 'amra@epbih.ba' }, actor);
    expect(created[0]).toMatchObject({ data: { status: 'PENDING_APPROVAL' } });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('the approver must be a different SUPER_ADMIN', async () => {
    const { service } = setup();
    await expect(service.approve('er-1', '123456', actor)).rejects.toMatchObject({ code: 'APPROVER_MUST_DIFFER' });
    const other = { principal: { subjectId: 'admin-2' }, requestId: null, sessionId: null } as never;
    const { service: second, queue } = setup();
    await second.approve('er-1', '123456', other);
    expect(queue.add).toHaveBeenCalled();
  });
});
