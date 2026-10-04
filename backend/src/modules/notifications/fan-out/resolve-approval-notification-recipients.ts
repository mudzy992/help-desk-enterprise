import { PrismaService } from '../../../common/prisma/prisma.service';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { doesOrganizationalUnitScopeCover } from '../../authorization/does-organizational-unit-scope-cover';
import { doesServiceScopeCover } from '../../authorization/does-service-scope-cover';
import {
  approverRoleKeys,
  defaultTicketApprovalsConfiguration,
} from '../../tickets/approvals/approvals.constants';
import type {
  DefaultApproverRole,
  TicketApprovalsConfiguration,
} from '../../tickets/approvals/approvals.types';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import type { TicketRecord } from '../../tickets/tickets.types';

/**
 * Val 2 (M9/B1). `ticket.approval` had exactly one source of recipients — the
 * `APPROVER` participants — and the ticket has none while the approval is
 * pending (`create-pending-ticket-approval.ts` writes the row without
 * `approverUserId`, `ensureApproverParticipant` runs only *after* the
 * decision). The notification therefore reached nobody.
 *
 * The recipients are now derived from the same rule that decides who may
 * approve: the configured `defaultApproverRole` **inside the ticket's
 * OU/service scope** (mirrors `canDecideTicketApproval`). When nobody matches,
 * the ticket's handler group is notified instead of leaving the gate silent.
 * After a decision, the requester learns the outcome (the actor is filtered
 * out by the caller).
 */
export async function resolveApprovalNotificationRecipients(
  prisma: PrismaService,
  input: {
    readonly ticket: TicketRecord;
    readonly event?: string;
    /** Absent = built-in defaults (ADMIN approvers, approvals enabled). */
    readonly configuration?: TicketApprovalsConfiguration;
  },
): Promise<readonly string[]> {
  const participants = await approverParticipantUserIds(prisma, input.ticket.id);
  if (input.event !== ticketSystemEventActions.approvalRequested) {
    // `approval_approved` / `approval_rejected`: the requester must see the
    // outcome; the deciding actor is removed by `resolveNotificationRecipients`.
    return [input.ticket.requesterId, ...participants];
  }
  const configuration = input.configuration ?? defaultTicketApprovalsConfiguration;
  const candidates = configuration.enabled
    ? await approverCandidateUserIds(
        prisma,
        input.ticket,
        configuration.defaultApproverRole,
      )
    : [];
  if (candidates.length > 0) {
    return [...candidates, ...participants];
  }
  // Nobody matches the role/scope (or approvals are disabled): fall back to the
  // handler group so a pending approval is never a black hole.
  return [
    ...(await groupMemberUserIds(prisma, input.ticket.assignedGroupId)),
    ...participants,
  ];
}

/**
 * `canDecideTicketApproval` treats SuperAdmin as a special case (`isSuperAdmin`
 * short-circuit) and `approverRoleKeys` therefore returns an empty list for it.
 * A notification has no context to short-circuit on, so the `SUPER_ADMIN`
 * assignment itself is the candidate set.
 */
function notificationApproverRoleKeys(
  role: DefaultApproverRole,
): readonly string[] {
  if (role === authorizationRoleKeys.superAdmin) {
    return [authorizationRoleKeys.superAdmin];
  }
  return approverRoleKeys(role);
}

async function approverCandidateUserIds(
  prisma: PrismaService,
  ticket: TicketRecord,
  defaultApproverRole: DefaultApproverRole,
): Promise<readonly string[]> {
  const roleKeys = notificationApproverRoleKeys(defaultApproverRole);
  if (roleKeys.length === 0) {
    return [];
  }
  const unit = await prisma.organizationalUnit.findUnique({
    where: { id: ticket.originUnitId },
    select: { ouPath: true },
  });
  const requestedPath = unit?.ouPath ?? null;
  if (requestedPath === null) {
    return [];
  }
  const assignments = await prisma.userRole.findMany({
    where: {
      role: { key: { in: [...roleKeys] } },
      user: { isActive: true },
    },
    select: {
      userId: true,
      serviceId: true,
      organizationalUnit: { select: { ouPath: true } },
    },
  });
  return unique(
    assignments
      .filter(
        (assignment) =>
          doesOrganizationalUnitScopeCover({
            assignedPath: assignment.organizationalUnit?.ouPath ?? null,
            requestedPath,
          }) &&
          doesServiceScopeCover({
            assignedServiceId: assignment.serviceId,
            requestedServiceId: ticket.serviceId,
          }),
      )
      .map((assignment) => assignment.userId),
  );
}

async function approverParticipantUserIds(
  prisma: PrismaService,
  ticketId: string,
): Promise<readonly string[]> {
  const rows = await prisma.ticketParticipant.findMany({
    where: { ticketId, role: 'APPROVER' },
    select: { userId: true },
  });
  return rows
    .map((row) => row.userId)
    .filter((userId): userId is string => userId !== null);
}

async function groupMemberUserIds(
  prisma: PrismaService,
  groupId: string | null,
): Promise<readonly string[]> {
  if (groupId === null) {
    return [];
  }
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
