import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  readAuthenticatedPrincipal,
} from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { EdgeExtensionBootstrapQueryDto } from './dto/edge-extension-bootstrap-query.dto';
import { RecordEdgeNotificationReceiptDto } from './dto/record-edge-notification-receipt.dto';
import { EdgeExtensionRemoteService } from './edge-extension-remote.service';
import { EdgeExtensionService } from './edge-extension.service';

@Controller('edge-extension')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.user,
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
export class EdgeExtensionController {
  constructor(
    private readonly edgeExtensionService: EdgeExtensionService,
    private readonly edgeExtensionRemoteService: EdgeExtensionRemoteService,
  ) {}

  @Get('bootstrap')
  bootstrap(
    @Query() query: EdgeExtensionBootstrapQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.edgeExtensionService.bootstrap(
      requirePrincipal(request),
      query.extensionVersion?.trim() ?? '',
    );
  }

  @Post('receipts')
  recordReceipt(
    @Body() body: RecordEdgeNotificationReceiptDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.edgeExtensionService.recordReceipt(requirePrincipal(request), {
      notificationId: body.notificationId,
      kind: body.kind,
      eventId: body.eventId,
    });
  }

  @Get('remote-requests/pending')
  pendingRemoteRequests(@Req() request: AuthenticatedHttpRequest) {
    return this.edgeExtensionRemoteService.pendingTicketIds(
      requirePrincipal(request),
    );
  }

  @Post('remote-requests/:ticketId/acknowledge')
  acknowledgeRemote(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.edgeExtensionRemoteService.acknowledge(
      requirePrincipal(request),
      ticketId,
    );
  }
}

function requirePrincipal(
  request: AuthenticatedHttpRequest,
): AuthorizationPrincipal {
  const principal = readAuthenticatedPrincipal(request);
  if (principal === null) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return principal;
}
