import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { CreateInstallSeedDto } from './dto/create-install-seed.dto';
import { CreateInstallSuperAdminDto } from './dto/create-install-super-admin.dto';
import { SaveInstallIdentityDto } from './dto/save-install-identity.dto';
import { SaveInstallTeamDto } from './dto/save-install-team.dto';
import { SaveInstallAddonsDto } from './dto/save-install-addons.dto';
import { SaveInstallLoginProviderDto } from './dto/save-install-login-provider.dto';
import { SaveInstallSmtpDto } from './dto/save-install-smtp.dto';
import { InstallAddonsService } from './install-addons.service';
import { InstallCompleteService } from './install-complete.service';
import { InstallIdentityService } from './install-identity.service';
import { InstallLoginProviderService } from './install-login-provider.service';
import { InstallSetupService } from './install-setup.service';
import { InstallSmtpService } from './install-smtp.service';
import { InstallSuperAdminService } from './install-super-admin.service';
import { InstallTeamService } from './install-team.service';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';
import type {
  InstallLoginProviderPublicRecord,
  InstallLoginProviderStatus,
} from './install-login-provider.types';
import type { InstallSetupStatus } from './install-setup.types';
import type {
  InstallAddonsPublicRecord,
  InstallAddonsStatus,
} from './install-addons.types';
import type {
  InstallSmtpPublicRecord,
  InstallSmtpStatus,
} from './install-smtp.types';
import type {
  InstallSeedResult,
  InstallSeedStatus,
} from './install-seed.types';
import { InstallSeedService } from './install-seed.service';
import type {
  InstallSuperAdminPublicRecord,
  InstallSuperAdminStatus,
} from './install-super-admin.types';
import type { InstallPasswordPolicyPublic } from './install-super-admin-password-policy';
import type { InstallIdentityStatus } from './install-identity.types';
import type { InstallTeamResult, InstallTeamStatus } from './install-team.types';
import type { InstallIdentityPublicRecord } from './install-identity.types';

@Controller('install')
@UseGuards(InstallWizardLockGuard)
@UsePipes(createInstallValidationPipe())
export class InstallController {
  constructor(
    private readonly installSetupService: InstallSetupService,
    private readonly installSuperAdminService: InstallSuperAdminService,
    private readonly installIdentityService: InstallIdentityService,
    private readonly installTeamService: InstallTeamService,
    private readonly installLoginProviderService: InstallLoginProviderService,
    private readonly installSmtpService: InstallSmtpService,
    private readonly installSeedService: InstallSeedService,
    private readonly installAddonsService: InstallAddonsService,
    private readonly installCompleteService: InstallCompleteService,
  ) {}

  @Get('status')
  getStatus(): Promise<InstallSetupStatus> {
    return this.installSetupService.getStatus();
  }

  @Get('super-admin')
  getSuperAdmin(): Promise<InstallSuperAdminStatus> {
    return this.installSuperAdminService.getStatus();
  }

  /** Paket 5.1 (M1 #1): rules for the founder password (no secrets). */
  @Get('password-policy')
  getPasswordPolicy(): Promise<InstallPasswordPolicyPublic> {
    return this.installSuperAdminService.getPasswordPolicy();
  }

  @Post('super-admin')
  createSuperAdmin(
    @Body() body: CreateInstallSuperAdminDto,
  ): Promise<InstallSuperAdminPublicRecord> {
    return this.installSuperAdminService.create(body);
  }

  /** F2: the identity step — organisation, product name, language, time zone. */
  @Get('identity')
  getIdentity(): Promise<InstallIdentityStatus> {
    return this.installIdentityService.getStatus();
  }

  @Post('identity')
  saveIdentity(
    @Body() body: SaveInstallIdentityDto,
  ): Promise<InstallIdentityPublicRecord> {
    return this.installIdentityService.save(body);
  }

  @Get('login-provider')
  getLoginProvider(): Promise<InstallLoginProviderStatus> {
    return this.installLoginProviderService.getStatus();
  }

  @Post('login-provider')
  saveLoginProvider(
    @Body() body: SaveInstallLoginProviderDto,
  ): Promise<InstallLoginProviderPublicRecord> {
    return this.installLoginProviderService.save(body);
  }

  @Get('smtp')
  getSmtp(): Promise<InstallSmtpStatus> {
    return this.installSmtpService.getStatus();
  }

  @Post('smtp')
  saveSmtp(@Body() body: SaveInstallSmtpDto): Promise<InstallSmtpPublicRecord> {
    return this.installSmtpService.save(body);
  }

  @Get('seed')
  getSeed(): Promise<InstallSeedStatus> {
    return this.installSeedService.getStatus();
  }

  /** F2: the body is optional; without it the pre-v2 defaults are seeded. */
  @Post('seed')
  createSeed(
    @Body() body?: CreateInstallSeedDto,
  ): Promise<InstallSeedResult> {
    return this.installSeedService.seed(body ?? {});
  }

  /** F2: the team step lists and creates the members of the handler group. */
  @Get('team')
  getTeam(): Promise<InstallTeamStatus> {
    return this.installTeamService.getStatus();
  }

  @Post('team')
  saveTeam(@Body() body: SaveInstallTeamDto): Promise<InstallTeamResult> {
    return this.installTeamService.save(body);
  }

  @Get('addons')
  getAddons(): Promise<InstallAddonsStatus> {
    return this.installAddonsService.getStatus();
  }

  @Post('addons')
  saveAddons(
    @Body() body: SaveInstallAddonsDto,
  ): Promise<InstallAddonsPublicRecord> {
    return this.installAddonsService.save(body);
  }

  @Post('complete')
  complete(): Promise<InstallSetupStatus> {
    return this.installCompleteService.complete();
  }
}
