# W6.51 — BA-websocket-08: await room readiness

**Audit nalaz:** `BA-websocket-08` (P2), [audit 18 §12 — registar](../audits/18-websocket.md#12-registar-nalaza), [§14 — acceptance](../audits/18-websocket.md#14-ostali-nalazi-i-korekcije) i [§26 — status](../audits/18-websocket.md#26-w6-51-implementation-status-ba-websocket-08-2026-10-29)
**Scope:** samo obavezni user/group room setup pri povezivanju i mjerljivost njegovih grešaka; bez replay/catch-up ugovora ili zatvaranja susjednih nalaza.
**Status:** implementacija je na aktivnoj grani; nalaz ostaje **otvoren** do CI potvrde.

## Implementacija

- `handleConnection` sada čeka `client.join(userRoom)` prije nego počne čitati group membership, zatim čeka serversku group/admin revalidaciju i sve njene room join operacije. `socket_connected` se loguje tek nakon pokušaja tog setupa i nosi `group_rooms_ready=0|1`.
- Ako user-room join Promise odbije, gateway zabilježi `ws_room_setup_failures_user`, napiše strukturisani warning i prekine socket fail-closed. Greška group/admin setupa prolazi kroz postojeću revalidation cleanup logiku, zabilježi `ws_room_setup_failures_group` i ne šalje se kao uspješno pripremljena group subscription.
- Room setup failure counters su process-local i loguju se svakih 30 sekundi pod `WebsocketMetrics`, tako da ih operativni log pipeline može agregirati. Nema nove Redis persistence šeme ni client `ready` eventa; reconnect replay/catch-up pripada zasebnom `BA-websocket-09` scopeu.

## Ciljani dokaz i granice

- Ciljani Jest je prošao: **3 suitea / 34 testa** uz `diagnostics:false` zbog nedostupnog generated Prisma Clienta. Testovi pokrivaju await user join-a, await group room join-a, post-setup connection log i failure counting/fail-closed ponašanje.
- Targeted ESLint je passed. Puni `tsc --noEmit` nije prošao: **3.790 dijagnostika** ukupno zbog nedostupnih generated Prisma artefakata; nema dijagnostika u BA-08 ciljanim putanjama.
- Docs guard, docs guard tests i `git diff --check` su provjereni nakon ažuriranja dokumentacije. Nema ručnog full CI/E2E ni deployment tvrdnje.
- Ne mijenja se schema, migration, admission limit, session/ticket revalidation, replay semantika ni drugi nalaz. `BA-websocket-08` ostaje **otvoren**; Val 6 brojke/statusi nisu promijenjeni.
