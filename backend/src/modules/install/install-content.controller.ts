import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApplyInstallPolicyPackDto } from './dto/apply-install-policy-pack.dto';
import { SaveInstallSlaReviewDto } from './dto/save-install-sla-review.dto';
import { InstallPolicyPackService } from './install-policy-pack.service';
import type {
  InstallPolicyPackApplyResult,
  InstallPolicyPackStatus,
} from './install-policy-pack.types';
import { InstallSlaReviewService } from './install-sla-review.service';
import type {
  InstallSlaReviewResult,
  InstallSlaReviewStatus,
} from './install-sla-review.types';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';

/**
 * Install wizard v2 (F4): the two steps that confirm content rather than collect
 * credentials — the policy pack (F4.3) and the SLA review (F4.4). Same guards and
 * validation pipe as the other wizard controllers: an operator cannot reach these
 * routes with different rules than the rest of the wizard.
 */
@Controller('install')
@UseGuards(InstallWizardLockGuard)
@UsePipes(createInstallValidationPipe())
export class InstallContentController {
  constructor(
    private readonly installPolicyPackService: InstallPolicyPackService,
    private readonly installSlaReviewService: InstallSlaReviewService,
  ) {}

  /** Packs the applied blueprint offers, plus the one already applied. */
  @Get('policy-pack')
  getPolicyPack(): Promise<InstallPolicyPackStatus> {
    return this.installPolicyPackService.getStatus();
  }

  @Post('policy-pack')
  applyPolicyPack(
    @Body() body: ApplyInstallPolicyPackDto,
  ): Promise<InstallPolicyPackApplyResult> {
    return this.installPolicyPackService.apply({ policyPackKey: body.policyPackKey });
  }

  /** Working hours (`BH_STANDARD`) and the priority matrix, as the SLA screens read them. */
  @Get('sla-review')
  getSlaReview(): Promise<InstallSlaReviewStatus> {
    return this.installSlaReviewService.getStatus();
  }

  @Post('sla-review')
  saveSlaReview(
    @Body() body: SaveInstallSlaReviewDto,
  ): Promise<InstallSlaReviewResult> {
    return this.installSlaReviewService.save(body);
  }
}
