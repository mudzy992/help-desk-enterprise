import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { toStandardErrorResponse } from './format-error-response';

describe('toStandardErrorResponse', () => {
  it('keeps existing code and message and adds requestId at the top level', () => {
    const body = toStandardErrorResponse(
      new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Authorization failed',
      }),
      'req-123',
    );
    expect(body).toEqual({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
      details: {},
      requestId: 'req-123',
    });
  });

  it('maps validation arrays into details without dropping code/message contract', () => {
    const body = toStandardErrorResponse(
      new BadRequestException({
        message: ['format must be csv or json'],
        error: 'Bad Request',
        statusCode: 400,
      }),
      'req-456',
    );
    expect(body.code).toBe('VALIDATION');
    expect(body.message).toBe('Validation failed');
    expect(body.details).toEqual({ messages: ['format must be csv or json'] });
    expect(body.requestId).toBe('req-456');
  });

  it('hides unknown errors behind INTERNAL_ERROR', () => {
    expect(toStandardErrorResponse(new Error('secret stack'), 'req-789')).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: {},
      requestId: 'req-789',
    });
  });
});
