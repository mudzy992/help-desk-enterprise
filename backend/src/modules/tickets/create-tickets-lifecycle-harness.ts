import { defaultTicketCsatConfiguration } from './csat/csat.constants';
import { TicketsCsatService } from './csat/tickets-csat.service';
import { TicketArchiveAutomationService } from './archive/ticket-archive-automation.service';
import { TicketsService } from './tickets.service';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { RoutingService } from '../routing/routing.service';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { TicketAccessPolicyBinder } from './ticket-access-policy-binder';

export function createTicketsLifecycleHarness(input: {
  readonly prisma: unknown;
  readonly routing: RoutingService;
  readonly authorizationContextLoader: {
    loadBySubjectId: (subjectId: string) => Promise<AuthorizationContext | null>;
  };
  readonly assignment: TicketAssignmentService;
  readonly approvalsLoader: unknown;
  readonly reopenLoader: unknown;
  readonly closeCodesLoader: unknown;
  readonly requiredFieldsLoader: unknown;
  readonly redactionLoader: unknown;
  readonly guardrailsLoader: unknown;
  readonly accessPolicies: TicketAccessPolicyBinder;
  readonly confidentialLoader: unknown;
  readonly safeLoggingLoader: unknown;
  readonly archiveLoader: unknown;
  readonly slaTimers: unknown;
  readonly realtimeHub: TicketRealtimeHub;
}) {
  const csatConfig = {
    enabled: defaultTicketCsatConfiguration.enabled as boolean,
    scaleMax: defaultTicketCsatConfiguration.scaleMax as number,
    askOnResolved: defaultTicketCsatConfiguration.askOnResolved as boolean,
    askOnClosed: defaultTicketCsatConfiguration.askOnClosed as boolean,
    samplingRate: defaultTicketCsatConfiguration.samplingRate as number,
  };
  const csatLoader = { load: async () => ({ ...csatConfig }) };
  const tickets = new TicketsService(
    input.prisma as never,
    input.routing,
    input.authorizationContextLoader as never,
    input.assignment,
    input.approvalsLoader as never,
    input.reopenLoader as never,
    input.closeCodesLoader as never,
    input.requiredFieldsLoader as never,
    input.redactionLoader as never,
    input.guardrailsLoader as never,
    input.confidentialLoader as never,
    input.safeLoggingLoader as never,
    input.archiveLoader as never,
    csatLoader as never,
    input.slaTimers as never,
    input.realtimeHub,
  );
  const csat = new TicketsCsatService(
    input.prisma as never,
    input.authorizationContextLoader as never,
    csatLoader as never,
    input.archiveLoader as never,
    input.guardrailsLoader as never,
    input.redactionLoader as never,
    input.reopenLoader as never,
    input.closeCodesLoader as never,
    input.accessPolicies,
    input.realtimeHub,
  );
  const archiveAutomation = new TicketArchiveAutomationService(
    input.prisma as never,
    input.archiveLoader as never,
    input.guardrailsLoader as never,
    input.realtimeHub,
  );
  return { tickets, csat, archiveAutomation, csatConfig };
}