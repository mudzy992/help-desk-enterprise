import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { installSetupErrorCodes } from './install-setup.constants';
import { InstallSetupGuard } from './install-setup.guard';
import { InstallSetupService } from './install-setup.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createHttpContext(request: {
  readonly method: string;
  readonly path: string;
}): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('InstallSetupGuard', () => {
  const readCompletedAt = jest.fn();
  const guard = new InstallSetupGuard({
    readCompletedAt,
  } as unknown as InstallSetupService);

  beforeEach(() => {
    readCompletedAt.mockReset();
  });

  it('allows /install while setup is incomplete', async () => {
    readCompletedAt.mockResolvedValue('');
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'GET', path: '/install' }),
      ),
    ).resolves.toBe(true);
    expect(readCompletedAt).not.toHaveBeenCalled();
  });

  it('returns 503 SETUP_REQUIRED for protected APIs while setup is incomplete', async () => {
    readCompletedAt.mockResolvedValue('');
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'POST', path: '/auth/login' }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'PUT', path: '/settings' }),
      ),
    ).rejects.toMatchObject({
      response: { code: installSetupErrorCodes.setupRequired },
    });
  });

  it('disables the gate when setup is completed', async () => {
    readCompletedAt.mockResolvedValue('2026-09-11T08:00:00.000Z');
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'POST', path: '/auth/entra' }),
      ),
    ).resolves.toBe(true);
  });

  it('does not block /install with its own gate', async () => {
    readCompletedAt.mockResolvedValue('');
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'GET', path: '/install/status' }),
      ),
    ).resolves.toBe(true);
    expect(readCompletedAt).not.toHaveBeenCalled();
  });
});
