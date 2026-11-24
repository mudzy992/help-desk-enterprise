import type { PrismaService } from '../../common/prisma/prisma.service';
import { closedGroupTicketStatuses } from './groups.constants';
import type {
  GroupDeleteBlocker,
  GroupDeleteCascaded,
  GroupDeleteDetached,
  GroupDeleteImpact,
} from './group-delete.types';

/**
 * W2.12 (`BA-groups-01`): one place that answers "what happens if this group is
 * deleted?", per relation, before anything is written.
 *
 * Every relation that points at `Group` is listed exactly once, with the
 * disposition the schema already implies:
 *
 *   - `Restrict` -> blocker (the database would refuse with an opaque error),
 *   - `Cascade` of live configuration -> blocker,
 *   - `Cascade` of transient delivery rows -> reported cascade,
 *   - `SetNull` -> reported detach.
 *
 * The queries run together; a delete attempt is rare and an explicit count per
 * relation is worth more than one clever aggregate. `openProblems` and
 * `openChanges` use "not in a terminal status", so a closed record does not block
 * a delete that only detaches it.
 */
const terminalProblemStatuses = ['RESOLVED', 'CLOSED', 'CANCELLED'] as const;
const terminalChangeStatuses = ['CLOSED', 'REJECTED', 'CANCELLED'] as const;

export async function collectGroupDeleteDependencies(
  prisma: PrismaService,
  input: {
    readonly groupId: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
  },
): Promise<GroupDeleteImpact> {
  const groupId = input.groupId;

  const [
    fallbackCount,
    activeTicketCount,
    closedTicketCount,
    onCallScheduleCount,
    teamsChannelCount,
    responseTemplateCount,
    routingRuleCount,
    problemHandoffCount,
    ticketParticipantCount,
    openProblemCount,
    closedProblemCount,
    openChangeCount,
    closedChangeCount,
    notificationCount,
    confidentialGrantCount,
    knowledgeArticleCount,
    slaEscalationRuleCount,
    reportScheduleCount,
    assetTypeCount,
  ] = await Promise.all([
    input.isFallback
      ? prisma.group.count({
          where: {
            organizationalUnitId: input.organizationalUnitId,
            isFallback: true,
          },
        })
      : Promise.resolve(0),
    prisma.ticket.count({
      where: {
        assignedGroupId: groupId,
        status: { notIn: [...closedGroupTicketStatuses] },
      },
    }),
    prisma.ticket.count({
      where: {
        assignedGroupId: groupId,
        status: { in: [...closedGroupTicketStatuses] },
      },
    }),
    prisma.onCallSchedule.count({ where: { groupId } }),
    prisma.teamsGroupChannel.count({ where: { groupId } }),
    prisma.responseTemplateGroup.count({ where: { groupId } }),
    prisma.routingRule.count({ where: { groupId } }),
    prisma.problemHandoff.count({ where: { toGroupId: groupId } }),
    prisma.ticketParticipant.count({ where: { groupId } }),
    prisma.problem.count({
      where: { groupId, status: { notIn: [...terminalProblemStatuses] } },
    }),
    prisma.problem.count({
      where: { groupId, status: { in: [...terminalProblemStatuses] } },
    }),
    prisma.changeRequest.count({
      where: { cabGroupId: groupId, status: { notIn: [...terminalChangeStatuses] } },
    }),
    prisma.changeRequest.count({
      where: { cabGroupId: groupId, status: { in: [...terminalChangeStatuses] } },
    }),
    prisma.notification.count({ where: { groupId } }),
    prisma.ticketConfidentialGrant.count({ where: { groupId } }),
    prisma.knowledgeArticle.count({ where: { ownerGroupId: groupId } }),
    prisma.slaEscalationRule.count({ where: { targetGroupId: groupId } }),
    prisma.reportSchedule.count({ where: { groupId } }),
    prisma.assetType.count({ where: { routingGroupId: groupId } }),
  ]);

  const blockers: GroupDeleteBlocker[] = [];
  if (input.isFallback && fallbackCount <= 1) {
    // Kept first on purpose: it is the blocker an operator most often hits and
    // the one with the clearest remedy (make another group the fallback).
    blockers.push({ kind: 'fallbackGroups', count: fallbackCount });
  }
  if (activeTicketCount > 0) blockers.push({ kind: 'activeTickets', count: activeTicketCount });
  if (onCallScheduleCount > 0) blockers.push({ kind: 'onCallSchedule', count: onCallScheduleCount });
  if (teamsChannelCount > 0) blockers.push({ kind: 'teamsChannel', count: teamsChannelCount });
  if (responseTemplateCount > 0) {
    blockers.push({ kind: 'responseTemplates', count: responseTemplateCount });
  }
  if (routingRuleCount > 0) blockers.push({ kind: 'routingRules', count: routingRuleCount });
  if (problemHandoffCount > 0) {
    blockers.push({ kind: 'problemHandoffs', count: problemHandoffCount });
  }
  if (openProblemCount > 0) blockers.push({ kind: 'openProblems', count: openProblemCount });
  if (confidentialGrantCount > 0) {
    // Cascade in the schema: the grants would vanish, not just detach. Removing
    // an access rule is a security decision, so it is explicitly refused.
    blockers.push({ kind: 'confidentialGrants', count: confidentialGrantCount });
  }
  if (openChangeCount > 0) blockers.push({ kind: 'openChanges', count: openChangeCount });

  const detached: GroupDeleteDetached[] = ([
    { kind: 'closedTickets', count: closedTicketCount },
    { kind: 'ticketParticipants', count: ticketParticipantCount },
    { kind: 'knowledgeArticles', count: knowledgeArticleCount },
    { kind: 'slaEscalationRules', count: slaEscalationRuleCount },
    { kind: 'reportSchedules', count: reportScheduleCount },
    { kind: 'assetTypes', count: assetTypeCount },
    { kind: 'closedProblems', count: closedProblemCount },
    { kind: 'closedChanges', count: closedChangeCount },
  ] as GroupDeleteDetached[]).filter((entry) => entry.count > 0);

  const cascaded: GroupDeleteCascaded[] =
    notificationCount > 0 ? [{ kind: 'notifications', count: notificationCount }] : [];

  return { blockers, detached, cascaded };
}
