import { defaultTicketConfidentialConfiguration } from './confidential/confidential.constants';
import { defaultTicketSafeLoggingConfiguration } from './safe-logging/safe-logging.constants';
import { TicketAccessPolicyBinder } from './ticket-access-policy-binder';
import { TicketsConfidentialService } from './confidential/tickets-confidential.service';

export function createTicketPolicyHarness(
  prisma: unknown,
  authorizationContextLoader: unknown,
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
  const accessPolicies = new TicketAccessPolicyBinder(
    confidentialLoader as never,
    safeLoggingLoader as never,
  );
  const confidential = new TicketsConfidentialService(
    prisma as never,
    authorizationContextLoader as never,
    confidentialLoader as never,
    safeLoggingLoader as never,
  );
  return {
    confidentialConfig,
    safeLoggingConfig,
    confidentialLoader,
    safeLoggingLoader,
    accessPolicies,
    confidential,
  };
}
