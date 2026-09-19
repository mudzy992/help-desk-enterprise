import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../tickets.types';

export type TicketExportLabels = {
  readonly services: ReadonlyMap<string, string>;
  readonly groups: ReadonlyMap<string, string>;
  readonly users: ReadonlyMap<string, string>;
};

type NamedRow = { readonly id: string; readonly name: string };
type UserRow = { readonly id: string; readonly displayName: string };

function unique(values: readonly (string | null)[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => value !== null && value !== ''),
    ),
  ];
}

/**
 * Resolves human-readable names so the exported file never contains raw ids.
 */
export async function loadTicketExportLabels(
  prisma: PrismaService,
  tickets: readonly TicketRecord[],
): Promise<TicketExportLabels> {
  const serviceIds = unique(tickets.map((ticket) => ticket.serviceId));
  const groupIds = unique(tickets.map((ticket) => ticket.assignedGroupId));
  const userIds = unique(
    tickets.flatMap((ticket) => [ticket.assignedUserId, ticket.requesterId]),
  );
  const [services, groups, users] = await Promise.all([
    serviceIds.length === 0
      ? Promise.resolve([] as NamedRow[])
      : (prisma.service.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, name: true },
        }) as Promise<NamedRow[]>),
    groupIds.length === 0
      ? Promise.resolve([] as NamedRow[])
      : (prisma.group.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, name: true },
        }) as Promise<NamedRow[]>),
    userIds.length === 0
      ? Promise.resolve([] as UserRow[])
      : (prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        }) as Promise<UserRow[]>),
  ]);
  return {
    services: new Map(services.map((row) => [row.id, row.name])),
    groups: new Map(groups.map((row) => [row.id, row.name])),
    users: new Map(users.map((row) => [row.id, row.displayName])),
  };
}
