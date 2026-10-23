# Backend audit 42 — `docs`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** srednji  
**Baseline ocjena:** **5,50/10**  
**Nalazi:** 2 P1, 8 P2, 5 P3

## 1. Executive summary

`docs` izlaže prijavljenim korisnicima generisano ogledalo korisničke dokumentacije: role-filtered navigaciju, markdown stranice, BS/EN fallback i in-memory pretragu. Sadržaj se učitava jednom pri startupu iz `content/docs`, bez baze i bez per-request filesystem pristupa. Endpointi zahtijevaju session, odgovori su `no-store`, slug je strogo ograničen, nedozvoljena stranica se ponaša kao 404, excerpt se vraća kao strukturirani tekst umjesto HTML-a, a postojeći pure testovi dobro pokrivaju osnovnu funkciju.

Baseline je **5,50/10**. Dva P1 nalaza su authorization/content-integrity klase. Prvo, pristup se zasniva samo na role key stringu iz bilo koje assignment stavke, bez scopea, permissiona ili centralnog authorization context decisiona. Scoped `ADMIN`, `PROBLEM_MANAGER`, `CHANGE_MANAGER` ili slična assignment rola može otvoriti globalnu administratorsku dokumentaciju i operativne procedure koje nisu ograničene na taj OU/service scope.

Drugo, runtime manifest praktično nije validiran. Provjerava se samo da je `pages` niz. Ne provjeravaju se jedinstveni i sigurni slugovi, shape/role/part/title vrijednosti, source-body korespondencija ni kompletan skup fajlova. Kod duplicate sluga metadata se čita iz prvog manifest zapisa (`find`), dok `Map` body završava vrijednošću posljednjeg učitanog fajla. Time sadržaj i access metadata mogu pripadati različitim zapisima; unrestricted prvi zapis može vratiti body namijenjen restriktivnom drugom zapisu. To je fail-open content authorization invariant.

Dodatno, nedostajući page/translation fajlovi se tiho preskaču i servis ostaje djelimično “zdrav”; navigation može oglašavati stranicu koja daje 404. Sadržaj nema hash/signature/build revision ni health signal za stale ili partial mirror. Pretraga obrađuje sve, uključujući nedozvoljene stranice, pa tek zatim filtrira rezultate; to nepotrebno izlaže timing/CPU side-channel i povećava work. Search je linearni in-memory scan bez per-user rate limita. Synchronous startup učitavanje nema maksimalne file/manifest/total byte granice.

Od četiri direktna suitea tri prolaze, controller suite je compile-blockiran zbog nepotpunog generated Prisma clienta; 18/18 izvršenih testova je zeleno. Nema real guard/E2E testa, malformed-manifest security corpusa, duplicate-slug testa, scoped-role testa, large-content/load testa ni frontend markdown sanitization contracta. Popravke nisu implementirane.

## 2. Scope i inventar

- 9 produkcijskih TypeScript fajlova;
- 4 direktna speca;
- 769 direktno izmjerenih produkcijskih LOC (registar navodi 778);
- 1 controller, 2 servisa/repository komponente;
- 3 authenticated GET endpointa: navigation, page, search;
- filesystem-generated manifest i BS/EN markdown sadržaj;
- nema Prisma modela, write API-ja, queuea niti vanjskog network poziva.

Generator/build pipeline je relevantna trust granica, ali ovaj audit primarno ocjenjuje backend runtime consumer. Cross-cutting artifact supply chain bit će ponovo obuhvaćen u jedinici 44.

## 3. Authentication i role-based pristup

Controller ima `SessionAuthenticationGuard`. Service filtrira i page read i navigation/search rezultat. Restricted page bez role matcha vraća isti 404 kao nepoznata stranica, što smanjuje enumeration. `roles: []` znači svaki prijavljeni korisnik.

Role keys se sastavljaju iz `PrincipalContext.roleKeys` i svih `assignments[].roleKey`. Izgubljeni su:

- assignment OU path/ID;
- service scope;
- permission set;
- aktivni policy context;
- globalna naspram scoped role semantika.

Ako dokument “Instalacija”, sigurnosna konfiguracija ili operativni runbook navede `ADMIN`, bilo koja scoped ADMIN assignment otvara cijelu globalnu stranicu. Package role assignment na jednom service/OU scopeu slično otvara globalnu docs stranicu. Dokumentacija često sadrži procedure, endpoint imena, deployment detalje i sigurnosne postavke, pa ovo nije samo UX problem.

Pristup treba koristiti centralni permission key po stranici (`docs.<section>.read` ili stvarni feature permission) i eksplicitnu scope klasifikaciju. Global-only stranica mora zahtijevati global assignment/SuperAdmin. Frontmatter roles mogu ostati presentation metadata, ali ne jedini authorization source.

## 4. Manifest trust i duplicate-slug mismatch

`load()` radi `JSON.parse(... as DocsManifest)` i provjerava samo `Array.isArray(manifest.pages)`. Zatim:

- postavlja `this.manifest = manifest` prije potpune validacije/učitavanja;
- iterira sve zapise i body upisuje u `Map` po slugu;
- `readPage` metadata nalazi sa `manifest.pages.find`, dakle prvi duplicate;
- `Map.set` zadržava posljednji body za isti slug;
- ne provjerava unique slug, safe slug, roles array, title, part, order, headings, source i filenames;
- ne provjerava da manifest parts tačno referenciraju stranice;
- ne provjerava da je svaki page body prisutan.

Duplicate slug zato može spojiti access pravila prvog zapisa sa sadržajem posljednjeg body učitavanja. Primjer: prvi zapis `roles: []`, drugi isti slug `roles:['SUPER_ADMIN']`; običan korisnik prolazi po prvom zapisu, ali dobija posljednje upisani body. Čak i ako generator trenutno odbija duplicate, runtime authorization granica mora imati vlastiti fail-closed invariant.

Potreban je schema parser (npr. Zod/JSON schema), exact keys, safe unique slug, known role/part enum, bounded arrays/strings, complete file existence, source/hash match i all-or-nothing publish. Svaka greška mora ostaviti repository unavailable, ne djelimično učitan.

## 5. Partial mirror i availability semantika

Ako manifest JSON nije čitljiv ili `pages` nije niz, modul loguje warning i vraća 503 — dobra graceful degradacija. Međutim nakon postavljanja manifesta svaki missing/unreadable body se samo `continue`. Modul se smatra loaded; navigation uključuje zapis, page read vraća null/404, a search možda koristi prazan body.

English file failure se takođe tiho tretira kao normalan fallback čak kada manifest tvrdi da `englishTitle` postoji. Korisnik dobija BS sadržaj uz `translated:false`, ali operator nema structured degraded signal. Nema startup summaryja očekivano/učitano/missing/invalid niti health integrationa.

Mirror treba učitati u privremene strukture, validirati kompletno, pa atomski swapati. Required BS body mora biti fatalan za novu revision. EN mismatch treba biti evidentiran u manifest healthu i CI generator gateu. Dashboard/health treba prikazati revision i completeness.

## 6. Artifact integrity i freshness

Runtime bira prvi candidate root koji sadrži `manifest.json`, uključujući environment i više cwd-relative fallback putanja. Ne provjerava owner/permissions, expected deployment path, symlink escape, content hash, signature, generated-at ili source commit SHA. Pogrešan stale mirror može biti poslužen bez vidljivog signala.

Sadržaj se učita samo na startupu. To je predvidivo i performantno, ali promjena docs volumea se neće primijeniti do restarta. Ne postoji revision u API odgovoru, pa frontend/operator ne može dokazati koja verzija dokumentacije je aktivna. U rolling deployu replike mogu posluživati različite revisions.

Production treba imati jedan explicit root, read-only mount, manifest sa schemaVersion/build SHA/generatedAt/per-file SHA-256, startup verification i revision u response headeru/payloadu. Mixed revisions trebaju biti observable.

## 7. Filesystem i resource bounds

API slug je strogo `[a-z0-9-]` i ne ide direktno u filesystem; body se čita samo iz manifest-driven startup petlje. To dobro blokira klasični request path traversal. Međutim manifest slug nije runtime validiran prije `path.join`. Nesiguran slug uglavnom neće biti direktno dohvatljiv zbog API validatora, ali startup može čitati `.md` fajl izvan root-a i tokenizirati ga u memoriji; search timing/work i accidental diagnostics tada obuhvataju nepredviđen fajl.

`readFileSync` učitava cijeli manifest i svaku markdown datoteku. Nema:

- max manifest bytes;
- max pages;
- max page/translation bytes;
- max total content/tokens;
- max headings/tags/roles;
- startup time budget.

Kompromitovan ili loše generisan artifact može blokirati event loop pri startupu i iscrpiti heap. Trebaju stat/stream bounds prije read-a i generator-side budget gate.

## 8. Search authorization i performance

Service prvo računa visible slug set, ali repository search ipak prolazi kroz sve manifest stranice, računa title/tag/body score i gradi excerpt za svaki match, pa se tek onda rezultati filtriraju. Unauthorized sadržaj se ne vraća, što je pozitivno, ali se obrađuje.

Posljedice:

- timing može zavisiti od termina u restricted dokumentima;
- CPU se troši na sadržaj koji caller ne smije pretraživati;
- excerpt restricted sadržaja se privremeno kreira u procesu;
- `repository.search` dobija limit jednak ukupnom broju stranica;
- svaki request ponovno tokenizira title/tagove i linearno prolazi token mapama.

Treba filtrirati allowed slugs prije score/excerpt faze ili održavati permission-aware indeks. Za mali trenutni corpus ovo nije veliki throughput problem, ali docs segment će rasti. Authenticated per-user/IP limiter i latency metric trebaju pratiti abuse.

Search query je ograničen na 100 znakova i minimum 2, rezultat na 50; to je dobra bounded osnova. Controller ipak ručno koristi `parseInt`, pa `10junk` postaje 10 umjesto 400 i ne koristi DTO za q/limit.

## 9. Markdown i output safety

Backend vraća raw markdown iz trusted build artifacta. Excerpt vraća `{text,match}` dijelove, nikada server-generated HTML; to je snažna XSS zaštita za search UI. Page markdown ipak može sadržati raw HTML, links, images i protocols. Sigurnost zavisi od frontend renderer/sanitizer ugovora, koji nije versioniran niti testiran u backend modulu.

Ako docs artifact supply chain bude kompromitovan, backend ga prosljeđuje svim ovlaštenim klijentima. Potrebni su generator lint za raw HTML/unsafe schemes/external image hosts i E2E contract koji potvrđuje sanitization/CSP. Backend po želji može vratiti generator-produced sanitized AST umjesto raw markdowna.

Metadata `roles`, `audience`, tags i headings vraćaju se klijentu za dozvoljene stranice. To je očekivano. Restricted page 404 sprečava direktno curenje metadata.

## 10. Locale i search konzistentnost

Page i navigation podržavaju `locale=en`; bez prevoda vraćaju BS uz `translated:false`. To je transparentan fallback. Search endpoint nema locale parametar i indeksira samo BS title/body/tags. EN korisnik ne može pretraživati engleski prevod, a excerpt/title search rezultata ostaju bosanski čak kada page read kasnije vrati EN.

`titleFor(page,'en')` koristi `englishTitle` čak ako EN file nije učitan; navigation može pokazati engleski naslov, a page vratiti bosanski fallback. To je još jedan partial mirror mismatch.

Search indeks treba biti per-locale, sa stvarno učitanim translation stateom. Navigation title treba koristiti EN naslov samo kada odgovarajući body postoji.

## 11. Cache i deployment behavior

Svi odgovori imaju `Cache-Control:no-store` jer zavise od role. To je sigurno, ali navigation i public-to-all-authenticated pages ne koriste private ETag/revision cache, pa svaki page request prenosi puni markdown. Repository je brz, ali bandwidth može rasti.

Moguće je koristiti `private, no-cache` + role/revision-specific ETag, bez shared cache curenja. Response treba `Vary` samo ako auth headers/cookies ulaze u shared cache; private politika je jednostavnija. Trenutni no-store je konzervativno prihvatljiv.

Nema compression/body-size testova ni maksimalne response veličine, ali startup page size limit bi riješio osnovni rizik.

## 12. Error mapping i observability

Content unavailable mapira se u 503, unknown/unauthorized u 404, invalid slug/query u 400. Error body koristi stabilan code. Nepoznate greške se pravilno prosljeđuju globalnom filteru.

Startup warning sadrži samo error message/code i ne iznosi root path, što smanjuje leak. Ipak nema metrics/status endpointa za loaded revision, count, missing files, startup duration i search latency. 503 ne daje retry-after niti operator correlation/revision.

Search `total` se postavlja na `matches.length` nakon `.slice`, pa nije ukupan broj pogodaka nego broj vraćenih rezultata. Naziv ugovora je pogrešan i onemogućava buduću paginaciju.

## 13. Test dokaz

Pokrenuta sva četiri direktna suitea:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  $(find src/modules/docs -name '*.spec.ts' -print | sort)
```

Rezultat:

- **3/4 suitea prošla**;
- **1/4 compile-blockiran**;
- **18/18 izvršenih testova prošlo**.

Compile blokada controller suitea dolazi iz nedostajućeg `generated/prisma/client` i posljedično `$connect/$disconnect` tipova, iako docs modul nema vlastitu DB zavisnost; import chain kroz authentication je dovoljan da blokira suite.

Zeleni testovi pokrivaju role filtering, 404 behavior u serviceu, slug safety, locale fallback, basic manifest outage, ranking/tokenization/excerpt i missing content. Nisu pokriveni real SessionGuard, scoped assignment, duplicate slug/body mismatch, runtime manifest schema, path/symlink artifact, large files, mixed replica revision, unsafe markdown E2E, search timing/rate i controller validation pipe.

## 14. Pozitivni nalazi

1. Sve rute zahtijevaju session guard.
2. Server filtrira navigation, page i search rezultat.
3. Unauthorized page vraća 404, ne 403.
4. Request slug je strogo bounded i path-safe.
5. Sadržaj se ne čita sa filesystema po requestu.
6. `no-store` sprečava shared role-content cache leak.
7. Search q i result count imaju osnovne limite.
8. Excerpt je strukturirani tekst, ne HTML.
9. Missing/broken top-level manifest ne ruši aplikaciju nego vraća 503.
10. Locale fallback eksplicitno vraća `translated:false`.
11. Pure repository/service/access testovi su opsežni i zeleni.
12. Modul nema DB/write/network attack surface.

## 15. Registar nalaza

| ID         | Severity | Nalaz                                                                                             | Status   |
| ---------- | -------- | ------------------------------------------------------------------------------------------------- | -------- |
| BA-docs-01 | P1       | Bilo koja scoped role assignment postaje globalni docs role key; scope/permission se gube         | otvoreno |
| BA-docs-02 | P1       | Manifest nema unique/schema invariant; duplicate slug može spojiti unrestricted metadata i restricted body | otvoreno |
| BA-docs-03 | P2       | Runtime manifest validation provjerava samo `pages` array, ne shape/role/part/slug/file integritet | otvoreno |
| BA-docs-04 | P2       | Missing BS/EN fajlovi se tiho preskaču i partial mirror ostaje “loaded”                           | otvoreno |
| BA-docs-05 | P2       | Artifact nema schemaVersion/build SHA/per-file hash/signature ni revision u API-ju                | otvoreno |
| BA-docs-06 | P2       | Manifest slug nije validiran prije filesystem join/read; root selection ima više implicit fallbacka | otvoreno |
| BA-docs-07 | P2       | Manifest/page/translation/total bytes i startup work nemaju hard limite                          | otvoreno |
| BA-docs-08 | P2       | Search score/excerpt obrađuje restricted sadržaj prije authorization filtera                     | otvoreno |
| BA-docs-09 | P2       | Search je linearni full-corpus scan bez rate limita ili permission-aware indeksa                 | otvoreno |
| BA-docs-10 | P2       | Raw markdown sigurnost zavisi od neversioniranog frontend sanitization/CSP ugovora                | otvoreno |
| BA-docs-11 | P3       | Search nema locale indeks; EN navigation/page i BS search nisu konzistentni                      | otvoreno |
| BA-docs-12 | P3       | `englishTitle` se koristi i kada translation file nije učitan                                   | otvoreno |
| BA-docs-13 | P3       | Search `total` je broj nakon slice-a, ne ukupan broj pogodaka                                   | otvoreno |
| BA-docs-14 | P3       | Ručni `parseInt` prihvata djelimične vrijednosti poput `10junk`; nema search DTO-a               | otvoreno |
| BA-docs-15 | P3       | 1/4 suitea compile-blockiran; nema scoped-role/manifest-security/load/E2E dokaza                 | otvoreno |

## 16. Ključne korekcije

- **01:** centralni permission/scope decision; global docs zahtijevaju global assignment ili SuperAdmin.
- **02–04:** strict manifest schema, safe unique slug, known roles/parts, complete files i all-or-nothing atomic load.
- **05–07:** explicit production root, read-only artifact, schema/build/hash manifest i hard byte/page/time budgets.
- **08–09:** authorization-before-search, permission-aware locale indeks, limiter i latency metrics.
- **10:** markdown lint/sanitized AST i backend↔frontend sanitization/CSP contract test.
- **11–14:** locale-aware search, loaded-translation title, ispravan total/pagination i validated search DTO.
- **15:** otključati controller suite i dodati real guard/artifact/load/E2E matrice.

## 17. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   6,20 |
| B. API i ugovori             |    12% |   5,90 |
| C. Auth/authz/scope          |    15% |   4,50 |
| D. Poslovna pravila/stanje   |    13% |   5,60 |
| E. Podaci/Prisma/transakcije |    13% |   6,40 |
| F. Sigurnost/privatnost      |    12% |   5,00 |
| G. Async/integracije         |     8% |   5,80 |
| H. Testovi/dokazivost        |    10% |   5,30 |
| I. Operativnost/perf.        |     7% |   4,90 |
| **Ukupno**                   | **100%** | **5,50/10** |

Ponderisani rezultat je **5,50/10**. Dva P1 content-authorization invarianta ograničavaju readiness uprkos malom read-only scopeu. Mali read-only scope i dobra osnovna zaštita podižu rezultat, ali manifest je dio authorization boundaryja i mora biti fail-closed.

## 18. Fazni plan

### Faza 0 — safety net

Otključati controller suite; dodati scoped-role, duplicate slug, malformed manifest, missing body, unsafe path/symlink, large artifact i frontend markdown E2E testove.

### Faza 1 — authorization model

Permission/scope metadata u manifestu i centralni authorization evaluator prije navigation/page/search obrade.

### Faza 2 — artifact schema i integrity

Versionirana JSON schema, unique/safe slugovi, complete file set, hashes/build SHA, explicit root i atomic load/swap.

### Faza 3 — bounded locale search

Per-locale permission-aware indeks, pre-filtering, pagination/true total, strict DTO, rate limit i hard content budgets.

### Faza 4 — rendering i operations

Sanitized AST/markdown contract, CSP/link policy, revision/health metrics, stale/mixed-replica detection i private ETag.

### Faza 5 — finalni gate

Sva četiri suitea i guard/artifact/security/load/frontend E2E matrica prolaze na finalnom SHA-u.

## 19. Acceptance i presuda

1. Scoped assignment ne otvara globalnu docs stranicu bez odgovarajuće permission/scope odluke.
2. Duplicate/invalid slug ili malformed role metadata čini cijelu revision nedostupnom.
3. Metadata i body uvijek pripadaju istoj hashiranoj manifest stavci.
4. Missing required body ne proizvodi djelimično zdrav mirror.
5. Artifact root/revision/build/hash i hard size budgets su dokazani.
6. Restricted sadržaj se ne scoreuje niti excerptuje za neovlaštenog korisnika.
7. EN search pretražuje EN sadržaj, a fallback/title su konzistentni.
8. Raw markdown ne može zaobići frontend sanitization/CSP ugovor.
9. Search ima strict DTO, pravi total/paginaciju i bounded abuse zaštitu.
10. Sva četiri suitea i real guard/artifact/E2E matrica prolaze.

Modul ima dobru read-only osnovu, konzervativan cache i korisnu server-side filtraciju. Međutim role scope se gubi, a nevalidiran manifest istovremeno određuje sadržaj i authorization. Dok ta dva invarianta nisu fail-closed, iskren baseline je **5,50/10**.
