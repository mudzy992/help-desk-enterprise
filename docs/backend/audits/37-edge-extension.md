# Backend audit 37 — `edge-extension`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **2,83/10**  
**Nalazi:** 7 P1, 10 P2, 4 P3

## 1. Executive summary

`edge-extension` je mali backend facade za browser companion: vraća bootstrap konfiguraciju, prima notification delivery/open receipts, izlistava pending remote-assistance zahtjeve i evidentira da je korisnik otvorio Quick Assist. Stvarno kreiranje remote zahtjeva živi u `tickets`, a transport notifikacija u `notifications`/integration queue/websocket slojevima. Površina ima session autentikaciju, role guard, DTO whitelist, exact email-domain poređenje, default-engaged kill switch, visibility provjeru notificationa i djelimičan ticket ownership/participant check.

Ipak očekivanje niske ocjene je potvrđeno: baseline je **2,83/10**. Modul nije razvio vlastiti pouzdani lifecycle niti dosljednu security boundary. Bootstrap izračuna `allowed`, ali ostala tri endpointa uopće ne primjenjuju isti access gate. Add-on off, module off, notification channel off, kill switch, domain restriction i minimum client version zato ne gase receipts, pending listu i remote acknowledge. `pendingTicketIds` čak ne učitava konfiguraciju. Kill switch nije stvarni server-side kill switch.

Remote lifecycle je izveden iz slobodnog teksta `TicketMessage.body`, bez posebnog state modela, request ID-a, recipienta, expiryja ili atomarne tranzicije. Acknowledge traži samo postojanje bilo kojeg historijskog `remote_requested` događaja; ne dokazuje da je on posljednji lifecycle događaj, još važeći niti namijenjen trenutnom korisniku. Ako je `auditAcknowledge=false`, deduplikacija se potpuno gubi jer koristi audit zapis kao idempotency ledger, pa svaki poziv dodaje novi system event. I sa auditom postoji read-before-write race i nema unique invarianta.

Receipt također koristi audit log kao business storage/idempotency tabelu, sa read-before-write raceom. Remote authorization ne koristi aktuelni centralni ticket access policy: requester ili historijski non-follower participant prolazi bez provjere trenutnog scopea, confidentialityja, OU/group membershipa, statusa ili request recipienta. Configuration se učitava kroz niz nezavisnih settings readova, pa bootstrap i mutacije mogu vidjeti torn verziju. Pending query nema paginaciju/limit i čita sve lifecycle poruke svih otvorenih requester ticketa u memoriju.

Od 2 direktna suitea, 1 je prošao, a 1 compile-blockiran zbog nepotpunog generated Prisma clienta; 4/4 izvršena testa su zelena. Nema controller, authorization, concurrency, lifecycle, kill-switch, receipt race niti E2E testa. Popravke nisu implementirane.

## 2. Scope i inventar

- 15 produkcijskih TypeScript fajlova;
- 2 direktna spec fajla;
- 836 direktno izmjerenih produkcijskih LOC (registar navodi 851);
- 1 controller, 2 injectable servisa i skup funkcionalnih helpera;
- 4 session endpointa: bootstrap, receipt, pending remote IDs i acknowledge;
- cross-module zavisnosti: settings, notifications audience, tickets remote lifecycle i audit log;
- nema vlastitih Prisma modela niti migracija;
- nema posebnog extension credentiala/device registrationa, release attestationa ili protocol schema versiona.

## 3. Endpoint i trust model

Sva četiri endpointa prihvataju standardnu web session autentikaciju i role `USER/AGENT/ADMIN/SUPER_ADMIN`. To sprečava anoniman pristup, ali ne dokazuje da je pozivalac Edge extension, odobren browser/device ili podržana verzija. Bootstrap `allowed` je samo odgovor klijentu, ne server-side capability token.

`bootstrap` primjenjuje addon/module/notifications/kill switch/domain/version evaluaciju. `recordReceipt` provjerava samo `receiptsEnabled`. `pendingRemoteRequests` ne učitava nijednu Edge konfiguraciju. `acknowledgeRemote` provjerava samo `remoteEnabled`. Zbog toga kompromitovana/stara ekstenzija ili obični browser session može nastaviti operacije nakon kill switcha, module/addon gašenja, domain promjene ili version blocka.

Potreban je jedan centralni server-side access gate za svaku operaciju, sa operation-specific capabilityjem. Bootstrap treba izdati kratkotrajni audience-bound capability/session nakon punog gatea ili svaki endpoint mora ponoviti punu evaluaciju. Kill switch mora prethoditi svim DB poslovnim operacijama.

## 4. Remote-assistance lifecycle

Remote request je `TicketMessage` tipa `SYSTEM_EVENT` čiji je `body` string `ticket_remote_requested`. Acknowledge dodaje drugi system-event string. Nema `RemoteAssistanceRequest` entiteta sa ID-em, statusom, requesterom/recipientom, initiatorom, expiryjem, nonceom, acknowledgedAt/by, canceled/expired stanjem i optimistic versionom.

`findLatestRemoteRequestAt` nalazi najnoviji request, ali ignoriše kasnije acknowledge/cancel/close događaje. `acknowledge` zato dokazuje samo da se request nekada desio. Audit lookup je po ticketu+actoru, ne po konkretnom requestu. Novi request istog ticketa nakon starog acknowledgea ostaje tretiran kao duplicate za istog usera. Obrnuto, kada je audit isključen, nema zapisa za duplicate check i svaki retry stvara još jedan acknowledge event.

`pendingTicketIds` pokušava rekonstruisati posljednje stanje iz request/acknowledge poruka i radi pravilniji latest-event izbor, ali nema request ID i sve acknowledge poruke bilo kojeg aktera zatvaraju lifecycle za requester listu. Request/acknowledge writeovi i audit nisu u jednoj transakciji. Concurrent acknowledge može duplirati system event i audit.

Potreban je typed state model i transakcijski compare-and-set (`PENDING -> ACKNOWLEDGED`) nad konkretnim request ID-em, sa expiry/cancel/revoke pravilima i unique idempotency keyem.

## 5. Remote authorization

Za acknowledge se učita ticket samo sa `id/requesterId`. Ako pozivalac nije requester, dovoljan je bilo koji `TicketParticipant` zapis čija uloga nije `FOLLOWER`. Ne poziva se centralni `loadAccessibleTicket`, authorization context loader niti ticket policy binder. Ne provjeravaju se aktuelni organizational scope, group/OU membership, confidential visibility, deactivated relationship, ticket status niti da je remote request adresiran tom korisniku.

Historijski participant row može zato postati trajna capability veza ako se membership/scope kasnije promijeni. Requester može acknowledge i kada request možda nije namijenjen njemu; model ionako nema recipient. Ovo je authorization drift u sigurnosno osjetljivom remote-assistance toku.

Request creation u `tickets` pravilno traži writable centralni access i staff visibility, ali to nije dovoljno za recipient-side acknowledge. Potrebna je eksplicitna recipient binding/consent politika i ponovno korištenje aktuelnog centralnog ticket access policyja.

## 6. Kill switch i konfiguracija

Kill switch default je `true`, što je dobra fail-safe početna vrijednost. Empty allowed domain pada na prvi internal domain, a bez domena niko nije bootstrap-allowed. Attachments defaultuju off i Quick Assist traži user click po defaultu.

Međutim `loadEdgeExtensionConfiguration` čita približno 18 settinga sekvencijalno i nezavisno. Ne postoji versionirani snapshot. Administrator može promijeniti parent/kill switch između readova i jedan request dobiti torn konfiguraciju. Svaki bootstrap/receipt/ack izaziva veliki broj settings poziva, što povećava latency i failure površinu. Pending ih uopće ne čita.

Većina boolean capabilityja koristi `!== false`, pa `undefined`/neočekivana vrijednost postaje enabled. Registry validacija to obično sprečava, ali runtime fallback nije fail-closed. Posebno su module, WS, receipts, dedup, polling, chat, remote, user-click i audit permissive na missing value. Addon i attachments koriste strožiji `=== true`; kill switch missing ostaje engaged.

Bootstrap vraća `auditAcknowledge`, internu compliance/implementation konfiguraciju koja klijentu nije potrebna. Vraća i allowed domain, subject ID i sve capability vrijednosti čak kada je `allowed=false`. To nije direktna eskalacija, ali nepotrebno otkriva internu politiku.

## 7. Notification receipts

Receipt provjerava da je notification vidljiv useru koristeći isti audience helper kao inbox, uključujući group/OU audience. To je pozitivna reuse zaštita. Međutim delivery/open receipt nije zapisan u `NotificationReceipt`, nego kao opšti `AuditLog` zapis. Audit tabela postaje business state i dedup ledger.

Idempotency radi `findFirst` pa zaseban insert, bez unique ključa/transakcije. Concurrent retry može proizvesti duplicate audit records. `eventId` dolazi od klijenta, nije vezan za stvarni realtime event i može biti proizvoljan string. Deduplikacija ga ignoriše; odgovor vraća klijentov event ID čak i za duplicate. DTO nema `MaxLength`, UUID/CUID format ni canonicalization za notification/event ID.

Receipt ne primjenjuje addon/module/kill switch/domain/version gate. Ne postoji rate limit. Authenticated user može automatizovano sondirati notification IDs (404 u oba unauthorized/not-found slučaja dobro umanjuje oracle), generisati do dvije audit stavke po svakoj vidljivoj notifikaciji i opteretiti audience/settings upite.

Potreban je dedicated receipt model sa unique `(notificationId,userId,kind)` ili `(eventId,userId,kind)`, server-derived event bindingom, timestamps, retentionom i atomskim upsertom. Audit treba biti posljedica, ne primarni storage.

## 8. Version i domain policy

Email domain match je exact, case-insensitive i ne koristi ranjiv suffix match. To je dobro. Ipak samo jedan allowed domain se bira; fallback uzima prvi CSV internal domain, pa multi-domain organizacije mogu nepredvidivo blokirati legitimne korisnike. Domain je slaba device/client trust kontrola jer autentikovani web session već nosi email, a svako s tim sessionom može zvati API bez extensiona.

Version parser koristi `parseInt` po dotted segmentu. Vrijednosti poput `1x.2`, `1.-1`, prazni segmenti ili vrlo dugi stringovi dobijaju neočekivanu semantiku; nema strict SemVer/dotted-numeric regexa ni `MaxLength` na queryju. `1x` se tretira kao 1. Minimum version se provjerava samo u bootstrapu, pa se može potpuno zaobići direktnim pozivom drugih endpointa.

## 9. Query boundedness i operativnost

Pending tok:

1. čita sve otvorene tickete requestera bez limita;
2. zatim čita sve request/ack lifecycle poruke za sve te tickete;
3. sortira ih u bazi i reducira u memoriji;
4. vraća nepageiniran niz svih ticket ID-jeva.

Za velikog requestera ili dugu historiju to je neograničen query/response i lako polling amplification mjesto. Bootstrap čak klijentu preporučuje polling svakih 60–120 sekundi. Potrebni su dedicated indexed state, cursor paginacija, hard limit, `updatedAfter`, ETag i rate limit.

Nema metričkih signala za denied bootstrap reason, receipt/ack duplicates, kill switch bypass pokušaje, stale request, query cardinality ili settings latency. Nema retentiona za receipt audit/system-event rast niti runbooka za emergency kill.

## 10. Audit atomarnost

Acknowledge prvo upisuje system event, zatim opcionalno audit. Ako audit padne, API vraća grešku i retry dodaje novi event. Ako je audit config false, idempotency namjerno prestaje raditi. Metadata pogrešno zapisuje `{ event: remoteRequested }` umjesto konkretnog request/event ID-a i acknowledge actiona.

Receipt audit je jedini poslovni zapis i također nije unique. Audit toggle ne smije kontrolisati correctness. Remote event, state transition i obavezni security audit trebaju biti dio jedne transakcije ili transactional outboxa; compliance audit ne treba biti opcionalan za Quick Assist consent.

## 11. Test dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath \
  src/modules/edge-extension/edge-extension.service.spec.ts \
  src/modules/edge-extension/evaluate-edge-extension-access.spec.ts
```

Rezultat:

- **1/2 suitea prošao**;
- **1/2 compile-blockiran**;
- **4/4 izvršena testa prošla**;
- blokada: generated `PrismaService` nema `notification`, `auditLog` i potrebni audit transactional shape.

Zeleni testovi pokrivaju osnovni access evaluator. Compile-blokirani service spec namjerava pokriti bootstrap kill switch i receipt visibility/dedup. Nema testova za controller/guards/DTO bounds, full gate na svakom endpointu, pending listu, acknowledge authorization/lifecycle, audit-off ponašanje, race, multiple requests, stale participant, confidential ticket, pagination, settings snapshot ili E2E extension protokol.

## 12. Pozitivni nalazi

1. Svi endpointi zahtijevaju validnu session autentikaciju i eksplicitne role.
2. ValidationPipe koristi whitelist i `forbidNonWhitelisted`.
3. Bootstrap redoslijed prvo provjerava addon/module/notification/kill switch.
4. Kill switch registry default je engaged (`true`).
5. Allowed email domain se poredi exact i case-insensitive.
6. Bez allowed/internal domene bootstrap je deny.
7. Attachments su default-off.
8. Quick Assist je konfigurisan za explicit user click po defaultu.
9. Notification visibility koristi centralni audience helper i vraća uniformni not-found.
10. Request creation u `tickets` koristi writable centralni policy i staff visibility.
11. Remote request rate window postoji na create strani.
12. Pure access suite: 4/4 izvršena testa zelena.

## 13. Registar nalaza

| ID         | Severity | Nalaz                                                                                                  | Status   |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------ | -------- |
| BA-edge-01 | P1       | Receipt, pending i acknowledge zaobilaze puni addon/module/kill-switch/domain/version access gate      | otvoreno |
| BA-edge-02 | P1       | Remote lifecycle je slobodni TicketMessage tekst bez request ID-a, recipienta, expiryja i CAS stanja  | otvoreno |
| BA-edge-03 | P1       | Acknowledge prihvata bilo koji historijski request, ne aktivni/latest pending request                   | otvoreno |
| BA-edge-04 | P1       | `auditAcknowledge=false` gasi idempotency; svaki retry dodaje novi acknowledge system event            | otvoreno |
| BA-edge-05 | P1       | Acknowledge auth koristi historijski participant row umjesto aktuelnog centralnog ticket policyja      | otvoreno |
| BA-edge-06 | P1       | Receipt koristi AuditLog kao business/idempotency storage bez unique invarianta i atomskog upserta     | otvoreno |
| BA-edge-07 | P1       | Remote event i audit su neatomarni; audit failure/retry može duplirati security-sensitive događaj      | otvoreno |
| BA-edge-08 | P2       | Konfiguracija se čita kroz nezavisne settings readove i može biti torn unutar jednog requesta          | otvoreno |
| BA-edge-09 | P2       | Većina missing/neočekivanih capability settinga fail-open postaje enabled                              | otvoreno |
| BA-edge-10 | P2       | Pending query/response nema limit/paginaciju i skenira lifecycle historiju svih otvorenih ticketa      | otvoreno |
| BA-edge-11 | P2       | Remote request nema explicit recipient/consent/cancel/revoke/expiry model                              | otvoreno |
| BA-edge-12 | P2       | Concurrent receipt/ack read-before-write race proizvodi duplikate                                     | otvoreno |
| BA-edge-13 | P2       | Version parser nije strict i minimum version se može zaobići direktnim endpoint pozivom                | otvoreno |
| BA-edge-14 | P2       | Endpointi nemaju operation/user rate limit; polling može amplificirati skupe DB/settings upite         | otvoreno |
| BA-edge-15 | P2       | Receipt `eventId` nije server-bound na realtime event i nema format/length ograničenje                 | otvoreno |
| BA-edge-16 | P2       | Nema dedicated retentiona za receipt audit i remote system-event rast                                 | otvoreno |
| BA-edge-17 | P2       | Bootstrap `allowed` nije server-enforced capability/device/release attestation                         | otvoreno |
| BA-edge-18 | P3       | Bootstrap vraća internu domain/audit/capability politiku i kada je pristup odbijen                     | otvoreno |
| BA-edge-19 | P3       | Single-domain fallback bira samo prvi internal domain i ne podržava jasnu multi-domain politiku        | otvoreno |
| BA-edge-20 | P3       | Ticket/notification/event/version parametri nemaju konzistentne MaxLength/ID format validatore         | otvoreno |
| BA-edge-21 | P3       | 1/2 suitea compile-blockiran; nema controller, lifecycle, concurrency ni E2E protokol dokaza           | otvoreno |

## 14. Ključne korekcije

- **01,17:** centralni operation gate na svakom endpointu ili kratkotrajni audience-bound extension capability; kill switch kao prvi server-side uslov.
- **02–05,11:** dedicated `RemoteAssistanceRequest` sa request/recipient/expiry/status/version stanjem i centralnim ticket authorization recheckom.
- **04,07,12:** correctness nezavisan od audit togglea; transactional CAS + obavezni audit/outbox.
- **06,12,15:** dedicated receipt tabela, server-derived event ID i unique atomic upsert.
- **08–09:** versionirani settings snapshot, cache invalidacija i fail-closed security capabilities.
- **10,14:** indexed pending state, cursor pagination, hard caps i distributed/user limiter.
- **13,20:** strict bounded version/ID DTO schema.
- **16,18–21:** retention, minimal bootstrap response, multi-domain policy i kompletan integration/E2E dokaz.

## 15. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   3,20 |
| B. API i ugovori             |    12% |   3,40 |
| C. Auth/authz/scope          |    15% |   3,00 |
| D. Poslovna pravila/stanje   |    13% |   2,50 |
| E. Podaci/Prisma/transakcije |    13% |   2,20 |
| F. Sigurnost/privatnost      |    12% |   3,10 |
| G. Async/integracije         |     8% |   3,00 |
| H. Testovi/dokazivost        |    10% |   2,40 |
| I. Operativnost/perf.        |     7% |   2,90 |
| **Ukupno**                   | **100%** | **2,83/10** |

Ponderisani rezultat je približno 2,83. Konačni baseline **2,83/10** uzima u obzir mali scope i postojeće pozitivne guardove, ali ostaje strogo ograničen sa sedam P1 nalaza. Modul nema enterprise-grade remote lifecycle ni provodiv kill-switch boundary.

## 16. Fazni plan

### Faza 0 — safety net

Otključati oba suitea; dodati controller/guard, gate matrix, audit-off, duplicate race, multiple request, expiry, stale participant/confidential scope, pagination i real extension E2E contract testove.

### Faza 1 — server-side trust boundary

Jedinstveni access gate za svaki endpoint, fail-closed snapshot config, strict version/protocol schema, device/release capability i emergency kill dokaz.

### Faza 2 — remote lifecycle

Dedicated remote request model, explicit recipient/consent, expiry/cancel/revoke, centralni ticket policy, CAS transitions i mandatory immutable audit/outbox.

### Faza 3 — receipts i idempotency

Dedicated receipt model, server event binding, unique atomic upsert, retention i rate limiting.

### Faza 4 — bounded operations

Indexed pending query, cursor/limits, delta polling/ETag, config cache, metrics, alerts i runbooks.

### Faza 5 — finalni gate

Svi suiteovi zeleni; browser extension ↔ API compatibility, kill switch, remote consent, retry/concurrency, confidentiality i multi-instance testovi na finalnom SHA-u.

## 17. Acceptance i presuda

1. Addon/module/kill switch/domain/version gate se server-side primjenjuje na svaku operaciju.
2. Remote request ima jedinstven ID, recipient, expiry i atomsku state machine tranziciju.
3. Historijski participant ili request ne daje trajnu remote capability.
4. Audit toggle ne može promijeniti idempotency/correctness.
5. Receipt i acknowledge su race-safe i tačno-once na business nivou.
6. Pending endpoint je indexiran, limitiran i paginiran.
7. Konfiguracija je atomarni fail-closed snapshot.
8. Parametri i protocol/version schema su strogo bounded.
9. Retention, observability i emergency runbook su izvršni.
10. Oba suitea i kompletna integration/E2E matrica prolaze.

Mali broj fajlova ne znači mali rizik: modul upravlja browser companion pristupom i remote-assistance consent signalom, ali trenutno se oslanja na klijentski bootstrap, audit log i tekstualne ticket evente umjesto provodive server-side state/security granice. Iskren baseline je **2,83/10**.
