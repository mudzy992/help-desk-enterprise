# Package closeout — W7.51

**Paket:** W7.51 — optimistička konkurencija za edit i lifecycle + review vezan za tačan sadržaj + slug retry<br>
**Nalaz:** `BA-knowledge-base-03` (P1) — **zatvoren**; uz njega `BA-knowledge-base-11` (P2, slug retry ugovor) — **zatvoren**<br>
**Kodni commit:** `98c9f39` (logika) + `6b43e63`/`be3a5fb` (CI korekcije)<br>
**Finalni testani SHA:** `be3a5fb`<br>
**CI:** [`44490811652`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44490811652) — zelen (13m15s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `25-knowledge-base.md` §4: model nema `version`, a update i sve lifecycle akcije rade `update({ id })`
nakon ranijeg reada, autorizacije i transition checka. Dva paralelna zahtjeva mogu oba proći provjeru i drugi
pregazi prvi: sadržaj, status, `publishedAt` i change-log `before` opisuju stanje koje u trenutku writea više
nije aktuelno. `lastReviewedAt` je bio jedini dokaz reviewa i **nije se čistio** kad se sadržaj članka u
`IN_REVIEW` statusu promijeni, pa je approve → izmjena teksta → publish objavljivao tekst koji reviewer nije
vidio. Slug alokacija je read-before-create: paralelni isti naslov vraćao je sirov unique konflikt (HTTP 500)
umjesto sljedećeg suffixa.

Acceptance: (1) edit/lifecycle mora imati revision token i status predicate **u istoj transakciji**; (2) review
mora biti vezan za tačan sadržaj koji je odobren, ne samo za `lastReviewedAt`; (3) paralelni slug konflikt mora
ići na retry sljedećeg suffixa umjesto sirove unique greške; (4) bez migracije i bez odobrenja za istu.

## Implementacija

- **Revision token bez nove kolone.** `knowledgeArticleRevisionOf()` vraća `updatedAt` kao ISO string; Prisma ga
  sama osvježava na svakom upisu, pa je to stabilan `If-Match` token i nema schema promjene ni migracije.
  `normalizeKnowledgeArticleRevision()` prihvata golu vrijednost, `"…"` i `W/"…"` formu (klijent može poslati
  bilo koju), a prazan header se tretira kao „nema uslova“.
- **`If-Match` na svih šest write ruta.** `readKnowledgeIfMatch()` čita header u `PATCH /articles/:id` i u svih
  pet lifecycle `POST`-ova (`submit-review`, `approve-review`, `reject-review`, `publish`, `archive`) i prosljeđuje
  ga kao `expectedRevision` (DTO-i su nepromijenjeni — vrijednost dolazi iz headera, ne iz body-ja).
  `assertKnowledgeArticleRevision()` baca `STALE_WRITE` prije ijedne provjere scopea/transitiona;
  `mapKnowledgeBaseError()` to prevodi u **409 Conflict**.
- **Compare-and-set u transakciji.** I `updateKnowledgeArticle` i `persistStatusChange` (koji dijele sve
  lifecycle akcije) sada pišu kroz

  ```ts
  const changed = await transaction.knowledgeArticle.updateMany({
    where: { id, status: current.status, updatedAt: current.updatedAt },
    data,
  });
  if (changed.count !== 1) throw new KnowledgeBaseError('STALE_WRITE');
  const updated = await transaction.knowledgeArticle.findUniqueOrThrow({ where: { id } });
  ```

  Predikat sadrži i `status`, pa odluka donesena nad zastarjelim statusom (npr. approve nad člankom koji je
  neko u međuvremenu objavio) pada kao konflikt, a ne kao tiha promjena. Change-log se piše u istoj transakciji
  kao i prije, sada sa `before` stanjem koje je zaista bilo u bazi.
- **Review je vezan za sadržaj.** `updateKnowledgeArticle` čisti `lastReviewedAt` na **svaku** promjenu sadržaja,
  ne samo kad je članak `PUBLISHED`. Pošto `publish` traži neprazan `lastReviewedAt`, lanac
  approve → izmjena teksta → publish sada završava sa `PUBLISH_REVIEW_REQUIRED` (400) dok se novi tekst ne
  odobri; ponovni approve vraća objavu. Izmjena samo metapodataka (npr. `reviewerUserId`) **ne** gasi review.
  Time je invarijanta „objavljeni tekst je tekst koji je reviewer odobrio“ provjerena kroz `lastReviewedAt`,
  bez nove kolone za hash.
- **Slug retry.** `createKnowledgeArticle` ponavlja **cijelu transakciju** na Prisma `P2002` (u Postgresu pad
  statementa abortuje transakciju, pa retry unutar nje nije moguć), do
  `knowledgeBaseConstants.slugAllocationAttempts = 3`, i svaki put realocira sljedeći slobodan suffix. Kad su
  pokušaji iscrpljeni → `SLUG_TAKEN` (400). Kad pozivalac daje svoju transakciju („article from reply“), retry
  ostaje na pozivaocu, ali se i tamo `P2002` prevodi u `SLUG_TAKEN` umjesto sirove greške.
- **In-memory double.** `create-in-memory-knowledge-article-delegate.ts` sada podržava `updateMany` (sa `id`,
  `status` i `updatedAt` predikatom) i `findUniqueOrThrow`, a `updatedAt` se pomjera za 1 ms na svaki upis —
  bez toga bi harness uvijek vraćao isti token i konflikt se ne bi mogao dokazati.
- **Frontend.** `updateKnowledgeArticle(..., expectedRevision)` i `runKnowledgeLifecycleAction(..., expectedRevision)`
  šalju `If-Match` iz učitanog reda (`article.updatedAt` / `item.updatedAt`); 409 se mapira na novi
  `knowledgeBase.errorConflict` (bs: „Članak je u međuvremenu izmijenjen. Osvježite stranicu i pokušajte
  ponovo.“, en ekvivalent) u postojećem inline prikazu greške.

## Direktni testni dokaz

- `knowledge-base.concurrency.spec.ts` (9 testova, novo):
  1. normalizacija `If-Match` formi (gola, citirana, `W/`, prazna);
  2. `STALE_WRITE` → HTTP 409 sa istim kodom u tijelu;
  3. revision mismatch baca `STALE_WRITE`, a odsutan header prolazi;
  4. prvi od dva edita prolazi, drugi sa zastarjelim tokenom pada, a sadržaj ostaje prvi (bez pregaženja);
  5. trenutni token prolazi i `updatedAt` raste nakon svakog upisa;
  6. lifecycle odluka sa zastarjelim tokenom pada na 409, a članak ostaje `IN_REVIEW`;
  7. approve → izmjena teksta → publish je odbijen (`PUBLISH_REVIEW_REQUIRED`), re-approve pa publish prolazi;
  8. paralelni create koji uzme slug prvo → retry na `reset-vpn-password-3`;
  9. izmjena samo metapodataka čuva `lastReviewedAt`.
- Ostatak modula prolazi bez izmjena: **15 suiteova / 63 testa** (`src/modules/knowledge-base`).
- Frontend: `tsc` čist, `eslint` čist za izmijenjene fajlove, **460 fajlova / 1820 testova** zeleno; novi
  test u `map-knowledge-article-error.spec.ts` pokriva `409`/`STALE_WRITE` mapiranje.

## CI i testni dokaz

CI run [`44490811652`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44490811652) na `be3a5fb`
(2026-11-19T09:22Z → 09:35Z):

- **Backend build + test / PostgreSQL + Redis integration / Frontend build + test / Docs guard / CI gate:** uspješno.
- **Backend container + supply chain:** uspješno (digest i openssl floor iz W7.50 ostaju netaknuti).
- **Skipped:** `Read-only service-form pattern inventory`, `E2E critical flows`, `E2E install wizard`.
- **Neuspjeli pokušaji (dokumentovano, sa uzrokom i korekcijom):**
  1. `44489230052` na `98c9f39` — `nest build`: `submitFeedback` je izgubio treći argument (actor context) kad je
     uz `If-Match` uklonjen nekorišteni `@Req()`; ista greška je oborila i image build u container jobu.
     Korekcija `6b43e63`.
  2. `44489938377` na `6b43e63` — type check: `AuthenticatedHttpRequest.headers` nije deklarisao `if-match`
     (TS7053/TS18048). Korekcija `be3a5fb` proširuje tip headera.
  3. `44490811652` na `be3a5fb` — **zelen**.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-03` (P1) i `BA-knowledge-base-11` (P2, slug retry ugovor — acceptance tog
  nalaza je upravo „retry sljedećeg suffixa“, isporučen ovdje).
- Ostaju otvoreni u `25-knowledge-base.md`: 15 nalaza, **P1: `04`**.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene: revision token je postojeći `updatedAt`. Nema novih ruta; jedina
ugovorna promjena je opcioni `If-Match` header (klijent bez njega i dalje dobija transakcijski CAS, samo bez
rane 409 provjere) i novi kod greške `STALE_WRITE`. Rollout ne zahtijeva backfill ni koordinaciju: stari
klijenti nastavljaju raditi, a paralelni upis sada vraća 409 uz poruku „osvježite i pokušajte ponovo“.
Rollback: revert `98c9f39` vraća bezuslovni `update({ id })` i staro ponašanje `lastReviewedAt`; nema
podataka za vraćanje jer nema nove kolone.

**Preostali rizik (dokumentovan, ne zatvoren ovim paketom):** `updatedAt` je token sa milisekundnom
rezolucijom, pa teoretski dva upisa u istoj milisekundi mogu imati isti token; status predicate u istom
`WHERE`-u to svodi na isti-`status` slučaj. Ako se i taj prozor mora eliminisan tj. dokazati, traži se nova
kolona `version Int @default(0)` — to je migracija i traži izričito odobrenje. Portal placement
(`BA-knowledge-base-09`), category archive TOCTOU (`BA-knowledge-base-10`), comment resolution
(`BA-knowledge-base-18`) i hard delete kaskada (`BA-knowledge-base-15`) nisu dio ovog paketa.

## Sljedeći paket

**W7.52 — `BA-knowledge-base-04` (P1):** article list i portal učitavaju neograničen matching/published korpus.
Nije započet prije zelenog gatea za ovaj paket.
