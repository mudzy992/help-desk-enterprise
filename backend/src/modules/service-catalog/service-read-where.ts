import type { ServiceLifecycle } from '../../generated/prisma/enums';
import { allServiceLifecycles, type ServiceListVisibility } from './service-visible-lifecycles';

/**
 * W7.29 (BA-problems-11): other modules embed a reference to a service (the
 * problem's own service and its additional services). Such a reference must not
 * become a way around the catalog's read policy, so the visibility decided for
 * `GET /services` is also expressed as a Prisma filter here and used by those
 * modules. `DRAFT` stays admin-only, and a service-scoped ADMIN keeps the extra
 * lifecycles only for its own services.
 */
export function serviceReadWhere(visibility: ServiceListVisibility): Record<string, unknown> {
  const publicLifecycles: readonly ServiceLifecycle[] = [...visibility.visibleLifecycles];
  const scopedServiceIds = [
    ...new Set(
      (visibility.scopedServiceIds ?? [])
        .map((serviceId) => serviceId.trim())
        .filter((serviceId) => serviceId.length > 0),
    ),
  ].sort();
  const scopedLifecycles = allServiceLifecycles.filter(
    (lifecycle) => !publicLifecycles.includes(lifecycle),
  );
  if (scopedServiceIds.length === 0 || scopedLifecycles.length === 0) {
    // Nothing beyond the public lifecycles is readable; an empty public set
    // means no service at all, not "every service".
    return publicLifecycles.length === 0
      ? { id: { in: [] as string[] } }
      : { lifecycle: { in: publicLifecycles } };
  }
  return {
    AND: [
      {
        OR: [
          ...(publicLifecycles.length === 0 ? [] : [{ lifecycle: { in: publicLifecycles } }]),
          { lifecycle: { in: scopedLifecycles }, id: { in: scopedServiceIds } },
        ],
      },
    ],
  };
}
