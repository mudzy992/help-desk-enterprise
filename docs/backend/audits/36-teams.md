# Backend audit 36 — `teams`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,05/10**  
**Nalazi:** 6 P1, 10 P2, 4 P3

## 1. Executive summary

`teams` je dvosmjerni Microsoft Teams control plane: javni Bot Connector inbound endpoint, JWT/HMAC autentikacija, Entra identity linking, conversation/channel binding, ticket/change/approval akcije, ticket creation, read komande, notification cards, integration queue delivery, simulator i administrativna readiness/package površina. Pozitivne zaštite su značajne: live inbound provjerava RS256, issuer, audience, `msteams` endorsement, `serviceUrl` claim i tenant; outbound bearer se šalje samo HTTPS Microsoft hostovima; simulator koristi timestamped HMAC; korisnik se veže preko aktivnog neanonimiziranog Entra ID-a; domenske akcije koriste postojeće servise/RBAC; local-only računi se ne linkuju; DTO i card escaping su opsežni; confidential title/body su djelimično redigovani.

Baseline je **4,05/10**. Šest P1 nalaza pogađaju pouzdanu obradu, impersonation i povjerljivost. Inbound activity ID se trajno claimuje prije routinga; svaka kasnija transient/domain greška se priznaje HTTP 200 i Bot retry više ništa ne izvršava. Simulator administrator sa `integrations.teams.manage` može odabrati bilo kojeg aktivnog korisnika i slati akcije koje se izvršavaju kao taj korisnik, bez consent/step-upa. Channel cards za confidential ticket sakriju title/body, ali i dalje iznose ticket number, service, priority, status, assignee i SLA/due metadata širokoj Teams channel publici. Channel binding/rebinding je globalna exfiltration ruta bez durable audit/change reasona. Konfiguracijski read je fail-soft; pojedinačna settings greška vraća capability default `true` i može ponovo uključiti actions, ticket creation, personal ili channel delivery. Outbound send i lokalni `TeamsCardMessage` commit nisu atomski; DB failure poslije uspješnog slanja dovodi do duplih poruka pri retryju.

Dodatni rizici: domain action dodatni Teams audit je best-effort; Bot OpenID metadata može usmjeriti JWKS na bilo koji HTTPS host; network fetch nema dosljedne timeout/body limite; readiness radi server-side GET na APP_PUBLIC_URL; inbound limiter je process-local/IP-based; config/token/JWKS cache je per-process; conversation touch može prevezati personal conversation; retention komentari nisu provedeni; channel recipient membership se ne može dokazati; inline delivery se gubi; refresh je fire-and-forget. Pokretanje šest suiteova: 1 prošao, 5 compile-blockirano, 10/10 izvršenih testova zeleno. Popravke nisu implementirane.

## 2. Scope i inventar

- 38 produkcijskih TypeScript fajlova;
- 6 direktnih specova;
- 4.314 direktno izmjerenih produkcijskih LOC (registar: 4.352);
- 3 controllera (`admin`, `me`, public inbound) i 11 registarskih servisa/komponenti;
- integracije: Bot Connector/OpenID/JWKS/Entra OAuth, Tickets, Changes, approvals, knowledge, on-call, status page, notifications, settings i integration queue;
- Prisma: conversations, channel links, card messages, inbound idempotency i simulator payloads;
- nema direktnog Teams E2E/integration scenarija.

## 3. Inbound autentikacija

Live tok zahtijeva bearer JWT, RS256, Microsoft issuer, bot app audience, endorsed key, validno vrijeme i serviceUrl claim jednak activity payloadu. Nakon toga tenant mora odgovarati konfigurisanom tenant ID-u. Simulator tok koristi HMAC SHA-256 nad timestamp+raw body, timing-safe compare, kratki replay prozor i posebni `simulator://teams` URL. Nepoznate ili malformed aktivnosti se odbijaju bez detalja.

To je dobra osnova. Međutim OpenID metadata je fiksno Microsoft URL, ali `jwks_uri` se provjerava samo kao `https://`; host se ne pin-a na Microsoft allowlist. Fetch prati redirecte i nema eksplicitni timeout/response-size/content-type limit. Inbound request može držati worker dok metadata/JWKS fetch visi. Potrebni su pinned origini, redirect policy, timeout, JSON size cap i stale-known-good key fallback sa alarmom.

Pet minuta `clockTolerance` povećava token replay prozor; nema token `jti` replay evidencije, mada activity ID daje business idempotency. Service URL outbound allowlist koristi suffix sa vodećom tačkom i HTTPS, što dobro sprečava klasični token SSRF.

## 4. Idempotency i izgubljene aktivnosti

Nakon auth/tenant provjere `claimActivity` ubacuje globalno unique activity ID. Tek potom se bilježi simulator inbound, touchuje conversation i izvršava route/action/domain mutation/reply. Ako bilo šta nakon claima padne, servis vraća 200 (za invoke embedded 500 card), jer želi spriječiti Teams retry storm. Ponovljena ista aktivnost zatim odmah dobija 200 i nikada se ne obrađuje.

To je at-most-once bez durable outcomea, ne pouzdana idempotency. Ticket reply, approval, CAB vote, ticket creation, channel link ili install event može biti trajno izgubljen. Potreban je inbound inbox state (`RECEIVED/PROCESSING/SUCCEEDED/RETRYABLE/FAILED_FINAL`), lease, attempt count, payload hash, durable retry i transactional coupling inbox outcomea s domenskim command idempotency keyem. HTTP 2xx treba vratiti tek kada je finalni outcome durable.

Dodatno, activity ID je globalan bez tenant/app namespacea. Single tenant to ublažava, ali promjena tenant/app konfiguracije u retention prozoru može sudariti ID-jeve.

## 5. Identity linking i simulator impersonation

Live identity se rješava po `activity.from.aadObjectId`, samo za active, non-anonymized usera sa Entra ID-em. Domenske akcije zatim koriste taj user ID i centralne Tickets/Changes/Knowledge servise. Ovo je pravilna reuse granica.

Simulator administrativni endpoint, međutim, prihvata proizvoljan `userId` do 64 znaka. Ako je korisnik aktivan, servis generiše sintetički/Entra actor i interno potpisuje aktivnost. `integrations.teams.manage` administrator time može claimati, odgovoriti, dodati internal note, odobriti/rejectovati ticket ili change i kreirati ticket kao izabrani korisnik — prema pravima žrtve, ne administratora. Nema žrtvinog consenta, SUPER_ADMIN requirementa, MFA/step-upa, environment restrictiona ili posebnog impersonation audita.

Simulator mora biti compile/deployment-disabled u produkciji ili sandboxovan na test identities. Impersonation zahtijeva SUPER_ADMIN+MFA, explicit reason, allowlist, visible banner, target notification i dedicated immutable audit.

Conversation `upsert` je keyed samo po `conversationId` i svaka validna aktivnost prepisuje tenant/serviceUrl/aadObjectId/userId/mode te uklanja `removedAt`. Potrebni su immutable tenant/mode/kind invarianti i CAS za identity rebinding, posebno za personal conversation.

## 6. Channel linking i confidential data

Link zahtijeva linked usera. Korisnik sa globalnim Teams manage permissionom može linkati sve grupe; inače `group.manage` + membership ograničava izbor. Group ima najviše jedan channel link. Admin može uređivati event list i title flag.

Ipak Teams channel publika nije modelirana u aplikaciji. Nema dokaza da su svi članovi linked channela članovi grupe/OU ili ovlašteni za ticket/change metadata. Confidential ticket u channelu skriva title i message body, ali i dalje šalje broj, service name, priority, status, assignee, due/SLA i headline; to može otkriti postojanje i prirodu povjerljivog incidenta. Channel claim button je takođe vidljiv publici, iako klik na kraju prolazi identity/RBAC.

Za confidential entity channel delivery treba biti default-deny ili minimalna potpuno generička notifikacija bez broja/service/assignee/SLA. Link mora imati documented data classification, owner approval, Teams membership attestation/periodic drift check i expiry.

Link/unlink, admin update/remove channel i include-title promjene nemaju audit-log zapis ni required reason. Logger nije durable audit. To je P1 jer direktno mijenja vanjski PII/confidential delivery target.

## 7. Configuration fail-soft behavior

`TeamsConfigurationService.read` hvata svaku settings grešku i vraća fallback. Add-on fallback `false` obično zatvara integraciju, ali ako add-on read uspije kao true, a pojedinačni capability read padne, defaulti su `personalEnabled=true`, `channelEnabled=true`, `ticketCreateEnabled=true`, `actionsEnabled=true`. Privremena settings/schema/validation greška tako može ponovo uključiti funkciju koju je administrator isključio.

Security-sensitive capabilities i live tenant/app configuration moraju se čitati atomarno, versionirano i fail-closed. Posljednji known-good snapshot može održati dostupnost, ali ne smije zamijeniti explicit false sa permissive defaultom. Secret read failure trenutno vraća prazno, što je fail-closed za outbound token.

## 8. Domain actions i audit

Claim/reply/note/ticket approval/change vote/ticket creation koriste centralne domain servise i actor ID, pa se zadržavaju domain RBAC, scope, transition i većina domain audita. Approval bira pending approval baš za trenutnog usera; change vote nosi optimistic version. Input tekst ima limite i card data IDs se bounded parsiraju.

Teams-specifični audit (`teams.<verb>`) piše se tek poslije uspješne domain akcije u zasebnoj transakciji, a failure se guta. Tako može nedostajati dokaz activityId/conversation kanala, iako domain audit ostane. Channel linking nema ni domain audit. Za high-impact approvals/change votes Teams source metadata i activity idempotency moraju biti dio istog domain commita ili transactional outboxa.

Claim radi pre-read `assignedUserId`, pa centralni claim rješava stvarni race; pre-read služi samo UX-u. Reply pokušava AGENT_REPLY pa na jedan domain code fallbacka na USER_REPLY, što je razuman reuse pattern, ali treba test da nijedan drugi auth error ne izaziva fallback.

## 9. Outbound delivery consistency

Delivery ponovo učitava aktuelni entity, poštuje personal user/conversation binding, mode, removed state, quiet hours/preferences i group event filter. State hash sprječava no-op update, a unique card tuple smanjuje duplikate. 403/404 označava conversation gone; 429 prenosi retry-after.

Ipak eksterni send se izvrši prije lokalnog `TeamsCardMessage.upsert`. Ako DB padne, queue retry ne vidi activityId i šalje novu poruku. Za update, Teams može biti promijenjen, a DB hash ostati star pa se update ponavlja. Nema outbound idempotency key koji Microsoft potvrđuje niti durable `SENDING/SENT` outbox reconciliation.

Bez integration queuea transient delivery se samo loguje i trajno gubi. Queue planner enqueues po jobu sekvencijalno; djelimičan enqueue failure može prekinuti fan-out. Fire-and-forget refresh nakon akcije može nestati pri restartu. Sve outbound operacije trebaju durable outbox/delivery ledger, retry/dead-letter, reconciliation i recipient snapshot.

Process-local `TeamsRateLimiter` nije koordiniran između API/worker replika. Bot Connector 429 ublažava burst, ali ne štiti proaktivno globalni tenant/conversation limit.

## 10. SSRF, network i token lifecycle

Outbound Bot service URLs su HTTPS i Microsoft suffix allowlistani. OAuth endpoint tenant segment je URL-encoded i host fiksan. Access token se drži samo u memory cacheu i invalidira na 401. Certificate private key/secret se čitaju secret accessorom.

Network pozivi prema OAuth, Bot Connector i OpenID/JWKS nemaju AbortSignal timeout ni response body limit. Readiness radi GET na `APP_PUBLIC_URL/integrations/teams/messages`; ako deployer postavi interni HTTPS URL, permission holder može aktivirati server-side request (target nije request-parametar, ali ostaje configuration SSRF/health side effect). Readiness vraća skraćeni raw error message za token probe, što može iznijeti transport/config detalje.

Token cache key je tenant+app, ne credential version; secret/certificate rotacija sa istim IDs ostavlja stari token do refresh/401. Configuration change event ne invalidira cache osim readiness probe/401.

## 11. Rate limiting i abuse

Public inbound ima 300/min po `request.ip` u lokalnom Mapu. Više replika zaobilazi limit; proxy konfiguracija može sve spojiti pod jednu IP ili dozvoliti spoofing; Map se cijeli briše nakon 10.000 ključeva. JWT/HMAC auth štiti business akcije, ali ne prije JSON parsing i dijela request obrade. Potreban je edge/distributed limiter po tenant/app/IP/activity type, body limit dokaz i metrički signal.

`activity.value` ostaje proizvoljan nested object unutar globalnog body limita. Simulator DTO `data` nema depth/property schema. Card builders uglavnom čitaju samo bounded scalar polja, ali payload se može čuvati u simulator outboxu.

## 12. PII, retention i lifecycle

Conversation čuva Teams conversation/service/team/channel IDs i imena, AAD object ID i user link. Simulator čuva cijeli inbound/outbound payload; card rows povezuju entity i conversation. Schema komentari obećavaju 7-dnevno čuvanje inbound/simulator zapisa, ali u modulu/repozitornom pregledu nije pronađen cleanup job. Card/conversation retention, user unlink/anonymization i tenant offboarding politika nisu definisani.

Simulator admin može pročitati payload druge osobe po odabranom userId-u ako ima Teams manage permission. Payload može sadržati ticket tekst/card podatke. Potrebni su privacy classification, retention worker, erasure/unlink propagation, access audit i redakcija.

## 13. Test dokaz

Pokrenuto svih šest direktnih suiteova:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/teams -name '*.spec.ts' -print | sort)
```

Rezultat: **1/6 suiteova prošao, 5/6 compile-blockirano; 10/10 izvršenih testova prošlo**. Zelen je core/pure suite. Blokade su generated Prisma delegati (`teamsConversation`, `teamsGroupChannel`, `teamsCardMessage`, ticket, approval, service, user, notification, `$transaction`) i jedan implicit-any koji proizlazi iz nedostajućih tipova.

Postoje korisni specovi za cards/confidential title, actions, delivery, inbound, queries, package i simulator. Nema real Bot JWT/JWKS integration testa, transient-after-claim retrya, simulator impersonation policyja, confidential channel metadata matrice, send-then-DB failurea, config read failurea, channel audit/membership drifta, multi-instance limitera, retentiona ili direktnog E2E scenarija.

## 14. Pozitivni nalazi

1. Live inbound provjerava signature, alg, issuer, audience, endorsement, serviceUrl i tenant.
2. Simulator HMAC koristi timestamp i timing-safe compare.
3. Outbound bearer ide samo HTTPS Microsoft-owned suffixima.
4. Identity zahtijeva active, non-anonymized Entra-linked usera.
5. Local-only account se ne linkuje u live modu.
6. Actions koriste centralne domain servise i actor/scope pravila.
7. Approval je vezan za pending approver row; change vote ima version.
8. DTO, scalar i list limiti su prisutni na većini površina.
9. Card tekst se escapeuje; confidential title/body se djelimično skriva.
10. Personal delivery provjerava user/conversation binding i preferences/quiet hours.
11. Queue payload nosi IDs, a card se gradi iz aktuelnog stanja.
12. State hash i unique card tuple smanjuju duple updateove.
13. Access token/secret se ne vraćaju klijentu.
14. 10 izvršenih testova je zeleno.

## 15. Registar nalaza

| ID          | Severity | Nalaz                                                                                               | Status   |
| ----------- | -------- | --------------------------------------------------------------------------------------------------- | -------- |
| BA-teams-01 | P1       | Activity se claimuje prije routinga; transient failure se ACK-uje i retry je trajno blokiran        | otvoreno |
| BA-teams-02 | P1       | Simulator manage korisnik može izvršavati domain akcije kao bilo koji aktivni korisnik               | otvoreno |
| BA-teams-03 | P1       | Confidential channel card i dalje iznosi broj/service/priority/status/assignee/SLA metapodatke       | otvoreno |
| BA-teams-04 | P1       | Channel link/rebind/update/remove mijenja vanjski data target bez durable audita/reasona             | otvoreno |
| BA-teams-05 | P1       | Settings greška može fail-soft ponovo uključiti actions/ticket creation/personal/channel capability | otvoreno |
| BA-teams-06 | P1       | External send prethodi DB card commitu; retry nakon DB kvara duplira poruku                           | otvoreno |
| BA-teams-07 | P2       | Teams action audit je post-commit best-effort i može izgubiti channel/activity dokaz                 | otvoreno |
| BA-teams-08 | P2       | JWKS URI nije Microsoft-host pinan; fetch redirect/timeout/size policy nije ograničen                 | otvoreno |
| BA-teams-09 | P2       | Conversation upsert može prevezati tenant/mode/kind/user/serviceUrl bez immutable/CAS invarianta     | otvoreno |
| BA-teams-10 | P2       | Nema dokaza da svi channel članovi imaju aplikacijski pristup linked grupi/entityju                  | otvoreno |
| BA-teams-11 | P2       | Inline delivery i fire-and-forget refresh nisu durable i mogu se trajno izgubiti                     | otvoreno |
| BA-teams-12 | P2       | Inbound i outbound limiter su process-local; multi-instance bypass/burst ostaje                      | otvoreno |
| BA-teams-13 | P2       | OAuth/Bot/JWKS pozivi nemaju dosljedan timeout i response-size limit                                 | otvoreno |
| BA-teams-14 | P2       | Readiness GET prema APP_PUBLIC_URL je configuration SSRF/side-effect površina                        | otvoreno |
| BA-teams-15 | P2       | Access-token/JWKS/config cache nema credential/config version invalidaciju                           | otvoreno |
| BA-teams-16 | P2       | Inbound/simulator/card/conversation PII retention i erasure lifecycle nisu provedeni                 | otvoreno |
| BA-teams-17 | P3       | Global activity ID nije namespaciran tenant/appom; promjena konfiguracije može kolidirati            | otvoreno |
| BA-teams-18 | P3       | Simulator arbitrary `data` nema depth/property schema i čuva se kao payload                         | otvoreno |
| BA-teams-19 | P3       | Readiness može vratiti raw skraćenu transport/token error poruku                                    | otvoreno |
| BA-teams-20 | P3       | 5/6 suiteova compile-blockirano i nema real Bot/queue/distributed/E2E matrice                        | otvoreno |

## 16. Ključne korekcije

- **01:** durable inbox state machine, lease/retry/outcome i transactional domain idempotency.
- **02:** produkcijski disable/sandbox simulatora ili SUPER_ADMIN+MFA controlled impersonation audit.
- **03–04,10:** confidential channel default-deny/minimal card, membership attestation, expiry i audited link lifecycle.
- **05:** atomarni versionirani config snapshot i fail-closed capabilities.
- **06,11:** durable outbound ledger/outbox, send reconciliation, retry/DLQ i idempotent delivery state.
- **07:** activity/channel metadata u istom domain audit commitu/outboxu.
- **08,13–15:** pinovani Microsoft origini, redirect/timeout/size policy, SSRF-safe readiness i config-version cache invalidation.
- **09:** immutable conversation tenant/mode/kind i explicit rebind workflow.
- **12:** distributed edge/Redis limiter po tenant/app/conversation/IP.
- **16–20:** retention/erasure worker, payload schema/redaction, typed errors i real integration/E2E testovi.

## 17. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,20 |
| B. API i ugovori             |    12% |   4,30 |
| C. Auth/authz/scope          |    15% |   4,20 |
| D. Poslovna pravila/stanje   |    13% |   3,70 |
| E. Podaci/Prisma/transakcije |    13% |   3,20 |
| F. Sigurnost/privatnost      |    12% |   3,70 |
| G. Async/integracije         |     8% |   3,50 |
| H. Testovi/dokazivost        |    10% |   3,10 |
| I. Operativnost/perf.        |     7% |   3,90 |
| **Ukupno**                   | **100%** | **4,05/10** |

Ponderisani zbir je 4,070, zaokružen konzervativno na **4,05/10** zbog P1 delivery/impersonation rizika. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 18. Fazni plan

### Faza 0 — safety net

Real Bot/JWKS harness, transient-after-claim, simulator impersonation, confidential channel, channel audit, config failure, send-DB failure, multi-instance limiter i retention testovi.

### Faza 1 — inbound identity i idempotency

Durable inbox/outcome, domain idempotency keys, immutable conversation binding, pinned JWKS/network policy i distributed limiter.

### Faza 2 — simulator i channel trust

Simulator production isolation/controlled impersonation; channel membership/classification attestation; confidential default-deny; audited link lifecycle.

### Faza 3 — outbound reliability

Transactional notification outbox, delivery state/reconciliation, queue-only durable fan-out, DLQ/replay i config-version cache invalidation.

### Faza 4 — privacy i operations

Retention/erasure, payload minimization/redaction, timeout/body limits, readiness hardening, metrics/alerts i incident runbooks.

### Faza 5 — finalni gate

Svih 6 suiteova zeleno; real signed Bot inbound, Entra identity, domain action, queue retry, channel confidentiality i multi-instance integration/E2E dokaz na finalnom SHA-u.

## 19. Acceptance i presuda

1. Validna aktivnost se ne gubi nakon transient failurea i nikad se ne izvršava dvaput.
2. Simulator ne može neprimjetno impersonirati produkcijskog korisnika.
3. Confidential entity ne šalje identifikacijske/metapodatke neprovjerenom channel audienceu.
4. Svaka channel binding promjena je reasoned, auditirana, vremenski ograničena i membership-provjerena.
5. Settings kvar nikad ne uključuje isključenu capability.
6. Outbound send i delivery state imaju durable idempotent/reconciliation ugovor.
7. Conversation binding je immutable ili eksplicitno reautorizovan.
8. Network origin/timeout/size i distributed rate limiti su dokazani.
9. PII retention/erasure je izvršna, ne samo komentar u schemi.
10. Svih 6 suiteova i proširena integration/E2E matrica prolaze.

Modul ima snažnu nominalnu Bot JWT/tenant provjeru i dobar reuse centralnih domena, ali inbound/outbound reliability, simulator impersonation i channel confidentiality nisu enterprise-safe. Iskren baseline je **4,05/10**.
