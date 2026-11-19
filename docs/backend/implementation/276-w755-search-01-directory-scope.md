# Package closeout — W7.55

**Paket:** W7.55 — directory pretraga traži permisiju i poštuje OU podstablo<br>
**Nalaz:** `BA-search-01` (P1) — **zatvoren**<br>
**Kodni commit:** `091505c`<br>
**Finalni testani SHA:** `091505c`<br>
**CI:** [`44534156887`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44534156887) — zelen (14m42s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `27-search.md` §6 (i §1, §11): `maySearchDirectoryUsers` je propuštao **bilo koji** `ADMIN` roleKey bez
provjere permissiona, bez OU/servis scope-a i bez ikakvog predikata nad rezultatom. `searchDirectoryUsers` je
radio globalni `user.findMany` po `displayName`/`email` i vraćao `id`, `displayName` i `email` svih aktivnih
korisnika. Scoped administrator jedne jedinice je zato mogao enumerisati identitete i adrese svih ostalih
jedinica — globalna typeahead pretraga je tu površinu činila trivijalnom.

Acceptance (audit §14.1, §6):

1. scoped administrator ne može otkriti korisnika izvan odobrenog OU podstabla;
2. directory pretraga traži **eksplicitnu** directory/user-read permission politiku, ne bilo koji `ADMIN`
   roleKey;
3. globalni directory mode je samo za `SUPER_ADMIN` (odnosno za izričito, unscoped dodijeljenu permisiju);
4. privacy-minimalan response — e-mail samo kada je potreban;
5. fail-closed: prazna grupa, nikad greška koja ruši ostale grupe.

## Implementacija

- **Nova politika `search-directory-scope.ts`** (čist modul, bez Prisma zavisnosti) sa dva koraka:
  `resolveDirectorySearchGrant(authorization)` odlučuje **da li** i **koliko široko** smije čitati, a
  `resolveDirectorySearchScope({ grant, organizationalUnits })` prevodi OU putanje u ID-jeve podstabla preko
  postojeće `selectOrganizationalUnitIdsInScope` (ista semantika kao audit-log i izvještaji — nema druge
  implementacije scope pravila).
- **Grant je permisija, ne ime role:** novi ključ `user.directory.read` (`permissionKeys.userDirectoryRead`),
  sa katalog unosom (nova kategorija `directory`) i bs/en naslovom, i sa default dodjelom roli `ADMIN` u
  `defaultRolePermissionKeys`.
- **Legacy ekvivalencija, dokumentovana:** `ADMIN` roleKey i dalje odgovara grupu, ali **samo** u podstablu svoje
  dodjele. Razlog je rollout bez migracije: postojeće instalacije imaju `RolePermission` redove nastale prije
  ovog ključa, pa bi isključivo permission-gate tiho ugasio pretragu imenika svim postojećim administratorima.
  Legacy put nikad ne daje globalni doseg i nikad ne daje e-mail.
- **Globalni doseg:** samo `SUPER_ADMIN`, ili dodjela koja nosi `user.directory.read` i **nije** ograničena ni na
  OU ni na servis (`organizationalUnitId`, `organizationalUnitPath`, `serviceId` sva tri `null`). Servisno
  ograničena dodjela se **nikad** ne tretira kao globalna. Unscoped `ADMIN` bez permisije zadržava
  prijašnji globalni doseg, ali bez e-maila.
- **Privacy minimizacija je u upitu, ne u serializaciji:** scoped čitanje ima
  `select: { id, displayName }` i `organizationalUnitId: { in: [...] }`; e-mail kolona se **ne čita** iz baze.
  Korisnik bez jedinice (`organizationalUnitId: null`) nije u nijednom podstablu, pa ga scoped pozivalac ne
  vidi — fail-closed. Globalni doseg čita cijeli aktivni imenik i vraća e-mail (`UserSearchMatch.email:
  string | null`).
- **Fail-closed:** nema grante, putanja bez jedinice, blank putanja, nepoznata jedinica ili grant koji se ne
  može razriješiti → `{ kind: 'none' }` → prazna grupa. Ticket i article grupe se i dalje vraćaju; nema greške
  koja obara cijeli odgovor.
- **Servis:** `SearchService.searchUsers` traži grant uvijek, a tabelu jedinica (`organizationalUnit.findMany`
  sa `{ id, ouPath }`) čita **samo** kad grant je OU-scoped.
- **Frontend:** `UserSearchHit.email` je `string | null`; paleta mapira `subtitle: user.email ?? ""`, pa red bez
  e-maila nema podnaslov (postojeći render već preskače prazan `hint`). Nema novog UI elementa ni i18n ključa.
- **Bez migracije:** nema schema promjene; sve potrebne kolone (`User.organizationalUnitId`,
  `OrganizationalUnit.ouPath`) postoje.

### Namjerne odluke (trade-off)

1. **Legacy `ADMIN` ekvivalencija umjesto strogo permisijskog gatea.** Strogi gate bi bez backfill migracije
   ugasio imenik svim postojećim administratorima (njihove role nemaju novi red u `RolePermission`). Odabrano je
   rješenje koje P1 zatvara odmah (scope), a rollout ne lomi; uklanjanje legacy grane je zaseban, migracijom
   praćen korak (vidi „Preostali rizik”).
2. **E-mail samo za globalni doseg.** Discovery površina (typeahead) treba ime za navigaciju; puni zapis ima
   ekran jedinice (`GET /organizational-units/:id/users`) i korisnički detalj. Time se PII ne širi kroz novu
   površinu, a scoped administrator ne gubi pristup podacima — gubi ih samo u paleti.
3. **Podstablo, ne samo jedna jedinica.** Dodjela na `/Korisnici/IT` pokriva i `/Korisnici/IT/Support`,
   konzistentno sa audit-logom i izvještajima. Suprotno bi značilo da administrator matične jedinice ne vidi
   vlastite podjedinice.
4. **`BA-search-09` (P3, stabilan order) nije dodirnut.** `orderBy` je i dalje samo `displayName asc`; tie-breaker
   ostaje u svom paketu, iako dira isti upit.

## Dokaz

- `search-directory-scope.spec.ts` (novo, 11 testova): zatvoreno bez grante i bez assignmenta; SUPER_ADMIN
  globalno sa e-mailom; scoped `ADMIN` → podstablo (`ou-it` + `ou-it-support`, bez `ou-hr` i bez roota) bez
  e-maila; unscoped `ADMIN` → globalno bez e-maila; eksplicitna permisija scoped → podstablo; eksplicitna
  unscoped permisija → globalno sa e-mailom; servisno ograničena permisija → `none`; jedinica bez putanje i
  nepoznata putanja → `none`; više dodjela se unionišu i deduplikuju.
- `search.service.spec.ts` (4 nova/izmijenjena testa): IT administrator nalazi IT korisnika i `IT/Support`
  dijete i nikad HR; **cross-unit P1 scenario** (`marko` match po imenu, ali `where` nosi
  `organizationalUnitId.in = ['ou-it','ou-it-support']` i `select` bez e-maila); tabela jedinica se čita samo za
  scoped grant; eksplicitna permisija na `AGENT` roli otvara grupu bez role `ADMIN`.
- `header-search-match.spec.ts` (1 novi test): server bez e-maila → red bez podnaslova.
- Lokalno: `npx jest --config /tmp/jest.local.json src/modules/search src/modules/authorization` → **143 zeleno**;
  pun backend suite **5017/5021** uz tri **pre-egzistirajuća okolinska** faila (Prisma stub: `Prisma.sql`
  flattening u `problem-mentions.spec.ts`; sandbox storage `disk-ticket-attachment-storage.streaming.spec.ts`;
  `announcement-delivery.spec.ts`). Frontend: `eslint`, `prettier --check`, `tsc -b` + `vite build` i **vitest
  460/460 fajlova** zeleni; `npm run i18n:check` OK. Backend `npm run lint`, `audit:traceability` (696/696) i
  `wiring:check` (631 ruta) zeleni. Sandbox `npm run build` nije gate (Prisma klijent je stub), pa je typecheck
  dokaz CI korak „Build backend with annotated diagnostics”.

## CI

- [`44534156887`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44534156887) na `091505c` —
  **success** (14m42s): backend build/lint/full Jest, PostgreSQL + Redis integracija, frontend
  lint/format/testovi/build/bundle budget, Docs guard, container/supply-chain i CI gate. E2E install wizard,
  E2E critical flows i read-only inventory bili su `skipped` (E2E pokreće korisnik, po dogovoru).
- Prvi i jedini pokušaj; nije bilo typecheck/format ispravki nakon pusha. Lokalna priprema prije pusha:
  `npx tsc --noEmit` filtriran na `src/modules/search` (čist nakon uklanjanja duplog `contexts` ključa u
  specu) i `npx eslint src/modules/search src/modules/authorization`.

## Registar nalaza

- Zatvoreni: `BA-search-01` (P1) — **posljednji P1 nalaz Vala 7**.
- Ostaju otvoreni u `27-search.md`: 12 nalaza, **P1: nema** — P2: `BA-search-02` (normalizacija prije
  validacije), `03`/`04` (KB kandidati i projekcija), `05` (rate limit), `06` (KB owner/reviewer scope),
  `07` (query plan/perf), `08` (partial/fail-closed ugovor); P3: `09` (stable order), `10` (`ArrayUnique`),
  `11` (telemetrija), `12` (confidential/arhiva test), `13` (compile-blocked suite — sada izvršava).

## Migracija, rollout i rollback

Nema migracije. Ponašanje je strože: scoped `ADMIN` vidi samo korisnike svojih podstabala i bez e-maila;
unscoped `ADMIN` zadržava globalni doseg bez e-maila; `SUPER_ADMIN` je nepromijenjen. Rollback: revert
`091505c` vraća stari gate i e-mail u paleti; nema podataka za vraćanje, ali se novi permission ključ tada
uklanja iz kataloga (UI bi izgubio jedan red u pregledu permisija).

**Preostali rizik (dokumentovan):** (1) legacy `ADMIN` grana ostaje dok se ne izvede kontrolisani backfill
`user.directory.read` na postojeće ADMIN role i migracija koja ga čini jedinim putem — to je zaseban paket;
(2) unscoped `ADMIN` bez permisije i dalje vidi cijeli imenik (bez e-maila) — isti backfill ga sužava na
podstablo, a do tada je to svjesno zadržan paritet sa prijašnjim ponašanjem; (3) korisnik bez jedinice nije
pronađiv iz scoped pretrage (fail-closed, može se javiti kao „korisnik ne postoji” u paleti — dokumentovano u
auditu kao namjerno); (4) vodič `uloge-i-dozvole` navodi **63** permisije, dok katalog sada ima **69** — drift je
stariji od ovog paketa i ispravlja se u dokumentacionom paketu (izvor je generisan ogledalom, pa zahtijeva
regeneraciju, ne ručnu izmjenu).

## Sljedeći paket

Val 7 prelazi na **P2**. Sljedeći po redu je `BA-search-02` (P2) — normalizacija upita prije validacije.
