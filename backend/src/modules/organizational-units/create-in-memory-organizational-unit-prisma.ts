import type { OrganizationalUnitType } from '../../generated/prisma/enums';
import {
  matchesInMemoryOrganizationalUnitWhere,
  pickSelectedFields,
  type InMemoryOrganizationalUnitWhere,
} from './match-in-memory-organizational-unit';

export type InMemoryOrganizationalUnit = {
  id: string;
  name: string;
  type: OrganizationalUnitType;
  distinguishedName: string;
  ouPath: string;
  company: string | null;
  department: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InMemoryOrganizationalUnitUser = {
  id: string;
  email: string;
  displayName: string;
  organizationalUnitId: string | null;
  isLocalOnly: boolean;
  entraObjectId: string | null;
  localPasswordHash: string | null;
};

type WhereInput = InMemoryOrganizationalUnitWhere;

export function createInMemoryOrganizationalUnitPrisma(): {
  prisma: {
    organizationalUnit: Record<string, unknown>;
    user: Record<string, unknown>;
    $transaction: (callback: (client: unknown) => Promise<unknown>) => Promise<unknown>;
  };
  seedUnit: (unit: InMemoryOrganizationalUnit) => void;
  seedUser: (user: InMemoryOrganizationalUnitUser) => void;
} {
  const units = new Map<string, InMemoryOrganizationalUnit>();
  const users = new Map<string, InMemoryOrganizationalUnitUser>();
  let nextIdentifier = 1;
  const prisma = {
    organizationalUnit: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: { _count?: { select: { children: boolean; users: boolean } } };
      }) => {
        const unit = units.get(where.id) ?? null;
        if (unit === null || include?._count === undefined) {
          return unit;
        }
        return {
          ...unit,
          _count: {
            children: [...units.values()].filter((item) => item.parentId === unit.id)
              .length,
            users: [...users.values()].filter(
              (item) => item.organizationalUnitId === unit.id,
            ).length,
          },
        };
      },
      findFirst: async ({ where }: { where: WhereInput }) => {
        return [...units.values()].find((unit) =>
          matchesInMemoryOrganizationalUnitWhere(unit, where),
        ) ?? null;
      },
      findMany: async ({
        where,
        select,
        orderBy,
      }: {
        where?: WhereInput;
        select?: Record<string, boolean>;
        orderBy?: unknown;
      } = {}) => {
        const matched = [...units.values()].filter((unit) =>
          where === undefined ? true : matchesInMemoryOrganizationalUnitWhere(unit, where),
        );
        matched.sort((left, right) => left.ouPath.localeCompare(right.ouPath));
        void orderBy;
        if (select === undefined) {
          return matched;
        }
        return matched.map((unit) => pickSelectedFields(unit, select));
      },
      create: async ({ data }: { data: Omit<InMemoryOrganizationalUnit, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } }) => {
        assertUnique(units, data.distinguishedName, data.ouPath);
        const now = new Date('2026-09-10T10:00:00.000Z');
        const created: InMemoryOrganizationalUnit = {
          id: data.id ?? `ou-${nextIdentifier++}`,
          name: data.name,
          type: data.type,
          distinguishedName: data.distinguishedName,
          ouPath: data.ouPath,
          company: data.company ?? null,
          department: data.department ?? null,
          parentId: data.parentId ?? null,
          createdAt: now,
          updatedAt: now,
        };
        units.set(created.id, created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<InMemoryOrganizationalUnit>;
      }) => {
        const current = units.get(where.id);
        if (current === undefined) {
          return null;
        }
        const updated = {
          ...current,
          ...data,
          updatedAt: new Date('2026-09-10T11:00:00.000Z'),
        };
        units.set(where.id, updated);
        return updated;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const current = units.get(where.id);
        units.delete(where.id);
        return current;
      },
    },
    user: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => {
        const user = users.get(where.id) ?? null;
        if (user === null || select === undefined) {
          return user;
        }
        return pickSelectedFields(user, select);
      },
      findMany: async ({
        where,
        select,
      }: {
        where: { organizationalUnitId: string };
        select?: Record<string, boolean>;
      }) => {
        const matched = [...users.values()].filter(
          (user) => user.organizationalUnitId === where.organizationalUnitId,
        );
        if (select === undefined) {
          return matched;
        }
        return matched.map((user) => pickSelectedFields(user, select));
      },
      update: async ({
        where,
        data,
        select,
      }: {
        where: { id: string };
        data: { organizationalUnitId: string | null };
        select?: Record<string, boolean>;
      }) => {
        const current = users.get(where.id);
        if (current === undefined) {
          return null;
        }
        const updated = { ...current, organizationalUnitId: data.organizationalUnitId };
        users.set(where.id, updated);
        if (select === undefined) {
          return updated;
        }
        return pickSelectedFields(updated, select);
      },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) => {
      return callback(prisma);
    },
  };
  return {
    prisma,
    seedUnit: (unit) => {
      units.set(unit.id, unit);
    },
    seedUser: (user) => {
      users.set(user.id, user);
    },
  };
}

function assertUnique(
  units: Map<string, InMemoryOrganizationalUnit>,
  distinguishedName: string,
  ouPath: string,
): void {
  for (const unit of units.values()) {
    if (unit.distinguishedName.toLowerCase() === distinguishedName.toLowerCase()) {
      throw { code: 'P2002', meta: { target: ['distinguishedName'] } };
    }
    if (unit.ouPath === ouPath) {
      throw { code: 'P2002', meta: { target: ['ouPath'] } };
    }
  }
}

