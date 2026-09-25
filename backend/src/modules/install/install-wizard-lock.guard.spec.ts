import { ConflictException, ExecutionContext } from '@nestjs/common';
import { installSetupErrorCodes } from './install-setup.constants';
import { InstallSetupService } from './install-setup.service';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createHttpContext(request: {
  readonly method: string;
  readonly path: string;
  readonly headers?: Record<string, unknown>;
}): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('InstallWizardLockGuard', () => {
  const isCompleted = jest.fn();
  const guard = new InstallWizardLockGuard({
    isCompleted,
  } as unknown as InstallSetupService);

  const originalToken = process.env.INSTALL_TOKEN;

  beforeEach(() => {
    isCompleted.mockReset();
    process.env.INSTALL_TOKEN = 'install-token-for-tests';
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.INSTALL_TOKEN;
    else process.env.INSTALL_TOKEN = originalToken;
  });

  it('requires the install token before completion (S4)', async () => {
    isCompleted.mockResolvedValue(false);
    await expect(
      guard.canActivate(createHttpContext({ method: 'POST', path: '/install/super-admin' })),
    ).rejects.toMatchObject({ response: { code: 'INSTALL_TOKEN_INVALID' } });
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'GET', path: '/install/smtp', headers: { 'x-install-token': 'wrong' } }),
      ),
    ).rejects.toMatchObject({ response: { code: 'INSTALL_TOKEN_INVALID' } });
    await expect(
      guard.canActivate(createHttpContext({ method: 'GET', path: '/install/status' })),
    ).resolves.toBe(true);
    delete process.env.INSTALL_TOKEN;
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'POST', path: '/install/seed', headers: { 'x-install-token': 'install-token-for-tests' } }),
      ),
    ).rejects.toMatchObject({ response: { code: 'INSTALL_TOKEN_NOT_CONFIGURED' } });
  });

  it('allows wizard mutations while setup is incomplete', async () => {
    isCompleted.mockResolvedValue(false);
    await expect(
      guard.canActivate(
        createHttpContext({
          method: 'POST',
          path: '/install/addons',
          headers: { 'x-install-token': 'install-token-for-tests' },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects wizard mutations after completion', async () => {
    isCompleted.mockResolvedValue(true);
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'POST', path: '/install/addons' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'POST', path: '/install/smtp' }),
      ),
    ).rejects.toMatchObject({
      response: { code: installSetupErrorCodes.installLocked },
    });
  });

  it('allows status reads and idempotent complete after lock', async () => {
    isCompleted.mockResolvedValue(true);
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'GET', path: '/install/status' }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'POST', path: '/install/complete' }),
      ),
    ).resolves.toBe(true);
  });
});
