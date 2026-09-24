import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  readAuthenticatedPrincipal,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { ReportSummaryQueryDto } from './dto/report-summary-query.dto';
import { ReportSummaryService } from './report-summary.service';
import type {
  DashboardSummaryResponse,
  SlaSummaryResponse,
} from './summary/report-summary.types';

/**
 * Phase 2.4 (plan §2.4): `GET /reports/dashboard/summary` and
 * `GET /reports/sla/summary`.
 *
 * These two live next to the report exports but not under their guards: the
 * dashboard is the landing page for every signed-in user, requester included,
 * while `ReportsController` is the admin-only export surface. What a caller may
 * count is decided by the ticket visibility rules inside the service, not by a
 * role: everybody gets exactly the numbers of the lists they can open.
 */
@Controller('reports')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ReportSummaryController {
  constructor(private readonly summaries: ReportSummaryService) {}

  @Get('dashboard/summary')
  async dashboardSummary(
    @Query() query: ReportSummaryQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<DashboardSummaryResponse> {
    return this.summaries.loadDashboardSummary({
      actorUserId: readActorUserId(request),
      scope: query.scope ?? 'all',
    });
  }

  @Get('sla/summary')
  async slaSummary(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaSummaryResponse> {
    return this.summaries.loadSlaSummary({
      actorUserId: readActorUserId(request),
    });
  }
}

function readActorUserId(request: AuthenticatedHttpRequest): string {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return actorUserId;
}
