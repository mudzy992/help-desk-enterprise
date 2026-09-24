import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  TicketLabelCache,
  TicketLabelKind,
  TicketLabelRow,
} from './labels/ticket-label-cache';
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

function toCachedRow<Row extends { readonly id: string }>(
  row: Row | undefined,
): TicketLabelRow | null {
  return row === undefined ? null : (row as TicketLabelRow);
}

/**
 * Resolves one kind of label for the whole page. The cache answers for the ids
 * it already knows, the database is asked only for the rest, and whatever came
 * back is written to the cache — including the ids the database did not return
 * (a deleted user is still referenced by old tickets, and remembering that
 * spares the same fruitless query on every later list).
 *
 * Without a cache — tests, or Redis being down — this is the plain batch query
 * it always was: one round trip per kind, no per-ticket queries.
 */
async function findByIds<Row extends { readonly id: string }>(
  kind: TicketLabelKind,
  ids: readonly string[],
  find: (ids: readonly string[]) => Promise<Row[]>,
  cache?: TicketLabelCache,
): Promise<Row[]> {
  if (ids.length === 0) {
    return [];
  }
  const cached = (await cache?.read(kind, ids)) ?? new Map();
  const missing = ids.filter((id) => !cached.has(id));
  const rowsById = new Map<string, Row>();
  if (missing.length > 0) {
    for (const row of await find(missing)) {
      rowsById.set(row.id, row);
    }
    await cache?.write(
      kind,
      missing.map((id) => ({ id, row: toCachedRow(rowsById.get(id)) })),
    );
  }
  return ids.flatMap((id) => {
    // A cache hit is the JSON payload of a row of this shape, so the only thing
    // the compiler needs is a nudge; `null` (cached "no such row") drops out.
    const row = (rowsById.get(id) ?? cached.get(id) ?? null) as Row | null;
    return row === null ? [] : [row];
  });
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
 * the whole result set (no per-ticket queries). With a cache, even those five
 * round trips disappear for ids a previous request already resolved.
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
  cache?: TicketLabelCache,
): Promise<TicketDisplayLabels> {
  const [users, groups, formVersions, originUnits, services] =
    await Promise.all([
      findByIds(
        'user',
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
        cache,
      ),
      findByIds(
        'group',
        unique(records.map((record) => record.assignedGroupId)),
        (ids) =>
          prisma.group.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, name: true },
          }) as Promise<NamedRow[]>,
        cache,
      ),
      findByIds(
        'formVersion',
        unique(records.map((record) => record.formVersionId)),
        (ids) =>
          prisma.formVersion.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, version: true },
          }) as Promise<FormVersionRow[]>,
        cache,
      ),
      findByIds(
        'organizationalUnit',
        unique(records.map((record) => record.originUnitId)),
        (ids) =>
          prisma.organizationalUnit.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, name: true, ouPath: true },
          }) as Promise<OriginUnitRow[]>,
        cache,
      ),
      findByIds(
        'service',
        unique(records.map((record) => record.serviceId)),
        (ids) =>
          prisma.service.findMany({
            where: { id: { in: [...ids] } },
            select: { id: true, name: true },
          }) as Promise<NamedRow[]>,
        cache,
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
