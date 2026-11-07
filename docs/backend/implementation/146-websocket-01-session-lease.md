# W6.31 — BA-websocket-01: socket-session lease (CI evidence pending)

**Datum:** 2026-11-07
**Finding:** `BA-websocket-01` (P1)
**Opseg:** spriječiti da autentifikovani WebSocket nadživi svoju sesiju ili aktuelni authz authority; ovaj zapis je implementacijski checkpoint, ne formalno zatvaranje nalaza.

## Implementacija na Arena grani

Socket handshake sada traži verificiran lease: `subjectId`, `sessionId` (`sid`, nullable za legacy tokene), `jti`, `issuedAt` (`iat`), `expiresAt` (`exp`) i durable `authzVersion`. Socket principal je whitelistan na ta polja. Nakon uspješnog handshaka uklanjaju se token iz `handshake.auth`, session cookie iz `handshake.headers.cookie` i `authorization` header; sirovi bearer nije dio principal-a niti ostaje u tim handshake poljima.

`SessionRevocationStore` za tokene sa `sid` čita durable `UserSession` i povezani user authority u jednom DB readu; legacy token bez `sid` radi durable user-authority lookup umjesto oslanjanja na opcionalni cache. Neaktivan user, obavezna promjena lozinke, istek, revoked session/token, nedostupan authority/cache ili authz-version drift zatvara lease fail-closed. Socketi bez `jti` ili bez durable authority snapshot-a ne prolaze socket autentikaciju.

Revocation i authz invalidation objavljuju versioned Redis Pub/Sub signal na `servicedesk:auth:socket:invalidate`; user ID-evi se šalju u batchovima do 200. Publisher šalje samo kada je Redis `ready`, uz best-effort timeout od 500 ms, kako Redis čekanje ne bi zadržavalo logout ili mutaciju. Svaka API instanca koristi dedicated subscriber i prekida samo svoje odgovarajuće lokalne Socket.IO klijente. Periodični safety sweep počinje odmah i zatim se izvršava svakih 15 sekundi; authority check ima timeout 5 sekundi i concurrency cap 25. Nevažeći/istekao lease, revocation, stale authz ili neuspješan check znači disconnect.

Static kanal je pokriven repo ACL primjerom `&servicedesk:*` u `ops/redis-acl.line`; stvarni deployed Redis ACL i channel dozvole nisu nezavisno provjereni i konfiguracija nije mijenjana.

## Lokalni testni dokaz

- Targeted Jest s `--globals='{"ts-jest":{"diagnostics":false}}'`: **11 suiteova passed, 78 testova passed; 1 Redis integration suite / 1 test skipped**. Lifecycle acceptance spec provjerava otvoreni socket-double kroz logout, session revoke, password revoke-all i deactivation, uključujući odbacivanje budućeg `deliver()` poziva.
- Redis integration spec za dva API-instance subscriber-a koristi stvarni Redis Pub/Sub, ali Socket.IO server/socket su test doubleovi. Spec je registrovan u `backend/scripts/run-isolated-integration.mjs`; lokalno nije izvršen jer `REDIS_HOST` nije postavljen.
- `node --test scripts/run-isolated-integration.test.mjs`: **16/16 passed** — provjerena je registracija u runneru, ne stvarni Redis delivery.
- ESLint nad izmijenjenim backend fajlovima i integration skriptama: **passed**.
- `git diff --check`: **passed**.

`ts-jest` dijagnostika je isključena za ciljani run, zato taj rezultat nije TypeScript type-check. Pokušaji normalnog Jest diagnostics moda padaju prije izvršavanja pojedinih suiteova na nedostajućem generated Prisma Clientu (`PrismaService.user`, `groupMember`, `userRole`); lokalni `db:generate` ranije nije uspio preuzeti Prisma engine zbog TLS socket disconnecta. Nije potvrđen generated-Prisma build niti CI izvršenje Redis suitea.

## Status i preostali dokaz

`BA-websocket-01` ostaje `otvoreno` u audit tabeli, globalnom registru i generated planu dok CI ne potvrdi generated-Prisma build i stvarno Redis integration izvršenje. Lokalna Redis integration spec još nije izvršena; CI rezultat nije poznat na ovom checkpointu. Šira `BA-websocket-14` E2E/cross-instance matrica ostaje zaseban nalaz i nije zatvorena ovim paketom. `BA-websocket-02` i `BA-websocket-03` nisu mijenjani.

Ovaj zapis ne mijenja W6.30 brojeve niti poznate razlike između audit izvora, generated plana i globalnog registra. Perf nije pokrenut; posljednji poznati Perf [`42289613508`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42289613508) ostaje **failed** na globalnom query budgetu `2.128 > 2.1`, bez uzročnosti pripisane ovom paketu i bez izmjene praga. Nema target-DB upotrebe, migracije, PR-a, mergea ni deploymenta.
