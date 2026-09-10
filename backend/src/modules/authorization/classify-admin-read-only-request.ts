import {
  adminReadOnlyMutatingMethods,
  adminReadOnlyReadMutationPaths,
  adminReadOnlyRouteModules,
} from './read-only-mode.constants';
import type { AdminReadOnlyRoute } from './read-only-mode.types';

const mutatingMethods = new Set<string>(adminReadOnlyMutatingMethods);
const readMutationPaths = new Set<string>(adminReadOnlyReadMutationPaths);
const routeModules = [...adminReadOnlyRouteModules].sort(
  (left, right) => right.pathPrefix.length - left.pathPrefix.length,
);

export function classifyAdminReadOnlyRequest(input: {
  readonly method: unknown;
  readonly path: unknown;
  readonly isDecoratedReadOperation: boolean;
}): AdminReadOnlyRoute | null {
  const path = normalizeHttpPath(input.path);
  const moduleKey = resolveModuleKey(path);
  if (moduleKey === null) {
    return null;
  }
  const method = normalizeHttpMethod(input.method);
  const isMutatingMethod = mutatingMethods.has(method);
  const isReadMutationPath = readMutationPaths.has(path);
  return {
    moduleKey,
    isMutation:
      isMutatingMethod &&
      !input.isDecoratedReadOperation &&
      !isReadMutationPath,
  };
}

export function normalizeHttpPath(value: unknown): string {
  const raw =
    typeof value === 'string'
      ? value
      : '';
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

function resolveModuleKey(path: string): string | null {
  const match = routeModules.find(
    (route) => path === route.pathPrefix || path.startsWith(`${route.pathPrefix}/`),
  );
  return match?.moduleKey ?? null;
}
