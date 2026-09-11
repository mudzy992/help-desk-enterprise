import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
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
  ) {}

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
    return toCurrentSessionResponse(
      principal,
      await this.authorizationContextLoader.loadBySubjectId(
        principal.subjectId,
      ),
    );
  }
}
