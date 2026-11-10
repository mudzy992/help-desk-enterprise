import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isAllowedOrigin } from '../../common/cors/is-allowed-origin';
import { assertSuperAdminIsLocalOnly } from './assert-super-admin-is-local-only';
import {
  AUTHENTICATED_PRINCIPAL_REQUEST_KEY,
  PRINCIPAL_CONTEXT_REQUEST_KEY,
  SESSION_ID_REQUEST_KEY,
  SESSION_JTI_REQUEST_KEY,
  type AuthenticatedHttpRequest,
} from './authenticated-request';
import { AuthenticationError } from './authentication.error';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import { readSessionToken } from './read-session-token';
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
    const session = readSessionToken(request);
    if (session === null) {
      throw createSessionUnauthorizedException();
    }
    if (
      session.source === 'cookie' &&
      isUnsafeMethod(request.method) &&
      !isAllowedOrigin(request.headers?.origin)
    ) {
      throw createForbiddenOriginException();
    }
    try {
      const claims = await this.sessionTokenService.verify(session.token);
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
        directoryObjectGuid: context.directoryObjectGuid,
        roleKeys: context.roleKeys,
      });
      request[PRINCIPAL_CONTEXT_REQUEST_KEY] = context;
      request[SESSION_ID_REQUEST_KEY] = claims.sessionId ?? null;
      request[SESSION_JTI_REQUEST_KEY] = claims.jti ?? null;
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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isUnsafeMethod(method: string | undefined): boolean {
  return !SAFE_METHODS.has((method ?? 'GET').toUpperCase());
}

/**
 * Cookie sessions are sent by the browser on every request, so a state-changing
 * call is only trusted when it comes from an origin the API already allows.
 * Bearer callers are not browsers that attach ambient credentials, so they skip this.
 */
function createForbiddenOriginException(): ForbiddenException {
  return new ForbiddenException({
    code: 'FORBIDDEN_ORIGIN',
    message: 'Request origin is not allowed',
  });
}

function createSessionUnauthorizedException(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Authentication failed',
  });
}
