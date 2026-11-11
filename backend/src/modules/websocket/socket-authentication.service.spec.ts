import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { SocketAuthenticationService } from './socket-authentication.service';
import type {
  SocketAuthenticationResult,
  SocketHandshakeCredentials,
} from './socket-authentication.types';
import { SOCKET_AUTHENTICATION_VERIFIER } from './socket-authentication.verifier-token';

const SYNTHETIC_TOKEN = 'synthetic-handshake-token-test-only';

describe('SocketAuthenticationService', () => {
  let moduleRef: TestingModule | undefined;

  const createService = async (
    verify: (
      credentials: SocketHandshakeCredentials,
    ) => Promise<SocketAuthenticationResult>,
  ): Promise<SocketAuthenticationService> => {
    moduleRef = await Test.createTestingModule({
      providers: [
        SocketAuthenticationService,
        { provide: SOCKET_AUTHENTICATION_VERIFIER, useValue: { verify } },
      ],
    }).compile();
    return moduleRef.get(SocketAuthenticationService);
  };

  afterEach(async () => {
    if (moduleRef !== undefined) {
      await moduleRef.close();
    }
  });

  it('delegates valid credentials to the verifier and returns a minimal principal', async () => {
    const verify = jest.fn(
      async (): Promise<SocketAuthenticationResult> => ({
        status: 'authenticated',
        principal: { subjectId: 'subject-user-1' },
      }),
    );
    const service = await createService(verify);
    const result = await service.authenticate({ token: SYNTHETIC_TOKEN });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith({ token: SYNTHETIC_TOKEN });
    expect(result).toEqual({
      status: 'authenticated',
      principal: { subjectId: 'subject-user-1' },
    });
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_TOKEN);
  });

  it('strips extra principal fields so the token never enters socket identity', async () => {
    const verify = jest.fn(async (): Promise<SocketAuthenticationResult> => {
      const principalWithToken = {
        subjectId: 'subject-user-1',
        token: SYNTHETIC_TOKEN,
      };
      return {
        status: 'authenticated',
        principal: principalWithToken,
      };
    });
    const service = await createService(verify);
    const result = await service.authenticate({ token: SYNTHETIC_TOKEN });
    expect(result).toEqual({
      status: 'authenticated',
      principal: { subjectId: 'subject-user-1' },
    });
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_TOKEN);
  });

  it('returns missing_credentials without calling the verifier', async () => {
    const verify = jest.fn(
      async (): Promise<SocketAuthenticationResult> => ({
        status: 'unauthenticated',
        reason: 'invalid_credentials',
      }),
    );
    const service = await createService(verify);
    const result = await service.authenticate(undefined);
    expect(verify).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'unauthenticated',
      reason: 'missing_credentials',
    });
  });

  it('returns unauthenticated when the verifier rejects', async () => {
    const verify = jest.fn(
      async (): Promise<SocketAuthenticationResult> => ({
        status: 'unauthenticated',
        reason: 'invalid_credentials',
      }),
    );
    const service = await createService(verify);
    const result = await service.authenticate({ token: SYNTHETIC_TOKEN });
    expect(result).toEqual({
      status: 'unauthenticated',
      reason: 'invalid_credentials',
    });
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_TOKEN);
  });
});
