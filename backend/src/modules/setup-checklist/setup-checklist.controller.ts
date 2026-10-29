import { Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { readSettingsActorUserId } from '../settings/read-settings-actor-user-id';
import { SetupChecklistService } from './setup-checklist.service';
import type { SetupChecklistStatus } from './setup-checklist.types';

/**
 * the checklist is administration content — reading it
 * names what the installation is still missing, so it needs the same capability
 * that lets somebody change it (`settings.write`; a separate read permission does
 * not exist). It is deliberately **not** under `InstallWizardLockGuard`: the
 * checklist only exists after the installation finished, which is exactly when
 * that guard closes the wizard.
 */
@Controller('setup-checklist')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@RequirePermissions(permissionKeys.settingsWrite)
export class SetupChecklistController {
  constructor(private readonly setupChecklistService: SetupChecklistService) {}

  @Get()
  @AdminReadOperation()
  getStatus(): Promise<SetupChecklistStatus> {
    return this.setupChecklistService.getStatus();
  }

  /** Hides the dashboard widget; the items stay readable from Settings. */
  @Post('dismiss')
  dismiss(@Req() request: AuthenticatedHttpRequest): Promise<SetupChecklistStatus> {
    const actorUserId = readSettingsActorUserId(request);
    if (actorUserId === null) {
      // Without a session there is nobody to attribute the dismissal to, and the
      // guard chain above already answered 401 for that case.
      throw new ForbiddenException({ code: 'FORBIDDEN' });
    }
    return this.setupChecklistService.dismiss(actorUserId);
  }
}
