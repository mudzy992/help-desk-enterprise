import type { InMemoryOrganizationalUnit } from '../organizational-units/create-in-memory-organizational-unit-prisma';
import {
  matchesInMemoryOrganizationalUnitWhere,
  pickSelectedFields,
  type InMemoryOrganizationalUnitWhere,
} from '../organizational-units/match-in-memory-organizational-unit';

export function createInMemoryInstallSeedUnitDelegate(
  units: Map<string, InMemoryOrganizationalUnit>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: Record<string, boolean>;
    }) => pickSelected(units.get(where.id), select),
    findFirst: async ({ where }: { where: InMemoryOrganizationalUnitWhere }) =>
      [...units.values()].find((unit) =>
        matchesInMemoryOrganizationalUnitWhere(unit, where),
      ) ?? null,
    findMany: async ({
      where,
      select,
    }: {
      where?: InMemoryOrganizationalUnitWhere;
      select?: Record<string, boolean>;
      orderBy?: unknown;
    } = {}) => {
      const matched = [...units.values()]
        .filter((unit) =>
          where === undefined
            ? true
            : matchesInMemoryOrganizationalUnitWhere(unit, where),
        )
        .sort((left, right) => left.ouPath.localeCompare(right.ouPath));
      return matched.map((unit) => pickSelected(unit, select) ?? unit);
    },
    create: async ({
      data,
    }: {
      data: Omit<InMemoryOrganizationalUnit, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      };
    }) => {
      for (const unit of units.values()) {
        if (
          unit.distinguishedName.toLowerCase() ===
          data.distinguishedName.toLowerCase()
        ) {
          throw { code: 'P2002', meta: { target: ['distinguishedName'] } };
        }
        if (unit.ouPath === data.ouPath) {
          throw { code: 'P2002', meta: { target: ['ouPath'] } };
        }
      }
      const created: InMemoryOrganizationalUnit = {
        id: data.id ?? nextId(),
        name: data.name,
        type: data.type,
        distinguishedName: data.distinguishedName,
        ouPath: data.ouPath,
        company: data.company ?? null,
        department: data.department ?? null,
        parentId: data.parentId ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      units.set(created.id, created);
      return created;
    },
  };
}

function pickSelected<T extends object>(
  record: T | undefined,
  select?: Record<string, boolean>,
): T | Record<string, unknown> | null {
  if (record === undefined) {
    return null;
  }
  return select === undefined ? record : pickSelectedFields(record, select);
}
