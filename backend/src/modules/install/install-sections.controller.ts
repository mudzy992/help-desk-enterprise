import { Body, Controller, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import {
  InstallSettingsSectionParamDto,
  SaveInstallSettingsSectionDto,
} from './dto/save-install-settings-section.dto';
import { InstallSecurityRecommendationsService } from './sections/install-security-recommendations.service';
import { InstallSettingsSectionService } from './sections/install-settings-section.service';
import type { InstallSecurityRecommendationsStatus } from './sections/install-security-recommendations.types';
import type {
  InstallSettingsSectionStatus,
  InstallSettingsSectionsList,
} from './sections/install-settings-section.types';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';

/**
 * Install wizard v2 (F5): the Full package's settings sections and the security
 * recommendations. One controller for both — they are the same kind of step
 * („content the operator confirms or defers“), and every route carries the same
 * guard and validation pipe as the rest of the wizard, so the lock after
 * completion applies here too.
 */
@Controller('install')
@UseGuards(InstallWizardLockGuard)
@UsePipes(createInstallValidationPipe())
export class InstallSectionsController {
  constructor(
    private readonly installSettingsSectionService: InstallSettingsSectionService,
    private readonly installSecurityRecommendationsService: InstallSecurityRecommendationsService,
  ) {}

  @Get('sections')
  listSections(): Promise<InstallSettingsSectionsList> {
    return this.installSettingsSectionService.list();
  }

  @Get('sections/:sectionKey')
  getSection(
    @Param() params: InstallSettingsSectionParamDto,
  ): Promise<InstallSettingsSectionStatus> {
    return this.installSettingsSectionService.getSection(params.sectionKey);
  }

  @Post('sections/:sectionKey')
  saveSection(
    @Param() params: InstallSettingsSectionParamDto,
    @Body() body: SaveInstallSettingsSectionDto,
  ): Promise<InstallSettingsSectionStatus> {
    return this.installSettingsSectionService.saveSection(params.sectionKey, {
      values: body.values,
    });
  }

  /** „Preporučeno za produkciju“ — status, then the one apply action. */
  @Get('security-recommendations')
  getSecurityRecommendations(): Promise<InstallSecurityRecommendationsStatus> {
    return this.installSecurityRecommendationsService.getStatus();
  }

  @Post('security-recommendations')
  applySecurityRecommendations(): Promise<InstallSecurityRecommendationsStatus> {
    return this.installSecurityRecommendationsService.apply();
  }
}
