import { createInMemoryAuditLogDelegate } from '../audit-log/create-in-memory-audit-log-delegate';
import { createInMemoryFormVersionDelegate } from '../service-catalog/create-in-memory-form-version-delegate';
import type { FormVersionRecord } from '../service-catalog/service-forms.types';
import {
  matchesInMemoryRoutingRule,
  type InMemoryRoutingRuleWhere,
} from '../routing/in-memory-routing-store';
import type { RoutingRuleRecord } from '../routing/routing.types';
import {
  createInMemoryGroupMemberDelegate,
  seedInMemoryGroupMember,
  type InMemoryGroupMember,
} from './create-in-memory-group-member-delegate';
import { createInMemoryTicketApprovalDelegate } from './approvals/create-in-memory-ticket-approval-delegate';
import type { TicketApprovalRecord } from './approvals/approvals.types';
import { createInMemoryTicketsLookups } from './create-in-memory-tickets-lookups';
import { createInMemoryTicketDelegate } from './create-in-memory-ticket-delegate';
import type { InMemoryTicketRelations } from './in-memory-ticket-where';
import { createInMemoryTicketMessageDelegate } from './create-in-memory-ticket-message-delegate';
import { createInMemoryTicketParticipantDelegate } from './create-in-memory-ticket-participant-delegate';
import { createInMemoryTicketAttachmentDelegate } from './create-in-memory-ticket-attachment-delegate';
import { createInMemoryTicketTimeLogDelegate } from './create-in-memory-ticket-time-log-delegate';
import type {
  TicketMessageRecord,
  TicketParticipantRecord,
  TicketTimeLogRecord,
} from './collaboration.types';
import type { TicketAttachmentRecord } from './attachments/attachments.types';
import { createInMemorySavedViewDelegate } from './create-in-memory-saved-view-delegate';
import type { SavedViewRecord } from './saved-views/saved-views.types';
import { createInMemoryCloseCodeDelegate } from './create-in-memory-close-code-delegate';
import type { CloseCodeRecord } from './close-codes/close-codes.types';
import {
  createInMemoryBreakGlassEventDelegate,
  createInMemoryConfidentialGrantDelegate,
} from './create-in-memory-confidential-delegates';
import type {
  BreakGlassEventRecord,
  TicketConfidentialGrantRecord,
} from './confidential/confidential.types';
import type { GuardrailClaimRecord } from './guardrails/guardrails.types';
import { createInMemoryGuardrailClaimDelegate } from './guardrails/create-in-memory-guardrail-claim-delegate';
import { createInMemoryTicketCsatDelegate } from './create-in-memory-ticket-csat-delegate';
import type { TicketCsatRecord } from './csat/csat.types';
import { createInMemoryNotificationDelegate } from '../notifications/create-in-memory-notification-delegate';
import {
  createInMemoryNotificationEmailDeliveryDelegate,
  type NotificationEmailDeliveryRecord,
} from '../notifications/email/create-in-memory-notification-email-delivery-delegate';
import type { NotificationRecord } from '../notifications/notifications.types';
import { createInMemoryTicketSlaLayer } from '../sla/create-in-memory-ticket-sla-layer';
import type { TicketRecord } from './tickets.types';
import type {
  InMemoryTicketChangeLog,
  InMemoryTicketGroup,
  InMemoryTicketService,
  InMemoryTicketUnit,
  InMemoryTicketUser,
} from './in-memory-tickets-types';

export function createInMemoryTicketsPrisma() {
  const units = new Map<string, InMemoryTicketUnit>();
  const services = new Map<string, InMemoryTicketService>();
  const groups = new Map<string, InMemoryTicketGroup>();
  const members = new Map<string, InMemoryGroupMember>();
  const users = new Map<string, InMemoryTicketUser>();
  const rules = new Map<string, RoutingRuleRecord>();
  const formVersions = new Map<string, FormVersionRecord>();
  const tickets = new Map<string, TicketRecord>();
  const closeCodes = new Map<string, CloseCodeRecord>();
  const participants = new Map<string, TicketParticipantRecord>();
  const messages = new Map<string, TicketMessageRecord>();
  const timeLogs = new Map<string, TicketTimeLogRecord>();
  const attachments = new Map<string, TicketAttachmentRecord>();
  const approvals = new Map<string, TicketApprovalRecord>();
  const savedViews = new Map<string, SavedViewRecord>();
  const confidentialGrants = new Map<string, TicketConfidentialGrantRecord>();
  const breakGlassEvents = new Map<string, BreakGlassEventRecord>();
  const guardrailClaims = new Map<string, GuardrailClaimRecord>();
  const csatSubmissions = new Map<string, TicketCsatRecord>();
  const notifications = new Map<string, NotificationRecord>();
  const emailDeliveries = new Map<string, NotificationEmailDeliveryRecord>();
  const changeLogs: InMemoryTicketChangeLog[] = [];
  const auditLogs: Parameters<typeof createInMemoryAuditLogDelegate>[0] = [];
  let nextIdentifier = 1;
  const now = () => new Date();
  const nextId = () => `ticket-record-${nextIdentifier++}`;
  const nextPrefixedId = (prefix: string) => `${prefix}-${nextIdentifier++}`;
  // The relation resolvers are built below; the SLA delegate reads them through
  // this getter so the two layers can see each other's stores without a cycle.
  let ticketRelations: InMemoryTicketRelations = {};
  const slaLayer = createInMemoryTicketSlaLayer(
    nextPrefixedId,
    now,
    (ticketId) => tickets.get(ticketId) ?? null,
    () => ticketRelations,
  );

  ticketRelations = {
    participants: (ticket) =>
      [...participants.values()].filter((row) => row.ticketId === ticket.id),
    confidentialGrants: (ticket) =>
      [...confidentialGrants.values()].filter(
        (row) => row.ticketId === ticket.id,
      ),
    breakGlassEvents: (ticket) =>
      [...breakGlassEvents.values()].filter(
        (row) => row.ticketId === ticket.id,
      ),
    slaState: (ticket) =>
      [...slaLayer.slaStates.values()].filter(
        (row) => row.ticketId === ticket.id,
      ),
    // Phase 1.1 narrowed the CSAT summary to `{ csat: { isNot: null } }`; the
    // delegate answers it with the ticket's submission (0 or 1 rows), exactly
    // like Prisma does for the one-to-one relation.
    csat: (ticket) =>
      [...csatSubmissions.values()].filter((row) => row.ticketId === ticket.id),
  };

  const prisma = {
    ...createInMemoryTicketsLookups({ units, services, groups, users }),
    routingRule: {
      findMany: async ({
        where,
      }: {
        where?: InMemoryRoutingRuleWhere;
      } = {}) =>
        [...rules.values()].filter((rule) =>
          matchesInMemoryRoutingRule(rule, where),
        ),
      create: async ({
        data,
      }: {
        data: { originUnitId: string; serviceId: string; groupId: string };
      }) => {
        const created: RoutingRuleRecord = {
          id: nextId(),
          originUnitId: data.originUnitId,
          serviceId: data.serviceId,
          groupId: data.groupId,
          createdAt: now(),
          updatedAt: now(),
        };
        rules.set(created.id, created);
        return created;
      },
    },
    formVersion: createInMemoryFormVersionDelegate(formVersions, nextId, now),
    priorityMatrixRule: {
      findUnique: async () => null,
    },
    groupMember: createInMemoryGroupMemberDelegate(members),
    ticket: createInMemoryTicketDelegate(tickets, nextId, now, ticketRelations),
    closeCode: createInMemoryCloseCodeDelegate(closeCodes, nextId, now),
    ticketParticipant: createInMemoryTicketParticipantDelegate(
      participants,
      nextId,
      now,
    ),
    ticketMessage: createInMemoryTicketMessageDelegate(messages, nextId, now),
    ticketTimeLog: createInMemoryTicketTimeLogDelegate(timeLogs, nextId, now),
    ticketAttachment: createInMemoryTicketAttachmentDelegate(
      attachments,
      nextId,
      now,
    ),
    ticketApproval: createInMemoryTicketApprovalDelegate(
      approvals,
      nextId,
      now,
    ),
    savedView: createInMemorySavedViewDelegate(savedViews, nextId, now),
    ticketConfidentialGrant: createInMemoryConfidentialGrantDelegate(
      confidentialGrants,
      nextId,
      now,
    ),
    breakGlassEvent: createInMemoryBreakGlassEventDelegate(
      breakGlassEvents,
      nextId,
      now,
    ),
    guardrailClaim: createInMemoryGuardrailClaimDelegate(
      guardrailClaims,
      nextId,
      now,
    ),
    ticketCsat: createInMemoryTicketCsatDelegate(csatSubmissions, nextId, now),
    notification: createInMemoryNotificationDelegate(notifications, nextId, now),
    notificationEmailDelivery: createInMemoryNotificationEmailDeliveryDelegate(
      emailDeliveries,
      nextPrefixedId.bind(null, 'email-delivery'),
      now,
    ),
    ...slaLayer.delegates,
    changeLog: {
      create: async ({ data }: { data: InMemoryTicketChangeLog }) => {
        changeLogs.push(data);
        return data;
      },
    },
    ...createInMemoryAuditLogDelegate(
      auditLogs,
      () => nextPrefixedId('audit'),
      now,
    ),
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(prisma),
  };

  return {
    prisma,
    changeLogs,
    tickets,
    closeCodes,
    participants,
    messages,
    timeLogs,
    attachments,
    savedViews,
    confidentialGrants,
    breakGlassEvents,
    guardrailClaims,
    csatSubmissions,
    notifications,
    emailDeliveries,
    slaStates: slaLayer.slaStates,
    seedUnit: (unit: InMemoryTicketUnit) => units.set(unit.id, unit),
    seedService: (service: InMemoryTicketService) =>
      services.set(service.id, {
        autoAssignStrategy: 'NONE',
        requiresApproval: false,
        slaProfileId: null,
        ...service,
      }),
    seedGroup: (group: InMemoryTicketGroup) => groups.set(group.id, group),
    seedGroupMember: (input: { groupId: string; userId: string }) =>
      seedInMemoryGroupMember(members, nextId, input),
    seedUser: (user: InMemoryTicketUser) => users.set(user.id, user),
    seedFormVersion: (version: FormVersionRecord) =>
      formVersions.set(version.id, version),
    bindServiceSlaProfile: (serviceId: string, slaProfileId: string | null) => {
      const current = services.get(serviceId);
      if (current !== undefined) {
        services.set(serviceId, { ...current, slaProfileId });
      }
    },
  };
}
