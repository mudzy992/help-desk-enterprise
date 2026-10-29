# Backend audit 38 — `branding`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** srednji  
**Baseline ocjena:** **6,27/10**  
**Nalazi:** 0 P1, 8 P2, 5 P3

## 1. Executive summary

`branding` je mala javna presentation površina: anonimnom login/UI klijentu vraća naziv aplikacije, slogan, organizaciju, logo data URL, support email i support URL. Modul ima jednu javnu GET rutu, servis koji čita šest javnih settings ključeva i strogi logo validator za PNG/JPEG/WebP. Administrativni write lifecycle, permission i audit pripadaju `settings` modulu; install wizard također piše iste registry ključeve.

Baseline je **6,27/10**. Nema P1 nalaza. Pozitivna osnova je dobra: samo namjerno javna polja se vraćaju; logo odbija SVG i deklarisani MIME mismatch; decoded payload je ograničen na 200 KB, dimenzije na 1024×1024, a globalni body limit na 512 KB; public endpoint ima Redis limiter sa memory fallbackom i javni cache; postavke imaju dužinske i osnovne email/HTTPS validatore; testirani logo slučajevi su zeleni.

Glavne slabosti su boundedness, konzistentnost i dokazivost. Svaki anonimni request paralelno čita šest settinga, bez atomskog snapshot/version ugovora na nivou branding servisa. Redis greška potpuno gasi limiter, dok memory fallback postoji samo kada Redis nije injectovan. Tako outage Redis-a ostavlja javni endpoint bez limita i omogućava ponavljanje relativno velikog (~273 KB base64) odgovora i šest settings readova. Limiter vjeruje `request.ip`, pa tačnost zavisi od ispravnog `TRUST_PROXY`; nema CDN/edge rate dokaza niti response/body bandwidth budžeta.

Logo parser provjerava signature/header i dimenzije, ali ne radi potpuni image decode. WebP RIFF/chunk dužine i JPEG segment granice nisu potpuno validirani, pa header-valid ali strukturno oštećen/polyglot sadržaj može biti prihvaćen. Branding servis ne revalidira vrijednosti na readu; legacy/import/direct-DB korupcija može javno vratiti sadržaj koji više ne prolazi registry validator. Support URL provjera je regex `https://` umjesto sigurnog URL parsera i dopušta credentials, lokalne/privatne hostove i obmanjujuće host forme. To nije SSRF u ovom modulu, ali može proizvesti phishing/misrouting link.

Jedini direktni suite pokriva logo helper i prolazi 4/4. Nema testova za javni controller, Redis/memory limiter, proxy IP, cache headere, settings failure, torn response, service fallback, support URL/email ugovore ili realni image decoder. Popravke nisu implementirane.

## 2. Scope i inventar

- 5 produkcijskih TypeScript fajlova;
- 1 direktni spec;
- 202 direktno izmjerena produkcijska LOC (registar navodi 207);
- 1 public controller, 1 servis, 1 logo validation helper;
- 6 `public.branding.*` settings ključeva;
- nema vlastitog Prisma modela, write endpointa, DTO-a ni background joba;
- cross-module potrošači: login/frontend, e-mail, install, Teams, templates, MFA/WebAuthn naming i ops poruke.

Write authorization, settings audit/change log i snapshot cache auditirani su u modulu 07 — `settings`; ovaj dokument ocjenjuje branding read/presentation boundary i validator koji settings koristi.

## 3. Javni API i data classification

`GET /branding` je namjerno anoniman jer je potreban prije prijave. Vraća samo application name, tagline, organization name, logo, support email i support URL. Ne vraća privatne ili secret settings. Setup gate eksplicitno dopušta samo GET branding rutu. To je prikladna data classification odluka pod uslovom da administratori razumiju da su svih šest polja internet-javna.

Nema response schema/version, `updatedAt`, revision, ETag niti conditional GET. Klijenti ne mogu razlikovati fallback zbog settings greške od stvarno prazne vrijednosti. Public response može biti cacheiran 60 sekundi, ali nema `stale-while-revalidate`, immutable logo asset URL ili content hash.

Support email i organization name su namjerno javni PII/organizacijski podaci. UI/registry bi trebao jasno označiti public exposure i pružiti preview; sam modul nema privacy notice niti telemetry o scrape volumenu.

## 4. Settings konzistentnost i failure ponašanje

`BrandingService.load()` pokreće šest nezavisnih `getSetting` poziva kroz `Promise.all`. Svaki poziv zasebno hvata svaku grešku i vraća prazan string. App name zatim pada na `Service Desk`; ostala polja postaju prazna.

Prednost je visoka dostupnost login stranice. Nedostaci:

- odgovor nema dokaz da svih šest vrijednosti pripada istoj settings revision;
- concurrent branding update/cache invalidacija može dati torn kombinaciju starog i novog identiteta;
- parcijalni settings outage se tiho maskira, bez statusa ili observable alarma u modulu;
- logo može nestati dok app name ostane, a korisnik dobije privid drugog servisa;
- fallback app name se može razlikovati od MFA issuer/Teams/email snapshotova koji branding čitaju drugim putem.

Potreban je jedan versionirani public-branding snapshot (`revision`, sva polja, validatedAt), atomarno učitan i cacheiran. Posljednji known-good snapshot je bolji availability fallback od šest pojedinačnih praznih vrijednosti. Error/fallback metrički signal ne treba otkrivati internu grešku klijentu.

## 5. Public rate limiting i bandwidth

Redis put koristi `INCR` pa `EXPIRE`; memory put ima limit 10.000 ključeva i fixed window. Limit je 120/min po `request.ip`. Međutim:

- Redis exception odmah `return` i potpuno fail-open isključuje limiter;
- memory limiter se ne koristi kao fallback kada je Redis injectovan ali nedostupan;
- `INCR` i `EXPIRE` nisu atomski; crash između njih može ostaviti key bez TTL-a;
- correctness zavisi od deployment `TRUST_PROXY` vrijednosti;
- fixed-window dopušta burst na granici prozora;
- memory fallback je per-process i zaobilazi se horizontalno;
- `unknown` IP grupiše sve nerazriješene korisnike i može izazvati kolektivni 429;
- clear cijele mape iznad 10.000 ključeva resetuje limite svima.

Pošto logo može dati približno 273 KB base64 JSON vrijednosti, 120 odgovora/min znači desetine MB/min po IP-u prije kompresije/cachea. Endpoint bi trebao biti CDN/edge-cacheable sa hashed logo assetom, ETagom, distributed atomic limiterom i outage fallbackom. Cache-Control bez ETaga i zasebnog asseta nepotrebno ponavlja cijeli JSON/logo.

## 6. Logo validation

Validator dopušta samo base64 PNG, JPEG i WebP; SVG je zabranjen. Dekodira payload, ograničava bytes/dimenzije i poredi deklarisani MIME sa magic/header formatom. To direktno uklanja značajnu SVG script/XSS površinu. Regex je anchored, globalni request body je bounded i testovi pokrivaju osnovne pozitivne/negativne slučajeve.

Ipak ovo je header parser, ne image decoder:

- PNG provjerava signature i `IHDR` poziciju/dimenzije, ali ne CRC, chunk granice, obavezne chunkove niti decode;
- JPEG marker hod ne provjerava dosljedno da je cijeli deklarisani segment unutar buffera prije narednog čitanja i prihvata SOF bez kompletnog decodea;
- WebP provjerava RIFF/WEBP/chunk oznaku, ali ne RIFF size, chunk size/padding niti kompletan VP8/VP8L stream;
- bytes iza minimalnog validnog headera mogu ostati neprovjereni do 200 KB;
- nema normalizacije/re-encodea kojim bi se odbacili metadata i trailing/polyglot bytes;
- nema decompression/decode complexity provjere stvarnim image libraryjem.

Browser decoder vjerovatno odbije mnoge malformed slike, ali security boundary ne treba zavisiti od različitog ponašanja browsera/e-mail renderera. Sigurniji tok je full decode u sandboxed/native maintained library, pixel limit, metadata strip i server-side re-encode u kanonski PNG/WebP. Alternativno pohraniti objekt i servirati ga kao zaseban asset sa `Content-Type`, `nosniff`, immutable hashom i CSP-om.

## 7. Read-time validation i legacy podaci

Registry write path validira vrijednosti, ali `BrandingService` samo provjerava da je vrijednost string i radi `trim()`. Ne provjerava ponovo dužine, logo data URL, email ni support URL. Ako vrijednost potiče iz starije verzije, importa, restorea, ručne DB izmjene ili registry bypassa, javni endpoint je vraća bez validacije.

Read-time defense-in-depth treba koristiti isti compiled schema/normalizer kao write path. Invalid field treba izostaviti, zadržati last-known-good i emitovati alarm. Posebno logo ne treba proslijediti browseru ako više ne prolazi aktuelni parser.

## 8. Support URL i email

Support URL validator provjerava samo string bez whitespacea koji počinje `https://`. Ne koristi `new URL`, ne zabranjuje username/password, missing/obmanjujući hostname, private/localhost host, non-default port ili Unicode/punycode homograph. Kako browser direktno otvara link, ovo nije backend SSRF, ali administratorska greška ili kompromitovan branding write može login/e-mail površinu pretvoriti u uvjerljiv phishing redirect.

Potrebni su canonical URL parse, `https:` protocol, non-empty normalized hostname, credentials ban, opcionalni organization allowlist i eksplicitna odluka o private/intranet hostovima. E-mail regex je osnovan i može prihvatiti adrese koje različiti mail klijenti različito tumače; canonical library validation i header/newline zabrana trebaju biti jedinstveni kroz UI/email sloj. Trenutni whitespace check odbija newline, što je pozitivno.

## 9. Cache i cross-channel consistency

Public endpoint postavlja `Cache-Control: public, max-age=60`. To odgovara javnoj prirodi podataka, ali administrativna izmjena ne može invalidirati browser/shared proxy cache. Komentar tvrdi da saved change postaje vidljiv odmah kroz snapshot, dok HTTP odgovor legitimno može ostati star 60 sekundi. Operativni i UI ugovor zato nije potpuno tačan.

Različiti potrošači branding čitaju zasebno: email config, Teams, template environment, MFA issuer i ops fallback. Nema jedne revision vrijednosti koja dokazuje da su svi kanali primijenili istu promjenu. Promjena app namea može prije isteka token/cache prozora proizvesti različita imena u loginu, mailu, Teamsu i authenticatoru.

Potreban je centralni branding snapshot/event sa revisionom, consumer cache invalidacijom i dokumentovanom propagation SLA. MFA issuer promjena ima poseban user-impact i ne bi trebala automatski pratiti presentation rename bez change previewa.

## 10. Test dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  src/modules/branding/validate-logo-data-url.spec.ts
```

Rezultat: **1/1 suite prošao; 4/4 testa prošla**.

Testovi potvrđuju:

- osnovne PNG/JPEG/WebP headere i dimenzije;
- SVG/URL/malformed odbijanje;
- declared MIME mismatch i script tekst odbijanje;
- 200 KB, 1024 px i zero-dimension limite.

Nisu dokazani: controller status/cache headers, Redis happy/error/TTL race, memory fallback/eviction, proxy IP, six-read failure/torn snapshot, last-known-good, read-time validation, strict URL/email, real malformed image corpus, decompression complexity, conditional cache, public disclosure i frontend/backend contract.

## 11. Pozitivni nalazi

1. Javni endpoint vraća samo eksplicitno public branding ključeve.
2. Nema branding write endpointa bez settings authorization granice.
3. Setup gate dopušta GET, ne write branding rute.
4. SVG je eksplicitno zabranjen.
5. MIME declaration se poredi sa magic/header formatom.
6. Logo je ograničen na 200 KB decoded i 1024×1024.
7. Globalni JSON body limit od 512 KB ograničava upload tekst.
8. App name/tagline/organization/email/URL imaju write-time length limite.
9. Support URL mora barem koristiti HTTPS prefix, a email odbija whitespace/newline.
10. Redis limiter postoji, sa memory implementacijom kada Redis nije dostupan kao provider.
11. Response je javno cacheiran 60 sekundi.
12. Settings read greška ne ruši login branding endpoint.
13. Product-neutral fallback nije client-hardcoded.
14. Direktni test suite je potpuno zelen, 4/4.

## 12. Registar nalaza

| ID          | Severity | Nalaz                                                                                              | Status   |
| ----------- | -------- | -------------------------------------------------------------------------------------------------- | -------- |
| BA-brand-01 | P2       | Šest nezavisnih settings readova nema atomarni revision snapshot i može vratiti torn branding      | otvoreno |
| BA-brand-02 | P2       | Redis greška potpuno gasi public rate limiter umjesto bounded memory/edge fallbacka                | otvoreno |
| BA-brand-03 | P2       | Logo validator provjerava headere, ne puni decode/RIFF/chunk/CRC/stream integritet                 | otvoreno |
| BA-brand-04 | P2       | Branding read path ne revalidira legacy/import/direct-DB vrijednosti prije javnog vraćanja         | otvoreno |
| BA-brand-05 | P2       | Support URL regex dopušta credentials, obmanjujuće/private hostove i nema canonical URL policy     | otvoreno |
| BA-brand-06 | P2       | Public response nosi veliki inline base64 logo bez ETag/hash asseta i jasnog bandwidth budžeta     | otvoreno |
| BA-brand-07 | P2       | Limiter je proxy/deployment-sensitive, fixed-window i per-process kada nema Redis                  | otvoreno |
| BA-brand-08 | P2       | Nema revision/event ugovora za konzistentnost login/email/Teams/template/MFA branding potrošača   | otvoreno |
| BA-brand-09 | P3       | Parcijalne settings greške se tiho pretvaraju u prazna polja bez last-known-good/health signala    | otvoreno |
| BA-brand-10 | P3       | Redis INCR/EXPIRE nije atomski, a memory map global clear resetuje sve limite                      | otvoreno |
| BA-brand-11 | P3       | Cache nema ETag/conditional GET/stale policy niti invalidaciju; “odmah” propagation tvrdnja netačna | otvoreno |
| BA-brand-12 | P3       | Public exposure klasifikacija/support contact scraping nema modulsku telemetry/administrativni hint | otvoreno |
| BA-brand-13 | P3       | Jedini suite pokriva parser; controller, service, limiter, cache i cross-channel contract nisu testirani | otvoreno |

## 13. Ključne korekcije

- **01,08–09:** atomarni versionirani branding snapshot, last-known-good i propagation event/SLA.
- **02,07,10:** atomic Redis script, bounded outage fallback, trusted-proxy test i edge/CDN limiter.
- **03–04:** full image decode + metadata strip/re-encode; zajednička write/read schema validacija.
- **05:** canonical HTTPS URL parser i eksplicitna hostname/credentials/private-host politika.
- **06,11:** content-hashed logo asset, ETag/304, cache invalidacija i response compression/bandwidth limit.
- **12–13:** public-data UI upozorenje/metrics i controller/service/integration test matrica.

## 14. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   6,80 |
| B. API i ugovori             |    12% |   6,20 |
| C. Auth/authz/scope          |    15% |   7,60 |
| D. Poslovna pravila/stanje   |    13% |   6,50 |
| E. Podaci/Prisma/transakcije |    13% |   6,10 |
| F. Sigurnost/privatnost      |    12% |   6,30 |
| G. Async/integracije         |     8% |   6,00 |
| H. Testovi/dokazivost        |    10% |   4,40 |
| I. Operativnost/perf.        |     7% |   5,60 |
| **Ukupno**                   | **100%** | **6,27/10** |

Ponderisani rezultat je **6,27/10**. Nema P1 nalaza niti hard cap korekcije. Ocjenu najviše podižu mali read-only scope, jasna public klasifikacija i strogi osnovni logo limiti; spuštaju je fail-open limiter outage, nepotpun image validation, torn snapshot i veoma uzak test dokaz.

## 15. Fazni plan

### Faza 0 — test safety net

Controller/service/Redis-memory limiter/cache testovi, settings failure/torn-read scenariji, URL corpus i real malformed/polyglot image corpus.

### Faza 1 — snapshot i read validation

Versionirani branding snapshot, zajednička write/read schema, last-known-good fallback, revision/updatedAt i propagation signal.

### Faza 2 — image asset hardening

Full decode, pixel/complexity limit, metadata strip, canonical re-encode i content-addressed asset sa pravilnim content headers/CSP.

### Faza 3 — public edge hardening

Atomic distributed limiter, outage fallback, trusted-proxy dokaz, ETag/304/CDN cache, compression i bandwidth observability.

### Faza 4 — URL/privacy/cross-channel ugovor

Canonical support URL/email policy, public disclosure UX, scrape metrics i consistency SLA za frontend/email/Teams/MFA potrošače.

### Faza 5 — finalni gate

Svi unit/integration/E2E branding scenariji zeleni na finalnom SHA-u, uključujući Redis outage, concurrent update, corrupted legacy logo, cache revalidation i multi-channel revision dokaz.

## 16. Acceptance i presuda

1. Jedan odgovor uvijek pripada jednoj branding revision.
2. Redis outage ne ostavlja javnu rutu potpuno bez limita.
3. Logo je potpuno dekodiran i kanonski re-enkodiran, ne samo header-provjeren.
4. Read path ne vraća vrijednost koja ne prolazi aktuelnu branding schemu.
5. Support URL ima canonical HTTPS/hostname/credentials policy.
6. Logo se isporučuje kao hashirani cacheable asset sa ETagom, ne kao ponavljani veliki JSON string.
7. Limiter i IP semantika rade kroz proxy i više replika.
8. Branding revision propagira se predvidivo kroz login, email, Teams, templates i MFA naming.
9. Javna PII/data klasifikacija je vidljiva administratoru i operativno mjerljiva.
10. Controller, service, limiter, cache, validator i cross-channel contract testovi prolaze.

Modul nije kritično loš: njegova public/read-only granica i osnovni image limiti su razumni. Ipak enterprise kvalitet zahtijeva atomarni snapshot, stvarni image decode, stabilan distributed limiter, efikasnu asset isporuku i mnogo širi dokaz. Iskren baseline je **6,27/10**.
