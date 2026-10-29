# Backend audit 07 — settings

**Status:** audit završen  
**Datum:** 2026-10-22  
**Modul:** `backend/src/modules/settings`  
**Baseline ocjena:** **6,35/10**  
**Nalazi:** 3 P1, 6 P2, 2 P3, 10 pozitivnih zapažanja  
**Implementacija:** nije započeta; korekcije čekaju završetak kompletnog backend audita

## 1. Executive summary

`settings` je centralni configuration control plane za autentikaciju, session politiku, CAPTCHA/rate limiting, read-only mode, audit, privatnost, SMTP/inbound e-mail, directory sync, integracije, tikete, SLA, izvještaje i gotovo sve add-on funkcije. Modul ima kvalitetan typed registry, startup provjeru metadata, value/type/allowed-value validaciju, atomski batch write, obavezan razlog, dependency graph i redakciju secreta iz registry i change-log responsea. Write ruta traži `settings.write`; obični ADMIN bez tog permissiona ne može mutirati postavke.

Tri P1 nalaza ipak značajno spuštaju baseline. Prvo, `secret` je samo klasifikacija: stvarna vrijednost se čuva kao plaintext JSON u `AppSetting.value`; tu su JWT signing secret, LDAPS bind password, SMTP/Graph/Teams credentials, private key PEM, webhook HMAC i drugi credentiali. Drugo, settings snapshot i realtime hub su process-local. Druga instanca može do pet sekundi koristiti staru security konfiguraciju, a `settings.updated` nije distribuiran; promjena auth moda/signing secreta, read-only moda, CAPTCHA/rate-limit/session pravila zato nije cluster-atomic. Treće, dependency provjera nema revision/serialization ugovor: paralelne transakcije nad parent/dependent ključevima mogu obje validirati stari snapshot i commitovati konačno stanje koje krši registry dependency invariant.

Dodatno, `readOnly` je samo UI metadata i API ga ne enforcea; svaki writer sa `settings.write` može izmijeniti install-owned bookkeeping. Svaki ADMIN — uključujući OU-scoped ADMIN bez `settings.write` — može pročitati kompletan privatni registry i vrijednosti svih non-secret postavki. Redacted placeholder nije rezervisan na write strani i može postati stvarni secret. Change log nema request ID korelaciju, a automatski reset dependent ključeva nema zaseban per-key change-log zapis. DTO/registry nemaju jedinstvene size limite za ključ i string vrijednost.

## 2. Scope i inventar

| Metrika                    |                                                                                                   Vrijednost |
| -------------------------- | -----------------------------------------------------------------------------------------------------------: |
| TypeScript fajlovi         |                                                                                                          131 |
| Produkcijski fajlovi       |                                                                                                          103 |
| Spec fajlovi               |                                                                                                           28 |
| Produkcijske linije        |                                                                                                        9.375 |
| Kontroleri                 |                                                                                                            2 |
| Servisi                    |                                                                                                            1 |
| Definicijske datoteke      |                                                                                                           55 |
| Direktne module zavisnosti | `assets`, `authentication`, `authorization`, `branding`, `change-log`, `install`, `notifications`, `tickets` |

Pregledane povezane površine:

- `AppSetting` Prisma model i persistence classification;
- registry construction, metadata validator i sve definicijske porodice;
- secret, private i public read/write tokovi;
- dependency state, preview i reset planner;
- request/shared snapshot cache i cache invalidation helperi;
- settings realtime hub i WebSocket broadcast bridge;
- config-versioning collect/apply snapshot tok;
- install wizard direktni setting writeri i read-only ključevi;
- authentication/session/CAPTCHA/rate-limit/read-only potrošači;
- SMTP, inbound e-mail, directory, Teams, webhook i redaction secret potrošači;
- E2E 11, 16, 22, 23 i 43 te svih 28 direktnih spec fajlova.

## 3. Arhitektura i konfiguracijski lifecycle

### 3.1. Registry

`applicationSettings` sastavlja definicije iz 55 datoteka. Svaka definicija nosi:

- stabilni key, kategoriju, opis i i18n metadata;
- `public`, `private` ili `secret` visibility;
- boolean/number/string tip;
- default, required i allowed-values pravila;
- opcionalni custom `assertValue`;
- dependency uslove (`equals`, `oneOf`, `isSet`, `notEmpty`);
- inactive vrijednost i `readOnly` UI oznaku.

Startup validator odbija duple ključeve, pogrešne visibility/category/type/default kombinacije, nepoznate dependency ključeve i nevažeću metadata strukturu.

### 3.2. Read

- `GET /settings/public` traži autentifikovanu sesiju i vraća samo public vrijednosti.
- `GET /settings` traži ADMIN role key i vraća cijeli registry.
- Secret registry entry vraća samo `isSet` i `[REDACTED]`; default i stvarna vrijednost nisu izloženi.
- Private non-secret vrijednosti vraćaju se u cijelosti.
- Interni kod mora za secret koristiti `getSecretForInternalUse`; `getSetting` eksplicitno odbija secret definiciju.
- Unutar requesta čita se jedan snapshot cijele `AppSetting` tabele; cross-request snapshot se lokalno ponovo koristi do pet sekundi.

### 3.3. Single i batch write

- `PUT /settings` i `/settings/batch` traže ADMIN + `settings.write`;
- razlog je obavezan i limitiran;
- batch ima 1–50 distinct ključeva;
- svi keyevi i vrijednosti validiraju se prije writea;
- trenutni state, projected state, dependency reset i finalna dependency provjera rade se u jednoj DB transakciji;
- svaki eksplicitni key dobija change-log zapis; dependent reseti se navode u parent zapisu;
- nakon commita request-local snapshot se dopunjava i lokalni realtime događaj se objavljuje za odabrane ključeve.

### 3.4. Alternative write površine

Install wizard i config-versioning imaju direktne `AppSetting` write tokove. Cache helper postoji i koristi se na tim putanjama, ali jedinstveni registry/persistence gateway nije tehnički nametnut na nivou modela. Config snapshot izostavlja secret vrijednosti, što je pozitivno; njegov apply path direktno upsertuje non-secret keyeve, pa puna validacija/dependency/change-log odgovornost ostaje u modulu 30.

## 4. API/guard matrica

| Ruta                             | Guard           | Permission            | Response/efekat                                               |
| -------------------------------- | --------------- | --------------------- | ------------------------------------------------------------- |
| `GET /settings/public`           | session         | nema role zahtjeva    | sve effective public vrijednosti                              |
| `GET /settings`                  | session + ADMIN | nema read permissiona | puni registry; private vrijednosti, secret presence/redaction |
| `GET /settings/addons`           | session + ADMIN | nema read permissiona | stored add-on stanje                                          |
| `GET /settings/email-channel`    | session + ADMIN | nema read permissiona | e-mail channel konfiguracija bez passworda                    |
| `GET /settings/dependents?key=…` | session + ADMIN | nema read permissiona | projected reset lista                                         |
| `PUT /settings`                  | session + ADMIN | `settings.write`      | jedan key + eventualni reseti                                 |
| `PUT /settings/batch`            | session + ADMIN | `settings.write`      | 1–50 distinct keyeva atomski                                  |

Write je globalan: scoped assignment ne zadovoljava globalni `settings.write` bez scope-agnostic/unscoped granta. Read nije vezan za `settings.read` ili SuperAdmin i zato svaki ADMIN role holder vidi globalnu privatnu konfiguraciju.

## 5. Registry/value/dependency analiza

### Value validacija

- tip i allowed-values su centralizovani;
- broj odbija `NaN`, ali ne centralno `Infinity`; custom asserti pokrivaju mnoge, ne nužno sve brojčane definicije;
- string nema centralni max length; pojedine definicije imaju custom assert, druge ne;
- DTO `value` je `IsDefined`, a stvarni tip se provjerava registryjem;
- key DTO nema `MaxLength` iako unknown key brzo pada u registryju.

### Dependency model

Projected batch omogućava atomsko uključivanje parenta i dependenta. Gašenje parenta bez potvrđenog reseta pada; sa potvrdom resetuje samo trenutno aktivne dependente, zatim provjerava transitive stanje. Secret dependency može pitati samo `isSet`, ne čitati vrijednost.

Model nema globalni config revision niti row/advisory lock nad dependency closureom. Pod PostgreSQL default isolationom dvije transakcije mogu čitati isto početno stanje i pisati različite ključeve bez konflikta.

### Read-only semantika

Komentar tipa eksplicitno kaže da je `readOnly` metadata za UI, „not a new API rule“. Deset install-owned definicija imaju `readOnly:true`, ali persistence path ne provjerava oznaku. API stoga prihvata direktan PUT nad profilom, blueprintom, policy-pack zapisom, install step completion/skipped stanjem i checklist markerom.

## 6. Secret i privacy analiza

Registry i change log korektno rediguju secret vrijednost. Međutim:

- `AppSetting.value` je obični Prisma `Json`;
- `isSecret` i `scope=PRIVATE` su oznake, ne kriptografska zaštita;
- nema envelope encryptiona, KMS/Vault reference, key versiona ni rotation metadata;
- backup, read replica, SQL operator ili ORM dump vidi credential u čistom obliku;
- shared/request snapshot cijele tabele drži sve secre­te u process memory mapama;
- `[REDACTED]` nema write-side sentinel semantiku;
- secret update nema compare/rotation/grace ugovor.

Posebno osjetljive klase uključuju JWT signing secret, LDAPS bind credential, SMTP/Graph/Teams credentiale, webhook HMAC secret, CAPTCHA secret i certificate/private-key PEM.

## 7. Transakcije, concurrency i propagacija

- Batch DB write i njegovi change-log zapisi su atomski.
- Dependency reseti su dio iste transakcije.
- Nema config revisiona, ETaga, expected-version tokena ni optimistic concurrency.
- Dva administratora mogu tiho prepisati isti key; zadnji commit pobjeđuje.
- Parent/dependent write skew može proći pojedinačne finalne provjere i ostaviti globalno nevažeće stanje.
- `rememberSettingValue` invalidira samo shared cache trenutnog procesa.
- Druge instance konvergiraju tek poslije default 5.000 ms TTL-a.
- `SettingsRealtimeHub` je obični lokalni listener `Set`; nema Redis/pub-sub/outbox propagaciju.
- WebSocket broadcast zato nastaje samo na instanci koja je obradila write, osim ako deployment routing slučajno poveže sve klijente upravo na nju.
- Publish je poslije commita, optional i nedurable; listener failure/restart nema retry.

## 8. Privilege-escalation i sigurnosni uticaj

Direktan write bez `settings.write` nije pronađen kroz SettingsController. Međutim:

- OU-scoped ADMIN može čitati globalne private postavke jer read rute traže samo role key;
- writer može zaobići UI read-only zabranu direktnim API zahtjevom;
- promjena auth moda/JWT secreta ima cluster-neujednačen prozor;
- stale CAPTCHA/rate-limit/session/read-only postavka na drugoj instanci može privremeno zadržati slabiju sigurnosnu politiku;
- dependency write skew može ostaviti uključenu integraciju bez potrebnog credentiala ili uključenu security funkciju sa neusklađenim parentom;
- zamjena secreta literalom `[REDACTED]` može izazvati credential outage, a za JWT secret i promjenu session-validacije.

Nema P0 dokaza o neautentifikovanom secret exfiltrationu ili writeu. Secret read API se pravilno odvaja od običnog setting reada.

## 9. Testovi i izvršeni gateovi

### 9.1. Postojeći dokazi

Dvadeset osam spec fajlova pokriva:

- registry metadata i kategorije;
- type/default/allowed-values definicije;
- secret redakciju registryja i change loga;
- batch atomicity, razlog i distinct keyeve;
- dependency evaluate/preview/reset i transitive scenarije;
- settings snapshot TTL/read-after-write;
- settings.write authorization compatibility;
- addon/e-mail/reports/observability/security-session definicije;
- realtime payload klasifikaciju;
- dead routing setting housekeeping;
- HTTP module wiring.

Nedostaju direktni testovi za encryption-at-rest, read-only API enforcement, redacted-placeholder write, parallel dependency write skew, multi-instance cache/realtime propagaciju, scoped-ADMIN registry read i request-linked change audit.

E2E 16 i 23 pišu postavke; E2E 11 provjerava povezanu e-mail konfiguraciju/UI, a 43 privacy editor. Nema cluster/concurrency/secret-storage negativnog E2E dokaza.

### 9.2. Lokalni rezultat

```bash
npx jest --runInBand src/modules/settings
```

Rezultat:

- **28 suiteova otkriveno**;
- **13 suiteova prošlo**;
- **60/60 izvršenih testova prošlo**;
- **15 suiteova nisu kompajlirana** zbog nedostajućeg generated Prisma klijenta/enuma i posljedičnih `PrismaService` type grešaka.

Ovo nije zeleni gate. Blokada je isti checkout reproducibility problem evidentiran u modulima 01–06.

## 10. Pozitivni nalazi

1. Write rute traže eksplicitni `settings.write`, ne samo ADMIN role key.
2. Registry startup odbija duple/nekonzistentne definicije i nepoznate dependency reference.
3. Value type, allowed-values, default i custom assert pravila su centralizovani.
4. Batch je ograničen na 50 distinct ključeva i DB all-or-nothing.
5. Razlog je obavezan i change log je u istoj transakciji sa vrijednošću.
6. Secret se ne vraća kroz public/private API i rediguje se u registry/change-log prikazu.
7. Config snapshot namjerno ne uključuje secret vrijednosti.
8. Dependency engine podržava transitive reset i finalnu projected-state provjeru.
9. Request-local read-after-write snapshot se ažurira nakon uspješnog writea.
10. Security-sensitive realtime payload ne nosi vrijednost, samo key/visibility/time/session-invalidating oznaku.

## 11. Registar nalaza

| ID             | Severity | Naslov                                                                                        | Status   | Veličina |
| -------------- | -------- | --------------------------------------------------------------------------------------------- | -------- | -------- |
| BA-settings-01 | P1       | Secret vrijednosti se čuvaju kao plaintext JSON bez envelope encryptiona                      | otvoreno | L        |
| BA-settings-02 | P1       | Security konfiguracija i realtime događaj nisu cluster-atomic niti distribuirano invalidirani | otvoreno | L        |
| BA-settings-03 | P1       | Concurrent dependency write skew može commitovati nevažeće globalno stanje                    | otvoreno | L        |
| BA-settings-04 | P2       | `readOnly` je samo UI metadata i API dopušta izmjenu install-owned ključeva                   | otvoreno | M        |
| BA-settings-05 | P2       | Svaki ADMIN može čitati globalni private registry bez settings-read permissiona               | zatvoreno | M        |
| BA-settings-06 | P2       | `[REDACTED]` placeholder može biti pohranjen kao stvarni secret                               | otvoreno | S        |
| BA-settings-07 | P2       | Change log nema request ID korelaciju za configuration mutation                               | otvoreno | M        |
| BA-settings-08 | P2       | Automatski dependent reset nema zaseban per-key change-log zapis                              | otvoreno | M        |
| BA-settings-09 | P2       | Last-write-wins nema revision/ETag i može tiho izgubiti administratorsku izmjenu              | otvoreno | M        |
| BA-settings-10 | P3       | Key/string/JSON vrijednosti nemaju jedinstvene centralne size granice                         | otvoreno | M        |
| BA-settings-11 | P3       | Realtime key allowlist je ručno održavana i ne prati registry metadata                        | otvoreno | S        |

## 12. Detaljni nalazi

### BA-settings-01 — Secret klasifikacija bez kriptografske zaštite

- **Dokaz:** `AppSetting.value Json` prima validirani secret direktno; `mapVisibilityToPersistence` postavlja samo `PRIVATE/isSecret=true`. Čitanje vraća plaintext internim loaderima. Nema ciphertext, nonce, key ID ili external secret reference.
- **Uticaj:** DB dump/read replica/SQL pristup ili backup kompromis otkriva signing, bind, SMTP, Graph, Teams, webhook i private-key credentiale. Jedan storage incident prelazi u authentication/integration compromise.
- **Korekcija:** envelope encryption sa versioniranim KEK/DEK ili external secret manager; ciphertext + key version u DB-u; stroga decryption boundary, rotation i backup/redaction politika.
- **Acceptance:** SQL/backup vidi samo ciphertext/reference; key rotation bez downtimea; application decrypt audit/metric; secret nikad ne ulazi u snapshot/export/log.
- **Owner:** security/platform + settings owner.

### BA-settings-02 — Process-local konfiguracijska propagacija

- **Dokaz:** shared snapshot je process-local `WeakMap` sa default TTL 5 s; write resetuje samo lokalnu mapu. `SettingsRealtimeHub` je lokalni listener set bez broker/outboxa. Payload se objavljuje poslije commita optional chainingom.
- **Scenarij:** instanca A uključi read-only/CAPTCHA ili rotira JWT secret; instanca B nastavi koristiti staru vrijednost do TTL-a i njeni socket klijenti ne dobiju `settings.updated`.
- **Uticaj:** cluster istovremeno primjenjuje različitu auth/session/rate-limit/read-only politiku; sigurnosni enforcement zavisi od load balancera.
- **Korekcija:** monotoni config revision u DB-u, durable outbox i Redis/broker broadcast; critical request loader mora detektovati stale revision ili fail closed; realtime je izvedeni signal, ne izvor istine.
- **Acceptance:** dvije instance sa zagrijanim cacheom primjenjuju novu security vrijednost na prvom narednom zahtjevu; broker fault ima retry i vidljiv lag, bez starog-policy allowa.
- **Owner:** settings + platform/authentication owner.

### BA-settings-03 — Dependency invariant nije concurrency-safe

- **Dokaz:** transakcija čita cijelu tabelu, projektuje state i provjerava finalni state, ali nema config revision/lock/serializable retry. Različiti key redovi ne stvaraju write conflict.
- **Scenarij:** A gasi parent i resetuje dependent prema snapshotu; B istovremeno uključuje dependent dok parent još izgleda aktivan. Oba finalna checka mogu proći u vlastitom snapshotu, a commit kombinacija ostavlja parent off/dependent on.
- **Uticaj:** enabled integracija/security funkcija bez potrebnog credentiala/provider parenta, neočekivani fail-open/fail-closed ili runtime outage.
- **Korekcija:** global/config-domain revision CAS ili serializable transaction sa retryjem; zaključati transitive dependency closure; finalno potvrditi expected revision pri commitu.
- **Acceptance:** parallel parent/dependent matrica završava validnim stanjem; jedan request dobija `CONFIG_STALE`, nikad oba uspjeha sa invariant violationom.
- **Owner:** settings/data owner.

### BA-settings-04 — Read-only nije server-side pravilo

- **Dokaz:** tip komentar kaže da je `readOnly` samo metadata; `persistSettingValues` ga ne provjerava. Deset install-owned ključeva označeno je read-only.
- **Uticaj:** direktni API klijent sa `settings.write` može falsifikovati install profile/blueprint/policy-pack i step/skipped/checklist bookkeeping, pa UI/readiness prikazuje stanje koje nije rezultat wizard akcije.
- **Korekcija:** owner/source metadata i server-side write policy; SettingsController odbija install-owned key, dok autorizovani install workflow koristi zaseban capability/internal command.
- **Acceptance:** PUT/batch read-only keya vraća stabilan 403/409; install owner path i dalje radi i auditira source.
- **Owner:** settings + install owner.

### BA-settings-05 — Globalni private read za svaki ADMIN role key

- **Dokaz:** list/addons/email/dependents rute imaju class-level ADMIN, ali nemaju `settings.read`; list vraća sve private non-secret effective vrijednosti i secret key/isSet metadata.
- **Uticaj:** OU-scoped ADMIN dobija globalnu sigurnosnu/integracijsku topologiju, endpointove, tenant/config detalje, retention i feature policy izvan svoje administrativne odgovornosti.
- **Korekcija:** `settings.read` kao eksplicitni global/scope-agnostic permission ili SuperAdmin-only registry; niži admin dobija minimalni domen-specifični read DTO.
- **Acceptance:** scoped ADMIN bez globalnog settings-read dobija 403; odobreni reader i dalje vidi redigovan registry.
- **Owner:** settings + authorization owner.

### BA-settings-06 — Redaction sentinel nije zaštićen na writeu

- **Dokaz:** registry prikazuje literal `[REDACTED]`; `validateSettingValue` ga tretira kao običan string, a persistence ga upisuje kao secret. Nema keep-existing sentinel pravila niti zabrane rezervisane vrijednosti.
- **Uticaj:** generički form/batch echo može zamijeniti stvarni credential placeholderom i izazvati auth/integration outage; change log ostaje redigovan pa incident ne pokazuje pogrešnu vrijednost.
- **Korekcija:** secret update koristi eksplicitno `unchanged`/`replace`/`clear` command polje; rezervisani placeholder se nikad ne prihvata kao secret.
- **Acceptance:** round-trip registry payload ne mijenja secret; literal placeholder write pada; replace/clear imaju eksplicitni audit action.
- **Owner:** settings API/security owner.

### BA-settings-07 — Nema request-linked audit korelacije

- **Dokaz:** controller čita actor ID i reason, ali ne request ID; `SettingsMutationInput` i `recordChangeLog` poziv ga ne nose.
- **Uticaj:** kritična configuration promjena ne može se pouzdano povezati s HTTP zahtjevom, gateway/WAF tragom, SuperAdmin bypassom ili incident timelineom.
- **Korekcija:** mutation context uključuje request ID/correlation ID i source; change-log schema/payload ga čuva ili povezuje s audit eventom u istoj transakciji.
- **Acceptance:** svaki settings write i reset ima isti request ID kroz API, DB log i realtime/outbox event.
- **Owner:** settings + change-log/audit owner.

### BA-settings-08 — Dependent reset je samo parent metadata

- **Dokaz:** default reset koristi `writeSetting(...skipChangeLog:true)`, delete reset radi `deleteMany` bez vlastitog loga; parent log sadrži samo reset key i action.
- **Uticaj:** historija konkretnog dependent keya ne pokazuje ko/kada ga je promijenio; prije/poslije vrijednost i entity-centric query nisu dostupni, iako parent razlog postoji.
- **Korekcija:** jedan logical batch ID i per-key redigovani child change eventi povezani s parent entryjem; secret vrijednost ostaje skrivena.
- **Acceptance:** query po resetovanom keyu vraća actor/reason/request/batch/causedBy i redigovani before/after.
- **Owner:** settings + change-log owner.

### BA-settings-09 — Last-write-wins bez očekivane verzije

- **Dokaz:** registry response nema revision/updatedAt; PUT ne prima expected version; upsert slijepo prepisuje red. Preview dependents nije kriptografski/revision vezan za kasniji write.
- **Uticaj:** dva administratora ili preview→save prozor mogu tiho izgubiti noviju odluku; prikazani reset impact može zastarjeti prije potvrde.
- **Korekcija:** global/domain revision i ETag; preview token veže expected revision, keys, values, reset plan i actor; CAS u transakciji.
- **Acceptance:** drugi write sa starim ETagom pada bez value/log/realtime promjene; stale preview ne izvršava drugi reset plan.
- **Owner:** settings owner.

### BA-settings-10 — Centralni size budget nije potpun

- **Dokaz:** key ima samo MinLength; string value centralno nema MaxLength; `AppSetting.value` je neograničeni JSON scalar u ovom ugovoru. Custom asserti nisu obavezni za svaku string/number definiciju.
- **Uticaj:** privilegovani ili kompromitovani writer može poslati ekstremnu vrijednost, povećati snapshot/DB/change-log memory i realtime/config processing trošak. `Infinity` nema centralnu zabranu za number.
- **Korekcija:** registry zahtijeva size/range metadata; globalni key/string/body budget i finite-number provjera; specijalni PEM/JSON limiti po definiciji.
- **Acceptance:** oversized key/string/PEM/JSON i non-finite broj padaju kontrolisanim 400 prije transakcije.
- **Owner:** settings API owner.

### BA-settings-11 — Realtime klasifikacija je paralelni ručni katalog

- **Dokaz:** `shouldBroadcastSetting` koristi prefix/equality allowlist nezavisan od registry definicije. Nova setting definicija može biti runtime važna, ali bez realtime signala ako developer ne promijeni drugi fajl.
- **Uticaj:** UI/session/config subscriber može ostati stale bez compile/startup greške; klasifikacija driftuje s rastom od 100+ ključeva.
- **Korekcija:** `realtimeImpact`/`invalidatesSession` metadata u definiciji, startup validator i coverage da svaki critical key ima eksplicitnu politiku.
- **Acceptance:** dodavanje critical definicije bez propagation metadata ruši registry test/startup.
- **Owner:** settings owner.

## 13. Baseline score

| Presjek                  |   Težina | Ocjena | Ponderisano | Obrazloženje                                                          |
| ------------------------ | -------: | -----: | ----------: | --------------------------------------------------------------------- |
| Arhitektura              |      10% |   7,60 |        0,76 | snažan registry/service dizajn; alternativni writeri i lokalni hub    |
| API i ugovori            |      12% |   7,20 |        0,86 | typed/batch/reason ugovor; read-only/sentinel/revision praznine       |
| AuthN/AuthZ/scope        |      15% |   7,00 |        1,05 | write permission jak; globalni private read preširok                  |
| Poslovna pravila         |      13% |   7,30 |        0,95 | dependency engine kvalitetan, ali concurrency invariant nije zatvoren |
| Podaci i transakcije     |      13% |   6,30 |        0,82 | atomic batch/log; plaintext secret i bez revisiona                    |
| Sigurnost i privatnost   |      12% |   4,80 |        0,58 | credentiali plaintext i cluster policy inconsistency                  |
| Async/integracije        |       8% |   4,80 |        0,38 | local-only cache/realtime bez durable propagacije                     |
| Testovi                  |      10% |   7,00 |        0,70 | široki unit dokazi; nema ključnih cluster/concurrency/storage testova |
| Operativnost/performance |       7% |   3,50 |        0,25 | snapshot brz, ali nema revision/lag/rotation/request trace ugovora    |
| **Ukupno**               | **100%** |        | **6,35/10** | tri P1 nalaza ograničavaju baseline                                   |

Tačna ponderisana suma prikazanih presjeka je **6,35/10**; naslovna kanonska ocjena treba pratiti tu sumu bez ručne korekcije.

## 14. Fazni plan popravki

### Faza 0 — safety net

- DB-at-rest secret inspection i backup fixture;
- two-instance security setting/cache/realtime test;
- parallel parent/dependent i same-key write matrica;
- read-only API, scoped ADMIN read i redacted-placeholder test;
- request correlation, dependent child log i size boundary testovi.

### Faza 1 — secret storage i mutation contract

- envelope encryption/external secret reference;
- versionirani key ID i migration/backfill bez plaintext loga;
- eksplicitni secret unchanged/replace/clear command;
- dual-key/grace rotation za JWT i podržane integracije;
- memory/backup/support-bundle redaction provjera.

### Faza 2 — config revision i concurrency

- monotoni globalni ili domain revision;
- ETag/expected revision na registry/write/preview;
- serializable/CAS dependency transaction sa retryjem;
- stale preview/write stabilni kodovi;
- uključiti direktne install/config writer tokove u isti revision ugovor.

### Faza 3 — distribuirana propagacija

- outbox u istoj transakciji sa setting/change logom;
- Redis/broker invalidacija svih instance snapshotova;
- critical loader revision check/fail-closed;
- distributed `settings.updated` i session invalidation;
- lag/retry/dead-letter metrike.

### Faza 4 — authorization i ownership

- globalni `settings.read` permission ili SuperAdmin read;
- server-side owner/readOnly enforcement;
- zaseban internal capability za install/config restore;
- domain-minimal read DTO-i za niže admine.

### Faza 5 — audit i hardening

- request/source/batch correlation;
- per-key child change records za reset;
- registry propagation metadata umjesto ručnog allowlista;
- centralni size/range/finite budget;
- no-op i unchanged-secret semantika.

### Faza 6 — završna verifikacija

- svih 28 suiteova zeleno sa generated Prisma klijentom;
- ciljani E2E 11, 16, 22, 23 i 43 plus novi security scenariji;
- PostgreSQL serializable/concurrency matrica;
- multi-instance Redis/broker fault test;
- secret migration/rotation/rollback rehearsal i security review.

## 15. Rizik, rollback i acceptance

### Rizik implementacije

Secret encryption migracija je najosjetljivija: pogrešan key management može onemogućiti autentikaciju i sve integracije. Config revision mora obuhvatiti SettingsService, install i config-versioning bez split-brain writera. Uvođenje settings-read permissiona može promijeniti postojeći ADMIN UX. Dependency serializacija može povećati contention, ali settings writeovi su rijetki.

### Rollback

- encryption ide dual-read plaintext/ciphertext, zatim ciphertext write, verifikacija, tek onda plaintext uklanjanje;
- KEK prethodna verzija ostaje dostupna tokom kontrolisanog grace perioda;
- revision/event dual-write prije enforce-read;
- broker outage koristi DB revision fallback, ne povratak na TTL-only sigurnost;
- read authorization feature flag uz audit, bez ponovnog izlaganja secreta;
- rollback ne smije vratiti `[REDACTED]` kao credential niti izgubiti committed dependency state.

### Globalni acceptance

1. DB/backup/replica ne sadrži plaintext credentiale.
2. Sve instance primjenjuju critical setting na prvom narednom zahtjevu i dobijaju durable event.
3. Nijedan concurrent write ne može prekršiti dependency graph niti tiho prepisati noviji revision.
4. Read-only/install-owned key nije izmjenjiv javnim settings API-jem.
5. Scoped ADMIN bez settings-read ne vidi globalni private registry.
6. Secret round-trip ne mijenja vrijednost; replace/clear je eksplicitan.
7. Svaki write/reset ima actor, reason, request ID, source i batch correlation.
8. Svaka definicija ima eksplicitnu propagation i size/range politiku.

## 16. Traceability

| Nalaz          | Kod/dokaz                                   | Test                           | Faza  |
| -------------- | ------------------------------------------- | ------------------------------ | ----- |
| BA-settings-01 | AppSetting schema + persistence map         | ciphertext DB/backup test      | 0–1   |
| BA-settings-02 | settings snapshot + local realtime hub      | two-instance critical update   | 0–3   |
| BA-settings-03 | persist projected/final state bez revisiona | parallel dependency write      | 0–2   |
| BA-settings-04 | `readOnly` metadata + persistence           | direct PUT/batch read-only     | 0–4   |
| BA-settings-05 | controller read guard + registry response   | scoped ADMIN read denial       | 0–4   |
| BA-settings-06 | redaction placeholder + validator           | registry payload round-trip    | 0–1/5 |
| BA-settings-07 | controller mutation context/change log      | request correlation            | 0–5   |
| BA-settings-08 | reset `skipChangeLog`/deleteMany            | child entity history           | 0–5   |
| BA-settings-09 | registry/write bez revisiona                | stale ETag/preview             | 0–2   |
| BA-settings-10 | DTO/value validator/schema                  | size/range boundaries          | 0–5   |
| BA-settings-11 | realtime prefix allowlist                   | critical metadata startup gate | 0–5   |

## 17. Otvorene pretpostavke

- Database/storage layer nema transparentnu encryption funkciju vidljivu u aktuelnom Prisma/write kodu; infrastrukturni disk encryption nije zamjena za field-level credential zaštitu.
- Cross-instance TTL prozor je default pet sekundi; deployment može imati jednu instancu, ali enterprise modul i Redis/WebSocket arhitektura ne smiju pretpostaviti singleton.
- Config-versioning apply validacija i audit biće detaljno ocijenjeni u modulu 30; ovdje je zabilježeno da settings invariant nema jedinstvenu tehnički nametnutu write granicu.
- Install write ownership biće dodatno provjeren u modulu 31.
- Korisnik je potvrdio kompletan CI/Playwright prolaz, ali postojeća kolekcija nema storage, concurrency i multi-instance setting scenarije.
