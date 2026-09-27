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
import { AdminReadOperation } from '../../authorization/admin-read-operation.decorator';
import { authorizationRoleKeys, permissionKeys } from '../../authorization/authorization.constants';
import { RequirePermissions } from '../../authorization/require-permissions.decorator';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import { readAuditRequestId } from '../../audit-log/read-audit-request-id';
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
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.list(actorOf(request)));
  }

  @Get('recipient-candidates')
  @AdminReadOperation()
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
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  get(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.get(actorOf(request), id));
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: SaveReportScheduleDto, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.update(actorOf(request), id, body));
  }

  @Patch(':id/enabled')
  setEnabled(
    @Param('id') id: string,
    @Body() body: SetReportScheduleEnabledDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.call(() => this.schedulesService.setEnabled(actorOf(request), id, body.enabled));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest): Promise<void> {
    await this.call(() => this.schedulesService.remove(actorOf(request), id));
  }

  @Get(':id/runs')
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  runs(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.runs(actorOf(request), id));
  }

  @Post(':id/send-test')
  @HttpCode(200)
  @AdminReadOperation()
  sendTest(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.sendTest(actorOf(request), id));
  }

  @Post(':id/run-now')
  @HttpCode(202)
  runNow(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest) {
    return this.call(() => this.schedulesService.runNow(actorOf(request), id));
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
