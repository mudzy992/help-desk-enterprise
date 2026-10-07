import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { readRequestIdHeader } from '../../common/request-context/read-request-id-header';
import {
  type AuthenticatedHttpRequest,
  readAuthenticatedPrincipal,
} from '../authentication/authenticated-request';
import { authorizationDecisionReasons } from './authorization-decision-reason';
import { AuthorizationService } from './authorization.service';
import { readAuthorizationRequirements } from './read-authorization-requirements';
import { resolveAuthorizationScopeValue } from './resolve-authorization-scope';

/** Several Nest guards can authorize one route; write at most one bypass event per HTTP request. */
const superAdminBypassAuditByRequest = new WeakMap<object, Promise<void>>();

export async function authorizeHttpExecution(input: {
  readonly context: ExecutionContext;
  readonly reflector: import('@nestjs/core').Reflector;
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
  const rawOrganizationalUnitScope = resolveAuthorizationScopeValue(
    request,
    requirements.organizationalUnitScope,
  );
  const organizationalUnitId =
    requirements.organizationalUnitScope?.resource === 'group'
      ? await input.authorizationService.resolveGroupOrganizationalUnitId(
          rawOrganizationalUnitScope,
        )
      : rawOrganizationalUnitScope;
  const serviceId = resolveAuthorizationScopeValue(request, requirements.serviceScope);
  const evaluation = await input.authorizationService.authorizeWithDecision({
    principal,
    requirements,
    organizationalUnitId,
    serviceId,
  });
  if (!evaluation.allowed) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  if (evaluation.reason === authorizationDecisionReasons.superAdminAllowed) {
    const auditRequest = request as AuthenticatedHttpRequest & {
      method?: unknown;
      baseUrl?: unknown;
      route?: { path?: unknown };
      params?: Record<string, unknown>;
    };
    const method =
      typeof auditRequest.method === 'string' ? auditRequest.method.toUpperCase() : 'UNKNOWN';
    const routePath =
      typeof auditRequest.route?.path === 'string'
        ? auditRequest.route.path
        : 'unmatched-route';
    const route =
      typeof auditRequest.baseUrl === 'string' && auditRequest.baseUrl.length > 0
        ? `${auditRequest.baseUrl}${routePath}`
        : routePath;
    const resource = Object.entries(auditRequest.params ?? {}).find(
      ([key, value]) => /(?:^id|Id)$/i.test(key) && typeof value === 'string',
    );
    const requiredPermissions = [
      ...new Set([
        ...requirements.requiredPermissions,
        ...(requirements.auditPermissionKeys ?? []),
      ]),
    ];
    const requestKey = request as object;
    let auditWrite = superAdminBypassAuditByRequest.get(requestKey);
    if (auditWrite === undefined) {
      auditWrite = input.authorizationService
        .recordSuperAdminBypass({
          actorUserId: principal.subjectId,
          requestId: readRequestIdHeader(request.headers ?? {}),
          route,
          method,
          requiredRoles: requirements.requiredRoles,
          requiredPermissions,
          permissionMatchMode: requirements.permissionMatchMode ?? 'any',
          organizationalUnitId,
          serviceId,
          resourceType: resource?.[0] ?? null,
          resourceId: typeof resource?.[1] === 'string' ? resource[1] : null,
        })
        .catch(() => {
          throw new ServiceUnavailableException({
            code: 'AUTHORIZATION_AUDIT_UNAVAILABLE',
            message: 'Authorization audit is unavailable; the operation was not performed',
          });
        });
      superAdminBypassAuditByRequest.set(requestKey, auditWrite);
    }
    await auditWrite;
  }
  return true;
}
