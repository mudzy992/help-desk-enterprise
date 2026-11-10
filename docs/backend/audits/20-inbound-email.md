# Backend audit 20 — `inbound-email`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** kritičan  
**Baseline ocjena:** **5,06/10**  
**Nalazi:** 3 P1, 7 P2, 3 P3

## 1. Executive summary

`inbound-email` polluje Microsoft Graph ili IMAP mailbox, parsira raw MIME, filtrira bounce/auto-reply, provjerava sendera i autentikaciju, razrješava ticket, kreira reply/reopen/new ticket, prenosi attachment i vodi raw/metadata retention. Temelj je dobar: mailbox/provider dedupe ključ, centralni ticket mutation policy, DMARC/SPF/DKIM gate, signed reply token, anti-loop pravila, 35 MB cap, attachment upload policy, secret reader, RFC 3834 notice i batch raw cleanup.

Baseline je **5,06/10**. Tri P1 nalaza pogađaju delivery correctness, sender trust i privatnost. Zatečeni `PROCESSING` red se bez reconciliationa proglašava interrupted i premješta u rejected folder, pa crash prije ticket writea trajno gubi legitimnu poruku, dok crash poslije writea ostaje nerazlučiv. Sender authentication vjeruje prvom raw `Authentication-Results`/ARC headeru bez provjere pouzdanog receiving authserv-id-a, pa spoofovani header može postati dokaz. Globalni admin status vraća sender adresu, subject, ticket reference i connector error svakom scoped ADMIN assignmentu.

Dodatni rizici su neprovjeren recipient binding signed tokena, skupi test-connection koji preuzima raw poruke, provider ID truncation mismatch, read-before-write Message-ID dedupe, scheduler bez reconciliationa, unbounded metadata delete i slaba lifecycle/E2E matrica. Nema P0. Popravke nisu implementirane.

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

`checkSenderAuthentication` uzima prvi `Authentication-Results` ili ARC header i vjeruje `dmarc=pass` ili `spf=pass + dkim=pass`; ne potvrđuje da je header dodao konfigurirani receiving MX niti odstranjuje untrusted upstream instance. RFC header može sadržati sender-supplied rezultat. Sigurnost zato zavisi od nedokumentovane mailbox sanitizacije.

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

Controller zahtijeva ADMIN i `AdminReadOperation`, ali nema global-scope requirement. Status query je globalan i vraća posljednjih 50 redova sa fromAddress, subject, ticket ID/brojem, reasonom i createdAt, plus raw `lastError`. Scoped ADMIN tako vidi foreign OU/service komunikacijsku metapodatkovnu historiju. Potrebno je global ops pravo ili scope-aware query; sender/subject trebaju default redakciju.

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

Rezultat je **2/2 suitea i 39/39 testova prošlo**. Pokriveni su token roundtrip/tamper, target fallback, anti-loop, sender auth parser, reply extraction, sender/domain/rate/access odbijanja, reopen, merged target, ticket create, attachment rejection, MIME parse, configuration secrets i notice headers.

Nisu pokriveni PROCESSING crash prozori, forged/untrusted Authentication-Results chain, token recipient mismatch, scoped admin read, >500 provider ID, duplicate concurrency, raw save/link/delete crash, Graph/IMAP oversized actual response, scheduler loss, metadata batching niti pravi mailbox→ticket E2E.

## 11. Registar nalaza

| ID                  | Severity | Nalaz                                                                                     | Status   |
| ------------------- | -------- | ----------------------------------------------------------------------------------------- | -------- |
| BA-inbound-email-01 | P1       | PROCESSING crash recovery odbacuje poruku bez sigurnog replaya/reconciliationa            | otvoreno |
| BA-inbound-email-02 | P1       | Sender auth vjeruje neprovjerenom prvom Authentication-Results/ARC headeru                | otvoreno |
| BA-inbound-email-03 | P1       | Scoped ADMIN čita globalne sender/subject/ticket/error metapodatke                         | otvoreno |
| BA-inbound-email-04 | P2       | Signed token recipientId se ne poredi sa stvarnim senderom                                | otvoreno |
| BA-inbound-email-05 | P2       | Test-connection preuzima do deset punih raw poruka                                        | otvoreno |
| BA-inbound-email-06 | P2       | Provider ID lookup/store truncation nije ista i može trajno preskočiti poruku              | otvoreno |
| BA-inbound-email-07 | P2       | Message-ID dedupe je read-before-write bez DB unique zaštite                              | otvoreno |
| BA-inbound-email-08 | P2       | Scheduler nema reconciliation nakon Redis gubitka                                         | otvoreno |
| BA-inbound-email-09 | P2       | Metadata retention je jedan neograničen deleteMany                                        | otvoreno |
| BA-inbound-email-10 | P2       | Case-insensitive duplicate user email daje nedeterminističnog actora                       | otvoreno |
| BA-inbound-email-11 | P3       | Raw remove greška se guta pa DB link nestaje prije potvrđenog brisanja                     | otvoreno |
| BA-inbound-email-12 | P3       | Raw/provider greške nemaju stabilan redigovan error-code ugovor                            | otvoreno |
| BA-inbound-email-13 | P3       | Nema mailbox→ticket E2E ni crash/concurrency/infrastrukturne matrice                       | otvoreno |

## 12. Ključne korekcije

- **01:** inbound attempt phases + idempotency key na ticket writeu; stale PROCESSING reconciler sigurno nastavlja ili utvrđuje već završen rezultat.
- **02:** vjerovati samo konfiguriranom authserv-id/receiver-added headeru; dokumentovati Exchange/Graph/IMAP trust boundary i negativni forged-chain test.
- **03:** global ops permission ili scope metadata/filter prije paginationa; redigovati sender/subject/error po defaultu.
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

Inbound email ima razumno širok funkcionalni i testni temelj, ali email kao write kanal zahtijeva jaču sender trust granicu i crash-safe exactly-once poslovnu semantiku. Iskren baseline je **5,06/10**.
