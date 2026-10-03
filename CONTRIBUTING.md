# Doprinosi (CONTRIBUTING)

Kratka pravila za ovaj repozitorij. Detalji o modulu Dokumentacija su u
[`docs/DOCS_MODULE.md`](docs/DOCS_MODULE.md).

## Dokumentacija ide uz kod (obavezno)

**Izmjena funkcionalnosti povlači izmjenu stranice dokumentacije u istom commitu.** Ako promjena mijenja
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
```

Sve skripte iz `scripts/check-*.mjs` moraju proći prije commita; iste se pokreću i u CI-u.
