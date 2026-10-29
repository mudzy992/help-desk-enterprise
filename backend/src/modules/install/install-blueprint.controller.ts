import { Body, Controller, Get, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import type {
  InstallBlueprintApplyResult,
  InstallBlueprintCatalog,
} from './blueprints/install-blueprint.types';
import { InstallBlueprintService } from './blueprints/install-blueprint.service';
import {
  ApplyInstallBlueprintDto,
  InstallBlueprintCatalogQueryDto,
} from './dto/apply-install-blueprint.dto';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';

/**
 * Install wizard v2 (F4.2): the catalog step. Same shape as the other wizard
 * controllers — `@Controller('install')`, the wizard lock guard and the shared
 * validation pipe, so an operator cannot reach the catalog routes with different
 * rules than the rest of the wizard.
 */
@Controller('install')
@UseGuards(InstallWizardLockGuard)
@UsePipes(createInstallValidationPipe())
export class InstallBlueprintController {
  constructor(private readonly installBlueprintService: InstallBlueprintService) {}

  /** The catalog of templates; `locale` only selects the names the UI shows. */
  @Get('blueprints')
  getCatalog(
    @Query() query: InstallBlueprintCatalogQueryDto,
  ): Promise<InstallBlueprintCatalog> {
    return this.installBlueprintService.getCatalog(query.locale);
  }

  /** Idempotent: re-applying a blueprint never duplicates the rows it created. */
  @Post('blueprints/apply')
  apply(
    @Body() body: ApplyInstallBlueprintDto,
  ): Promise<InstallBlueprintApplyResult> {
    return this.installBlueprintService.apply(body);
  }
}
