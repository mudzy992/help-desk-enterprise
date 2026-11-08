import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import type { AuthorizationService } from '../authorization/authorization.service';
import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';
import type { AnnouncementPermissionScope } from './announcement-permission-scope';
import { announcementUnitPathCoveredByScope } from './announcement-permission-scope';

export type AnnouncementAudienceAuthorizationCandidate = {
  readonly key: string;
  readonly organizationalUnitIds: readonly string[];
};

/**
 * Authorize announcement operations against the audience's concrete OU scope.
 * No OU filter means an org-wide audience, so only a truly global grant can
 * pass. Every OU in a multi-OU audience must be covered; scoped permissions are
 * never unioned into an implicit global grant.
 */
export async function authorizeAnnouncementAudiences(input: {
  readonly authorization: Pick<AuthorizationService, 'authorizeResource'>;
  readonly principal: AuthorizationPrincipal | null;
  readonly permissionKey: string;
  readonly permissionScope: AnnouncementPermissionScope;
  readonly candidates: readonly AnnouncementAudienceAuthorizationCandidate[];
  readonly unitPaths: ReadonlyMap<string, string>;
  readonly fallbackOrganizationalUnitPaths?: readonly string[];
}): Promise<ReadonlySet<string>> {
  const allowed = new Set<string>();
  if (input.principal === null || input.candidates.length === 0) return allowed;

  const global = await input.authorization.authorizeResource({
    principal: input.principal,
    permissionKey: input.permissionKey,
    ownerUserId: null,
    organizationalUnitId: null,
    serviceId: null,
    allowOwner: false,
  });
  if (global.allowed) return new Set(input.candidates.map((candidate) => candidate.key));

  const candidateUnitIds = [
    ...new Set(input.candidates.flatMap((candidate) => candidate.organizationalUnitIds.map((id) => id.trim()).filter(Boolean))),
  ];
  if (candidateUnitIds.length === 0) return allowed;

  const allowedUnitIds = new Set<string>();
  const fallbackPaths = (input.fallbackOrganizationalUnitPaths ?? []).filter((path) => path.trim().length > 0);
  for (const organizationalUnitId of candidateUnitIds) {
    const path = input.unitPaths.get(organizationalUnitId);
    if (path === undefined || path.trim().length === 0) continue;
    const inAssignmentScope = announcementUnitPathCoveredByScope(path, input.permissionScope);
    const inFallbackScope = fallbackPaths.some((assignedPath) =>
      doesOrganizationalUnitScopeCover({ assignedPath, requestedPath: path }),
    );
    if (!inAssignmentScope && !inFallbackScope) continue;

    if (inAssignmentScope) {
      const decision = await input.authorization.authorizeResource({
        principal: input.principal,
        permissionKey: input.permissionKey,
        ownerUserId: null,
        organizationalUnitId,
        serviceId: null,
        allowOwner: false,
      });
      if (decision.allowed) allowedUnitIds.add(organizationalUnitId);
    }
    // The existing agent-only announcement policy is a separate, explicit OU
    // grant; it does not broaden announcement.manage/report.read assignments.
    if (!allowedUnitIds.has(organizationalUnitId) && inFallbackScope) {
      allowedUnitIds.add(organizationalUnitId);
    }
  }

  for (const candidate of input.candidates) {
    const ids = [...new Set(candidate.organizationalUnitIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length > 0 && ids.every((id) => allowedUnitIds.has(id))) allowed.add(candidate.key);
  }
  return allowed;
}
