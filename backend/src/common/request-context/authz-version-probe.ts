/**
 * W2二十五 (`BA-groups-02`): `User.authzVersion` kao **suvozač** u čitanju koje
 * zahtjev ionako plaća.
 *
 * `W2.24` je sveo privilegovani audit na jedan durable outbox; ovaj paket rješava
 * drugu stranu iste klase problema — opozvano group članstvo koje na drugoj
 * instanci ostaje efektivno do 30 s, jer je `scope-catalog-cache` pamti u procesu.
 *
 * Revizija koja to rješava već postoji: `User.authzVersion`. Svaka membership
 * izmjena ga sada bumpuje **u istoj transakciji** u kojoj se mijenja članstvo, pa
 * je on tačan, durable i atomičan sa promjenom. Ono što je nedostajalo je da ga
 * čitač članstva vidi **bez novog upita**: `SessionRevocationStore.check()` ga
 * već čita na svakom autentifikovanom zahtjevu (`u."authzVersion"`) zajedno sa
 * revizijom kataloga OJ.
 *
 * Zato se vrijednost objavljuje u request scope, isto kao `W2.11` revizija
 * kataloga:
 *
 *   | put                                   | izvor `authzVersion`            |
 *   |---------------------------------------|---------------------------------|
 *   | HTTP zahtjev sa `sid`                 | isti JOIN koji čita sesiju      |
 *   | legacy token bez `sid`                | isti `User` red koji čita autoritet |
 *   | worker / socket / skripta             | nema scope ⇒ keš se ne koristi  |
 *
 * Ako vrijednost nije objavljena (nema request scope-a, neočekivan put), čitač
 * članstva **ne** servira keširani snapshot — čita bazu. Zastarjelo članstvo se
 * nikad ne servira zato što se svježina ne može dokazati.
 */

import { requestContextStorage } from './request-context.storage';

const probeNamespace = {};
const probeKey = 'actor-authz-version';

/**
 * Publishes the `authzVersion` the durable session read already carried. The
 * first publish in a request wins, so two authority reads cannot disagree.
 */
export function publishActorAuthzVersion(authzVersion: number): void {
  if (!Number.isSafeInteger(authzVersion)) {
    return;
  }
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
  values.set(probeKey, Promise.resolve(authzVersion));
}

/**
 * The `authzVersion` already paid for by this request, or `undefined` when
 * nothing was published (no request context, worker, socket path).
 */
export function readPublishedActorAuthzVersion(): Promise<number> | undefined {
  const store = requestContextStorage.getStore();
  const value = store?.memoizedPromises.get(probeNamespace)?.get(probeKey);
  return value as Promise<number> | undefined;
}
