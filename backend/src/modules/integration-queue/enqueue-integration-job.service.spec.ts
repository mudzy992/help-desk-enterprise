import { IntegrationJobStatus, IntegrationJobType } from '../../generated/prisma/enums';
import { EnqueueIntegrationJobService } from './enqueue-integration-job.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('EnqueueIntegrationJobService', () => {
  const pending = {
    id: 'job-1',
    type: IntegrationJobType.EMAIL,
    status: IntegrationJobStatus.PENDING,
  };

  it('writes a PENDING job and adds it to BullMQ', async () => {
    const repository = {
      createPending: jest.fn().mockResolvedValue(pending),
      markFailed: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new EnqueueIntegrationJobService(
      repository as never,
      queue as never,
    );
    await expect(
      service.enqueue({
        type: IntegrationJobType.EMAIL,
        payload: {
          userId: 'user-1',
          toAddress: 'agent@epbih.ba',
          subject: 'Ticket',
          text: 'Body',
          templateKey: 'ticket.created',
          dedupeKey: 'ticket.created:msg-1',
        },
      }),
    ).resolves.toEqual(pending);
    expect(repository.createPending).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      IntegrationJobType.EMAIL,
      { integrationJobId: 'job-1' },
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

  it('adds TEAMS_STUB jobs to BullMQ', async () => {
    const teamsJob = { ...pending, type: IntegrationJobType.TEAMS_STUB };
    const repository = {
      createPending: jest.fn().mockResolvedValue(teamsJob),
      markFailed: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new EnqueueIntegrationJobService(
      repository as never,
      queue as never,
    );
    await service.enqueue({
      type: IntegrationJobType.TEAMS_STUB,
      payload: {
        eventType: 'ticket.created',
        event: 'ticket_created',
        ticketId: 'ticket-1',
        messageId: 'msg-1',
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      IntegrationJobType.TEAMS_STUB,
      { integrationJobId: 'job-1' },
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });
});
