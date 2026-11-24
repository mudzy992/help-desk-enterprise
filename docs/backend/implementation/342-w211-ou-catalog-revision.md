# W2.11 — `BA-organizational-units-02`: dijeljena revizija OU kataloga umjesto lokalne invalidacije

**Paket:** Val 2, P1 (scope enforcement), **size L**<br>
**Nalaz:** „Cross-instance stale `ouPath` cache privremeno zadržava pogrešan authorization scope”<br>
**Kod:** `common/cache/scope-catalog-cache.ts`, `common/database/database-runtime-contract.ts`,
`modules/organizational-units/{create,update,delete}-organizational-unit.ts`,
`modules/directory-sync/{materialize-directory-read.ts,ldaps/apply-directory-sync-plan.ts}`<br>
**Šema:** novi singleton model `OrganizationalUnitCatalogRevision` + migracija
`20271202120000_organizational_unit_catalog_revision` · **Rute:** nepromijenjene (632) · **Env:** nema novih varijabli<br>
**Specovi:** `common/cache/scope-catalog-cache.revision.spec.ts` (**novo, 9**),
`organizational-units/organizational-unit-catalog-revision.spec.ts` (**novo, 4**), plus delegat revizije u četiri
in-memory klijenta (OU, install seed, `apply-directory-sync-plan`, `materialize-directory-read`)

## Nalaz

`ouPath` je aplikativni identitet OU-e i osnova za descendant scope (`doesOrganizationalUnitScopeCover`: jednakost ili
prefiks `assignedPath + '/'`). `loadOrganizationalUnitPath` je čitao `(id, ouPath)` iz procesnog keša sa TTL-om od 60 s
(`SCOPE_CACHE_OU_TTL_MS`), a mutacije su zvale `invalidateOrganizationalUnitScopeCache()`, koja resetuje `WeakMap`
**samo u procesu koji je obrađivao write**.

Posljedica: podstablo se premjesti iz OU A u OU B na instanci 1. Instanca 2 ima u kešu stari `/A/...` i do 60 s
odobrava A-scoped akteru pristup resursu koji je sada u B (ili uskraćuje pristup resursu koji je sada u A). To je
privremeni cross-OU pristup nakon sigurnosno relevantne topološke promjene — nikad „samo” UI greška.

## Odluka

**Baza je kanal invalidacije.** Umjesto događaja između instanci (koji može izostati — Redis pub/sub je best-effort,
subscriber koji se restartuje propušta poruke) uvodi se **dijeljena revizija kataloga**: singleton red koji se
povećava u **istoj transakciji** kao topološki write, a keš se koristi samo dok se revizija poklapa.

Šest namjernih odluka:

- **Revizija, ne događaj.** Nijedna instanca ne mora biti „obaviještena”. Svaki zahtjev koji koristi keš pročita
  reviziju (jedan `SELECT` po PK-u) i, ako se razlikuje od one pod kojom je snapshot napravljen, snapshot odbacuje i
  čita ponovo. Auditov acceptance kriterij „uključujući event-delivery fault” ovdje je ispunjen po konstrukciji: nema
  eventa.
- **Bump unutar transakcije.** `create`/`update`/`delete` OU-e i direktorijumska materijalizacija bumpuju reviziju u
  istoj transakciji (ili, tamo gdje transakcije nema, odmah nakon writeova). Nemoguće je commitovati promjenu topologije
  bez promjene revizije — pa nema „committed write, missed bump”.
- **Fail-closed na nečitljivu reviziju.** Ako revizija ne može da se pročita (delegat nedostaje, upit padne), keš se
  **ne** koristi: čita se baza direktno. Zastario snapshot se nikad ne servira; ako i baza padne, zahtjev nema
  autorizacijsku odluku (fail-closed), što je ispravno.
- **TTL ostaje, ali samo kao granica cijene.** TTL sada sprječava da se cijela tabela čita u svakom zahtjevu; tačnost
  više ne visi o njemu. Zato `SCOPE_CACHE_OU_TTL_MS` smije da ostane 60 s bez sigurnosne posljedice.
- **Lokalna invalidacija ostaje.** `invalidateOrganizationalUnitScopeCache()` i dalje odmah briše snapshot u procesu
  koji je pisao (uštedi jedan `findMany`); njen izostanak sada košta jedan upit, ne tačnost.
- **Ne diramo keš članstava u grupama.** `loadActorGroupMemberships` (30 s) ima istu klasu problema za *revokaciju*
  grupe; to je `BA-groups-02` i drugi modul — vidi „Granica paketa”.

### Šta se plaća

Jedan `SELECT "revision" FROM "OrganizationalUnitCatalogRevision" WHERE id = 1` po zahtjevu koji koristi OU scope keš
(umjesto nule u starom dizajnu i umjesto cijele tabele OU-a u dizajnu bez keša). Na OU tabelama od desetina do stotina
redova to je jeftinije od `findMany` i ne raste sa dubinom stabla.

### Zašto nova tabela, a ne `updatedAt` OU-a

`max(updatedAt)` bi radio, ali: (a) agregat nad cijelom tabelom je skuplji od PK pogotka, (b) `updatedAt` se mijenja i
za izmjene koje ne diraju katalog (policy pack binding), pa bi keš padao bez potrebe, (c) preciznost timestampa i
„dva writea u istoj mikrosekundi” ostaju rub. Eksplicitna revizija je monotona, jeftina i čitljiva u auditu.

## Implementacija

### 1. Šema i migracija

```prisma
model OrganizationalUnitCatalogRevision {
  id        Int      @id @default(1)
  revision  BigInt   @default(0)
  updatedAt DateTime @updatedAt
}
```

Migracija `20271202120000_organizational_unit_catalog_revision` je **nedestruktivna**: `CREATE TABLE` + seed reda
`(id = 1, revision = 0)`. Sentinel `expectedSchemaMigration` u `database-runtime-contract.ts` je pomjeren na novu
migraciju (inače boot guard i `check-migration-policy` padaju).

### 2. Keš

`scope-catalog-cache.ts` dobija `readOrganizationalUnitCatalogRevision` i `bumpOrganizationalUnitCatalogRevision`
(atomni `upsert` sa `increment`), a `loadOrganizationalUnitScopeRows` postaje „cache-aware”: čita reviziju, pa
odlučuje. Zapis u kešu nosi i reviziju pod kojom je napravljen. Rad bez request id-a (worker, CLI, boot) ostaje
direktno čitanje bez revizije — pozadinski rad uvijek vidi ono što je upravo zapisano.

### 3. Gdje se bumpuje

| Mjesto | Kako |
| --- | --- |
| `POST /organizational-units` | unutar `$transaction`, poslije audit zapisa |
| `PATCH /organizational-units/:id` (rename/move, rewrite podstabla) | unutar `$transaction`, poslije audit zapisa |
| `DELETE /organizational-units/:id` (i manual-catalog delete preko njega) | unutar transakcije brisanja |
| `materialize-directory-read` | jednom, poslije svih upsertova, prije lokalne invalidacije |
| `apply-directory-sync-plan` (LDAPS) | kada je `unitsCreated + unitsUpdated > 0` |

**Ne bumpuje se** u `policy-packs/bind-*` i `settings/invalidate-configuration-caches`: oni mijenjaju `policyPackId`,
ne `(id, ouPath)`, pa keš kataloga nije ni zastario. (Lokalna invalidacija tamo ostaje kao i prije.)

### 4. Rollback

Pošto je bump u transakciji, rollback writea vraća i reviziju. Test „does not bump when the transaction rolls back”
to pinuje na in-memory klijentu.

## Vizuelna provjera (ručni koraci)

Ovo je jedini paket u nizu koji se **ne može** provjeriti na jednoj instanci — njegov cijeli smisao je druga instanca.
Potrebno: jedna baza, dvije API instance iz istog imagea (npr. `docker compose up --scale api=2` ili dva procesa sa
`PORT=3000` / `PORT=3001` i istim `DATABASE_URL`) i dva OU-a (A i B) — najlakše iz seedovanog manualnog kataloga
`/Users` i `/Users/IT` (vidi `341-w210-…md`, sekcija „AD konektor sa testnim OU”, dio A).

1. **Zagrij obje instance.** Na instanci **1** otvori Admin → **Organizacija (OU)** i uđi u stablo; na instanci **2**
   isto. Time su oba procesa keširala `(id, ouPath)` katalog.
2. **Zabilježi reviziju.** U bazi: `SELECT revision FROM "OrganizationalUnitCatalogRevision" WHERE id = 1;`
   → zapamti broj (npr. `7`).
3. **Premjesti podstablo na instanci 1.** Admin → **Organizacija (OU)** → **Uredi** na `/Users/IT` → promijeni ime
   (npr. `IT-Support`) → sačuvaj. Očekivano: instanca 1 odmah pokazuje novi `ouPath` (`/Users/IT-Support`).
4. **Provjeri reviziju.** Isti `SELECT` → broj je **veći za 1** (npr. `8`). Ako nije, bump nije u transakciji —
   prijavi kao bug.
5. **Instanca 2 bez čekanja.** U **istoj sekundi** (nikako poslije 60 s) na instanci **2** otvori Admin →
   **Organizacija (OU)** i `/Users/IT-Support` detalj. Očekivano: **novi** `ouPath`; nema starog `/Users/IT` nigdje u
   stablu, ni u filterima tiketa.
6. **Scope se mijenja s pathom.** Kao scoped ADMIN dodijeljen **starom** putu (`/Users/IT`) probaj na instanci 2
   otvoriti resurs koji je sada pod `/Users/IT-Support` → **403** (stari scope više ne pokriva), i to bez čekanja TTL-a.
   Kao ADMIN dodijeljen `/Users` (parent) isti resurs je dostupan — pokazuje da je granica segmentirana, ne prefiks
   stringa.
7. **Kontrola „bez keša”.** Ponovi korake 3–5 sa `SCOPE_CACHE_OU_TTL_MS=0` postavljenim na **obje** instance → rezultat
   mora biti isti (keš je optimizacija, ne izvor tačnosti).
8. **Fail-closed na nečitljivu reviziju (opciono, staging).** Dok je zahtjev u toku preimenuj tabelu
   `OrganizationalUnitCatalogRevision` u bazi (ili ukini prava read-only roli koju API koristi za nju): naredni zahtjev
   **ne smije** servirati keširani scope — mora čitati bazu, a ako i to padne, odgovor je greška, nikad dozvola.
   Vrati tabelu nakon provjere.
9. **Regresija.** Jedna instanca, bez ijedne OU izmjene: stablo i lista tiketa rade kao prije; u logu nema novih
   upozorenja (`authorization_audit_retry`, `INVALID_INPUT`).

## AD konektor sa testnim OU

Paket ne dira konektor. Za korake 1–6 dovoljan je **manualni katalog** (`npm run db:seed` u `backend`, seeduje `/Users`,
`/Users/IT`, `/Groups` sa testnim korisnicima) — puni setup, uključujući LDAPS varijantu i scoped/globalne admine, je u
`341-w210-users-control-plane-scope.md`, sekcija „AD konektor sa testnim OU” (dijelovi A, B i C). Ako koristiš LDAPS,
bitno je samo da su dva OU-a u **različitim granama** i da sync radi na **obje** instance (inače korak 3 mijenja samo
jednu).

## Direktni testni dokaz

- `scope-catalog-cache.revision.spec.ts` (9) — keš pogodak uz istu reviziju; **druga instanca** (drugi Prisma klijent,
  isti „podaci”) vidi novi path na prvom zahtjevu nakon bumpa; nečitljiva revizija odbacuje snapshot i ne kešira;
  klijent bez delegata ne kešira uopšte; worker (bez request id-a) ne pita reviziju; lokalna invalidacija radi; oblik
  atomnog `upsert`-a; nedostajući red = `0n`; nedostajući delegat = „unreadable”.
- `organizational-unit-catalog-revision.spec.ts` (4) — create/rename/delete bumpuju tačno jednom; rollback ne bumpuje.
- In-memory klijenti (`create-in-memory-organizational-unit-prisma`, `create-in-memory-install-seed-prisma`) dobili su
  delegat revizije **sa rollback semantikom**, pa testovi mogu tvrditi „bump je commitovan sa writeom”, a ne nagađati.

## Lokalna verifikacija i njeno ograničenje

- backend pun Jest: **977 suite / 5.776 testa prolazi, 0 padova** (1.083 ukupno, 342 skipped — integracijski bez baze);
  OU modul **14 suite / 76 testova**; `install` **54/277**; `directory-sync` + `policy-packs` **36/162**;
- `check-migration-policy` ✓ (126 migracija, sentinel pomjeren), `eslint --max-warnings=0` na svim diranim
  direktorijumima, `wiring:check` ✓ (632 rute nepromijenjene);
- **nije izvedeno lokalno:** `prisma validate` i `prisma generate` traže `binaries.prisma.sh` (sandbox ga ne dobija), pa
  je klijent stub i TS dijagnostika isključena → **runtime dokaz, ne type-check**; schema validaciju, generisanje i
  primjenu migracije na stvarnoj bazi daje CI (*Validate the complete Prisma schema*, *Backend PostgreSQL + Redis
  integration*).

## Granica paketa

- **`BA-organizational-units-03`** (konkurentni hierarchy updatei nisu serijalizovani/revision-guarded) ostaje otvoren —
  revizija je monotona i bezopasna za konkurentnost, ali ne zamjenjuje advisory lock nad podstablom.
- **`-05`** (principal invalidacija nakon mapping/delete je optional i best-effort) ostaje otvoren: revizija rješava
  *scope katalog*, ne keš principala.
- **`BA-groups-02`** (actor-group keš, 30 s, ista klasa problema za dvije instance) ostaje otvoren — drugi modul, drugi
  paket; isti obrazac (dijeljena revizija) se može primijeniti tamo.
- Policy-pack binding ne bumpuje reviziju namjerno (vidi §3); ako se u budućnosti keš počne koristiti i za `policyPackId`,
  to je nova odluka.

## Registar nalaza

- Zatvoreno: `BA-organizational-units-02`.
- Ostaje otvoreno iz istog modula: `-03`, `-04`, `-05`, `-06`, `-07`, `-08`, `-09`.
