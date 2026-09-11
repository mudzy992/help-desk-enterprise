export const settingKeys = {
  publicBrandingAppName: 'public.branding.appName',
  privateInstallCompletedAt: 'private.install.completedAt',
  privateAuthMode: 'private.auth.mode',
  privateAuthJwtSigningSecret: 'private.auth.jwtSigningSecret',
  privateAuthAzureTenantId: 'private.auth.azureTenantId',
  privateAuthAzureClientId: 'private.auth.azureClientId',
  privateAuthAdReadEnabled: 'private.auth.adRead.enabled',
  privateAuthAdReadStrategy: 'private.auth.adRead.strategy',
  privateAuthAdReadUsersBaseDn: 'private.auth.adRead.usersBaseDn',
  privateAuthAdReadGroupsBaseDn: 'private.auth.adRead.groupsBaseDn',
  privateAuthAdReadMaxQueriesPerSecond: 'private.auth.adRead.maxQueriesPerSecond',
  privateAuthAdReadCacheTtlMinutes: 'private.auth.adRead.cacheTtlMinutes',
  privateAuthAdReadOuTreeCacheTtlHours: 'private.auth.adRead.ouTreeCacheTtlHours',
  privateReadOnlyModeEnabled: 'private.readOnlyMode.enabled',
  privateReadOnlyModeModulesCsv: 'private.readOnlyMode.modulesCsv',
  privateReadOnlyModeActiveModulesCsv: 'private.readOnlyMode.activeModulesCsv',
  privateReadOnlyModeBypassRolesCsv: 'private.readOnlyMode.bypassRolesCsv',
  privateServicesLifecycleEnabled: 'private.services.lifecycle.enabled',
  privateServicesLifecycleAllowedStatesCsv:
    'private.services.lifecycle.allowedStatesCsv',
  privateServicesLifecycleDefaultStateOnCreate:
    'private.services.lifecycle.defaultStateOnCreate',
  privateServicesAvailabilityEnabled: 'private.services.availability.enabled',
  privateServicesAvailabilityAllowedStatusesCsv:
    'private.services.availability.allowedStatusesCsv',
  privateServicesAvailabilityShowStatusInCatalog:
    'private.services.availability.showStatusInCatalog',
  privateServicesAvailabilityShowStatusInTicketCreate:
    'private.services.availability.showStatusInTicketCreate',
  privateServicesAvailabilityChangeRequiresReason:
    'private.services.availability.changeRequiresReason',
  privateServicesDowntimeSchedulingEnabled:
    'private.services.downtimeScheduling.enabled',
  privateServicesDowntimeSchedulingAutoSetMaintenanceStatus:
    'private.services.downtimeScheduling.autoSetMaintenanceStatus',
  privateServicesDowntimeSchedulingAutoRestoreOperational:
    'private.services.downtimeScheduling.autoRestoreOperational',
  privateServicesDowntimeSchedulingRequireReason:
    'private.services.downtimeScheduling.requireReason',
  privateTicketFormsEnabled: 'private.ticket.forms.enabled',
  privateTicketFormsRequireStructuredFields:
    'private.ticket.forms.requireStructuredFields',
  privateTicketFormsVersioningEnabled: 'private.ticket.forms.versioning.enabled',
  privateTicketFormsVersioningAllowMultipleActiveVersions:
    'private.ticket.forms.versioning.allowMultipleActiveVersions',
  privateTicketFormsVersioningRequireVersionOnTicket:
    'private.ticket.forms.versioning.requireVersionOnTicket',
  privateServicesOnboardingWizardEnabled:
    'private.services.onboardingWizard.enabled',
  privateServicesOnboardingWizardRequireValidationBeforeActivate:
    'private.services.onboardingWizard.requireValidationBeforeActivate',
  privateServicesOnboardingWizardAutoFillRoutingEnabled:
    'private.services.onboardingWizard.autoFillRouting.enabled',
  privateServicesOnboardingWizardAutoFillRoutingRequireConfirm:
    'private.services.onboardingWizard.autoFillRouting.requireConfirm',
  privateTicketUnroutedQueueEnabled: 'private.ticket.unroutedQueue.enabled',
  privateTicketUnroutedQueueOwnerRole: 'private.ticket.unroutedQueue.ownerRole',
  privateChangeLogSettingsEnabled: 'private.changeLog.settings.enabled',
  privateChangeLogRoutingEnabled: 'private.changeLog.routing.enabled',
  privateChangeLogIncludeDiff: 'private.changeLog.includeDiff',
  privateChangeLogRequireReason: 'private.changeLog.requireReason',
} as const;

export type SettingKey = (typeof settingKeys)[keyof typeof settingKeys];
