import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
} from '../authentication/authenticated-request';
import { AuthorizationService } from './authorization.service';
import { readAuthorizationRequirements } from './read-authorization-requirements';
import { resolveAuthorizationScopeValue } from './resolve-authorization-scope';

export async function authorizeHttpExecution(input: {
  readonly context: ExecutionContext;
  readonly reflector: Reflector;
  readonly authorizationService: AuthorizationService;
  readonly requireOrganizationalUnitScope: boolean;
}): Promise<boolean> {
  const request = input.context
    .switchToHttp()
    .getRequest<AuthenticatedHttpRequest>();
  const principal = readAuthenticatedPrincipal(request);
  if (principal === null) {
    throw new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Authentication failed',
    });
  }
  const requirements = readAuthorizationRequirements(
    input.reflector,
    input.context,
    { requireOrganizationalUnitScope: input.requireOrganizationalUnitScope },
  );
  const allowed = await input.authorizationService.authorize({
    principal,
    requirements,
    organizationalUnitId: resolveAuthorizationScopeValue(
      request,
      requirements.organizationalUnitScope,
    ),
    serviceId: resolveAuthorizationScopeValue(request, requirements.serviceScope),
  });
  if (!allowed) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return true;
}
