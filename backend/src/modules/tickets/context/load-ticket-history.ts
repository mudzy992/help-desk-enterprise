import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogEntityTypes } from '../../change-log/change-log.constants';
import type { ChangeLogDiffEntry, JsonValue } from '../../change-log/change-log.types';
import { listChangeLogs } from '../../change-log/list-change-logs';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketMutationContext } from '../tickets.types';
import type {
  TicketHistoryChange,
  TicketHistoryEntry,
  TicketHistoryField,
} from './context.types';
import { loadGroupRefs, loadPersonRefs } from './load-ticket-people';

const fieldByPath: Readonly<Record<string, TicketHistoryField>> = {
  status: 'status',
  priority: 'priority',
  impact: 'impact',
  urgency: 'urgency',
  assignedUserId: 'assignedUser',
  assignedGroupId: 'assignedGroup',
};

type RawChange = {
  readonly field: TicketHistoryField;
  readonly from: string | null;
  readonly to: string | null;
};

function asText(value: JsonValue): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function extractChanges(
  changes: readonly ChangeLogDiffEntry[] | undefined,
): readonly RawChange[] {
  if (!Array.isArray(changes)) {
    return [];
  }
  return changes.flatMap((change) => {
    const field = fieldByPath[change.path];
    return field === undefined
      ? []
      : [{ field, from: asText(change.before), to: asText(change.after) }];
  });
}

/**
 * Field edits (status, priority, impact, urgency, assignee, group) recorded in
 * the ticket change log. Only whitelisted fields leave the server, never the
 * snapshot itself, so titles and descriptions cannot leak through history.
 * Staff only.
 */
export async function loadTicketHistory(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<readonly TicketHistoryEntry[]> {
  const { access } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  if (access.visibility !== 'staff') {
    throw new TicketsError('FORBIDDEN');
  }
  const logs = await listChangeLogs(prisma, {
    entityType: changeLogEntityTypes.ticket,
    entityId: ticketId,
  });
  const edits = [...logs]
    .reverse()
    .filter((entry) => entry.reason === ticketChangeLogReasons.update)
    .map((entry) => ({ entry, changes: extractChanges(entry.diff?.changes) }))
    .filter((item) => item.changes.length > 0);
  const userIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const { changes } of edits) {
    for (const change of changes) {
      const target =
        change.field === 'assignedUser'
          ? userIds
          : change.field === 'assignedGroup'
            ? groupIds
            : null;
      for (const value of [change.from, change.to]) {
        if (target !== null && value !== null) {
          target.add(value);
        }
      }
    }
  }
  const [users, groups] = await Promise.all([
    loadPersonRefs(prisma, [...userIds]),
    loadGroupRefs(prisma, [...groupIds]),
  ]);
  const userNames = new Map(users.map((user) => [user.id, user.displayName]));
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const resolve = (field: TicketHistoryField, value: string | null) => {
    if (value === null) {
      return null;
    }
    if (field === 'assignedUser') {
      return userNames.get(value) ?? null;
    }
    if (field === 'assignedGroup') {
      return groupNames.get(value) ?? null;
    }
    return value;
  };
  return edits.map(({ entry, changes }) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    actorUserId: entry.actorUserId,
    actorName: entry.actorDisplayName,
    changes: changes.map(
      (change): TicketHistoryChange => ({
        field: change.field,
        from: resolve(change.field, change.from),
        to: resolve(change.field, change.to),
      }),
    ),
  }));
}
