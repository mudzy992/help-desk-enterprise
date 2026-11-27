import { authorizationRoleKeys } from './authorization.constants';

export const adminReadOnlyModuleKeys = {
  admin: 'admin',
  settings: 'settings',
  routing: 'routing',
  serviceCatalog: 'service_catalog',
  serviceForms: 'service_forms',
  sla: 'sla',
} as const;

export const defaultAdminReadOnlyLockableModulesCsv = [
  adminReadOnlyModuleKeys.admin,
  adminReadOnlyModuleKeys.settings,
  adminReadOnlyModuleKeys.routing,
  adminReadOnlyModuleKeys.serviceCatalog,
  adminReadOnlyModuleKeys.serviceForms,
  adminReadOnlyModuleKeys.sla,
].join(',');

/**
 * Module ownership of the URL tree — **not** the route catalog.
 *
 * Which routes exist inside those prefixes is answered by
 * `adminReadOnlyRouteRegistry` (one entry per mutating handler, verified against
 * the central route manifest). This table only says which module owns a prefix,
 * so that the resolver can prove every catalogued route lands in exactly one
 * module.
 */
export const adminReadOnlyRouteModules: readonly {
  readonly pathPrefix: string;
  readonly moduleKey: string;
}[] = [
  {
    pathPrefix: '/organizational-units',
    moduleKey: adminReadOnlyModuleKeys.admin,
  },
  {
    pathPrefix: '/policy-packs',
    moduleKey: adminReadOnlyModuleKeys.settings,
  },
  {
    pathPrefix: '/settings',
    moduleKey: adminReadOnlyModuleKeys.settings,
  },
  {
    pathPrefix: '/config-versions',
    moduleKey: adminReadOnlyModuleKeys.settings,
  },
  {
    pathPrefix: '/integration-jobs',
    moduleKey: adminReadOnlyModuleKeys.settings,
  },
  {
    pathPrefix: '/directory-sync',
    moduleKey: adminReadOnlyModuleKeys.admin,
  },
  {
    pathPrefix: '/services',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
  },
  {
    pathPrefix: '/service-categories',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
  },
  {
    pathPrefix: '/routing',
    moduleKey: adminReadOnlyModuleKeys.routing,
  },
  {
    pathPrefix: '/sla',
    moduleKey: adminReadOnlyModuleKeys.sla,
  },
];

/**
 * Service forms live *inside* the service catalog URL tree
 * (`/services/:serviceId/form/**`) but are their own lockable module. The nested
 * shape is declared once, here and in `adminReadOnlySubModules`, so the census
 * can distinguish "two modules claim this path" from "a sub-module inherits its
 * parent's lock".
 */
export const adminReadOnlyServiceFormsPathPattern =
  /^\/services\/[^/]+\/form(?:\/|$)/;

export const adminReadOnlyMutatingMethods = [
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
] as const;

export const readOnlyModeErrorCodes = {
  forbidden: 'READ_ONLY_MODE',
  unavailable: 'READ_ONLY_MODE_UNAVAILABLE',
} as const;

export const defaultAdminReadOnlyBypassRoleKeys = [
  authorizationRoleKeys.superAdmin,
] as const;
