import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { assertSuperAdminIsLocalOnly } from './assert-super-admin-is-local-only';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  PRINCIPAL_CONTEXT_REQUEST_KEY,
  SESSION_ID_REQUEST_KEY,
  type AuthenticatedHttpRequest,
} from './authenticated-request';
import { AuthenticationError } from './authentication.error';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import { readBearerAccessToken } from './read-bearer-access-token';
import { SessionTokenService } from './session-token.service';
import { toAuthorizationPrincipal } from './to-authorization-principal';

@Injectable()
export class SessionAuthenticationGuard implements CanActivate {
  constructor(
    private readonly sessionTokenService: SessionTokenService,
    private readonly principalContextLoader: PrincipalContextLoader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    const accessToken = readBearerAccessToken(request);
    if (accessToken === null) {
      throw createSessionUnauthorizedException();
    }
    try {
      const claims = await this.sessionTokenService.verify(accessToken);
      // Phase 2.2: one load (Redis → database) answers every check below and is
      // then handed to the rest of the request, instead of each guard and
      // service reading the same rows again.
      const context = await this.principalContextLoader.load(claims.subjectId);
      if (context === null || !context.isActive) {
        throw createSessionUnauthorizedException();
      }
      if (context.mustChangePassword) {
        throw createSessionUnauthorizedException();
      }
      assertSuperAdminIsLocalOnly({
        isLocalOnly: context.isLocalOnly,
        entraObjectId: context.entraObjectId,
        roleKeys: context.roleKeys,
      });
      request[PRINCIPAL_CONTEXT_REQUEST_KEY] = context;
      request[SESSION_ID_REQUEST_KEY] = claims.sessionId ?? null;
      request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY] = toAuthorizationPrincipal(
        createAuthenticatedPrincipal({
          subjectId: context.subjectId,
          email: context.email,
          displayName: context.displayName,
          isLocalOnly: context.isLocalOnly,
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
