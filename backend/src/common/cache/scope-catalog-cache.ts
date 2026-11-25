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
 * je izmjena napravljena — odmah. Ovaj procesni keš nije autoritativan za
 * revocation-sensitive notification rute: one koriste direktno čitanje članstva iz
 * baze, jer invalidacija WeakMap-a ne može sinhrono očistiti keš na drugoj instanci.
 *
 * Keš je vezan za Prisma klijent (`WeakMap`): testovi s vlastitim in-memory klijentom
 * nikad ne vide tuđe podatke, a transakcijski klijent ima svoj (prazan) prostor.
 * Istovremeni promašaji za isti ključ dijele jedan upit (in-flight dedupe).
 *
 * **W2.11 (`BA-organizational-units-02`): revizija kataloga.** TTL je bio jedina
 * garancija i na instancama koje nisu obradile write — reparent je 60 s ostavljao
 * stari `ouPath`, a `ouPath` odlučuje descendant scope. Keš sada pamti i reviziju
 * iz `OrganizationalUnitCatalogRevision` (singleton red koji svaki topološki write
 * bumpuje u istoj transakciji) i koristi zapis samo dok se revizija poklapa. Baza
 * je kanal invalidacije: nema eventa koji može izostati, a cijena je jedan
 * `SELECT` po reviziji umjesto cijele tabele po zahtjevu. Ako se revizija ne može
 * pročitati (delegat nedostaje, upit padne), keš se **ne** koristi — zastario
 * snapshot se nikad ne servira; čita se baza, a ako i ona padne zahtjev nema
 * odluku (fail-closed).
 *
 * Kao i `settings-snapshot.ts`: keš radi samo UNUTAR HTTP zahtjeva (postoji request
 * id). Worker poslovi, boot i skripte uvijek čitaju bazu — pozadinski rad vidi ono što
 * je upravo zapisano. Klijent koji ne zna `findMany` (ručno pisani test delegati)
 * također ide direktno u bazu preko pozivaočevog fallbacka.
 */

import {
  organizationalUnitCatalogueRevisionId,
  readPublishedOrganizationalUnitCatalogueRevision,
} from '../request-context/catalogue-revision-probe';
import { getRequestId } from '../request-context/request-context.storage';

type Entry<T> = { readonly expiresAt: number; readonly value: Promise<T> };

const organizationalUnitTtlMs = readTtl('SCOPE_CACHE_OU_TTL_MS', 60_000);
const actorGroupsTtlMs = readTtl('SCOPE_CACHE_GROUPS_TTL_MS', 30_000);

type UnitsEntry = Entry<readonly OrganizationalUnitScopeRow[]> & {
  /** Shared catalogue revision this snapshot was read under. */
  readonly revision: bigint;
};

type Buckets = {
  units: UnitsEntry | undefined;
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

type RevisionSource = {
  readonly organizationalUnitCatalogRevision?: {
    readonly findUnique: (args: {
      readonly where: { readonly id: number };
      readonly select: { readonly revision: true };
    }) => Promise<{ readonly revision: bigint } | null>;
  };
};

type RevisionWriter = {
  readonly organizationalUnitCatalogRevision: {
    readonly upsert: (args: {
      readonly where: { readonly id: number };
      readonly create: { readonly id: number; readonly revision: bigint };
      readonly update: { readonly revision: { readonly increment: bigint } };
    }) => Promise<unknown>;
  };
};

type GroupSource = {
  readonly groupMember: {
    findMany: (args: {
      readonly where: { readonly userId: string };
      readonly select: {
        readonly id: true;
        readonly groupId: true;
        readonly createdAt: true;
      };
    }) => Promise<
      readonly {
        readonly id?: string;
        readonly groupId: string;
        readonly createdAt?: Date;
      }[]
    >;
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

/**
 * Shared catalogue revision. `0n` means "no row yet" (a database migrated but
 * never written to); the migration seeds `1`.
 *
 * Perf kapija (2026-10-29): when the durable session read already carried the
 * revision for this request, that value is used and **no statement is issued**.
 * The check stays per request - it is the same read, just fused with the session
 * query every authenticated request already pays for.
 */
export async function readOrganizationalUnitCatalogRevision(
  prisma: RevisionSource,
): Promise<bigint> {
  const published = readPublishedOrganizationalUnitCatalogueRevision();
  if (published !== undefined) {
    return published;
  }
  const delegate = prisma.organizationalUnitCatalogRevision;
  if (delegate === undefined) {
    throw new Error('organizational unit catalogue revision is unavailable');
  }
  const row = await delegate.findUnique({
    where: { id: organizationalUnitCatalogueRevisionId },
    select: { revision: true },
  });
  return typeof row?.revision === 'bigint' ? row.revision : 0n;
}

/**
 * Bumps the shared revision. Call it **inside** the transaction that changed the
 * topology (create/rename/move/delete, directory materialization) so the bump and
 * the change commit or roll back together - a committed change can then never be
 * invisible to another instance's cache check.
 */
export async function bumpOrganizationalUnitCatalogRevision(
  client: RevisionWriter,
): Promise<void> {
  await client.organizationalUnitCatalogRevision.upsert({
    where: { id: organizationalUnitCatalogueRevisionId },
    create: { id: organizationalUnitCatalogueRevisionId, revision: 1n },
    update: { revision: { increment: 1n } },
  });
}

/**
 * All `(id, ouPath)` rows, cached for 60 s **per revision**. A snapshot is served
 * only while the shared revision still matches, so a write on another instance is
 * visible on the next request instead of after the TTL. When the revision cannot
 * be read the cache is bypassed entirely (fail-closed, see module doc).
 */
export async function loadOrganizationalUnitScopeRows(
  prisma: UnitSource & RevisionSource,
): Promise<readonly OrganizationalUnitScopeRow[]> {
  if (getRequestId() === undefined) {
    return prisma.organizationalUnit.findMany({ select: { id: true, ouPath: true } });
  }
  const store = bucketsFor(prisma);
  const now = Date.now();
  let revision: bigint;
  try {
    revision = await readOrganizationalUnitCatalogRevision(prisma);
  } catch {
    // Never fall back to a snapshot whose freshness cannot be proven.
    store.units = undefined;
    return prisma.organizationalUnit.findMany({ select: { id: true, ouPath: true } });
  }
  const cached = store.units;
  if (cached !== undefined && cached.expiresAt > now && cached.revision === revision) {
    return cached.value;
  }
  const started = generation;
  const value = prisma.organizationalUnit.findMany({
    select: { id: true, ouPath: true },
  });
  const entry: UnitsEntry = { expiresAt: now + organizationalUnitTtlMs, value, revision };
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
  prisma: UnitSource & RevisionSource,
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
  /** Stable identity for count-cache fingerprinting across remove/re-add of a group. */
  readonly membershipId: string;
  readonly groupId: string;
  readonly joinedAt: Date;
};

/** Group memberships of one user (with join time), cached for 30 s. */
export function loadActorGroupMemberships(
  prisma: GroupSource,
  userId: string,
): Promise<readonly ActorGroupMembership[]> {
  const read = () => readActorGroupMemberships(prisma, userId);
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

/**
 * Authoritative membership snapshot for revocation-sensitive reads. This always
 * queries the current database state and deliberately ignores the process cache.
 */
export function loadActorGroupMembershipsAuthoritatively(
  prisma: GroupSource,
  userId: string,
): Promise<readonly ActorGroupMembership[]> {
  return readActorGroupMemberships(prisma, userId);
}

function readActorGroupMemberships(
  prisma: GroupSource,
  userId: string,
): Promise<readonly ActorGroupMembership[]> {
  return prisma.groupMember
    .findMany({
      where: { userId },
      select: { id: true, groupId: true, createdAt: true },
    })
    .then((rows) =>
      rows.map((row) => {
        // Hand-written test delegates may not carry `createdAt`; "since forever".
        const joinedAt = row.createdAt instanceof Date ? row.createdAt : new Date(0);
        return {
          // Real Prisma rows always have an id; this fallback keeps narrow test
          // delegates usable while still distinguishing different join times.
          membershipId:
            typeof row.id === 'string'
              ? row.id
              : `${row.groupId}:${joinedAt.getTime()}`,
          groupId: row.groupId,
          joinedAt,
        };
      }),
    );
}

/** Group ids of one user, cached for 30 s (same entry as the memberships). */
export async function loadActorGroupIds(
  prisma: GroupSource,
  userId: string,
): Promise<readonly string[]> {
  const memberships = await loadActorGroupMemberships(prisma, userId);
  return memberships.map((membership) => membership.groupId);
}

/**
 * Local invalidation, unchanged: drops this process's snapshot(s) immediately
 * after a write. It is no longer what makes other instances correct - the shared
 * revision does that (W2.11) - so a missed local call can only cost one extra
 * `findMany` on the instance that did the write.
 */
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
