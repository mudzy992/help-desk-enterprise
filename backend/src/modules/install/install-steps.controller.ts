import { Body, Controller, Delete, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { SaveInstallProfileDto } from './dto/install-profile.dto';
import { InstallStepKeyParamDto } from './dto/install-step-skip.dto';
import type { InstallReadinessResult } from './evaluate-install-readiness';
import { InstallProfileService } from './install-profile.service';
import type { InstallProfileStatus } from './install-profile.types';
import { InstallReadinessService } from './install-readiness.service';
import {
  InstallStepSkipService,
  type InstallStepSkipStatus,
} from './install-step-skip.service';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';

/**
 * Install wizard v2 (F2): the package, "Podesi kasnije" and readiness routes sit
 * in their own controller — the first-run controller grew past the file limit and
 * these three belong together anyway (they are all package state, not data the
 * customer typed). Both controllers share `@Controller('install')`, the same
 * lock guard and the same validation pipe, so an operator cannot reach one set of
 * routes with different rules than the other.
 */
@Controller('install')
@UseGuards(InstallWizardLockGuard)
@UsePipes(createInstallValidationPipe())
export class InstallStepsController {
  constructor(
    private readonly installProfileService: InstallProfileService,
    private readonly installStepSkipService: InstallStepSkipService,
    private readonly installReadinessService: InstallReadinessService,
  ) {}

  /** F1: the package chosen in the wizard plus the package catalogue. */
  @Get('profile')
  getProfile(): Promise<InstallProfileStatus> {
    return this.installProfileService.getStatus();
  }

  /**
   * F1 + owner decision 5: changing the package is allowed while the operator is
   * back on this step; the service resets the state of steps the new package does
   * not contain and refuses a downgrade once the initial data exists.
   */
  @Post('profile')
  saveProfile(@Body() body: SaveInstallProfileDto): Promise<InstallProfileStatus> {
    return this.installProfileService.save({ profile: body.profile });
  }

  /** F1: a required step may be a blocking one that the operator picked later. */
  @Get('readiness')
  getReadiness(): Promise<InstallReadinessResult> {
    return this.installReadinessService.getStatus();
  }

  @Post('steps/:stepKey/skip')
  skipStep(@Param() params: InstallStepKeyParamDto): Promise<InstallStepSkipStatus> {
    return this.installStepSkipService.skip(params.stepKey);
  }

  @Delete('steps/:stepKey/skip')
  unskipStep(@Param() params: InstallStepKeyParamDto): Promise<InstallStepSkipStatus> {
    return this.installStepSkipService.unskip(params.stepKey);
  }
}
