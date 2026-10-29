import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import { StatusPageController } from './status-page.controller';

describe('StatusPageController revision precondition (BA-status-page-19)', () => {
  const incidents = { edit: jest.fn().mockResolvedValue(undefined) };
  const controller = new StatusPageController({} as never, incidents as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when an incident edit omits If-Match', async () => {
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: { subjectId: 'operator-1' },
      headers: {},
    };

    await expect(controller.edit(request as never, 'incident-1', { title: 'Updated' }, undefined)).rejects.toMatchObject({
      status: 400,
      response: { code: 'INCIDENT_REVISION_REQUIRED' },
    });
    expect(incidents.edit).not.toHaveBeenCalled();
  });
});
