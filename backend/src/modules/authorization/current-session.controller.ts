import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { AuthorizationContextLoader } from './authorization-context.loader';
import type { CurrentSessionResponse } from './current-session.types';
import { toCurrentSessionResponse } from './to-current-session-response';

/// Lets the client render only the actions the signed-in user can perform.
/// Every endpoint still enforces its own roles, permissions, and scopes.
@Controller('auth')
@UseGuards(SessionAuthenticationGuard)
export class CurrentSessionController {
  constructor(
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly settings: SettingsService,
  ) {}

  private async isEnabled(key: string): Promise<boolean> {
    try {
      return (await this.settings.getSetting(key)) === true;
    } catch {
      return false;
    }
  }

  @Get('session')
  async getCurrentSession(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<CurrentSessionResponse> {
    const principal = readAuthenticatedPrincipal(request);
    if (principal === null) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Authorization failed',
      });
    }
    const context = await this.authorizationContextLoader.loadBySubjectId(
      principal.subjectId,
    );
    const homeOrganizationalUnit =
      await this.authorizationContextLoader.loadHomeOrganizationalUnit(
        principal.subjectId,
      );
    const [cmdb, problems, changes] = await Promise.all([
      this.isEnabled(settingKeys.privateAddonsCmdb),
      this.isEnabled(settingKeys.privateAddonsProblems),
      this.isEnabled(settingKeys.privateAddonsChanges),
    ]);
    return toCurrentSessionResponse(principal, context, homeOrganizationalUnit, { cmdb, problems, changes });
  }
}
