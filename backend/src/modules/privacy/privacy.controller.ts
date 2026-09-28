import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
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
import { LegalHoldService } from './legal-hold/legal-hold.service';
import {
  LegalHoldReasonDto,
  LegalHoldTargetParamDto,
  RetentionCategoryParamDto,
  RetentionRunsQueryDto,
} from './retention/retention.dto';
import { RetentionQueueService } from './retention/retention-queue.service';
import { RetentionService } from './retention/retention.service';

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
    private readonly retentionService: RetentionService,
    private readonly retentionQueue: RetentionQueueService,
    private readonly legalHoldService: LegalHoldService,
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

  // --- §7 Retention -------------------------------------------------------

  @Get('retention')
  @RequirePermissions(permissionKeys.privacyView)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  retentionOverview() {
    return this.call(() => this.retentionService.overview());
  }

  @Get('retention/runs')
  @RequirePermissions(permissionKeys.privacyView)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  retentionRuns(@Query() query: RetentionRunsQueryDto) {
    return this.call(() => this.retentionService.listRuns(query.category));
  }

  @Get('retention/runs/:id/refs.csv')
  @RequirePermissions(permissionKeys.privacyView)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  async retentionRunRefs(@Param('id') id: string): Promise<StreamableFile> {
    const csv = await this.call(() => this.retentionService.runRefsCsv(id));
    return new StreamableFile(Buffer.from(csv.body, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${csv.filename}"`,
    });
  }

  @Post('retention/:category/dry-run')
  @HttpCode(202)
  @RequirePermissions(permissionKeys.privacyManage)
  retentionDryRun(@Param() params: RetentionCategoryParamDto, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.retentionQueue.enqueue(params.category, 'DRY_RUN', privacyActorOf(request)));
  }

  /** Manual execution; the §7.3 gate still applies in the worker (SKIPPED without a fresh dry run). */
  @Post('retention/:category/run-now')
  @HttpCode(202)
  @RequirePermissions(permissionKeys.privacyManage)
  retentionRunNow(@Param() params: RetentionCategoryParamDto, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.retentionQueue.enqueue(params.category, 'EXECUTE', privacyActorOf(request)));
  }

  // --- §7.4 Legal hold (ADMIN, SUPER_ADMIN) ----------------------------------

  @Get('legal-holds')
  @RequirePermissions(permissionKeys.privacyView)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  legalHolds() {
    return this.call(() => this.legalHoldService.list());
  }

  @Put('legal-holds/:target/:id')
  @RequireRoles(authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  @RequirePermissions(permissionKeys.privacyView)
  setLegalHold(
    @Param() params: LegalHoldTargetParamDto,
    @Body() body: LegalHoldReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.call(() => this.legalHoldService.set(params.target, params.id, body.reason, privacyActorOf(request)));
  }

  /** A body with the reason is required (DELETE with body — the audit records why). */
  @Delete('legal-holds/:target/:id')
  @HttpCode(204)
  @RequireRoles(authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  @RequirePermissions(permissionKeys.privacyView)
  async clearLegalHold(
    @Param() params: LegalHoldTargetParamDto,
    @Body() body: LegalHoldReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.call(() => this.legalHoldService.clear(params.target, params.id, body.reason, privacyActorOf(request)));
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
