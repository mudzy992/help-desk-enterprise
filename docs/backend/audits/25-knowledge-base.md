# Backend audit 25 — `knowledge-base`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,51/10**  
**Nalazi:** 4 P1, 11 P2, 4 P3

## 1. Executive summary

`knowledge-base` pokriva article CRUD, OU+service authorization, owner/reviewer workflow, classification, review freshness, feedback, ticket-create intercept, portal kategorije/FAQ/insights, draft-from-reply, view agregaciju i reminder worker. Pozitivna osnova je jaka: centralizovana visibility funkcija, batch scope resolution, transactional change log za osnovni CRUD/lifecycle, confidential reply zabrana, server-side PII scrub i bounded intercept kandidati.

Baseline je **4,51/10**. Četiri P1 nalaza pogađaju delegaciju, konkurentnost i availability. Direktni owner ili bilo koji aktuelni član owner grupe može pisati bez `knowledge.article.write` i bez aktuelnog OU/service scopea. Dodijeljeni reviewer može čitati/reviewati bez review permission scopea. Article update i svi lifecycle transitioni nemaju version/CAS pa paralelni edit/review/publish/archive može pregaziti sadržaj i auditirati stanje koje nije bilo zaključano. List i portal učitavaju cijeli matching/published korpus bez paginationa, a zatim rade visibility/ranking u memoriji.

Dodatni rizici su arbitrary intercept resolution reference, feedback aggregate race, neatomarni placement/from-reply audit, slug race, review reminder bez batch/reconciliationa, view double-count crash prozor i nepotpun privacy/retention. Nema P0. Popravke nisu implementirane.

## 2. Scope i inventar

- 73 produkcijska TypeScript fajla;
- 12 direktnih specova;
- 6.079 aktuelnih produkcijskih LOC;
- 3 controllera, 8 injectable servisa/komponenti i 1 BullMQ processor;
- Prisma: `KnowledgeArticle`, `KnowledgeFeedback`, `KnowledgeCategory`, `KnowledgeArticleView`, intercept resolution i povezane relacije;
- integracije: authorization/RBAC, OU/service/group/user, tickets, search, problems/playbooks, notifications, privacy, Redis, BullMQ i audit/change-log;
- primarni E2E dokaz: 34; reference 22.

Registarskih 6.152 LOC korigovano je na 6.079, a servisni inventar sa 7 na 8.

## 3. Authorization i delegation model

Create pravilno zahtijeva `knowledge.article.write` u istom OU i service scopeu. Published CONFIDENTIAL zahtijeva agent/admin scoped pristup, RESTRICTED admin scoped pristup, a unpublished je dostupan scoped writer/reviewer/publisheru. Foreign direct ID se odbija.

Međutim owner je zasebni authorization bypass. Ako je `ownerUserId === actor`, `assertCanWriteKnowledgeArticle` dopušta write bez permissiona i bez provjere da je actor i dalje u article OU/service scopeu. Isto važi za svakog aktuelnog člana `ownerGroupId`. Običan USER dodat u owner grupu retroaktivno dobija read/write svih članaka grupe. Promjena grupe mijenja prava bez article-level delegacijskog zapisa.

Reviewer assignment također zaobilazi scoped `knowledge.article.review`: reviewer dobija read i review samo po ID jednakosti. Ako je korisnik premješten, deaktiviran, anonimizovan ili mu je permission ukinut, assignment ostaje aktivan. Delegacija može biti legitimna, ali mora zahtijevati eligible active reviewer/owner, scope kompatibilnost, eksplicitni grant snapshot/revocation i audit.

Published INTERNAL je vidljiv svakom prijavljenom korisniku bez OU/service scopea. To može biti poslovna odluka, ali classification default je INTERNAL i članci mogu sadržati infrastrukturalne procedure. Acceptance politika mora jasno razlikovati company-wide internal od OU/service-internal; inače default treba biti scope-aware.

## 4. CRUD, lifecycle i concurrency

Create normalizuje title/body, validira reference i ownership, alocira slug te u transakciji kreira article i change-log. Publish zahtijeva prethodni review, freshness se računa server-side, archive je permission-gated, a content edit published članka vraća ga u DRAFT/IN_REVIEW.

Model nema `version`, a update/lifecycle koristi `update({id})` nakon ranijeg read/authorization/transition checka. Paralelni zahtjevi mogu:

- oba editovati isti sadržaj i posljednji pregaziti prvi;
- approve/reject/publish/archive odlučivati nad zastarjelim statusom;
- content edit i publish završiti PUBLISHED sa starim ili ne-reviewanim sadržajem;
- change-log `before` opisati stanje koje u trenutku writea više nije aktuelno.

Uvesti version/If-Match i status predicate u istoj transakciji. Review mora biti vezan za content revision/hash, ne samo `lastReviewedAt`.

Slug alokacija je read-before-create. DB unique sprječava duplikat, ali paralelni isti naslov vraća raw unique konflikt umjesto retrya sljedećeg suffixa. Hard delete je SUPER_ADMIN-only i auditiran u transakciji, ali fizički kaskadira feedback/views i uklanja article reference iz drugih domena; retention/tombstone politika nije definirana.

## 5. Liste, search i resource granice

`GET /articles` nema cursor ni limit. Prisma i full-text put učitavaju sve matching ID-eve/recorde, a zatim batch visibility, freshness, votes i labels. Portal `visiblePublished` također učitava cijeli published korpus za home, kategorije i insights. Veliki knowledge corpus zato povećava memoriju, DB rezultat i authorization rad po requestu bez gornje granice.

Search title put je bounded, a intercept ima candidate limit, što su dobri obrasci. Glavni list/portal trebaju cursor-based DB pagination sa scope-pushdownom gdje je moguće, stabilnim orderom i `hasMore/total` ugovorom. Kategorije su također neograničene, iako očekivani broj vjerovatno ostaje mali.

## 6. Intercept i feedback

Intercept traži service, uzima bounded published kandidate, batch-filteruje visibility, rankira query/feedback i vraća ograničen rezultat. Viewer vote je uključen bez otkrivanja drugih user identiteta.

`resolveIntercept` ipak ne učitava authorization context. Provjerava samo existence servicea/OU-a, a optional article samo existence. Signed-in korisnik može zabilježiti resolution za foreign OU/service i unpublished/archived/inaccessible article ID. To truje deflection analytics i može potvrditi existence preko različitog errora. Potrebna je veza sa prethodnim intercept tokenom ili puna scope/visibility/status provjera.

Feedback upsert je DB unique po article+user. Međutim vote write i aggregate recompute nisu jedna transakcija. Paralelni voteovi mogu izračunati različite snapshote i stariji aggregate update može završiti posljednji, ostavljajući `ratingCount/ratingSum` netačnim. Korisnički delete cascade također mijenja vote skup bez očiglednog counter reconciliationa. Koristiti transactional delta, trigger ili periodični exact reconciler.

Low-rating comment sadrži lične podatke; insights vraća komentar writerima/owner grupi prema širokom owner bypassu. Resolution nema audit/event, pa nije dokazivo ko je komentar označio riješenim.

## 7. Portal kategorije, placement i insights

Category key je DB unique, tree je ograničen na root+child, self/cycle/depth i archived parent su provjereni. Archive odbija active child/article. FAQ order je bounded, archived article se ne može placementom uređivati.

Category mutation i audit nisu u istoj transakciji. Placement prvo updateuje article, zatim odvojeno piše change-log. Audit failure ostavlja promjenu uz API grešku i bez historije. Archive guard je count-then-update; paralelni article placement/create može nakon counta vezati active članak i ostaviti arhiviranu kategoriju sa live sadržajem.

Insights koristi `canCurate` kao bilo koji globalno pronađen permission key za ulaz, potom visibility filtriranje. Open feedback comment se vraća samo za writable article, ali owner/group bypass nasljeđuje ranije probleme. Hard limit 50 commenta nema cursor/`hasMore`.

## 8. Article from reply i privacy boundary

Source flow koristi centralni ticket access, zahtijeva staff visibility, eksplicitno odbija confidential ticket i samo AGENT_REPLY. Server ponovo scrubuje edited client title/body, poznate učesnike, email/phone/IP/login i auditira dodatne redakcije. Ovo je snažna zaštita.

PII scrub je ipak heuristic i ne pokriva svaku slobodnu identifikaciju, tajnu, hostname ili prilog/link. Draft mora ostati review-gated, a publish UI treba prikazati source/sanitization warning.

Create article, ticket system event i dodatni audit nisu jedna transakcija. Article može biti kreiran, a ticket trace/audit pasti; retry može napraviti drugi draft jer nema unique `(sourceTicketId,sourceMessageId)` constraint/idempotency key. Dodati DB unique ili command idempotency i compensation/reconciliation.

## 9. Views, counters i Redis recovery

View hot path koristi daily Redis counter + HLL, TTL i DB fallback. Ne čuva viewer identitete u Postgresu; daily unique count je agregat. Counter update izbjegava `updatedAt`, što čuva ordering semantiku.

Flush je namjerno at-least-once: crash poslije DB commita, prije Redis deletea, duplira daily i total views. To je dokumentovano kao analytics tolerancija, ali mora imati idempotent absolute daily upsert ili flush token ako se ranking/insights koristi za odluke. DB fallback svaku posjetu računa kao unique, pa isti user tokom Redis incidenta napuhuje `uniqueViewers`.

Flush dijeli review-reminder schedule. Ako scheduler nestane, pending Redis ključevi ističu za osam dana i views se trajno gube. Potreban je scheduler reconciliation i health za oldest pending day.

## 10. Review reminder i scheduler

Reminder koristi stable per-article/reviewDue/user dedupe i preference policy. Payload je KB-scoped, bez zloupotrebe ticket polja.

Candidate query nema `take`, pagination ili order. Svi due članci se učitavaju odjednom; za svaki owner group radi poseban membership query. Recipient resolver ne filtrira active/anonymized niti aktuelni knowledge permission/scope. Dedupe sprječava duplicate notification, ali ne rješava stalni backlog i orphan ownership.

Scheduler se upisuje samo na module init putem zajedničkog helpera. Redis flush/restart nakon boota nema periodični reconcile do redeploya, a isti job nosi i view flush. Potrebni su scheduler presence, last-success, due backlog, no-recipient i oldest-view-day health signali.

## 11. Audit, privacy i retention

Core create/update/lifecycle/delete koristi transactional knowledge change log. Portal category/placement/from-reply dodatni audit uglavnom je post-write i nije atomaran. Feedback submit/resolve, view i intercept resolution nemaju audit, što je razumljivo za high-volume telemetry, ali low-rating comment resolution i cross-domain article creation trebaju dokaz.

Privacy anonymization pokriva feedback user vezu, ali article body/title mogu sadržati bilo koju osobu koja nije owner/reviewer/source participant. Source ticket/message IDs, feedback comments, notification body i knowledge change-log replike trebaju eksplicitnu retention/anonymization matricu. Nema article/comment/view/change-log retention politike.

## 12. Testovi i E2E

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/knowledge-base -name '*.spec.ts' -print | sort)
```

Rezultat: **2/12 suiteova prošlo, 10/12 compile-blocked; 6/6 izvršenih testova prošlo**. Primarne blokade su nedostajući `generated/prisma/enums` i nepotpun PrismaService (`knowledgeArticle` i povezani delegati). Nije zabilježen assertion failure.

Zeleni su rank i reply PII scrub pure testovi. Compile-blokirani su authorization, lifecycle, feedback, intercept, list filters, visibility batch, portal service/from-reply, freshness i reminder dedupe.

E2E 34 pokriva portal/category/article lifecycle, feedback/view i user deny za create; E2E 22 provjerava accessibility. Ne pokriva owner/group/reviewer scope revoke, concurrent edit/lifecycle, unbounded corpus, forged intercept resolution, rating race, from-reply idempotency, view flush crash, scheduler loss ni retention.

## 13. Pozitivni nalazi

1. Strict DTO validation i session guards.
2. Centralni OU+service authorization evaluator.
3. Batch visibility uklanja per-row N+1.
4. Classification i unpublished visibility su eksplicitni.
5. Core mutation + change-log transakcije.
6. Publish zahtijeva review i review due/freshness.
7. DB unique slug i feedback user/article.
8. Bounded deterministic intercept candidates.
9. Confidential ticket i non-public reply su odbijeni.
10. Server-side second-pass PII scrub i redaction audit.
11. Category depth/cycle/archive pravila.
12. Redis HLL/counter TTL i DB fallback.
13. Stable reminder dedupe key i KB payload.
14. Svih 6 izvršenih testova je zeleno.

## 14. Registar nalaza

| ID                   | Severity | Nalaz                                                                                     | Status   |
| -------------------- | -------- | ----------------------------------------------------------------------------------------- | -------- |
| BA-knowledge-base-01 | P1       | Owner i owner-group član pišu bez knowledge permissiona i aktuelnog OU/service scopea    | zatvoreno |
| BA-knowledge-base-02 | P1       | Reviewer assignment daje read/review bez aktuelnog permission scopea i revoke lifecyclea | zatvoreno |
| BA-knowledge-base-03 | P1       | Article edit/lifecycle nema version/CAS ni review vezan za content revision               | zatvoreno |
| BA-knowledge-base-04 | P1       | Article list i portal učitavaju neograničen matching/published korpus                     | zatvoreno |
| BA-knowledge-base-05 | P2       | INTERNAL default je company-wide read bez OU/service granice                              | zatvoreno |
| BA-knowledge-base-06 | P2       | Intercept resolution prihvata foreign scope i hidden/unpublished article ID               | otvoreno |
| BA-knowledge-base-07 | P2       | Feedback write + aggregate refresh nije atomski i counter može zastarjeti                 | otvoreno |
| BA-knowledge-base-08 | P2       | From-reply article/event/audit nije idempotentan ni atomaran                              | otvoreno |
| BA-knowledge-base-09 | P2       | Placement/category mutation nije atomska sa auditom/change-logom                          | otvoreno |
| BA-knowledge-base-10 | P2       | Category archive guard je TOCTOU prema paralelnom article placementu                      | otvoreno |
| BA-knowledge-base-11 | P2       | Slug alokacija je read-before-create bez conflict retry ugovora                           | zatvoreno |
| BA-knowledge-base-12 | P2       | Reminder query je unbounded i recipients ne provjeravaju active/scope eligibility         | otvoreno |
| BA-knowledge-base-13 | P2       | Scheduler nema Redis-loss reconciliation; njegov gubitak ugrožava i view flush           | otvoreno |
| BA-knowledge-base-14 | P2       | Privacy/retention ne pokriva slobodni tekst, source, comments, notifications i change-log | otvoreno |
| BA-knowledge-base-15 | P2       | Hard delete kaskadno uklanja feedback/views bez formalne tombstone/retention politike     | otvoreno |
| BA-knowledge-base-16 | P3       | View flush crash može duplirati totals; DB fallback napuhuje unique viewers               | otvoreno |
| BA-knowledge-base-17 | P3       | Insights comments hard-limit 50 i category/list API nemaju cursor/hasMore                 | otvoreno |
| BA-knowledge-base-18 | P3       | Comment resolution nema audit, actor ni optimistic state                                 | otvoreno |
| BA-knowledge-base-19 | P3       | Deset suiteova je compile-blocked; nedostaje concurrency/failure E2E matrica              | otvoreno |

## 15. Ključne korekcije

- **01–02:** owner/reviewer kao eksplicitna, eligible, scoped i auditirana delegacija sa revoke/expiry pravilom.
- **03:** article version/content revision, If-Match/CAS i review vezan za tačan revision hash.
- **04, 17:** DB pagination/scope pushdown, cursor/hasMore i bounded portal/insights.
- **05:** publika `INTERNAL` je eksplicitna postavka (default scope-aware: OU/servis dodjela ili matična
  jedinica), a company-wide je svjesno uključenje.
- **06:** signed intercept context ili puna service/OU/article visibility/status provjera.
- **07:** transactional counter delta/trigger i exact reconciliation nakon user deletea.
- **08:** unique source message/idempotency command i atomarni/reconciled ticket trace.
- **09–11:** transakcijski portal audit, category locking i slug conflict retry.
- **12–13:** bounded reminder batches, eligible recipients, scheduler reconcile i health.
- **14–16,18:** retention/anonymization matrica, tombstone odluka, idempotent view flush i comment-resolution audit.
- **19:** regenerated Prisma client i Postgres/Redis/concurrency/fault testovi.

## 16. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   6,00 |
| B. API i ugovori             |    12% |   5,00 |
| C. Auth/authz/scope          |    15% |   4,10 |
| D. Poslovna pravila/stanje   |    13% |   5,00 |
| E. Podaci/Prisma/transakcije |    13% |   4,20 |
| F. Sigurnost/privatnost      |    12% |   4,50 |
| G. Async/integracije         |     8% |   4,00 |
| H. Testovi/dokazivost        |    10% |   3,40 |
| I. Operativnost/perf.        |     7% |   4,20 |
| **Ukupno**                   | **100%** | **4,51/10** |

Ponderisani zbir je 4,505, zaokružen na **4,51/10**. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 17. Fazni plan

### Faza 0 — safety net

Owner/group/reviewer revoke; concurrent edit/review/publish; 10k articles; forged intercept resolution; concurrent ratings; duplicate from-reply; category archive race; Redis flush/crash; reminder no-recipient.

### Faza 1 — authorization i concurrency

Scoped delegation eligibility/revoke, INTERNAL policy odluka, version/revision/CAS i review hash.

### Faza 2 — bounded read i analytics integrity

Paginated article/portal reads, intercept resolution binding, atomic rating counter i comment audit.

### Faza 3 — portal transaction i idempotency

From-reply source unique/idempotency, transactional trace/audit, placement/category locking i slug retry.

### Faza 4 — scheduler, views i privacy

Reminder batching/recipient filter, scheduler self-heal, idempotent view flush, retention/tombstone/anonymization replike.

### Faza 5 — finalni gate

Regenerisan Prisma client; svih 12 suiteova; Postgres concurrency, Redis restart/flush, privacy i E2E 34/22 na finalnom SHA-u.

## 18. Acceptance i konačna presuda

1. Owner/reviewer delegacija ne nadživljava eligibility, scope ili revoke.
2. Review/publish je vezan za tačnu content revision i concurrent write vraća conflict.
3. Nijedan read ne učitava neograničen corpus.
4. INTERNAL visibility je eksplicitno odobrena politika ili scope-aware.
5. Intercept/feedback/view analytics su authorization-safe i eventualno tačni.
6. From-reply je idempotentan, traceable i privacy-reviewable.
7. Category/placement/slug invarianti opstaju pod paralelnim writeovima.
8. Reminder/view scheduler se sam oporavlja nakon Redis gubitka.
9. Retention/anonymization pokriva article, source, feedback, notification i log replike.
10. Svih 12 direktnih suiteova i failure/concurrency E2E prolaze.

Modul ima zrelu funkcionalnu osnovu i posebno dobar reply-scrub/visibility temelj, ali delegation bypass, nepostojanje revision concurrencyja i neograničeni read putevi sprečavaju enterprise ocjenu. Iskren ponderisani baseline je **4,51/10**.

## 19. Implementacijski closeout — W7.49 (`BA-knowledge-base-01`)

Na `c017aa1`, uz zeleni CI `44476675905`, vlasništvo je ponovo delegacija, a ne zaobilaznica: novi
`isKnowledgeDelegationInScope()` provjerava da delegate **još ima** assignment koji pokriva OU putanju i servis
samog članka (`decideAuthorizationAccess`, bez role/permission zahtjeva), a `isKnowledgeArticleOwner()` vraća
`false` van tog scopea. Write, read, lista, portal i search idu kroz istu funkciju, pa premještaj, promjena
service scopea ili uklanjanje iz owner grupe prekidaju delegaciju na **sljedećem** zahtjevu. Globalni `USER`
assignment ne pokriva nijednu OU (namjerno u `doesOrganizationalUnitScopeCover`), pa običan korisnik dodat u
owner grupu više ne dobija korpus grupe. Revoke je auditabilan tamo gdje se dešava: `groups` bilježi
`groupMemberAdded`/`groupMemberRemoved`, a promjena vlasnika ostaje u change-log diffu članka. Nema migracije —
nema nove tabele delegacije. Reviewer delegacija ostaje `BA-knowledge-base-02` (sljedeći P1); grant snapshot/expiry
na nivou članka traži novu tabelu i ostaje predmet odluke. Dokaz:
[270-w749-knowledge-base-01-owner-delegation-scope.md](../implementation/270-w749-knowledge-base-01-owner-delegation-scope.md).

## 20. Implementacijski closeout — W7.50 (`BA-knowledge-base-02`)

Na `fcfce5b`, uz zeleni CI `44485659347`, reviewer delegacija ima isti životni vijek kao vlasništvo:
`isKnowledgeArticleReviewer()` prvo provjerava OU/service scope članka (`isKnowledgeDelegationInScope`) i tek
onda ID jednakost, pa premještaj u drugi OU, promjena service assignmenta ili `reviewerUserId = null` prekidaju
read/review na sljedećem zahtjevu. Read, `GET /search`, lista i approve/reject dijele tu provjeru; scoped
`knowledge.article.review` i dalje radi za menadžera koji nije dodijeljeni reviewer. Nema migracije.
Isti gate je pritom morao biti popravljen u supply-chain sloju: pinovani `node:22-alpine` digest je zamijenjen
novijim (rješava node CVE-2026-123864/123865/123866/123872), a `libssl3`/`libcrypto3` su u runtime stageu
podignuti na zakrpljeni Alpine build (CVE-2026-95691/95692/107496/88823) — bez toga nijedan naredni paket ne bi
mogao proći gate. Dokaz:
[271-w750-knowledge-base-02-reviewer-delegation.md](../implementation/271-w750-knowledge-base-02-reviewer-delegation.md).

## 21. Implementacijski closeout — W7.51 (`BA-knowledge-base-03`, `BA-knowledge-base-11`)

Na `be3a5fb`, uz zeleni CI `44490811652`, edit i sve lifecycle akcije imaju revision token i transakcijski
compare-and-set: `updateMany({ id, status, updatedAt })` sa provjerom `count === 1` i `findUniqueOrThrow` u
istoj transakciji, a opcioni `If-Match` header (`updatedAt`) daje ranu 409 `STALE_WRITE` prije ijedne
autorizacijske provjere. Predikat nosi i `status`, pa odluka donesena nad zastarjelim statusom pada kao
konflikt umjesto tihe promjene, a change-log `before` više ne može opisati stanje koje je u međuvremenu
izmijenjeno. Review je vezan za tačan sadržaj: svaka promjena sadržaja čisti `lastReviewedAt` (i u `IN_REVIEW`),
pa approve → izmjena teksta → publish završava na `PUBLISH_REVIEW_REQUIRED` dok se novi tekst ne odobri;
izmjena samo metapodataka review ne gasi. Slug alokacija više ne vraća sirov unique konflikt: `P2002` pokreće
retry cijele transakcije sa sljedećim slobodnim suffixom (do tri pokušaja, pa `SLUG_TAKEN`), a putanja sa
pozivaočevom transakcijom prevodi `P2002` u `SLUG_TAKEN`. Nema migracije — `updatedAt` je postojeći token;
preostali milisekundni prozor i eventualna `version` kolona navedeni su u closeoutu kao otvoren rizik koji
traži odobrenje. Dokaz:
[272-w751-knowledge-base-03-cas-and-review-binding.md](../implementation/272-w751-knowledge-base-03-cas-and-review-binding.md).

## 22. Implementacijski closeout — W7.52 (`BA-knowledge-base-04`)

Na `1703639`, uz zeleni CI `44509139382`, nijedan read baze znanja više ne učitava neograničen korpus.
`GET /articles` je keyset stranica `(updatedAt desc, id asc)` sa `limit` 1..100, neprozirnim cursorom i
`{ items, hasMore, nextCursor }` ugovorom; `total` namjerno nema jer bi egzaktan total nad autorizacijski
filtriranim skupom tražio uklonjeni neograničeni skan. Zahtjev čita najviše 200 redova (4 batcha × 50) i nad tim
prozorom radi batch vidljivost, a `staleOnly` je predikat **unutar** skana (ranije je filter poslije rezanja
stranice mogao vratiti praznu stranicu uz `hasMore: true`). Full-text put je offset-straničen i tvrdo ograničen
na 1000. Portal kategorija je stranica (default 20), a home/insights rade nad capom od 200 uz eksplicitni
`articleCountsComplete` flag i UI napomenu da su brojevi donja granica; Teams kartica pretrage prikazuje
„Prikazano N; ima još rezultata.“ umjesto nepoznatog totala. Vidljivost je namjerno ostala jedna odluka
(`canReadKnowledgeArticle`) umjesto duplirana u SQL-u — granica je rad po zahtjevu, ne upit. Nema migracije.
Dokaz: [273-w752-knowledge-base-04-bounded-paged-reads.md](../implementation/273-w752-knowledge-base-04-bounded-paged-reads.md).

## 23. Implementacijski closeout — W7.79 (`BA-knowledge-base-05`)

Na `7f182f9`, uz CI `44927782122`, `INTERNAL` više nije publika koju je neko dobio ne birajući je. Grana
`return true` zamijenjena je politikom instalacije: `private.knowledgeBase.visibility.internalCompanyWide`
(boolean, obavezan, **default `false`**). Isključeno drži objavljeni interni članak unutar njegove granice, i to sa
**dvije** strane: osoblje čija dodjela pokriva OU putanju **i** servis članka (`isKnowledgeDelegationInScope`,
ista provjera kao za vlasnika/reviewera) i djelatnici čija matična jedinica pokriva jedinicu članka
(`doesOrganizationalUnitScopeCover`, jedinica i podstablo, **bez permisije**) — drugi put je ono što samoposlužni
portal drži funkcionalnim. Uključeno je staro company-wide ponašanje, sada kao svjesna odluka koju ekran postavki
objašnjava i preporučuje da ostane isključena. `CONFIDENTIAL` i `RESTRICTED` nisu dirani: postavka govori samo o
`INTERNAL`.

Politika putuje do svake čitalačke površine. `loadKnowledgeArticleVisibilities` i `isKnowledgeArticleVisibleTo`
primaju `KnowledgeArticleVisibilityPolicy` (nema defaulta; `companyWideKnowledgeVisibilityPolicy` postoji samo za
testove koji pinuju staru publiku), a `ListKnowledgeArticlesOptions.configuration`,
`searchKnowledgeArticleTitles` `input.configuration` i `getKnowledgeArticle(..., configuration)` su obavezni —
novi poziv se ne može napisati a da ne imenuje publiku. Intercept, feedback i portal (`publishedScan`, straničena
kategorija, `recordView`) prosljeđuju istu konfiguraciju; `searchTitles` i `recordView` je zbog toga učitavaju
(prvi put asinhrono u servisu). Matična jedinica čitaoca se čita **najviše jednom po batchu** i samo kad je
politika scope-aware **i** batch sadrži objavljeni `INTERNAL` red — company-wide stranica i stranica bez internih
članaka ne plaćaju ništa, a čitalac bez matične jedinice dobija `null` (nema implicitnog pristupa). Fallback
loadera je `defaultKnowledgeBaseConfiguration`, dakle isključeno: pad postavki ne može proširiti publiku.
Dokaz: novi `knowledge-base.internal-audience.spec.ts` (**9 testova** — company-wide, odbijeni requestor bez
matične jedinice, matična jedinica roditelja i tačna jedinica bez permisije, bratska jedinica zatvorena, IT agent
kroz delegaciju i HR agent odbijen, nacrt skriven i uz company-wide, `CONFIDENTIAL`/`RESTRICTED` netaknuti,
single/batch paritet i brojanje `findUnique` 1/0/0), `modules/knowledge-base` **20 suite/102 testa**, `settings` +
install sekcije **31/140**, frontend i18n čuvari **4 fajla/32 testa** uz katalog **519 → 520**. Nema migracije;
promjena ponašanja je namjerna i dokumentovana, a instalacija koja je živjela company-wide uključi postavku.
Dokaz: [300-w779-knowledge-base-05-internal-audience.md](../implementation/300-w779-knowledge-base-05-internal-audience.md).
