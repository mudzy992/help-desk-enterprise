# Backend audit 18 — `websocket`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **4,88/10**  
**Nalazi:** 4 P1, 7 P2, 3 P3

## 1. Executive summary

`websocket` autentifikuje Socket.IO handshake, pridružuje user/group/admin i ticket visibility sobe, prenosi ticket, notification, Edge, settings i admin-config događaje, održava presence i koristi Redis adapter za horizontalno skaliranje. Temelj sadrži dobre odluke: cookie handshake zahtijeva dozvoljen origin, ticket join koristi centralnu access policy, internal note ide samo staff sobi, group feed ima lagani payload, Redis ima posebne pub/sub konekcije i ACL probe, a join/presence imaju lokalne limite.

Baseline je ipak **4,88/10**. Četiri P1 nalaza ruše revocation i privacy granicu. Socket autentikacija se provjerava samo na handshakeu: logout, revoke-all, promjena lozinke, idle/session expiry i authz-version promjena ne prekidaju postojeću konekciju. Ticket sobe se autorizuju samo pri joinu i nikad revalidiraju, pa forward, promjena OU/grupe, confidential flag ili role revocation ne oduzima stream. Group/admin sobe se provjeravaju tek svakih pet minuta, a DB greška je fail-open. Konačno, legacy full-payload group emit je uključen po defaultu i šalje puni javni ticket/message payload svim članovima grupe iako članstvo samo po sebi nije dokaz pune ticket vidljivosti.

Dodatni problemi su runtime Redis degradacija bez pouzdanog fallback/state signala, per-socket rate-limit koji se lako multiplicira, globalno emitovanje private setting key metadata, neawaitani room join, izostanak replay/catch-up ugovora i nedovoljna E2E revocation/cross-instance matrica. Nema P0. Popravke nisu implementirane prije završetka kompletnog audita.

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

Pozitivno su odvojeni pub/sub client, error listeneri, guarded ignored Promisei, ACL probe i clean-close helper. Poznati ACL deny jasno ostavlja in-memory adapter i warning. Runbook dokumentuje sticky sessions i drain.

Za `unknown` se adapter ipak instalira. Kasniji ACL command reject se samo loguje; Socket.IO i dalje smatra Redis adapter aktivnim, nema prebacivanja na in-memory, health state promjene, reconnect validationa niti alarma zasnovanog na isporuci. Emit može nestati cross-instance dok boot log ostaje `ws_adapter_redis_ok=1`. In-memory fallback u horizontalnom deploymentu takođe nije funkcionalno siguran: lokalni user/ticket socket na drugoj instanci ne prima događaj.

`onModuleDestroy` pokreće `void realtimeAdapter.close()` i ne awaita ga. NestJS lifecycle zato može nastaviti shutdown prije zatvaranja pub/sub konekcija, suprotno runbook tvrdnji o redoslijedu drain/close.

## 9. Rate limit, resource bounds i observability

Join/leave dijele 30/min po socketu; presence ima sličan per-socket limit. Payload parser prihvata bilo koji non-empty ticket ID bez maksimalne dužine/UUID validationa, pa limit ublažava ali ne uklanja nepotrebne DB queryje. Nema globalnog/user/IP connect limita niti max joined ticket rooms; jedan dugovječan socket može akumulirati proizvoljno mnogo autorizovanih ticket soba.

Metrike broje clients i emit vrste te loguju adapter greške i join-limit rejection. Nedostaju: active rooms po useru/socketu, auth/session revocation lag, stale ticket room, room revalidation duration/overlap, Redis adapter effective delivery, reconnect/drop gap i private metadata emit. Logovi connection ID-a ne uključuju user ID, što je privatnosno konzervativno, ali incident korelacija mora koristiti siguran hashed/trace identifikator.

## 10. Testovi i E2E dokaz

Pokrenuto:

```bash
cd backend
npm test -- --runInBand --runTestsByPath $(find src/modules/websocket -name '*.spec.ts' -print | sort)
```

Rezultat: **16 suiteova ukupno; 10 prošlo, 6 compile-blocked; 44/44 izvršena testa prošla**. Blokada je nepotpun generated Prisma client: nedostaje `generated/prisma/enums` i `groupMember`/`userRole` delegati. Prošli testovi pokrivaju auth parsing/cookie origin, room helper/revalidation, local limiter, Redis adapter helper, emit counter i dio broadcast logike.

E2E 15 posmatra routing admin frame, ali ne pravi negativnog primaoca niti revocation. E2E 04 primarno provjerava integration job i ticket stranicu, ne socket delivery. Nema handshake logout/revoke/expiry testa, ticket access revoke dok je soba otvorena, group/admin immediate revoke, legacy foreign-group disclosure, cross-instance Redis delivery/failure, reconnect replay ni multi-socket rate testa.

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
| BA-websocket-01 | P1     | Aktivni socket ignoriše logout/revoke/expiry/password/authz-version promjene               | otvoreno |
| BA-websocket-02 | P1     | Ticket staff/public/base sobe se nakon joina nikad ne reautorizuju                         | otvoreno |
| BA-websocket-03 | P1     | Group/admin revocation kasni 5 min i DB kvar ostavlja stare sobe fail-open                 | otvoreno |
| BA-websocket-04 | P1     | Default-on legacy group emit šalje puni payload bez per-ticket authorizationa              | otvoreno |
| BA-websocket-05 | P2     | Runtime Redis adapter kvar nema pouzdan fallback/effective-health i gubi cross-instance emit| otvoreno |
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

Principal nakon verifikacije sadrži samo subject ID. Revocation store, registry, expiry i authzVersion se više ne konsultuju. Uvesti socket credential lease sa expiryjem, session ID/authzVersionom, revocation pub/sub koji odmah disconnectuje odgovarajuće sockete i periodični fail-closed recheck kao safety net. Test mora zadržati otvoren socket, izvršiti logout/revoke/password change/deactivate i dokazati disconnect + izostanak novih događaja.

### BA-websocket-02 — stale ticket access

`ticket:*`, `:staff` i `:public` izričito su izuzeti iz revalidationa. Otvoren socket zato nadživi access promjenu i prima message/update/presence/Edge. Uvesti access epoch/subscription registry i leave/disconnect na ticket visibility promjenu; kao fallback periodično batch reautorizovati aktivne ticket subscriptione. Visibility upgrade/downgrade mora atomarno zamijeniti sobu.

### BA-websocket-03 — group/admin fail-open revoke

Petominutni polling ostavlja poznat disclosure prozor, a catch ostavlja sobu bez lease expiryja. Membership/RBAC mutation treba objaviti revocation event svim instancama; soba mora imati kratki authorization lease. Ako autoritativna obnova više puta pada, leave managed room ili disconnect, uz health alarm.

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

Session/authz lease + revocation pub/sub/disconnect; ticket subscription registry i access invalidation; event-driven group/admin revoke + fail-closed lease; legacy default off/uklanjanje.

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

Websocket modul ima dobru početnu handshake, ticket join, staff/public i Redis strukturu, ali authorization nije trajna osobina konekcije. Bez session i ticket revocationa, uz fail-open group polling i default-on puni group payload, realtime kanal može nastaviti otkrivati podatke nakon što ih HTTP sloj više ne dozvoljava. Iskren baseline je **4,88/10**.
