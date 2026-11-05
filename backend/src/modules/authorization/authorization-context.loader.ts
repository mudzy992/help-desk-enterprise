import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { PrincipalContextLoader } from '../../common/principal-context/principal-context.loader';
import { createAuthorizationContext } from './create-authorization-context';
import type { AuthorizationContext } from './authorization.types';

export type AuthoritativeAuthorizationSnapshot = {
  readonly context: AuthorizationContext | null;
  readonly groupIds: readonly string[];
};

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
    directoryObjectGuid: principal.directoryObjectGuid ?? null,
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

  /**
   * Digest delivery is revocation-sensitive: it must not reuse a request/Redis
   * principal snapshot or the group ids attached to that snapshot. Read the
   * principal and current memberships together from PostgreSQL immediately
   * before the ticket visibility query.
   */
  async loadAuthoritativeSnapshotBySubjectId(
    subjectId: string,
  ): Promise<AuthoritativeAuthorizationSnapshot> {
    const id = subjectId.trim();
    if (id.length === 0) {
      return { context: null, groupIds: [] };
    }
    const principal = await this.principalContextLoader.loadAuthoritatively(id);
    if (principal === null || principal.mustChangePassword) {
      return { context: null, groupIds: [] };
    }
    const context = toAuthorizationContext(principal);
    if (context === null) {
      return { context: null, groupIds: [] };
    }
    return { context, groupIds: principal.groupIds };
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
