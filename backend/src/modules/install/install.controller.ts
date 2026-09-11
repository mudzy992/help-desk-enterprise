import {
  Body,
  Controller,
  Get,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateInstallSuperAdminDto } from './dto/create-install-super-admin.dto';
import { SaveInstallLoginProviderDto } from './dto/save-install-login-provider.dto';
import { InstallLoginProviderService } from './install-login-provider.service';
import { InstallSetupService } from './install-setup.service';
import { InstallSuperAdminService } from './install-super-admin.service';
import type {
  InstallLoginProviderPublicRecord,
  InstallLoginProviderStatus,
} from './install-login-provider.types';
import type { InstallSetupStatus } from './install-setup.types';
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
}
