import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../../authentication/authenticated-request';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import type { TicketMutationContext } from '../tickets.types';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';
import { TicketsSavedViewsService } from './tickets-saved-views.service';

@Controller('tickets/saved-views')
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
export class TicketsSavedViewsController {
  constructor(private readonly savedViewsService: TicketsSavedViewsService) {}

  @Get()
  list(@Req() request: AuthenticatedHttpRequest) {
    return this.savedViewsService.list(readContext(request));
  }

  @Post()
  create(
    @Body() body: CreateSavedViewDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.savedViewsService.create(body, readContext(request));
  }

  @Patch(':savedViewId')
  update(
    @Param('savedViewId') savedViewId: string,
    @Body() body: UpdateSavedViewDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.savedViewsService.update(savedViewId, body, readContext(request));
  }

  @Delete(':savedViewId')
  remove(
    @Param('savedViewId') savedViewId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.savedViewsService.remove(savedViewId, readContext(request));
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
