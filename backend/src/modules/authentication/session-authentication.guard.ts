import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { assertSuperAdminIsLocalOnly } from './assert-super-admin-is-local-only';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  type AuthenticatedHttpRequest,
} from './authenticated-request';
import { AuthenticationError } from './authentication.error';
import { AuthenticationUserLoader } from './authentication-user.loader';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import { readBearerAccessToken } from './read-bearer-access-token';
import { SessionTokenService } from './session-token.service';
import { toAuthorizationPrincipal } from './to-authorization-principal';

@Injectable()
export class SessionAuthenticationGuard implements CanActivate {
  constructor(
    private readonly sessionTokenService: SessionTokenService,
    private readonly authenticationUserLoader: AuthenticationUserLoader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    const accessToken = readBearerAccessToken(request);
    if (accessToken === null) {
      throw createSessionUnauthorizedException();
    }
    try {
      const claims = await this.sessionTokenService.verify(accessToken);
      const user = await this.authenticationUserLoader.findById(claims.subjectId);
      if (user === null || !user.isActive) {
        throw createSessionUnauthorizedException();
      }
      assertSuperAdminIsLocalOnly({
        isLocalOnly: user.isLocalOnly,
        entraObjectId: user.entraObjectId,
        roleKeys: user.roleKeys,
      });
      request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY] = toAuthorizationPrincipal(
        createAuthenticatedPrincipal({
          subjectId: user.id,
          email: user.email,
          displayName: user.displayName,
          isLocalOnly: user.isLocalOnly,
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof AuthenticationError) {
        throw createSessionUnauthorizedException();
      }
      throw createSessionUnauthorizedException();
    }
  }
}

function createSessionUnauthorizedException(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Authentication failed',
  });
}
