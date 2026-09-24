import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import { createAuthorizationContext } from './create-authorization-context';
import type { AuthorizationContext } from './authorization.types';

function toAuthorizationContext(
  principal: PrincipalContext | null,
): AuthorizationContext | null {
  if (principal === null) {
    return null;
  }
  return createAuthorizationContext({
    id: principal.subjectId,
    isActive: principal.isActive,
    isLocalOnly: principal.isLocalOnly,
    entraObjectId: principal.entraObjectId,
    assignments: principal.assignments,
  });
}

@Injectable()
export class AuthorizationContextLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly principalContextLoader: PrincipalContextLoader,
  ) {}

  /**
   * Phase 2.2: the authorization context is derived from the principal context
   * (one cached load) instead of issuing its own user/roles/permissions query.
   * The decision logic in `createAuthorizationContext` is untouched — this only
   * changes where the record comes from.
   */
  async loadBySubjectId(
    subjectId: string,
  ): Promise<AuthorizationContext | null> {
    const id = subjectId.trim();
    if (id.length === 0) {
      return null;
    }
    const principal = await this.principalContextLoader.load(id);
    return toAuthorizationContext(principal);
  }

  async loadHomeOrganizationalUnit(
    subjectId: string,
  ): Promise<{ readonly id: string; readonly name: string } | null> {
    const id = subjectId.trim();
    if (id.length === 0) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        organizationalUnit: {
          select: { id: true, name: true },
        },
      },
    });
    const unit = user?.organizationalUnit;
    if (unit === undefined || unit === null) {
      return null;
    }
    return { id: unit.id, name: unit.name };
  }
}
