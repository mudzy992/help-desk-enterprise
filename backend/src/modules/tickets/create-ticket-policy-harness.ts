import { defaultTicketConfidentialConfiguration } from './confidential/confidential.constants';
import { defaultTicketSafeLoggingConfiguration } from './safe-logging/safe-logging.constants';
import { defaultTicketArchiveConfiguration } from './archive/archive.constants';
import { TicketAccessPolicyBinder } from './ticket-access-policy-binder';
import { TicketsConfidentialService } from './confidential/tickets-confidential.service';

export function createTicketPolicyHarness(
  prisma: unknown,
  authorizationContextLoader: unknown,
  slaTimers: unknown,
) {
  const confidentialConfig = {
    enabled: defaultTicketConfidentialConfiguration.enabled as boolean,
    defaultForServiceIds: [
      ...defaultTicketConfidentialConfiguration.defaultForServiceIds,
    ],
    allowedViewerRoles: [
      ...defaultTicketConfidentialConfiguration.allowedViewerRoles,
    ],
    allowedViewerGroupIds: [
      ...defaultTicketConfidentialConfiguration.allowedViewerGroupIds,
    ],
    breakGlassEnabled:
      defaultTicketConfidentialConfiguration.breakGlassEnabled as boolean,
    breakGlassAllowedRoles: [
      ...defaultTicketConfidentialConfiguration.breakGlassAllowedRoles,
    ],
    breakGlassRequiresReason:
      defaultTicketConfidentialConfiguration.breakGlassRequiresReason as boolean,
    auditViews: defaultTicketConfidentialConfiguration.auditViews as boolean,
  };
  const safeLoggingConfig = {
    enabled: defaultTicketSafeLoggingConfiguration.enabled as boolean,
    levels: [...defaultTicketSafeLoggingConfiguration.levels],
    redactFields: [...defaultTicketSafeLoggingConfiguration.redactFields],
  };
  const archiveConfig = {
    enabled: defaultTicketArchiveConfiguration.enabled as boolean,
    afterClosedDays: defaultTicketArchiveConfiguration.afterClosedDays as number,
    archivedReadOnly:
      defaultTicketArchiveConfiguration.archivedReadOnly as boolean,
    searchable: defaultTicketArchiveConfiguration.searchable as boolean,
  };
  const confidentialLoader = {
    load: async () => ({
      ...confidentialConfig,
      defaultForServiceIds: [...confidentialConfig.defaultForServiceIds],
      allowedViewerRoles: [...confidentialConfig.allowedViewerRoles],
      allowedViewerGroupIds: [...confidentialConfig.allowedViewerGroupIds],
      breakGlassAllowedRoles: [...confidentialConfig.breakGlassAllowedRoles],
    }),
  };
  const safeLoggingLoader = {
    load: async () => ({
      ...safeLoggingConfig,
      levels: [...safeLoggingConfig.levels],
      redactFields: [...safeLoggingConfig.redactFields],
    }),
  };
  const archiveLoader = {
    load: async () => ({ ...archiveConfig }),
  };
  const accessPolicies = new TicketAccessPolicyBinder(
    confidentialLoader as never,
    safeLoggingLoader as never,
    archiveLoader as never,
    slaTimers as never,
  );
  const confidential = new TicketsConfidentialService(
    prisma as never,
    authorizationContextLoader as never,
    confidentialLoader as never,
    safeLoggingLoader as never,
    archiveLoader as never,
  );
  return {
    confidentialConfig,
    safeLoggingConfig,
    archiveConfig,
    confidentialLoader,
    safeLoggingLoader,
    archiveLoader,
    accessPolicies,
    confidential,
  };
}
