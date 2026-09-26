import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { AuthenticationUserLoader } from '../authentication/authentication-user.loader';
import { AdminSecurityReasonDto } from '../authentication/dto/mfa.dto';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AccountSecurityPolicyLoader } from '../authentication/security/account-security-policy.loader';
import { passwordExpiresAt } from '../authentication/security/account-security-rules';
import { type MfaStatus, MfaService } from '../authentication/security/mfa.service';
import { SessionRegistryService, type UserSessionView } from '../authentication/security/session-registry.service';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { assertCanManageTargetUser } from './assert-can-manage-target-user';

export type UserSecurityResponse = {
  readonly mfa: MfaStatus;
  readonly passwordChangedAt: string | null;
  readonly passwordExpiresAt: string | null;
  readonly sessions: UserSessionView[];
};

/**
 * Paket 2.1 (M5/M6): administrator view of one user's account security. The
 * same hierarchy as the rest of `/users`: an ADMIN cannot touch a SUPER_ADMIN,
 * and nobody resets their own MFA here (that is the profile page).
 */
@Controller('users')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class UserSecurityController {
  constructor(
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly userLoader: AuthenticationUserLoader,
    private readonly policyLoader: AccountSecurityPolicyLoader,
    private readonly mfaService: MfaService,
    private readonly sessionRegistry: SessionRegistryService,
  ) {}

  @Get(':userId/security')
  async security(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<UserSecurityResponse> {
    await this.assertCanManage(request, userId, { allowSelf: true });
    const user = await this.userLoader.findById(userId);
    if (user === null) throw notFound();
    const policy = await this.policyLoader.load();
    const expiresAt = user.localPasswordHash ? passwordExpiresAt(user, policy) : null;
    return {
      mfa: await this.mfaService.status(user, policy),
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      passwordExpiresAt: expiresAt?.toISOString() ?? null,
      sessions: await this.sessionRegistry.list(userId, null),
    };
  }

  @Post(':userId/sessions/revoke-all')
  async revokeAll(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<{ revoked: number }> {
    const actorUserId = await this.assertCanManage(request, userId, { allowSelf: false });
    return { revoked: await this.sessionRegistry.revokeAll({ userId, reason: 'admin', actorUserId }) };
  }

  /** The user sets MFA up again at the next sign-in (forced when required). */
  @Post(':userId/mfa/reset')
  @HttpCode(204)
  async resetMfa(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: AdminSecurityReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    const actorUserId = await this.assertCanManage(request, userId, { allowSelf: false });
    if ((await this.userLoader.findById(userId)) === null) throw notFound();
    await this.mfaService.reset(userId, actorUserId, body.reason.trim(), 'admin');
    await this.sessionRegistry.revokeAll({ userId, reason: 'mfa_reset', actorUserId });
  }

  private async assertCanManage(
    request: AuthenticatedHttpRequest,
    targetUserId: string,
    options: { readonly allowSelf: boolean },
  ): Promise<string> {
    const principal = readAuthenticatedPrincipal(request);
    const actorUserId = principal?.subjectId ?? '';
    if (!options.allowSelf && actorUserId === targetUserId) {
      throw new ForbiddenException({
        code: 'SELF_SECURITY_ACTION_FORBIDDEN',
        message: 'Use the profile security page for your own account',
      });
    }
    const [actor, target] = await Promise.all([
      this.authorizationContextLoader.loadBySubjectId(actorUserId),
      this.authorizationContextLoader.loadBySubjectId(targetUserId),
    ]);
    assertCanManageTargetUser({
      actorIsSuperAdmin: actor?.isSuperAdmin === true,
      targetIsSuperAdmin: target?.isSuperAdmin === true,
    });
    return actorUserId;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
}
