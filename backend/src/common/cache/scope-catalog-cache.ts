/**
 * Plan §4.2 — "maksimum" korak smanjenja upita po zahtjevu (2026-09-24).
 *
 * Dva mala kataloga čitala su se u SVAKOM zahtjevu liste/detalja, iako se mijenjaju
 * rijetko:
 *
 *   - `OrganizationalUnit (id, ouPath)` — cijela tabela, za predikat vidljivosti;
 *   - `GroupMember.groupId WHERE userId = actor` — grupe aktera (vidljivost, inbox,
 *     povjerljivi tiketi, socket sobe).
 *
 * Oba se sada pamte u procesu, kratko:
 *
 *   | katalog      | TTL   | invalidacija na pisanje (lokalno)                  |
 *   |--------------|-------|----------------------------------------------------|
 *   | OU scope     | 60 s  | create / update / delete OU, directory sync, policy |
 *   | grupe aktera | 30 s  | add / remove group member                           |
 *
 * Zašto u procesu, a ne u Redisu: pogodak ne košta ni mrežni round trip, a TTL je
 * gornja granica zastarjelosti i na drugim instancama — ista pogodba kao 60 s keš
 * autorizacijskog konteksta (koji već nosi uloge aktera) i keš labela. Brisanje
 * korisnika iz grupe na drugoj instanci djeluje najkasnije za 30 s; na instanci gdje
 * je izmjena napravljena — odmah.
 *
 * Keš je vezan za Prisma klijent (`WeakMap`): testovi s vlastitim in-memory klijentom
 * nikad ne vide tuđe podatke, a transakcijski klijent ima svoj (prazan) prostor.
 * Istovremeni promašaji za isti ključ dijele jedan upit (in-flight dedupe).
 *
 * Kao i `settings-snapshot.ts`: keš radi samo UNUTAR HTTP zahtjeva (postoji request
 * id). Worker poslovi, boot i skripte uvijek čitaju bazu — pozadinski rad vidi ono što
 * je upravo zapisano. Klijent koji ne zna `findMany` (ručno pisani test delegati)
 * također ide direktno u bazu preko pozivaočevog fallbacka.
 */

import { getRequestId } from '../request-context/request-context.storage';

type Entry<T> = { readonly expiresAt: number; readonly value: Promise<T> };

const organizationalUnitTtlMs = readTtl('SCOPE_CACHE_OU_TTL_MS', 60_000);
const actorGroupsTtlMs = readTtl('SCOPE_CACHE_GROUPS_TTL_MS', 30_000);

type Buckets = {
  units: Entry<readonly OrganizationalUnitScopeRow[]> | undefined;
  groups: Map<string, Entry<readonly ActorGroupMembership[]>>;
};

export type OrganizationalUnitScopeRow = {
  readonly id: string;
  readonly ouPath: string;
};

type UnitSource = {
  readonly organizationalUnit: {
    findMany: (args: {
      readonly select: { readonly id: true; readonly ouPath: true };
    }) => Promise<readonly OrganizationalUnitScopeRow[]>;
  };
};

type GroupSource = {
  readonly groupMember: {
    findMany: (args: {
      readonly where: { readonly userId: string };
      readonly select: { readonly groupId: true; readonly createdAt: true };
    }) => Promise<readonly { readonly groupId: string; readonly createdAt?: Date }[]>;
  };
};

let buckets = new WeakMap<object, Buckets>();
/** Bumped by every invalidation, so a load that started before it is not stored. */
let generation = 0;

function bucketsFor(client: object): Buckets {
  let found = buckets.get(client);
  if (found === undefined) {
    found = { units: undefined, groups: new Map() };
    buckets.set(client, found);
  }
  return found;
}

/** All `(id, ouPath)` rows, cached for 60 s. */
export function loadOrganizationalUnitScopeRows(
  prisma: UnitSource,
): Promise<readonly OrganizationalUnitScopeRow[]> {
  if (getRequestId() === undefined) {
    return prisma.organizationalUnit.findMany({ select: { id: true, ouPath: true } });
  }
  const store = bucketsFor(prisma);
  const now = Date.now();
  if (store.units !== undefined && store.units.expiresAt > now) {
    return store.units.value;
  }
  const started = generation;
  const value = prisma.organizationalUnit.findMany({
    select: { id: true, ouPath: true },
  });
  const entry = { expiresAt: now + organizationalUnitTtlMs, value };
  store.units = entry;
  value.then(
    () => {
      if (started !== generation && store.units === entry) store.units = undefined;
    },
    () => {
      if (store.units === entry) store.units = undefined;
    },
  );
  return value;
}

/** True when the catalogue path can be used for this client (see module doc). */
export function canUseScopeCatalogCache(prisma: unknown): boolean {
  const candidate = prisma as { organizationalUnit?: { findMany?: unknown } } | null;
  return (
    getRequestId() !== undefined &&
    typeof candidate?.organizationalUnit?.findMany === 'function'
  );
}

/** `ouPath` of one unit from the cached catalogue (`null` when unknown/empty). */
export async function loadCachedOrganizationalUnitPath(
  prisma: UnitSource,
  organizationalUnitId: string,
): Promise<string | null> {
  const rows = await loadOrganizationalUnitScopeRows(prisma);
  const row = rows.find((candidate) => candidate.id === organizationalUnitId);
  if (row === undefined || row.ouPath.trim().length === 0) {
    return null;
  }
  return row.ouPath;
}

/** One membership of the actor: the group and when the actor joined it. */
export type ActorGroupMembership = {
  readonly groupId: string;
  readonly joinedAt: Date;
};

/** Group memberships of one user (with join time), cached for 30 s. */
export function loadActorGroupMemberships(
  prisma: GroupSource,
  userId: string,
): Promise<readonly ActorGroupMembership[]> {
  const read = () =>
    prisma.groupMember
      .findMany({ where: { userId }, select: { groupId: true, createdAt: true } })
      .then((rows) =>
        rows.map((row) => ({
          groupId: row.groupId,
          // Hand-written test delegates may not carry `createdAt`; "since forever".
          joinedAt: row.createdAt instanceof Date ? row.createdAt : new Date(0),
        })),
      );
  if (getRequestId() === undefined) {
    return read();
  }
  const store = bucketsFor(prisma);
  const now = Date.now();
  const cached = store.groups.get(userId);
  if (cached !== undefined && cached.expiresAt > now) {
    return cached.value;
  }
  const started = generation;
  const value = read();
  const entry = { expiresAt: now + actorGroupsTtlMs, value };
  store.groups.set(userId, entry);
  if (store.groups.size > 10_000) {
    const oldest = store.groups.keys().next().value;
    if (oldest !== undefined) store.groups.delete(oldest);
  }
  value.then(
    () => {
      if (started !== generation && store.groups.get(userId) === entry) {
        store.groups.delete(userId);
      }
    },
    () => {
      if (store.groups.get(userId) === entry) store.groups.delete(userId);
    },
  );
  return value;
}

/** Group ids of one user, cached for 30 s (same entry as the memberships). */
export async function loadActorGroupIds(
  prisma: GroupSource,
  userId: string,
): Promise<readonly string[]> {
  const memberships = await loadActorGroupMemberships(prisma, userId);
  return memberships.map((membership) => membership.groupId);
}

/** Call after any OU write (create/update/delete, directory sync, policy binding). */
export function invalidateOrganizationalUnitScopeCache(): void {
  generation += 1;
  buckets = new WeakMap();
}

/** Call after a membership write. Drops every client's groups (cheap, rare). */
export function invalidateActorGroupsCache(): void {
  generation += 1;
  buckets = new WeakMap();
}

/** Test helper. */
export function resetScopeCatalogCache(): void {
  invalidateOrganizationalUnitScopeCache();
}

function readTtl(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
