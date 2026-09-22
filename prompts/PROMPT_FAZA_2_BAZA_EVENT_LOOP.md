# PROMPT ZA AGENTA — FAZA 2: Razdužiti bazu i event loop

> **Kako se koristi:** Otvori **novi** agent session. Zalijepi CIJELI ovaj dokument kao prvi prompt. Preduslov: Faze 0 i 1 završene (kapija F1 prošla, after-F1 izvještaj postoji).
> **Izvršni cilj faze:** svesti pozadinsko i per-request opterećenje baze na predvidljiv nivo: authz ≈ 0 upita po zahtjevu, SLA skener = batch posao u workeru, notifikacije = O(1) upisa, dashboard = SQL agregati. Detalji: `PERFORMANCE_PHASE_PLAN.md` FAZA 2.
> **Kapija na kraju:** k6 full: DB QPS < 800 uz pool 40; authz udio < 5%; SLA ciklus < 15 s @ 100k otvorenih (u workeru); notification writes/s < 100; P95 ključnih endpointa < 200 ms.

---

## 1. TVOJA ULOGA

Ti je **backend sustavski inženjer** (NestJS + Prisma + BullMQ + Redis). Ovo je najdelikatnija faza: diraš SLA obradu, autentifikacioni lanac i notifikacije. Greška ovdje mijenja POSLOVNO ponašanje — zato je svaka stavka praćena regresijskim testovima koji prvo "zaključavaju" postojeće ponašanje, pa tek onda mijenjaju mehaniku.

## 2. OBavezno PROČITAJ

1. `PERFORMANCE_PHASE_PLAN.md` — FAZA 2 (§2.1–§2.4) + §6.1 (zavisnosti) + §6.2 (rizici) + SLO tabela
2. `backend/src/modules/sla/` — cijeli modul (scanner, timers, sync, constants, escalation dispatch)
3. `backend/src/create-worker-application.ts`, `backend/src/start-worker.ts` + `integration-queue` (BullMQ obrazac koji VEĆ postoji — ponovi ga)
4. `backend/src/modules/authentication/` (guard, loader, tokens) i `backend/src/modules/authorization/` (service, context loader, evaluate)
5. `backend/src/modules/notifications/` + `fan-out/` cijeli folder + inbox spec fajlovi
6. `backend/src/common/redis/` (klijent, modul, tokens)
7. `backend/src/modules/reports/dashboard/` — postojeće agregatne mogućnosti (koristi ih!)
8. Postojeće `.spec.ts` u svakom modulu — obrazac testiranja s in-memory delegatima

## 3. VJEŠTINE

- Prisma batch obrasci i transakcije; SQL napredno (agregacije, covering indeksi, `CONCURRENTLY`)
- BullMQ: repeatable jobs, lock/idempotency semantika; razdvajanje API/worker konteksta (Nest application context)
- Redis keš dizajn: TTL, verzionisani ključevi, fail-open politika, invalidacija događajem
- Dizajn "po-red-po-korisniku → grupni zapis + pivot" migracije bez downtimea

## 4. ŽELJEZNA PRAVILA

1. **Sigurnosni redoslijed u SVAKOJ stavci:** (a) napiši/obnovi testove koji zaključavaju postojeće KORISNIČKO ponašanje → (b) implementiraj → (c) testovi moraju proći NEIZMIJENJENI, osim onih koji testiraju mehaniku koju namjerno mijenjaš (navedi ih eksplicitno u izvještaju).
2. **RBAC/visibility where-uslovi su svetinja** — ne refactorati, ne "pojednostavljivati", ne premještati semantiku. Kešira se REZULTAT, logika ostaje ista.
3. **Idempotentnost:** svaki worker posao mora biti siguran za ponovno izvršenje (upsert, optimistic where). Nikad "učitaj pa upisi slijepo".
4. **Fail-open:** Redis nedostupan ⇒ direktan DB read (sporije, funkcionalno). Nikad fail-closed authz.
5. **Migracije:** indeksi `CONCURRENTLY`; breaking šeme iza kompatibilnog sloja (vidi 2.3 — čitaj staro+novo dok klijent ne prijeđe).
6. **Ne diraj WS gateway dizajn soba** — to je Faza 3. Emit API ostaje isti; mijenjaš samo TKO se računa kao primatelj i KAKO se zapisuje.
7. Stil: mali funkcijski moduli, readonly tipovi, `.spec.ts` uz svaku logiku, in-memory delegati; bez `any`; bez novih packageova osim navedenih.
8. Redoslijed: **2.2 → 2.1 → 2.4 → 2.3** (keš infrastruktura prva jer je 2.3 koristi; 2.3 zadnja jer je najdublja).

## 5. STAVKE

### STAVKA 2.2 — Authz kontekst: jedan load + Redis keš (napor S) — PRVA

**ŠTA/PROBLEM/CILJ:** plan §2.2. Danas: guard učitava usera+role (`session-authentication.guard.ts:36`), pa authorization opet istog usera (`authorization-context.loader.ts:81,104`) + grupe + OU scope = 3–4 upita/zahtjev. Cilj: ≤ 0,05 upita/zahtjev prosječno (95%+ keš hit).

**ISPRAVKA:**
1. Uvedi `PrincipalContext` (user + roleKeys + groupIds + OU scope) — učitava se **jednom po requestu** (u session guardu) i prosljeđuje svim guardovima/interceptorima kroz request objekat; ukloni dupla učitavanja iz authorization context loadera
2. Loader funkcija `loadPrincipalContext(userId)` = postojeći upiti složeni u jednu funkciju (bez mijenjanja semantike)
3. Redis keš: ključ `authz:{userId}:v{version}`, TTL 60 s; `version` dolazi iz user record polja (ako ne postoji — dodaj integer kolonu `authz_version` kroz migraciju, default 0)
4. Invalidacija: hookovi na mutacijama role/grupa/OU članstva/deaktivacije → `authz_version++` (DB) + `DEL` ključa (Redis); deaktivacija usera = TRENUTNA (bez TTL čekanja)
5. Fail-open: Redis greška → direktan loader + log warn
6. Testovi: (a) 2 uzastopna zahtjeva = 1 DB load; (b) promjena role → sljedeći zahtjev uživa promjenu (čak i prije TTL-a, zbog DEL-a); (c) deaktivacija → 401 odmah; (d) Redis down → radi kroz DB

**PONAŠANJE:** authz DB QPS u jednocifrenim brojkama pri full load testu; sve sigurnosne provjere daju iste odgovore kao prije (regresijski specovi netaknuti).

### STAVKA 2.1 — SLA skener: batch + worker + lock (napor M)

**ŠTA/PROBLEM/CILJ:** plan §2.1. Danas (`scan-due-ticket-sla-states.ts:19,24`): findMany SVIH otvorenih + sekvencijalan N+1 po tiketu, u API procesu, na 60 s. Cilj: ciklus < 15 s @ 100k, u workeru, bez preklapanja.

**ISPRAVKA:**
1. Novi upit dosuđenih: `WHERE resolutionCompletedAt IS NULL AND nextDueAt <= now() ORDER BY nextDueAt LIMIT 2000` (provjeri tačnu kolonu due/ next breach u `prisma/schema/sla.prisma` — koristi postojeću, ne izmišljaj); kompozitni indeks `(resolutionCompletedAt, nextDueAt)` migracijom `CONCURRENTLY`
2. Batch load tiketa: `findMany({ id: { in } })` — nulti N+1
3. Per-ticket obrada (`syncTicketSlaTimers` + eskalacije) bez izmjene domenske matematike; samo joj se sada podnose već učitani tiketi (adapter funkcija — bez copy/paste dupliranja logike)
4. Premjesiti pokretanje iz `@Interval` (API modul) u **BullMQ repeatable job** (svaki min) u worker aplikaciji; API modul gubi scanner servis; BullMQ već jamči jedan aktivni posao (lock) — dokumentuj
5. Metrike: `sla_scan_duration_ms`, `sla_scan_processed` (log ili observability endpoint iz Faze 0)
6. Testovi: (a) seed-fixture: dosuđeni tiketi se obrađuju, nedosuđeni ne; (b) eskalacija/at-risk notifikacija ide tačno jednom (idempotentno ponavljanje ciklusa); (c) 100k seed u test bazi — ciklus < 15 s (označi kao integracijski, može `@slow` tag po postojećem jest obrascu ako postoji)

**PONAŠANJE:** Tiket probije SLA → označen ≤ 90 s; logovi workera pokazuju male cikluse, ne 50k; API proces bez špikova.

### STAVKA 2.4 — Server agregati za dashboard/SLA ekrane (napor S)

**ŠTA/PROBLEM/CILJ:** plan §2.4. Klijent računa brojčanike nad punim dumpom (`use-dashboard-summary.ts:63`, `use-sla-page-data.ts:54`) iako `reports/dashboard` modul postoji.

**ISPRAVKA:**
1. `GET /reports/dashboard/summary`: `SELECT count(*) GROUP BY status` (+ po prioritetu/potrebi) nad ISTIM visibility where kao lista (izdvoji postojeći builder funkciju — bez dupliranja); odgovor mali DTO
2. `GET /reports/sla/summary`: count po SLA stanju iz `ticket_sla_state`
3. Keš po (userId, scope): Redis TTL 30 s; invalidacija na `ticketUpdated` (postojeći event) → DEL pattern
4. Frontend: oba hooka prebačena na nove endpointove; ukloniti `summarizeTickets(`/lokalne agregacije; vizuelno identično
5. Testovi: agregat = ručno računati očekivani rezultat iz fixturea; RBAC izolacija dokazana (korisnik A ne vidi brojke korisnika B)

**PONAŠANJE:** Dashboard odgovor < 20 KB; brojčanici jednaki listama na istom filteru; svježina ≤ 30 s.

### STAVKA 2.3 — Notification fan-out O(1) (napor M) — ZADNJA I NAJOPREZNIJA

**ŠTA/PROBLEM/CILJ:** plan §2.3. Danas: po red + po emit PO ČLANU grupe (`fan-out-in-app-notifications.ts:36`, `resolve-notification-recipients.ts:77`); grupa 200 ⇒ 200 INSERT + 200 emit po poruci.

**ISPRAVKA — fazonirano (OBavezno obje podfaraze):**

**Podfaza A (kratki rok, ove faze):**
- `persistInAppNotification` zamijeni `createMany` batchom (1 SQL po fan-outu) uz postojeći dedupeKey mehanizam (provjeri unique constraint na dedupeKey — ako nema, dodaj kroz migraciju, a obradu konflikta mapirati na skip)
- Publish: jedan publish po grupnoj sobi (neutralni payload: `notificationCreated {groupId, ticketId}`) + korisnik-specifični samo za direktne primaoce (requester/assignee); badge count klijent uzima iz push payloada postojećeg `notificationUnreadCount` eventa — count izračunati JEDNOM i poslati svima iz grupe (ne po konekciji)

**Podfaza B (ciljno stanje, isto ova faza ako rok drži; inače dokumentovane migracije + zastavica):**
- Grupne notifikacije kao JEDAN red (`notification.groupId`) + pivot `notification_seen(notificationId, userId, seenAt)`; inbox upit = join koji isključuje viđeno; unread count = agregat
- Kompatibilnost: inbox API čita UNIJU starog i novog oblika dok traje migracija klijenta; feature flag `NOTIF_GROUP_MODEL=v2` (settings modul već ima obrazac — provjeri `settings/definitions`)
- Retencija: worker job (iz Faze 4 obrazca, ali ovjde zavedi raspored) briše/arhivira notifikacije starije od N dana; dokumentuj prag particionisanja (10M redova)

**Testovi (obavezno, iz postojećeg inbox spec obrasca):** (a) poruka u grupi od 200 ⇒ ≤ 1 batch INSERT statement (brojati kroz query log u testu s in-memory/pg delegatom); (b) svaki član vidi notifikaciju; (c) read kod jednog ne utiče na druge; (d) dedupe: isti event dvaput = 1 notifikacija; (e) SLA eskalacije i dalje stižu pravim ljudima (regresija dispatch-sla-runtime-notification specova).

**PONAŠANJE:** writes/s < 100 pri 10 događaja/s; emit-ova po grupnom događaju ≤ 2; inbox UX nepromijenjen.

## 6. DEFINITION OF DONE — KAPIJA FAZE 2

- [ ] Sve stavke iza zasebnih diff-ova; regresijski testovi zeleni NEIZMIJENJENI (osim dokumentovanih mehanika)
- [ ] k6 full: DB QPS < 800; authz udio < 5%; notification writes/s < 100; P95 < 200 ms svih ključnih endpointa
- [ ] SLA ciklus < 15 s @ 100k seed; ciklusi u worker logovima; API proces čist od job linija
- [ ] Migracije: prolaze na kopiji produkcijske veličine baze; indeksi CONCURRENTLY dokumentovani s procijenjenim trajanjem
- [ ] Popunjen red "Nakon F2" u plan §7

## 7. VAN OBIMA

- Redis WS adapter i granulacija emit-ova (Faza 3) — NE mijenjaj `ticket-updated-broadcast-rooms.ts` sobe
- React Query/virtualizacija (Faza 3); premještanje ostalih @Interval jobova (Faza 4)
- Redizajn domenskih SLA pravila, routing logike, eskalacionih MATRICA — samo mehanika izvršenja

## 8. FINALNI IZVJEŠTAJ (obavezni format + dodaci)

```
FAZA 2 — IZVJEŠTAJ
Diff-ovi po stavki: <fajlovi>
Migracije: <naziv, procijenjeno trajanje, rollback SQL>
Keš politika: <ključevi, TTL, invalidacioni okidači — tabela>
Kapija: DB QPS=? authz%=? SLA ciklus=? notif writes/s=? P95=?
Regresijski bilans: <koliko specova netaknuto / koliko namjerno izmijenjeno i zašto>
Odstupanja: <šta/zašto>
```

## 9. PRAVILA DISKUSIJE

- Svaka nedoumica oko POSLOVNOG ponašanja obaveznih tijekova (SLA eskalacije, pravila eskalacije, RBAC matrica) → STANI i pitaj. Mehaničke odluke (batch size, TTL unutar ±2×) odluči sam i zabilježi.
- Ako kapija padne na jednoj stavki — vrati samo tu stavku (diff revert), ostale predaj.
