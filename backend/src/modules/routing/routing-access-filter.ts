import type { AuthorizationContext } from '../authorization/authorization.types';
import { permissionKeys } from '../authorization/authorization.constants';
import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';
import { doesServiceScopeCover } from '../authorization/does-service-scope-cover';
import type {
  RoutingChangeLogResponse,
  RoutingCoverageItem,
  RoutingRuleRecord,
  RoutingRuleResponse,
} from './routing.types';

export type RoutingScopeSettable = {
  readonly originUnitId?: string | null;
  readonly serviceId?: string | null;
  readonly originUnitPath?: string | null;
};

export function hasRoutingReadAccess(
  context: AuthorizationContext | null,
): boolean {
  if (context === null) {
    return false;
  }
  if (context.isSuperAdmin) {
    return true;
  }
  return context.assignments.some((assignment) =>
    assignment.permissionKeys.includes(permissionKeys.routingRead) ||
    assignment.permissionKeys.includes(permissionKeys.routingWrite),
  );
}

export function resolveRoutingReadAssignments(
  context: AuthorizationContext | null,
): readonly {
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
}[] {
  if (context === null) {
    return [];
  }
  if (context.isSuperAdmin) {
    return [{ organizationalUnitPath: null, serviceId: null }];
  }
  return context.assignments
    .filter(
      (assignment) =>
        assignment.permissionKeys.includes(permissionKeys.routingRead) ||
        assignment.permissionKeys.includes(permissionKeys.routingWrite),
    )
    .map((assignment) => ({
      organizationalUnitPath: assignment.organizationalUnitPath,
      serviceId: assignment.serviceId,
    }));
}

export function isRoutingScopeVisible(
  item: RoutingScopeSettable,
  assignments: readonly {
    readonly organizationalUnitPath: string | null;
    readonly serviceId: string | null;
  }[],
): boolean {
  if (assignments.length === 0) {
    return false;
  }
  const isGlobal = assignments.some(
    (assignment) =>
      assignment.organizationalUnitPath === null &&
      assignment.serviceId === null,
  );
  if (isGlobal) {
    return true;
  }
  return assignments.some(
    (assignment) =>
      doesOrganizationalUnitScopeCover({
        assignedPath: assignment.organizationalUnitPath,
        requestedPath: item.originUnitPath ?? item.originUnitId ?? null,
      }) &&
      doesServiceScopeCover({
        assignedServiceId: assignment.serviceId,
        requestedServiceId: item.serviceId ?? null,
      }),
  );
}

export function filterRoutingRules<T extends RoutingRuleResponse | RoutingRuleRecord>(
  rules: readonly T[],
  context: AuthorizationContext | null,
): readonly T[] {
  const assignments = resolveRoutingReadAssignments(context);
  const isGlobal = assignments.some(
    (assignment) =>
      assignment.organizationalUnitPath === null &&
      assignment.serviceId === null,
  );
  if (isGlobal) {
    return rules;
  }
  return rules.filter((rule) => isRoutingScopeVisible(rule, assignments));
}

export function filterRoutingCoverage<T extends RoutingCoverageItem>(
  items: readonly T[],
  context: AuthorizationContext | null,
): readonly T[] {
  const assignments = resolveRoutingReadAssignments(context);
  const isGlobal = assignments.some(
    (assignment) =>
      assignment.organizationalUnitPath === null &&
      assignment.serviceId === null,
  );
  if (isGlobal) {
    return items;
  }
  return items.filter((item) => isRoutingScopeVisible(item, assignments));
}

export function filterRoutingChangeLogs(
  logs: readonly RoutingChangeLogResponse[],
  context: AuthorizationContext | null,
  visibleRuleIds: ReadonlySet<string>,
): readonly RoutingChangeLogResponse[] {
  const assignments = resolveRoutingReadAssignments(context);
  const isGlobal = assignments.some(
    (assignment) =>
      assignment.organizationalUnitPath === null &&
      assignment.serviceId === null,
  );
  if (isGlobal) {
    return logs;
  }
  return logs.filter((log) => {
    if (log.entityType === 'routing_rule') {
      return visibleRuleIds.has(log.entityId);
    }
    if (
      log.entityType === 'routing_configuration' &&
      isRoutingScopeVisible({ originUnitId: null, serviceId: null }, assignments)
    ) {
      return true;
    }
    return false;
  });
}
