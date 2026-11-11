# Runbook: WS reconnect storm (deploy/restart oluja)

Faza 4.2, plan §4.2. Simptom → dijagnostika → ublažavanje. Bez filozofije: svaki
korak je komanda ili log linija koju možeš pokrenuti odmah.

## Simptom

- Nakon deploya, restarta ili Redis bljeska: `ws_clients_count` pravi pilu (npr. 900 →
  200 → 900 u nekoliko sekundi), CPU na API instancama skoči, klijenti prijavljuju
  „Reconnecting…", a u logu se pojavljuje `ws_adapter_redis_state=degraded` ili
  boot-time `fallback=in_memory`. `/health/ready` za pogođenu instancu tada vraća 503.
- Ponekad uz to: duplirani realtime događaji (klijent je spojen na dvije instance) ili
  tišina u grupnoj sobi (emit s jedne instance, klijent na drugoj).

## Dijagnostika (po redu)

1. **Koliko klijenata i na kojoj instanci**
   ```bash
   grep ws_clients_count api.log | tail -20
   grep 'ws_emits_' api.log | tail -20      # staff / public / user / group
   ```
2. **Efektivno stanje adaptera** — `ws_adapter_redis_ok=1 ws_adapter_redis_state=healthy`
   znači da je runtime `PSUBSCRIBE`/`SUBSCRIBE` i room-channel Pub/Sub echo probe prošla;
   sama instalacija pri bootu ne važi kao healthy. `degraded` ili `fallback=in_memory`
   znači cross-instance emisija nije garantovana (vidi `redis-down.md`).
3. **Sticky sesije na LB-u** — bez njih reconnect oluja izgleda kao „klijent koji
   nikad ne ostane spojen". Provjeri afinitet (`ip_hash` / cookie sticky) i da drain
   timeout nije kraći od 30 s.
4. **Cross-instance dokaz**
   ```bash
   node ops/ws-cross-instance-check.mjs      # 2 instance + Redis adapter + emit s A
   ```
5. **Klijentski jitter** — reconnect mora imati jitter
   (`frontend/src/services/helpdesk-socket.ts`: `helpdeskSocketReconnect`,
   `createHelpdeskSocketOptions`). Ako je jitter isključen ručno, to je uzrok.

## Ublažavanje

1. **Rolling drain, jedna instanca po jedna** (procedura: `ops/ws-rolling-deploy.md`):
   `maxSurge 1`, `maxUnavailable 0`, drain ≥ 30 s. Nikad „sve odjednom".
2. **Drži ≥ 2 instance** — jedna instanca u restartu ne smije značiti prekid.
3. **Provjeri adapter pa Redis** — kod aktivnog adaptera runtime kvar zadržava Redis
   adapter i ioredis pokušava reconnect; ne pokreći ručni in-memory switch. Ako log kaže
   `fallback=in_memory` zbog boot-time ACL/config deny-ja, popravi ACL/config i uradi
   rolling restart tih instanci.
4. **Ne gasi jitter** i ne povećavaj agresivno `reconnectionAttempts`; oluja se rješava
   drainom, ne bržim reconnectom.
5. **Ako oluja traje i nakon drain-a**: provjeri da nije riječ o emit-petlji —
   `ws_emits_group` naglo raste dok `ws_emits_staff` miruje; tada je uzrok u
   fan-out putanji (notifikacije/tiket događaji), ne u mreži.

## Izlazak iz incidenta

- `ws_clients_count` se vrati na očekivani broj i ostane stabilan 10 minuta,
- `ws_adapter_redis_ok=1 ws_adapter_redis_state=healthy` na svakoj instanci i `/health/ready` 200,
- nema novih `fallback=in_memory` linija,
- grupna soba prima `group.feed-changed` (mali payload), a ne puni `ticket.updated`.
