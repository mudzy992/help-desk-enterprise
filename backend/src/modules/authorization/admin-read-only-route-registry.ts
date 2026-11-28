import { adminReadOnlyModuleKeys } from './read-only-mode.constants';

/**
 * The census of every HTTP route inside a lockable admin module that uses a
 * mutating verb (``POST``/``PUT``/``PATCH``/``DELETE``).
 *
 * Read-only mode no longer guesses from a hand-written URL prefix list: the
 * runtime classifies a request by its handler identity
 * (``Controller.method``) against this registry, and the registry is checked
 * route-by-route against the central route manifest
 * (``docs/backend/backend-wiring-manifest.json``) in
 * ``admin-read-only-route-census.spec.ts``. A mutating route that is not listed
 * here fails that test, and a stale entry fails it too.
 *
 * ``kind: 'read'`` is the only way a mutating verb is exempted from the lock.
 * The exemption is bound to the handler, not to a URL, so moving or cloning a
 * path cannot smuggle a write past the lock. Each exemption must be a handler
 * that performs no persistent write.
 */
export type AdminReadOnlyRouteKind = 'mutation' | 'read';

export type AdminReadOnlyRouteRegistration = {
  /** ``Controller.method`` identity as Nest reports it on ExecutionContext. */
  readonly handler: string;
  readonly method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly moduleKey: string;
  readonly kind: AdminReadOnlyRouteKind;
};

export const adminReadOnlyRouteRegistry: readonly AdminReadOnlyRouteRegistration[] = [
  {
    handler: 'DirectorySyncController.apply',
    method: 'POST',
    path: '/directory-sync/apply',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'DirectorySyncController.dryRun',
    method: 'POST',
    path: '/directory-sync/dry-run',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'ManualDirectoryCatalogController.create',
    method: 'POST',
    path: '/directory-sync/manual-catalog/organizational-units',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'ManualDirectoryCatalogController.createFromTree',
    method: 'POST',
    path: '/directory-sync/manual-catalog/organizational-units/from-tree',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'ManualDirectoryCatalogController.delete',
    method: 'DELETE',
    path: '/directory-sync/manual-catalog/organizational-units/:externalId',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'ManualDirectoryCatalogController.update',
    method: 'PATCH',
    path: '/directory-sync/manual-catalog/organizational-units/:externalId',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'DirectorySyncController.read',
    method: 'POST',
    path: '/directory-sync/read',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'DirectorySyncController.testConnection',
    method: 'POST',
    path: '/directory-sync/test-connection',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'OrganizationalUnitsController.create',
    method: 'POST',
    path: '/organizational-units',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'OrganizationalUnitsController.delete',
    method: 'DELETE',
    path: '/organizational-units/:organizationalUnitId',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'OrganizationalUnitsController.update',
    method: 'PATCH',
    path: '/organizational-units/:organizationalUnitId',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'OrganizationalUnitsController.assignUser',
    method: 'PUT',
    path: '/organizational-units/user-mappings',
    moduleKey: adminReadOnlyModuleKeys.admin,
    kind: 'mutation',
  },
  {
    handler: 'RoutingController.createRule',
    method: 'POST',
    path: '/routing/rules',
    moduleKey: adminReadOnlyModuleKeys.routing,
    kind: 'mutation',
  },
  {
    handler: 'RoutingController.deleteRule',
    method: 'DELETE',
    path: '/routing/rules/:ruleId',
    moduleKey: adminReadOnlyModuleKeys.routing,
    kind: 'mutation',
  },
  {
    handler: 'RoutingController.updateRule',
    method: 'PATCH',
    path: '/routing/rules/:ruleId',
    moduleKey: adminReadOnlyModuleKeys.routing,
    kind: 'mutation',
  },
  {
    handler: 'ServiceCategoriesController.create',
    method: 'POST',
    path: '/service-categories',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceCategoriesController.delete',
    method: 'DELETE',
    path: '/service-categories/:serviceCategoryId',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceCategoriesController.update',
    method: 'PATCH',
    path: '/service-categories/:serviceCategoryId',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServicesController.create',
    method: 'POST',
    path: '/services',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServicesController.delete',
    method: 'DELETE',
    path: '/services/:serviceId',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServicesController.update',
    method: 'PATCH',
    path: '/services/:serviceId',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceAvailabilityController.updateAvailability',
    method: 'PATCH',
    path: '/services/:serviceId/availability',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceAvailabilityController.createDowntimeWindow',
    method: 'POST',
    path: '/services/:serviceId/downtime-windows',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceAvailabilityController.deleteDowntimeWindow',
    method: 'DELETE',
    path: '/services/:serviceId/downtime-windows/:downtimeWindowId',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceAvailabilityController.updateDowntimeWindow',
    method: 'PATCH',
    path: '/services/:serviceId/downtime-windows/:downtimeWindowId',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServicesController.transitionLifecycle',
    method: 'POST',
    path: '/services/:serviceId/lifecycle',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingController.start',
    method: 'POST',
    path: '/services/:serviceId/onboarding',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingController.abandon',
    method: 'POST',
    path: '/services/:serviceId/onboarding/abandon',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingDomainStepsController.saveApprovals',
    method: 'PATCH',
    path: '/services/:serviceId/onboarding/approvals',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingController.finalize',
    method: 'POST',
    path: '/services/:serviceId/onboarding/finalize',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingServiceFormStepsController.saveForm',
    method: 'PATCH',
    path: '/services/:serviceId/onboarding/form',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingController.resume',
    method: 'POST',
    path: '/services/:serviceId/onboarding/resume',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingDomainStepsController.saveRouting',
    method: 'PATCH',
    path: '/services/:serviceId/onboarding/routing',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingServiceFormStepsController.saveService',
    method: 'PATCH',
    path: '/services/:serviceId/onboarding/service',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingDomainStepsController.saveSla',
    method: 'PATCH',
    path: '/services/:serviceId/onboarding/sla',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingDomainStepsController.completeApprovals',
    method: 'POST',
    path: '/services/:serviceId/onboarding/steps/approvals/complete',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingServiceFormStepsController.completeForm',
    method: 'POST',
    path: '/services/:serviceId/onboarding/steps/form/complete',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingDomainStepsController.completeRouting',
    method: 'POST',
    path: '/services/:serviceId/onboarding/steps/routing/complete',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingServiceFormStepsController.completeService',
    method: 'POST',
    path: '/services/:serviceId/onboarding/steps/service/complete',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingDomainStepsController.completeSla',
    method: 'POST',
    path: '/services/:serviceId/onboarding/steps/sla/complete',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceOnboardingController.create',
    method: 'POST',
    path: '/services/onboarding',
    moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
    kind: 'mutation',
  },
  {
    handler: 'ServiceFormsController.createForm',
    method: 'POST',
    path: '/services/:serviceId/form',
    moduleKey: adminReadOnlyModuleKeys.serviceForms,
    kind: 'mutation',
  },
  {
    handler: 'ServiceFormsController.createFormVersion',
    method: 'POST',
    path: '/services/:serviceId/form/versions',
    moduleKey: adminReadOnlyModuleKeys.serviceForms,
    kind: 'mutation',
  },
  {
    handler: 'ServiceFormsController.updateFormVersion',
    method: 'PATCH',
    path: '/services/:serviceId/form/versions/:formVersionRef',
    moduleKey: adminReadOnlyModuleKeys.serviceForms,
    kind: 'mutation',
  },
  {
    handler: 'ServiceFormsController.activateFormVersion',
    method: 'POST',
    path: '/services/:serviceId/form/versions/:formVersionRef/activate',
    moduleKey: adminReadOnlyModuleKeys.serviceForms,
    kind: 'mutation',
  },
  {
    handler: 'ConfigVersioningController.create',
    method: 'POST',
    path: '/config-versions',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'ConfigVersioningController.activate',
    method: 'POST',
    path: '/config-versions/:id/activate',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'ConfigVersioningController.rollback',
    method: 'POST',
    path: '/config-versions/:id/rollback',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'ConfigVersioningController.shadow',
    method: 'POST',
    path: '/config-versions/:id/shadow',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'read',
  },
  {
    handler: 'ConfigVersioningController.validate',
    method: 'POST',
    path: '/config-versions/:id/validate',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'read',
  },
  {
    handler: 'ConfigVersioningController.importPackage',
    method: 'POST',
    path: '/config-versions/import',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'ConfigVersioningController.previewImport',
    method: 'POST',
    path: '/config-versions/import/preview',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'read',
  },
  {
    handler: 'IntegrationQueueController.retryNow',
    method: 'POST',
    path: '/integration-jobs/:jobId/retry',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'PolicyPacksController.apply',
    method: 'POST',
    path: '/policy-packs/apply',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'PolicyPacksController.unapply',
    method: 'POST',
    path: '/policy-packs/unapply',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'PolicyPacksController.validate',
    method: 'POST',
    path: '/policy-packs/validate',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'read',
  },
  {
    handler: 'SettingsController.updateSetting',
    method: 'PUT',
    path: '/settings',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'SettingsController.updateSettingsBatch',
    method: 'PUT',
    path: '/settings/batch',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'EmailTemplatesController.save',
    method: 'PUT',
    path: '/settings/email-templates',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'EmailTemplatesController.preview',
    method: 'POST',
    path: '/settings/email-templates/preview',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'EmailTemplatesController.sendTest',
    method: 'POST',
    path: '/settings/email-templates/test',
    moduleKey: adminReadOnlyModuleKeys.settings,
    kind: 'mutation',
  },
  {
    handler: 'SlaCalendarsController.create',
    method: 'POST',
    path: '/sla/calendars',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaCalendarsController.delete',
    method: 'DELETE',
    path: '/sla/calendars/:calendarId',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaCalendarsController.update',
    method: 'PATCH',
    path: '/sla/calendars/:calendarId',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaEscalationRulesController.create',
    method: 'POST',
    path: '/sla/escalation-rules',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaEscalationRulesController.delete',
    method: 'DELETE',
    path: '/sla/escalation-rules/:ruleId',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaEscalationRulesController.update',
    method: 'PATCH',
    path: '/sla/escalation-rules/:ruleId',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaProfilesController.create',
    method: 'POST',
    path: '/sla/profiles',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaProfilesController.delete',
    method: 'DELETE',
    path: '/sla/profiles/:profileId',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaProfilesController.update',
    method: 'PATCH',
    path: '/sla/profiles/:profileId',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaRulesController.create',
    method: 'POST',
    path: '/sla/rules',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaRulesController.delete',
    method: 'DELETE',
    path: '/sla/rules/:ruleId',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaRulesController.update',
    method: 'PATCH',
    path: '/sla/rules/:ruleId',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaTimerConfigurationMigrationController.apply',
    method: 'POST',
    path: '/sla/timer-configuration-migrations/apply',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
  {
    handler: 'SlaTimerConfigurationMigrationController.preview',
    method: 'POST',
    path: '/sla/timer-configuration-migrations/preview',
    moduleKey: adminReadOnlyModuleKeys.sla,
    kind: 'mutation',
  },
];

export const adminReadOnlyRouteRegistryByHandler: ReadonlyMap<
  string,
  AdminReadOnlyRouteRegistration
> = new Map(
  adminReadOnlyRouteRegistry.map((registration) => [
    registration.handler,
    registration,
  ]),
);

/** Root of the lockable module tree; a sub-module is locked with its parent. */
export const adminReadOnlySubModules: Readonly<Record<string, string>> = {
  [adminReadOnlyModuleKeys.serviceForms]: adminReadOnlyModuleKeys.serviceCatalog,
};
