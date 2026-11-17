import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { serviceReadWhere } from '../service-catalog/service-read-where';
import {
  serviceListVisibilityForPrincipal,
  type ServiceListVisibility,
} from '../service-catalog/service-visible-lifecycles';
import type { StatusViewer } from '../status-page/status-page.service';
import { statusViewerFromAuthorizationContext } from '../status-page/status-viewer';

export type ProblemCrossDomainVisibility = {
  /** What the service catalog itself would let this user read. */
  readonly services: ServiceListVisibility;
  readonly serviceWhere: Record<string, unknown>;
  /** What the status page itself would let this user read. */
  readonly incidents: StatusViewer;
};

/**
 * W7.29 (BA-problems-11): a problem may name a service and link additional
 * services and status-page incidents, but `problem.manage` authority over a
 * problem group is not authority over the service catalog or over incidents
 * that are restricted to other services' staff. Those two domains keep their
 * own read policy, and the problem module borrows it here instead of widening
 * it: the service catalog decides which lifecycles (drafts are admin-only) and
 * services a user may read, the status page decides which incidents a user may
 * see (`ALL_USERS`, or `STAFF_ONLY` inside their service scope).
 */
export async function problemCrossDomainVisibility(
  loader: AuthorizationContextLoader,
  userId: string,
): Promise<ProblemCrossDomainVisibility> {
  const context = await loader.loadBySubjectId(userId);
  const services = serviceListVisibilityForPrincipal(
    context === null
      ? null
      : {
          isLocalOnly: context.isLocalOnly,
          roleKeys: [...new Set(context.assignments.map((assignment) => assignment.roleKey))],
          assignments: context.assignments,
        },
  );
  return {
    services,
    serviceWhere: serviceReadWhere(services),
    incidents: statusViewerFromAuthorizationContext(context, userId),
  };
}
