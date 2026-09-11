import type { AuthorizationContext } from '../authorization/authorization.types';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { RoutingService } from '../routing/routing.service';
import { defaultTicketApprovalsConfiguration } from './approvals/approvals.constants';
import { TicketsApprovalsService } from './approvals/tickets-approvals.service';
import type { TicketApprovalsConfiguration } from './approvals/approvals.types';
import { defaultTicketAssignmentConfiguration } from './assignment/assignment.constants';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { defaultTicketCollaborationConfiguration } from './collaboration.constants';
import { createInMemoryTicketsPrisma } from './create-in-memory-tickets-prisma';
import { defaultTicketReopenConfiguration } from './reopen/reopen.constants';
import { TicketsReopenService } from './reopen/tickets-reopen.service';
import { seedTicketsHarnessActors } from './seed-tickets-harness-actors';
import { seedTicketsHarnessCatalog } from './seed-tickets-harness-catalog';
import { TicketsCollaborationService } from './tickets-collaboration.service';
import { TicketsTimeTrackingService } from './tickets-time-tracking.service';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { TicketsService } from './tickets.service';
import { WaitingForUserAutomationService } from './waiting-for-user/waiting-for-user-automation.service';
import { defaultWaitingForUserConfiguration } from './waiting-for-user/waiting-for-user.constants';

export { ticketsTestIds } from './tickets-test-ids';
export { vpnFormSchema } from './seed-tickets-harness-catalog';

export function createTicketsServiceHarness() {
  const memory = createInMemoryTicketsPrisma();
  const contexts = new Map<string, AuthorizationContext>();
  const assignmentConfig: {
    groupInboxEnabled: boolean;
    autoAssignEnabled: boolean;
    autoAssignStrategy: 'LEAST_BUSY' | 'ROUND_ROBIN';
  } = {
    groupInboxEnabled: defaultTicketAssignmentConfiguration.groupInboxEnabled,
    autoAssignEnabled: defaultTicketAssignmentConfiguration.autoAssignEnabled,
    autoAssignStrategy: defaultTicketAssignmentConfiguration.autoAssignStrategy,
  };
  const approvalsConfig: {
    enabled: boolean;
    requiredByService: Record<string, boolean>;
    defaultApproverRole: TicketApprovalsConfiguration['defaultApproverRole'];
    allowRequesterManager: boolean;
  } = {
    enabled: defaultTicketApprovalsConfiguration.enabled,
    requiredByService: {},
    defaultApproverRole: defaultTicketApprovalsConfiguration.defaultApproverRole,
    allowRequesterManager:
      defaultTicketApprovalsConfiguration.allowRequesterManager,
  };
  const waitingForUserConfig: {
    enabled: boolean;
    reminderAfterDays: number;
    autoCloseAfterDays: number;
  } = {
    enabled: defaultWaitingForUserConfiguration.enabled,
    reminderAfterDays: defaultWaitingForUserConfiguration.reminderAfterDays,
    autoCloseAfterDays: defaultWaitingForUserConfiguration.autoCloseAfterDays,
  };
  const reopenConfig: {
    enabled: boolean;
    windowDays: number;
  } = {
    enabled: defaultTicketReopenConfiguration.enabled,
    windowDays: defaultTicketReopenConfiguration.windowDays,
  };
  const authorizationContextLoader = {
    loadBySubjectId: async (subjectId: string) =>
      contexts.get(subjectId) ?? null,
  };
  const routing = new RoutingService(memory.prisma as never, {
    load: async () => defaultRoutingConfiguration,
  } as never);
  const assignment = new TicketAssignmentService(
    memory.prisma as never,
    authorizationContextLoader as never,
    { load: async () => ({ ...assignmentConfig }) } as never,
  );
  const approvalsLoader = { load: async () => ({ ...approvalsConfig }) };
  const waitingLoader = { load: async () => ({ ...waitingForUserConfig }) };
  const reopenLoader = { load: async () => ({ ...reopenConfig }) };
  const realtimeHub = new TicketRealtimeHub();
  const tickets = new TicketsService(
    memory.prisma as never,
    routing,
    authorizationContextLoader as never,
    assignment,
    approvalsLoader as never,
    reopenLoader as never,
    realtimeHub,
  );
  const approvals = new TicketsApprovalsService(
    memory.prisma as never,
    authorizationContextLoader as never,
    approvalsLoader as never,
    assignment,
    realtimeHub,
  );
  const reopen = new TicketsReopenService(
    memory.prisma as never,
    routing,
    authorizationContextLoader as never,
    approvalsLoader as never,
    reopenLoader as never,
    assignment,
    realtimeHub,
  );
  const collaboration = new TicketsCollaborationService(
    memory.prisma as never,
    authorizationContextLoader as never,
    {
      load: async () => ({ ...defaultTicketCollaborationConfiguration }),
    } as never,
    waitingLoader as never,
    realtimeHub,
  );
  const timeTracking = new TicketsTimeTrackingService(
    memory.prisma as never,
    authorizationContextLoader as never,
    realtimeHub,
  );
  const waitingAutomation = new WaitingForUserAutomationService(
    memory.prisma as never,
    waitingLoader as never,
    realtimeHub,
  );
  seedTicketsHarnessCatalog(memory);
  seedTicketsHarnessActors(contexts);
  return {
    memory,
    routing,
    tickets,
    approvals,
    reopen,
    collaboration,
    timeTracking,
    waitingAutomation,
    realtimeHub,
    contexts,
    assignmentConfig,
    approvalsConfig,
    waitingForUserConfig,
    reopenConfig,
    authorizationContextLoader,
  };
}
