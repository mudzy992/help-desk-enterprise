# W7.83 — `BA-knowledge-base-09`: placement i kategorije se pišu zajedno sa svojim tragom

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „Placement/category mutation nije atomska sa auditom/change-logom”<br>
**Kod:** `portal/knowledge-portal.service.ts` (`placeArticle`, `createCategory`, `updateCategory`,
`setCategoryArchived`), `portal/knowledge-categories.ts` (opcioni `transaction`), `portal/knowledge-portal.service.spec.ts`
(+3 testa), `knowledge-placement-atomicity.integration.spec.ts` (novo), `audit-log/audit-action-schema-registry.ts` i
`audit-action-compatibility-registry.ts` (v2 za `knowledge.category.updated`) + njihovi specovi,
`scripts/run-isolated-integration.mjs` (shard)<br>
**DB migracija:** nema<br>
**CI:** [`44947960568`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44947960568)

## Nalaz

Dvije površine, isti obrazac — **zapis i njegov trag nisu bili jedna cjelina**:

1. **Placement** (`PATCH /knowledge-base/articles/:id/placement`) je mijenjao `categoryId`/`isFaq`/`faqOrder`
   jednom naredbom, a change-log zapis drugom. Ako log padne, članak je **premješten bez traga**; ako paralelno
   stignu dva placementa, oba prođu (zadnji pobjedi), a log opisuje `before` koji u tom trenutku **više nije
   bio tačan**. Nema nikakvog predikata nad stanjem reda.
2. **Kategorije** (`createCategory`, `updateCategory`, `setCategoryArchived`) su pisale red, pa **otvarale novu**
   transakciju za audit. Kategorija je mogla postojati bez zapisa ko ga je napravio, a audit je mogao opisati
   izmjenu koja je u međuvremenu poništena.

### Bonus: pronađena i popravljena živa greška

Dok je pisan test za atomskost, pokazalo se da `knowledge.category.updated` u **audit allowlisti** ima
`schema([])` — nijedno metadata polje — a servis šalje `before`/`after`. Posljedica: **svaki rename kategorije**
je upisao red i zatim pao sa `AUDIT_METADATA_FIELD_NOT_ALLOWED`; korisnik je dobio grešku, a promjena je
**ostala** u bazi bez audita. To je tačno obrazac iz nalaza, samo sa obrnutim ishodom (upis prošao, trag nije), i
zato je popravljeno u istom paketu.

## Rješenje

- **`placeArticle`**: `$transaction(provjera kategorije → CAS `updateMany` → `findUniqueOrThrow` → change log)`.
  - CAS predikat je `{ id, updatedAt }` — **isti obrazac kao `updateKnowledgeArticle`** (W7.51): upis prolazi
    samo ako je red još tačno ono što je zahtjev pročitao. Pisac koji se ubacio u međuvremenu ⇒
    `STALE_WRITE` (409), umjesto tihog prepisivanja i lažnog `before` u logu.
  - Provjera da je kategorija aktivna (`assertKnowledgeCategoryAssignable`) sada ide **unutar** transakcije, pa
    se ne može desiti da se kategorija arhivira između provjere i upisa (sam race sa arhiviranjem je
    `BA-knowledge-base-10`).
  - Ulazna validacija (`faqOrder`) ostaje **prije** transakcije — nema smisla otvarati transakciju za odbijen
    zahtjev.
- **Kategorije**: helperi (`createKnowledgeCategory`, `updateKnowledgeCategory`, `setKnowledgeCategoryArchived`)
  primaju opcioni `transaction` — isto kako već radi `createKnowledgeArticle` — pa servis radi
  `$transaction(izmjena → audit)`. Audit helper (`this.audit`) je već primao `options.transaction` (W7.82), sada
  ga koriste i kategorije.
- **Audit ugovor**: `knowledge.category.updated` prelazi na **schema v2** sa `['before', 'after']` (operational),
  a `auditActionCompatibilityRegistry` na v2 za istu akciju — oba bumpa su upisana u `bumpedSchemaVersions`
  listu, pa „tiha” promjena verzionisanog ugovora obara spec.

### Zašto CAS, a ne `SELECT … FOR UPDATE`

Oba rješavaju izgubljeno ažuriranje; CAS je već **uspostavljen obrazac** u ovom modulu (`updateKnowledgeArticle`,
lifecycle tranzicije) i ne drži bravu nad redom dok traje autorizacija i validacija. Cijena je da klijent mora
ponoviti zahtjev kad dobije `STALE_WRITE` — frontend to već mapira (`mapKnowledgeArticleError` →
`knowledgeBase.errorConflict`), a placement kartica prikazuje poruku o konfliktu.

### Cijena

- Placement: ista dva upita kao prije (`updateMany` + `findUniqueOrThrow`) + jedan `findUnique` za kategoriju,
  sada u transakciji.
- Kategorije: jedna transakcija više nema — prije ih je bilo **dvije** (izmjena + audit), sada jedna.

## Direktni testni dokaz

**Unit (`knowledge-portal.service.spec.ts`, 10 → 13 testova):**

- **change log se piše unutar placement transakcije** (spy nad `$transaction` i `changeLog.create`) i postoji
  tačno jedan zapis;
- **zastarjelo čitanje se odbija**: ako je `updatedAt` u međuvremenu pomjeren, placement vraća `STALE_WRITE`, u
  change logu nema **nijednog** zapisa, a članak ostaje u staroj kategoriji;
- **sve tri izmjene kategorije** (create, update, archive) pišu audit **unutar** svoje transakcije
  (`inside = [true, true, true]`), a kategorija je stvarno arhivirana.

**Audit ugovor (`audit-action-schema-registry.spec.ts`):** novi test dokazuje da `prepareAuditEntry` **prima**
`{ before, after }` za `knowledge.category.updated` — isti regresioni obrazac kao `changeTemplateSaved`.

**PostgreSQL integracija (`knowledge-placement-atomicity.integration.spec.ts`, 2 testa, novi CI shard):**

- **predikat pogađa samo pročitani red**: poslije tuđeg commita `updateMany` sa starim `updatedAt` vraća
  `count = 0` i stanje drugog pisca **opstaje**;
- **pad change loga odnosi placement**: servis se poziva nad klijentom kome `changeLog.create` baca — poziv
  pada, članak ostaje u staroj kategoriji, a u `ChangeLog` nema nijednog reda za taj članak.

**Ostalo:** runner guard **23/23** (svaki `knowledge-base` integration spec mora biti u listi); backend
`knowledge-base`+`users`+`audit-log` **63 suite / 283 testa** (5 integracionih suite preskočeno lokalno);
`eslint` zelen; `tsc --noEmit` bez novih grešaka u diranim fajlovima (ostaje samo šum stub-klijenta).

## CI i testni dokaz

CI run [`44947960568`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44947960568) na `0567fcf` je
**success**:

- **Backend build + test** — uspješno (validate/generate/wiring/build/lint/puni `npm test`, uključujući
  `audit:traceability` i regressioni test audit allowliste).
- **Backend PostgreSQL + Redis integration** — uspješno; u koraku „Run real PostgreSQL integration suites”
  izvršen je i novi `knowledge-placement-atomicity` shard.
- **Frontend build + test** — uspješno (paket ne mijenja frontend; mapper već pokriva `STALE_WRITE`).
- **Backend container + supply chain**, **Docs guard**, **CI gate** — uspješno; `Perf smoke` takođe **success**.
- **Skipped (po konfiguraciji):** `Read-only service-form pattern inventory`, `E2E critical flows`,
  `E2E install wizard` — puni E2E pokreće korisnik.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-09` (P2). Modul je time **10/19** (`01`–`09`, `11`).
- Ostaju otvoreni u `25-knowledge-base.md`: 9 nalaza, **P1: nema** (`10`, `12`–`15` P2; `16`–`19` P3).
- Globalno nakon regenerisanih zbira: **696 nalaza, 301 zatvoreno / 395 otvoreno**; Val 7 **80/111**, otvoreno
  **31** (P1 0 / P2 17 / P3 14).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Rollback: revert `0567fcf` vraća neatomarni placement i neatomarni audit
kategorija **i** vraća grešku na rename kategorije — zato rollback treba ići zajedno sa svjesnom odlukom o tom
defektu.

**Preostali rizik (dokumentovan):**

1. **CAS na `updatedAt`** znači da i nepovezana izmjena članka (npr. edit teksta) između čitanja i placementa
   vraća `STALE_WRITE`; klijent ponavlja. To je namjerno — bolje odbijanje nego prepisivanje — i pokriveno
   testom.
2. **Autorizacija se ocjenjuje prije transakcije** (na pročitanom stanju). Ako se aktorove dozvole ukinu u tom
   prozoru, jedan placement može proći; prozor je milisekundni i isti obrazac ima `updateKnowledgeArticle`.
3. **Arhiviranje kategorije** i dalje broji aktivne članke bez brave — to je `BA-knowledge-base-10`
   (TOCTOU prema paralelnom placementu) i nije dio ovog paketa.

## Sljedeći paket

**W7.84 — `BA-knowledge-base-10` (P2): category archive guard je TOCTOU prema paralelnom article placementu.**
