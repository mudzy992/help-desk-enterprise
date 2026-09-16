import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Query,
  Req,
  StreamableFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { OuAccessGuard } from '../authorization/ou-access.guard';
import { RequireOrganizationalUnitScope } from '../authorization/require-organizational-unit-scope.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { readAuditRequestId } from '../audit-log/read-audit-request-id';
import { readSettingsActorUserId } from '../settings/read-settings-actor-user-id';
import {
  ExportReportPackQueryDto,
  ReportScopeQueryDto,
} from './dto/report-query.dto';
import { mapReportsError } from './map-reports-error';
import { parseReportPackSlug } from './parse-report-pack-slug';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(SessionAuthenticationGuard, RoleGuard, OuAccessGuard)
@RequireRoles(authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
@RequirePermissions(permissionKeys.reportsExport, permissionKeys.auditExport)
@RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('packs/:packSlug')
  @Header('Cache-Control', 'no-store')
  async exportPack(
    @Param('packSlug') packSlug: string,
    @Query() query: ExportReportPackQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<StreamableFile> {
    const actorUserId = readSettingsActorUserId(request);
    if (actorUserId === null) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Authorization failed',
      });
    }
    try {
      const exported = await this.reportsService.exportPack(
        { ...query, pack: parseReportPackSlug(packSlug) },
        actorUserId,
        readAuditRequestId(request.headers),
      );
      return new StreamableFile(Buffer.from(exported.content, 'utf8'), {
        type: exported.contentType,
        disposition: `attachment; filename="${exported.fileName}"`,
      });
    } catch (error) {
      throw mapReportsError(error);
    }
  }

  @Get('bottlenecks')
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  bottleneck(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.bottleneck(query).catch((error) => {
      throw mapReportsError(error);
    });
  }

  @Get('dashboard')
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  dashboard(@Query() query: ReportScopeQueryDto) {
    return this.reportsService.dashboard(query).catch((error) => {
      throw mapReportsError(error);
    });
  }
}
