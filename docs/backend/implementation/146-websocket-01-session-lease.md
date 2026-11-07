# W6.31 — BA-websocket-01: socket-session lease (closeout)

**Datum:** 2026-11-07
**Finding:** `BA-websocket-01` (P1)
**Status:** zatvoren na finding nivou nakon acceptance-specifičnog generated-Prisma, Redis i stvarnog Socket.IO dokaza; ukupni CI gate nije zelen.
**Opseg:** spriječiti da autentifikovani WebSocket nadživi svoju sesiju ili aktuelni authz authority. Ovo zatvara samo `BA-websocket-01`, ne širu `BA-websocket-14` browser/E2E matricu.

## Implementacija i commitovi

Socket handshake traži verificiran lease: `subjectId`, `sessionId` (`sid`, nullable za legacy tokene), `jti`, `issuedAt` (`iat`), `expiresAt` (`exp`) i durable `authzVersion`. Socket principal je whitelistan na ta polja. Nakon uspješnog handshaka uklanjaju se token iz `handshake.auth`, session cookie iz `handshake.headers.cookie` i `authorization` header; sirovi bearer nije dio principal-a niti ostaje u tim handshake poljima.

`SessionRevocationStore` za tokene sa `sid` čita durable `UserSession` i povezani user authority u jednom DB readu; legacy token bez `sid` radi durable user-authority lookup umjesto oslanjanja na opcionalni cache. Neaktivan user, obavezna promjena lozinke, istek, revoked session/token, nedostupan authority/cache ili authz-version drift zatvara lease fail-closed. Socketi bez `jti` ili bez durable authority snapshot-a ne prolaze socket autentikaciju.

Revocation i authz invalidation objavljuju versioned Redis Pub/Sub signal na `servicedesk:auth:socket:invalidate`; user ID-evi se šalju u batchovima do 200. Publisher šalje samo kada je Redis `ready`, uz best-effort timeout od 500 ms, kako Redis čekanje ne bi zadržavalo logout ili mutaciju. Svaka API instanca koristi dedicated subscriber i prekida samo svoje odgovarajuće lokalne Socket.IO klijente. Periodični safety sweep počinje odmah i zatim se izvršava svakih 15 sekundi; authority check ima timeout 5 sekundi i concurrency cap 25. Nevažeći/istekao lease, revocation, stale authz ili neuspješan check znači disconnect.

- Runtime implementacija i početni testovi: [`47a34f1`](https://github.com/mudzy992/help-desk-enterprise/commit/47a34f13a86c9ad309d7c9bf8f2de7e676f780ba) — `fix(websocket): enforce socket session leases`.
- Stvarni Socket.IO klijent/transport integration test i test-only `socket.io-client@4.8.3` dependency: [`2a41915`](https://github.com/mudzy992/help-desk-enterprise/commit/2a4191552b1e4d14013e63caad3b8af8677df3a7) — `test(websocket): verify invalidation on live sockets`.

Repo ACL primjer `&servicedesk:*` u `ops/redis-acl.line` pokriva static kanal. Deployed Redis ACL i dozvole nisu nezavisno provjerene niti mijenjane.

## Acceptance i testni dokaz

- Lifecycle Jest regresija pokriva logout, session revoke, password revoke-all i deactivation invalidacije; nakon invalidacije socket test double više ne prihvata budući `deliver()`. Ovaj flow test je uključen u uspješni puni backend Jest run u CI.
- Redis integration spec pokreće **dva prava Socket.IO servera i dva `socket.io-client` klijenta**. Oba otvorena klijenta prime kontrolni event; `SessionRevocationStore.revokeSession()` objavi preko stvarnog Redis Pub/Sub; oba lokalna klijenta dobiju server disconnect; naknadno emitovani eventi ne stižu nijednom klijentu. Spec je registrovan u `backend/scripts/run-isolated-integration.mjs`; CI integration job postavlja `REDIS_HOST=127.0.0.1` i uspješno prolazi cijeli registered-suite runner.
- Lokalni live Socket.IO smoke, bez Redis-a, stvarno je otvorio klijentsku konekciju, isporučio event prije session invalidationa, pozvao produkcijski `disconnectInvalidatedSockets`, zatim potvrdio disconnect i da event poslije disconnecta nije primljen.
- Prije live transport follow-upa, targeted Jest na runtime SHA-u `47a34f1`: **11 suiteova / 78 testova passed**, uz 1 lokalni Redis integration test skipped. Nakon dodavanja klijenta lokalni integration spec ostaje skipped jer `REDIS_HOST` nije postavljen; nije prijavljen kao lokalni Redis pass.
- `node --test scripts/run-isolated-integration.test.mjs`: **16/16 passed**; targeted ESLint i `git diff --check`: **passed**.

Lokalni normalni ts-jest diagnostics run je blokiran nedostajućim generated Prisma Client delegateovima (`userSession`, `user`); diagnostics-off run nije type-check dokaz. CI je zasebno generisao Prisma Client, uspješno buildao backend i prošao lint/full Jest.

## CI, logovi i ukupni gate

Automatski CI [`42381576575`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42381576575) na SHA `2a4191552b1e4d14013e63caad3b8af8677df3a7`:

- **passed:** generated-Prisma backend build/lint/full Jest, PostgreSQL+Redis integration job (uključujući `Run real PostgreSQL integration suites` korak), frontend build/test i Docs guard;
- **skipped:** E2E critical flows, E2E install wizard i read-only service-form inventory;
- **failed:** backend container/supply-chain job i ukupni CI gate. Annotacije pokazuju `zlib@1.3.2-r1: CVE-2026-4738 [Critical]` (fixed `1.4-r0`) i Sigstore transparency-log grešku `InternalError: error creating tlog entry - (500) unexpected result from transparency log`.

Raw per-job log preuzimanje za integration job vratilo je `EOF`; zato zasebni per-spec stdout/test-count nije dostupan. Dokaz izvršenja je uspješan integration job/runner korak, konkretna spec registracija i CI okruženje sa `REDIS_HOST`; ne tvrdimo nezavisno izdvojen test-count. Ukupni CI **nije zelen** zbog supply-chain gateova.

Za SHA `2a41915` nije pokrenut novi Perf smoke. Posljednji Perf [`42379825934`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42379825934), na ranijem runtime SHA-u `47a34f1`, **failed** na query-budget gateu: `avg=2.124` prema `2.1`, `requests=50707`, `p95=3`, `max=34`. Nema dokaza da taj globalni rezultat uzrokuje BA-01 i threshold nije mijenjan.

## Status i granice

`BA-websocket-01` je zatvoren u izvornoj audit tabeli, generated planu i globalnom registru. `BA-websocket-02`, `BA-websocket-03` i širi `BA-websocket-14` ostaju otvoreni i nisu mijenjani; puni browser/E2E acceptance nije izvršen. Globalni BA-15 full critical-flow acceptance ostaje pending. Baseline websocket ocjena **4,88/10** nije rescoraan. Source audit/plan sada prikazuju 526 otvorenih / 166 zatvorenih; globalni registar 536/156. Deset poznatih statusnih divergencija ostaje netaknuto.

Nije korištena target baza, mijenjana migracija, ručno dispatchan full CI/E2E/Perf, otvoren PR, urađen merge ili deployment.