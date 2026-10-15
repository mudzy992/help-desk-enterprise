import { Body, Controller, Post, UseGuards, UsePipes } from '@nestjs/common';
import { RestartInstallWizardDto } from './dto/restart-install-wizard.dto';
import { InstallRerunService } from './install-rerun.service';
import type { InstallRerunResult } from './install-rerun.types';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';

/**
 * Owner decision 6: the only way back into a finished wizard. The route sits in
 * its own controller because it is the one `/install` mutation the lock lets
 * through (`is-install-wizard-mutation-locked`) and because it is the only one
 * that stays behind the install token after completion
 * (`isInstallTokenAlwaysRequired`) — both of those rules are easy to lose in the
 * long first-run controller.
 *
 * Nothing in the UI calls it; the ops runbook does
 * (`ops/runbook/ponovno-pokretanje-instalacije.md`).
 */
@Controller('install')
@UseGuards(InstallWizardLockGuard)
@UsePipes(createInstallValidationPipe())
export class InstallRerunController {
  constructor(private readonly installRerunService: InstallRerunService) {}

  @Post('restart')
  restartWizard(@Body() body: RestartInstallWizardDto): Promise<InstallRerunResult> {
    return this.installRerunService.restart({
      includeStepMarkers: body?.includeStepMarkers === true,
    });
  }
}
