import { Body, Controller, Post, UseGuards, UsePipes } from '@nestjs/common';
import { SendInstallSmtpTestDto } from './dto/send-install-smtp-test.dto';
import { InstallSmtpTestService } from './install-smtp-test.service';
import type { InstallSmtpTestResult } from './install-smtp-test.types';
import { InstallWizardLockGuard } from './install-wizard-lock.guard';
import { createInstallValidationPipe } from './install-validation.pipe';

/**
 * F4.1: „Pošalji test“ in the SMTP step. Separate controller because the SMTP
 * routes in `install.controller.ts` are already at the file limit and this one
 * answers with a result object („sent“) rather than a saved record.
 */
@Controller('install/smtp')
@UseGuards(InstallWizardLockGuard)
@UsePipes(createInstallValidationPipe())
export class InstallSmtpTestController {
  constructor(private readonly installSmtpTestService: InstallSmtpTestService) {}

  @Post('test')
  sendTest(@Body() body: SendInstallSmtpTestDto): Promise<InstallSmtpTestResult> {
    return this.installSmtpTestService.send({ toAddress: body.toAddress });
  }
}
