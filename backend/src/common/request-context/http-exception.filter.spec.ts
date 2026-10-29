import { HttpStatus } from '@nestjs/common';
import { HttpRequestExceptionFilter } from './http-exception.filter';
import { runWithRequestId } from './request-context.storage';
import { ForbiddenException } from '@nestjs/common';
import { OptimisticConcurrencyError } from '../optimistic-concurrency/optimistic-concurrency.error';

describe('HttpRequestExceptionFilter', () => {
  it('writes the ALS requestId into the JSON body and X-Request-Id header', () => {
    const setHeader = jest.fn();
    const json = jest.fn();
    const filter = new HttpRequestExceptionFilter();
    runWithRequestId('same-request-id', () => {
      filter.catch(
        new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Authorization failed',
        }),
        {
          getType: () => 'http',
          switchToHttp: () => ({
            getResponse: () => ({
              setHeader,
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
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'same-request-id');
    expect(json).toHaveBeenCalledWith({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
      details: {},
      requestId: 'same-request-id',
    });
  });

  it('returns the current strong ETag on a stale-write response', () => {
    const setHeader = jest.fn();
    const json = jest.fn();
    new HttpRequestExceptionFilter().catch(
      new OptimisticConcurrencyError('OPTIMISTIC_STALE_WRITE', 412, '"v9"'),
      {
        getType: () => 'http',
        switchToHttp: () => ({
          getResponse: () => ({ setHeader, status: (code: number) => {
            expect(code).toBe(412);
            return { json };
          } }),
          getRequest: () => ({ headers: { 'x-request-id': 'stale-request' } }),
        }),
      } as never,
    );
    expect(setHeader).toHaveBeenCalledWith('ETag', '"v9"');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'OPTIMISTIC_STALE_WRITE' }));
  });
});
