import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import {
  assertForwardableTicket,
  hasCrossOuForwardPermission,
} from './forward-ticket';
import type {
  ForwardTargetGroup,
  ForwardTargetsResponse,
  TicketForwardingConfiguration,
} from './forwarding.types';

const maximumTargets = 200;

/**
 * Groups the actor may forward this ticket to (`GET /tickets/:id/forward-targets`).
 * Groups the actor may not use are left out instead of failing later: without
 * cross-OU rights only groups of the current OU are listed.
 */
export async function listForwardTargets(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly configuration: TicketForwardingConfiguration;
  readonly ticketId: string;
  readonly query?: string;
  readonly context: TicketMutationContext;
}): Promise<ForwardTargetsResponse> {
  const { ticket, access } = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
  );
  if (access.visibility !== 'staff') {
    throw new TicketsError('FORBIDDEN');
  }
  assertForwardableTicket(ticket);
  const authContext = await input.authorizationContextLoader.loadBySubjectId(
    input.context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const [groups, units, memberships, lastForward] = await Promise.all([
    input.prisma.group.findMany({
      select: { id: true, name: true, organizationalUnitId: true },
    }) as Promise<{ id: string; name: string; organizationalUnitId: string }[]>,
    input.prisma.organizationalUnit.findMany({
      select: { id: true, name: true, ouPath: true },
    }) as Promise<{ id: string; name: string; ouPath: string }[]>,
    input.prisma.groupMember.findMany({
      select: { groupId: true },
    }) as Promise<{ groupId: string }[]>,
    input.prisma.ticketForwardEvent.findFirst({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'desc' },
      select: { fromGroupId: true },
    }),
  ]);
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const currentGroup = groups.find((group) => group.id === ticket.assignedGroupId);
  const currentUnitId = currentGroup?.organizationalUnitId ?? ticket.originUnitId;
  const originPath = await loadOrganizationalUnitPath(
    input.prisma,
    ticket.originUnitId,
  );
  const crossOuAllowed =
    input.configuration.allowCrossOu &&
    hasCrossOuForwardPermission(
      authContext,
      [originPath, unitById.get(currentUnitId)?.ouPath ?? null].filter(
        (path): path is string => path !== null,
      ),
    );
  const counts = new Map<string, number>();
  for (const membership of memberships) {
    counts.set(membership.groupId, (counts.get(membership.groupId) ?? 0) + 1);
  }
  const needle = (input.query ?? '').trim().toLocaleLowerCase('bs');
  const targets: ForwardTargetGroup[] = groups
    .filter((group) => group.id !== ticket.assignedGroupId)
    .map((group) => {
      const unit = unitById.get(group.organizationalUnitId);
      return {
        id: group.id,
        name: group.name,
        organizationalUnitId: group.organizationalUnitId,
        organizationalUnitName: unit?.name ?? null,
        organizationalUnitPath: unit?.ouPath ?? null,
        isCrossOu: group.organizationalUnitId !== currentUnitId,
        memberCount: counts.get(group.id) ?? 0,
      };
    })
    .filter((group) => crossOuAllowed || !group.isCrossOu)
    .filter(
      (group) =>
        needle.length === 0 ||
        group.name.toLocaleLowerCase('bs').includes(needle) ||
        (group.organizationalUnitName ?? '')
          .toLocaleLowerCase('bs')
          .includes(needle),
    )
    .sort(
      (left, right) =>
        Number(left.isCrossOu) - Number(right.isCrossOu) ||
        (left.organizationalUnitPath ?? '').localeCompare(
          right.organizationalUnitPath ?? '',
          'bs',
        ) ||
        left.name.localeCompare(right.name, 'bs'),
    )
    .slice(0, maximumTargets);
  const previousGroupId = lastForward?.fromGroupId ?? null;
  return {
    currentGroupId: ticket.assignedGroupId,
    currentUnitId,
    previousGroupId:
      previousGroupId !== null &&
      targets.some((group) => group.id === previousGroupId)
        ? previousGroupId
        : null,
    requireReason: input.configuration.requireReason,
    minReasonLength: input.configuration.minReasonLength,
    crossOuAllowed,
    groups: targets,
  };
}
