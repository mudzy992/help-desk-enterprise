import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { resolveExceptionHttpStatus, toStandardErrorResponse } from './format-error-response';

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

  it('Paket 4.1: maps body-parser errors to 413/400 instead of 500', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 });
    expect(resolveExceptionHttpStatus(tooLarge)).toBe(413);
    expect(toStandardErrorResponse(tooLarge, 'r1')).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', requestId: 'r1' });
    const badJson = Object.assign(new Error('Unexpected token'), { type: 'entity.parse.failed', status: 400 });
    expect(resolveExceptionHttpStatus(badJson)).toBe(400);
    expect(toStandardErrorResponse(badJson, 'r2').code).toBe('INVALID_JSON');
    expect(resolveExceptionHttpStatus(new Error('boom'))).toBe(500);
  });
});
