# W7.102 — `BA-reports-12`: jedan ugovor prozora i katalog event-time/snapshot-time semantike

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „Packovi nemaju formalno usklađenu event-time/snapshot-time window semantiku”<br>
**Kod:** `pack-window-semantics.ts` (**novo**), `resolve-report-window.ts`, `reports.types.ts`, `reports.service.ts`,
`record-report-export-audit.ts`, `audit-action-schema-registry.ts`, svi prozorski loaderi i SQL storeovi<br>
**Specovi:** `pack-window-semantics.spec.ts` (**novo, 26**), `reports.service.spec.ts` (+2),
`load-scoped-report-tickets.projection.spec.ts` (ažuriran), frontend `report-packs-panel.spec.tsx` (proširen)<br>
**DB migracija:** **ne**<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** značka semantike uz preview + bs/en tekstovi<br>
**CI:** [run `45183956135`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45183956135) ✓ na `b631250`

## Nalaz

Period izvještaja imao je **dvije** konvencije gornje granice i **nijedno** mjesto gdje semantika piše:

1. **Inkluzivno `to`:** `load-scoped-report-tickets` (`createdAt: lte`), `load-forward-ping-pong-tickets`,
   `load-time-tracking-entries`, KB glasovi (`load-report-pack-build-input`), `isTimestampInWindow` (KPI builder,
   KB helpfulness, bottleneck fallback) i dashboard SQL (`BETWEEN` za tekući i prethodni period).
2. **Isključivo `to`:** problem (`linkedAt`, `identifiedAt`, `resolvedAt`, `problemEvent.createdAt`), change
   (`closedAt`, planned overlap) i asset (`ticket.createdAt`) loaderi.
3. **Snapshot packovi bez oznake:** `overdue_by_service`, `asset_inventory`, `asset_expiring`,
   `asset_license_compliance`, `asset_inactive_holders`, `problem_backlog` ne opisuju period nego stanje u
   trenutku generisanja; `monthly_kpi`, `kb_helpfulness`, `problem_top`, `asset_top_tickets` miješaju događaje iz
   perioda sa trenutnim stanjem. `ReportPackDescriptor` je nosio samo `key/slug/columns`, pa pozivalac nije mogao
   znati da li period uopšte utiče na brojeve.

Posljedica nije bila kozmetička: tiket nastao tačno na `to` ulazio je u **dva** susjedna mjeseca, a susjedni
mjeseci su upravo ono što scheduled izvještaj poredi. Dashboard je isti trenutak brojao u tekućem **i** u
prethodnom periodu.

## Rješenje

### 1. Jedan interval: `[from, to)`

`isTimestampInWindow` i svaki SQL loader sada koriste istu granicu — `>= from` i `< to`:

| put | prije | sada |
| --- | --- | --- |
| `isTimestampInWindow` | `>= from && <= to` | `>= from && < to` |
| ticket snapshot (`load-scoped-report-tickets`) | `createdAt: lte` | `createdAt: lt` |
| forward ping-pong | `createdAt: lte` | `lt` |
| time tracking | `startedAt: lte` | `lt` |
| KB glasovi | `createdAt: lte` | `lt` |
| dashboard fallback (`build-reports-dashboard`) | `createdAt: lte` | `lt` |
| dashboard/bottleneck SQL | `BETWEEN from AND to` | `>= from AND < to` |
| promet po danu (charts/KPI helperi) | `<= window.to` | `< window.to` |
| problem / change / asset loaderi | već `lt` | nepromijenjeno |

Change schedule ostaje jedini **overlap**, jer change nije trenutak nego interval: `plannedStart < to` i
`plannedEnd > from`. To je jedino mjesto gdje `gt: window.from` smije postojati, i test to pinuje.

### 2. Katalog: `pack-window-semantics.ts`

```ts
reportPackWindowSemantics[pack] = {
  mode: 'event-time' | 'snapshot-time' | 'mixed',
  eventTime: ['ticket.resolvedAt', …],       // šta period bira
  snapshotParts: ['overdueCount (SLA state at now)', …], // šta se čita kao stanje
  selection: 'instant' | 'overlap' | 'none',
  boundaries: '[from, to)',
}
```

Raspodjela po packovima:

| mode | packovi |
| --- | --- |
| `event-time` | `top_close_codes`, `forward_ping_pong`, `time_tracking`, `problem_time_to_known_error`, `problem_time_to_resolution`, `problem_recurrence`, `change_outcomes`, `change_schedule` (overlap) |
| `snapshot-time` | `overdue_by_service` (SLA stanje uz tikete žive u periodu), `asset_inventory`, `asset_expiring`, `asset_license_compliance`, `asset_inactive_holders`, `problem_backlog` |
| `mixed` | `monthly_kpi` (događaji + `overdueCount`), `kb_helpfulness` (glasovi + trenutni članci/pregledi), `asset_top_tickets` (tiket u periodu + trenutni asset), `problem_top` (linkovi u periodu + trenutni otvoreni tiketi) |

### 3. Semantika je vidljiva pozivaocu

- `GET /reports/packs` → `ReportPackDescriptor.windowSemantics` (uz `key/slug/columns`).
- `preview.window` → `{ from, to, boundaries: '[from, to)', semantics }`.
- audit `reports.export` → nova ključa `boundaries` i `windowMode` u allowlisti
  (`audit-action-schema-registry.ts`, klasa `pseudonymous` ostaje ista).
- frontend: značka uz preview („Period bira događaje” / „Stanje u trenutku generisanja — period se ne
  primjenjuje” / „Događaji u periodu i trenutno stanje”) sa hintom o pola-otvorenom intervalu; bs/en tekstovi.

### Zašto ne drugačije

- **Inkluzivno `[from, to]` kao kanon** bi sačuvalo više postojećih brojeva, ali dvostruko brojanje na granici je
  greška koju scheduled mjesečni izvještaji direktno porede; pola-otvoren interval je i ono što PostgreSQL
  `BETWEEN`-ova zamjena prirodno izražava.
- **Samo dokumentovati razlike po domenu** (bez usklađivanja) ne rješava nalaz: katalog bi opisivao drift, a ne
  uklanjao ga.
- **Snapshot packovi ne dobijaju lažni prozor.** Nije uveden „period se primjenjuje na sve” — naprotiv, katalog
  eksplicitno kaže gdje period **ne** važi, pa se uklanja iluzija da `asset_inventory` zavisi od datuma.
- **`now` se ne zamjenjuje sa `window.to`.** Snapshot je stanje u trenutku generisanja (i horizon 90 dana za
  `asset_expiring`), što je namjerna semantika tih packova.

## Posljedice po ponašanje

- Brojevi su identični unutar perioda; mijenjaju se samo na granici — događaj tačno na `to` sada pripada **samo**
  sljedećem periodu, a dashboard „prethodni period” više ne broji granicu dvaput.
- `preview` i `packs` payloadi imaju nova polja (aditivno); audit exporta dva nova ključa. Nijedna pack kolona nije
  promijenjena, nijedan fajl/ime izvoza nije promijenjen.
- Novi pack koji se doda u `reportPackKeys` **ne može** proći testove bez unosa u katalog.

## Testni dokaz

`pack-window-semantics.spec.ts` (**novo, 26 testova**):

1. **Katalog pokriva sve:** tačno jedan unos po packu iz `reportPackKeyList`, bez viška i bez manjka.
2. **Isti interval za sve:** svaki unos nosi `[from, to)`.
3. **Konzistentnost sa modom:** `snapshot-time` nema `eventTime` i ima `snapshotParts`; `event-time` obrnuto;
   `mixed` ima oba; `selection: 'none'` samo za snapshot.
4. **Overlap je samo `change_schedule`:** i to sa `plannedStart`/`plannedEnd`.
5. **Snapshot lista je eksplicitna:** šest packova, imenom.
6. **Granice:** `from` ulazi, `23:59:59.999` ulazi, `to` ne ulazi, `to + 1 ms` ne ulazi, `from - 1 ms` ne ulazi.
7. **Particija:** za svaki trenutak, tačno jedan od dva susjedna perioda ga sadrži.
8. **`resolveReportWindow` eksplicitnog prozora** daje isti interval i `to` van njega.
9. **Anti-drift nad izvornim kodom (15 fajlova):** nema `lte: … window.to`, nema `<= window.to`,
   `gt: … window.from` postoji samo u change overlapu.

`reports.service.spec.ts` (+2): `listPacks()` deskriptori nose semantiku (`mixed`, `event-time`, overlap,
`snapshot-time`), preview nosi `boundaries` i `semantics`, audit nosi `boundaries: '[from, to)'` i
`windowMode: 'mixed'`. Frontend: `report-packs-panel.spec.tsx` tvrdi da se značka prikazuje za `mixed`.
`load-scoped-report-tickets.projection.spec.ts` sada pinuje `lt` umjesto `lte`.

Lokalno: backend **948 suite / 5.491 test** ✓ (104 suite skipped — integracije bez `PRIVACY_IT_DATABASE_URL`);
`reports` **39 suite / 239 testova**; frontend **476 fajlova / 1.898 testova**; `eslint` 0; `wiring` 632 rute;
`db:migration-policy` 124 (bez nove migracije); `check-docs-content` OK.

## Šta nije urađeno (i gdje je zapisano)

- **Privacy matrica** nad run JSON-om, primaocima i mail kopijama — `BA-reports-13`.
- **Retention prune** koji zavisi od aktivnog sweepa — `BA-reports-14`.
- **Strogi versioned schema/payload cap** Redis parsera — `BA-reports-15`.
- **`runNow` command idempotency** — `BA-reports-16`; **PDF intent vs. potvrđen artefakt** — `BA-reports-17`;
  **preview read-audit odluka** — `BA-reports-18`.
- **DB agregacija** packova koji još sabiraju u aplikaciji ostaje rezidualni rizik iz §10; ovaj paket mijenja samo
  granicu, ne mjesto računanja.

## CI i testni dokaz

**Run [`45183956135`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45183956135) — success iz prvog
pokušaja** (push na `arena/864951a6-help-desk-enterprise`, commit `b631250`, `CI gate` ✓). Poslovi:
`Backend build + test` ✓, `Backend PostgreSQL + Redis integration` ✓ (103/103 izolovana suitea — SQL granice
(`>= from AND < to`) su provjerene na stvarnoj bazi), `Frontend build + test` ✓, `Docs guard` ✓,
`Backend container + supply chain` ✓; `E2E *` preskočeni (nema `e2e` promjena).

**Zašto bez popravke:** promjena je granica u postojećim upitima, dvije aditivne projekcije odgovora i jedan
allowlist ključ u audit šemi — nema nove Prisma zavisnosti ni novog tipa koji bi lokalni stub sakrio.

**Ostale provjere (lokalno, prije commita):**

| provjera | rezultat |
| --- | --- |
| `jest` (backend, cijeli) | **948 suite / 5.491 test** ✓, 104 suite skipped (integracije bez `PRIVACY_IT_DATABASE_URL`) |
| `jest src/modules/reports` | **39 suite / 239 testova** ✓ (+6 skipped, integracioni specovi) |
| `vitest run` (frontend) | **476 fajlova / 1.898 testova** ✓ |
| `eslint` (reports, audit-log, reports UI) | 0 problema ✓ |
| `tsc --noEmit` (frontend) | ✓ |
| `npm run wiring:check` | ✓ 99 controllera, **632** rute (nepromijenjeno) |
| `npm run db:migration-policy:check` | ✓ **124** migracije (bez nove migracije) |
| `node scripts/check-docs-content.mjs` | ✓ 32 stranice, 8 prevoda, 10 provjera |
| `node scripts/check-backend-findings.mjs` | ✓ **696/696**, zatvoreno **320** / otvoreno **376** |

## Registar nalaza

`BA-reports-12` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **320 zatvoreno /
376 otvoreno / 696**; Val 7 **99 / 12 (0/2/10)**, `reports` **12/19**.

## Veze

- [Audit 26 — §28 (closeout) i §12 (registar)](../audits/26-reports.md)
- [W7.101 — svaki read je projekcija](323-w7101-reports-11-read-projections.md)
- [W7.100 — authorization-aware cache](322-w7100-reports-10-authorization-aware-cache.md)
