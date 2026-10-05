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
  function createProcessor(scanDue: jest.Mock, countDue: jest.Mock = jest.fn().mockResolvedValue(0)) {
    const processor = new SlaScanProcessor({ scanDue, countDue } as never);
    return processor;
  }

  it('logs duration and processed count for the cycle', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const scanDue = jest.fn().mockResolvedValue(new Array(7).fill({}));
      // M10 B5 (val 5): the backlog is counted after the cycle, not derived
      // from `processed - batchSize` (which is always 0).
      const countDue = jest.fn().mockResolvedValue(23);
      await createProcessor(scanDue, countDue).process();
      expect(String(log.mock.calls[0]?.[0])).toContain('sla_scan_processed=7');
      expect(String(log.mock.calls[0]?.[0])).toMatch(/sla_scan_duration_ms=\d+/);
      expect(String(log.mock.calls[0]?.[0])).toContain(
        `sla_scan_batch_limit=${slaScanBatchSize}`,
      );
      expect(String(log.mock.calls[0]?.[0])).toContain('sla_scan_remaining=23');
      expect(countDue).toHaveBeenCalled();
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
