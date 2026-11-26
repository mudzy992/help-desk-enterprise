import { UnauthorizedException } from '@nestjs/common';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  SESSION_ID_REQUEST_KEY,
} from '../authentication/authenticated-request';
import { BulkPasswordResetController } from './bulk-password-reset.controller';
import type { BulkPasswordResetResult } from './bulk-password-reset.service';

/*
  W2.23 (`BA-security-02`): the transport half of "no false terminal success".

  A run that ends `PARTIAL` — at least one target not blocked, or a committed
  block whose accelerator is still pending — must not answer `200`. The body keeps
  the counters (so the admin sees *what* is outstanding), and the status line is
  `202`, which every HTTP client in this product already treats as a success for
  parsing purposes (`response.ok`).
*/

const complete: BulkPasswordResetResult = {
  eligibleUsers: 3,
  changedUsers: 2,
  revokedSessions: 4,
  failedUsers: 0,
  pendingUsers: 0,
  status: 'COMPLETE',
};

function createController(result: BulkPasswordResetResult) {
  const execute = jest.fn(async () => result);
  const controller = new BulkPasswordResetController({ execute } as never);
  const response = { status: jest.fn() };
  // The guard chain attaches the caller under the shared request keys.
  const request = {
    [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: { subjectId: 'super-1' },
    [SESSION_ID_REQUEST_KEY]: 'session-1',
  } as never;
  return { controller, execute, response, request };
}

describe('BulkPasswordResetController', () => {
  it('answers 200 (no status override) for a COMPLETE run and returns the counters', async () => {
    const { controller, execute, response, request } = createController(complete);

    const body = await controller.execute(request, { code: '123456' }, response);

    expect(body).toEqual(complete);
    expect(response.status).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      { subjectId: 'super-1', sessionId: 'session-1' },
      { code: '123456' },
    );
  });

  it('answers 202 for a PARTIAL run instead of a lazy 200', async () => {
    const partial: BulkPasswordResetResult = {
      ...complete,
      failedUsers: 1,
      pendingUsers: 2,
      status: 'PARTIAL',
    };
    const { controller, response, request } = createController(partial);

    const body = await controller.execute(request, {}, response);

    expect(response.status).toHaveBeenCalledWith(202);
    // The body still carries the per-target state a retry needs.
    expect(body).toMatchObject({ failedUsers: 1, pendingUsers: 2, status: 'PARTIAL' });
  });

  it('refuses a request without an authenticated principal before any work', async () => {
    const { controller, execute, response } = createController(complete);

    await expect(
      controller.execute({} as never, {}, response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(execute).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });
});
