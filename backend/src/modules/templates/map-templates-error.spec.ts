import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { executeTemplatesOperation, mapTemplatesError } from './map-templates-error';
import { TemplatesError } from './templates.error';

function uniqueError(meta: unknown): Error & { code: string; meta: unknown } {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta,
  });
}

describe('executeTemplatesOperation unique-name mapping', () => {
  it('maps an oversized synchronous bulk attach to a stable 400 error', () => {
    const mapped = mapTemplatesError(
      new TemplatesError('TICKET_PLAYBOOK_BULK_LIMIT_EXCEEDED', { limit: 25, requested: 26 }),
    );

    expect(mapped).toBeInstanceOf(BadRequestException);
    if (!(mapped instanceof HttpException)) throw new Error('expected a bad request');
    expect(mapped.getStatus()).toBe(400);
    expect(mapped.getResponse()).toMatchObject({
      code: 'TICKET_PLAYBOOK_BULK_LIMIT_EXCEEDED',
      details: { limit: 25, requested: 26 },
    });
  });

  it('maps the live playbook name index to a stable 409 conflict', async () => {
    const error = uniqueError({
      modelName: 'Playbook',
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          constraint: { index: 'playbook_live_name_lower_key' },
          table: 'Playbook',
        },
      },
    });
    const mapped = await executeTemplatesOperation(async () => {
      throw error;
    }).catch((caught: unknown) => caught);

    expect(mapped).toBeInstanceOf(ConflictException);
    expect(mapped).toBeInstanceOf(HttpException);
    if (!(mapped instanceof HttpException)) throw new Error('expected an HTTP conflict');
    expect(mapped.getStatus()).toBe(409);
    expect(mapped.getResponse()).toMatchObject({ code: 'PLAYBOOK_NAME_TAKEN' });
  });

  it('keeps response-template name conflicts on their existing stable code', async () => {
    const error = uniqueError({ target: 'response_template_shared_name_lower_key' });
    const mapped = await executeTemplatesOperation(async () => {
      throw error;
    }).catch((caught: unknown) => caught);

    expect(mapped).toBeInstanceOf(ConflictException);
    if (!(mapped instanceof HttpException)) throw new Error('expected an HTTP conflict');
    expect(mapped.getStatus()).toBe(409);
    expect(mapped.getResponse()).toMatchObject({ code: 'TEMPLATE_NAME_TAKEN' });
  });

  it('does not reinterpret other unique indexes as a playbook name conflict', async () => {
    const error = uniqueError({ target: 'Playbook_pkey' });
    await expect(
      executeTemplatesOperation(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
