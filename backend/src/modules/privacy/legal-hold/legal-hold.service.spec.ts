jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));

import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import type { PrivacyActor } from '../privacy-actor';
import { PrivacyError } from '../privacy.error';
import { LegalHoldService } from './legal-hold.service';

const actor = { principal: { subjectId: 'admin-1' }, requestId: 'req-1', sessionId: null } as unknown as PrivacyActor;
const now = new Date('2026-09-28T10:00:00.000Z');

function setup(ticket: Record<string, unknown> | null, user: Record<string, unknown> | null = null) {
  const transaction = {
    ticket: { findFirst: jest.fn(async () => ticket), update: jest.fn(async () => ({})) },
    user: { findUnique: jest.fn(async () => user), update: jest.fn(async () => ({})) },
  };
  const prisma = { $transaction: jest.fn(async (run: (tx: typeof transaction) => unknown) => run(transaction)) };
  return { service: new LegalHoldService(prisma as never), transaction };
}

const heldTicket = { id: 't-1', ticketNumber: 'HD-2026-000123', originUnitId: 'ou-1', contentRedactedAt: null };

describe('LegalHoldService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('finds a ticket by its number and updates it by id', async () => {
    const { service, transaction } = setup({ ...heldTicket, legalHoldAt: null });
    const view = await service.set('ticket', 'HD-2026-000123', 'Spor pred sudom, predmet 12/26', actor, now);

    expect(transaction.ticket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ id: 'HD-2026-000123' }, { ticketNumber: 'HD-2026-000123' }] } }),
    );
    expect(transaction.ticket.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { legalHoldAt: now, legalHoldReason: 'Spor pred sudom, predmet 12/26', legalHoldById: 'admin-1' },
    });
    expect(view).toEqual({ target: 'ticket', id: 't-1', label: 'HD-2026-000123', heldAt: now.toISOString(), reason: 'Spor pred sudom, predmet 12/26' });
    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: 't-1', organizationalUnitId: 'ou-1', actorUserId: 'admin-1' }),
    );
  });

  it('rejects setting a hold twice and clearing a hold that is not set', async () => {
    const held = setup({ ...heldTicket, legalHoldAt: now });
    await expect(held.service.set('ticket', 't-1', 'razlog dovoljno dug', actor, now)).rejects.toBeInstanceOf(PrivacyError);
    const free = setup({ ...heldTicket, legalHoldAt: null });
    await expect(free.service.clear('ticket', 't-1', 'razlog dovoljno dug', actor, now)).rejects.toBeInstanceOf(PrivacyError);
    expect(held.transaction.ticket.update).not.toHaveBeenCalled();
    expect(free.transaction.ticket.update).not.toHaveBeenCalled();
  });

  it('clears a ticket hold and audits the reason', async () => {
    const { service, transaction } = setup({ ...heldTicket, legalHoldAt: now });
    await service.clear('ticket', 'HD-2026-000123', 'Predmet okončan pravosnažno', actor, now);
    expect(transaction.ticket.update).toHaveBeenCalledWith({
      where: { id: 't-1' },
      data: { legalHoldAt: null, legalHoldReason: null, legalHoldById: null },
    });
    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: { target: 'ticket', reason: 'Predmet okončan pravosnažno' } }),
    );
  });

  it('reports an unknown ticket as not found', async () => {
    const { service } = setup(null);
    await expect(service.set('ticket', 'HD-0', 'razlog dovoljno dug', actor, now)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not place a hold on an anonymized person', async () => {
    const { service, transaction } = setup(null, { id: 'u-1', displayName: 'Bivši korisnik #7F3A', legalHoldAt: null, anonymizedAt: now });
    await expect(service.set('user', 'u-1', 'razlog dovoljno dug', actor, now)).rejects.toBeInstanceOf(PrivacyError);
    expect(transaction.user.update).not.toHaveBeenCalled();
  });
});
