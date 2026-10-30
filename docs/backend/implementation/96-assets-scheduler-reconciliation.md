# W7.10 — assets scheduler reconciliation (`BA-assets-10`)

**Paket / nalaz:** W7.10 — `BA-assets-10` (P2), zatvoren<br>
**Commiti:** `b3599b3` (reconciliation) i `ccbceb1` (lifecycle Redis reconnect)<br>
**Finalni testani SHA:** `ccbceb1179b37fae2cce243c066deb3ed4fab489`<br>
**CI:** [`41020243134`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41020243134) — zelen<br>
**DB migracije:** nema; bez Prisma schema promjene, backfill-a ili DB koraka

## Nalaz i acceptance

`asset-directory-sync-hourly` i `asset-reminders-hourly` su repeatable BullMQ scheduleri. Gubitak njihovih Redis zapisa nakon restart/flush-a ili odbijena registracija pri startupu mogla je ostaviti directory sync ili reminders bez narednog ticka. Postojao je generički worker reconciler, ali greška pri inicijalnoj registraciji mogla je prekinuti Nest bootstrap prije aktiviranja periodičnog timera; sam missing scheduler nije bio prikazan u ops-health tabeli niti u alarmu.

W7.10 zatvara samo `BA-assets-10`: oba rasporeda se ponovo uspostavljaju nakon početne greške i Redis gubitka, readiness ostaje `degraded` dok reconciliation ne uspije, a ops-health prikazuje nedostajuću registraciju i provjerava starost posljednjeg uspješnog izvršavanja. Susjedni assets nalazi nisu dio ovog paketa.

## Implementacija

- Oba asset scheduler providera zadržavaju postojeće scheduler ID-eve, cron izraze, job nazive, attempts/backoff i cleanup opcije. Njihov `onModuleInit()` više ne ruši worker zbog prolazne Redis greške; samo upsert operacija ima zaseban throwing `reconcileSchedule()` hook za worker-wide reconciler.
- Asset registracija je ograničena timeoutom od 5 sekundi. Worker reconciler sada prvo armira retry timer, zatim radi eager pass, pokušava sve pronađene schedulere i ne prekida bootstrap na neuspjeh. Periodični pokušaj je svakih pet minuta. Greška zadržava worker lifecycle u stanju `degraded`; poslije uspješnog reconciliationa readiness se vraća na `ready` preko keepalive publish-a.
- Ops-health očekuje oba asset scheduler ID-a. Ako Redis ne vrati očekivani scheduler, collector dodaje eksplicitni red `registered=false` uz posljednji uspjeh/grešku queue-a; API i System health tabela prikazuju da registracija nedostaje. Za ova dva hourly cron posla alarmira se i kada posljednji uspjeh pređe **75 minuta** (jedan sat cadence + 15 minuta cron grace). Postojeći `scheduler.late` alert i njegova hysteresis politika se koriste; Redis/queue inspection timeout se tretira kao nepoznat, ne kao dokaz da scheduler nedostaje.
- Nije dodan Redis health-state ključ niti DB run-state. Stanje se izvodi iz stvarnog BullMQ rasporeda i zadnjih completed/failed poslova, pa Redis flush ne briše izvor očekivanih ID-eva koji se provjeravaju.

## Testni dokaz

- Unit testovi provjeravaju da startup ne blokira na odbijenoj ili zaglavljenoj registraciji, očuvanje directory/reminder schedule konfiguracije i automatski oporavak kroz worker retry timer nakon dvije uzastopne registracijske greške.
- Worker reconciler test provjerava da timer ostaje armiran nakon neuspjelog eager pass-a i da se schedule/readiness oporave na narednom periodičnom pokušaju.
- Real-Redis acceptance suite uklanja oba BullMQ scheduler zapisa u izolovanom prefixu, izvršava isti worker reconciler i potvrđuje povratak tačnih ID-eva, cron patterna i job naziva. Ne radi `FLUSHDB` nad dijeljenim CI Redisom.
- Ops-health testovi pokrivaju missing-vs-unknown razlikovanje, posljednji uspjeh za missing schedule, 75-minutni age gate, API polja, alert reason lokalizaciju i health card prikaz.
- Lokalno su prošli `git diff --check`, JavaScript syntax check integration runnera, JSON parse locale fajlova i Prettier provjera izmijenjenih frontend TypeScript fajlova. Lokalni backend runner test nije se mogao pokrenuti jer checkout nema `backend/node_modules` (nedostaje `pg` paket); puni CI je generisao Prisma client i izvršio backend suiteove.

CI [`41020243134`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41020243134) prošao je backend build/lint/Jest i PostgreSQL+Redis integration suiteove, frontend lint/format/test/build, docs guard, container/supply-chain i CI gate. Nije bilo neuspjelog CI pokušaja za W7.10. Push workflow je preskočio E2E critical flows i install wizard prema trigger uslovima; image vulnerability enforcement je `skipped` jer je actionable high/critical count bio nula.

## Migracija, rollout i rollback

Nema DB ili Prisma promjene, migracije, backfill-a, preflighta ni ručnog DB rollback koraka. Ranije uspješno primijenjene migracije se ne ponavljaju; ne pokretati `migrate`, `migrate resolve` niti DB rollback zbog W7.10.

**Rollout:** deploy worker i backend/frontend buildove koji nose ops-health ugovor. Nakon worker starta provjeriti `worker:lifecycle` (`ready`, ne `degraded`), da oba scheduler reda postoje u System health tabeli i da je `lastSuccessAt` svjež nakon narednog hourly ticka. Ako registracija ne uspije dok lifecycle Redis još prima upise, worker objavljuje `degraded` i reconciliation ponavlja najkasnije za pet minuta. Ako je Redis potpuno nedostupan, lifecycle publish je best-effort: proces i retry/keepalive timeri ostaju živi, a lifecycle stanje se ponovo objavi pri povratku Redis-a. Nije potrebna ručna registracija niti redeploy.

**Rollback:** nema schema rollbacka ni novog DB stanja. Prije vraćanja starog worker builda provjeriti da su oba repeatable scheduler zapisa prisutna i da postojeći scheduleri koriste iste ID-eve/pattern-e; rollback uklanja self-heal i missing-scheduler health signal, pa se kod daljeg Redis gubitka vraća raniji rizik redeploya. Ne brisati schedulere niti mijenjati prefix ručno.

## Registar nalaza

- Zatvoren je samo `BA-assets-10` (P2).
- `BA-assets-11`–`BA-assets-19` ostaju otvoreni i odvojeni; posebno durable extra reminder email (`BA-assets-11`) nije mijenjan.
- Deklarisani kontrolni zbir poslije W7.10: **579 otvorenih / 113 zatvorenih / 692 ukupno**. Machine-readable source redovi su **582 otvorena / 99 zatvorenih / 11 historijskih**; ranija razlika statusa od tri nalaza ostaje dokumentovana i nije rekoncilirana izvan scopea.
- Baseline ocjena `4,59/10` ostaje audit snapshot i nije retroaktivno preračunata.

## Sljedeći paket

**W7.11 — `BA-assets-11` (P2):** durable delivery i per-recipient dedupe/status za dodatne reminder e-mail adrese. Nije započet; zahtijeva zaseban acceptance scope i zeleni W7.10 CI prije rada.
