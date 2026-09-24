import { Logger } from '@nestjs/common';
import { SlaScanProcessor } from './sla-scan.processor';
import { slaScanBatchSize } from './sla.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Phase 2.1 (plan §2.1): the cycle runs in the worker and reports itself through
 * one metric line; a failure must reach BullMQ instead of being swallowed.
 */
describe('SlaScanProcessor', () => {
  function createProcessor(scanDue: jest.Mock) {
    const processor = new SlaScanProcessor({ scanDue } as never);
    return processor;
  }

  it('logs duration and processed count for the cycle', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const scanDue = jest.fn().mockResolvedValue(new Array(7).fill({}));
      await createProcessor(scanDue).process();
      expect(String(log.mock.calls[0]?.[0])).toContain('sla_scan_processed=7');
      expect(String(log.mock.calls[0]?.[0])).toMatch(/sla_scan_duration_ms=\d+/);
      expect(String(log.mock.calls[0]?.[0])).toContain(
        `sla_scan_batch_limit=${slaScanBatchSize}`,
      );
    } finally {
      log.mockRestore();
    }
  });

  it('does not hide a failing cycle from BullMQ', async () => {
    const scanDue = jest.fn().mockRejectedValue(new Error('database is down'));
    await expect(createProcessor(scanDue).process()).rejects.toThrow(
      'database is down',
    );
  });
});
