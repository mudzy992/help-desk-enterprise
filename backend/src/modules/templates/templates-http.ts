import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { authorizationRoleKeys } from '../authorization/authorization.constants';

export const staffRoleKeys = [
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
] as const;

export const templatesValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

export function readActor(request: AuthenticatedHttpRequest): { readonly actorUserId: string } {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authorization failed' });
  }
  return { actorUserId };
}
