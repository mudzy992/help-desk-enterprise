import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { readPrincipalContext, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';

/**
 * SLA configuration is a deployment-wide policy boundary. OU/service-scoped
 * administrators may consume computed SLA data, but cannot administer global
 * calendars, profiles, matrices, rules, escalation targets, or their history.
 */
@Injectable()
export class SlaGlobalAdministrationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest & { method?: string }>();
    const principal = readPrincipalContext(request);
    if (principal === null) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authorization failed' });
    }
    if (principal.roleKeys.includes(authorizationRoleKeys.superAdmin)) {
      return true;
    }
    // The permission catalogue currently exposes one SLA administration
    // capability. Reads of configuration/history are administration too.
    const requiredPermission = permissionKeys.slaWrite;
    const globallyAuthorized = principal.assignments.some(
      (assignment) =>
        assignment.organizationalUnitId === null &&
        assignment.serviceId === null &&
        assignment.permissionKeys.includes(requiredPermission),
    );
    if (!globallyAuthorized) {
      throw new ForbiddenException({
        code: 'SLA_GLOBAL_SCOPE_REQUIRED',
        message: 'Global SLA administration scope is required',
      });
    }
    return true;
  }
}
