import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RestartInstallWizardDto } from './dto/restart-install-wizard.dto';
import { InstallRerunController } from './install-rerun.controller';
import { InstallRerunService } from './install-rerun.service';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';

describe('InstallRerunController (ops-only reopening)', () => {
  const restart = jest.fn();
  const controller = new InstallRerunController({
    restart,
  } as unknown as InstallRerunService);

  beforeEach(() => {
    restart.mockReset().mockResolvedValue({ restarted: true });
  });

  it('keeps the wizard lock guard on the route', () => {
    // The lock lets exactly this mutation through after completion; without the
    // guard the route could not be reached on a finished system at all.
    const guards = Reflect.getMetadata(GUARDS_METADATA, InstallRerunController) as readonly {
      readonly name: string;
    }[];
    expect(guards.map((guard) => guard.name)).toContain(InstallWizardLockGuard.name);
  });

  it('reopens the wizard with every answered step kept by default', async () => {
    await controller.restartWizard(new RestartInstallWizardDto());

    expect(restart).toHaveBeenCalledWith({ includeStepMarkers: false });
  });

  it('passes the marker flag through', async () => {
    await controller.restartWizard({
      includeStepMarkers: true,
    } as RestartInstallWizardDto);

    expect(restart).toHaveBeenCalledWith({ includeStepMarkers: true });
  });

  it('accepts an empty body and refuses a flag that is not a boolean', async () => {
    const pipe = createInstallValidationPipe();
    const asBody = (payload: unknown): Promise<RestartInstallWizardDto> =>
      pipe.transform(payload, {
        type: 'body',
        metatype: RestartInstallWizardDto,
      });

    // The documented curl („just reopen it“) sends no fields at all.
    await expect(asBody({})).resolves.toBeInstanceOf(RestartInstallWizardDto);
    await expect(asBody({ includeStepMarkers: 'yes' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(asBody({ profile: 'full' })).rejects.toMatchObject({
      status: 400,
    });
  });
});
