import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Post,
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
import { readSettingsActorUserId } from '../settings/read-settings-actor-user-id';
import { AuditLogService } from './audit-log.service';
import { ExportAuditLogQueryDto } from './dto/export-audit-log-query.dto';
import { mapAuditLogError } from './map-audit-log-error';
import { readAuditRequestId } from './read-audit-request-id';

@Controller('audit-logs')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@RequirePermissions(permissionKeys.auditExport)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('export')
  @UseGuards(OuAccessGuard)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  @Header('Cache-Control', 'no-store')
  async export(
    @Query() query: ExportAuditLogQueryDto,
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
      const exported = await this.auditLogService.export({
        actorUserId,
        organizationalUnitId: query.organizationalUnitId,
        format: query.format,
        requestId: readAuditRequestId(request.headers),
      });
      return new StreamableFile(Buffer.from(exported.content, 'utf8'), {
        type: exported.contentType,
        disposition: `attachment; filename="${exported.fileName}"`,
      });
    } catch (error) {
      throw mapAuditLogError(error);
    }
  }

  @Post('verify')
  @AdminReadOperation()
  verify() {
    return this.execute(() => this.auditLogService.verify());
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapAuditLogError(error);
    }
  }
}
