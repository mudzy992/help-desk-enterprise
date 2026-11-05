import { ConflictException, HttpException } from '@nestjs/common';
import { executeTemplatesOperation } from './map-templates-error';

function uniqueError(target: string): Error & { code: string; meta: { target: string } } {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target },
  });
}

describe('executeTemplatesOperation unique-name mapping', () => {
  it('maps the live playbook name index to a stable 409 conflict', async () => {
    const error = uniqueError('playbook_live_name_lower_key');
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
    const error = uniqueError('response_template_shared_name_lower_key');
    const mapped = await executeTemplatesOperation(async () => {
      throw error;
    }).catch((caught: unknown) => caught);

    expect(mapped).toBeInstanceOf(ConflictException);
    if (!(mapped instanceof HttpException)) throw new Error('expected an HTTP conflict');
    expect(mapped.getStatus()).toBe(409);
    expect(mapped.getResponse()).toMatchObject({ code: 'TEMPLATE_NAME_TAKEN' });
  });

  it('does not reinterpret other unique indexes as a playbook name conflict', async () => {
    const error = uniqueError('Playbook_pkey');
    await expect(
      executeTemplatesOperation(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
