import { Controller, Get } from '@nestjs/common';
import { InstallSetupService } from './install-setup.service';
import type { InstallSetupStatus } from './install-setup.types';

@Controller('install')
export class InstallController {
  constructor(private readonly installSetupService: InstallSetupService) {}

  @Get('status')
  getStatus(): Promise<InstallSetupStatus> {
    return this.installSetupService.getStatus();
  }
}
