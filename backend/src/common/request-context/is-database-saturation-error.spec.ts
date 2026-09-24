import { isDatabaseSaturationError } from './is-database-saturation-error';
import { resolveExceptionHttpStatus, toStandardErrorResponse } from './format-error-response';

describe('isDatabaseSaturationError', () => {
  it('recognises the pg-pool connect timeout, also nested in cause', () => {
    const pool = new Error('timeout exceeded when trying to connect');
    expect(isDatabaseSaturationError(pool)).toBe(true);
    expect(isDatabaseSaturationError(new Error('wrapped', { cause: pool }))).toBe(true);
  });

  it('recognises the statement timeout and the Prisma timeout codes', () => {
    expect(isDatabaseSaturationError({ code: '57014' })).toBe(true);
    expect(isDatabaseSaturationError({ code: 'P2024' })).toBe(true);
    expect(
      isDatabaseSaturationError({
        code: 'P2010',
        meta: { driverAdapterError: { cause: { originalCode: '57014' } } },
      }),
    ).toBe(true);
  });

  it('leaves other errors alone', () => {
    expect(isDatabaseSaturationError(new Error('boom'))).toBe(false);
    expect(isDatabaseSaturationError({ code: 'P2002' })).toBe(false);
    expect(isDatabaseSaturationError(null)).toBe(false);
  });

  it('maps saturation to 503 DATABASE_BUSY', () => {
    const error = new Error('timeout exceeded when trying to connect');
    expect(resolveExceptionHttpStatus(error)).toBe(503);
    expect(toStandardErrorResponse(error, 'r1')).toMatchObject({
      code: 'DATABASE_BUSY',
      requestId: 'r1',
    });
    expect(resolveExceptionHttpStatus(new Error('boom'))).toBe(500);
  });
});
