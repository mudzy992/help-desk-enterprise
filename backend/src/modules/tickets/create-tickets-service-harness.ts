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
import { defaultTicketCloseCodesConfiguration } from './close-codes/close-codes.constants';
import { defaultTicketRequiredFieldsConfiguration } from './required-fields/required-fields.constants';
import { defaultTicketRedactionConfiguration } from './redaction/redaction.constants';
import { defaultTicketGuardrailsConfiguration } from './guardrails/guardrails.constants';
import { TicketsReopenService } from './reopen/tickets-reopen.service';
import { seedTicketsHarnessActors } from './seed-tickets-harness-actors';
import { seedTicketsHarnessCatalog } from './seed-tickets-harness-catalog';
import { TicketsCollaborationService } from './tickets-collaboration.service';
import { TicketsTimeTrackingService } from './tickets-time-tracking.service';
import { defaultTimeTrackingConfiguration } from './time-tracking/time-tracking.constants';
import type { TimeTrackingConfiguration } from './time-tracking/time-tracking.types';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { WaitingForUserAutomationService } from './waiting-for-user/waiting-for-user-automation.service';
import { defaultWaitingForUserConfiguration } from './waiting-for-user/waiting-for-user.constants';
import { createTicketsGovernanceHarness } from './create-tickets-governance-harness';
import { createTicketPolicyHarness } from './create-ticket-policy-harness';
import { createTicketsLifecycleHarness } from './create-tickets-lifecycle-harness';
import { createTicketsSlaHarness } from './create-tickets-sla-harness';

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
  const closeCodesConfig = {
    enabled: defaultTicketCloseCodesConfiguration.enabled as boolean,
    allowedCodes: [...defaultTicketCloseCodesConfiguration.allowedCodes],
    requireOnResolve:
      defaultTicketCloseCodesConfiguration.requireOnResolve as boolean,
  };
  const requiredFieldsConfig = {
    enabled: defaultTicketRequiredFieldsConfiguration.enabled as boolean,
    globalRequiredOnResolve: [
      ...defaultTicketRequiredFieldsConfiguration.globalRequiredOnResolve,
    ],
    byService: {} as Record<string, readonly string[]>,
    enforceSchemaRequiredFields:
      defaultTicketRequiredFieldsConfiguration.enforceSchemaRequiredFields as boolean,
  };
  const redactionConfig = {
    enabled: defaultTicketRedactionConfiguration.enabled as boolean,
    mode: defaultTicketRedactionConfiguration.mode,
    applyToFields: [...defaultTicketRedactionConfiguration.applyToFields],
    patterns: [...defaultTicketRedactionConfiguration.patterns],
  };
  const guardrailsConfig = {
    enabled: defaultTicketGuardrailsConfiguration.enabled as boolean,
    duplicateWindowMinutes: 24 * 60,
    similarityThreshold:
      defaultTicketGuardrailsConfiguration.similarityThreshold as number,
    mode: defaultTicketGuardrailsConfiguration.mode as 'warn_only' | 'soft_block',
    confirmAboveRecipients:
      defaultTicketGuardrailsConfiguration.confirmAboveRecipients as number,
    maxRepeatsPerSubject:
      defaultTicketGuardrailsConfiguration.maxRepeatsPerSubject as number,
  };
  const authorizationContextLoader = {
    loadBySubjectId: async (subjectId: string) =>
      contexts.get(subjectId) ?? null,
  };
  const routing = new RoutingService(memory.prisma as never, {
    load: async () => defaultRoutingConfiguration,
  } as never);
  const assignmentConfigurationLoader = {
    load: async () => ({ ...assignmentConfig }),
  };
  const assignment = new TicketAssignmentService(
    memory.prisma as never,
    authorizationContextLoader as never,
    assignmentConfigurationLoader as never,
  );
  const approvalsLoader = { load: async () => ({ ...approvalsConfig }) };
  const waitingLoader = { load: async () => ({ ...waitingForUserConfig }) };
  const reopenLoader = { load: async () => ({ ...reopenConfig }) };
  const closeCodesLoader = { load: async () => ({ ...closeCodesConfig }) };
  const requiredFieldsLoader = { load: async () => ({ ...requiredFieldsConfig }) };
  const redactionLoader = { load: async () => ({ ...redactionConfig }) };
  const guardrailsLoader = { load: async () => ({ ...guardrailsConfig }) };
  const sla = createTicketsSlaHarness(memory.prisma);
  const policy = createTicketPolicyHarness(
    memory.prisma,
    authorizationContextLoader,
    sla.slaTimers,
  );
  const realtimeHub = new TicketRealtimeHub();
  const lifecycle = createTicketsLifecycleHarness({
    prisma: memory.prisma,
    routing,
    authorizationContextLoader,
    assignment,
    approvalsLoader,
    reopenLoader,
    closeCodesLoader,
    requiredFieldsLoader,
    redactionLoader,
    guardrailsLoader,
    accessPolicies: policy.accessPolicies,
    confidentialLoader: policy.confidentialLoader,
    safeLoggingLoader: policy.safeLoggingLoader,
    archiveLoader: policy.archiveLoader,
    slaTimers: sla.slaTimers,
    realtimeHub,
    assignmentConfigurationLoader,
  });
  const tickets = lifecycle.tickets;
  const approvals = new TicketsApprovalsService(
    memory.prisma as never,
    authorizationContextLoader as never,
    approvalsLoader as never,
    assignment,
    policy.accessPolicies,
    realtimeHub,
  );
  const reopen = new TicketsReopenService(
    memory.prisma as never,
    routing,
    authorizationContextLoader as never,
    approvalsLoader as never,
    reopenLoader as never,
    closeCodesLoader as never,
    assignment,
    policy.accessPolicies,
    realtimeHub,
  );
  const collaboration = new TicketsCollaborationService(
    memory.prisma as never,
    authorizationContextLoader as never,
    {
      load: async () => ({ ...defaultTicketCollaborationConfiguration }),
    } as never,
    waitingLoader as never,
    redactionLoader as never,
    policy.accessPolicies,
    realtimeHub,
  );
  const timeTrackingConfig: { -readonly [K in keyof TimeTrackingConfiguration]: TimeTrackingConfiguration[K] } = {
    ...defaultTimeTrackingConfiguration,
  };
  const timeTracking = new TicketsTimeTrackingService(
    memory.prisma as never,
    authorizationContextLoader as never,
    policy.accessPolicies,
    realtimeHub,
    { load: async () => ({ ...timeTrackingConfig }) } as never,
  );
  const waitingAutomation = new WaitingForUserAutomationService(
    memory.prisma as never,
    waitingLoader as never,
    guardrailsLoader as never,
    sla.slaTimers,
    realtimeHub,
  );
  const governance = createTicketsGovernanceHarness({
    prisma: memory.prisma,
    routing,
    authorizationContextLoader,
    approvalsLoader,
    reopenLoader,
    closeCodesLoader,
    assignment,
    accessPolicies: policy.accessPolicies,
    realtimeHub,
    guardrailsLoader,
  });
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
    timeTrackingConfig,
    waitingAutomation,
    archiveAutomation: lifecycle.archiveAutomation,
    csat: lifecycle.csat,
    realtimeHub,
    contexts,
    assignmentConfig,
    approvalsConfig,
    waitingForUserConfig,
    reopenConfig,
    closeCodesConfig,
    requiredFieldsConfig,
    redactionConfig,
    guardrailsConfig,
    csatConfig: lifecycle.csatConfig,
    archiveConfig: policy.archiveConfig,
    confidentialConfig: policy.confidentialConfig,
    safeLoggingConfig: policy.safeLoggingConfig,
    confidential: policy.confidential,
    accessPolicies: policy.accessPolicies,
    slaConfig: sla.slaConfig,
    slaTimers: sla.slaTimers,
    authorizationContextLoader,
    ...governance,
  };
}
