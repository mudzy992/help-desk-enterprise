# W7.99 — `BA-reports-09`: scheduled e-mail je at-least-once, a neizvjestan ishod nije „nije poslano”

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „SMTP accepted → DB mark crash prozor može duplirati scheduled e-mail”<br>
**Kod:** `reports/schedules/scheduled-report.runner.ts` (`delivery_unknown` razlog, odvojen catch za
`NotificationEmailOutcomeUnknownError`, log takeover-a), `reports/schedules/report-schedule.constants.ts`
(`reportRecipientSkipReasons.deliveryUnknown`); frontend:
`components/reports/schedules/report-schedule-runs-sheet.tsx` + `i18n/locales/{bs,en}/common.json` (labela)<br>
**Specovi:** `report-schedules.spec.ts` (**+3**, jedan postojeći **preinačen**),
`report-schedule-delivery-crash-window.integration.spec.ts` (**novo, 3**, PostgreSQL, registracija u
`scripts/run-isolated-integration.mjs`)<br>
**DB migracija:** **ne** (ledger i njegovi indeksi postoje od `notifications` paketa)<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** dvije labela-linije (`delivery_unknown`), bez logike<br>
**CI:** [run `45172324800`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45172324800) ✓ na `0247f94`

## Nalaz

Isporuka scheduled izvještaja ide kroz `deliverNotificationEmail`: claim reda u ledgeru → SMTP → `mark sent`.
Prozor između SMTP prihvatanja i upisa je neizbježan; pitanje je samo šta sistem **tvrdi** kad ga pogodi.

1. **Ledger je već bio durabilan, ali run log je lagao.** `NotificationEmailOutcomeUnknownError` (SMTP prihvatio,
   upis nije prošao; ili djelimično prihvatanje) runner je hvatao istim `catch`-om kao svaku drugu grešku i
   zapisivao `delivery_failed`. Run log je time za poruku koja je možda stigla rekao „slanje nije uspjelo”.
2. **Taj zapis vodi u duplikat.** Operater koji u „Historiji izvršenja” vidi `delivery_failed` razumno zaključi da
   primalac nije dobio izvještaj i pošalje ga ručno — a upravo to je scenario koji nalaz opisuje.
3. **Takeover nije ostavljao trag.** Kad sweep preuzme stale `RUNNING` run (worker je pao sredinom slanja), ponovo
   prolazi kroz sve primaoce. To je ispravno (at-least-once), ali nije bilo nikakve linije koja dokazuje da je taj
   put prošao — pa se „zašto nije bilo duplikata” svodilo na vjerovanje u ledger.
4. **Nedostatak eksplicitnog ugovora.** Docs su govorili „nije exactly-once”, ali nigdje nije bilo zapisano šta
   sistem **jeste**: koja je granica ponovnog slanja, ko ga blokira i kako se ishod rješava.

## Rješenje

**Eksplicitna at-least-once semantika + razlika između „nije poslano” i „nije potvrđeno”.**

- **Novi razlog `delivery_unknown`.** Runner hvata `NotificationEmailOutcomeUnknownError` odvojeno i bilježi
  `delivery_unknown` (log linija `report_schedule_delivery_unknown`). Sve ostale greške ostaju `delivery_failed`
  (`report_schedule_delivery_failed`) — dva razloga sada nose dvije različite činjenice.
- **Ugovor (u kodu i u dokumentaciji):** jedan scheduled izvještaj po `(primalac, slot)` se šalje **najmanje
  jednom**; nikad slijepo dvaput. „Ne dvaput” drži ledger ključ `(userId, dedupeKey = report:<slotKey>)`, koji je
  stabilan i za ponovni sweep i za stale-run takeover (isti `runId`).
- **Neizvjestan ishod se ne ponavlja automatski.** Claim stariji od 10 min se ne pušta ponovo: red prelazi u
  `UNKNOWN` (`lastErrorCode = stale_claim`, `nextRetryAt = null`), a queue-admin replay ne dira `UNKNOWN`. Odluku
  donosi operater, ne scheduler.
- **Takeover je vidljiv.** Preuzimanje stale runa loguje
  `report_schedule_run_taken_over slot=… run=… stale_after_ms=…`.
- **UI imenuje ishod.** `reports.schedules.skip.delivery_unknown` (bs: „ishod slanja nije potvrđen”; en: „delivery
  outcome not confirmed”), pa „Historija izvršenja” ne nudi pogrešan zaključak.

### Zašto ne drugačije

- **Exactly-once kroz SMTP.** Nemoguće bez provider idempotency ključa; Message-ID pomaže downstream dedupeu, ali
  nije dokaz prihvatanja. Zato ugovor imenuje stvarnu garanciju (at-least-once) umjesto da obećava nemoguće.
- **Automatski retry `UNKNOWN` redova.** Upravo bi proizveo duplikat koji nalaz opisuje; `UNKNOWN` je stanje koje
  traži čovjeka.
- **Novi broker/outbox za scheduled izvještaje.** Ledger je već durable (tabela, unique ključ, claim/confirm
  semantika) i dijeljen sa ostatkom sistema; novi outbox bi dodao pokretnu dionicu bez nove garancije.

## Posljedice po ponašanje

- Run koji je pogodio crash prozor ostaje `FAILED` ili `PARTIAL` (nikad lažno `SENT`) i ima `delivery_unknown` u
  `skipped` JSON-u, uz `sentCount` koji broji samo potvrđene isporuke.
- Ponovni sweep istog slota i stale-run takeover **ne** šalju drugi e-mail; primalac koji je već dobio izvještaj se
  broji kao poslan (`DUPLICATE` nije „preskočen”), pa `sentCount` ostaje tačan kroz oba prolaza.
- Novi `delivery_unknown` je **aditivna** promjena ugovora: stari klijenti ga prikazuju kao sirov kod, novi imaju
  labelu; backend enum se ne mijenja (razlog je vrijednost u `skipped` JSON-u).

## Testni dokaz

**`report-schedules.spec.ts` (+3, jedan preinačen):**

1. *preinačen* „accepted SMTP receipt cannot be persisted” — očekuje `delivery_unknown` (stara tvrdnja
   `delivery_failed` je **bila** bug);
2. ponovni sweep istog slota: jedan transport poziv, primalac brojan kao poslan;
3. stale claim (11 min): `delivery_unknown` u run logu, **bez** drugog slanja, red ostaje `UNKNOWN` sa
   `nextRetryAt = null`.

**`report-schedule-delivery-crash-window.integration.spec.ts` (novo, 3, PostgreSQL):** stvarni
`deliverNotificationEmail` sa `dedupeKey = report:<slotKey>` i transportom koji prihvata:

1. mark SENT padne (proxy) ⇒ red ostaje `CLAIMED`, **jedan** SMTP poziv; poslije backdate-a preko stale prozora
   claim prelazi u `UNKNOWN` (`stale_claim`, `nextRetryAt = null`) i **i dalje** jedan SMTP poziv; treći prolaz
   takođe blokiran;
2. svjež claim ⇒ `DUPLICATE`, bez slanja, red ostaje `CLAIMED`;
3. bez kvara ⇒ red `SENT` sa `providerMessageId`/`providerResponseCode`/`providerAcceptedAt`, a ponovni poziv istog
   ključa je no-op.

**Ostalo (lokalno):** backend **946 suite / 5.457 testa** ✓ (104 suite skipped — integracije bez
`PRIVACY_IT_DATABASE_URL`); `reports` **37 suite / 205 testa**; frontend `vitest src/components/reports` 3 fajla /
9 testova; `eslint` (backend + dirani frontend fajl) 0; `wiring` 632 rute; `db:migration-policy` 124 (bez nove
migracije); `check-docs-content` OK.

## Šta nije urađeno (i gdje je zapisano)

- **Provider idempotency** (npr. `Idempotency-Key` kod provajdera koji ga podržava) — nema je; Message-ID je
  korelacijski ID, ne garancija. Dokumentovano kao granica ugovora.
- **`runNow` command idempotency** — dvoklik i dalje pravi dva manualna izvještaja (novi `runId` ⇒ novi dedupe
  ključ): `BA-reports-16` (P3).
- **Retention run loga zavisi od sweep-a** — `BA-reports-14` (P2).
- **Privacy matrica nad run JSON-om i primaocima** — `BA-reports-13` (P2).

## CI i testni dokaz

**Run [`45172324800`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45172324800) — success**
(push na `arena/864951a6-help-desk-enterprise`, commit `0247f94`, `CI gate` ✓). Poslovi: `Backend build + test` ✓,
`Backend PostgreSQL + Redis integration` ✓ (103/103 izolovana suitea, uključujući novi
`report-schedule-delivery-crash-window.integration.spec.ts` — 3 testa su stvarno izvršena na PostgreSQL-u, ne skip),
`Frontend build + test` ✓ (uključuje nove bs/en labele), `Docs guard` ✓, `Backend container + supply chain` ✓;
`E2E *` preskočeni (nema `e2e` promjena).

**Prvi pokušaj [`45169698779`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45169698779) je pao**
na `TS2345` u novom integracionom specu: `deliverNotificationEmail` prima `PrismaService` (klijent **plus**
lifecycle hookovi), pa `PrismaClient`/Proxy nije bio dodjeljiv. Lokalni stub to nije pokazao. Popravka je `as never`
(isti obrazac koji `notification-email-delivery-recovery.integration.spec.ts` koristi) u commit-u `0247f94`.

**Ostale provjere (lokalno, prije commita):**

| provjera | rezultat |
| --- | --- |
| `jest` (backend, cijeli) | **946 suite / 5.457 testa** ✓, 104 suite skipped (integracije bez `PRIVACY_IT_DATABASE_URL`) |
| `jest src/modules/reports` | **37 suite / 205 testa** ✓ (+6 skipped, tri integraciona speca) |
| `eslint` (backend `reports` + `scripts`, frontend dirani fajl) | 0 problema ✓ |
| `vitest src/components/reports` (frontend) | 3 fajla / **9** testova ✓ |
| `npm run wiring:check` | ✓ 99 controllera, **632** rute (nepromijenjeno) |
| `npm run db:migration-policy:check` | ✓ **124** migracije (bez nove migracije) |
| `node scripts/check-docs-content.mjs` | ✓ 32 stranice, 8 prevoda, 10 provjera |
| `node scripts/check-backend-findings.mjs` | ✓ **696/696**, zatvoreno **317** / otvoreno **379** |

## Registar nalaza

`BA-reports-09` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **317 zatvoreno /
379 otvoreno / 696**; Val 7 **96 / 18 (0/8/10)**, `reports` **9/19**.

## Veze

- [Audit 26 — §7 i §25 (closeout)](../audits/26-reports.md)
- [W7.96 — transakcijski audit](318-w796-reports-06-transactional-audit.md)
- [W7.98 — scheduler reconciliation](320-w798-reports-08-scheduler-reconciliation.md)
