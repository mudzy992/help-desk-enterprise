# Runbook: Redis je pao (ili je odsječen)

Faza 4.2, plan §4.2. API i worker su projektovani da ostanu procesno živi bez
Redisa; to **ne** znači da je realtime cluster funkcionalan. WebSocket adapter
prijavljuje degradaciju u logu i readinessu, jer lokalni in-memory fallback ne
može zamijeniti cross-instance emit. Ovaj runbook razdvaja dependency kvar od
pada procesa.

## Simptom

- API odgovara, ali: keševi promašuju (P95 raste), worker heartbeat je „unknown" (Redis je pao)
  ili „stale" (worker ne piše) na admin kartici reda, DLQ/retention se ne čiste, periodični poslovi (arhiva,
  waiting-for-user, KB podsjetnici) se ne izvršavaju.
- U logu: `ws_adapter_redis_ok=0 ws_adapter_redis_state=degraded`,
  `ws_adapter_redis_command_denied/failed`, `ws_adapter_redis_error`,
  `*_schedule_failed`, `authz_*_invalidation_skipped` ili `Failed to write worker heartbeat`.
  `GET /health/ready` vraća 503 uz `checks.websocketAdapter: "fail"`.
- **ACL, ne pad Redisa**: traži `ws_adapter_redis_acl_denied channel=socket.io#/#*`,
  `ws_adapter_redis_command_denied command=psubscribe …` ili `NOPERM`. Kod boot-time
  deny-ja gateway ne instalira Redis adapter i koristi samo lokalni in-memory; readiness
  ostaje 503 i cross-instance emit se ne smatra ispravnim. Popravi ACL pa uradi rolling
  restart instanci koje su već u boot fallbacku.
  - **Pravilo poklapanja (ovdje se ljudi najčešće prevare):** `PUBLISH`/`SUBSCRIBE` se
    poklapaju s globom, a **`PSUBSCRIBE` traži literalno poklapanje** — `&socket.io#*`
    **ne** dozvoljava `PSUBSCRIBE socket.io#/#*`. U ACL-u mora stajati i
    `&socket.io#/#*` (adapter), uz `&socket.io-request#*`/`&socket.io-response#*`
    (request/response kanali) i `&tickets:realtime-bridge` (F4 most).
  - Kanali se **ne** prefiksiraju `REDIS_KEY_PREFIX`-om, pa `&servicedesk:*` ovdje ne
    pomaže: adapter je `socket.io…`, bez prefiksa.

## Šta se dešava po komponenti (fail-open grane)

| Komponenta | Bez Redisa | Posljedica |
|---|---|---|
| WS adapter (BA-05) | Ako je Redis adapter već instaliran, ostaje aktivan i ioredis reconnectuje; runtime ne prebacuje sobe u in-memory. Boot-time ACL deny/missing config može pokrenuti lokalni fallback. | Efektivno stanje je `degraded`, `checks.websocketAdapter=fail` i readiness vraća 503; cross-instance emit može biti izgubljen dok Redis nije zdrav. Boot fallback traži rolling restart nakon ACL popravke. |
| Authz keš (F2.2) | čitanje iz baze | tačno, ali +1 upit po zahtjevu (P95 raste) |
| Dashboard/SLA summary keš (F2.4) | ponovni izračun | tačno, skuplje |
| Unread count keš (F2.3) | `count(*)` po zahtjevu | tačno, skuplje |
| BullMQ rasporedi (F2.1, F2.3, F4.1) | registracija padne uz `*_schedule_failed` | **poslovi se ne pokreću dok se Redis ne vrati** |
| Worker heartbeat | ne piše se, a ne može se ni pročitati | kartica prikazuje workera kao **„unknown"** (ne „stale"); ukupno stanje je „down" zbog Redis komponente. Alarm `worker.down` se **ne** otvara: watchdog kanarincem ne može potvrditi da Redis vraća upisano, pa izostanak ključa nije dokaz ([ALERTS.md#worker-down](ALERTS.md#worker-down)) |

## Dijagnostika

```bash
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping          # PONG ili timeout
redis-cli -h "$REDIS_HOST" --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" ping
grep -E 'ws_adapter_redis_(ok|state|command_|error|probe)|schedule_failed|fallback=in_memory|heartbeat' api.log worker.log | tail -40
curl -sS -i https://<api>/health/ready
redis-cli --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" info clients
redis-cli llen 'bull:servicedesk:integration-jobs:wait'    # da li red stoji
```
Provjeri i ACL (`ops/redis-acl.line`), `REDIS_KEY_PREFIX`/`QUEUE_PREFIX` i da nije
riječ o mreži/LB-u između API-ja i Redisa.

```bash
redis-cli -a "$REDIS_PASSWORD" ACL GETUSER "$REDIS_USERNAME" | grep -A1 channels
#   očekivano: &servicedesk:* &bull:servicedesk:* &integration-queue:*
#              &tickets:realtime-bridge &socket.io#* &socket.io#/#*
#              &socket.io-request#* &socket.io-response#*
redis-cli --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" --no-auth-warning \
  psubscribe 'socket.io#/#*'          # NOPERM = ACL, ne mreža; odmah Ctrl-C
redis-cli --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" --no-auth-warning \
  subscribe 'socket.io-request#/#'    # glob poklapanje; prazno = čeka poruke
```

> Boot ACL probe i command guards ostaju crash protection, ali nisu green signal.
> Nakon instalacije, `ws-redis-adapter.ts` provjerava stvarni `PSUBSCRIBE`/`SUBSCRIBE`
> na adapter subscriberu i `PUBLISH` round-trip na random nejoinovanu sobu. Svaki command
> reject/connection error postavlja readiness na fail; probe se ponavlja svakih 15 s i
> tek uspješan round-trip vraća `ws_adapter_redis_ok=1`. Runtime adapter se ne prebacuje
> na in-memory, jer bi to napravilo lokalne room-univerzume. Uptime Kuma/Coolify mora
> alarmirati na readiness 503; tokom incidenta postojeći realtime eventi nisu durable i
> klijent se može morati osvježiti preko REST-a.

## Ublažavanje

1. **Ne restartuj API** — on radi; restart ti ne pomaže, a obara WS sesije.
2. Vrati Redis (failover na repliku, podigni instancu, otvori mrežu).
3. **Restartuj worker** nakon što Redis vrati: rasporedi su idempotentni po
   `scheduler id` (`upsertJobScheduler` u worker boot-u), pa restart samo ponovo
   registruje iste rasporede — nema duplih izvršenja.
4. Pusti keševe da se sami napune (authz TTL 60 s, summary 15 s). Ako je potrebno
   ranije: restart nije potreban, prvi zahtjev puni keš.
5. Ako Redis ne može brzo da se vrati, **ne pokreći poslove ručno po instancama** —
   dupli trigger je bezopasan samo za idempotentne poslove (svi su, dokazano u
   `perf/results/after-f4-*.md`), ali raspored ostaje jedan izvor istine.

## Izlazak iz incidenta

- `redis-cli ping` → `PONG`, svaka instanca bilježi `ws_adapter_redis_ok=1 ws_adapter_redis_state=healthy`, a `GET /health/ready` vraća 200 sa `checks.websocketAdapter: "ok"`,
- u logu nema novih `*_schedule_failed` i vidi se prvi uspješan `job=… job_processed=…`,
- keš-evi pune (P95 se vraća na baseline unutar 2 minuta),
- `git status` „nije izgubljeno ništa": svi poslovi su due-based, pa prvi ciklus nakon
  povratka nadoknađuje propušteno (npr. arhiva uzima sve što je `closedAt <= cutoff`).
