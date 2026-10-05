# Doprinosi (CONTRIBUTING)

Kratka pravila za ovaj repozitorij. Detalji o modulu Dokumentacija su u
[`docs/DOCS_MODULE.md`](docs/DOCS_MODULE.md).

## Dokumentacija ide uz kod (obavezno)


**Izmjena funkcionalnosti povlači izmjenu stranice dokumentacije u istom commitu.** Konkretno:

- promjena koju korisnik osjeti dobija i red u `docs/user-guide/sta-je-novo.md` (datum + kratak opis + link na
  stranicu modula); ako je izmjena samo interna, u `DOCS_CHANGELOG.md` se označava `[interno]` i red u
  „Šta je novo“ nije obavezan — **CI (`check-docs-content`) pada ako je zadnji datum u `DOCS_CHANGELOG.md`
  noviji od zadnjeg reda u „Šta je novo“**;
- link na drugu stranicu vodiča piše se kao ruta (`[Pošta](/docs/posta)`); relativne `.md` veze se u ogledalu
  prevode u rute automatski, a CI provjerava da svaka ruta pogodi objavljenu stranicu i postojeći naslov;
- ogledalo (`backend/content/docs/**`) se regeneriše **poslije** commita stranica (`updatedAt` se čita iz
  gita), pa se `manifest.json` commit-uje u zasebnom commitu.

Ako promjena mijenja
ponašanje opisano u `docs/user-guide/**` (ekran, polje, validacija, status, dozvola, tok koraka), ista izmjena
mora ažurirati i tu stranicu. Isto pravilo `TEZE-ZA-DOKUMENTACIJU.md` §1 traži za teze.

Redoslijed:

1. Izmijeni ili dodaj stranicu u `docs/user-guide/<slug>.md`. `slug` je ime fajla bez `.md`, a frontmatter ima
   polja `title, slug, module, part, audience, roles, order, tags`. `updatedAt` se **ne piše ručno** — generator
   ga puni datumom zadnjeg commita (`git log -1 --format=%cs`).
2. Generiši ogledalo koje aplikacija čita:

   ```bash
   node scripts/generate-docs-content.mjs           # piše backend/content/docs/**
   node scripts/generate-docs-content.mjs --check   # ne piše; pada ako se ogledalo razlikuje
   ```

   Generator uzima `updatedAt` iz **istorije gita**, pa radi u punom klonu; ako je klon plitak
   (`git clone --depth 1`), prvo pusti `git fetch --unshallow`, inače generator ne može izračunati datum i
   zadrži stari (CI, koji ima punu istoriju, onda prijavi razliku).

3. Provjeri sadržaj:

   ```bash
   node scripts/check-docs-content.mjs
   ```

   Provjera (i istoimeni CI korak „Check docs content and mirror sync“) pokriva: frontmatter i jedinstvene
   slugove, sinhronizaciju ogledala sa izvorom, relativne veze, slike, obrasce tajni, slugove i anchore iz koda
   (mapa ekran→stranica u `frontend/src/lib/docs/docs-slug.ts`) i jedinstvene anchore unutar stranice.

Bez ovoga CI pada, a `/docs` u aplikaciji prikazuje staru verziju teksta.

## Kada dodaješ novu stranicu

- Fajl ide u `docs/user-guide/`, `part` je jedan od `pocetak`, `korisnik`, `agent`, `administrator`,
  `operativa`, `referenca`, a `order` se povećava po 10 unutar dijela.
- `roles` je lista rola koje stranicu smiju vidjeti (`USER`, `AGENT`, `ADMIN`, `SUPER_ADMIN`, `ASSET_MANAGER`,
  `PROBLEM_MANAGER`, `CHANGE_MANAGER`); prazna lista `[]` znači da je stranica dostupna svakom prijavljenom
  korisniku. Filtriranje radi server, ne UI.
- Ako stranicu treba otvarati iz kontekstualne „?“ pomoći, dodaj rutu u
  `frontend/src/lib/docs/docs-slug.ts` — provjera iz koraka 3 vraća grešku ako slug ili anchor ne postoje.
- Ne kopiraj sadržaj u kod: jedini izvor je `docs/user-guide/**` (+ `TEZE-ZA-DOKUMENTACIJU.md` za tehničke
  stranice), a `backend/content/docs/**` je generisani ogledalo.

## Ostale provjere

```bash
node scripts/check-client-neutral.mjs    node scripts/check-theme-contrast.mjs
node scripts/check-env-example.mjs       node scripts/check-a11y-static.mjs
node scripts/check-ticket-id-leaks.mjs   node scripts/check-hooks-order.mjs
node scripts/check-pulse-design-system.mjs
node scripts/check-ticket-list-page-size.mjs   node scripts/check-workflows-yaml.mjs
```

Dvije provjere iz zadnjeg reda čuvaju greške koje su se stvarno desile: `check-ticket-list-page-size.mjs`
drži veličinu stranice liste tiketa ispod server maksimuma (staging je vratio `pageSize must not be greater
than 50`), a `check-workflows-yaml.mjs` traži dvotočku u neukotvljenoj vrijednosti i **ponovljeni ključ u
istom bloku** u `.github/workflows/**` (GitHub je odbio cijeli workflow i zbog `name: … (val 1 regresija:
pageSize 100)` i zbog koraka sa dva `run:` ključa).

Sve skripte iz `scripts/check-*.mjs` moraju proći prije commita; iste se pokreću i u CI-u.
