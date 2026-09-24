# Runbook: Redis je pao (ili je odsječen)

Faza 4.2, plan §4.2. Sistem je projektovan da **ostane živ** bez Redisa: svaka
putanja ima fail-open granu, a ono što ne radi je jasno vidljivo u logu. Ovaj
runbook služi da se to ne miješa s „aplikacija je pala".

## Simptom

- API odgovara, ali: keševi promašuju (P95 raste), worker heartbeat je „stale" na
  admin kartici reda, DLQ/retention se ne čiste, periodični poslovi (arhiva,
  waiting-for-user, KB podsjetnici) se ne izvršavaju.
- U logu: `ws adapter: fallback=in_memory`, `*_schedule_failed`, `authz_*_invalidation_skipped`,
  `Failed to write worker heartbeat`.
- **ACL, ne pad Redisa** (drugačiji slučaj, isti korijen): API se uopšte ne digne, u
  logu `ReplyError: NOPERM No permissions to access a channel` s
  `command: { name: 'psubscribe', args: ['socket.io#/#*'] }`. ACL useru `ephelpdesk`
  nedostaje kanal — vidi `ops/redis-acl.line` (Socket.IO traži `socket.io#*`,
  `socket.io-request#*`, `socket.io-response#*`; F4 most `tickets:realtime-bridge`).
  Kanal se **ne** prefiksira `REDIS_KEY_PREFIX`-om, pa `&ephelpdesk:*` ovdje ne pomaže.

## Šta se dešava po komponenti (fail-open grane)

| Komponenta | Bez Redisa | Posljedica |
|---|---|---|
| WS adapter (F3.1) | `fallback=in_memory` | emit-ovi rade samo unutar instance; grupa/user sobe na drugoj instanci ne dobijaju ništa |
| Authz keš (F2.2) | čitanje iz baze | tačno, ali +1 upit po zahtjevu (P95 raste) |
| Dashboard/SLA summary keš (F2.4) | ponovni izračun | tačno, skuplje |
| Unread count keš (F2.3) | `count(*)` po zahtjevu | tačno, skuplje |
| BullMQ rasporedi (F2.1, F2.3, F4.1) | registracija padne uz `*_schedule_failed` | **poslovi se ne pokreću dok se Redis ne vrati** |
| Worker heartbeat | ne piše se | status „stale" (ne „down") |

## Dijagnostika

```bash
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping          # PONG ili timeout
redis-cli -h "$REDIS_HOST" --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" ping
grep -E 'schedule_failed|fallback=in_memory|heartbeat' api.log worker.log | tail -30
redis-cli --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" info clients
redis-cli llen 'bull:ephelpdesk:integration-jobs:wait'    # da li red stoji
```
Provjeri i ACL (`ops/redis-acl.line`), `REDIS_KEY_PREFIX`/`QUEUE_PREFIX` i da nije
rijеč o mreži/LB-u između API-ja i Redisa.

```bash
redis-cli -a "$REDIS_PASSWORD" ACL GETUSER "$REDIS_USERNAME" | grep -A1 channels
#   očekivano: &ephelpdesk:* &bull:ephelpdesk:* &integration-queue:*
#              &tickets:realtime-bridge &socket.io#* &socket.io-request#*
#              &socket.io-response:*
redis-cli --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" --no-auth-warning \
  psubscribe 'socket.io#/#*'          # NOPERM = ACL, ne mreža; odmah Ctrl-C
```

> **Napomena (dok se ne zatvori fail-open praznina):** odbijen `psubscribe` obara API
> proces (unhandled rejection iz adaptera), a ne prelazi u `fallback=in_memory` kao
> ostale Redis putanje. Zato je ACL greška **dostupnost**, ne degradacija: popravi ACL
> i restartuj API.

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

- `redis-cli ping` → `PONG`, `ws_adapter_redis_ok=1`,
- u logu nema novih `*_schedule_failed` i vidi se prvi uspješan `job=… job_processed=…`,
- keš-evi pune (P95 se vraća na baseline unutar 2 minuta),
- `git status` „nije izgubljeno ništa": svi poslovi su due-based, pa prvi ciklus nakon
  povratka nadoknađuje propušteno (npr. arhiva uzima sve što je `closedAt <= cutoff`).
