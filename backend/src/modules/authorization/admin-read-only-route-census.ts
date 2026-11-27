import {
  isAdminReadOnlyModuleOwnershipExplicit,
  resolveAdminReadOnlyModule,
} from './classify-admin-read-only-request';
import { adminReadOnlyMutatingMethods } from './read-only-mode.constants';
import {
  adminReadOnlyRouteRegistry,
  type AdminReadOnlyRouteRegistration,
} from './admin-read-only-route-registry';

/**
 * One HTTP route as the central manifest reports it
 * (`docs/backend/backend-wiring-manifest.json`).
 */
export type AdminRouteCensusEntry = {
  readonly controller: string;
  readonly handler: string;
  readonly method: string;
  readonly path: string;
};

export type AdminReadOnlyCensusViolation = {
  readonly kind:
    | 'uncatalogized-mutation'
    | 'stale-registration'
    | 'attribute-mismatch'
    | 'module-mismatch'
    | 'ambiguous-module-ownership'
    | 'duplicate-registration';
  readonly handler: string;
  readonly detail: string;
};

const mutatingMethods = new Set<string>(adminReadOnlyMutatingMethods);

export function adminRouteHandlerIdentity(route: {
  readonly controller: string;
  readonly handler: string;
}): string {
  return `${route.controller}.${route.handler}`;
}

/**
 * Compares the complete admin mutation census (every mutating HTTP route that
 * resolves into a lockable module) with the read-only route registry.
 *
 * The registry is the source of truth at runtime, so anything returned here is
 * drift: a mutation nobody catalogued, a registration that no longer matches a
 * live route, or a route that moved to a different module than the registry
 * claims.
 */
export function findAdminReadOnlyCensusViolations(
  routes: readonly AdminRouteCensusEntry[],
  registry: readonly AdminReadOnlyRouteRegistration[] = adminReadOnlyRouteRegistry,
): readonly AdminReadOnlyCensusViolation[] {
  const violations: AdminReadOnlyCensusViolation[] = [];
  const byHandler = new Map<string, AdminReadOnlyRouteRegistration>();
  for (const registration of registry) {
    if (byHandler.has(registration.handler)) {
      violations.push({
        kind: 'duplicate-registration',
        handler: registration.handler,
        detail: 'handler je registrovan više puta',
      });
      continue;
    }
    byHandler.set(registration.handler, registration);
  }

  const liveByHandler = new Map<string, AdminRouteCensusEntry>();
  for (const route of routes) {
    liveByHandler.set(adminRouteHandlerIdentity(route), route);
  }

  for (const route of routes) {
    if (!mutatingMethods.has(route.method.toUpperCase())) {
      continue;
    }
    const resolved = resolveAdminReadOnlyModule(route.path);
    if (resolved === null) {
      continue;
    }
    const handler = adminRouteHandlerIdentity(route);
    if (!isAdminReadOnlyModuleOwnershipExplicit(resolved.candidateModuleKeys)) {
      violations.push({
        kind: 'ambiguous-module-ownership',
        handler,
        detail: `moduli ${resolved.candidateModuleKeys.join(', ')} polažu pravo na ${route.path} bez deklarisane pod-modul relacije`,
      });
    }
    const registration = byHandler.get(handler);
    if (registration === undefined) {
      violations.push({
        kind: 'uncatalogized-mutation',
        handler,
        detail: `${route.method} ${route.path} pripada modulu ${resolved.moduleKey}, ali nema zapisa u read-only registru`,
      });
      continue;
    }
    if (
      registration.method !== route.method.toUpperCase() ||
      registration.path !== route.path
    ) {
      violations.push({
        kind: 'attribute-mismatch',
        handler,
        detail: `registar kaže ${registration.method} ${registration.path}, manifest kaže ${route.method} ${route.path}`,
      });
    }
    if (registration.moduleKey !== resolved.moduleKey) {
      violations.push({
        kind: 'module-mismatch',
        handler,
        detail: `registar kaže ${registration.moduleKey}, URL pripada ${resolved.moduleKey}`,
      });
    }
  }

  for (const registration of registry) {
    const route = liveByHandler.get(registration.handler);
    if (route === undefined) {
      violations.push({
        kind: 'stale-registration',
        handler: registration.handler,
        detail: 'ruta više ne postoji u centralnom manifestu',
      });
      continue;
    }
    if (!mutatingMethods.has(route.method.toUpperCase())) {
      violations.push({
        kind: 'stale-registration',
        handler: registration.handler,
        detail: `ruta ${route.method} ${route.path} nije mutirajuća`,
      });
    }
    if (resolveAdminReadOnlyModule(route.path) === null) {
      violations.push({
        kind: 'stale-registration',
        handler: registration.handler,
        detail: `ruta ${route.method} ${route.path} više nije u lockable modulu`,
      });
    }
  }

  return violations;
}
