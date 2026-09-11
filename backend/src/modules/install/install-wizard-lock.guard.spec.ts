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

  beforeEach(() => {
    isCompleted.mockReset();
  });

  it('allows wizard mutations while setup is incomplete', async () => {
    isCompleted.mockResolvedValue(false);
    await expect(
      guard.canActivate(
        createHttpContext({ method: 'POST', path: '/install/addons' }),
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
