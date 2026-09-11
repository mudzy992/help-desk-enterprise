import {
  Body,
  Controller,
  Get,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateInstallSuperAdminDto } from './dto/create-install-super-admin.dto';
import { InstallSetupService } from './install-setup.service';
import { InstallSuperAdminService } from './install-super-admin.service';
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
}
