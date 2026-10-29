import { ConsoleLogger, ForbiddenException, HttpStatus } from '@nestjs/common';
import { HttpRequestExceptionFilter } from './http-exception.filter';
import { RecentRequestLogBuffer } from './recent-request-log.buffer';
import { RequestContextLogger } from './request-context.logger';
import { runWithRequestId } from './request-context.storage';

describe('requestId correlation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps an unhandled 5xx stack in the primary container log message', () => {
    const errorSpy = jest
      .spyOn(ConsoleLogger.prototype, 'error')
      .mockImplementation();
    const json = jest.fn();
    const failure = new Error('database write failed');

    runWithRequestId('stack-request-id', () => {
      new HttpRequestExceptionFilter().catch(failure, {
        getType: () => 'http',
        switchToHttp: () => ({
          getResponse: () => ({
            setHeader: jest.fn(),
            status: (code: number) => {
              expect(code).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
              return { json };
            },
          }),
          getRequest: () => ({ headers: {} }),
        }),
      } as never);
    });

    const loggedMessage = String(errorSpy.mock.calls[0]?.[0]);
    expect(loggedMessage).toContain(
      'requestId=stack-request-id unhandled_http_exception status=500',
    );
    expect(loggedMessage).toContain('Error: database write failed');
  });

  it('uses the same requestId in the log buffer and the error response', () => {
    const buffer = new RecentRequestLogBuffer();
    const logger = new RequestContextLogger(buffer);
    jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation();
    const json = jest.fn();
    runWithRequestId('shared-request-id', () => {
      logger.error('handler_failed', 'SupportBundleController');
      new HttpRequestExceptionFilter().catch(
        new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Authorization failed',
        }),
        {
          getType: () => 'http',
          switchToHttp: () => ({
            getResponse: () => ({
              setHeader: jest.fn(),
              status: (code: number) => {
                expect(code).toBe(HttpStatus.FORBIDDEN);
                return { json };
              },
            }),
            getRequest: () => ({ headers: {} }),
          }),
        } as never,
      );
    });
    expect(buffer.listSince(new Date(0))[0]?.requestId).toBe('shared-request-id');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'Authorization failed',
        requestId: 'shared-request-id',
      }),
    );
  });
});
