import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../../authorization/authorization.constants';
import { RequirePermissions } from '../../authorization/require-permissions.decorator';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import { mapSettingsError } from '../../settings/map-settings-error';
import { readSettingsActorUserId } from '../../settings/read-settings-actor-user-id';
import { SettingsError } from '../../settings/settings.error';
import type { RenderedEmailMessage } from '../email/render-email-message';
import {
  PreviewEmailTemplateDto,
  SendTestEmailDto,
  UpdateEmailTemplatesDto,
} from './email-templates.dto';
import {
  EmailTemplatesService,
  type EmailTemplatesOverview,
  type TestEmailResult,
} from './email-templates.service';

/** Paket 1.5 — admin editor for e-mail texts (same guard as /settings). */
@Controller('settings/email-templates')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class EmailTemplatesController {
  constructor(private readonly emailTemplates: EmailTemplatesService) {}

  @Get()
  overview(): Promise<EmailTemplatesOverview> {
    return this.run(() => this.emailTemplates.overview());
  }

  @Put()
  @RequirePermissions(permissionKeys.settingsWrite)
  save(
    @Body() body: UpdateEmailTemplatesDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<EmailTemplatesOverview> {
    return this.run(() =>
      this.emailTemplates.save(body.overrides, {
        reason: body.reason,
        actorUserId: readSettingsActorUserId(request),
      }),
    );
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body() body: PreviewEmailTemplateDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<RenderedEmailMessage> {
    return this.run(() => this.emailTemplates.preview(body, readSettingsActorUserId(request)));
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(permissionKeys.settingsWrite)
  sendTest(
    @Body() body: SendTestEmailDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TestEmailResult> {
    return this.run(() => this.emailTemplates.sendTest(body, readSettingsActorUserId(request)));
  }

  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof SettingsError && error.code === 'TEST_RATE_LIMITED') {
        throw new HttpException(
          { code: error.code, message: error.message },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw mapSettingsError(error);
    }
  }
}
