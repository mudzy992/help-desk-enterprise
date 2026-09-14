import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { IntegrationQueueProcessor } from './integration-queue.processor';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('IntegrationQueueProcessor', () => {
  it('marks a successful EMAIL job COMPLETED', async () => {
    const record = {
      id: 'job-1',
      type: IntegrationJobType.EMAIL,
      status: IntegrationJobStatus.PENDING,
      payload: { userId: 'user-1' },
      attempts: 0,
    };
    const repository = {
      findById: jest.fn().mockResolvedValue(record),
      markProcessing: jest.fn().mockResolvedValue({ ...record, attempts: 1 }),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn(),
      markDeadLetter: jest.fn(),
    };
    const settingsService = {
      getSetting: jest.fn(async (key: string) => {
        if (key.includes('enabled') || key.includes('Enabled')) {
          return true;
        }
        if (key.includes('typesCsv')) {
          return 'email,edge,teams';
        }
        return 10;
      }),
    };
    const processEmail = { process: jest.fn().mockResolvedValue(undefined) };
    const processEdge = { process: jest.fn() };
    const processTeams = { process: jest.fn().mockResolvedValue(undefined) };
    const queue = { add: jest.fn() };
    const processor = new IntegrationQueueProcessor(
      repository as never,
      settingsService as never,
      processEmail as never,
      processEdge as never,
      processTeams as never,
      queue as never,
    );
    await processor.process({
      data: { integrationJobId: 'job-1' },
    } as never);
    expect(processEmail.process).toHaveBeenCalledWith(record.payload);
    expect(processTeams.process).not.toHaveBeenCalled();
    expect(repository.markCompleted).toHaveBeenCalledWith('job-1');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('marks a successful TEAMS_STUB job COMPLETED without email delivery', async () => {
    const record = {
      id: 'job-2',
      type: IntegrationJobType.TEAMS_STUB,
      status: IntegrationJobStatus.PENDING,
      payload: {
        eventType: 'ticket.created',
        event: 'ticket_created',
        ticketId: 'ticket-1',
        messageId: 'msg-1',
      },
      attempts: 0,
    };
    const repository = {
      findById: jest.fn().mockResolvedValue(record),
      markProcessing: jest.fn().mockResolvedValue({ ...record, attempts: 1 }),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn(),
      markDeadLetter: jest.fn(),
    };
    const settingsService = {
      getSetting: jest.fn(async (key: string) => {
        if (key.includes('enabled') || key.includes('Enabled')) {
          return true;
        }
        if (key.includes('typesCsv')) {
          return 'email,edge,teams';
        }
        return 10;
      }),
    };
    const processEmail = { process: jest.fn() };
    const processEdge = { process: jest.fn() };
    const processTeams = { process: jest.fn().mockResolvedValue(undefined) };
    const queue = { add: jest.fn() };
    const processor = new IntegrationQueueProcessor(
      repository as never,
      settingsService as never,
      processEmail as never,
      processEdge as never,
      processTeams as never,
      queue as never,
    );
    await processor.process({
      data: { integrationJobId: 'job-2' },
    } as never);
    expect(processTeams.process).toHaveBeenCalledWith(record.payload);
    expect(processEmail.process).not.toHaveBeenCalled();
    expect(repository.markCompleted).toHaveBeenCalledWith('job-2');
  });
});
