# Backend audit 18 — `websocket`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,88/10**  
**Nalazi:** 4 P1, 7 P2, 3 P3

## 1. Executive summary

`websocket` autentifikuje Socket.IO handshake, pridružuje user/group/admin i ticket visibility sobe, prenosi ticket, notification, Edge, settings i admin-config događaje, održava presence i koristi Redis adapter za horizontalno skaliranje. Temelj sadrži dobre odluke: cookie handshake zahtijeva dozvoljen origin, ticket join koristi centralnu access policy, internal note ide samo staff sobi, group feed ima lagani payload, Redis ima posebne pub/sub konekcije i ACL probe, a join/presence imaju lokalne limite.

Baseline je ipak **4,88/10**. Četiri P1 nalaza ruše revocation i privacy granicu. Socket autentikacija se provjerava samo na handshakeu: logout, revoke-all, promjena lozinke, idle/session expiry i authz-version promjena ne prekidaju postojeću konekciju. Ticket sobe se autorizuju samo pri joinu i nikad revalidiraju, pa forward, promjena OU/grupe, confidential flag ili role revocation ne oduzima stream. Group/admin sobe se provjeravaju tek svakih pet minuta, a DB greška je fail-open. Konačno, legacy full-payload group emit je uključen po defaultu i šalje puni javni ticket/message payload svim članovima grupe iako članstvo samo po sebi nije dokaz pune ticket vidljivosti.

Dodatni problemi su bili runtime Redis degradacija bez pouzdanog fallback/state signala (`BA-websocket-05`), per-socket rate-limit koji se lako multiplicira, globalno emitovanje private setting key metadata, neawaitani room join, izostanak replay/catch-up ugovora i nedovoljna E2E revocation/cross-instance matrica. W6.48 zatvorio je samo BA-05 nakon zelenog push-triggered CI-ja; preostali problemi nisu dio ovog paketa. Nema P0.

## 2. Scope i inventar

- 28 produkcijskih TypeScript fajlova;
- 16 direktnih specova;
- 1.679 aktuelnih produkcijskih LOC;
- 2 Socket.IO gatewaya i 3 injectable komponente;
- autentikacija: explicit bearer ili HttpOnly session cookie + origin provjera;
- sobe: `user:*`, `group:*`, `role:admins`, `ticket:*`, `ticket:*:staff`, `ticket:*:public`;
- događaji: ticket message/update/presence, notification, Edge, settings/session invalidation i admin config;
- infrastruktura: Socket.IO Redis adapter, ACL probe, emit/client metrike i rolling-deploy runbook;
- integracije: authentication, authorization/tickets access, groups/RBAC, settings, notifications, integration queue, admin realtime, observability i presence;
- E2E reference: 04 i 15, ali bez pravog socket security lifecycle testa.

Ranijih 1.707 LOC iz registra korigovano je direktnim brojanjem na 1.679.

## 3. Arhitektura i tok

`WebsocketGateway` registruje namespace middleware, verifikuje token, attachuje principal i nakon connecta pridružuje user, group i eventualno admin sobu. Periodični lokalni sweep svakih pet minuta usklađuje samo group/admin sobe. `TicketChatGateway` registruje procesne hub listenere, autorizuje explicit `ticket:join`, pridružuje baznu i staff/public sobu, obrađuje presence i mapira hub događaje u sobe.

Redis adapter prenosi room emit između instanci. Boot ACL probe razlikuje `allowed/denied/unknown`; poznati deny ostavlja in-memory adapter, dok unknown instalira Redis adapter i oslanja se na ioredis reconnect. Događaji nemaju sequence/cursor/ack; REST refresh je implicitni recovery.

## 4. Autentikacija, sesija i origin

Cookie credential se prihvata samo uz allowlisted origin, što štiti od cross-site WebSocket hijackinga. Explicit bearer je namjerno namijenjen non-browser klijentima i ne zahtijeva origin. Token verifier potvrđuje credential pri handshakeu i subject ID ne smije biti prazan.

Nakon toga socket čuva samo `{subjectId}`. Nema token expiry/session ID/authz version metapodataka, periodične re-verifikacije, revocation pub/suba niti server-side disconnecta. `session.invalidated` je globalna poruka klijentu; zlonamjeran ili pokvaren klijent je može ignorisati. Logout/revoke/password change zato štiti nove HTTP/socket handshakove, ali stari socket nastavlja primati i slati događaje do fizičkog disconnecta.

Connection-rate limit i maksimalan broj socket konekcija po useru/IP-u nisu definisani. Join/leave i presence window je per-socket pa napadač sa validnom sesijom otvara više socketova i multiplicira DB authorization workload.

## 5. Room authorization i revocation

Ticket join ispravno poziva `TicketsCollaborationService.authorizeSocketJoin`, koji koristi centralni `loadAccessibleTicket` i vraća public/staff visibility. Internal note se emituje samo staff sobi; public odgovor ide public sobi i requester user sobi.

Ali ticket room nije u managed revalidation skupu. Nakon joina socket ostaje u baznoj i visibility sobi bez obzira na forward, requester promjenu, OU/group scope, confidential status, role/permisiju ili deaktivaciju usera. Edge event se dodatno emituje baznoj `ticket:*` sobi, pa ista stale autorizacija obuhvata proizvoljni `data: unknown` payload.

Group/admin sobe se revalidiraju svakih pet minuta. Do tada revocirani member/admin prima događaje. Ako membership query padne, exception se loguje i stare sobe ostaju aktivne neograničeno kroz ponovljeni incident. Revocation-sensitive sistem treba event-driven invalidaciju/disconnect i kratki fail-closed lease, ne petominutni fail-open polling.

## 6. Payload privatnost i routing

Novi `group.feed-changed` je dobar minimalni payload: groupId, ticketId, vrsta promjene i vrijeme; internal-only događaj ga ne proizvodi. Međutim `WS_GROUP_FEED_LEGACY_FULL_EMIT` je default-on. Tada public ticket update ili message šalje puni payload u `group:*`, iako group join provjerava samo membership, ne service/OU/confidential/per-ticket policy. Ticket update otkriva status, prioritet, requester, assignee, actor i lifecycle timestampove; message payload sadrži body i identitete. Startup warning nije security kontrola.

`settings.updated` se emituje svim autentifikovanim socketima i sadrži setting key, visibility i invalidation flag. Vrijednost nije uključena, ali private key imena otkrivaju instalirane feature/provider/security konfiguracije korisnicima bez settings read prava. Public/session signal treba odvojiti od admin-only private metadata.

Admin config room zavisi od ADMIN/SUPER_ADMIN assignmenta, ali bilo koji scoped ADMIN dobija globalne config domain događaje. Trenutni payload je minimalan, no room semantika mora eksplicitno odlučiti da li je to globalna ili scoped administracija prije budućeg proširenja payloadova.

## 7. Konkurencija, ordering i lifecycle

`handleConnection` radi `void client.join(userRoom)` i `void joinHandlerGroupRooms`; gateway loguje connection prije završetka joinova. Događaj emitovan odmah nakon connecta može biti propušten. Greška user-room joina nema log, a group join ima samo generički warning.

Hub listeneri i emitovi su process-local callbacks; Redis distribuira emit, ali nema durable event log. Reconnect nema `lastEventId`, replay ni monotoni sequence. Client mora osvježiti REST stanje, ali taj ugovor nije formalizovan za sve evente. Presence je namjerno best-effort sa 45-sekundnim expiryjem i razdvojenim staff/requester payloadom.

Room revalidation iterira socket po socket i radi dvije DB query grupe po konekciji, sekvencijalno. Velik broj socketova može produžiti sweep preko intervala; nema overlap guarda, batch queryja, concurrency limita ni trajanja/lag metrike.

## 8. Redis adapter i multi-instance ponašanje

Pozitivno ostaju odvojeni pub/sub klijenti, error listeneri, guarded ignored Promisei, boot ACL probe i close helper. Implementacijski dodatak za `BA-websocket-05` uvodi effective health state i runtime probe bez treće Redis konekcije:

- nakon instalacije adaptera, periodična probe ponovo potvrđuje `PSUBSCRIBE socket.io#/#*` i `SUBSCRIBE` request/response kanale na stvarnom adapter subscriberu;
- stvarni publisher šalje nonce na random `socket.io#/#<health-room>#` kanal, a ista adapter PSUBSCRIBE veza mora primiti `pmessageBuffer`. Soba nije joinovana; `@socket.io/redis-adapter` odbaci nepoznatu sobu prije decode-a, pa probe ne isporučuje aplikacijski događaj. Time se provjeravaju i room-channel `PUBLISH` ACL i efektivni pub/sub put;
- command reject ili ioredis connection error odmah postavlja adapter u `degraded`; probe se ponavlja svakih 15 s, a stanje se vraća na `healthy` samo nakon punog uspješnog round-tripa. Runtime ne prebacuje Redis adapter u in-memory, jer bi to lokalizovalo sobe i tiho razdvojilo horizontalni cluster;
- `GET /health/ready` uključuje javni, redigovani `checks.websocketAdapter`; `starting`/`degraded` daje 503. Adapter status se ponovo čita za svaki request, mimo postojećeg 5 s dependency cache-a, pa promjena stanja ne čeka TTL. Log prelaza zadržava `ws_adapter_redis_ok=0` i dodaje `ws_adapter_redis_state`/sigurni reason enum. Uptime Kuma/Coolify readiness i log alarmi su operativni signal.

Poznati boot-time ACL deny (ili nedostajuća Redis konfiguracija) i dalje ostavlja in-memory adapter samo kao API fail-open ponašanje; readiness je **crven**, a cross-instance isporuka se ne smatra funkcionalnom. Nakon ACL popravke ove boot-fallback instance treba rolling-restartati da instaliraju Redis adapter. Runtime kvar ne mijenja adapter u in-memory: ioredis nastavlja reconnect, ali događaji mogu biti izgubljeni dok je stanje degraded; nema durable replay/cursor garancije i klijenti se oporavljaju REST refreshom.

`onModuleDestroy` i dalje pokreće `void realtimeAdapter.close()` i ne awaita ga. Shutdown redoslijed je zaseban otvoreni P3 `BA-websocket-12`, van ovog paketa.

## 9. Rate limit, resource bounds i observability

Join/leave dijele 30/min po socketu; presence ima sličan per-socket limit. Payload parser prihvata bilo koji non-empty ticket ID bez maksimalne dužine/UUID validationa, pa limit ublažava ali ne uklanja nepotrebne DB queryje. Nema globalnog/user/IP connect limita niti max joined ticket rooms; jedan dugovječan socket može akumulirati proizvoljno mnogo autorizovanih ticket soba.

Metrike broje clients i emit vrste. BA-05 dodatak sada loguje promjenu efektivnog Redis adapter stanja i izlaže ga u readinessu, ali ne mjeri end-to-end Socket.IO client acknowledgement niti reconnect/drop gap. Ostaju active rooms po useru/socketu, auth/session revocation lag, stale ticket room, room revalidation duration/overlap i private metadata emit. Logovi connection ID-a ne uključuju user ID, što je privatnosno konzervativno, ali incident korelacija mora koristiti siguran hashed/trace identifikator.

## 10. Testovi i E2E dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/websocket -name '*.spec.ts' -print | sort)
```

Rezultat: **16 suiteova ukupno; 10 prošlo, 6 compile-blocked; 44/44 izvršena testa prošla**. Blokada je nepotpun generated Prisma client: nedostaje `generated/prisma/enums` i `groupMember`/`userRole` delegati. Prošli testovi pokrivaju auth parsing/cookie origin, room helper/revalidation, local limiter, Redis adapter helper, emit counter i dio broadcast logike.

E2E 15 posmatra routing admin frame, ali ne pravi negativnog primaoca niti revocation. E2E 04 primarno provjerava integration job i ticket stranicu, ne socket delivery. BA-05 ciljane unit suite sada pokrivaju adapter-health round-trip preko fake ioredis `pmessageBuffer`, kasnije `PUBLISH`/`PSUBSCRIBE`/`SUBSCRIBE` greške, fail-closed readiness i recovery; sandbox nema live Redis pa nije pokrenut stvarni two-instance acceptance. I dalje nema handshake logout/revoke/expiry testa, ticket access revoke dok je soba otvorena, group/admin immediate revoke, legacy foreign-group disclosure, live cross-instance Redis delivery/failure E2E, reconnect replay ni multi-socket rate testa.

## 11. Pozitivni nalazi

1. Cookie handshake zahtijeva allowlisted origin.
2. Credential parser odbija prazan/neobjektni input.
3. Ticket join koristi centralnu ticket access policy.
4. Staff/public sobe odvajaju internal note od requestera.
5. Presence payload odvaja staff identitete od requester signala.
6. Novi group feed je sadržajno minimalan i isključuje internal evente.
7. User/group/ticket room naming je centralizovan.
8. Join/leave i presence imaju per-socket bounds.
9. Group/admin membership se čita autoritativno, bez cachea.
10. Redis koristi dedicated pub/sub konekcije.
11. ACL probe i command guards sprečavaju dio crash scenarija.
12. Adapter close helper zatvara oba clienta.
13. Emit i client count imaju osnovnu observability podršku.
14. Rolling-deploy runbook dokumentuje sticky/drain zahtjeve.
15. Gateway deregistruje hub listenere i timere.

## 12. Registar nalaza

| ID            | Severity | Nalaz                                                                                      | Status   |
| ------------- | -------- | ------------------------------------------------------------------------------------------ | -------- |
| BA-websocket-01 | P1     | Aktivni socket ignoriše logout/revoke/expiry/password/authz-version promjene               | zatvoreno |
| BA-websocket-02 | P1     | Ticket staff/public/base sobe se nakon joina nikad ne reautorizuju                         | zatvoreno |
| BA-websocket-03 | P1     | Group/admin revocation kasni 5 min i DB kvar ostavlja stare sobe fail-open                 | zatvoreno |
| BA-websocket-04 | P1     | Default-on legacy group emit šalje puni payload bez per-ticket authorizationa              | zatvoreno |
| BA-websocket-05 | P2     | Runtime Redis adapter kvar nema pouzdan fallback/effective-health i gubi cross-instance emit| zatvoreno (W6.48) |
| BA-websocket-06 | P2     | Join/presence limiter je per-socket bez user/IP/connection limita                          | otvoreno |
| BA-websocket-07 | P2     | Private setting key metadata emituje se svim autentifikovanim korisnicima                  | otvoreno |
| BA-websocket-08 | P2     | User/group room join nije awaitan i početni događaj može biti propušten                    | otvoreno |
| BA-websocket-09 | P2     | Reconnect nema sequence/cursor/replay niti formalni catch-up ugovor                        | otvoreno |
| BA-websocket-10 | P2     | Room revalidation je N×sekvencijalna, bez overlap/resource guarda                          | otvoreno |
| BA-websocket-11 | P2     | Socket može akumulirati neograničen broj ticket soba                                       | otvoreno |
| BA-websocket-12 | P3     | Shutdown ne awaita zatvaranje Redis adapter konekcija                                      | otvoreno |
| BA-websocket-13 | P3     | Admin-room global/scoped semantika nije eksplicitna i sigurna za proširenje payloadova      | otvoreno |
| BA-websocket-14 | P3     | Kritična revocation/cross-instance matrica nema lokalni ni E2E dokaz                       | otvoreno |

## 13. Detalji P1 nalaza

### BA-websocket-01 — sesija živi samo na handshakeu

Principal nakon verifikacije sadrži samo subject ID. Revocation store, registry, expiry i authzVersion se više ne konsultuju. Uvesti socket credential lease sa expiryjem, session ID/authzVersionom, revocation pub/sub koji odmah disconnectuje odgovarajuće sockete i periodični fail-closed recheck kao safety net. Test mora zadržati otvoren socket, izvršiti logout/revoke/password change/deactivate i dokazati disconnect + izostanak novih događaja. Ovo je nepromijenjeni audit baseline; W6.31 closeout i preostale dokazne granice su u §20.

### BA-websocket-02 — stale ticket access

`ticket:*`, `:staff` i `:public` izričito su izuzeti iz revalidationa. Otvoren socket zato nadživi access promjenu i prima message/update/presence/Edge. Uvesti access epoch/subscription registry i leave/disconnect na ticket visibility promjenu; kao fallback periodično batch reautorizovati aktivne ticket subscriptione. Visibility upgrade/downgrade mora atomarno zamijeniti sobu. Ovo je izvorni audit baseline; finding-level closeout W6.32 i preostale dokazne granice su u §21.

### BA-websocket-03 — group/admin fail-open revoke

Izvorni audit baseline: petominutni polling ostavlja poznat disclosure prozor, a catch ostavlja sobu bez lease expiryja. Membership/RBAC mutation treba objaviti revocation event svim instancama; soba mora imati kratak authorization lease. Ako autoritativna obnova pada, leave managed room ili disconnect uz alertabilan health signal. W6.33 finding-level closeout i granice dokaza su u §22.

### BA-websocket-04 — legacy puni group payload

Flag vraća true kada env nije postavljen. Group room je membership soba, ali dobija puni public payload koji uključuje ticket/message detalje bez centralne ticket policy provjere. Default mora biti off; kompatibilnost smije biti vremenski ograničena i eksplicitna, ili legacy recipienti moraju biti per-ticket autorizovani. Nakon potvrde klijenata ukloniti granu, ne samo warning.

## 14. Ostali nalazi i korekcije

- **05:** effective adapter health state, publish/subscription probe i readiness/alarm; horizontalni deployment ne smije tiho nastaviti kao lokalni univerzum.
- **06:** distribuiran user/IP token bucket, handshake connection cap i abnormal reconnect zaštita.
- **07:** public signal bez private keya; private metadata samo settings-authorized/admin roomu.
- **08:** connection readiness mora awaitati obavezne sobe ili eksplicitno emitovati `ready`; join greške moraju imati metric.
- **09:** event ID/sequence i reconnect catch-up preko REST cursor/durable streama, najmanje za notification/ticket state.
- **10:** batch membership/role query, bounded concurrency, single-flight sweep i duration/lag metric.
- **11:** cap aktivnih ticket subscriptiona, idempotent room registry i leave/LRU UX.
- **12:** lifecycle destroy vratiti/awaitati Promise i uskladiti runbook sa stvarnim Nest shutdown redoslijedom.
- **13:** definisati global admin-only ili scope-aware config event ugovor prije dodavanja sadržaja.
- **14:** generated Prisma + Redis two-instance CI i revocation/negative-recipient E2E.

## 15. Baseline score

| Presjek                      | Težina | Ocjena |
| ---------------------------- | -----: | -----: |
| A. Arhitektura i granice     |    10% |   5,50 |
| B. API i ugovori             |    12% |   5,80 |
| C. Auth/authz/scope          |    15% |   3,80 |
| D. Poslovna pravila/stanje   |    13% |   4,70 |
| E. Podaci/Prisma/transakcije |    13% |   5,20 |
| F. Sigurnost/privatnost      |    12% |   4,00 |
| G. Async/integracije         |     8% |   5,00 |
| H. Testovi/dokazivost        |    10% |   4,80 |
| I. Operativnost/perf.        |     7% |   6,00 |
| **Ukupno**                   | **100%** | **4,88/10** |

Ponderisani zbir je 4,883. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 16. Fazni plan popravki

### Faza 0 — safety net

Socket ostaje otvoren kroz logout/revoke/password/expiry; ticket forward/confidential/role revoke; group/admin revoke s DB kvarom; legacy foreign member; two-instance Redis outage; immediate post-connect emit; multi-socket limiter bypass.

### Faza 1 — P1 session i room revocation

Session/authz lease + revocation pub/sub/disconnect; ticket subscription registry i access invalidation; event-driven group/admin revoke + fail-closed lease; legacy default-off je zatvoren u W6.30, dok uklanjanje compatibility grane čeka potvrdu klijentskog rollouta.

### Faza 2 — adapter i delivery correctness

Effective Redis health/readiness, runtime subscription probe, alarm i jasno single-instance ponašanje; event sequence i reconnect catch-up ugovor.

### Faza 3 — abuse i resource bounds

Distributed user/IP limiter, connection i room cap, bounded ticket ID validation, batch/single-flight room revalidation.

### Faza 4 — payload i lifecycle

Odvojiti public/private settings događaje, definisati admin scope, awaitati readiness room join i Redis close; presence cleanup testovi.

### Faza 5 — observability i runbook

Revocation lag, stale room, join failure, adapter effective state, replay gap, rooms/socket i sweep duration metrike; incident/drain procedure testirati.

### Faza 6 — finalni gate

Svih 16 direktnih suiteova, Redis two-instance integration, authentication/RBAC/groups/tickets/settings integracije i pravi Socket.IO E2E negativni/revocation testovi na finalnom SHA-u.

## 17. Acceptance i rizik

Event-driven disconnect može prekinuti legitimni UI tokom role promjene; klijent mora imati kontrolisan reconnect i jasan session-expired UX. Ticket subscription registry treba bounded memoriju i cleanup na disconnect. Redis readiness odluka mora poštovati deployment mode: single instance može degradirati, multi-instance mora alarmirati/fail readiness.

Acceptance:

1. Revoked/expired/deactivated session prestaje primati i slati socket događaje bez oslanjanja na klijenta.
2. Ticket access revoke odmah uklanja base/staff/public subscription.
3. Group/admin revoke nema petominutni disclosure prozor niti fail-open bez leasea.
4. Group member bez ticket pristupa nikad ne prima puni payload.
5. Redis cross-instance kvar je vidljiv readinessu i nema lažni healthy status.
6. Rate limit vrijedi agregirano po useru/IP-u kroz više socketova.
7. Neovlašten user ne dobija private setting key metadata.
8. Socket ima definisan ready signal i ne propušta prvi očekivani događaj.
9. Reconnect ima dokaziv catch-up ugovor.
10. Direktni, integration i E2E testovi prolaze.

## 18. Konačna presuda

Websocket modul ima dobru početnu handshake, ticket join, staff/public i Redis strukturu, ali authorization nije trajna osobina konekcije. Izvorni audit baseline je bilježio session/ticket/group revocation praznine i default-on puni group payload. Iskren, nepromijenjeni baseline je **4,88/10**. Finding-level closeouti su: W6.30 `BA-websocket-04` (default off; §19), W6.31 `BA-websocket-01` (session lease; §20), W6.32 `BA-websocket-02` (ticket-room revalidation; §21), W6.33 `BA-websocket-03` (group/admin lease i fail-closed; §22) i W6.48 `BA-websocket-05` (effective Redis adapter health; §23), bez rescoringa. `BA-websocket-06`–`13` i širi revocation/cross-instance acceptance `BA-websocket-14` ostaju otvoreni.

## 19. Statusna dopuna — BA-websocket-04 closeout (2026-11-07)

`BA-websocket-04` (P1) zatvara se kroz W6.30. Legacy full-payload emit više nije default-on: samo eksplicitni `WS_GROUP_FEED_LEGACY_FULL_EMIT=on|true|1` uključuje compatibility granu; unset, off/false/0, prazna i nepoznata vrijednost ostaju fail-closed. U normalnom radu membership-only group sobe dobijaju samo laki `group.feed-changed` signal. Repo frontend već sluša taj događaj. Compatibility grana ostaje samo kao dokumentovan, privremeni opt-in za stare klijente i mora se ugasiti nakon potvrde rollouta; nije omogućena na ciljnoj instalaciji niti je rollout/deployment nezavisno provjeren. Detalji su u [paketu 145](../implementation/145-websocket-04-default-off-group-payload.md) i [rolling-deploy runbooku](../../../ops/ws-rolling-deploy.md#5-group-feed-payload-compatibility).

Automatski CI [`42374380242`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42374380242) na kodnom SHA-u [`7d47e44`](https://github.com/mudzy992/help-desk-enterprise/commit/7d47e44a4aa7d039b63bdbb82bd51907a6af9cdf) prošao je backend build/lint/full Jest, PostgreSQL+Redis integration, frontend build/test i Docs guard. E2E critical/install/inventory su `skipped`, ne passed; full E2E nije ručno dispatchan. Backend container/supply-chain enforcement i ukupni CI gate su **failed** zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (scan navodi fixed version `1.4-r0`); ovo nije zeleni CI run i ovaj websocket paket nije mijenjao image/dependencies.

Perf nije pokrenut jer WebSocket path nije u push filteru. Posljednji Perf [`42289613508`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42289613508) ostaje **failed** na globalnom, nepromijenjenom query budgetu `2.128 > 2.1`; nema dokaza koji ga pripisuje BA-websocket-04 i threshold nije mijenjan.

Zatvara se samo nalaz da je legacy group payload uključen po defaultu. Ako se izričito uključi compatibility flag, puni public payload i dalje ide članovima grupe bez per-ticket authorizationa; zato je opt-in sigurnosno osjetljiv i privremen. `BA-websocket-01`, `BA-websocket-02`, `BA-websocket-03` i širi `BA-websocket-14` ostaju otvoreni. Baseline **4,88/10** nije rescoraan. Nema target-DB upotrebe, migracije, PR-a, mergea ni deploymenta.

## 20. W6.31 closeout — BA-websocket-01 (2026-11-07)

`BA-websocket-01` (P1) je **zatvoren na finding nivou** nakon generated-Prisma backend CI-a, prolaza real PostgreSQL+Redis integration joba i actual-socket dokaza. Lease čuva verificirane `subjectId`, nullable `sessionId` (`sid`), `jti`, `issuedAt` (`iat`), `expiresAt` (`exp`) i durable `authzVersion`; sirovi bearer se ne čuva u principalu i nakon uspješnog handshaka uklanja se iz `handshake.auth.token`, `helpdesk_session` cookieja i Authorization headera. Legacy token bez `sid` zahtijeva durable user-authority snapshot, ne samo opcionalni cache.

Revocation/authz događaji šalju best-effort Redis Pub/Sub invalidaciju na `servicedesk:auth:socket:invalidate`, a subscriber svake instance prekida podudarne lokalne klijente. Safety sweep se pokreće odmah i zatim svakih 15 sekundi; authority check timeout je 5 sekundi, concurrency cap 25, a neuspješan check je fail-closed. Repo ACL primjer `&servicedesk:*` pokriva static kanal, ali deployed Redis ACL nije nezavisno provjeren.

**Stvarni Socket.IO dokaz:** integration spec sada pokreće dva stvarna Socket.IO servera i dva `socket.io-client` klijenta (`socket.io-client@4.8.3`, test-only devDependency). Oba otvorena klijenta primaju kontrolni event prije revocationa; `SessionRevocationStore.revokeSession()` objavljuje signal preko stvarnog Redis Pub/Sub; oba lokalna klijenta dobijaju server-disconnect, a naknadni pokušaj emitovanja ne stiže nijednom. CI integration runner sadrži ovu spec i job postavlja `REDIS_HOST=127.0.0.1`. Posebni lifecycle test pokriva logout, session revoke, password revoke-all i deactivation invalidacije uz socket test double; lokalni stvarni Socket.IO smoke test potvrdio je connect → pre-event → disconnect → bez post-event i nezavisno od Redis-a. Šira browser/E2E matrica nije izvršena i ostaje `BA-websocket-14` scope.

**CI na kodnom SHA-u `2a4191552b1e4d14013e63caad3b8af8677df3a7`:** run [`42381576575`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42381576575) prošao je generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration job, frontend build/test i Docs guard. Job `Run real PostgreSQL integration suites` je success; raw suite log preuzimanje vraća `EOF`, pa zaseban test-count/PASS red nije moguće izvući, ali suite je u runner listi i Redis je omogućen u tom jobu. E2E critical flows, E2E install wizard i read-only inventory su `skipped`. Backend container/supply-chain i ukupni CI gate su **failed**: image scan je našao `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (fixed `1.4-r0`), a GitHub Sigstore attestacija je dobila `InternalError: error creating tlog entry - (500) unexpected result from transparency log`. Ovi gate neuspjesi nisu predstavljeni kao zeleni i nisu mijenjani u BA-01 scopeu.

Za ovaj test-only follow-up nije pokrenut novi Perf smoke. Posljednji run [`42379825934`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42379825934), na ranijem runtime SHA-u `47a34f1`, **failed** na nepromijenjenom query budgetu: `avg=2.124` prema `2.1`, `requests=50707`, `p95=3`, `max=34`. Nema dokaza da je taj rezultat uzrokovan BA-01 i prag nije mijenjan.

Na W6.31 checkpointu zatvarao se samo `BA-websocket-01`; `BA-websocket-02`, `BA-websocket-03` i širi `BA-websocket-14` tada su ostali otvoreni. W6.32 kasnije zatvorio je samo `BA-websocket-02` (vidi §21). Baseline **4,88/10** nije rescoraan. Detalji i lokalne/CI granice: [W6.31 / paket 146](../implementation/146-websocket-01-session-lease.md). Nije korištena target baza, promijenjena migracija niti urađen PR, merge ili deployment.

## 21. W6.32 closeout — BA-websocket-02 (2026-11-07)

`BA-websocket-02` (P1) zatvara se na finding nivou: ticket subscriptioni sada imaju per-ticket epoch i active/pending registry; `ticket.updated` pokreće brzu reautorizaciju lokalnih socketova, a per-process 60-sekundni single-flight sweep je fallback. Reautorizacija napušta prethodnu base/staff/public kombinaciju prije pridruživanja tačno jednoj novoj audience sobi. Izgubljeni pristup uklanja sve ticket sobe i presence; neuspješno napuštanje sobe prekida socket. Message, ticket-update i ticket-scoped Edge fan-out čekaju tekuću revalidaciju; presence zahtijeva aktuelnu subscription/epoch provjeru. Persisted-message publisher šalje `ticket.updated` prije povezane poruke.

Durable outbox putanja koristi `TicketRealtimeHub.publishTicketUpdatedAwaitedOnce`: uspješno objavljen update sa istim `(ticketId, sourceMessageId)` ne ponavlja se kada kasniji message publish zahtijeva retry; in-flight isti publish se coalesce-a, a failed publish se ne kešira. Ovaj dedupe je procesni, bounded na 10.000 zapisa / 24 sata i nije durable/cross-instance exactly-once ugovor.

**Stvarni Socket.IO dokaz:** `ticket-chat.gateway.socket.spec.ts` podiže Socket.IO server i `socket.io-client`; mock authorizationom demonstrira staff→public room downgrade, revoke i izostanak staff/public/base/Edge/presence isporuke nakon revoke-a, dok je konekcija i dalje otvorena. Unit regression pokriva upgrade/downgrade, pending-event gating, presence, epoch/registry, fallback i outbox update dedupe/retry. Ovo nije PostgreSQL/Redis niti multi-instance Socket.IO test. `ticket.updated` invalidation na svim instancama i svi mutation producenti nisu iscrpno dokazani; fallback interval i širi `BA-websocket-14` ostaju granice ovog closeouta.

Finalni kodni/testani SHA je [`af79131`](https://github.com/mudzy992/help-desk-enterprise/commit/af79131724316599e0cefc974ac9894e705bafd8); CI [`42387445250`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42387445250) prošao je generated-Prisma backend build/annotated diagnostics, lint/full Jest, cijeli PostgreSQL+Redis integration job (uključujući connection-budget i `Run real PostgreSQL integration suites`), frontend build/test i Docs guard. Container image build/SBOM/attestacija su prošli, ali zero-high/critical enforcement i ukupni CI gate su **failed** zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (fixed `1.4-r0`). E2E critical/install i read-only inventory su `skipped`. Lokalno je targeted ESLint passed, targeted Jest 6 suites/26 tests passed uz diagnostics-off, te `git diff --check` passed. Perf nije pokrenut na ovom SHA-u; posljednji opaženi Perf [`42379825934`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42379825934) ostaje globalni failure `2.124 > 2.1`, bez BA-02 atribucije i bez promjene praga.

**Neuspjeli pokušaji i korekcije:** CI [`42385698263`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42385698263) na `1dc8814` otkrio je `TS2367` na drugom direktnom `client.disconnected` checku; `socketIsDisconnected()` follow-up `5e8e45f` to je popravio. U tom runu connection-budget i image-build koraci takođe nisu prošli; failed-log downloads vratili su `EOF`, pa se uzrok ne nagađa. CI [`42386156410`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42386156410) na `5e8e45f` prošao je backend build/lint/full Jest, ali je real PostgreSQL suite otkrio regresiju iz ovog paketa: awaited ticket-update projekcija se ponovila nakon uspješnog update publish-a i kasnijeg message delivery failurea, pa `ticket-playbook-auto-attach.integration.spec.ts` vidio dupli `sourceMessageId`. `af79131` dodao je bounded retry-safe dedupe i retry/failure/concurrency testove; finalni DB/Redis integration job je passed. CVE enforcement ostaje jedini failed job u finalnom CI runu.

Na W6.32 checkpointu zatvoren je samo `BA-websocket-02`; `BA-websocket-03` (P1), `BA-websocket-05`–`13` i širi `BA-websocket-14` (P3) tada su ostali otvoreni. W6.33 je naknadno zatvorio samo BA-03 (§22). Globalni BA-15 full critical-flow acceptance ostaje pending. W6.32 checkpoint counts: source audit/plan 525 otvoren / 167 zatvoren; globalni registar 535/157. Deset ranijih statusnih divergencija ostaje netaknuto. Baseline **4,88/10** nije rescoraan. Nema schema promjene, migracije, target-DB upotrebe, PR-a, mergea ili deploymenta. Detalji: [W6.32 / paket 147](../implementation/147-websocket-02-ticket-room-revalidation.md).

## 22. W6.33 closeout — BA-websocket-03 (2026-11-07)

`BA-websocket-03` (P1) zatvoren je na finding nivou na kodnom/testanom SHA [`4210ed2`](https://github.com/mudzy992/help-desk-enterprise/commit/4210ed292b222fa9bf832f2561a8479d0333f50c). Closeout se odnosi na group/admin soba revocation, a ne na širi `BA-websocket-14` cross-instance/E2E acceptance.

### Authorization i fail-closed ponašanje

- `SocketGroupMembershipService.roomAccessForUser()` vraća jednu joined autoritativnu baznu sliku: aktivnost korisnika, `authzVersion`, group membership ID-eve i ADMIN/SUPER_ADMIN assignment. Room snapshot mora odgovarati authz versionu socket leasea; neaktivan/nepostojeći korisnik ili version drift zatvara socket umjesto da stari lease dobije nove sobe.
- Revalidation koristi single-flight lokalni sweep svakih 30 sekundi kao reconciliation fallback. Jedan DB snapshot se dijeli između svih lokalnih socketa istog korisnika, uz concurrency cap 25 po procesu i timeout od 5 sekundi po korisničkom čitanju. Sweep se ne preklapa sam sa sobom.
- DB read error ili timeout odmah uklanja sve managed `group:*` / `role:admins` sobe za pogođenog korisnika; `user:*` i ticket sobe ostaju u vlasništvu svojih odvojenih kontrola. Ako `leave` ne može potvrditi uklanjanje ili room join/leave ostavi neizvjesno stanje, socket se prisilno disconnecta. Alertabilni structured warning je `socket_room_revalidation_failed ... fail_closed=1`.
- Početni handshake sada koristi istu authz-version-bound revalidation putanju, umjesto odvojenih group i admin čitanja. Tako se grant sobe i verzija provjeravaju u jednom database snapshotu.

### Mutation invalidation i cross-instance dokaz

Group membership add/remove/delete i podržane user/role authz promjene pozivaju `PrincipalContextInvalidator` nakon DB commita. Invalidator bumpa `User.authzVersion` i best-effort objavljuje `users` invalidation preko `servicedesk:auth:socket:invalidate`; subscriber svake API instance disconnecta odgovarajuće lokalne sockete. Ako Redis signal izostane, postojeći session lease safety sweep provjerava durable user/authz stanje svakih 15 sekundi i disconnecta na drift, timeout ili DB failure. Dodatni 30-sekundni room sweep hvata propuštene/out-of-band membership promjene; više nije primarni poznati revocation prozor. Naknadni bounded audit producer-a i djelimičnih upisa dokumentovan je ispod; ne zatvara širi `BA-websocket-14` niti druge nalaze.

**Stvarni Socket.IO + Redis acceptance:** u `socket-session-invalidation.integration.spec.ts` dva odvojena stvarna Socket.IO servera i dva `socket.io-client` klijenta uđu u `group:*` i `role:admins`, prime kontrolne događaje, a zatim `PrincipalContextInvalidator.invalidateUser()` (fake Prisma version bump; stvarni Redis pointer/publish) pošalje `users` invalidation. Oba Redis subscriber-a na odvojenim serverima disconnectaju lokalnog klijenta; nakon toga nema group/admin događaja. Ovaj test koristi stvarni Redis Pub/Sub i socket transport, ali ne Redis Socket.IO adapter; mutation hook coverage se dodatno provjerava u `groups.service.spec.ts`, `assign-user-role.spec.ts`, `remove-user-role.spec.ts` i `roles.service.spec.ts`.

### Dopunski audit authorization-mutacija i djelimičnih upisa (2026-11-07)

Naknadni code audit je provjerio RBAC, group, privacy, policy-pack, directory-sync, OU, startup/install i identity/password putanje. Ovo je produžetak producer audit-a, ne novo zatvaranje nalaza i ne promjena BA-14 statusa.

- **Policy-pack/RBAC:** pack apply/unapply sada u jednoj DB transakciji prikuplja i potom batch-invalidira novododijeljene/uklonjene korisnike te postojeće holdere roleova čiji se globalni permission linkovi promijene. Default-role seeder prikuplja holdere promijenjenih roleova i u `finally` pokušava invalidaciju i nakon djelimično commitanih autocommit upisa; `rolePermission.create` response-loss test pokriva commit-prije-greške.
- **Privacy:** brisanje `UserRole` i `GroupMember` redova premješteno je u finalnu transakciju koja istovremeno deaktivira/anonymizira korisnika i bumpa `authzVersion`. Tek nakon commita poziva se `notifyUserChanged(userId, committedVersion)`, bez drugog DB bumpa; API worker wiring i `privacy-replay --apply` wiring su dodani. Replay može raditi bez Redis invalidatora uz upozorenje; durable verzija i session-check ostaju fallback. Integration assertion provjerava da se hook poziva tek nakon committed erasure/role/group deletion.
- **Install/startup:** fallback membership se dodaje nakon outer seed commita kroz postojeći `addGroupMember` domain flow, pa hook vidi commit; default-role seed dobija batch holder invalidation. CLI seed putanja podiže Redis invalidator kada je dostupan, a bez njega radi durable authz-version bump.
- **Directory/OU:** user materialization bilježi postojeći ID prije upsert-a i poslije batch-invalidation pokušaja sačuva primarnu write grešku; OU read materialization unaprijed uzima distinct role holdere putanja koje se mijenjaju. Full LDAPS plan unaprijed uzima holdere planned OU updates, konzervativno queue-a postojeće user/role mutacije prije autocommit zapisa i pokušava invalidaciju čak i kad je naknadni session-revoke hook pao. Manual subtree path rewrite batch-invalidira holdere u cijelom promijenjenom subtree-u. Novi testovi simuliraju DB odgovor izgubljen nakon commita, kasniji red grešku i revoke-hook grešku.
- **Identity/password:** reset, unlink i manual directory-link pozivaju invalidaciju odmah poslije transakcije, prije summary read-a/emaila gdje je primjenjivo. `EntraIdentityBinder.bind` sada u istom conditional `updateMany` atomarno mijenja `entraObjectId` i bumpa `authzVersion`, zatim best-effort čita verziju i poziva `notifyUserChanged`; crash prije Redis publish-a i dalje ostavlja durable lease fence. `mustChangePassword` je već provjeren durable session/authz fence-om. Novi/JIT korisnik nema ranije cache entry i ne treba invalidaciju.
- **Već postojeći producer-i:** direct group add/remove/delete, role permission replacement, user create/update/delete i role assign/remove imaju provjerene hookove; `ensure-e2e-actors` CLI već prosljeđuje invalidator za postojeće actor authorization promjene. Ovi nalazi nisu mijenjani.

Lokalno na follow-up SHA-u `c125299`: targeted ESLint i `git diff --check` passed; fokusirani Jest je prošao **24 suites / 156 tests** uz privremeni ts-jest config sa diagnostics isključenim i Prisma service stubom. To nije generated-Prisma typecheck/full suite. Redis nije lokalno dostupan; real Redis integration test nije lokalno izvršen. Privacy integration assertion također nije lokalno izvršen: bez generated Prisma klijenta spec ne može da se pokrene. Automatski CI [`42398133430`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42398133430) za [`c125299`](https://github.com/mudzy992/help-desk-enterprise/commit/c1252993c7a62316de695048a8cc0a494487f2a6) **nije prošao ukupni gate**: generated-Prisma build i backend lint, PostgreSQL+Redis integration, frontend i Docs guard prošli su; Jest anotacija je prijavila da `install-di-metadata.spec.ts` nema `PrincipalContextInvalidator` u static provider registryju; container zero-high/critical gate pao je na `zlib@1.3.2-r1: CVE-2026-4738 [Critical]`. E2E/inventory su skipped. Prvo test-registry nedostajanje popravljeno je u [`1058e99`](https://github.com/mudzy992/help-desk-enterprise/commit/1058e99), ali CI [`42399358211`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42399358211) i dalje je pao na istoj metadata spec provjeri: `PrincipalContextInvalidator` Redis parametar emituje `Function` jer je Redis type-only import; postojeći `@Inject(redisTokens.client)` token eksplicitno nadjačava taj reflected type u Nest-u. Test guard je zato korigovan da `Function` prijavljuje samo kada ne postoji eksplicitni `@Inject` token, u commit-u [`9bed7b3`](https://github.com/mudzy992/help-desk-enterprise/commit/9bed7b3). Automatski CI [`42400488710`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42400488710) na `9bed7b3` je završen: backend build/lint/full Jest, PostgreSQL+Redis integration, frontend i Docs guard su prošli; E2E/install/inventory su skipped. Ukupni CI gate **failed**; jedini primarni failed job je zero-high/critical container enforcement zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]`. Zato ni ovaj najnoviji CI nije zelen. Perf nije pokrenut.

### Procjena DB opterećenja 30-sekundne reconciliation putanje

- Za instancu `i`, `U_i` je broj različitih validnih/authenticated subject-a u lokalnoj Socket.IO mapi; room sweep radi jedan joined `roomAccessForUser` Prisma read po subject-u na svakih 30 sekundi: steady-state procjena je `ΣU_i / 30` SQL statements/s preko svih instanci. Primjer: 1.000 različitih subject-a na jednoj instanci ≈ **33,3 joined SQL reads/s**; više socket tabova istog korisnika deduplicira se.
- Zaseban 15-sekundni session lease sweep radi jedan durable SQL authority read po različitom neisteklom lease-u plus jedan Redis MGET kada je Redis konfigurisan: `ΣL_i / 15` SQL reads/s (`L_i` = distinct lokalne lease grupe; različiti tokeni istog korisnika mogu brojati odvojeno). `sid` putanja je joined session/user read, legacy token direktno čita user. Ako 1.000 subject-a ima 1.000 različitih lease-eva na jednoj instanci, oba safety sweepa zajedno daju približno **100 SQL reads/s** steady-state, uz oko 66,7 Redis MGET/s.
- Oba scheduler-a pokreću sweep odmah pri startu i potom svakih 30/15 sekundi; formule su dugoročni steady-state prosjek i ne uključuju početni burst do `U_i` room reads plus `L_i` lease reads po instanci. Sinhronizovani restarti više instanci mogu te početne valove poravnati; nema runtime tracea niti izmjerenog jittera.
- Obje putanje imaju concurrency cap 25, 5s caller timeout i lokalni non-overlap guard. Timeout je `Promise.race`, ne dokaz otkazivanja underlying Prisma statementa; tokom zastojâ stvarni in-flight DB rad može preći concurrency broj i timeoutovani SQL može se akumulirati iako wrapper sweep ne overlap-a. Ovo su code-derived procjene, ne runtime mjerenje; query trace/load test nije prikupljen i procjena ne uključuje API saobraćaj.

Lokalno na originalnom kodnom SHA-u `4210ed2`: targeted ESLint passed; **8 targeted Jest suites / 50 tests passed** uz ts-jest diagnostics isključene zbog nedostajućeg lokalno generisanog Prisma klijenta; Redis integration spec je bio `skipped` jer `REDIS_HOST` nije bio postavljen; `git diff --check` passed. CI generated-Prisma build/type diagnostics je compile dokaz za taj core commit.

### CI i granice

Automatski push CI [`42390943711`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42390943711) na `4210ed292b222fa9bf832f2561a8479d0333f50c` prošao je generated-Prisma backend build/lint/full Jest, cijeli PostgreSQL+Redis integration job (uključujući `Run real PostgreSQL integration suites` i novi Redis/Socket.IO authz invalidation test), frontend build/test i Docs guard. **Ukupni CI gate nije zelen:** jedini failed job je zero-high/critical image enforcement zbog `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (annotated fix `1.4-r0`); image build, SBOM, attestation i runtime-contract koraci su passed. E2E critical/install i read-only inventory su `skipped`. Perf nije pokrenut; posljednji opaženi Perf [`42379825934`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42379825934) i dalje je globalni failure `2.124 > 2.1`; prag nije mijenjan niti je rezultat pripisan BA-03.

Zatvoren je samo `BA-websocket-03`. `BA-websocket-05`–`13` i širi `BA-websocket-14` ostaju otvoreni; baseline **4,88/10** nije rescoraan. Source audit/plan sada prikazuju **524 otvoren / 168 zatvoren / 692 ukupno**; redovi globalnog registra **534 otvoren / 158 zatvoren / 692 ukupno**. Deset poznatih divergencija prema globalnom registru ostaje netaknuto. Val 6 je **37/109 zatvorenih**, **72 otvorena** (14 P1 / 41 P2 / 17 P3). Nema target-DB upotrebe, schema promjene, migracije, PR-a, mergea ili deploymenta. Paket: [W6.33 / paket 148](../implementation/148-websocket-03-group-admin-room-lease.md).

## 23. W6.48 closeout — BA-websocket-05 (2026-10-29)

`BA-websocket-05` (P2) zatvoren je na finding nivou uz effective process-local adapter health, fail-closed readiness i runtime signal za Redis publish/subscribe/connection kvarove. Scope je samo `BA-websocket-05`; susjedni WebSocket nalazi i BA-15 nisu dirani.

### Implementacija i prihvat

- Adapter koristi samo dva stalna Redis klijenta (dedicated publisher i subscriber). Nakon instalacije se odmah i svakih 15 s na stvarnom adapter subscriberu ponovo potvrđuju tačni `PSUBSCRIBE`/`SUBSCRIBE` kanali; stvarni publisher šalje nonce na random, nejoinovanu `socket.io#/#health-<uuid>#` room putanju i monitor čeka isti `pmessageBuffer` na adapterovom PSUBSCRIBE toku. Probe provjerava room-channel `PUBLISH` ACL i aktivnu lokalnu adapter putanju, bez aplikacijskog eventa ili treće health konekcije.
- Adapter `healthy` važi samo nakon uspješne kompletne probe. Command rejection, ACL deny ili ioredis connection lifecycle odmah postavlja `degraded`; generation guard sprečava da starija probe koja je već bila in-flight pregazi noviju grešku. Naredna, poslije greške pokrenuta probe vraća `healthy` tek nakon punog uspjeha.
- Runtime ne prebacuje postojeći Redis adapter u in-memory. ioredis zadržava reconnect; boot-time ACL/config fallback ostaje samo kao API fail-open stanje i readiness je degraded. Nakon ACL popravke fallback instance traže rolling restart.
- `/health/ready` prikazuje samo `checks.websocketAdapter: ok|fail`, vraća 503 kada je stanje `starting`/`degraded` i čita process-local adapter stanje za svaki request mimo postojećeg 5 s dependency cache-a. Log prelaza zadržava `ws_adapter_redis_ok=0/1`, dodaje `ws_adapter_redis_state` i safe reason enum.
- Runbooki opisuju readiness/alarm, ACL, reconnect, rolling-restart za boot fallback i REST refresh ograničenje: Redis outage može izgubiti in-flight evente; ne uvodi se durable replay/ack ugovor.

### Testovi i CI

Finalni kod/test SHA je [`ef52725`](https://github.com/mudzy992/help-desk-enterprise/commit/ef5272504b834aace79a3d6d20d24b1e6ad7e983). Push-triggered CI [`42591845905`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42591845905) je **overall success**: generated-Prisma backend build/lint/full Jest, real PostgreSQL+Redis integration job, frontend build/test, Docs guard, container/supply-chain job i završni CI gate su passed. E2E critical/install i read-only service-form inventory bili su `skipped`; conditional high/critical image enforcement je takođe `skipped`, ne passed. Full E2E nije ručno pokretan. Perf nije pokrenut.

Lokalno su prošli adapter/health/readiness Jest **3 suitea / 25 testova**, gateway/module Jest **2 suitea / 11 testova** (lokalni `diagnostics:false` workaround zbog nedostajućih generated Prisma delegate tipova u test mocku), targeted ESLint, docs-content guard **9/9**, backend wiring guard (**99 controllera / 620 ruta**) i `git diff --check`. CI generated-Prisma build/full Jest potvrđuje tipove i suiteove koji nisu mogli lokalno pokrenuti s tim mockom.

**Granica integracijskog dokaza:** sandbox nema `redis-server` ni Docker; `ops/ws-cross-instance-check.mjs` i zaseban live Redis/ACL Socket.IO adapter round-trip nisu pokrenuti lokalno. CI PostgreSQL+Redis job je prošao, ali se ne tvrdi da je taj job izvršio BA-05 probe kanal na dvije stvarne Socket.IO instance. Unit fake-client test pokriva runtime `pmessageBuffer` kontrakt, command greške, stale-probe race i recovery; staging runbook zadržava stvarni dvostruki cross-instance emit kao dodatnu operativnu provjeru.

### Status i granice

- W6.48 zatvara samo `BA-websocket-05`; severity ostaje P2, baseline ocjena audita **4,88/10** nije rescoraan.
- Izvorne audit-tabele i generisani plan: **509 otvoren / 183 zatvoren / 692 ukupno**. Redovi globalnog registra: **519 otvoren / 173 zatvoren / 692 ukupno**. Deset historijskih statusnih razlika ostaje netaknuto.
- Val 6: **52/109 zatvorenih, 57 otvorenih** (**0 P1 / 40 P2 / 17 P3**). `BA-websocket-06`–`13`, `BA-websocket-14`, `BA-notifications-14`, `BA-integration-queue-05`, ostali P2/P3 i BA-15 full critical-flow acceptance ostaju otvoreni/pending. Val 6 nije završen.
- Nema schema promjene, migracije, target-DB upotrebe, PR-a, mergea ili deploymenta. Naredni Val 6 nalaz nije odabran ovim closeoutom; ne širiti scope bez nove odluke.

Detalji implementacije i artefakti: [paket 163 / W6.48](../implementation/163-websocket-05-runtime-adapter-health.md), [Redis-down runbook](../../../ops/runbook/redis-down.md), [WS reconnect runbook](../../../ops/runbook/ws-reconnect-storm.md) i [rolling-deploy runbook](../../../ops/ws-rolling-deploy.md).

## 24. W6.49 implementation status — BA-websocket-06 (2026-10-29)

`BA-websocket-06` je odabran u prirodnom Val 6 P2 redoslijedu nakon W6.48. Ova dopuna bilježi implementaciju u radnoj grani; **ne zatvara finding** i ne mijenja audit/plan/globalni registar brojčano.

- Handshake uzima Socket.IO transport adresu bez `X-Forwarded-For`; IP bucket je burst 120/refill 1 token na 500 ms. Poslije autentikacije postoji user reconnect bucket burst 8/refill 1 token na 5 s i atomarna granica od 8 aktivnih konekcija po korisniku.
- Redis Lua token bucket koristi Redis server vrijeme. User/IP ključevi su HMAC pseudonimi. Ticket join/leave i presence zadržavaju socket-level zaštitu i dodatno koriste odvojene shared per-user bucket-e burst 60/refill 1 token na 250 ms.
- Konekcija dobija 60-sekundni Redis lease, obnavlja se svakih 20 sekundi i otpušta se na disconnect; neuredno prekinut socket se čisti istekom leasea. Odbijanje/prekoračenje i Redis/signing-secret nedostupnost su fail-closed; limiter operacija ima 2 s hard timeout.
- Lokalni targeted Jest: **5 suiteova passed, 46 passed tests; Redis integration suite skipped (2 tests)** jer `REDIS_HOST` nije postavljen. `diagnostics:false` je korišten zbog nedostajućih generated Prisma artefakata. Targeted ESLint je passed. `prisma generate` nije uspio jer sandbox nema pristup `binaries.prisma.sh`; local generated-Prisma build/type verification nije dostupna. Nema live Redis/two-instance acceptance niti push-triggered CI dokaza.
- Nema schema promjene, migracije, target-DB upotrebe, PR-a, mergea ili deploymenta. `BA-websocket-05`, `BA-websocket-14`, susjedni nalazi i Val 6/plan 6.3 release acceptance nisu obuhvaćeni.

Detalji i datoteke: [paket 164 / W6.49](../implementation/164-websocket-06-distributed-admission-limits.md). `BA-websocket-06` ostaje **otvoren** do potrebnog CI/generated-Prisma i stvarnog dvoklijentskog Redis acceptance dokaza.

## 25. W6.50 implementation status — BA-websocket-07 (2026-10-29)

`BA-websocket-07` je naredni P2 po prirodnom WebSocket audit redoslijedu. Ova dopuna bilježi samo promjenu realtime rutiranja; **ne zatvara finding** i ne mijenja audit/plan/globalni registar brojčano.

- `settings.updated` svim socketima šalje samo `occurredAt`, kao keyless invalidation signal. `key`, `visibility` i druga setting metadata ne napuštaju globalni broadcast.
- Private/secret metadata ide pod `settings.private-metadata.updated` samo u postojeći `role:admins` room, čije članstvo dolazi iz serverskog role snapshot-a i održava ga socket room revalidation. Taj room je uži od `settings.read`; ne-admin korisnici s tom permission dobijaju keyless signal i podatke mogu refreshati autorizovanim HTTP API pozivom. Namjerno se ne uvodi nova settings-permission soba.
- `session.invalidated` ostaje globalan radi sign-out ponašaja, ali nosi samo timestamp, bez naziva settinga.
- Ciljani dokaz provjerava globalni keyless signal, admin-only private metadata, javni setting bez privatnog eventa i session invalidation bez ključa. CI i puna acceptance verifikacija nisu tvrdjeni.
- Nema API/schema/migracije ni promjene susjednih nalaza. `BA-websocket-07` ostaje **otvoren** do provedenih ciljanih testova i CI potvrde.

Detalji: [paket 165 / W6.50](../implementation/165-websocket-07-private-settings-metadata-routing.md).
