/**
 * Perf kapija (2026-10-29): revizija kataloga OJ putuje kao **suvozač** u čitanju
 * koje zahtjev ionako plaća.
 *
 * `W2.11` je uveo `SELECT OrganizationalUnitCatalogRevision` po zahtjevu da bi
 * keš kataloga OJ bio svjež na svakoj instanci (audit 05, P1: reparent je do 60 s
 * ostavljao stari `ouPath`). Provjera je tačna, ali je svaki zahtjev koji čita OJ
 * plaćao **jedan dodatni statement**: CI perf run `45507674274` je zato pao
 * (`db_queries_per_request` 2,591 prema kapiji 2,1; `/tickets` 3,213 prema 2,470).
 *
 * Rješenje ne popušta garanciju: revizija se čita u **istom** statementu koji
 * `SessionRevocationStore.check()` izvršava na svakom autentifikovanom zahtjevu
 * (durable session + user authority read, `relationLoadStrategy: 'join'` u
 * W2.7). Time `W2.11` provjera ostaje po zahtjevu — bez TTL-a, bez događaja i bez
 * ijednog dodatnog upita:
 *
 *   prije:  SELECT UserSession ⋈ User   +   SELECT OrganizationalUnitCatalogRevision
 *   poslije: SELECT UserSession ⋈ User + (SELECT revision)   ← jedan statement
 *
 * Zahtjev koji **započne** nakon commita reparenta pročita novu reviziju u prvom
 * statementu, pa i dalje ne vidi stari scope. Zahtjev koji je već u toku u
 * trenutku commita može završiti sa snapshotom prije izmjene — isto koliko i prije
 * ovog paketa, jer se i tada revizija čitala jednom, na početku obrade.
 *
 * Kanal je request-scoped `AsyncLocalStorage` koji već nosi `requestId`. Worker
 * poslovi, socket provjere, boot i skripte nemaju store, pa `W2.11` fallback
 * (direktno čitanje) ostaje netaknut.
 */

import { requestContextStorage } from './request-context.storage';

/** Singleton red koji migracija seeduje (`prisma/schema/organization.prisma`). */
export const organizationalUnitCatalogueRevisionId = 1;

const probeNamespace = {};
const probeKey = 'organizational-unit-catalogue-revision';

/**
 * Publishes the revision read by the durable session query. The value is the
 * authority for every cache check later in the same request; the first publish
 * wins so two authority reads in one request cannot disagree.
 */
export function publishOrganizationalUnitCatalogueRevision(revision: bigint): void {
  const store = requestContextStorage.getStore();
  if (store === undefined) {
    return;
  }
  let values = store.memoizedPromises.get(probeNamespace);
  if (values === undefined) {
    values = new Map<string, Promise<unknown>>();
    store.memoizedPromises.set(probeNamespace, values);
  }
  if (values.has(probeKey)) {
    return;
  }
  values.set(probeKey, Promise.resolve(revision));
}

/**
 * The revision already paid for by this request, or `undefined` when nothing was
 * published (no request context, legacy `sid`-less token, socket path).
 */
export function readPublishedOrganizationalUnitCatalogueRevision(): Promise<bigint> | undefined {
  const store = requestContextStorage.getStore();
  const value = store?.memoizedPromises.get(probeNamespace)?.get(probeKey);
  return value as Promise<bigint> | undefined;
}
