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

Insights koristi `canCurate` kao bilo koji globalno pronađen permission key za ulaz, potom visibility filtriranje. Open feedback comment se vraća samo za writable article, ali owner/group bypass nasljeđuje ranije probleme. W7.90 je uklonio tihi rez: `openComments` je strana (`hasMore` + keyset cursor po `(createdAt desc, id desc)`), `GET insights/comments` daje sljedeću stranu, a `GET categories` vraća stranu korijena sa djecom (`limit`/`cursor`, `categoriesComplete` na home-u). Preostaje nevidljivost komentara van bounded scana — dokumentovana, ne skrivena.

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

**Status poslije W7.89 (§34):** flush pregleda je idempotentan (dnevni red je apsolutno stanje, delta za total, brava nad redom članka (`FOR UPDATE`)), a Redis-less put broji pregled i **ne** izmišlja posjetioce. Vidi §34.

**Status poslije W7.88 (§33):** brisanje članka je kapija + tombstone: samo `ARCHIVED` ili nikad objavljen članak se briše, a brisanje ostavlja revizorski zapis bez sadržaja (sa brojevima feedbacka i pregleda) i change-log trag koji `knowledgeContent` retention sada doseže i poslije brisanja. Vidi §33.

**Status poslije W7.87 (§32):** matrica je eksplicitna i izvršna. Novi `knowledgeContent` retention period redaktuje arhivirane članke (marker u `title`/`body` uz rebuild `searchVector`, `null` source pokazivači, ispražnjeni komentari, obrisani stari dnevni pregledi, marker u change-logu i `body: null` u notifikacijama), a anonymizacija sada pokriva članke koje osoba posjeduje/pregleda ili ih tekst imenuje, tuđe komentare koji je imenuju, notifikacije, change-log replike, izvorne pokazivače i `KnowledgeInterceptResolution`. Ostaje dokumentovano: retention važi samo za `ARCHIVED`, agregat `viewCount` je trajan, a ACCESS izvoz baze znanja nije proširen.

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
| BA-knowledge-base-06 | P2       | Intercept resolution prihvata foreign scope i hidden/unpublished article ID               | zatvoreno |
| BA-knowledge-base-07 | P2       | Feedback write + aggregate refresh nije atomski i counter može zastarjeti                 | zatvoreno |
| BA-knowledge-base-08 | P2       | From-reply article/event/audit nije idempotentan ni atomaran                              | zatvoreno |
| BA-knowledge-base-09 | P2       | Placement/category mutation nije atomska sa auditom/change-logom                          | zatvoreno |
| BA-knowledge-base-10 | P2       | Category archive guard je TOCTOU prema paralelnom article placementu                      | zatvoreno |
| BA-knowledge-base-11 | P2       | Slug alokacija je read-before-create bez conflict retry ugovora                           | zatvoreno |
| BA-knowledge-base-12 | P2       | Reminder query je unbounded i recipients ne provjeravaju active/scope eligibility         | zatvoreno |
| BA-knowledge-base-13 | P2       | Scheduler nema Redis-loss reconciliation; njegov gubitak ugrožava i view flush           | zatvoreno |
| BA-knowledge-base-14 | P2       | Privacy/retention ne pokriva slobodni tekst, source, comments, notifications i change-log | zatvoreno |
| BA-knowledge-base-15 | P2       | Hard delete kaskadno uklanja feedback/views bez formalne tombstone/retention politike     | zatvoreno |
| BA-knowledge-base-16 | P3       | View flush crash može duplirati totals; DB fallback napuhuje unique viewers               | zatvoreno |
| BA-knowledge-base-17 | P3       | Insights comments hard-limit 50 i category/list API nemaju cursor/hasMore                 | zatvoreno (W7.90) |
| BA-knowledge-base-18 | P3       | Comment resolution nema audit, actor ni optimistic state                                 | otvoreno |
| BA-knowledge-base-19 | P3       | Deset suiteova je compile-blocked; nedostaje concurrency/failure E2E matrica              | otvoreno |

## 15. Ključne korekcije

- **01–02:** owner/reviewer kao eksplicitna, eligible, scoped i auditirana delegacija sa revoke/expiry pravilom.
- **03:** article version/content revision, If-Match/CAS i review vezan za tačan revision hash.
- **04, 17:** DB pagination/scope pushdown, cursor/hasMore i bounded portal/insights.
- **17 (W7.90):** svaka portal lista koja se reže ima stranu sa `hasMore`/`nextCursor`; komentari idu keyset-om
  po `(createdAt desc, id desc)` (resolve između strana ne preskače red), kategorije po
  `(sortOrder, nameBs, id)` sa djecom uz roditelja, `limit` kroz `resolvePageSize`, a pickeri iznad capa to
  javljaju umjesto da se prave da je lista potpuna.
- **05:** publika `INTERNAL` je eksplicitna postavka (default scope-aware: OU/servis dodjela ili matična
  jedinica), a company-wide je svjesno uključenje.
- **06:** deflection se provjerava kao tvrdnja — jedinica koju akter smije zastupati, članak objavljen, iz
  traženog servisa i čitljiv, bez oracle-a nad nepoznatim ID-em.
- **07:** glas i preračun su jedna transakcija pod bravom članka, preračun je egzaktan (samoiscjeljujući), a
  brisanje korisnika popravlja članke koje je ocijenio u istoj transakciji.
- **08:** nacrt je jedna transakcija pod bravom izvornog odgovora; ponovni poziv vraća postojeći nacrt, a trag
  na tiketu je upsert ključan na poruku (unique indeks nad izvorom ostaje preporuka za migraciju).
- **09–11:** transakcijski portal audit (urađeno u W7.83), category locking (urađeno u W7.84) i slug conflict
  retry (urađeno u ranijem paketu).
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

## 24. Implementacijski closeout — W7.80 (`BA-knowledge-base-06`)

Na `1e463ba`, uz CI `44934728908`, deflection se više ne prima na riječ. `POST /knowledge-base/intercept/resolve`
je prije provjeravao samo **postojanje** servisa, jedinice i (opcionog) članka, pa je svaki prijavljeni korisnik
mogao upisati resolution za tuđu jedinicu ili servis, „pripisati” `DRAFT`/`ARCHIVED` članak ili članak koji ne
smije čitati — a svi ti redovi su ulazili u deflection analytics (`buildReportsDashboard` broji po jedinici).
Nepostojeći članak je uz to davao `NOT_FOUND`, a skriveni ništa, pa je endpoint potvrđivao postojanje ID-eva koje
korisnik nikad nije vidio.

Sada se tvrdnja provjerava, svaka provjera **prije** jedinog `create` (neuspjeh ne ostavlja red): učitava se
autorizacijski kontekst; uz isključen `private.addons.kbIntercept` nema upisa (`FORBIDDEN`); jedinica mora biti
ona koju akter smije zastupati — matična jedinica ili jedinica+servis koje pokriva dodjela
(`canManageTicketsInScope`, **isto pravilo koje `assertCanCreateTicket` primjenjuje**: deflection je tiket koji
nije otvoren, pa ga bilježi onaj ko bi ga smio otvoriti), uz SuperAdmin izuzetak; članak mora biti `PUBLISHED`,
iz **prijavljenog** servisa i čitljiv kroz jedini predikat vidljivosti (`isKnowledgeArticleVisibleTo`, uključujući
W7.79 INTERNAL publiku). Nepoznat, tuđi, nacrt, arhiv i skriveni članak daju **istu** grešku `FORBIDDEN` — nema
oracle-a, a `SERVICE_NOT_FOUND`/`ORGANIZATIONAL_UNIT_NOT_FOUND` ostaju netaknuti (katalog i stablo jedinica nisu
tajna). Vezivanje uz intercept token nije uvedeno: tražilo bi novi secret, TTL i replay zaštitu da bi dokazalo
isto što postojeće činjenice (ko je akter, šta smije, šta članak jeste), a isteklo bi tačno u slučaju dugog
čitanja koje mjerimo. Dokaz: novi `knowledge-base.intercept-resolution.spec.ts` (**10 testova** — vlastita
jedinica, pamćenje tačnog `primaryArticleId`, tuđa jedinica za običnog korisnika i za agenta, članak drugog
servisa / `DRAFT` / `ARCHIVED`, skriveni `CONFIDENTIAL` i nepostojeći ID sa istom greškom, korisnik bez matične
jedinice, SuperAdmin, isključen feature, netaknute reference greške, uz tvrdnju da nijedan odbijeni pokušaj ne
ostavlja red), `modules/knowledge-base` **21 suite/112 testova**, `knowledge-base`+`teams` **27/208** (Teams
`deflect` šalje matičnu jedinicu i prolazi isto pravilo), `eslint` zelen. Nema migracije; ugovorna promjena je
`FORBIDDEN` tamo gdje je bio `NOT_FOUND`, a oba klijenta neuspjeh već tretiraju kao best-effort telemetriju.
Dokaz: [301-w780-knowledge-base-06-intercept-resolution.md](../implementation/301-w780-knowledge-base-06-intercept-resolution.md).

## 26. Implementacijski closeout — W7.81 (`BA-knowledge-base-07`)

Na `16a8fcf`, uz CI `44939932522`, `ratingCount`/`ratingSum` se više ne mogu tiho razići sa glasovima. Prije je
`submitKnowledgeFeedback` pisao glas, pa **odvojeno** čitao agregat i **odvojeno** upisivao apsolutne brojeve —
dva glasa koja stignu zajedno mogla su se završiti u pogrešnom redu i na redu ostaviti **stariji** snapshot, a
prosječna ocjena je javna na portalu i ulazi u `rankKnowledgeArticles` (redoslijed sugestija uz tiket). Uz to
`KnowledgeFeedback.userId` je `onDelete: Cascade`, pa je brisanje korisnika tiho uklanjalo njegove glasove **bez
ijednog** preračuna članaka koje je ocijenio.

Sada: `lockKnowledgeArticleRating` uzima row lock članka unutar transakcije (glasovi istog članka se
serijalizuju, ostali članci nisu blokirani), `reconcileKnowledgeArticleRating` preračuna `count`/`sum` **iz
redova** i upiše ih apsolutno pod tom bravom (egzaktno, idempotentno, samoiscjeljujuće za stari drift), a
`submitKnowledgeFeedback` radi `$transaction(lock → upsert/create → reconcile)`; thumbs-only glas preskače
preračun jer nikad nije ušao u zbir. Upis brojeva ostaje sirov SQL, pa ocjena ne mijenja `updatedAt` i ne
preuređuje liste. `deleteUser` sada **u istoj transakciji brisanja** prikupi ocijenjene članke
(`collectRatedArticleIdsOfUser`, `distinct` nad glasovima sa ocjenom), obriše korisnika (kaskada odnese glasove)
i preračuna te članke (`reconcileKnowledgeArticleRatings`) — uklanjanje i popravka se commit-uju zajedno ili
nikako. Trigger bi riješio isto, ali traži migraciju; delta bi bila O(1) ali ne bi popravila postojeći drift ni
kaskadu, pa je odabran egzaktni preračun pod bravom. Dokaz: `knowledge-base.feedback-rating.spec.ts`
(**8 testova** — jedna ocjena ulazi jednom, više korisnika, thumbs glas ne dira zbir, `9/41` se popravi na
`1/5`, preračun se izvršava unutar transakcije glasovanja, samo ocijenjeni članci se skupljaju, jedan preračun po
distinct članku, jedinstveni glas ostaje ugovor baze), novi `knowledge-feedback-concurrency.integration.spec.ts`
(**4 testa** pod stvarnim PostgreSQL-om: osam istovremenih glasova → tačno `8/32`, dva istovremena glasovanja
istog korisnika → jedan red i brojevi koji odgovaraju stvarnom redu, korisnik odnese glasove → brojevi padnu
tačno, `99/999` se popravi sljedećim glasom) registrovan u isolated runner i pokriven guardom
(**23/23**), `users/delete-user.spec.ts` +1 test sa dokazom redoslijeda (preračun **poslije** brisanja), moduli
`knowledge-base` **23 suite/124 testa**, `users` **22/87**, `reports` **31/159**, `eslint` zelen. Nema
migracije. **Otvoreno i dokumentovano:** `@@unique([articleId, userId])` protiv postavke „svaki glas se broji”
(pinovan testom, ispravka traži migraciju) i historijski drift na člancima bez novih glasova (globalni
reconciler pripada `BA-knowledge-base-13`).
Dokaz: [302-w781-knowledge-base-07-feedback-rating-atomicity.md](../implementation/302-w781-knowledge-base-07-feedback-rating-atomicity.md).

## 27. Implementacijski closeout — W7.82 (`BA-knowledge-base-08`)

Na `cc54913`, uz CI `44945610188`, „napravi članak iz odgovora” više ne može ostaviti pola zapisa niti napraviti
dva nacrta istog odgovora. Prije je tok pisao **tri** stvari u **tri** koraka — članak sa change logom (sopstvena
transakcija), `SYSTEM_EVENT` na tiketu i audit `knowledge.article.drafted_from_reply` — pa je pad drugog ili
trećeg koraka ostavljao članak **bez** traga i audita, a retry nije imao po čemu da prepozna prethodni pokušaj
(`KnowledgeArticle` nema unique ključ nad `(sourceTicketId, sourceMessageId)`) i pravio je **drugi** nacrt, sa
svojim change logom i svojim auditom.

Sada: `withKnowledgeFromReplyLock` uzima transakcijski advisory lock kroz postojeći `DatabaseLockService`
(identitet `knowledge-base.from-reply`, ključ `<ticketId>:<messageId>`), pa se pisci **istog** odgovora
serijalizuju, a ostali nisu blokirani; brava se pušta na commit/rollback/prekinutu konekciju.
`findKnowledgeDraftFromReply` traži nacrt **poslije** brave (READ COMMITTED vidi commitovanog pobjednika), a
`createFromReply` radi `$transaction(lock → postojeći? → članak + change log → trag na tiketu → audit)` — sve
četiri stavke se commit-uju zajedno ili nikako. Ako nacrt već postoji, vraća se **taj** uz `alreadyCreated: true`
(aditivno polje; portal prikazuje „Nacrt za ovaj odgovor već postoji”), trag na tiketu je **upsert** ključan na
izvornu poruku (`knowledge-draft-created:<messageId>`) pa se ne duplira, a audit se ne ponavlja. Pošto se slug
alocira **unutar** transakcije, izgubljena slug trka restartuje cijelu transakciju sa sljedećim slobodnim
sufiksom (3 pokušaja) umjesto sirovog unique konflikta. Unique indeks nad izvorom je ostao **preporuka za
migraciju** (nije dozvoljena bez odobrenja): brava pokriva pisce kroz ovaj kod, ali ne i ručni SQL ili budući
importer, a lookup po `sourceTicketId`/`sourceMessageId` je pregled tabele jer kolone nisu indeksirane. Dokaz:
`knowledge-portal.from-reply.spec.ts` **8 testova** (drugi submit vraća postojeći nacrt, jedan članak, jedan
`SYSTEM_EVENT`, jedan audit; trag i audit unutar transakcije; brava vezana na odgovor), novi
`knowledge-from-reply-atomicity.integration.spec.ts` **2 testa** pod stvarnim PostgreSQL-om (dva pisca istog
odgovora → tačno jedan nacrt; pad poslije inserta odnosi članak, a retry napravi tačno jedan) u isolated runneru
uz guard **23/23**, backend `knowledge-base`+`users`+`reports`+`teams` **81 suite/465 testa**, `knowledge-base/portal`
**3/21**, frontend `tsc -b` i `eslint` čisti, `vitest src/i18n` **48/48**, `vitest src/components/knowledge-base`
**1/1**, `prettier --check` čist. Nema migracije.
Dokaz: [303-w782-knowledge-base-08-from-reply-idempotency.md](../implementation/303-w782-knowledge-base-08-from-reply-idempotency.md).

## 28. Implementacijski closeout — W7.83 (`BA-knowledge-base-09`)

Na `0567fcf`, uz CI `44947960568`, zapis i njegov trag u portalu znanja više ne mogu živjeti odvojeno.
**Placement** je mijenjao `categoryId`/`isFaq`/`faqOrder` jednom naredbom, a change-log zapis drugom: pad loga je
ostavljao **premješten članak bez traga**, a dva paralelna placementa su oba prolazila dok je log opisivao
`before` koji više nije bio tačan. **Kategorije** su pisale red pa otvarale **novu** transakciju za audit, pa je
kategorija mogla postojati bez zapisa ko ju je napravio. Sada `placeArticle` radi
`$transaction(kategorija → CAS `updateMany` nad `{id, updatedAt}` → `findUniqueOrThrow` → change log)`: upis
prolazi samo ako je red još ono što je zahtjev pročitao (`STALE_WRITE` umjesto tihog prepisivanja), a provjera
aktivne kategorije ide unutar transakcije. `createCategory`/`updateCategory`/`setCategoryArchived` rade
`$transaction(izmjena → audit)`, a helperi primaju opcioni `transaction` isto kako već radi
`createKnowledgeArticle`.

**Bonus — pronađen i popravljen živi defekt:** allowlista za `knowledge.category.updated` bila je `schema([])`,
a servis šalje `before`/`after`, pa je **svaki rename kategorije** upisao red i zatim pao sa
`AUDIT_METADATA_FIELD_NOT_ALLOWED` (promjena u bazi, korisniku greška, audita nema). Akcija je podignuta na
**schema v2** sa `['before','after']`, kompatibilni registar na v2, oba bumpa upisana u `bumpedSchemaVersions`, a
regresioni test (`prepareAuditEntry` prima ta polja) stoji uz `changeTemplateSaved` presedan. Dokaz: `+3` testa u
`knowledge-portal.service.spec.ts` (change log unutar placement transakcije; zastarjelo čitanje ⇒ `STALE_WRITE`
bez zapisa i bez promjene kategorije; sva tri audita kategorija unutar svojih transakcija), novi
`knowledge-placement-atomicity.integration.spec.ts` **2 testa** pod stvarnim PostgreSQL-om (predikat pogađa samo
pročitani red; pad change loga odnosi placement) u isolated runneru uz guard **23/23**, backend
`knowledge-base`+`users`+`audit-log` **63 suite/283 testa**, `eslint` zelen. Nema migracije.
Dokaz: [304-w783-knowledge-base-09-placement-category-atomicity.md](../implementation/304-w783-knowledge-base-09-placement-category-atomicity.md).

## 29. Implementacijski closeout — W7.84 (`BA-knowledge-base-10`)

Na `6ff475c`, uz CI `44956273227`, arhiviranje kategorije i placement članka su **jedna odluka** po kategoriji.
Prije su obje strane provjeravale same za sebe: guard je brojao aktivne članke pa arhivirao, a placement je
provjeravao da je kategorija aktivna pa upisivao `categoryId`; u preklapanju oba prođu svoju provjeru i ostane
**arhivirana kategorija sa živim člankom** — tačno ono što guard treba da spriječi. Sada
`withKnowledgeCategoryMembershipLock` uzima transakcijski advisory lock kroz postojeći `DatabaseLockService`
(identitet `knowledge-base.category-membership`, ključ `categoryId`): `setKnowledgeCategoryArchived` drži bravu
kroz čitanje, oba `count`-a i upis (restore djeteta zaključava i roditelja), `placeArticle` drži bravu ciljne
kategorije dok provjeri aktivnost i upiše vezu, a `createKnowledgeCategory`/`updateKnowledgeCategory` zaključavaju
roditelja kome dodaju dijete (novo dijete je sadržaj koji guard broji — simetrična polovina koju audit nije
imenovao). `pg_advisory_xact_lock` živi do kraja transakcije, pa zaštita pokriva i audit iz W7.83; ID-evi se
deduplikuju i zaključavaju **sortirano**, pa nema ciklusa između dva pisca koji diraju iste dvije kategorije.
Odbačeno: `SERIALIZABLE` (retry semantika za sve pisce portala) i brojač u kategoriji (novi izvor drifta, kao
`ratingCount` u W7.81) — oba bi tražila i veći zahvat, a drugo i migraciju. Dokaz: `+2` testa u
`knowledge-portal.service.spec.ts` (**15** — arhiviranje uzima bravu **prije** brojanja, placement je uzima za
ciljnu kategoriju) i novi `knowledge-category-archive-race.integration.spec.ts` **2 testa** pod stvarnim
PostgreSQL-om (**5 rundi** trke kroz pravi servis: nemoguće stanje nikad ne opstaje, tačno jedan poziv uspije,
gubitnik gubi sa `CATEGORY_NOT_EMPTY` ili `INVALID_CATEGORY`; plus regresija guarda) u isolated runneru uz guard
**23/23**, backend `knowledge-base`+`users`+`audit-log` **63 suite/286 testa**, `eslint` zelen. Nema migracije.
**Otvoreno:** brava pokriva samo pisce kroz ovaj kod (ručni SQL/importer i dalje može napraviti nemoguće stanje —
trajno rješenje traži migraciju) i `lock_timeout` od 5 s vraća `DATABASE_LOCK_TIMEOUT` umjesto beskonačnog čekanja.
Dokaz: [305-w784-knowledge-base-10-category-archive-guard-race.md](../implementation/305-w784-knowledge-base-10-category-archive-guard-race.md).

## 30. Implementacijski closeout — W7.85 (`BA-knowledge-base-12`)

Na `b7cc886`, uz CI `44965421827`, noćni podsjetnik na pregled članka više ne čita cijeli backlog odjednom i ne
šalje obavještenje ljudima koji na članak **ne mogu djelovati**. Prije je `processDue` radio jedan
`findMany` nad svim `PUBLISHED` člancima sa `reviewDueAt <= windowEnd` — bez `take`, bez `orderBy` i bez
straničenja — pa je vrijeme izvršenja i memorija rasla sa veličinom baze, a redoslijed nije bio deterministički
(isti backlog se mogao obrađivati u drugom redu, pa je pri prekidu prolaza dio članaka mogao biti trajno
„preskočen” u odnosu na druge). Uz to su primaoce činili vlasnik i članovi owner grupe **bez** provjere da su
računi aktivni i da imaju `knowledge.article.write` u kontekstu članka: deaktiviran korisnik ili korisnik vezan
samo za drugu OU/servis dobijao je podsjetnik, a za članak bez scopea se nije znalo ni kome ide — notifikacija je
nastajala bez ijednog podobnog primaoca i trošila dedupe ključ.

Sada `processDue` hoda backlog **u serijama** od `reminderCandidateBatchSize` (100) uz deterministički
`orderBy [{ reviewDueAt: 'asc' }, { id: 'asc' }]` i keyset kurzor (`cursor: { id }, skip: 1`), a jedan prolaz
staje poslije `reminderMaximumBatches` (20) serija — najviše 2.000 članaka, sa `logger.warn` kad cap bude
dostignut (zaostajanje je vidljivo, a sljedeći tick nastavlja od najstarijeg duga). Primaoci se razrješavaju kroz
novi `resolveReviewReminderRecipients`: aktivan račun (`user.findUnique` sa `isActive`, i `isLocalOnly` semantika
kao u loaderu) **prije** ijednog skupa dozvola, zatim razrješiv kontekst, pa `knowledge.article.write` u OU ili
servisu članka (SuperAdmin prolazi kao i drugdje). Membership owner grupe se čita **jednom po grupi** kroz
`createReminderEligibilityCaches` (keš po prolazu za `groupMembers`, `activeUsers`, `contexts`), pa više članaka
iste grupe ne ponavlja upite. Članak bez razrješivog scopea ili bez ijednog podobnog primaoca **ne šalje ništa**
i ostaje vidljiv kroz `logger.warn` sa `articleId`/razlogom; dedupe ključ
`kb-review:{articleId}:{reviewDueAtISO}:{userId}` i KB-scoped payload (`articleId`, `articleSlug`,
`ticketId: null`) su nepromijenjeni, a `processDue` vraća broj **stvarno** poslanih notifikacija.

Uz to je otklonjen DI defekt iz istog paketa: `KnowledgeBaseReviewReminderService` je loader deklarisao sa
`import type`, pa je `emitDecoratorMetadata` upisao `Function` kao token konstruktora i `worker.module.spec.ts`
pao u `test:safety-net:compile` koraku prvog CI runa (`44963521657`) sa
„Nest can't resolve dependencies of the KnowledgeBaseReviewReminderService”. Vrijednosni import vraća class token;
worker modul je već registrovao oba loadera (`PrincipalContextLoader`, `AuthorizationContextLoader`), kao i
`ReportSchedulesWorkerModule`.

Dokaz: `knowledge-base-review-reminder.dedupe.spec.ts` **4 → 7** (deaktiviran vlasnik ⇒ 0; vlasnik bez dozvole ⇒
0; **250** due članaka ⇒ 3 serije i 250 notifikacija; tri članka iste grupe ⇒ **jedan** membership upit i 6
notifikacija) i novi `review-reminder-recipients.spec.ts` **7** (aktivan + dozvola; deaktiviran ispada **prije**
traženja konteksta; dozvola u drugoj OU ispada; bez konteksta ispada; SuperAdmin prolazi; filtriranje grupe uz keš
na drugom članku; bez vlasnika i grupe ⇒ 0 upita), backend `knowledge-base`+`users`+`audit-log`+`notifications`
**114 suite / 593 testa**, `eslint` zelen. Nema migracije. **Otvoreno i dokumentovano:** cap od 2.000 članaka po
prolazu (ostatak u sljedećem tick-u; trajni health signal je `BA-knowledge-base-13`), eligibility je „trenutna
dozvola” (dedupe ključ se ne troši kad notifikacija ne nastane) i scope se čita po članku, linearno ali
ograničeno serijama i bez membership N+1.
Dokaz: [306-w785-knowledge-base-12-reminder-batching-eligibility.md](../implementation/306-w785-knowledge-base-12-reminder-batching-eligibility.md).

## 31. Implementacijski closeout — W7.86 (`BA-knowledge-base-13`)

Na `558b4ce`, uz CI `45010012368`, zakazani posao za pregled članaka se **sam vraća** nakon gubitka rasporeda i
**prestaje da vuče view flush za sobom**. Prije je `onModuleInit` uradio `upsertJobScheduler` i nikad više ništa nije
provjerio: raspored živi u Redis-u, pa ga restart bez perzistencije, `FLUSHALL`, failover na praznu instancu ili
restore starijeg snapshot-a brišu **bez ijednog signala** — do sljedećeg deploya nije radio ni podsjetnik ni flush
brojača pregleda. Uz to je u `process()` flush bio **drugi** i samo ako prvi (`automation.processDue()`) uspije, pa je
pad reminder upita značio da brojači stoje u Redis-u, a `knowledgeViewKeys` imaju **TTL od 8 dana** — bug u
podsjetniku mogao je trajno uništiti analitiku pregleda. Treće, flush je vraćao samo broj upisanih članaka, pa se
„nema šta da se flushuje” nije razlikovalo od „sweep nije radio sedmicu”; `ops-health` je brojao queue, ali nije znao
da je raspored obavezan, pa `scheduler.late` nije pokrivao ovaj posao.

Sada `KnowledgeBaseReviewReminderSchedulerService` poslije inicijalne registracije postavlja `setInterval` na
`knowledgeBaseReviewReminderReconcileMilliseconds` (**60 s**): `reconcileSchedule()` pročita
`queue.getJobSchedulers(0, -1)`, i samo kad `kb-review-reminder-quarter-hourly` nije tu, ponovo ga registruje kroz isti
`registerRepeatableJob` uz `kb_review_reminder_schedule_recovered id=…`. Registracija je idempotentna po ID-u, pa
paralelni reconcile dva workera daje **jedan** raspored; timer je `unref()`-ovan (ne drži proces ni jest workera),
`onModuleDestroy` ga čisti, a drugi `onModuleInit` ne pravi drugi timer. Raspored je dodan u
`expectedKnowledgeSchedulers` (`expectedSchedulers`), sa `knowledgeBaseReviewReminderLastSuccessMaxAgeMs` = **30 min**
(dva prozora od 15 min), pa `scheduler.late` prijavljuje `not_registered`, `not_picked_up`, `failing` i
`no_recent_success` — reconcile pokriva gubitak unutar minute, alarm je za gubitak koji ga nadživi.

`process()` sada izvršava **dvije nezavisne polovine**: sweep greška se i dalje rethrow-uje (job ostaje crven), ali
flush se izvršava **i kada sweep padne**; pad flush-a ostaje `logger.warn` i ne obara posao. Jedna linija po prolazu
nosi `kb_due_candidates`, `kb_batches`, `kb_reminders_sent`, `kb_no_recipient_articles`, `kb_unresolved_scope_articles`,
`kb_blocked_recipients`, `kb_capped`, `kb_views_flushed`, `kb_views_pending_days`, `kb_views_lag_days`, uz `logger.warn`
kad backlog pregleda pređe jedan prolaz i kad brojači pregleda zaostaju **≥ 2 dana** (od 8 koliko traje TTL). Zaostatak
mjeri novi `inspectKnowledgeViewBacklog({ redis, now })` — jedan `SMEMBERS` nad `pendingDays`, isti predikat
(`readPendingFinishedDays`) koji flush koristi, sada na jednom mjestu; `KnowledgeViewFlushService.backlog()` vraća
`null` bez Redis klijenta. `processDueWithSummary()` vraća `KnowledgeReviewReminderRun`, a `processDue` je
`(...).sent` — ugovor nepromijenjen. Dokaz: novi `knowledge-base-review-reminder.scheduler.spec.ts` **6** i novi
`knowledge-base-review-reminder.processor.spec.ts` **7** (sweep padne ⇒ flush ipak prođe i job padne; flush padne ⇒ job
zelen; 2 dana zaostatka ⇒ warn, nezavršen dan ⇒ bez warn-a; cap ⇒ warn; `@Optional()` flush), novi
`knowledge-scheduler-reconciliation.integration.spec.ts` **2** pod stvarnim Redis-om (obrisan raspored se vraća; dva
workera ⇒ jedan raspored), `knowledge-portal.service.spec.ts` **15 → 17**, ops-health **+3**, backend
`knowledge-base`+`ops-health` **336 testa / 6 skipped**, `eslint` zelen. Nema migracije. **Otvoreno i dokumentovano:**
`kb_*` brojevi su u logu i job metrici, ne na ops-health kartici (kartica je reporting, ne reconciliation), reconcile
ne nadoknađuje propušten prozor (bezopasno — obje polovine obrađuju „sve dospjelo”), flush koji trajno pada i dalje
gubi ključeve poslije 8 dana (warn na 2 dana daje ~6 dana za reakciju) i reconcile je po instanci (N čitanja/minutu,
bez koordinacije jer je registracija idempotentna).
**Sekundarni defekt otkriven acceptance testom.** Prvi CI run (`45010012368`) pao je na novom Redis acceptance specu,
i to s razlogom: `queue.getJobSchedulers()` u BullMQ 5.81 **ne** popunjava `id` za raspored napravljen kroz
`upsertJobScheduler` (`transformSchedulerData` daje `{ key: '<id>', name, next, pattern, … }`); `id` postoji samo na
legacy repeatable redovima, gdje je `key` sirovi `name:id:endDate:tz:pattern`. Svih **sedam** self-healing scheduler
servisa je provjeravalo `entry.id`, pa je svaki zdrav raspored izgledao izgubljen: re-registracija na svakom tick-u i
lažni `*_schedule_recovered` warn — šum koji sakriva baš onu liniju koju operator treba da vidi. Popravka je zajednički
`common/scheduled-jobs/job-scheduler-presence.ts` (`isSchedulerRegistered`, `missingSchedulers`; meč `key === id ||
id === id`) i njegova upotreba u `knowledge-base` review reminderu, `announcement-sweep`, `announcement-retention`,
`change-sweep`, `problem-sweep`, `on-call-sweep` i `inbound-email` servisu (`ca92b55`). Novi
`job-scheduler-presence.spec.ts` (**5**) pokriva oba oblika i dokazuje da se sirovi `key` ne čita kao ID; KB unit spec
sada hrani stvarni oblik (`key`) i pinuje legacy oblik. Drugi run (`45011775922`) dao je zelen integration — dokaz da
popravak radi pod stvarnim Redis-om — ali je pao na type-checku speca (`1411111`, `{ key?: string; id?: string }`).
Finalni [`45012253359`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45012253359) na `1411111` je
**success** (E2E `skipped`, kako je konfigurisano); `Perf smoke` `45010012383` zelen na `558b4ce`.
Dokaz: [308-w786-knowledge-base-13-scheduler-reconciliation.md](../implementation/308-w786-knowledge-base-13-scheduler-reconciliation.md).

**Ispravka reference iz §26/§30.** W7.81 je kao mjesto „globalnog reconcilera ocjena” uputio na
`BA-knowledge-base-13`; trinaestica je **scheduler reconciliation** i ne dira preračun ocjena. Globalni reconciler
historijskog drifta ostaje dokumentovan rizik W7.81 bez zasebnog nalaza (dotjerani preračun „iz redova” ga rješava za
svaki članak koji dobije novi glas).

## 32. Implementacijski closeout — W7.87 (`BA-knowledge-base-14`)

**Nalaz:** privacy je pokrivao jednu knowledge tabelu (`KnowledgeFeedback.userId` + komentar te osobe). Sve ostalo je
ostajalo: `title`/`body` članka koji osobu samo **imenuje** (i ostajao pretraživ kroz `searchVector`, jer trigger visi na
`UPDATE OF title, body`), tuđi komentar koji je imenuje, `sourceTicketId`/`sourceMessageId` pokazivači na erase-ovan
tiket, in-app notifikacija sa `payload.articleId`, `ChangeLog` snapshot naslova i `KnowledgeInterceptResolution`.
Retentiona za bazu znanja nije bilo nimalo — arhiviran članak držao je tekst, komentare, dnevne preglede, change-log i
notifikacije zauvijek.

**Rješenje.** Dva izvršna puta nad istom matricom (tabela u [309](../implementation/309-w787-knowledge-base-14-privacy-retention.md)).

*Retention* — nova kategorija `knowledgeContent` (`private.privacy.retention.knowledgeContentDays`, default **0**,
minimum **180**) i `createKnowledgeContentRetentionExecutor` koji radi serije od **100** arhivirana članka
(`status: ARCHIVED`, `archivedAt < cutoff`, `title != marker`, vlasnik i pregledalac bez `legalHoldAt`). Redaktuje se
sadržaj (`title`/`body` ⇒ marker, `source*` ⇒ `null`) i replike (komentari ⇒ `null`, `day < cutoff` pregledi ⇒
`deleteMany`, `ChangeLog` ⇒ marker + `diff { redacted }`, notifikacije ⇒ `body: null`), a skeleton i brojači ostaju.
`refs` su slugovi; idempotencija je marker u `title` (i `dueWhere` i `updateMany`), pa drugi prolaz ne piše ništa. Sve
u jednoj transakciji po seriji. Kategorija je u `retentionCategoriesRequiringDryRun` i u planu **prije** `audit`.

*Anonymizacija* — `knowledge-mentions.ts` (`knowledgeScrubbableColumns`, `knowledgeMentionTokens`,
`knowledgeArticleMentionWhere`, `collectKnowledgeMentions`) i `scrub-knowledge-mentions.ts`
(`scrubKnowledgeMentions`). Selekcija je `OR(ownerUserId, reviewerUserId, tekst imenuje osobu)` za članke, `OR(userId,
sadrži token)` za komentare, `payload.articleId IN (…)` za notifikacije, `entityType = knowledge_article` za change-log
i `sourceTicketId IN (tiket osobe)` za pokazivače; preview i execute čitaju isti skup. Sopstveni komentar se **briše**
(`null`), tuđi koji imenuje osobu se **scrubuje** (ocjena i `commentResolvedAt` ostaju), a `KnowledgeInterceptResolution`
se briše. U izvještaju erase-a **šest** brojača zamjenjuje stari `knowledgeComments`.

**Testni dokaz:** `knowledge-content-retention.executor.spec.ts` (**5**), `scrub-knowledge-mentions.spec.ts` (**5**),
`retention.integration.spec.ts` (+**1** PostgreSQL slučaj: dry run ⇒ 1, execute ⇒ marker + replicas + netaknut
blokirani/nedavni članak, drugo izvršavanje ⇒ 0), `anonymization.integration.spec.ts` (KB fixtures i tvrdnje u
execute slučaju, uključujući `report.knowledge*` brojače), guard `settings-registry-coverage` 520 → **521**,
`attachments.constants.spec.ts` **11** kategorija, `privacy-api.ts` union i bs/en i18n. Lokalno: backend `privacy` **133
prošlo / 27 skipped**, cijeli backend unit set **937 suite / 5.377 testova**, frontend **473 fajla / 1.888 testova**,
`eslint` zelen. CI [`45034422138`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45034422138) **success** na `7a902b0` (`Backend PostgreSQL + Redis integration` uključen; E2E poslovi `skipped`).

**Otvoreno i dokumentovano:** retention pokriva samo `ARCHIVED` (aktivan članak čuva anonymizacija, a period za
neaktivne `PUBLISHED` članke bio bi freshness nalaz); `viewCount` agregat ostaje trajan; `knowledgeArticles` se sabira
sa problem scrubom u istom ključu izvještaja; notifikacija zadržava `payload.articleId`/`articleSlug` (deep link, nije
lični podatak); `KnowledgeInterceptResolution` se briše, ali nije dio retention perioda; ACCESS izvoz nije proširen —
zasebno pravo i zaseban nalaz.

**Zbirovi:** 305 zatvoreno / 391 otvoreno / 696; Val 7 **84 / 27 (0/13/14)**; `knowledge-base` **14/19**. Detalji:
[309-w787-knowledge-base-14-privacy-retention.md](../implementation/309-w787-knowledge-base-14-privacy-retention.md).

## 33. Implementacijski closeout — W7.88 (`BA-knowledge-base-15`)

**Nalaz:** `DELETE` je bio `SUPER_ADMIN`-only ali bez kapije i bez traga koji preživi red. Mogao se obrisati
`PUBLISHED` članak; kaskada je odnijela `KnowledgeFeedback` i `KnowledgeArticleView` (brojevi su postojali samo u
change-log snapshotu); taj snapshot retention **nije mogao** doseći, jer W7.87 selekcija polazi od postojećih
članaka, pa je naslov obrisanog članka ostajao trajno; notifikacija je zadržavala tijelo sa naslovom; i nije bilo
hash-verificiranog revizorskog zapisa — change log je domenski dnevnik, ne revizija.

**Rješenje.** Kapija + tombstone + retention replika.

- **Kapija:** `assertDeletable` propušta `ARCHIVED` ili članak sa `publishedAt === null`; sve ostalo je
  `ARTICLE_NOT_RETIRED` ⇒ `409`. `DRAFT` nastao uređivanjem objavljenog članka **nije** „nikad objavljen”, a
  `IN_REVIEW` se odbija i bez `publishedAt`. Arhiviranje je eksplicitan, reverzibilan korak.
- **Tombstone u jednoj transakciji:** brojevi (`feedbackCount`, `viewDays`), change-log snapshot, revizorski
  zapis `knowledge.article.deleted` (slug, status, klasifikacija, servis/OU, vlasnik/pregledalac, brojevi,
  razlog, `deletedAt` — **bez** `title`/`body`, allowlist to ne dopušta), pražnjenje `body` notifikacija sa
  `payload.articleId`, pa `delete` reda. Revizija se piše **prije** brisanja: pad append-a obara sve.
- **Retention:** `knowledgeContent` redaktuje i change-log redove čiji članak više ne postoji (`NOT EXISTS`,
  `LIMIT 100`, ref `deleted:{articleId}`), pa naslov obrisanog članka živi isti period kao i naslov arhiviranog.

**Testni dokaz:** `delete-knowledge-article.spec.ts` (**9**), `knowledge-delete-tombstone.integration.spec.ts`
(**3**, PostgreSQL, u isolated runneru), `knowledge-content-retention.executor.spec.ts` **5 → 7**,
`retention.integration.spec.ts` +**1** (replika obrisanog članka se redaktuje, istorija živog ostaje); frontend
panel nudi brisanje samo za penzionisan članak, 409 ima svoju poruku, akcija ima bs/en labelu. Lokalno backend
**938 suite / 5.388 testova**, frontend **473 fajla / 1.888 testova**, `i18n:check` 9.292 ključa.

**Otvoreno i dokumentovano:** bez tombstone tabele slug nije rezervisan (novi članak može preuzeti staru
adresu; rješenje traži migraciju), metapodaci nose `slug` (izveden iz naslova), brisanje ostaje
`SUPER_ADMIN`-only, `Problem`/`PlaybookStep`/intercept reference idu na `SetNull`, a stari link vraća `404`
umjesto `410`. Detalji: [310-w788-knowledge-base-15-delete-tombstone.md](../implementation/310-w788-knowledge-base-15-delete-tombstone.md).

## 34. Implementacijski closeout — W7.89 (`BA-knowledge-base-16`)

**Nalaz:** flush je pisao dnevni red kao **inkrement**, pa je crash između commita i `del`-a Redis ključeva
duplirao dan na retry-u — a `insights.mostViewed` rangira upravo preko `_sum.views` po danima, dakle duplikat
je mijenjao odluku, ne samo statistiku. Istovremeno je Redis-less put pisao `uniqueViewers + 1` za svaku
posjetu, pa je tokom incidenta „svaki pregled = nova osoba”.

**Rješenje.** Dnevni red je sada **stanje**, ne događaj:

- flush zaključa red članka (`SELECT ... FOR UPDATE`, pokriva i prvi upis dana kad nema dnevnog reda),
  pročita prethodni dan, upiše **apsolutno** (`views = max(previous, redis)`,
  `uniqueViewers = min(max(previous, hll), views)`) i pomjeri `KnowledgeArticle.viewCount` samo za deltu, i to
  samo ako je delta > 0. Crash-retry je time no-op koji ipak čisti ključeve; dan sa ponovo napravljenim manjim
  ključevima nikad ne pada; dva paralelna flush-a sabiraju dan tačno jednom;
- `recordDatabaseView` upisuje `views + 1` i **ne dira** `uniqueViewers` — bez Redis-a niko ne može
  dedupirati posjetioca, pa se posjetilac ne tvrdi. `uniqueViewers` je time dokumentovana **donja granica**
  preko dana koje je Redis opsluživao (API/UI ga ne prikazuju);
- flush guta samo `P2003`/`P2025` (stvarno obrisan članak), sve drugo propagira; `kb_views_flushed` broji
  članke čiji se broj stvarno pomjerio.

**Testni dokaz:** `knowledge-article-views.spec.ts` (**6**, uključujući crash-retry i redoslijed brave),
`knowledge-view-flush-idempotency.integration.spec.ts` (**3**, PostgreSQL + Redis: crash-retry, **dva
paralelna flush-a** nad istim danom, fallback + HLL spajanje), proširen `knowledge-portal.service.spec.ts`.
Lokalno backend **939 suite / 5.394 testa**, `eslint`/`tsc` zeleni.

**Otvoreno i dokumentovano:** mješovit dan uzima `max` (podbrojava, nikad ne duplira ni izmišlja), HLL je
~0,8 % aproksimacija, osmodnevni TTL ključeva ostaje (W7.86 backlog signali su opomena), brava je po
**članku** (ne po cijelom flush-u) — flush-ovi za isti članak se čekaju, oni za različite članke ne. Detalji:
[311-w789-knowledge-base-16-view-flush-idempotency.md](../implementation/311-w789-knowledge-base-16-view-flush-idempotency.md).

## 35. Implementacijski closeout — W7.90 (`BA-knowledge-base-17`)

**Nalaz:** `insights` je vraćao prvih 50 otvorenih komentara kao da su svi (`take: 50`, bez `hasMore`/cursora),
`GET categories` je vraćao cijelu taksonomiju bez ijedne granice, a `categoryArticles` je za jednu kategoriju
čitao sve kategorije. Kurator nije mogao znati da je lista odsječena — a nije imao ni čime da dovuče ostatak.

**Rješenje.**

- **Komentari su strana:** keyset `(createdAt desc, id desc)`, `take: limit + 1`, `hasMore` + `nextCursor`;
  autorizacioni skup (`portalHomeScanCap` + `canWrite`) se računa na svakoj strani, pa „učitaj još” ne može
  proširiti vidokrug. Nova ruta `GET insights/comments?limit&cursor`.
- **Kategorije su strana korijena:** djeca idu uz korijen (`parentId: { in: … }`), red
  `(sortOrder asc, nameBs asc, id asc)`, `nextCursor` samo kad `hasMore`; `home` nosi `categoriesComplete`.
  Nečitljiv cursor je `INVALID_CURSOR` — nikad tiha prva strana.
- **Frontend prikazuje signal:** panel ima „Prikazano prvih N…” + „Učitaj još komentara” (dodaje stranu, ne
  reload-uje); pickeri hodaju strane do capa od 1.000 korijena i to **kažu** kad cap bude dostignut; home
  prikazuje `categoriesComplete === false`.
- **`categoryArticles` čita usko:** jedna kategorija + njena djeca, a `uncategorized` samo arhivirane
  kategorije (`select: { id }`). Arhivirana kategorija ostaje `CATEGORY_NOT_FOUND` kao i prije.

**Testni dokaz:** `knowledge-portal-pagination.spec.ts` (**4**), `knowledge-portal.service.spec.ts` **17 → 23**
(uključujući resolve-između-strana koji offset ne bi preživio i `defaultCategoryPageSize + 1` korijena),
`knowledge-insights-panel.spec.tsx` (**2**), ojačani in-memory fakeovi (feedback delegat sada primjenjuje
`orderBy`/`take` i razumije `OR`/`lt`; fake kategorija `{ in }`/`take`/`select`). Lokalno backend **940 suite /
5.404 testa**, frontend **474 fajla / 1.890 testova**, `eslint`/`tsc`/`prettier` zeleni, `i18n:check` 9.295
ključeva.

**API promjena (bez migracije):** `categories` i `insights.openComments` vraćaju stranu umjesto niza; dodata
`insights/comments`. Frontend je u istom deploymentu, pa nema perioda mješovitih verzija; rollback je vraćanje
fajlova (rute nemaju stanje).

**Otvoreno i dokumentovano:** komentari van bounded scana se ne prikazuju (postojeće W7.52 ograničenje, sada
eksplicitno kroz `hasMore`/`categoriesComplete`), cap hoda pickera je 1.000 korijena, `canWrite` po članku se
ponavlja na svakoj strani, a `limit` clamp-uje `resolvePageSize` (nema `INVALID_LIMIT` greške jer je siguran
default uvijek tačan odgovor). Detalji:
[312-w790-knowledge-base-17-bounded-pages.md](../implementation/312-w790-knowledge-base-17-bounded-pages.md).
