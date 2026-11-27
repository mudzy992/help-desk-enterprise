import {
  adminReadOnlyMutatingMethods,
  adminReadOnlyRouteModules,
  adminReadOnlyServiceFormsPathPattern,
  adminReadOnlyModuleKeys,
} from './read-only-mode.constants';
import {
  adminReadOnlyRouteRegistryByHandler,
  adminReadOnlySubModules,
} from './admin-read-only-route-registry';
import type { AdminReadOnlyRoute } from './read-only-mode.types';

const mutatingMethods = new Set<string>(adminReadOnlyMutatingMethods);
const routeModules = [...adminReadOnlyRouteModules].sort(
  (left, right) => right.pathPrefix.length - left.pathPrefix.length,
);

/**
 * Classifies one HTTP request against read-only mode.
 *
 * The authoritative source is the route registry keyed by handler identity
 * (`Controller.method`), so a mutating verb is exempted only when *that handler*
 * is registered as a read. A request whose handler is unknown (a controller that
 * was never catalogued, a test double) is classified from the URL prefix and —
 * deliberately — **fail-closed**: an unknown mutating verb inside a lockable
 * module counts as a mutation.
 */
export function classifyAdminReadOnlyRequest(input: {
  readonly method: unknown;
  readonly path: unknown;
  readonly handlerIdentity?: string | null;
}): AdminReadOnlyRoute | null {
  const registered =
    typeof input.handlerIdentity === 'string' &&
    input.handlerIdentity.length > 0
      ? adminReadOnlyRouteRegistryByHandler.get(input.handlerIdentity)
      : undefined;
  if (registered !== undefined) {
    return {
      moduleKey: registered.moduleKey,
      isMutation: registered.kind === 'mutation',
    };
  }
  const resolved = resolveAdminReadOnlyModule(input.path);
  if (resolved === null) {
    return null;
  }
  return {
    moduleKey: resolved.moduleKey,
    isMutation: mutatingMethods.has(normalizeHttpMethod(input.method)),
  };
}

/**
 * Resolves the owning module for a URL path, together with every module that
 * claims it. The winner is the most specific prefix; the candidate list exists
 * so the census can prove that "most specific" is a total, unambiguous rule
 * (the only declared overlap is the `service_forms ⊂ service_catalog` nesting).
 */
export function resolveAdminReadOnlyModule(path: unknown): {
  readonly moduleKey: string;
  readonly candidateModuleKeys: readonly string[];
} | null {
  const normalized = normalizeHttpPath(path);
  const candidates = listAdminReadOnlyModuleCandidates(normalized);
  if (candidates.length === 0) {
    return null;
  }
  return { moduleKey: candidates[0] as string, candidateModuleKeys: candidates };
}

export function listAdminReadOnlyModuleCandidates(
  path: unknown,
): readonly string[] {
  const normalized = normalizeHttpPath(path);
  const candidates: string[] = [];
  if (adminReadOnlyServiceFormsPathPattern.test(normalized)) {
    candidates.push(adminReadOnlyModuleKeys.serviceForms);
  }
  for (const route of routeModules) {
    if (
      normalized !== route.pathPrefix &&
      !normalized.startsWith(`${route.pathPrefix}/`)
    ) {
      continue;
    }
    if (!candidates.includes(route.moduleKey)) {
      candidates.push(route.moduleKey);
    }
  }
  return candidates;
}

/**
 * True when the candidate set is a single module, or a sub-module together with
 * the parent module that owns its URL tree.
 */
export function isAdminReadOnlyModuleOwnershipExplicit(
  candidateModuleKeys: readonly string[],
): boolean {
  if (candidateModuleKeys.length === 1) {
    return true;
  }
  for (const moduleKey of candidateModuleKeys) {
    const parent = adminReadOnlySubModules[moduleKey];
    if (parent !== undefined && candidateModuleKeys.includes(parent)) {
      return true;
    }
  }
  return false;
}

export function normalizeHttpPath(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const withoutQuery = raw.split('?')[0] ?? '';
  if (withoutQuery.trim().length === 0) {
    return '/';
  }
  const trimmed = withoutQuery.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizeHttpMethod(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toUpperCase();
}
