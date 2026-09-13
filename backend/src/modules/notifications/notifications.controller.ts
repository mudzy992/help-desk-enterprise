import {
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
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
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
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @Query() query: ListNotificationsQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.notificationsService.list(readUserId(request), query);
  }

  @Get('unread-count')
  unreadCount(@Req() request: AuthenticatedHttpRequest) {
    return this.notificationsService.unreadCount(readUserId(request));
  }

  @Post('read-all')
  markAllRead(@Req() request: AuthenticatedHttpRequest) {
    return this.notificationsService.markAllRead(readUserId(request));
  }

  @Post(':notificationId/read')
  markRead(
    @Param('notificationId') notificationId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.notificationsService.markRead(readUserId(request), notificationId);
  }
}

function readUserId(request: AuthenticatedHttpRequest): string {
  const userId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (userId.length === 0) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return userId;
}
