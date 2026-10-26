import type { Prisma } from '../../../generated/prisma/client';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { authorizationRoleKeys, permissionKeys } from '../../authorization/authorization.constants';
import { buildGroupInboxWhere } from '../assignment/build-group-inbox-where';
import { buildTicketVisibilityWhere, type TicketVisibilityInput } from './build-ticket-visibility-where';

export type TicketVisibilitySurface = 'detail' | 'list' | 'count' | 'summary' | 'search' | 'group_inbox' | 'audit_export';
type ReadSurface = Exclude<TicketVisibilitySurface, 'group_inbox' | 'audit_export'>;

/**
 * Canonical capability contract for every derived ticket surface. Callers add
 * business filters only after this predicate; they must not recreate actor,
 * OU/service, confidentiality or export capability rules themselves.
 */
export function buildTicketSurfaceVisibility(input:
  | { readonly surface: ReadSurface; readonly visibility: TicketVisibilityInput }
  | { readonly surface: 'group_inbox'; readonly visibility: TicketVisibilityInput }
  | { readonly surface: 'audit_export'; readonly context: AuthorizationContext }
): Prisma.TicketWhereInput | null {
  if (input.surface === 'group_inbox') {
    const clauses = buildGroupInboxWhere(input.visibility);
    return clauses === null ? null : { AND: clauses };
  }
  if (input.surface === 'audit_export') return buildAuditExportVisibility(input.context);
  return { AND: buildTicketVisibilityWhere(input.visibility) };
}

function buildAuditExportVisibility(context: AuthorizationContext): Prisma.TicketWhereInput {
  if (context.isSuperAdmin) return { isConfidential: false };
  const grants = context.assignments.filter((assignment) =>
    [authorizationRoleKeys.agent, authorizationRoleKeys.admin].includes(assignment.roleKey as never) &&
    assignment.permissionKeys.includes(permissionKeys.auditExport) &&
    assignment.organizationalUnitPath !== null,
  );
  return {
    isConfidential: false,
    OR: grants.map((assignment) => ({
      originUnit: { is: { OR: [
        { ouPath: assignment.organizationalUnitPath! },
        { ouPath: { startsWith: `${assignment.organizationalUnitPath}/` } },
      ] } },
      ...(assignment.serviceId === null ? {} : { serviceId: assignment.serviceId }),
    })),
  };
}
