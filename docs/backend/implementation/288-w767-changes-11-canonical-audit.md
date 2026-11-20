# W7.67 — `BA-changes-11`: kanonski audit za edit i claim

**Paket:** Val 7, audit 24 / `changes` — centralni audit trail<br>
**Nalaz:** `BA-changes-11` (P2) — „Claim/general update nemaju kanonski globalni audit”<br>
**Kodni commit:** `ecc543e` (+ `0540868` sentinel/format) · **CI:**
[`44709539049`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44709539049) (success)<br>
**DB migracija:** `20271201140000_audit_scope_provenance_change_actions` — **odobrena od korisnika**, forward-only,
`CREATE OR REPLACE FUNCTION` (bez DDL-a nad podacima)

## Šta je nalaz tvrdio

`create`, lifecycle akcije, vote i template save pisali su kanonski `AuditLog` red. **General update i claim** su
pisali samo `ChangeEvent`. Zato promjena vlasnika, organizacione jedinice, CAB grupe, linked problema, planiranog
prozora ili klasifikacije nije ulazila u audit log, iako je promjena statusa ulazila. Audit log je jedini globalni,
OU-particionirani i tamper-evident zapis (change historija je vidljiva samo kroz change scope), pa je to forenzički
i compliance gap: „ko je pomjerio prozor i kada” nije bilo odgovorivo iz centralnog traga.

## Šta je urađeno

**Dvije nove kanonske akcije** (`change.updated`, `change.claimed`), registrovane u sva četiri mjesta gdje sistem
drži ugovor o akciji:

| Registar | Unos |
| --- | --- |
| `audit-log.constants.ts` | `changeUpdated: 'change.updated'`, `changeClaimed: 'change.claimed'` |
| `audit-action-schema-registry.ts` | allowlist metadata, `sensitivity: 'pseudonymous'` |
| `audit-action-scope-registry.ts` | `'entity'` (red se particionira u `ou:<OJ changea>`) |
| `audit-action-compatibility-registry.ts` | samo entitet `change` |

**Metadata politika** (`change-audit.ts`) prati obrazac `BA-problems-12` (W7.30), ali sa change poljima:

- `changedFields` imenuje **svako** promijenjeno polje; `textChanged` imenuje slobodan tekst (`description`,
  `reason`, `implementationPlan`, `backoutPlan`, `testPlan`, `communicationPlan`). Sadržaj se **nikad** ne kopira.
- `title` se pojavljuje samo kao ime polja (u change historiji je i dalje `from`/`to`, jer je to interni zapis).
- Prije/poslije nose reference i klasifikacije: `ownerUserId`, `organizationalUnitId`, `cabGroupId`, `problemId`,
  `impact`, `likelihood`, `risk`, `plannedStart`, `plannedEnd` (svaki sa `previous*` parom).
- Linkovi na servise i CMDB se bilježe **brojem** (`servicesAdded`, `servicesRemoved`, `assetsAdded`,
  `assetsRemoved`) i imenima `services`/`assets` u `changedFields`; konkretni ID-evi ne ulaze u audit, da centralni
  trag ne postane druga kopija CMDB veza.
- `reauthorized: true` kad je write vratio change iz `SCHEDULED` u `AUTHORIZATION` (procjena rizika prozora).
- Claim nosi samo `ownerUserId` i `previousOwnerUserId`.

**Transakcijska granica:** `recordAuditEntry` se poziva **unutar** postojeće `$transaction`, poslije
`changeRequest.updateMany` (version predicate) i poslije `changeEvent.create`, pa pad audita poništava i promjenu i
event. Update računa odredišnu OJ (`effectiveUnitId`), pa se red pomjera u novu particiju kad se change prenosi.
Claim zadržava rani izlaz kad je actor već vlasnik — nema promjene, nema eventa, nema audit reda.

**Baza:** `enforce_audit_scope_provenance` je zamijenjen (`CREATE OR REPLACE`, trigger ostaje vezan na istu
funkciju) i change branch sada poznaje i `change.updated` i `change.claimed`, pa trigger provjerava da je
`AuditLog.organizationalUnitId` **stvarna** OJ changea. Bez toga bi scope bio tačan samo po konstrukciji; guard
`audit-scope-provenance-whitelist.spec.ts` (koji čita migracije) traži ovaj par. Readiness sentinel
(`expectedSchemaMigration`) je pomjeren na novu migraciju.

**Frontend:** `knownAuditActions` dobija obje akcije (bs: „Promjena — izmijenjena”, „Promjena — preuzeta u
obradu”), katalog metadata polja dobija 24 nova imena (reference, prozor, klasifikacije, linkovi, planovi), a
`AuditMetadataList` ih prevodi — lista imena polja se i dalje prevodi samo kad je **svaki** njen dio poznato polje.

## Dokaz

- `change-audit.spec.ts` (7): minimizacija teksta (ni stari ni novi naslov/opis nisu u metadata), linkovi kao
  brojevi bez ID-eva, `reauthorized`, claim metadata, **stvarni** `prepareAuditEntry` prihvata pun metadata
  (allowlist nije u divergenciji sa writerom), obje akcije traže OU (`AUDIT_SCOPE_REQUIRED`), a metadata sa
  slobodnim tekstom je odbijen (`AUDIT_METADATA_FIELD_NOT_ALLOWED:change.updated:description`).
- `changes-audit-scope.spec.ts` (6): update piše `change.updated` sa `actorUserId`, OJ i `previousImpact`/
  `impact`, bez teksta; **jedan** audit po writeu, u istoj transakciji kao event; update bez promjene ne piše
  ništa; premještaj piše u odredišnu OJ sa `previousOrganizationalUnitId`; claim piše `change.claimed` sa oba
  vlasnika i OJ changea; claim od strane trenutnog vlasnika ne piše ništa.
- `audit-scope-provenance-whitelist.spec.ts` (+1): obje nove akcije su u DB whitelistu protiv
  `ChangeRequest.organizationalUnitId`.
- Backend: changes + audit-log **42 suite / 205 testa**; sa `ops-health` + `app.module.spec` **57 / 372**;
  `db:migration-policy:check` 121 migracija, odobrenja validna.
- Frontend: `admin-ops-i18n-coverage` (akcije, polja, vrijednosti, alarmi) + `audit-metadata-list` (novi test
  renderuje change edit bez teksta); cijeli frontend **462 fajla**; `i18n:check`, `tsc`, `eslint`, `prettier`
  čisti.
- CI [`44709539049`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44709539049) **success**:
  migracija je primijenjena u integracionom jobu kroz single-owner release migrator, pa trigger u bazi stvarno
  sadrži nove akcije. E2E i read-only inventory su `skipped`.

## Preostali rizik

1. **Linkovi bez ID-eva** — audit kaže „2 servisa dodana”, ne koja; ko je veza promijenjena ostaje u change
   historiji i u `ChangeRequestService`/`ChangeRequestAsset` redovima. To je namjerna minimizacija.
2. **Bulk/downtime replay** ne piše `change.updated`; worker reconciler (W7.64) ima svoj put i svoj audit — ovaj
   nalaz pokriva korisničke write putanje.
3. **Audit red nosi OJ odredišta** kad se change prenosi; particija prati stanje **poslije** write-a, pa je red
   vidljiv novoj OJ, a ne staroj (isto pravilo kao kod problema).
4. **`change.claimed` ne zamjenjuje owner event** — historija i audit ostaju dva sloja; event nosi UI diff, audit
   nosi forenzički trag.
5. **Sensitivity `pseudonymous`** znači da se `directIdentifierKey` polja maskiraju; trenutni metadata ne nosi
   imena/e-mailove, samo ID-eve, pa maskiranje realno ne mijenja ništa.

## Sljedeće

Sljedeći P2 u auditu 24 je `BA-changes-12` (conflict acknowledgement nema snapshot/hash i može zastarjeti prije
action commita).
