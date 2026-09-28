# Operativni alarmi — runbook (Paket 2.7)

Svaki alarm u e-mailu, Teams poruci i kartici **Admin → Zdravlje sistema** ima link na
sidro u ovom dokumentu. Worker provjerava stanje jednom u minuti (red `ops-health`).
Da ne bi bilo lažnih uzbuna, alarm se otvara tek nakon N uzastopnih pozitivnih provjera,
a zatvara nakon M uzastopnih negativnih provjera (kolona „otvara / zatvara“).

Opšti postupak:

1. **Preuzmi** alarm u kartici Zdravlje sistema. Podsjetnici tada prestaju, a ostali znaju da neko radi na tome.
2. Riješi uzrok po odjeljku ispod.
3. Alarm se zatvara sam kad provjera prođe. Svi primaoci dobiju poruku „riješeno nakon X min“.
4. Kod planiranih radova koristi **Utišaj** (15 min do 8 h, uz razlog). Provjere i historija
   rade i dalje, samo se ne šalju poruke.

Primaoci: korisnici s permisijom `ops.alerts.receive` (zadano ADMIN i SUPER_ADMIN) i adrese iz
`private.ops.alerts.extraRecipientsCsv`. Teams dobija poruku ako je postavljen `private.ops.alerts.teamsWebhookUrl`.
Podsjetnik se šalje svakih `private.ops.alerts.reminderHours` (zadano 4 h) dok alarm nije preuzet.

Korisne komande na serveru (Coolify, SSH):

```bash
BACKEND=$(docker ps --format '{{.Names}}' | grep '^backend-' | head -1)
WORKER=$(docker ps --format '{{.Names}}' | grep '^worker-' | head -1)
docker exec "$WORKER" node dist/src/cli/worker-health.js; echo "exit=$?"
docker logs --since 15m "$WORKER" 2>&1 | grep -E 'ops_|ERROR' | tail -50
```

| Ključ | Težina | Otvara / zatvara | Sidro |
| --- | --- | --- | --- |
| `worker.down` | KRITIČNO | 1 / 2 | [worker-down](#worker-down) |
| `sla.scan.late` | KRITIČNO | 1 / 2 | [sla-scan-late](#sla-scan-late) |
| `scheduler.late` | UPOZORENJE | 2 / 2 | [scheduler-late](#scheduler-late) |
| `disk.usage` | UPOZORENJE / KRITIČNO | 2 / 2 | [disk-usage](#disk-usage) |
| `clamav.unavailable` | UPOZORENJE (fail-open) / KRITIČNO | prag / 2 | [clamav-unavailable](#clamav-unavailable) |
| `queue.dlq` | UPOZORENJE | 1 / 1 | [queue-dlq](#queue-dlq) |
| `http.5xx` | UPOZORENJE / KRITIČNO | 2 / 2 | [http-5xx](#http-5xx) |
| `database.unavailable` | KRITIČNO | 2 / 1 | [database-unavailable](#database-unavailable) |
| `redis.unavailable` | KRITIČNO | 2 / 1 | [redis-unavailable](#redis-unavailable) |
| `api.eventloop.lag` | UPOZORENJE / KRITIČNO | 2 / 2 | [api-eventloop-lag](#api-eventloop-lag) |
| `tls.ldapsCa.expiry` | UPOZORENJE / KRITIČNO | 1 / 1 | [ldaps-ca-expiry](#ldaps-ca-expiry) |
| `ops.monitor.stale` | KRITIČNO | 3 / 1 | [ops-monitor-stale](#ops-monitor-stale) |

---

## worker-down

**Uslov:** heartbeat workera u Redisu (`integration-queue:worker-heartbeat`, osvježava se svakih 10 s)
stariji je od `private.ops.thresholds.workerHeartbeatStaleSeconds` (zadano 120 s).
Pošto worker tada ne može sam javiti da ne radi, ovaj alarm otvara **watchdog u backendu (API)**.

**Posljedica:** SLA provjere, e-mail (ulaz i izlaz), zakazani izvještaji i retencija stoje.

**Postupak:**
1. `docker ps -a | grep worker-` provjeri status (restarting, exited, unhealthy).
2. `docker logs --tail 200 "$WORKER"` pokaže zadnju grešku (najčešće Redis ACL/lozinka, migracija, OOM).
3. Coolify → servis → **Restart**. Ako su mijenjane env varijable: **Redeploy**.
4. Nakon starta, `worker-health.js` treba vratiti `exit=0` u roku od 30 s.

## sla-scan-late

**Uslov:** zadnja uspješna SLA provjera (red `sla-scan`, svake minute) starija je od
`private.ops.thresholds.slaScanLateMinutes` (zadano 5 min), a worker je živ.

**Postupak:**
1. U kartici Zdravlje sistema → Redovi pogledaj `sla-scan`: `failed` ili zaglavljen `active`.
2. Logovi workera: `grep sla_scan`. Česti uzroci su spor upit (pg pool, vidi [pg-pool-saturation.md](pg-pool-saturation.md)) i greška u podacima.
3. Restart workera ponovo registruje ponavljajuće poslove.

## scheduler-late

**Uslov:** jedan ili više zakazanih poslova (digest, izvještaji, retencija, sinhronizacija s AD-om…)
nije završio u očekivanom prozoru. Lista je u detaljima alarma i u kartici.

**Postupak:** logovi workera za navedeni posao. Ako je posao ručno pauziran (npr. AD osigurač),
riješi uzrok u odgovarajućem panelu, a alarm se zatvara nakon sljedećeg uspješnog izvršenja.

## disk-usage

**Uslov:** zauzeće volumena s prilozima (`uploads`, `/usr/app/uploads`) ≥ `diskWarnPercent`
(zadano 80 %) daje upozorenje, a ≥ `diskCriticalPercent` (zadano 90 %) kritičan alarm.

**Postupak:**
1. `docker exec "$BACKEND" df -h /usr/app/uploads` i `du -sh /usr/app/uploads/*`.
2. Provjeri istekle izvoze (`privacy-exports`, brišu se sami nakon 7 dana) i stare backupove na istom disku.
3. Proširi volumen/disk hosta. Retencija priloga (Paket 2.6) oslobađa prostor samo ako je uključena.

## clamav-unavailable

**Uslov:** `private.ops.thresholds.clamavFailuresBeforeAlert` (zadano 3) uzastopnih neuspjelih
pingova prema clamd-u. Težina je UPOZORENJE ako je skeniranje u fail-open režimu
(prilozi prolaze neskenirani), inače KRITIČNO (prilozi se odbijaju).

**Postupak:** `docker logs --tail 100 $(docker ps --format '{{.Names}}' | grep '^clamav-' | head -1)`.
Nakon restarta clamav učitava bazu potpisa 1–3 min (healthcheck `start_period`). Ako nema
memorije (clamd traži oko 1,5 GB), povećaj limit.

## queue-dlq

**Uslov:** broj neuspjelih poslova (integracijski DLQ i `failed` u BullMQ redovima) porastao je
u odnosu na zadnju **potvrdu**. Stari neuspjesi ne drže alarm otvorenim.

**Postupak:**
1. Admin → Integracije: pregledaj grešku, **Ponovi** ili odbaci.
2. Kad je stanje poznato i prihvaćeno, klikni **Potvrdi DLQ** u kartici Zdravlje sistema. Nova osnovica je trenutni broj,
   pa se alarm zatvara i otvara ponovo tek na nove neuspjehe.

## http-5xx

**Uslov:** u zadnjih 5 minuta najmanje `http5xxMinCount` (zadano 20) odgovora 5xx **i**
najmanje `http5xxMinPercent` (zadano 2 %) svih zahtjeva. KRITIČNO kod dvostrukog broja i
petostrukog procenta.

**Postupak:** `docker logs --since 10m "$BACKEND" 2>&1 | grep -E '"statusCode":5|ERROR' | tail -50`.
Zahtjevi se mogu pratiti po `requestId`. Ako se greške poklapaju s deployem: rollback u Coolifyju.

## database-unavailable

**Uslov:** Postgres ne odgovara na dvije uzastopne provjere. Obavještenje ide preko
**rezervnog kanala** (`OPS_ALERT_SMTP_URL`/`OPS_ALERT_EMAIL_TO`/`OPS_ALERT_TEAMS_WEBHOOK_URL`),
jer redovni kanal čita primaoce iz baze. Stanje se bilježi u historiju kad baza proradi.

**Postupak:** status i logovi Postgres kontejnera; slobodan disk (`df -h`); broj konekcija
(vidi [pg-pool-saturation.md](pg-pool-saturation.md)). Oporavak: [../DR.md](../DR.md).

## redis-unavailable

**Uslov:** Redis ne odgovara na dvije uzastopne provjere. Obavještenje ide preko rezervnog kanala.

**Postupak:** [redis-down.md](redis-down.md). Ne mijenjati `maxmemory-policy` (volatile-lru).

## api-eventloop-lag

**Uslov:** prosječan event-loop lag API procesa > 500 ms (UPOZORENJE) ili > 2000 ms (KRITIČNO).

**Postupak:** `docker stats --no-stream` (CPU/memorija). U logovima backenda traži spore
zahtjeve (izvoz, izvještaji). Kratkotrajni vrhovi tokom velikog izvoza su očekivani.

## ldaps-ca-expiry

**Uslov:** najraniji certifikat u `AD_LDAPS_CA_CERT_BASE64` / `AD_LDAPS_CA_CERT_PATH` ističe za
≤ 30 dana (UPOZORENJE) ili ≤ 7 dana (KRITIČNO).

**Postupak:** od AD administratora pribavi novi CA (PEM). Može se staviti i bundle staro+novo tokom prelaza.
```bash
base64 -w0 novi-ca.pem   # vrijednost za AD_LDAPS_CA_CERT_BASE64
```
Coolify → varijabla → **Redeploy** (Restart ne primjenjuje nove varijable).

## ops-monitor-stale

**Uslov:** worker je živ, ali posljednji snapshot provjere zdravlja je stariji od 3 minute.
Alarm otvara watchdog u API-ju, jer se bez snapshota nijedan drugi alarm ne može otvoriti.

**Postupak:** red `ops-health` u kartici (failed/active), zatim logovi workera `grep ops_health`.
Restart workera ponovo registruje ponavljajući posao.

---

## Rezervni kanal i nadzor izvana

- Rezervni kanal (env, ne postavke) koristi se samo kad baza ili Redis nisu dostupni.
  Bez `OPS_ALERT_SMTP_URL` i Teams URL-a alarm se samo logira (`ops_fallback_*`).
- `OPS_UPTIME_PUSH_URL`: Uptime Kuma „Push“ monitor. Worker ga pinguje nakon svake završene
  provjere, pa izostanak pinga znači da je stao cijeli server ili worker. Postavka Kume: interval 60 s, retry 2.
- `OPS_WATCHDOG_DISABLED=true` gasi watchdog u API-ju. Koristi se samo za dijagnostiku.
