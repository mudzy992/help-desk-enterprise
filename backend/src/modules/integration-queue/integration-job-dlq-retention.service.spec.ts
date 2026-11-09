import { integrationJobDlqRetentionBatchSize } from './integration-queue.constants';
import { IntegrationJobDlqRetentionService } from './integration-job-dlq-retention.service';

jest.mock('./load-integration-queue-settings', () => ({
  loadIntegrationQueueSettings: jest.fn().mockResolvedValue({ deadLetterRetentionDays: 30 }),
}));
jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

describe('IntegrationJobDlqRetentionService', () => {
  it('performs only one bounded repository sweep at the configured cutoff', async () => {
    const now = new Date('2026-10-30T12:00:00Z');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    try {
      const repository = { deleteDeadLetterOlderThan: jest.fn().mockResolvedValue({ count: integrationJobDlqRetentionBatchSize }) };
      const service = new IntegrationJobDlqRetentionService(repository as never, {} as never);
      await expect(service.sweep()).resolves.toBe(integrationJobDlqRetentionBatchSize);
      expect(repository.deleteDeadLetterOlderThan).toHaveBeenCalledTimes(1);
      expect(repository.deleteDeadLetterOlderThan).toHaveBeenCalledWith(new Date('2026-09-30T12:00:00Z'));
    } finally {
      clock.mockRestore();
    }
  });
});
