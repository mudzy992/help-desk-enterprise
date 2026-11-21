# W7.79 — `BA-knowledge-base-05`: INTERNAL publika je politika, a ne nuspojava defaulta

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „INTERNAL default je company-wide read bez OU/service granice”<br>
**Kod:** `backend/src/modules/knowledge-base/can-read-knowledge-article.ts`,
`load-knowledge-article-scope.ts`, `list-knowledge-articles.ts`, `search-knowledge-article-titles.ts`,
`get-knowledge-article.ts`, `intercept-knowledge-articles.ts`, `submit-knowledge-feedback.ts`,
`knowledge-base.service.ts`, `portal/knowledge-portal.service.ts`, `knowledge-base.types.ts`,
`knowledge-base.constants.ts`, `parse-knowledge-base-configuration.ts`, `knowledge-base-configuration.loader.ts`,
`settings/setting-keys.ts`, `settings/definitions/knowledge-base-settings.ts`; frontend
`i18n/locales/{bs,en}/common.json`<br>
**DB migracija:** nema (postavka, ne kolona)<br>
**CI:** [`44927782122`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44927782122)

## Nalaz

`INTERNAL` je **default klasifikacija** članka (`schema/enums.prisma`, `DEFAULT_INTERNAL`). U
`canReadKnowledgeArticle` grana je glasila:

```ts
if (input.article.classification === 'INTERNAL') {
  return true;
}
```

Objavljeni interni članak je time bio čitljiv **svakom prijavljenom korisniku** — bez obzira na jedinicu, servis,
dodjelu ili matičnu jedinicu. To nije bila odluka nego posljedica toga što klasifikacija postoji: instalacija koja
nikad nije razmišljala o publici ipak ju je imala, i to najširu moguću. Audit je tražio jedno od dva:
**potvrditi** company-wide pravilo kao proizvodnu odluku ili ga učiniti **scope-aware**.

## Rješenje

Publika je sada **eksplicitna, konfigurabilna i dokumentovana** postavka, a ne grana u kodu:

`private.knowledgeBase.visibility.internalCompanyWide` — boolean, obavezan, **default `false`**.

- **`false` (scope-aware, default).** Objavljeni `INTERNAL` članak čitaju:
  - **osoblje** čija dodjela pokriva OU putanju **i** servis članka — `isKnowledgeDelegationInScope`, ista provjera
    koju W7.49/W7.50 koriste za vlasnika i reviewera, bez role/permission zahtjeva;
  - **djelatnici** čija matična jedinica pokriva jedinicu članka — `doesOrganizationalUnitScopeCover`, dakle
    jedinica i njeno podstablo, **bez ikakve permisije** (to je put samoposlužnog portala).
- **`true` (company-wide).** Svaki prijavljeni korisnik, tačno staro ponašanje — sada kao svjesna odluka koju
  ekran postavki objašnjava i preporučuje da ostane isključena.

Predikat je jedan (`canReadInternalArticle`) i živi na istom mjestu kao ostale grane vidljivosti; klasifikacije
`CONFIDENTIAL` i `RESTRICTED` **nisu** dirane — postavka govori samo o `INTERNAL`.

### Politika putuje do svake čitalačke površine

`loadKnowledgeArticleVisibilities` i `isKnowledgeArticleVisibleTo` više **ne** odlučuju po defaultu: primaju
`KnowledgeArticleVisibilityPolicy { internalCompanyWide }`, a `companyWideKnowledgeVisibilityPolicy` je izvezena
samo za testove koji svjesno pinuju staru publiku. Svaki poziv koji je prije zvao loader bez politike sada je
morao imenovati publiku:

| Površina | Put |
| --- | --- |
| `GET /knowledge-base/articles` | `KnowledgeBaseService.list` → `ListKnowledgeArticlesOptions.configuration` |
| `GET /knowledge-base/search` | `KnowledgeBaseService.searchTitles` (sada `async` + loader) → `input.configuration` |
| `GET /knowledge-base/articles/:id` | `getKnowledgeArticle(..., configuration)` |
| Intercept (sugestije uz tiket) | `interceptKnowledgeArticles` — politika iz već učitane konfiguracije |
| Feedback glasovanje | `submitKnowledgeFeedback` — glasovanje je read |
| Portal: home skan, stranica kategorije, `recordView` | `KnowledgePortalService` — `configuration` u opcijama liste, `recordView` učitava konfiguraciju prije odluke |

`ListKnowledgeArticlesOptions` više nema default `{}`, a `configuration` je obavezan član: novi poziv se ne može
napisati a da ne kaže koga pušta unutra. Loader konfiguracije čita novu postavku, a `catch` grana vraća
`defaultKnowledgeBaseConfiguration` — **isključeno**, pa pad postavki nikad ne proširi publiku.

### Cijena: najviše jedan dodatni upit, i to samo kad treba

Matična jedinica čitaoca nije dio `AuthorizationContext`, pa bi scope-aware provjera mogla postati N+1. Zato
`resolveReaderHomePath` čita `user.organizationalUnitId` **jednom po batchu** i to samo ako istovremeno važi:

1. politika **nije** company-wide, i
2. batch sadrži barem jedan red sa `status = PUBLISHED` i `classification = INTERNAL`.

Company-wide stranica i stranica bez internih članaka ne plaćaju ništa; čitalac bez matične jedinice dobija `null`
i tretira se kao stranac (nema implicitnog pristupa). Test to tvrdi brojanjem poziva (`findUnique` = 1 za stranicu
od tri interna članka, 0 za company-wide i 0 za stranicu bez internih redova).

## Namjerne odluke (trade-off)

1. **Dvije strane granice, ne samo jedna.** Apsolutno „INTERNAL vide samo nalozi koji pokrivaju OU + servis” obara
   samoposlužni portal i E2E 34: krajnji korisnik nema nikakvu dodjelu, pa bi njegov portal bio prazan. Zato
   granica ima i put preko matične jedinice — ali je granica, ne wildcard: bratska jedinica ne vidi članak.
2. **Postavka, ne nova klasifikacija.** Uvođenje četvrte klasifikacije (`OU_INTERNAL`) tražilo bi migraciju,
   preslikavanje starih redova i novi ugovor u svakom klijentu. Postavka rješava isti nalaz bez podataka i bez
   migracije, a `INTERNAL` ostaje „interni” u značenju koje instalacija definiše.
3. **Default je isključeno.** Nalaz je da je široka publika bila *slučajna*; tiha promjena na scope-aware je zato
   jedina odbrana koja ne traži da administrator prvo pogodi da postoji prekidač. Instalacija koja je namjerno
   živjela company-wide uključi postavku i dobije staro ponašanje — sada sa objašnjenjem šta uključuje.
4. **Matična jedinica se ne kešira.** Keš bi morao imati TTL i invalidaciju na premještaj korisnika; jedan
   primarni ključ po batchu je jeftiniji od pogrešne publike.

## Direktni testni dokaz

- `knowledge-base.internal-audience.spec.ts` (**9 testova**, novo):
  company-wide pušta requestora bez matične jedinice i bez permisije; scope-aware ga odbija (`getById` →
  `FORBIDDEN`, lista bez reda, batch prazan); matična jedinica **roditelja** (`/Korisnici` → `/Korisnici/IT`) i
  **tačna** jedinica otvaraju članak bez permisije, kroz `getById` i kroz listu; bratska jedinica (`/Korisnici/HR`)
  ostaje zatvorena; IT agent prolazi kroz delegaciju a HR agent ne; `DRAFT` ostaje skriven i uz company-wide;
  `CONFIDENTIAL`/`RESTRICTED` ostaju na svojoj granici i kad je postavka uključena; single i batch se slažu za
  četiri actora × dva članka, uz tvrdnju da matična jedinica roditelja vidi **oba**; brojanje `findUnique` poziva
  (1 / 0 / 0).
- Postojeći specovi koji pinuju druge osobine (parity W7.60, projection W7.58) sada **imenuju** publiku nad kojom
  odlučuju (`companyWideKnowledgeVisibilityPolicy`) — parnost se i dalje dokazuje, ali ne kroz naslijeđeni default.
  Harness ima eksplicitan komentar zašto drži staru publiku.
- In-memory Prisma `user` delegat nosi `organizationalUnitId` (ranije samo `id`), pa se matična jedinica može
  seedati; harness `configuration` je i dalje mutabilan, pa testovi uključuju/isključuju postavku.
- Backend: `modules/knowledge-base` **20 suite/102 testa** (19/93 + 1 suite/9), `knowledge-base` + `teams`
  **26 suite/198 testova**, `modules/settings` + install sekcije **31 suite/140 testova**, wiring **2/2**,
  `eslint` zelen.
- Frontend: `settings.registry.keys`/`help` za novi ključ u bs/en (bs 119/390 znakova, en 101/393 — unutar
  granica `≤220`/`≤420`), `settings-registry-coverage.spec.ts` katalog **519 → 520**; i18n čuvari
  **4 fajla/32 testa** zeleni, `prettier --check` na oba rječnika čist.
- E2E očekivanje (dokazuje korisnik punim runom): `34-knowledge-portal` objavljuje članak u
  `firstUnitId(tree)` i `provision-test-actors` postavlja **istu** jedinicu kao matičnu jedinicu USER actora
  (`ensure-e2e-actors` je PATCH-uje na svakom runu), pa scope-aware publika pokriva taj test po konstrukciji.

## CI i testni dokaz

CI run [`44927782122`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44927782122) na `7f182f9` je
**success**:

- **Backend build + test:** uspješno (`prisma validate`, `db:generate`, `check:prisma-generated`, `wiring`,
  `build`, `lint`, `test:safety-net:compile`, `test:wiring`, `test:sla:matrix`, puni `npm test`).
- **Backend PostgreSQL + Redis integration:** uspješno — servisni specovi i stvarne baze nisu dirani, ali shard
  prolazi sa promijenjenim ugovorima loader-a.
- **Frontend build + test:** uspješno, uključujući i18n čuvare sa novim ključem (519 → 520).
- **Backend container + supply chain**, **Docs guard**, **CI gate:** uspješno.
- **Skipped (po konfiguraciji):** `Read-only service-form pattern inventory`, `E2E critical flows`,
  `E2E install wizard` — puni E2E pokreće korisnik.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-05` (P2). Modul je time **6/19** (`01`–`05`, `11`).
- Ostaju otvoreni u `25-knowledge-base.md`: 13 nalaza, **P1: nema** (`06`–`10`, `12`–`15` P2; `16`–`19` P3).
- Globalno nakon regenerisanih zbira: **696 nalaza, 297 zatvoreno / 399 otvoreno**; Val 7 **76/111**, otvoreno
  **35** (P1 0 / P2 21 / P3 14).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. **Promjena ponašanja** je namjerna i dokumentovana: instalacija koja je
računala na company-wide `INTERNAL` mora uključiti `private.knowledgeBase.visibility.internalCompanyWide` u
ekranu postavki (ili pustiti da granica važi). Rollback: revert `7f182f9` vraća implicitno company-wide čitanje;
nema podataka za vraćanje.

**Preostali rizik (dokumentovan):** matična jedinica se čita po batchu, a `listKnowledgeArticles` radi u više
prozora (do `maximumListScanBatches`), pa zahtjev sa više prozora i internim člancima može napraviti najviše
onoliko `findUnique` poziva koliko ima prozora — svaki je primarni ključ i nijedan ne čita članke. Brojčani
`INTERNAL` članci stariji od postavke nisu migrirani niti reklasifikovani; postavka mijenja **ko čita**, ne šta
piše u redovima.

## Sljedeći paket

**W7.80 — `BA-knowledge-base-06` (P2).**
