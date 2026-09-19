import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Query,
  Req,
  StreamableFile,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { readAuditRequestId } from '../../audit-log/read-audit-request-id';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import type { TicketMutationContext } from '../tickets.types';
import { ExportTicketsQueryDto } from './dto/export-tickets-query.dto';
import { TicketsExportService } from './tickets-export.service';

// The export permission (audit.export) is enforced per ticket inside the
// service, because it must only count within the granting assignment's scope.
@Controller('tickets/export')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class TicketsExportController {
  constructor(private readonly exportService: TicketsExportService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async exportCsv(
    @Query() query: ExportTicketsQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<StreamableFile> {
    const exported = await this.exportService.exportCsv(
      {
        originUnitId: query.originUnitId,
        serviceId: query.serviceId,
        status: query.status,
        priority: query.priority,
        assignedUserId: query.assignedUserId,
        requesterId: query.requesterId,
        unassigned: query.unassigned === 'true' ? true : undefined,
        overdue: query.overdue === 'true' ? true : undefined,
        createdFrom: query.createdFrom,
        createdTo: query.createdTo,
        q: query.q,
      },
      readContext(request),
      readAuditRequestId(request.headers),
    );
    return new StreamableFile(Buffer.from(exported.content, 'utf8'), {
      type: exported.contentType,
      disposition: `attachment; filename="${exported.fileName}"`,
    });
  }
}

function readContext(request: AuthenticatedHttpRequest): TicketMutationContext {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return { actorUserId };
}
