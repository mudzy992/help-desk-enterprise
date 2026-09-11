import {
  Body,
  Controller,
  Get,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateInstallSuperAdminDto } from './dto/create-install-super-admin.dto';
import { SaveInstallAddonsDto } from './dto/save-install-addons.dto';
import { SaveInstallLoginProviderDto } from './dto/save-install-login-provider.dto';
import { SaveInstallSmtpDto } from './dto/save-install-smtp.dto';
import { InstallAddonsService } from './install-addons.service';
import { InstallLoginProviderService } from './install-login-provider.service';
import { InstallSetupService } from './install-setup.service';
import { InstallSmtpService } from './install-smtp.service';
import { InstallSuperAdminService } from './install-super-admin.service';
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

@Controller('install')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class InstallController {
  constructor(
    private readonly installSetupService: InstallSetupService,
    private readonly installSuperAdminService: InstallSuperAdminService,
    private readonly installLoginProviderService: InstallLoginProviderService,
    private readonly installSmtpService: InstallSmtpService,
    private readonly installSeedService: InstallSeedService,
    private readonly installAddonsService: InstallAddonsService,
  ) {}

  @Get('status')
  getStatus(): Promise<InstallSetupStatus> {
    return this.installSetupService.getStatus();
  }

  @Get('super-admin')
  getSuperAdmin(): Promise<InstallSuperAdminStatus> {
    return this.installSuperAdminService.getStatus();
  }

  @Post('super-admin')
  createSuperAdmin(
    @Body() body: CreateInstallSuperAdminDto,
  ): Promise<InstallSuperAdminPublicRecord> {
    return this.installSuperAdminService.create(body);
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

  @Post('seed')
  createSeed(): Promise<InstallSeedResult> {
    return this.installSeedService.seed();
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
}
