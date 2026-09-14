import { ConsoleLogger } from '@nestjs/common';
import { RecentRequestLogBuffer } from './recent-request-log.buffer';
import { RequestContextLogger } from './request-context.logger';
import { runWithRequestId } from './request-context.storage';

describe('RequestContextLogger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores the same requestId on the captured log row', () => {
    const buffer = new RecentRequestLogBuffer();
    const logger = new RequestContextLogger(buffer);
    jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation();
    runWithRequestId('corr-1', () => {
      logger.log('ticket_created', 'TicketsService');
    });
    const captured = buffer.listSince(new Date(0));
    expect(captured).toHaveLength(1);
    expect(captured[0]?.requestId).toBe('corr-1');
    expect(captured[0]?.message).toBe('ticket_created');
  });
});
