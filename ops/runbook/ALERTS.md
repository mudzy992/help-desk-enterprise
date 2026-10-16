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
| `worker.down` | KRITIČNO | 2 / 2 | [worker-down](#worker-down) |
| `email.providerBlocked` | UPOZORENJE / KRITIČNO | 1 / 1 | [email-provider-blocked](#email-provider-blocked) |
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
| `websocket.emits.high` | UPOZORENJE / KRITIČNO | 2 / 2 | [websocket-emits-high](#websocket-emits-high) |
| `auth.login429.high` | UPOZORENJE / KRITIČNO | 2 / 2 | [login-429](#login-429) |
| `auth.captchaFailed.high` | UPOZORENJE / KRITIČNO | 2 / 2 | [captcha-failed](#captcha-failed) |
| `auth.captchaSkipped.high` | UPOZORENJE / KRITIČNO | 2 / 2 | [captcha-skipped](#captcha-skipped) |
| `security.auditWebhook.stalled` | UPOZORENJE / KRITIČNO | 2 / 2 | [audit-webhook-stalled](#audit-webhook-stalled) |

---

## worker-down

**Uslov:** heartbeat workera u Redisu (`integration-queue:worker-heartbeat`, osvježava se svakih 10 s,
TTL 1 h) stariji je od `private.ops.thresholds.workerHeartbeatStaleSeconds` (zadano 120 s).
Pošto worker tada ne može sam javiti da ne radi, ovaj alarm otvara **watchdog u backendu (API)**
(odvojena Redis konekcija, da dijeljeni Nest klijent ne daje lažni `null`).

**Posljedica:** SLA provjere, e-mail (ulaz i izlaz), zakazani izvještaji i retencija stoje.

**Detalji alarma:** `heartbeatAgeSeconds` = koliko je zapis star (pravi pad workera);
`heartbeatMissing: true` = ključa uopšte nema u Redisu (slučaj ispod).

**Kad ključa nema (`heartbeatMissing: true`):** izostanak ključa nije dokaz da worker ne radi —
isto izgleda i hladan start, evikcija ključeva i neuspjelo čitanje. Watchdog zato otvara alarm samo
ako je ispunjeno **sve** od:

1. Redis vraća ono što je watchdog upravo upisao (kanarinac `ops:watchdog:canary`, TTL 15 min);
2. API proces radi duže od 5 min (`workerAbsenceGraceMs` — hladan start, pull slike, rolling deploy);
3. worker nije nedavno upisao snapshot provjere zdravlja (`ops:snapshot`, prag 3 min) — svjež
   snapshot znači da je worker živ, a da je palo samo čitanje heartbeat-a.

Ako bilo šta od toga ne stoji, alarm se **ne otvara**, a backend logira zašto:
`ops_watchdog_heartbeat_missing redis_holds_keys=… past_grace=… snapshot_age_s=…`, odnosno
`ops_watchdog_redis_unreliable reason=canary_read_back_missed` kad kanarinac ne prođe.

> TTL heartbeat ključa (1 h) namjerno je **duži** od praga alarma (120 s): mrtav worker tada ostavlja
> *star* zapis, a ne prazan Redis. Ranije je TTL bio 90 s, pa je `worker.down` mogao da se otvori samo
> na izostanak ključa — a tako izgleda i svježa instalacija.

**Postupak (stvarni pad workera):**
1. `docker ps -a | grep worker-` provjeri status (restarting, exited, unhealthy).
2. `docker logs --tail 200 "$WORKER"` pokaže zadnju grešku (najčešće Redis ACL/lozinka, migracija, OOM).
3. Coolify → servis → **Restart**. Ako su mijenjane env varijable: **Redeploy**.
4. Nakon starta, `worker-health.js` treba vratiti `exit=0` u roku od 30 s.

**Provjera za 30 s (kad sumnjaš da je alarm lažan):**

```bash
docker exec "$WORKER" node dist/src/cli/worker-health.js; echo "exit=$?"  # exit=0 → worker je živ
docker logs --since 15m "$BACKEND" 2>&1 | grep ops_watchdog | tail -20    # zašto watchdog (ne) otvara
```

Evikciju ključeva **ne** rješavaj promjenom `maxmemory-policy` (ostaje `volatile-lru`, vidi
[redis-unavailable](#redis-unavailable)) — kanarinac je tu da je prepozna i da tada ne diže uzbunu.

**Hitno:** Coolify backend env `OPS_WATCHDOG_DISABLED=true` + restart (gasi watchdog provjere
`worker.down` i `ops.monitor.stale`, ostali alarmi rade i dalje). **Utišaj** na kartici zaustavlja
obavještenja samo ako API može pročitati `ops:silence`; ako i dalje stižu mailovi uz utišavanje,
redeploy backend s fixom silence fail-closed.

## email-provider-blocked

**Uslov:** SMTP provajder je odbio slanje zbog svoje kvote — najčešće Gmail
`550-5.4.5 Daily user sending limit exceeded` ili Office 365 throttling
(`421 4.7.0 … too many connections`). `MailProviderLimitBreaker` tada **zaustavi izlazni e-mail**
u cijelom procesu: dnevni limit 60 min (svako novo odbijanje duplira, do 6 h), throttling 5 min
(do 60 min). Alarm otvara watchdog u API-ju iz Redis ključa `mail:provider:block`;
zatvara se čim provajder prihvati prvu poruku.

**Težina:** UPOZORENJE dok čeka; **KRITIČNO** nakon 4 h bez prihvaćene poruke
(`mailProviderBlockCriticalAfterMinutes`) — tad je jasno da kvota nije samo dnevni šiljak.

**Detalji alarma:** `blockedMinutesLeft` = minuta do sljedećeg pokušaja, `suppressedTotal` = koliko
slanja je zaustavljeno od otvaranja (približno, broji se po procesu).

**Posljedica:** notifikacije, digesti i sedmični izvještaji **ne idu** dok blokada traje, ali se ne
gube: poslovi ostaju u redu i čekaju, a prijemnik koji stvarno ne postoji (`550 5.1.1`) odmah ide u
DLQ umjesto da troši pokušaje. Zato **nemoj** ručno gurati iste poruke — svaki pokušaj resetuje
brojač i produžava blokadu.

**Postupak:**
1. Provjeri šta je provajder rekao: `docker logs --since 1h "$WORKER" 2>&1 | grep -E 'mail_provider|EPROVIDERBLOCKED' | tail -30`.
2. Gmail: dnevni limit je po **SMTP nalogu** (Workspace ~2 000 primalaca/dan, `@gmail.com` ~500).
   Ako je instalacija veća od toga, potreban je drugi nalog ili pravi mail servis (SES/Postmark/SMTP
   provajdera) u `MAIL_*` postavkama.
3. Smanji ventilatore: broj primalaca po događaju (`ops/sql/measure-notification-fan-out.sql` pokazuje
   najveće), digest umjesto pojedinačnih mailova, isključi kanale koji nisu potrebni.
4. Kad kvota prođe (ili se pređe na drugi nalog), blok se čisti sam; ručno:
   `redis-cli --user "$REDIS_USERNAME" -a "$REDIS_PASSWORD" DEL servicedesk:mail:provider:block`
   (prefiks je `REDIS_KEY_PREFIX`). Sljedeće uspješno slanje zatvara i alarm.
5. Ako blokada traje duže od očekivanog, provjeri da li i **rezervni kanal** za alarme
   (`OPS_ALERT_SMTP_URL`) pokazuje na isti nalog — tada ni obavještenja o alarmima ne izlaze.

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

**Postupak:** [redis-down.md](redis-down.md). `maxmemory-policy` se **ne mijenja** (ostaje
`volatile-lru`): ključevi s TTL-om (heartbeat, snapshot, kanarinac) smiju biti izbačeni pod pritiskom
memorije. To nije razlog za `worker.down` — watchdog kanarincem provjerava da li Redis vraća upisano
i bez toga ne tretira izostanak ključa kao dokaz (vidi [worker-down](#worker-down)).

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

## websocket-emits-high

**Uslov:** Paket 5.2.3 (M11 B3): agregirani broj Socket.IO emit-ova po sobi po minuti
(klasterski, kroz sve API instance) premašuje `websocketEmitWarnPerMinute`
(zadano 600/min, UPOZORENJE) ili `websocketEmitCriticalPerMinute`
(zadano 3000/min, KRITIČNO). Alarm se otvara tek nakon dvije uzastopne minute
iznad praga i zatvara nakon dvije minute ispod, da se izbjegnu flurry-ji
prilikom deploya ili reconnecta klijenata. Najzagušenija soba i broj su
u detaljima alarma.

**Postupak:**
1. Provjeri da li je najzagušenija soba `group-legacy`. Ako jeste, to znači da je
   još uključen stari mod punog payloada (`WS_GROUP_FEED_LEGACY_FULL_EMIT=on`,
   default) koji šalje cijeli tiket svakom agentu u grupi umjesto laganog
   `group.feed-changed` eventa. Vidi [ws-rolling-deploy.md](../ws-rolling-deploy.md).
2. Ako nije `group-legacy`, u logovima backenda potraži `ws_emits_*` linije
   (kontekst `WebsocketMetrics`, period 30 s) — najfrekventniji ključ
   (`staff`, `group`, `public`, `user`, `broadcast`) ukazuje na izvor.
3. Provjeri da se neki broadcast ne poziva iz petlje (npr. bulk koji ne koristi
   `BulkBroadcastRateLimiter`, ili rekurzivni broadcast u `ticket-updated`
   handleru).
4. Pragovi se podešavaju kroz **Administracija → Postavke i dodaci →
   Opservabilnost i podrška** (polja `private.ops.thresholds.*`), ali
   povišenje bez razumijevanja uzroka skriva problem — Socket.IO paketi se
   šalju svakom povezanom klijentu u sobi, pa je stopa emit/s O(n·m) s
   brojem klijenata.

## login-429

**Uslov:** paket 5.4.0 (M2) + dopuna vala f: zbir metrike `login-429` za zadnjih **60
kompletnih minuta** (isti broj koji prikazuje kartica *Sigurnosne metrike (zadnji sat)*)
premašuje `login429WarnPerHour` (zadano **50/h**, UPOZORENJE) ili
`login429CriticalPerHour` (zadano **200/h**, KRITIČNO). Alarm se otvara nakon dvije
uzastopne provjere iznad praga i zatvara nakon dvije ispod. Broj, pragovi i prozor
pišu u detaljima alarma; ako Redis nije čitljiv, metrika je nepoznata i alarm se
**ne** otvara (to stanje pokriva `redis.unavailable`).

**Postupak:**
1. Pogledaj karticu *Administracija → Sigurnost → Sigurnosne metrike (zadnji sat)*:
   da li `login-429` raste u jednom vrhu (napad/pokvaren klijent) ili ravnomjerno
   (veliki NAT/proxy iza kojeg ljudi griješe lozinku).
2. Izvor je u odgovoru 429 (`Retry-After`, `details.retryAfterSeconds`) i u
   sigurnosnom dnevniku (`auth.login_failed` nosi **pseudonim**, nikad e-mail).
3. Ako je izvor NAT/proxy: povisi `ipMaxFailures` (do 500) ili `ipWindowSeconds`
   kroz **Ograničenja prijava**, uz razlog; ako je password spray: blokiraj izvor
   na mreži/firewallu i **ne** podiži prag.
4. Pragove alarma mijenjaš kroz **Administracija → Postavke i dodaci →
   Opservabilnost i podrška** (`private.ops.thresholds.login429WarnPerHour` /
   `…CriticalPerHour`);
   kalibracija limita (ne alarma) je u [`docs/ops/rate-limits.md`](../../docs/ops/rate-limits.md).

## captcha-failed

**Uslov:** paket 5.4.2 (stavka 2): zbir metrike `captcha-failed` za zadnjih **60
kompletnih minuta** (isti broj kao pločica *Odbijene CAPTCHA provjere* na kartici
*Sigurnosne metrike*) premašuje `captchaFailedWarnPerHour` (zadano **50/h**, UPOZORENJE)
ili `captchaFailedCriticalPerHour` (zadano **200/h**, KRITIČNO). Otvara se nakon dvije
uzastopne provjere iznad praga i zatvara nakon dvije ispod.

**Postupak:**
1. Pogledaj karticu *Sigurnosne metrike*: da li `captcha-failed` raste u jednom vrhu
   (automatizovani klijent) ili ravnomjerno (istekli widgeti nakon izmjene stranice).
2. Odbijeno rješenje znači da Cloudflare nije prihvatio token: istekao, već
   iskorišten ili pogrešan site key. Provjeri da se `private.security.captcha.siteKey`
   poklapa s ključem u Cloudflare kontrolnoj tabli. Tajni ključ se nikad ne prikazuje.
3. Ako raste bez stvarnih korisnika, to je automatizovani klijent: blokiraj izvor na
   mreži. **Ne snižavaj prag** da bi alarm nestao.
4. Pragove mijenjaš kroz **Administracija → Postavke i dodaci → Opservabilnost i podrška**
   (`private.ops.thresholds.captchaFailedWarnPerHour` / `…CriticalPerHour`).

## captcha-skipped

**Uslov:** paket 5.4.2 (stavka 2): zbir metrike `captcha-skipped` za zadnjih **60
kompletnih minuta** premašuje `captchaSkippedWarnPerHour` (zadano **50/h**, UPOZORENJE)
ili `captchaSkippedCriticalPerHour` (zadano **200/h**, KRITIČNO). Metrika se povećava
kad server ne dobije odgovor od Cloudflare Turnstile (timeout, mrežna greška ili ne-2xx),
pa se prijave propuštaju samo uz pragove limitera.

**Postupak:**
1. Provjeri izlazni pristup servera prema Cloudflare-u (siteverify). Mrežna pravila
   i proxy su najčešći uzrok.
2. Ako instalacija po dizajnu nema internet pristup, vrati
   `private.security.captcha.provider` na `none`. Isključivanje nudi listu zavisnih
   postavki (kao i druge postavke).
3. Dok je provjera preskočena, pojačano prati `auth.login429.high`: bez CAPTCHA-e
   ostaju samo pragovi limitera.
4. Pragove mijenjaš kroz **Administracija → Postavke i dodaci → Opservabilnost i podrška**
   (`private.ops.thresholds.captchaSkippedWarnPerHour` / `…CriticalPerHour`).

---

## audit-webhook-stalled

**Uslov:** paket 5.4.2 (stavka 4): izvoz sigurnosnog dnevnika na webhook ne isporučuje nijedan
događaj već **15 minuta** (UPOZORENJE) ili **60 minuta** (KRITIČNO), računajući od prvog neuspjeha
u nizu. Pragovi su fiksni. Alarm ne čita postavku „uključen“: kad se izvoz isključi, čekanje se
briše i alarm se zatvara.

**Postupak:**
1. Pročitaj zadnju grešku na pločici **Izvoz na webhook** (kartica *Sigurnosne metrike*, samo SUPER_ADMIN)
   ili u logu workera (`security_audit_webhook_failed code=<kod>`). Adresa i tajna se nikad ne loguju.
2. `HTTP_<status>`: prijemnik odgovara greškom. Provjeri da prijemnik radi i da verifikuje potpis
   (tajna mora biti ista na obje strane; tijelo se verifikuje kao sirov tekst).
3. `TIMEOUT` ili `NETWORK`: provjeri da je adresa dostupna **sa servera** (DNS, izlazni pristup, vatrozid).
   Rok za odgovor je 5 sekundi.
4. `INVALID_URL`: adresa nije ispravna. Ispravi postavku primaoca (samo `http` ili `https`, bez
   korisničkog imena i lozinke).
5. Događaji se ne gube dok je prekid kraći od **24 sata**. Nakon toga se čekajući događaji odbacuju
   (`droppedTotal` na pločici) i prijemnik ih ne dobija.
6. Alarm se zatvara sam kad se isporuka vrati (dvije uzastopne provjere). Prag ne mijenjaj: pragovi
   su fiksni i ne postoje u postavkama.

---

## ops-monitor-stale

**Uslov:** worker je živ, ali posljednji snapshot provjere zdravlja je stariji od 3 minute.
Alarm otvara watchdog u API-ju, jer se bez snapshota nijedan drugi alarm ne može otvoriti.
Kad snapshot ključa **nema** (`snapshotMissing: true` u detaljima), važe isti uslovi kao za
[worker-down](#worker-down): kanarinac, 5 min grejs perioda i dokaz da worker nije živ. Bez toga se
alarm ne otvara, jer izostanak ključa može biti i hladan start ili evikcija.

**Postupak:** red `ops-health` u kartici (failed/active), zatim logovi workera `grep ops_health`.
Restart workera ponovo registruje ponavljajući posao.

---

## Rezervni kanal i nadzor izvana

- Rezervni kanal (env, ne postavke) koristi se samo kad baza ili Redis nisu dostupni.
  Bez `OPS_ALERT_SMTP_URL` i Teams URL-a alarm se samo logira (`ops_fallback_*`).
- `OPS_UPTIME_PUSH_URL`: Uptime Kuma „Push“ monitor. Worker ga pinguje nakon svake završene
  provjere, pa izostanak pinga znači da je stao cijeli server ili worker. Worker pinguje svakih 60 s, a Kuma
  monitor ima interval 120 s (javlja nakon 2 propuštena pinga). Instalacija i ostali monitori:
  [`ops/monitoring/uptime-kuma.md`](../monitoring/uptime-kuma.md).
- `OPS_WATCHDOG_DISABLED=true` gasi watchdog u API-ju. Koristi se samo za dijagnostiku.
