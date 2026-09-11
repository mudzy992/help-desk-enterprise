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
  const participants = new Map<string, TicketParticipantRecord>();
  const messages = new Map<string, TicketMessageRecord>();
  const timeLogs = new Map<string, TicketTimeLogRecord>();
  const attachments = new Map<string, TicketAttachmentRecord>();
  const approvals = new Map<string, TicketApprovalRecord>();
  const changeLogs: InMemoryTicketChangeLog[] = [];
  let nextIdentifier = 1;
  const now = () => new Date('2026-09-11T12:00:00.000Z');
  const nextId = () => `ticket-record-${nextIdentifier++}`;

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
    groupMember: createInMemoryGroupMemberDelegate(members),
    ticket: createInMemoryTicketDelegate(tickets, nextId, now),
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
    changeLog: {
      create: async ({ data }: { data: InMemoryTicketChangeLog }) => {
        changeLogs.push(data);
        return data;
      },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(prisma),
  };

  return {
    prisma,
    changeLogs,
    tickets,
    participants,
    messages,
    timeLogs,
    attachments,
    seedUnit: (unit: InMemoryTicketUnit) => units.set(unit.id, unit),
    seedService: (service: InMemoryTicketService) =>
      services.set(service.id, {
        autoAssignStrategy: 'NONE',
        requiresApproval: false,
        ...service,
      }),
    seedGroup: (group: InMemoryTicketGroup) => groups.set(group.id, group),
    seedGroupMember: (input: { groupId: string; userId: string }) =>
      seedInMemoryGroupMember(members, nextId, input),
    seedUser: (user: InMemoryTicketUser) => users.set(user.id, user),
    seedFormVersion: (version: FormVersionRecord) =>
      formVersions.set(version.id, version),
  };
}
