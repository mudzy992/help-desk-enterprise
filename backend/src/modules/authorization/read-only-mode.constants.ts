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
    pathPrefix: '/directory-sync',
    moduleKey: adminReadOnlyModuleKeys.admin,
  },
];

export const adminReadOnlyReadMutationPaths = [
  '/directory-sync/read',
  '/policy-packs/validate',
] as const;

export const adminReadOnlyMutatingMethods = [
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
] as const;

export const ADMIN_READ_OPERATION_METADATA_KEY =
  'adminReadOnly:readOperation';

export const readOnlyModeErrorCodes = {
  forbidden: 'READ_ONLY_MODE',
  unavailable: 'READ_ONLY_MODE_UNAVAILABLE',
} as const;

export const defaultAdminReadOnlyBypassRoleKeys = [
  authorizationRoleKeys.superAdmin,
] as const;
