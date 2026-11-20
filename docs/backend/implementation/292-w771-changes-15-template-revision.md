# W7.71 — `BA-changes-15`: šablon se mijenja samo nad revizijom koju ste učitali

**Paket:** Val 7, audit 24 / `changes` — integritet šablona standardnih promjena<br>
**Nalaz:** `BA-changes-15` (P2) — „Template update nema optimistic concurrency/before-after audit”<br>
**Kodni commit:** `7eb6594` · **CI:** [44742892785](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44742892785)<br>
**DB migracija:** **nema** — revizija je `updatedAt` reda, isti obrazac kao `KnowledgeArticle` (W7.51)

## Šta je nalaz tvrdio

Audit 24 §10: „Template update nema optimistic version; dva managera mogu last-write-wins zamijeniti
fields/services i oba dobiti audit „updated“ bez before/after.”

Prije paketa `ChangeTemplatesService.update` je radio `count()` **izvan** transakcije, pa `update` po `id`,
pa `deleteMany`/`createMany` nad `ChangeTemplateService`. Nijedan korak nije nosio reviziju: drugi manager
je pregazio prvog bez ijednog signala, a `change.template_saved` je uvijek pisao isti metadata
`{ operation: 'updated' }` — bez revizije, bez polja koja su se promijenila, bez prije/poslije.

## Šta je urađeno

**1. Revizija bez migracije** (`change-template-audit.ts`)

`ChangeTemplate` nema integer `version`, a dodavanje kolone bi bila migracija — koja se u ovom projektu
isporučuje samo uz izričito odobrenje. Revizija je zato `updatedAt` reda, kao kod `KnowledgeArticle` od
W7.51: `GET`/`list` vraćaju `revision` (ISO instanta), a normalizacija prihvata i golu vrijednost i entity-tag
oblik (`"…"`, `W/"…"`) i poredi **trenutke**, ne stringove — isti moment zapisan bez milisekundi ili u drugoj
zoni je ista revizija.

**2. Uslovni upis koji pada zatvoreno**

| Ulaz | Odgovor | Efekat |
| --- | --- | --- |
| nema `If-Match` | **428** `CHANGE_TEMPLATE_REVISION_REQUIRED` | ništa se ne piše |
| `If-Match` stariji od reda | **412** `CHANGE_TEMPLATE_STALE` | ništa se ne piše |
| red se promijeni između čitanja i upisa | **412** `CHANGE_TEMPLATE_STALE` | transakcija se poništava |
| isti `If-Match` | 200 | upis + jedan audit red |

`If-Match` je ovdje **obavezan** (kod članka baze znanja nije): šablon nema drugi preduslov, pa bez revizije
ne postoji ništa prema čemu bi se zastarjeli editor prepoznao. Odgovor 428/412 je izabran umjesto 409 jer je
to tačno značenje uslovnog zahtjeva (`If-Match` + preduvjet), a ne sudar poslovnog pravila.

Upis ide u jednoj transakciji: `findUnique` **unutar** nje (snapshot polja i `serviceId` veza), provjera
revizije, diff, pa `updateMany({ where: { id, updatedAt }, data: { …polja, updatedAt: new Date() } })`.
`count !== 1` znači da je neko pisao između čitanja i upisa ⇒ 412 i rollback; veze servisa se zamjenjuju tek
poslije uspješnog CAS-a. Revizija se postavlja eksplicitno (ne oslanja se na `@updatedAt`), da upis pomjeri
token i kad se dvije izmjene dese u istoj milisekundi.

**3. Before/after audit** (`audit-action-schema-registry.ts`, `change-template-audit.ts`)

`change.template_saved` je dobio **schema verziju 2** (i `compatibility` 2) sa allowlistom koji nosi:
`operation`, `changedFields`, `textChanged`, parove `name`/`previousName`, `impact`, `likelihood`,
`causesDowntime`, `isActive` i njihove `previous*`, `servicesAdded`/`servicesRemoved`, te
`previousRevision`/`revision`.

Pravilo je isto kao kod izmjene changea (W7.67): **slobodan tekst se samo imenuje**. Šablon nosi do četiri
teksta od po 8.000 znakova, pa bi kopija obje verzije probila budžet metadata od 16 KiB i pretvorila audit u
drugi primjerak zapisa. Zato `description`, `implementationPlan`, `backoutPlan` i `testPlan` idu u
`changedFields`/`textChanged`, a skalari i veze nose prije/poslije (veze kao **broj**, ne kao ID-evi CMDB
redova). Spas koji ništa ne mijenja ne piše ni red ni audit zapis — nema lažnih „updated” tragova.

**4. Frontend** (`changes-api/calendar-templates.ts`, `change-templates-panel.tsx`)

`updateChangeTemplate` šalje `If-Match` sa revizijom koju je editor učitao. Na 412 forma **ostaje** sa
unijetim tekstom (duga forma ne smije izgubiti unos), prikazuje inline blok sa objašnjenjem i dugmetom
**Učitaj najnoviju verziju** (koje ponovo učita red i time resetuje formu na serverom stanje) i podiže
**danger toast** — greška u dugoj formi ne smije ostati samo u liniji koja se skrola iz vidnog polja. Dva nova
koda su prevedena (bs/en).

## Odluke i posljedice

| Odluka | Zašto | Posljedica |
| --- | --- | --- |
| `updatedAt` kao revizija, bez nove kolone | nema migracije bez odobrenja; isti obrazac kao W7.51 | revizija nije monotoni broj; dvije izmjene u istoj ms se razlikuju jer se `updatedAt` postavlja eksplicitno |
| `If-Match` obavezan | bez njega nema šta da se poredi, a rupa je upravo „tihi last-write-wins” | **breaking** za API klijente: `PUT /changes/templates/:id` bez headera sada vraća 428; jedini potrošači su UI i E2E 32 (ažuriran) |
| 428/412 umjesto 409 | semantika uslovnog zahtjeva | FE mapira oba koda; `CHANGE_VERSION_CONFLICT` (409) ostaje za change CAS |
| tekst samo po imenu | 16 KiB metadata budžet i „audit nije drugi primjerak” | forenzičar vidi **koja** polja i **obje** revizije, a sadržaj plana čita iz zapisa |

## Dokaz

- **Backend:** `change-template-audit.spec.ts` (revizija i diff: 4 oblika tokena, 428/412, skalari sa
  prije/poslije, tekst samo po imenu, veze kao brojevi, „ništa se ne mijenja”) + `change-templates.service.spec.ts`
  (zastarjeli/odsutni token, CAS gubitak ⇒ 412 bez ijednog upisa, `updateMany` sa `updatedAt`, zamjena veza,
  jedan audit red sa obje revizije, no-op bez audita, `templateNotFound`).
- **Registri audita:** oba spec-a (schema i compatibility) sada drže eksplicitnu mapu „bumped” verzija, a
  schema spec ima regresijski test da metadata koju editor stvarno šalje prolazi `prepareAuditEntry` (isti
  obrazac kao on-call override regresija).
- **Frontend:** novi `changes-api-template-revision.spec.ts` (header + enkodiran id) i `change-view.spec.ts`
  (mapiranje 412/428 na bs/en ključeve).
- **E2E 32** (`32-change-scheduling.spec.ts`): deaktivacija šablona sada nosi `If-Match`; stari token ⇒ 412
  `CHANGE_TEMPLATE_STALE`, zahtjev bez headera ⇒ 428 `CHANGE_TEMPLATE_REVISION_REQUIRED` — oba doka­zuju da se
  deaktivacija ne može pregaziti.
- **Rezime:** `changes` **30 suite/189 testova** (1 suite skipped: Postgres), `audit-log` **21 suite/89 testova**,
  `changes`+`audit-log`+`templates` **62 suite/410 testova**; frontend `lib/changes` + `i18n` + nova servisna
  spec **13 fajlova/66 testa**; `eslint` čist (backend `changes`+`audit-log`, frontend izmijenjeni fajlovi),
  `tsc` bez novih grešaka u izmijenjenim fajlovima, `node scripts/check-backend-wiring.mjs` **99/631**,
  `npm run audit:traceability` **696/696**, `db:migration-policy:check` **121** (bez nove migracije).

## Napomene sa CI-ja

Prvi push (`4384048`) je pao na dva mjesta, oba u frontend jobu i oba u mom kodu, ne u ponašanju: Prettier je
odbio ručno prelomljene asertacije u `change-view.spec.ts` (`f3d8351`), a `npm run build` (`tsc -b`) je našao
`toast` izvan opsega u `ChangeTemplateSheet` — hendler je pozvan u sheetu, a `useToast()` je bio samo u
roditeljskom panelu (`7eb6594`). Lokalna provjera je zato ponovljena **stvarnim** gateovima: `npm run build`,
`npm run format:check`, `npm run bundle:check` i cijeli `vitest run` (**1851/1851**), ne samo ciljani specovi.

## Preostali rizik

- Revizija je vremenska oznaka: klijent koji sam izmišlja token dobija 412, ali ne postoji kriptografska veza
  sa sadržajem (kao kod `If-Match` ETag-a nad hashom). Za ovaj zapis je to prihvatljivo — CAS unutar
  transakcije i obavezan header zajedno zatvaraju „tihi” slučaj, a hash bi zahtijevao novi ugovor i kolonu.
- Legacy klijenti bez headera više ne mogu spremiti šablon (428). To je namjerno fail-closed ponašanje, ali
  instalacija sa integracijom treće strane mora je ažurirati.
- `change.template_saved` schema v2: stariji čitači audita koji očekuju samo `operation` i dalje rade (ključ je
  i dalje tu), ali novi ključevi su u zapisima od ovog paketa nadalje — mješoviti historijat je očekivan.
