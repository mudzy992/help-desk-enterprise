import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketRecord } from './tickets.types';

export type TicketOriginUnitLabel = {
  readonly name: string;
  readonly path: string;
};

export type TicketDisplayLabels = {
  readonly users: ReadonlyMap<string, string>;
  readonly groups: ReadonlyMap<string, string>;
  readonly formVersions: ReadonlyMap<string, number>;
  readonly originUnits: ReadonlyMap<string, TicketOriginUnitLabel>;
  readonly services: ReadonlyMap<string, string>;
};

type NamedRow = { readonly id: string; readonly name?: string };
type NamedUserRow = { readonly id: string; readonly displayName?: string };
type FormVersionRow = { readonly id: string; readonly version?: number };
type OriginUnitRow = NamedRow & { readonly ouPath?: string };

function unique(values: readonly (string | null)[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => value !== null && value !== ''),
    ),
  ];
}

/** Skips the round trip when the result set references no ids of this kind. */
async function findByIds<Row>(
  ids: readonly string[],
  find: (ids: readonly string[]) => Promise<Row[]>,
): Promise<Row[]> {
  return ids.length === 0 ? [] : find(ids);
}

function toNameMap(rows: readonly NamedRow[]): Map<string, string> {
  return new Map(
    rows.flatMap((row) =>
      typeof row.name === 'string' && row.name.length > 0
        ? [[row.id, row.name] as const]
        : [],
    ),
  );
}

/**
 * Resolves the human-readable names of the people, group, form version,
 * origin unit and service a ticket points at, in one batch query per kind for
 * the whole result set (no per-ticket queries).
 */
export async function loadTicketDisplayLabels(
  prisma: PrismaService,
  records: readonly Pick<
    TicketRecord,
    | 'requesterId'
    | 'assignedUserId'
    | 'assignedGroupId'
    | 'formVersionId'
    | 'originUnitId'
    | 'serviceId'
  >[],
): Promise<TicketDisplayLabels> {
  const [users, groups, formVersions, originUnits, services] =
    await Promise.all([
      findByIds(
        unique(
          records.flatMap((record) => [
            record.requesterId,
            record.assignedUserId,
          ]),
        ),
        (ids) =>
          prisma.user.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, displayName: true },
          }) as Promise<NamedUserRow[]>,
      ),
      findByIds(
        unique(records.map((record) => record.assignedGroupId)),
        (ids) =>
          prisma.group.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, name: true },
          }) as Promise<NamedRow[]>,
      ),
      findByIds(
        unique(records.map((record) => record.formVersionId)),
        (ids) =>
          prisma.formVersion.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, version: true },
          }) as Promise<FormVersionRow[]>,
      ),
      findByIds(
        unique(records.map((record) => record.originUnitId)),
        (ids) =>
          prisma.organizationalUnit.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, name: true, ouPath: true },
          }) as Promise<OriginUnitRow[]>,
      ),
      findByIds(
        unique(records.map((record) => record.serviceId)),
        (ids) =>
          prisma.service.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, name: true },
          }) as Promise<NamedRow[]>,
      ),
    ]);
  return {
    users: new Map(
      users.flatMap((row) =>
        typeof row.displayName === 'string' && row.displayName.length > 0
          ? [[row.id, row.displayName] as const]
          : [],
      ),
    ),
    groups: toNameMap(groups),
    formVersions: new Map(
      formVersions.flatMap((row) =>
        typeof row.version === 'number' ? [[row.id, row.version] as const] : [],
      ),
    ),
    originUnits: new Map(
      originUnits.flatMap((row) =>
        typeof row.name === 'string' && typeof row.ouPath === 'string'
          ? [[row.id, { name: row.name, path: row.ouPath }] as const]
          : [],
      ),
    ),
    services: toNameMap(services),
  };
}
