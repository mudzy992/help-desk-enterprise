import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import { permissionKeys } from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { mapPrivacyError } from './map-privacy-error';
import { privacyActorOf } from './privacy-actor';
import { PrivacyConfigurationLoader } from './privacy-configuration.loader';
import { privacyErrorCodes } from './privacy.constants';
import { PrivacyError } from './privacy.error';
import {
  CloseDataSubjectRequestDto,
  CreateDataSubjectRequestDto,
  ExtendDataSubjectRequestDto,
  ListDataSubjectRequestsQueryDto,
  UpdateDataSubjectRequestDto,
} from './requests/data-subject-request.dto';
import { DataSubjectRequestsService } from './requests/data-subject-requests.service';

/**
 * Paket 2.6 (§4): register of data subject requests. Reading needs
 * `privacy.view` (ADMIN, SUPER_ADMIN); changes need `privacy.manage`.
 */
@Controller('privacy')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class PrivacyController {
  constructor(
    private readonly requestsService: DataSubjectRequestsService,
    private readonly configurationLoader: PrivacyConfigurationLoader,
  ) {}

  @Get('requests')
  @RequirePermissions(permissionKeys.privacyView)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  listRequests(@Query() query: ListDataSubjectRequestsQueryDto) {
    return this.call(() => this.requestsService.list(query.scope ?? 'open'));
  }

  @Get('requests/:id')
  @RequirePermissions(permissionKeys.privacyView)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  getRequest(@Param('id') id: string) {
    return this.call(() => this.requestsService.get(id));
  }

  @Post('requests')
  @RequirePermissions(permissionKeys.privacyManage)
  createRequest(@Body() body: CreateDataSubjectRequestDto, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.requestsService.create(body, privacyActorOf(request)));
  }

  @Patch('requests/:id')
  @RequirePermissions(permissionKeys.privacyManage)
  updateRequest(
    @Param('id') id: string,
    @Body() body: UpdateDataSubjectRequestDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.call(() => this.requestsService.update(id, body, privacyActorOf(request)));
  }

  @Post('requests/:id/extend')
  @HttpCode(200)
  @RequirePermissions(permissionKeys.privacyManage)
  extendRequest(
    @Param('id') id: string,
    @Body() body: ExtendDataSubjectRequestDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.call(() => this.requestsService.extend(id, body.reason, privacyActorOf(request)));
  }

  @Post('requests/:id/close')
  @HttpCode(200)
  @RequirePermissions(permissionKeys.privacyManage)
  closeRequest(
    @Param('id') id: string,
    @Body() body: CloseDataSubjectRequestDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.call(() => this.requestsService.close(id, body, privacyActorOf(request)));
  }

  private async call<T>(action: () => Promise<T>): Promise<T> {
    try {
      const configuration = await this.configurationLoader.load();
      if (!configuration.enabled) throw new PrivacyError(privacyErrorCodes.disabled);
      return await action();
    } catch (error) {
      throw mapPrivacyError(error);
    }
  }
}
