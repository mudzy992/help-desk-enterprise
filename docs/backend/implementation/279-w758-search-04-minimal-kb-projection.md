# Package closeout — W7.58

**Paket:** W7.58 — KB query učitava cijeli red i hidden `body` prije visibility odluke (minimalna projekcija)<br>
**Nalaz:** `BA-search-04` (P2) — **zatvoren**<br>
**Kodni commit:** `156bb1b`<br>
**Finalni testani SHA:** `156bb1b`<br>
**CI:** [`44548447003`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44548447003) — zelen (11m11s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `27-search.md` §5 (i §11): article grana `GET /search` pozivala je `prisma.knowledgeArticle.findMany`
**bez `select`**, pa je svaki kandidat stizao kao **cijeli red** — uključujući `body` (do 20.000 znakova), te
`categoryId`, `isFaq` i sve countere. Vidljivost se odlučivala **poslije** čitanja, pa je tekst članka koji actor
ne smije vidjeti ipak bio materijalizovan u procesu (Prisma klijentski bafer, eventualni debug/log dump, heap
snapshot). Nije se serializovalo u odgovor, ali privacy blast radius je bio širi od potrebnog.

Acceptance (audit §14.4): **hidden article body se ne učitava prije authorization odluke.** Uz to, acceptance
W7.57 paketa mora ostati netaknut: ista vidljivost kao lista, isti redoslijed, isti `incomplete` ugovor.

## Implementacija

- **Nova projekcija** `search-knowledge-article-projection.ts`: `knowledgeArticleTitleSearchSelect` navodi tačno
  jedanaest kolona — tri izlazne (`id`, `slug`, `title`), sedam koje predikat čita (`status`, `classification`,
  `organizationalUnitId`, `serviceId`, `ownerUserId`, `ownerGroupId`, `reviewerUserId`) i poziciju keyset-a
  (`updatedAt`). Tip `KnowledgeArticleTitleSearchRow` opisuje šta upit vraća, pa kolona ne može „uskočiti” u
  čitanje slučajno.
- **Upit nosi `select`**: `search-knowledge-article-titles.ts` više ne radi `toArticleRecord` nad punim redom;
  `findMany` ide sa projekcijom, a `where`/`orderBy`/`take` i keyset nastavak ostaju isti kao u W7.57. `body` se
  **nikad ne šalje u upit**, pa nevidljivi kandidat nema šta da materijalizuje.
- **Predikat je tipiziran projekcijom, ne punim redom**: novi `KnowledgeArticleVisibilityRecord`
  (`knowledge-base.types.ts`) je `Pick` tačno onih kolona koje odluka čita. `canReadKnowledgeArticle`,
  `isKnowledgeArticleOwner`, `isKnowledgeArticleReviewer` i `loadKnowledgeArticleVisibilities` primaju taj tip;
  `KnowledgeArticleRecord` mu ostaje **strukturno kompatibilan**, pa svi postojeći pozivaoci (lista, intercept,
  mutacije) rade nepromijenjeno. Time je projekcija dio ugovora: funkcija koja bi zatražila `body` ne bi se
  kompajlirala.
- **Testni double poštuje `select`**: `create-in-memory-knowledge-article-delegate.ts` `findMany` sada vraća
  samo tražene kolone (kao Prisma). Bez toga bi double vraćao `body` koji upit nije tražio i test „tekst se ne
  čita” ne bi dokazivao ništa.
- **Bez promjene `/search` ugovora**: `ArticleSearchMatch` je i dalje `{ id, slug, title }`, `articlesIncomplete`
  iz W7.57 ostaje, frontend se ne mijenja.
- **Bez migracije** — promjena je u čitanju, ne u šemi; indeks nad `title` je i dalje `BA-search-07`.

### Namjerne odluke (trade-off)

1. **Jednofazno čitanje sa projekcijom, ne dvofazno (ID-evi → pa tijela).** Za `/search` je projekcija dovoljna:
   odgovor ionako nema tekst, pa nema razloga za drugi upit. Dvofazno čitanje bi bilo potrebno tamo gdje se
   `body` **vraća** (lista, detalj) — a to je posao KB modula, ne ovog endpointa (vidi „Preostali rizik”).
2. **Projekcija je eksplicitna lista kolona, ne `omit`.** `omit` bi automatski uključio svaku buduću kolonu —
   npr. novi slobodni tekst — pa bi zaštita tiho oslabila pri sljedećoj migraciji. Eksplicitna allowlista
   zahtijeva svjesnu odluku.
3. **Sužavanje tipa predikata, ne kopija predikata.** Alternativa je bila „search verzija” autorizacije sa
   manje polja — tačno ono što audit 25/`BA-search-06` kritikuju (dva pravila koja se razilaze). Zato je
   promijenjen **tip ulaza** postojeće funkcije, a ne funkcija.
4. **`slug` i `updatedAt` su dio projekcije iako nisu „vidljivost”.** `slug` je izlaz (link/podnaslov u paleti),
   `updatedAt` je keyset pozicija; bez njih bi W7.57 šetnja tražila drugi upit po batchu.
5. **Nema `select`-a u listi/interceptu.** Njihov izlaz sadrži tijelo za vidljive redove, pa minimalna
   projekcija tamo zahtijeva dvofazni read i vlastiti dokaz — svjesno van opsega ovog paketa.

## Dokaz

- **Novi `search-knowledge-article-projection.spec.ts` (4 testa)**: (1) `select` ima tačno 11 navedenih kolona
  i **nema** nijednu sadržajnu (`body`, `categoryId`, `isFaq`, `faqOrder`, `ratingCount`, `ratingSum`,
  `viewCount`, `sourceTicketId`, `sourceMessageId`); (2) **paritet odluka**: za 7 aktera × 7 članaka (INTERNAL /
  CONFIDENTIAL / RESTRICTED / DRAFT / druga jedinica / vlasnik / recenzent) `canReadKnowledgeArticle(full)` ===
  `canReadKnowledgeArticle(projekcija)` — projekcija ne mijenja nijednu odluku; (3) **paritet batch provjere**:
  `loadKnowledgeArticleVisibilities` vraća isti skup ID-eva za pune redove i za projekciju, za 5 aktera;
  (4) canary `body` iz projekcije ne postoji, a članak je i dalje dozvoljen (ništa nije skriveno sužavanjem).
- **`search-knowledge-article-titles.spec.ts` (11 testova, +1)**: novi test „nikad ne čita tekst kandidata koji
  ne smije prikazati” — `CONFIDENTIAL` članak druge jedinice sa canary tijelom, vidljivi članak pored njega;
  svaki `findMany` poziv nosi projekciju bez `body`, odgovor sadrži tačno `id`/`slug`/`title`, a serijalizovan
  rezultat ne sadrži canary. Batching test sada provjerava i `select` u svakom od 3 batcha. Preostalih 10
  testova (skriveni pogoci, budget, tie-breaker, arhiva, paritet sa listom) prolazi nepromijenjeno.
- Lokalno: backend `src/modules/knowledge-base` + `src/modules/search` **22 suite / 128 testova** zeleno;
  `npx tsc --noEmit` — **nula novih grešaka** (ukupan broj grešaka identičan kao prije paketa; jedine dvije u
  diranom direktoriju su pre-egzistirajuće `implicit any` greške Prisma stuba u `load-knowledge-article-scope.ts`);
  `eslint` nad svih 9 diranih fajlova čist. Frontend nije diran (ugovor nepromijenjen).

## CI

- [`44548447003`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44548447003) na `156bb1b` —
  **success** (14:52:19Z–15:03:30Z, 11m11s): backend build/lint/full Jest, PostgreSQL + Redis integracija,
  frontend lint/format/testovi/build/bundle budget, Docs guard, container/supply-chain i CI gate. E2E install
  wizard, E2E critical flows i read-only inventory bili su `skipped` (E2E pokreće korisnik, po dogovoru).
- Prvi i jedini pokušaj; nije bilo ispravki poslije pusha.

## Registar nalaza

- Zatvoreni: `BA-search-04` (P2).
- Ostaju otvoreni u `27-search.md`: 9 nalaza, **P1: nema** — P2: `BA-search-05` (rate
  limit/anti-enumeration), `06` (KB owner/reviewer scope), `07` (query plan), `08` (partial/fail-closed
  ugovor); P3: `09` (stable order korisnika), `10` (`ArrayUnique`), `11` (telemetrija), `12`
  (confidential/arhiva test), `13` (E2E za `/search`).

## Migracija, rollout i rollback

Nema migracije; nema promjene API ugovora, pa nema koordinacije sa klijentima. Rollback: revert `156bb1b`
vraća čitanje punog reda (i `toArticleRecord`) — ponašanje odgovora ostaje isto, vraća se samo širi privacy
blast radius.

**Preostali rizik (dokumentovan):** (1) **lista i intercept i dalje čitaju tijelo prije odluke** — njihov izlaz
sadrži `body`, pa bi projekcija tražila dvofazni read (vidljivost → tijela za dozvoljene ID-eve); to je posao
KB modula (audit 25), ne `/search`-a, i ostaje otvoreno kao zaseban paket; (2) `contains` nad `title` nema
indeks (`BA-search-07`), pa je i projekcija samo `SELECT` lista kolona nad istim seq/index scanom; (3) rate
limit (`BA-search-05`) nije dio paketa, pa 200-redni scan ostaje ponovljiv teret; (4) `knowledge.article.read`
delegacija (owner/reviewer) naslijeđena iz audita 25 ostaje `BA-search-06`.

## Sljedeći paket

Sljedeći P2 u `27-search.md` je `BA-search-05` (endpoint nema server-side rate limit ni anti-enumeration
zaštitu) — otvara se kao W7.59.
