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
- **ACL, ne pad Redisa** (drugačiji slučaj, isti korijen): u logu
  `ws_adapter_redis_acl_denied channel=socket.io#/#*`, `ws_adapter_redis_command_denied
  command=psubscribe …` ili `ReplyError: NOPERM No permissions to access a channel`
  (`command: { name: 'psubscribe', args: ['socket.io#/#*'] }`). API ostaje živ —
  gateway od F4 dopune ne instalira Redis adapter kad ACL odbija kanal, nego radi s
  in-memory adapterom — ali tada **sobe ne važe preko instanci**: emit s jedne
  instance ne stiže klijentima na drugoj. Popravi ACL i restartuj API.
  - **Pravilo poklapanja (ovdje se ljudi najčešće prevare):** `PUBLISH`/`SUBSCRIBE` se
    poklapaju s globom, a **`PSUBSCRIBE` traži literalno poklapanje** — `&socket.io#*`
    **ne** dozvoljava `PSUBSCRIBE socket.io#/#*`. U ACL-u mora stajati i
    `&socket.io#/#*` (adapter), uz `&socket.io-request#*`/`&socket.io-response#*`
    (request/response kanali) i `&tickets:realtime-bridge` (F4 most).
  - Kanali se **ne** prefiksiraju `REDIS_KEY_PREFIX`-om, pa `&ephelpdesk:*` ovdje ne
    pomaže: adapter je `socket.io…`, bez prefiksa.

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
riječ o mreži/LB-u između API-ja i Redisa.

```bash
redis-cli -a "$REDIS_PASSWORD" ACL GETUSER "$REDIS_USERNAME" | grep -A1 channels
#   očekivano: &ephelpdesk:* &bull:ephelpdesk:* &integration-queue:*
#              &tickets:realtime-bridge &socket.io#* &socket.io-request#*
#              &socket.io-response:*
redis-cli --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" --no-auth-warning \
  psubscribe 'socket.io#/#*'          # NOPERM = ACL, ne mreža; odmah Ctrl-C
redis-cli --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" --no-auth-warning \
  subscribe 'socket.io-request#/#'    # glob poklapanje; prazno = čeka poruke
```

> **Napomena (zatvoreno u F4 dopuni):** prije dopune je odbijen `psubscribe` obarao
> API proces (unhandled rejection iz adaptera). Sada `WebsocketGateway.onModuleInit`
> provjerava kanale prije instalacije adaptera (`checkRealtimeAdapterSubscriptions`),
> a komande adaptera su umotane (`attachRealtimeCommandGuards`), pa ACL greška daje
> `fallback=in_memory reason=acl_denied` i API ostaje gore. Cijena: bez cross-instance
> emit-a — dakle popravi ACL, ali nema više ispada.

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
