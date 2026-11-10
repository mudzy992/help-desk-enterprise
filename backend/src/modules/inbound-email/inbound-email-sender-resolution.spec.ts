import { InboundEmailService } from './inbound-email.service';
import type { InboundProcessingPorts } from './process-inbound-message';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../tickets/tickets.service', () => ({
  TicketsService: class TicketsService {},
}));
jest.mock('../tickets/tickets-collaboration.service', () => ({
  TicketsCollaborationService: class TicketsCollaborationService {},
}));
jest.mock('../tickets/attachments/tickets-attachments.service', () => ({
  TicketsAttachmentsService: class TicketsAttachmentsService {},
}));
jest.mock('../tickets/reopen/tickets-reopen.service', () => ({
  TicketsReopenService: class TicketsReopenService {},
}));

function portsFor(users: readonly Record<string, unknown>[]) {
  const findMany = jest.fn().mockResolvedValue(users);
  const service = new InboundEmailService(
    { user: { findMany } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const ports = (service as unknown as {
    ports: (...args: unknown[]) => InboundProcessingPorts;
  }).ports({}, {}, 'inbound-1', 'owner', async () => undefined);
  return { ports, findMany };
}

describe('inbound sender resolution with case-insensitive duplicates (BA-inbound-email-10)', () => {
  it('resolves a single insensitive match deterministically', async () => {
    const user = { id: 'user-1', email: 'Ana@example.test', isActive: true };
    const { ports, findMany } = portsFor([user]);

    await expect(ports.findSenderByEmail('ana@example.test')).resolves.toEqual(user);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 2,
    }));
  });

  it('refuses to pick an actor when two users differ only by e-mail case', async () => {
    const { ports } = portsFor([
      { id: 'user-1', email: 'Ana@example.test', isActive: true },
      { id: 'user-2', email: 'ana@example.test', isActive: true },
    ]);

    await expect(ports.findSenderByEmail('ANA@example.test')).resolves.toBeNull();
  });

  it('returns null when nobody matches', async () => {
    const { ports } = portsFor([]);
    await expect(ports.findSenderByEmail('ghost@example.test')).resolves.toBeNull();
  });
});
