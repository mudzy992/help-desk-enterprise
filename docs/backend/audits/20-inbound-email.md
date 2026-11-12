# Backend audit 20 — `inbound-email`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **5,06/10**  
**Nalazi:** 3 P1, 7 P2, 3 P3

> Baseline opis iz 2026-10-23 je historijski; `BA-inbound-email-01/02/03` zatvoreni su na finding nivou u W6.38–W6.40 (§16–§18), bez promjene baseline ocjene. Puna acceptance lista iz §15 ostaje pending.

## 1. Executive summary

`inbound-email` polluje Microsoft Graph ili IMAP mailbox, parsira raw MIME, filtrira bounce/auto-reply, provjerava sendera i autentikaciju, razrješava ticket, kreira reply/reopen/new ticket, prenosi attachment i vodi raw/metadata retention. Temelj je dobar: mailbox/provider dedupe ključ, centralni ticket mutation policy, DMARC/SPF/DKIM gate, signed reply token, anti-loop pravila, 35 MB cap, attachment upload policy, secret reader, RFC 3834 notice i batch raw cleanup.

Baseline je **5,06/10**. Tri P1 nalaza pogađala su delivery correctness, sender trust i privatnost. `BA-inbound-email-01` je zatvoren za novi recovery path u W6.38 (§16), `BA-inbound-email-02` za konfigurabilnu authserv-id provjeru u W6.39 (§17), a `BA-inbound-email-03` za globalnu autorizaciju admin statusa u W6.40 (§18). Ovi finding closeouti ne predstavljaju punu acceptance potvrdu modula.

Dodatni baseline rizici su neprovjeren recipient binding signed tokena, skupi test-connection koji preuzima raw poruke, provider ID truncation mismatch, read-before-write Message-ID dedupe, scheduler bez reconciliationa, unbounded metadata delete i slaba lifecycle/E2E matrica. Nema P0. W6.38–W6.40 su zatvorili P1 nalaze 01/02/03 samo na finding nivou; nalazi 04–13 i puna §15 acceptance lista ostaju otvoreni/pending.

## 2. Scope i inventar

- 24 produkcijska TypeScript fajla;
- 2 direktna speca;
- 1.670 aktuelnih produkcijskih LOC;
- 1 controller, 3 injectable servisa i 1 BullMQ processor;
- konektori: Microsoft Graph application permission i IMAP password/OAuth2 Entra;
- Prisma: `InboundEmail` i `InboundMailboxState`;
- integracije: settings/secrets, tickets/reopen/collaboration/attachments, notifications/email, authorization, privacy, ops-health, BullMQ i lokalni raw store;
- nema namjenskog inbound-email E2E scenarija.

Registarskih 1.694 LOC korigovano je na 1.670.

## 3. Tok obrade

Scheduled worker učita tolerantnu konfiguraciju, provjeri backoff i otvori mailbox. Connector vraća najstarije poruke do limita; raw poruka preko 35 MB dolazi kao prazan buffer i završava `TOO_LARGE`. Servis lookupuje `(mailboxKey,providerMessageId)`, kreira/obnavlja PROCESSING red, opcionalno čuva gzip raw, parsira MIME, provjerava Message-ID duplicate i obrađuje poruku.

Target redoslijed je signed reply token, thread-root Message-ID, `[T-…]` subject, pa optional new ticket. Sender se mapira na aktivnog usera, ticket write ide kroz postojeći tickets/reopen/collaboration API, a attachment kroz standardnu upload validaciju. Konačan DB status se piše prije mailbox movea; finalan red omogućava idempotentan move nakon crasha.

## 4. Autentikacija, sender identity i authorization

Pozitivno, sender mora biti aktivan interni user i proći email domain/address policy. Ticket write ponovo koristi centralni actor context; requester postaje USER_REPLY, staff fallback AGENT_REPLY, nikad internal note. Closed ticket se odbija, resolved se reopena kroz domenski servis, merged child se prati do tri hopa.

Baseline `checkSenderAuthentication` je vjerovao prvom `Authentication-Results` ili ARC headeru bez provjere pouzdanog receivera. W6.39 kodni fix prihvata samo najviše `Authentication-Results` header čiji normalizovani authserv-id tačno odgovara `private.inbound.trustedAuthservId`; ARC i `X-MS-Exchange-Organization-AuthAs` nisu dokaz. Ovo je fail-closed konfigurabilni trust boundary, ali ne dokazuje porijeklo zaglavlja: operator mora potvrditi da stvarni Graph/Exchange ili IMAP/MX put uklanja nepouzdane kopije ili pouzdano dodaje vlastiti rezultat ispred njih. Target mailbox/receiver konfiguracija nije provjerena (vidi §17).

Reply token kriptografski nosi ticket i recipient ID, ali processing ignoriše `recipientId`. Druga aktivna osoba kojoj je poruka forwardovana može koristiti token ako joj trenutna ticket policy dopušta write. To ne zaobilazi centralni ticket access, ali potire recipient-binding anti-forward svojstvo tokena i treba eksplicitnu odluku/test.

`findSenderByEmail` je `findFirst` bez DB-dokazane jedinstvenosti u ovom modulu; duple case-insensitive adrese daju nedeterminističan actor izbor.

## 5. Idempotency, crash i concurrency

Finalan DB status prije mailbox movea je dobar: sljedeći prolaz dovršava samo move. Međutim bilo koji postojeći PROCESSING red se odmah označava `FAILED/INTERRUPTED` i premješta rejected. Nema phase marker da razlikuje:

- crash prije ticket writea — poruka nije obrađena i sada se gubi;
- crash poslije ticket writea — replay može duplirati poruku;
- crash tokom attachmenta — djelimičan rezultat.

Potrebna je inbound attempt state machine i idempotency key na ticket mutationu (`inboundEmailId`), nakon čega se PROCESSING može sigurno replayati/reconciliati.

Provider dedupe lookup koristi puni ID, ali create sprema `slice(0,500)`. ID duži od 500 nikada se ne lookupuje istim ključem; unique collision/create catch vraća `SKIPPED`, ostavljajući inbox poruku bez jasnog statusa. Normalizacija/hash mora biti identičan prije lookup/create/move.

Message-ID duplicate je `findFirst` samo među PROCESSED redovima, bez unique indeksa. Trenutna queue concurrency smanjuje race u jednoj queue, ali više mailbox konfiguracija/workera ili ručni run može napraviti dvostruki write.

## 6. MIME, attachment i resource bounds

Connector provjerava advertised size prije raw fetcha, ali Graph odgovor se nakon toga učitava cijeli u memoriju i server može vratiti više od metadata sizea. Mailparser zatim materijalizuje body i sve attachmente. Jedna poruka do 35 MB i do 100 poruka po runu obrađuju se sekvencijalno, što ograničava paralelni pritisak, ali test/admin probe može nepotrebno povući deset raw poruka.

Body se truncira na ticket limit; subject na 200. Attachment ide kroz standardne type/size/security kontrole. Odbijeni attachment stvara system event sa sanitizovanim filenameom. Partial attachment failure ne ruši uspješan message write, što je dokumentovana semantika.

Auto-reply/bounce/list detekcija je široka, ali heuristic subject/header filter nikad nije potpuna zaštita. Outbound notice ima Auto-Submitted i daily delivery dedupe.

## 7. Admin API i privatnost

Baseline controller je zahtijevao ADMIN i `AdminReadOperation`, ali nije zahtijevao global scope. Zato je globalni status vraćao posljednjih 50 redova sa fromAddress, subject, ticket ID/brojem, reasonom i createdAt, plus raw `lastError`, i scoped ADMIN je mogao vidjeti foreign OU/service komunikacijske metapodatke. W6.40 dodaje `settings.read` uz ADMIN role preko canonical `RoleGuard`; postojeća scope evaluacija odbija OU- i service-scoped grants na oba endpointa (`status` i `test-connection`), prije ulaska u servis. Globalni ADMIN s `settings.read` zadržava mailbox-wide status i operativne ticket reference, ali servis ni ne bira sender/subject kolone iz recent queryja i vraća samo `[redacted]`; `state.lastError` se mapira na isti marker, a test-connection vraća stabilni `CONNECTION_FAILED` kod umjesto provider exception teksta. Redakcija vrijedi i za sve greške koje UI prikaže. Tako je spriječen scoped pristup i istovremeno implementirana zadana redakcija sendera, subjecta i error detalja bez novog scope-filtera ili permission key.

`test-connection` otvara konektor i poziva `list(10)`. Implementacije `list` preuzimaju raw `$value`/IMAP source, pa read-only test može downloadovati do približno 350 MB, parsiranje nije potrebno, a Graph/IMAP mailbox se nepotrebno opterećuje. Uvesti metadata-only count/probe sa timeoutom i rate limitom/auditom.

Connector error se vraća adminu do 300 znakova i čuva do 500; Graph error uključuje response detail. Potrebni su stabilan error code i sanitizacija host/provider odgovora.

## 8. Retention, raw store i privacy

Raw gzip fajlovi imaju mode 0600 i path key validaciju. Raw cleanup je batch 500, zatim DB link null; orphan month folder cleanup pokriva crash fajlove s odgodom. Ako raw delete ne uspije, `remove` guta grešku, a DB link se ipak nulluje — fajl postaje nevidljiv i ostaje do month prunea.

Metadata retention radi jedan neograničen `deleteMany`, što može napraviti lock/WAL spike. Nema stabilnog batch ordera za raw query. Privacy anonymization ima inbound raw integration, ali admin status/metadata i filesystem consistency moraju ostati dio acceptance testa.

## 9. Scheduler, health i recovery

Bull scheduler ima stabilne ID-eve, poll i daily retention, ali registruje se samo pri bootu. Redis restart/flush ili boot failure ostavlja worker bez polling/retention posla do redeploya. Za razliku od integration maintenance schedulera, nema periodičnog upsert reconciliationa.

Mailbox backoff je eksponencijalan i capped. Tri connector failurea šalju in-app alert svim ADMIN/SUPER_ADMIN userima, ne samo global ops primaocima; error body može otkriti mailbox/provider detalj scoped adminu. Heartbeat/ops-health vidi stanje, ali nema oldest inbox, PROCESSING age, rejected ratio, raw orphan, scheduler presence ili move-failure metriku.

## 10. Testovi i dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/inbound-email -name '*.spec.ts' -print | sort)
```

Rezultat baseline audita bio je **2/2 suitea i 39/39 testova prošlo**. Tada su pokriveni token roundtrip/tamper, target fallback, anti-loop, sender auth parser, reply extraction, sender/domain/rate/access odbijanja, reopen, merged target, ticket create, attachment rejection, MIME parse, configuration secrets i notice headers.

Baseline matrica nije pokrivala PROCESSING crash prozore, forged/untrusted Authentication-Results chain, token recipient mismatch, scoped admin read, >500 provider ID, duplicate concurrency, raw save/link/delete crash, Graph/IMAP oversized actual response, scheduler loss, metadata batching niti pravi mailbox→ticket E2E. W6.38–W6.40 su dodali recovery, forged-chain/trusted-authserv-id i scoped-admin authorization testove (§16–§18); stvarna Graph/Exchange/IMAP receiver sanitizacija i mailbox→ticket E2E i dalje nisu potvrđeni.

## 11. Registar nalaza

| ID                  | Severity | Nalaz                                                                                     | Status   |
| ------------------- | -------- | ----------------------------------------------------------------------------------------- | -------- |
| BA-inbound-email-01 | P1       | PROCESSING crash recovery odbacuje poruku bez sigurnog replaya/reconciliationa            | zatvoreno |
| BA-inbound-email-02 | P1       | Sender auth vjeruje neprovjerenom prvom Authentication-Results/ARC headeru                | zatvoreno |
| BA-inbound-email-03 | P1       | Scoped ADMIN čita globalne sender/subject/ticket/error metapodatke                         | zatvoreno |
| BA-inbound-email-04 | P2       | Signed token recipientId se ne poredi sa stvarnim senderom (vezano uz primaoca, paket 180) | zatvoreno |
| BA-inbound-email-05 | P2       | Test-connection preuzima do deset punih raw poruka (samo ID-jevi, paket 181)              | zatvoreno |
| BA-inbound-email-06 | P2       | Provider ID lookup/store truncation nije ista i može trajno preskočiti poruku (ista normalizacija, paket 182) | zatvoreno |
| BA-inbound-email-07 | P2       | Message-ID dedupe je read-before-write bez DB unique zaštite (parcijalni unique indeks, paket 185) | zatvoreno |
| BA-inbound-email-08 | P2       | Scheduler nema reconciliation nakon Redis gubitka (periodična reconciliation, paket 183) | zatvoreno |
| BA-inbound-email-09 | P2       | Metadata retention je jedan neograničen deleteMany (ograničeni batch uveden, paket 179)    | zatvoreno |
| BA-inbound-email-10 | P2       | Case-insensitive duplicate user email daje nedeterminističnog actora (odbijanje dvosmislenog, paket 184) | zatvoreno |
| BA-inbound-email-11 | P3       | Raw remove greška se guta pa DB link nestaje prije potvrđenog brisanja                     | € implementirano (paket 221); čeka CI dokaz |
| BA-inbound-email-12 | P3       | Raw/provider greške nemaju stabilan redigovan error-code ugovor                            | otvoreno |
| BA-inbound-email-13 | P3       | Nema mailbox→ticket E2E ni crash/concurrency/infrastrukturne matrice                       | otvoreno |

## 12. Ključne korekcije

- **01:** inbound attempt phases + idempotency key na ticket writeu; stale PROCESSING reconciler sigurno nastavlja ili utvrđuje već završen rezultat.
- **02:** vjerovati samo konfiguriranom authserv-id/receiver-added headeru; dokumentovati Exchange/Graph/IMAP trust boundary i negativni forged-chain test.
- **03:** global ops permission ili scope metadata/filter prije paginationa; W6.40 zahtijeva unscoped `settings.read` za oba mailbox-wide admin endpointa i rediguje sender/subject/error detalje u defaultnom responseu.
- **04:** porediti token recipient sa senderom ili eksplicitno ukloniti binding iz token contracta.
- **05:** metadata-only no-body probe, mali timeout, rate limit i audit.
- **06–07:** hash normalizovanog provider ID-a i DB unique mailbox+Message-ID gdje postoji.
- **08:** periodični scheduler upsert/reconcile i health provjera očekivanih schedulera.
- **09:** bounded `(createdAt,id)` batch delete.
- **10:** DB case-insensitive unique email ili reject ambiguous sender.
- **11–12:** delete potvrda prije null linka, orphan metric/retry i stabilni redigovani error codes.
- **13:** Graph/IMAP fixture, Postgres, Bull/Redis restart i crash fault-injection E2E.

## 13. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,80 |
| B. API i ugovori             |    12% |   5,40 |
| C. Auth/authz/scope          |    15% |   4,40 |
| D. Poslovna pravila/stanje   |    13% |   5,50 |
| E. Podaci/Prisma/transakcije |    13% |   4,70 |
| F. Sigurnost/privatnost      |    12% |   4,30 |
| G. Async/integracije         |     8% |   4,60 |
| H. Testovi/dokazivost        |    10% |   6,20 |
| I. Operativnost/perf.        |     7% |   4,80 |
| **Ukupno**                   | **100%** | **5,06/10** |

Ponderisani zbir je 5,059. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 14. Fazni plan

### Faza 0 — safety net

Crash prije/poslije ticket writea i attachmenta; forged auth chain; token recipient mismatch; scoped admin foreign read; >500 provider ID; duplicate Message-ID; oversized connector response; scheduler flush; raw/metadata retention failure.

### Faza 1 — P1 trust i recovery

Idempotent inbound state machine/reconciler; trusted receiver authentication boundary; global/scope-aware redigovani admin status i alerts.

### Faza 2 — identity i dedupe

Recipient binding odluka, canonical provider hash, Message-ID unique strategija i case-insensitive user email invariant.

### Faza 3 — connector i resource safety

Metadata-only test probe, actual-byte streaming cap, strict timeout/rate limit, stable error classification i move retry.

### Faza 4 — scheduler, retention i privacy

Scheduler reconciliation, batch metadata delete, raw delete confirmation/orphan recovery i anonymization parity.

### Faza 5 — observability i finalni gate

Oldest inbox/PROCESSING age, reject/failure ratio, move/raw orphan, scheduler presence i auth-failure metrike; 2 direktna speca plus Graph/IMAP/Postgres/Bull E2E na finalnom SHA-u.

## 15. Acceptance i konačna presuda

1. Svaka mailbox poruka eventualno ima dokaziv jedan logical ticket rezultat ili eksplicitni reject; crash je ne gubi.
2. Samo receiver-authenticated DMARC/SPF/DKIM rezultat može proći sender gate.
3. Scoped admin ne vidi foreign mailbox metadata.
4. Token recipient semantika je enforceovana i testirana.
5. Test connection ne preuzima message body/attachment.
6. Provider/Message-ID dedupe je DB-zaštićen i canonical.
7. Scheduler se sam oporavlja nakon Redis gubitka.
8. Raw i metadata retention su batchovani, retryable i privacy-usaglašeni.
9. Errori su stabilni i redigovani.
10. Direktni, integration, crash i E2E testovi prolaze.

Inbound email ima razumno širok funkcionalni i testni temelj, ali email kao write kanal zahtijeva dokazivu sender trust granicu i crash-safe poslovnu semantiku. Baseline ocjena ostaje **5,06/10**; W6.38–W6.40 finding closeouti za `BA-inbound-email-01/02/03` ne znače da je puna §15/module acceptance ostvarena. `BA-inbound-email-04`–`13` ostaju otvoreni.


## 16. W6.38 closeout — `BA-inbound-email-01`

**Status:** zatvoreno na finding nivou; samo crash-safe attempt recovery je obuhvaćen.

CI [`42495558412`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42495558412) na testanom SHA [`23f8d08`](https://github.com/mudzy992/help-desk-enterprise/commit/23f8d084b077132bd6fd62ed47755c979e75547a) potvrdio je zeleni backend full Jest i PostgreSQL/Redis integration. Inbound implementation je u kodnom SHA [`4349140`](https://github.com/mudzy992/help-desk-enterprise/commit/4349140f4e1a420546bc82a2cc2094ab540e3009).

Novi attempt zapisuje `CLAIMED`/progress faze, owner token i lease expiry; expired `PROCESSING` može preuzeti samo jedan worker. Ticket create, reply/reopen i attachment imaju stabilne unique idempotency ključeve, a recovery prvo traži već persistiran ticket/message rezultat. Tehnički kvar ostavlja poruku retryable u inboxu; konačni DB status se upisuje prije mailbox movea. Legacy attempt bez phase/lease dokaza se ne replaya naslijepo i ne šalje automatski u `rejected`; ostaje u inboxu za operator reconciliation. Ciljna baza nije pregledana i prisustvo takvih legacy redova nije potvrđeno.

Dokazi su `inbound-email-recovery.spec.ts` (lost response nakon durable ticket writea, bez duplog messagea; legacy red se ne premješta) i registrovani `inbound-email-recovery.integration.spec.ts` (real PostgreSQL claim/lease fencing i unique source/reply/attachment ključevi). Recovery spec je dio isolated PostgreSQL/Redis runnera.

Migracija `20271031200000_inbound_email_crash_safe_recovery` replayovana je samo nad disposable CI bazom. Nije korištena target baza, pokretana migracija, PR, merge ili deployment. E2E critical/install, inventory i conditional high/critical image-enforcement korak u runu su `skipped`; nema E2E, inventory ili independent vulnerability-enforcement sign-offa. U trenutku W6.38 `BA-inbound-email-02/03` i svi susjedni inbound nalazi ostali su otvoreni.

### §15 pregled nakon W6.38

Kriterij 1 ima kodni/testni dokaz za novi recovery path: durable phase/lease fencing, replay provjera već upisanog ticket/message rezultata i retryable ponašanje bez slijepog odbacivanja. Legacy attempti bez phase/lease dokaza ostaju u inboxu za operator reconciliation; njihovo postojanje/stanje u target mailboxu nije provjereno. Zato je `BA-inbound-email-01` zatvoren samo za novi recovery path, a ne kao dokaz da je svaki postojeći mailbox red operativno usaglašen. Kriterij 2 dobio je kodni trust-boundary fix u W6.39, ali stvarna receiver konfiguracija još nije potvrđena. Puna §15/module acceptance ostaje **pending**.

## 17. W6.39 closeout — `BA-inbound-email-02`

**Status:** zatvoreno na finding nivou za autentikacijski checker i konfiguracijski fail-closed ponašaj; target receiver/mailbox trust nije operativno potvrđen.

Implementacijski commit [`199ca64`](https://github.com/mudzy992/help-desk-enterprise/commit/199ca6475a2a533f9f57c6d7373f014daa94d69e) i finalni testani SHA [`814d6a8`](https://github.com/mudzy992/help-desk-enterprise/commit/814d6a8640467074b4b14ab4efaa7e2fd631b654) prošli su finalni CI [`42501838277`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42501838277) (**success**). CI je prošao backend build/full tests, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate. E2E critical/install, read-only inventory i conditional image-enforcement korak bili su `skipped`, ne passed. Raniji CI [`42500781358`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42500781358) nije zelen zbog frontend setting-registry coverage counta i help-teksta dužeg od limita; obje greške ispravljene su u finalnom SHA prije zelenog runa. Nije rađen Perf sign-off.

Implementacija uvodi `private.inbound.trustedAuthservId` s praznim defaultom. Kada je `private.inbound.requireAuthPass` uključen, nedostajući/neispravan authserv-id zaustavlja inbound obradu fail-closed. Checker razmatra samo najviše `Authentication-Results` header i zahtijeva tačno poklapanje normalizovanog authserv-id-a; forged niži headeri ne mogu nadjačati prvi. ARC i `X-MS-Exchange-Organization-AuthAs` nisu dokaz. Dodani su negativni forged-chain testovi, configuration/spec testovi i frontend setting-registry coverage.

Ovo zatvara kodni nalaz, ali `authserv-id` u zaglavlju sam po sebi nije kriptografski dokaz porijekla. Operator mora potvrditi da stvarna Exchange Online/Graph ili IMAP/MX putanja uklanja nepouzdane `Authentication-Results` instance ili pouzdano dodaje svoj rezultat ispred njih, te konfigurirati tačan ID koji checker vidi. Graph/Exchange mailbox ili IMAP receiver konfiguracija, MX/header sanitizacija i runtime ponašanje nisu provjereni u target okruženju. Nije korištena target baza/mailbox, pokretana migracija, PR, merge ili deployment. Puna §15/module acceptance ostaje pending; u trenutku W6.39 `BA-inbound-email-03` je i dalje bio otvoren.

## 18. W6.40 closeout — `BA-inbound-email-03`

**Status:** zatvoreno na finding nivou: scoped ADMIN pristup je odbijen, a sender/subject/error detalji su redigovani i za dopuštenog globalnog ADMIN-a. Puna §15/module acceptance ostaje pending.

Controller dodaje `@RequirePermissions(permissionKeys.settingsRead)` uz postojeće ADMIN role i canonical `RoleGuard`. `settings.read` nije scope-agnostic: OU- ili service-scoped assignment ne može zadovoljiti mailbox-wide zahtjev i dobija `403` prije poziva admin servisa. Pravilo važi za oba endpointa: `GET /admin/inbound-email/status` i `POST /admin/inbound-email/test-connection`. Globalni ADMIN sa `settings.read` zadržava mailbox status, counters i ticket reference; nije dodana permission key, schema ni migracija.

Defaultna redakcija je server-side. Recent status query više ne bira `fromAddress` ili `subject`, a response šalje samo `[redacted]` oznaku. Sačuvani `state.lastError` također se mapira na `[redacted]`; connection test vraća stabilni `CONNECTION_FAILED` kod umjesto exception/provider teksta. UI prikazuje lokalizovanu redaction oznaku i generičku grešku, ne raw vrijednosti ni iz API-ja ni iz client-side catch grana. Message bodies se i dalje ne vraćaju.

`inbound-email-admin.controller.authorization.spec.ts` pokriva guard wiring, scoped deny na oba endpointa, global ADMIN allow i role/permission deny. `inbound-email-admin.service.spec.ts` dokazuje da status ne vraća sender/subject/stored error i da connection-test odgovor ne sadrži provider exception detalje; test provjerava i da recent query uopće ne selektuje sender/subject. Lokalno su ciljana dva backend suitea prošla **6/6** uz isključen ts-jest diagnostics zbog nedostajućeg generisanog Prisma clienta; frontend ESLint, i18n paritet i TypeScript build check prošli su. Finalni CI je generisao Prisma client i prošao standardni backend build/full tests.

Finalni SHA [`8c0ba54`](https://github.com/mudzy992/help-desk-enterprise/commit/8c0ba54a1718c5217db1694a366af8f05adbed31) prošao je CI [`42509394030`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42509394030) (**success**): backend build/full tests, PostgreSQL+Redis integration, frontend build/test, Docs guard, container/supply-chain i CI gate su passed. Read-only inventory, E2E install wizard i E2E critical flows bili su `skipped`, ne passed; conditional zero-high/critical image-enforcement step je također `skipped`. Nije korištena target baza/mailbox, pokretana migracija, PR, merge ili deployment.

Ovim je `BA-inbound-email-03` zatvoren za scope prekoračaj i defaultni sender/subject/error redaction. Redakcija ne skriva globalne mailbox counters ni ticket reference; to je namjerna administratorska funkcionalnost. Kriterij 3 iz §15 ima kodni/guard i response-test dokaz, ali ponašanje nije provjereno na target deploymentu. `BA-inbound-email-01` legacy attempts i `BA-inbound-email-02` receiver/authserv-id trust i dalje nisu operativno potvrđeni; puna §15/module acceptance ostaje pending. Paketni zapis: [W6.40 / paket 155](../implementation/155-inbound-email-03-global-admin-status-access.md).

## Implementacija — BA-inbound-email-11

Paket [221](../implementation/221-inbound-email-11-raw-delete.md) propagira greške raw brisanja, čuva link pri neuspjehu i uslovljava brisanje metadata odsustvom raw linka. Lokalni ciljani testovi prolaze; CI dokaz se čeka. Nalaz ostaje otvoren.
