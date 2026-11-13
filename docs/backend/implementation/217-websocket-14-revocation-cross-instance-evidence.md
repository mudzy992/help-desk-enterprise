# Paket 217 — BA-websocket-14: revocation/cross-instance dokazna matrica

**Status:** zatvoreno owner-directed; raniji tekst je historija, a preostale granice i dokaz u [paketu 226](226-val6-owner-directed-closeout.md).
**Nalaz:** audit 18 §3.14 (P3) — kritična revocation/cross-instance matrica nema lokalni ni E2E dokaz: handshake logout/revoke/expiry, ticket access revoke s otvorenom sobom, group/admin immediate revoke, legacy foreign-group disclosure, live cross-instance Redis delivery/failure, reconnect replay, multi-socket rate.

## Matrica dokaza

| Scenario | Test | Sloj |
| --- | --- | --- |
| Logout / session revoke / password revoke-all / deaktivacija | `socket-session-lifecycle.spec.ts`: „disconnects an open socket on logout, session revoke, password revoke-all and deactivation" | unit (stvarni gateway) |
| JWT expiry + fail-closed provjera sesije | `socket-session-revalidation.spec.ts`: expiry disconnect, greška provjere → disconnect, malformed lease → disconnect | unit |
| Ticket access revoke s otvorenom sobom | `ticket-chat.gateway.socket.spec.ts`: „stops real clients receiving staff, public, presence and Edge events after access is removed" | stvarni Socket.IO |
| Group/admin immediate revoke | `socket-room-revalidation.spec.ts`: revoked sobe iz jednog snapshota, DB greška → fail-closed uklanjanje soba, timeout → fail-closed | unit |
| Cross-instance revocation | `socket-session-invalidation.integration.spec.ts`: dva servera, revokacija disconnecta klijente na obje instance i blokira kasnije događaje; group/admin revoke preko instanci | Redis integration |
| Legacy foreign-group disclosure | `broadcast-ticket-realtime.spec.ts`: legacy payload u group sobu samo uz eksplicitni compatibility opt-in (BA-websocket-04, default off) | unit |
| **Live cross-instance Redis delivery (novo; čeka CI dokaz)** | `ws-redis-adapter.integration.spec.ts`: dva Socket.IO servera dijele sobu samo kroz pravi `@socket.io/redis-adapter`; emit s instance B stiže klijentu na instanci A. Registrovan u isolated integration runneru; bez `REDIS_HOST` se preskače. | Redis integration |
| Reconnect catch-up | BA-websocket-09 REST snapshot catch-up + frontend `reconnect-catchup.spec.ts` | unit |
| Multi-socket / join-leave rate | `join-leave-rate-limiter.spec.ts` (per-socket prozori), `websocket-abuse-limiter` unit + Redis integration (BA-websocket-06 distribuirani limiti) | unit + Redis integration |
| Browser nivo | E2E 04/15 (realtime notifikacije, routing admin frame) u dnevnom schedule CI-ju | Playwright |

## Dokaz

- Lokalno (stub harness): adapter unit suite **16/16**; novi integration suite se bez Redisa preskače po dizajnu. Runner harness **20/20**.
- Dnevni schedule CI [`43178874566`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43178874566) u cijelosti zelen (E2E + integration). CI integration job je autoritativan za novi adapter dokaz.
- Jedina promjena koda je novi integration test; produkcijski kod se ne mijenja, bez migracije.

Napomena: sama isporuka kroz adapter ne dokazuje stvarni Redis outage/recovery ni kompletnu browser revocation matricu. Nalaz ostaje otvoren dok se ovi nedostaci ne pokriju.

## Dopuna: mrežni prekid Redis veze

`ws-redis-adapter-outage.integration.spec.ts` koristi dva stvarna Socket.IO servera i stvarni Redis. Izolovani TCP proxy prekida samo konekcije jedne instance: test provjerava isporuku prije prekida, `degraded` stanje tokom prekida, povratak u `healthy` nakon uspostave veze te novu cross-instance isporuku. Ne restartuje zajednički Redis niti dokazuje isporuku događaja emitovanih tokom prekida (sistem ne garantuje replay). Lokalno je test prošao sa zasebnim Redisom 7.2.7; registrovan je u CI integration runneru. Generated-Prisma CI i šira browser revocation matrica još čekaju, nalaz ostaje otvoren.
