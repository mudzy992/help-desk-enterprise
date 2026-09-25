import { defaultTicketForwardingConfiguration } from './forwarding/forwarding.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { RoutingService } from '../routing/routing.service';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { TicketAccessPolicyBinder } from './ticket-access-policy-binder';
import { defaultTicketBulkConfiguration } from './bulk/bulk.constants';
import { TicketsBulkService } from './bulk/tickets-bulk.service';
import { defaultTicketGuardrailsConfiguration } from './guardrails/guardrails.constants';
import { defaultTicketSavedViewsConfiguration } from './saved-views/saved-views.constants';
import { TicketsSavedViewsService } from './saved-views/tickets-saved-views.service';
import { defaultTicketSplitConfiguration } from './split/split.constants';
import { TicketsSplitService } from './split/tickets-split.service';
import { TicketRealtimeHub } from './ticket-realtime.hub';

export function createTicketsGovernanceHarness(input: {
  readonly prisma: unknown;
  readonly routing: RoutingService;
  readonly authorizationContextLoader: {
    loadBySubjectId: (subjectId: string) => Promise<AuthorizationContext | null>;
  };
  readonly approvalsLoader: unknown;
  readonly reopenLoader: unknown;
  readonly closeCodesLoader: unknown;
  readonly assignment: TicketAssignmentService;
  readonly accessPolicies: TicketAccessPolicyBinder;
  readonly realtimeHub: TicketRealtimeHub;
  readonly guardrailsLoader?: { load: () => Promise<unknown> };
}) {
  const splitConfig = {
    enabled: defaultTicketSplitConfiguration.enabled as boolean,
    allowAttachmentMove:
      defaultTicketSplitConfiguration.allowAttachmentMove as boolean,
    allowMessageCopy: defaultTicketSplitConfiguration.allowMessageCopy as boolean,
    requireReason: defaultTicketSplitConfiguration.requireReason as boolean,
  };
  const bulkConfig = {
    ...defaultTicketBulkConfiguration,
    enabled: defaultTicketBulkConfiguration.enabled as boolean,
    allowedActionTypes: [...defaultTicketBulkConfiguration.allowedActionTypes],
    disallowBulkClose: true as boolean,
    broadcastRequiredFields: [
      ...defaultTicketBulkConfiguration.broadcastRequiredFields,
    ],
  };
  const savedViewsConfig = {
    enabled: defaultTicketSavedViewsConfiguration.enabled as boolean,
    maxPerUser: defaultTicketSavedViewsConfiguration.maxPerUser as number,
    allowDefaultView: defaultTicketSavedViewsConfiguration.allowDefaultView as boolean,
    allowSharing: false as boolean,
  };
  const split = new TicketsSplitService(
    input.prisma as never,
    input.routing,
    input.authorizationContextLoader as never,
    input.approvalsLoader as never,
    { load: async () => ({ ...splitConfig }) } as never,
    input.reopenLoader as never,
    input.closeCodesLoader as never,
    input.assignment,
    input.accessPolicies,
    input.realtimeHub,
  );
  const guardrailsLoader = input.guardrailsLoader ?? {
    load: async () => ({ ...defaultTicketGuardrailsConfiguration }),
  };
  const forwardingConfig = { ...defaultTicketForwardingConfiguration };
  const bulk = new TicketsBulkService(
    input.prisma as never,
    input.authorizationContextLoader as never,
    { load: async () => ({ ...bulkConfig }) } as never,
    guardrailsLoader as never,
    input.reopenLoader as never,
    input.closeCodesLoader as never,
    input.accessPolicies,
    input.realtimeHub,
    { load: async () => ({ ...forwardingConfig }) } as never,
  );
  const savedViews = new TicketsSavedViewsService(
    input.prisma as never,
    { load: async () => ({ ...savedViewsConfig }) } as never,
  );
  return {
    split,
    bulk,
    savedViews,
    splitConfig,
    bulkConfig,
    forwardingConfig,
    savedViewsConfig,
  };
}
