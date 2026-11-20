# W7.68 — `BA-changes-12`: acknowledgement vezan za snapshot konflikata

**Paket:** Val 7, audit 24 / `changes` — conflict acknowledgement<br>
**Nalaz:** `BA-changes-12` (P2) — „Conflict acknowledgement nema snapshot/hash i može zastarjeti prije action
commita”<br>
**Kodni commit:** `26e6b1c` · **CI:**
[44717095800](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44717095800) (success)<br>
**DB migracija:** **nema** — sve staje u postojeće kolone i `ChangeEvent.detail`

## Šta je nalaz tvrdio

Provjera konflikata i odluka o acknowledgementu izvršavale su se **prije** `$transaction` u `act()`. Između te
dvije tačke paralelni change može ući u `AUTHORIZATION`/`SCHEDULED`, pa dva korisnika dobiju acknowledgement nad
**različitim** skupom konflikata. Pošto su konflikti samo warning, to nije DB invarijanta — ali audit je morao
sačuvati **konkretan** snapshot, a bilježio je samo `action: 'authorize'`. Zato se poslije nije moglo dokazati
**šta** je korisnik vidio i odobrio.

## Šta je urađeno

**1. Deterministički digest konflikata** (`change-conflict-snapshot.ts`)

`changeConflictSnapshot(conflicts, window)` vraća `sha256` nad kanonskim činjenicama:

| Dio digesta | Sadržaj | Zašto |
| --- | --- | --- |
| `w` | traženi prozor (`start`, `end`, ISO) | pomjeranje prozora mijenja odgovor |
| `c[]` | `id`, `start`, `end` svakog konfliktnog changea | novi/premješteni change mijenja odgovor |
| `d[]` | `id`, `serviceId`, `startsAt`, `endsAt`, `changeRequestId` downtime prozora | pomak prozora za jednu minutu mijenja odgovor |
| `f` | `label`, `from`, `to` zamrzavanja + `freezeBlocks` | freeze ulazi u odluku |

Redoslijed se sortira po `id`-u prije hashiranja, pa poredak upita ne mijenja digest. **Naslovi, brojevi i
tekst downtime poruke se ne hashiraju** — to je slobodan tekst i nije dio odluke; digest zato ne postaje druga
kopija sadržaja. Uz hash snapshot nosi i čitljive brojače (`changes`, `downtime`, `freeze`, `freezeBlocks`,
`hasWarnings`) da zapis ostane razumljiv bez rekonstrukcije.

**2. Preview izdaje digest, action ga mora ponijeti**

- `GET /changes/:id/conflicts` sada vraća `snapshotHash` (uz `acknowledgedAt`); change bez prozora vraća `null`.
- `ChangeActionDto` dobija `conflictSnapshotHash?: string` (`@Matches(/^[a-f0-9]{64}$/)`).
- `act()` pri acknowledgementu: flag sam po sebi više ništa ne odobrava. Bez digesta →
  `CHANGE_CONFLICTS_STALE` (`snapshot_missing`); digest drugog snapshota → `CHANGE_CONFLICTS_STALE`
  (`snapshot_changed`). Oba su **409**, isti status kao `CHANGE_CONFLICTS_NOT_ACKNOWLEDGED`.

**3. Ponovna provjera unutar transakcije**

`ChangeScheduleService.conflictsFor(subject, configuration, client)` dobija treći, opcioni argument
(`ConflictReadClient` = `changeRequest` + `serviceDowntimeWindow`). `act()` ga zove drugi put **unutar**
`$transaction`, sa transakcijskim klijentom, i poredi digest: ako se skup promijenio, baca se
`CHANGE_CONFLICTS_STALE` **prije** `changeRequest.updateMany`. Tako acknowledgement pokriva skup koji je na
snimku u trenutku commita, a ne onaj od prije transakcije.

**4. Dokaz u historiji i u kanonskom auditu**

- `ChangeEvent` `conflicts_acknowledged` nosi `detail: { action, snapshot }` — hash + prozor + brojači.
- `change.status_changed` u `AuditLog` nosi `conflictsAcknowledged: <hash>` kad je akcija prihvatila snapshot;
  allowlist schema registra je proširena, pa metadata prolazi `prepareAuditEntry` bez izuzetka.
- Bez acknowledgementa metadata **ne sadrži** ključ (ne piše se `null`), pa se „nije bilo konflikata” i „nije
  bilo odobrenja” razlikuju po odsustvu, a ne po praznoj vrijednosti.

**5. Frontend**

- `ChangeConflicts` tip dobija `snapshotHash?: string | null`, `ChangeActionInput` dobija `conflictSnapshotHash`.
- `ChangeActionSheet` šalje `acknowledgeConflicts: true` **i** digest previewa koji je renderovan. Stariji server
  bez digesta i dalje dobija samo flag (nema regresije u mješovitom izdanju).
- Na `CHANGE_CONFLICTS_STALE` sheet skida kvačicu, prikaže poruku **i danger toast**, te ponovo učita konflikte —
  korisnik ne može ostati na listi koju je sistem već odbio.
- bs/en: `changes.errors.conflictsStale`, labela audit polja `conflictsAcknowledged`.

**6. E2E**

`e2e/helpers/changes.ts` `act()` pri `acknowledgeConflicts: true` sam pročita `/changes/:id/conflicts` i pošalje
`conflictSnapshotHash` — testovi 31/32 tako rade isto što i UI. Test 32 dodatno dokazuje da **pogrešan** digest
biva odbijen (`CHANGE_CONFLICTS_STALE`).

## Dokaz

- `change-conflict-snapshot.spec.ts` (6): determinizam, neosjetljivost na poredak, neosjetljivost na slobodan
  tekst, novi change mijenja hash, pomak downtimea za minutu mijenja hash, pomak prozora i freeze mijenjaju hash.
- `change-conflict-acknowledgement.spec.ts` (9): flag bez digesta → `snapshot_missing` **bez** transakcije; tuđi
  digest → `snapshot_changed` bez transakcije; ispravan digest prolazi, ponovna provjera ide transakcijskim
  klijentom, event nosi snapshot, audit nosi `conflictsAcknowledged`; konflikt koji uđe između previewa i commita
  obara akciju **prije** `updateMany`; već odobren prozor ne traži digest; prozor bez konflikata ne piše ključ;
  preview vraća digest; change bez prozora vraća `null`; preview i dalje traži `change.read`.
- Backend: `changes` + `audit-log` + `app.module.spec` **45 suite / 222 testa**; `npm run lint` 0 errora;
  `wiring:check` 99 controllera / 631 ruta; `db:migration-policy:check` 121 migracija (bez nove).
- Frontend: `change-action-sheet.spec.tsx` (3) + cijeli suite **463 fajla / 1845 testova**; `tsc`, `eslint`,
  `prettier`, `i18n:check` (9216 ključeva, bs/en parity) čisti.
- E2E: `tsc --noEmit -p e2e/tsconfig.json` čist; suite pokreće korisnik.
- CI [44717095800](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44717095800) **success**: frontend build+test, backend build+test,
  PostgreSQL+Redis integracija, container+supply chain i docs guard zeleni; E2E i inventory `skipped` (kao i do sada).

## Preostali rizik

1. **Warning, ne invarijanta** — digest dokazuje šta je odobreno, ali ne sprječava dva changea da dijele prozor;
   to je i dalje poslovna odluka CAB-a, ne DB constraint.
2. **Konkurentnost između provjere i commita u istoj transakciji** zavisi od izolacije: ponovni upit unutar
   transakcije vidi stanje u trenutku čitanja, ne zaključava redove kandidata. Bez `SERIALIZABLE`/`FOR UPDATE`
   teoretski je moguć uski prozor između drugog čitanja i commita; cijena zaključavanja bi bila veća od koristi
   za warning, pa je odabran dokaz (hash) umjesto blokade.
3. **Digest ne pokriva tekst** — promjena naslova konfliktnog changea ne mijenja hash. To je namjerno: odluka je o
   vremenu i resursima, a tekst ostaje u historiji changea.
4. **Restricted konflikti (W7.45)** ulaze u hash preko svog ID-a i prozora, pa acknowledgement i dalje mora
   proći i kad čitalac ne vidi ime konflikta; broj i prozor su dovoljni za dokaz.
5. **`snapshotHash` je opcion u odgovoru** zbog starijih servera u mješovitom izdanju; novi server ga uvijek vraća
   za change sa prozorom.

## Sljedeće

Sljedeći P2 u auditu 24 je `BA-changes-13` (scheduler bez Redis-loss reconciliation i delivery/downtime drift
health metrike).
