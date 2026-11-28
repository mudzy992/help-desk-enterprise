# 370 — W2.35b: kreiranje OU-a iz imenika je padalo na audit scopeu; i zašto je permisija vraćala 503

**Paket:** `W2.35b` · **Nalaz:** runtime bug (nije iz audita) · **Datum:** 2026-11-28 · **Grana:** `arena/864951a6-help-desk-enterprise`
**Owner:** directory-sync / audit owner · **Povezano:** `W7.38` (scope provenance trigger), `W2.9`/`W2.11` (OU control plane i scope), `BA-organizational-units-03` (sljedeći paket)
**DB migracije:** ne

## 1. Prijava

SuperAdmin je pokušao kreirati organizacionu jedinicu iz „Imenika korisnika" i dobio `500`:

```
Error: AUDIT_SCOPE_REQUIRED:organizational_unit.created
    at prepareAuditEntry (dist/src/modules/audit-log/audit-event-policy.js:59:15)
    at appendAuditLog (...)
    at recordOrganizationalUnitChange (...)
    at create-manual-directory-organizational-unit.js:42
```

Zatim je pokušao dodijeliti `organizationalUnit.manage` kroz ekran permisija i dobio `503`
`AUTHORIZATION_AUDIT_UNAVAILABLE`, uz `auditLog.create()` → PostgreSQL `XX002`
(`cannot find insert offset between offsets 11 and 19 of block 427`).

To su **dva nezavisna kvara**; prvi je bug u kodu, drugi je oštećen indeks u bazi.

## 2. Prvi kvar: katalog imenika nije organizaciona jedinica

| Tvrdnja | Stanje prije W2.35b |
| --- | --- |
| `ManualDirectoryOrganizationalUnit` je `OrganizationalUnit` | **ne** — to je red *kataloga imenika*; u OU se materijalizuje tek na čitanju (`materialize-directory-read.ts`, `upsert` po `distinguishedName`) |
| kreiranje kataloškog reda piše `organizational_unit.created` | **tačno** (`create-manual-directory-organizational-unit.ts:58`) |
| ta akcija je `entity` scope u `auditActionScopeRegistry` | **tačno** — `prepareAuditEntry` zato **traži** `organizationalUnitId` |
| poziv ga prosljeđuje | **ne** — `recordOrganizationalUnitChange` je parametar ostavljao `null` |
| ishod | `AUDIT_SCOPE_REQUIRED:organizational_unit.created` ⇒ `500`, a transakcija se rollbackuje, pa se **ništa** ne kreira |
| DB trigger `enforce_audit_scope_provenance` | za tu akciju traži `OrganizationalUnit` po `entityId`; kataloški `id` tamo ne postoji ⇒ i da je scope proslijeđen, trigger bi odbio red (`AUDIT_SCOPE_ENTITY_NOT_FOUND`) |

Dakle scope se **nije smio** „dopisati": identitet je bio pogrešan. Isto je važilo za
`update` (isti `organizational_unit.updated`), dok je `delete` prolazio samo zato što je
`organizational_unit.deleted` jedina od tri akcije sa `producer` scopeom — tj. prolazilo je
slučajno, i dalje tvrdeći da je obrisana OU koja možda nikad nije postojala.

**Zašto testovi nisu uhvatili.** `create-manual-directory-organizational-unit.spec.ts`
radi `jest.mock('../organizational-units/record-organizational-unit-change')`, pa
`prepareAuditEntry` nikad nije izvršen u testu. Mock na granici audita pretvarao je pad u
zeleno — to je vrsta lažno zelenog testa koju ovaj paket uklanja.

## 3. Korekcija

Nove, poštene akcije i entity tip (installation-level, bez OU scopea):

| Akcija | Entity tip | Scope | Metadata (allowlist) |
| --- | --- | --- | --- |
| `directory.catalog_organizational_unit.created` | `directory_catalog_entry` | `global` | `source`, `after` |
| `directory.catalog_organizational_unit.updated` | `directory_catalog_entry` | `global` | `source`, `before`, `after`, `affectedDescendantCount` |
| `directory.catalog_organizational_unit.deleted` | `directory_catalog_entry` | `global` | `source`, `before`, `removedRoleAssignments`, `affectedUserCount` |

- `recordManualDirectoryCatalogChange()` (novi, `directory-sync/`) piše te redove; kataloški
  `before`/`after` sada koristi ključ **`name`** (kao i pravi OU audit), a ne `displayName` —
  `displayName` je u politici klasifikovan kao direktni identifikator i bio bi maskiran u
  `[PSEUDONYMIZED]`, pa operator ne bi vidio **koja** je jedinica napravljena.
- Brisanje: kad je OU materijalizovana, `deleteOrganizationalUnitInTransaction` i dalje piše
  svoj `organizational_unit.deleted` sa scopeom jedinice; kataloški red se uvijek dodatno
  audituje kao `directory.catalog_organizational_unit.deleted` (brojevi se kopiraju iz
  ishoda brisanja: `removedRoleAssignments`, `affectedUserCount`).
- Bez migracije: nove akcije nisu u trigger whitelistu (global scope), pa trigger vraća red
  bez provjere — što je i tačno, jer jedinica ne postoji.
- Frontend: `knownAuditActions`/`knownAuditEntityTypes` + bs/en labele (`Imenik korisnika —
  organizaciona jedinica …`, `Stavka imenika korisnika`); guard
  `admin-ops-i18n-coverage.spec.ts` drži te liste identične backend registrima.

## 4. Dokaz

| Test | Šta dokazuje |
| --- | --- |
| `record-manual-directory-catalog-change.spec.ts` — **7** | kroz **pravi** `appendAuditLog`/`prepareAuditEntry`: sve tri akcije prolaze, red je `directory_catalog_entry`, scope `null`, particija `global`; **negativna kontrola** ponavlja tačan produkcioni poziv (`organizational_unit.created` bez scopea) i traži `AUDIT_SCOPE_REQUIRED`; pogrešan entity tip i nedozvoljen metadata ključ se odbijaju |
| `create-manual-directory-organizational-unit.audit.spec.ts` — **2** | **end-to-end** put kreiranja bez mocka audita: red se upisuje (akcija, entity tip, `entityId`, `name`, `source`), a pad upisa obara cijelu transakciju |
| `create/update/delete-manual-directory-organizational-unit.spec.ts` | ažurirani na nove akcije; brisanje materijalizovane OU traži **oba** reda (OU + katalog) |

Lokalno: `npx jest --testPathPatterns "directory-sync/"` → **23 suite / 105 testova** zeleno;
`npx jest --testPathPatterns "audit"` → **34 suite / 189 testova** zeleno.

## 5. Drugi kvar: `XX002` na `AuditLog` (nije kod)

`index_corrupted` na B-tree indeksu `AuditLog`-a. Aplikacija je ispravno **fail-closed**:
SuperAdmin prolazi kroz bypass granu, koja za svaki zahtjev upisuje audit red; bez upisa
nema ni akcije, pa `GET /roles/permissions/catalog` vraća `503`. Ekran permisija je zato
bio prazan — nije bio problem u katalogu permisija (`organizationalUnit.manage` postoji u
kategoriji `directory`).

Postupak: [ops/runbook/pg-index-corruption.md](../../../ops/runbook/pg-index-corruption.md)
(`amcheck` → `REINDEX INDEX CONCURRENTLY` → `VACUUM (ANALYZE)` → dokaz kroz tri zahtjeva),
plus `audit-write-failure` alarm u [ALERTS.md](../../../ops/runbook/ALERTS.md).

## 6. Šta ovaj paket ne tvrdi

- Ne tvrdi da je popravljena baza: `REINDEX` je operatorska radnja, kod je samo prestao da
  traži OU scope za red kataloga.
- Ne mijenja pravilo da je katalog dostupan samo `SUPER_ADMIN`-u preko `RoleGuard`-a
  (directory control plane nema permission ključ; `organizationalUnit.manage` važi za
  `OrganizationalUnit` rute).
- Ne rješava obim `AuditLog`-a ni globalnu advisory bravu u `appendAuditLog`; to ostaje
  zabilježeno u runbooku kao argument za particionisanje, ne za preskakanje popravke.
- Ne mijenja `BA-organizational-units-03` (concurrent hierarchy rewrite) — to je sljedeći
  paket.

## 7. Fajlovi

`backend/src/modules/audit-log/audit-log.constants.ts`,
`audit-action-schema-registry.ts`, `audit-action-scope-registry.ts`,
`audit-action-compatibility-registry.ts`,
`backend/src/modules/directory-sync/record-manual-directory-catalog-change.ts` (+ `.spec.ts`),
`create-…-organizational-unit.ts` (+ `.spec.ts`, + `.audit.spec.ts`),
`update-…-organizational-unit.ts` (+ `.spec.ts`), `delete-…-organizational-unit.ts` (+ `.spec.ts`),
`frontend/src/lib/audit/audit-log-actions.ts`, `audit-log-entities.ts`,
`frontend/src/i18n/locales/{bs,en}/common.json`,
`ops/runbook/pg-index-corruption.md`, `ops/runbook/ALERTS.md`.
