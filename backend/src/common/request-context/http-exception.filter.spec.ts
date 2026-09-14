import { HttpStatus } from '@nestjs/common';
import { HttpRequestExceptionFilter } from './http-exception.filter';
import { runWithRequestId } from './request-context.storage';
import { ForbiddenException } from '@nestjs/common';

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
});
