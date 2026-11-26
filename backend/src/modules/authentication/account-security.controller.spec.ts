import { BadRequestException, NotFoundException, ParseUUIDPipe } from '@nestjs/common';
import { AccountSecurityController } from './account-security.controller';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  SESSION_ID_REQUEST_KEY,
  type AuthenticatedHttpRequest,
} from './authenticated-request';
import type { AuthenticationUserRecord } from './authentication.types';
import { CuidParamPipe } from '../../common/validation/cuid-param.pipe';

// The controller value-imports its dependencies, which reach `PrismaService`; the
// generated client is not part of the sandbox checkout, so the module is stubbed
// exactly as the neighbouring authentication specs do.
jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/*
  W2.17 (`BA-authentication-04`): the contract test the audit asked for — a session
  id taken from the *schema shape* the endpoint itself returns has to survive the
  path validator and reach the registry, while a foreign id still stops at the
  ownership check and a malformed one never reaches a query.

  The fixture ids are real cuids (25 characters, `c` + base36), the same shape
  `GET /auth/sessions` returns for `UserSession.id`.
*/
describe('AccountSecurityController session revocation contract (W2.17)', () => {
  const callerId = 'cmwwnq7n40037w31qghooumft';
  const listedSessionId = 'cmwwnqcx800itw31quqh0ny4r';
  const foreignSessionId = 'cmwwnqdvx00m5w31qlzsil55c';

  function build() {
    const revoke = jest.fn().mockResolvedValue(true);
    const list = jest.fn().mockResolvedValue([
      {
        id: listedSessionId,
        provider: 'local',
        mfaMethod: 'totp',
        ipAddress: '10.0.0.9',
        userAgent: 'UA',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        rememberMe: false,
        current: true,
      },
    ]);
    const controller = new AccountSecurityController(
      { findById: jest.fn().mockResolvedValue(activeUser) } as never,
      {} as never,
      {} as never,
      {} as never,
      { revoke, list } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { controller, revoke, list };
  }

  const activeUser: AuthenticationUserRecord = {
    id: callerId,
    email: 'agent@example.com',
    displayName: 'Agent',
    isActive: true,
    isLocalOnly: false,
    mustChangePassword: false,
    localPasswordHash: 'hash',
    entraObjectId: null,
    roleKeys: ['AGENT'],
  };

  const request = (): AuthenticatedHttpRequest => ({
    [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
      subjectId: callerId,
      email: activeUser.email,
      displayName: activeUser.displayName,
      isLocalOnly: activeUser.isLocalOnly,
    },
    [SESSION_ID_REQUEST_KEY]: listedSessionId,
  });

  it('revokes the id the sessions list just returned', async () => {
    const { controller, revoke, list } = build();
    const sessions = await controller.sessions(request());
    const listed = sessions.items[0]!.id;

    // The validator the route uses must accept exactly what the list hands out.
    const accepted = new CuidParamPipe('sessionId').transform(listed);
    expect(accepted).toBe(listed);

    await expect(controller.revokeSession(request(), accepted)).resolves.toBeUndefined();
    expect(list).toHaveBeenCalledWith(callerId, listedSessionId);
    expect(revoke).toHaveBeenCalledWith({
      userId: callerId,
      sessionId: listedSessionId,
      reason: 'user',
      actorUserId: callerId,
    });
  });

  it('answers 404 SESSION_NOT_FOUND for an id that belongs to somebody else', async () => {
    const { controller, revoke } = build();
    revoke.mockResolvedValue(false);

    await expect(controller.revokeSession(request(), foreignSessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.revokeSession(request(), foreignSessionId)).rejects.toMatchObject({
      status: 404,
      response: { code: 'SESSION_NOT_FOUND' },
    });
    // The ownership check, not the shape check, is what refuses it.
    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({ sessionId: foreignSessionId }));
  });

  it('shows why the previous validator could never pass: a cuid is not a UUID', async () => {
    // Regression anchor for the audit finding itself. `ParseUUIDPipe.transform` is
    // what the route used, and it refuses the id the list just returned — so the
    // old code answered 400 before the ownership check could ever run.
    await expect(
      new ParseUUIDPipe().transform(listedSessionId, { type: 'param', data: 'sessionId' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a malformed session id before the registry is touched', async () => {
    const { controller, revoke } = build();
    const pipe = new CuidParamPipe('sessionId');

    for (const malformed of ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'not-a-session', '']) {
      expect(() => pipe.transform(malformed)).toThrow();
    }
    expect(revoke).not.toHaveBeenCalled();
    expect(controller).toBeDefined();
  });
});
