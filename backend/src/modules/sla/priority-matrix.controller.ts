import { AdminConfigDomains } from '../../common/admin-realtime/admin-config-domain.decorator';
import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { PatchPriorityMatrixDto } from './dto/priority-matrix.dto';
import type { PriorityMatrixResponse } from './list-priority-matrix';
import { PriorityMatrixService } from './priority-matrix.service';
import { readSlaMutationContext } from './read-sla-mutation-context';
import type { SlaChangeLogResponse } from './sla.types';

@AdminConfigDomains('sla')
@Controller('priority-matrix')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class PriorityMatrixController {
  constructor(private readonly priorityMatrixService: PriorityMatrixService) {}

  @Get()
  @RequireRoles(
    authorizationRoleKeys.user,
    authorizationRoleKeys.agent,
    authorizationRoleKeys.admin,
    authorizationRoleKeys.superAdmin,
  )
  list(): Promise<PriorityMatrixResponse> {
    return this.priorityMatrixService.list();
  }

  @Get('changes')
  @RequireRoles(authorizationRoleKeys.admin)
  listChanges(): Promise<readonly SlaChangeLogResponse[]> {
    return this.priorityMatrixService.listChanges();
  }

  @Patch()
  @RequireRoles(authorizationRoleKeys.admin)
  @RequirePermissions(permissionKeys.slaWrite)
  patch(
    @Body() body: PatchPriorityMatrixDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<PriorityMatrixResponse> {
    return this.priorityMatrixService.patch(
      body,
      readSlaMutationContext(request),
    );
  }
}
