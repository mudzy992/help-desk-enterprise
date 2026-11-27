import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  readAuthenticatedPrincipal,
  type AuthenticatedHttpRequest,
} from '../../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import { authorizationRoleKeys, permissionKeys } from '../../authorization/authorization.constants';
import { RequirePermissions } from '../../authorization/require-permissions.decorator';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import { readAuditRequestId } from '../../audit-log/read-audit-request-id';
import { parseIfMatch } from '../../../common/optimistic-concurrency/optimistic-concurrency.service';
import {
  RecipientCandidatesQueryDto,
  SaveReportScheduleDto,
  SetReportScheduleEnabledDto,
} from '../dto/report-schedule.dto';
import { mapReportsError } from '../map-reports-error';
import { ReportSchedulesService } from './report-schedules.service';

/**
 * Paket 2.5 (§5.5). The unit scope is checked per schedule in the service
 * (a list spans units, so the class-level OU guard cannot apply).
 */
@Controller('reports/schedules')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
@RequirePermissions(permissionKeys.reportsScheduleManage)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ReportSchedulesController {
  constructor(private readonly schedulesService: ReportSchedulesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.list(actorOf(request)));
  }

  @Get('recipient-candidates')
  @Header('Cache-Control', 'no-store')
  candidates(@Query() query: RecipientCandidatesQueryDto, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() =>
      this.schedulesService.candidates(actorOf(request), query.organizationalUnitId, query.q ?? ''),
    );
  }

  @Post()
  create(@Body() body: SaveReportScheduleDto, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.create(actorOf(request), body));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.get(actorOf(request), id));
  }

  /**
   * W7.95 (`BA-reports-05`): admin writes are conditional. `If-Match: "vN"` carries the version the editor
   * loaded; a missing header is 428 and a malformed one 400 (both from the shared parser), and a stale version is
   * answered by the service with 412 plus the current token.
   */
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: SaveReportScheduleDto,
    @Req() request: AuthenticatedHttpRequest,
    @Headers('if-match') ifMatch: string | string[] | undefined,
  ) {
    return this.call(() => this.schedulesService.update(actorOf(request), id, body, parseIfMatch(ifMatch)));
  }

  @Patch(':id/enabled')
  setEnabled(
    @Param('id') id: string,
    @Body() body: SetReportScheduleEnabledDto,
    @Req() request: AuthenticatedHttpRequest,
    @Headers('if-match') ifMatch: string | string[] | undefined,
  ) {
    return this.call(() =>
      this.schedulesService.setEnabled(actorOf(request), id, body.enabled, parseIfMatch(ifMatch)),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedHttpRequest,
    @Headers('if-match') ifMatch: string | string[] | undefined,
  ): Promise<void> {
    await this.call(() => this.schedulesService.remove(actorOf(request), id, parseIfMatch(ifMatch)));
  }

  @Get(':id/runs')
  @Header('Cache-Control', 'no-store')
  runs(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.runs(actorOf(request), id));
  }

  @Post(':id/send-test')
  @HttpCode(200)
  sendTest(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.sendTest(actorOf(request), id));
  }

  /**
   * W7.106 (`BA-reports-16`): „send now” is a command and needs a command identity, exactly like a ticket reopen.
   * The header is required (fail loudly rather than guess a key on the server, which would make every request
   * unique and defeat the purpose); its format is validated in the service.
   */
  @Post(':id/run-now')
  @HttpCode(202)
  runNow(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    if (idempotencyKey === undefined || idempotencyKey.trim().length === 0) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return this.call(() => this.schedulesService.runNow(actorOf(request), id, idempotencyKey));
  }

  private async call<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw mapReportsError(error);
    }
  }
}

function actorOf(request: AuthenticatedHttpRequest) {
  const principal = readAuthenticatedPrincipal(request);
  if (principal === null) {
    throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Authentication failed' });
  }
  return { principal, requestId: readAuditRequestId(request.headers) };
}
