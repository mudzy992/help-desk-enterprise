# W7.101 — `BA-reports-11`: svaki report read je projekcija (bez free texta, bez nekorištenih kolona)

**Paket:** Val 7, `reports`, **P2**<br>
**Nalaz:** „KB/ticket loaderi čitaju nekorištene osjetljive kolone i šire privacy blast radius”<br>
**Kod:** `load-scoped-report-tickets.ts` (dvije imenovane projekcije + obavezan `select` na svakom putu),
`load-report-pack-build-input.ts` (close codes projekcija)<br>
**Specovi:** `load-scoped-report-tickets.projection.spec.ts` (**novo, 5**)<br>
**DB migracija:** **ne**<br>
**Rute:** nepromijenjene (632)<br>
**Frontend:** bez izmjena<br>
**CI:** [run `45178731646`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45178731646) ✓ na `8c30e75`

## Nalaz

Reports loaderi su čitali šire nego što im treba. To nije samo performansno pitanje — kolone koje uđu u proces
postaju dio privacy blast radiusa (log, heap dump, tracing, budući bug), čak i ako ih izvještaj nikad ne ispiše.

1. **No-window put je čitao cijeli red.** `loadScopedReportTickets` je `select` primjenjivao **samo** kad je prozor
   zadat (`window === undefined ? {} : { select: reportTicketSelect }`). Bez prozora — dashboard fallback
   (`build-reports-dashboard`) i bottleneck fallback (`ReportsService.bottleneck`) — Prisma je vraćala **sve**
   kolone tiketa, uključujući `description` i `formData`.
2. **Identifikacione kolone za packove koji broje redove.** Prozorski put je uvijek uzimao `title`, `ticketNumber`
   i `isConfidential`, iako `monthly_kpi`, `overdue_by_service` i `top_close_codes` čitaju samo `id`, `serviceId`,
   `closeCodeId`, `isOverdue` i vremenske oznake. Naslov tiketa (i marker povjerljivosti) je tako ulazio u memoriju
   bez ijednog čitaoca.
3. **Close codes cijeli red.** `loadCloseCodes` je radio `findMany` bez `select`, pa je pack koji štampa `id/key/name`
   dobijao i `serviceId`, `isActive`, `createdAt`, `updatedAt`.
4. **KB put je već bio uzak** (W7.53): `id/title/serviceId/organizationalUnitId/viewCount`, feedback glasovi uz
   `articleId/isHelpful/rating/createdAt`. Tu nije bilo šta dodatno suziti — to je i razlog zašto je nalaz ostao
   otvoren samo za ticket snapshot (vidi §12 auditа).

## Rješenje

**Projekcija je dio ugovora loadera, ne opcija pozivaoca.**

- `reportTicketSnapshotSelect` — sve što agregati čitaju (`id`, `status`, `priority`, `originUnitId`, `serviceId`,
  `assignedGroupId`, `assignedUserId`, `closeCodeId`, `firstResponseAt`, `resolvedAt`, `closedAt`, `archivedAt`,
  `createdAt`, `updatedAt`). **Bez** `title`, `ticketNumber`, `isConfidential`.
- `reportTicketRowSelect` — snapshot + identifikacione kolone, za pack koji stvarno štampa tiket (danas
  `forward_ping_pong`, koji ima vlastiti loader i vlastiti `select`).
- **Nijedna projekcija ne sadrži free text:** `description`, `formData`, `resolutionSummary`, `resolutionNote` i
  tijela poruka nisu dio report snapshota — nikad, ni na jednom putu.
- `loadScopedReportTickets` **uvijek** prosljeđuje `select` (default `snapshot`), pa cijeli-red read više ne
  postoji. `projection: 'row'` je eksplicitan zahtjev pozivaoca.
- `loadCloseCodes`: `select: { id, key, name }`.

### Zašto ne drugačije

- **Osloniti se na `TicketRecord` tip** ne bi pomoglo: Prisma `findMany` bez `select` vraća sve, a tip to ne
  sprječava. Zaštita mora biti u upitu — zato je testiran **argument** `findMany`.
- **Ukloniti `title` iz tipa snapshota** bilo bi tačnije, ali bi promijenilo `ReportPackBuildInput` i sve buildere;
  projekcija + test na nivou upita daje istu garanciju bez refaktora ugovora packova.
- **DB agregacija umjesto projekcije** je veći posao (i ostaje rezidualni rizik iz audita §10); ovaj paket rješava
  tačno ono što nalaz imenuje — kolone koje uopšte ne treba čitati.

## Posljedice po ponašanje

- Payloadi i brojevi su **identični**; mijenja se samo šta ulazi u proces.
- Dashboard/bottleneck fallback (samo in-memory klijenti u testovima; produkcija koristi `$queryRaw`) i dalje
  agregira iste kolone — sada kroz projekciju.
- Ako neki budući pack zatreba naslov tiketa, mora eksplicitno tražiti `projection: 'row'`; to je namjerno
  (vidljivo u diffu, pokriveno testom).

## Testni dokaz

`load-scoped-report-tickets.projection.spec.ts` (**novo, 5**):

1. nijedna projekcija ne sadrži `description`/`formData`/`resolutionSummary`/`resolutionNote`;
2. agregatna projekcija ne sadrži `title`/`ticketNumber`/`isConfidential`, a row projekcija ih ima;
3. **no-window read ima `select`** i jednak je agregatnoj projekciji (regresija za cijeli-red read);
4. `projection: 'row'` daje identifikacione kolone uz zadate granice prozora i `take`;
5. bez OJ nema upita uopšte.

Lokalno: backend **947 suite / 5.465 testa** ✓ (104 suite skipped — integracije bez `PRIVACY_IT_DATABASE_URL`);
`reports` **38 suite / 213 testa**; `eslint` 0; `wiring` 632 rute; `db:migration-policy` 124 (bez nove migracije);
`check-docs-content` OK.

## Šta nije urađeno (i gdje je zapisano)

- **DB agregacija/paginacija** za packove koji još sabiraju u aplikaciji — rezidualni rizik iz §10; `BA-reports-01`
  je uveo bounded read + probe red (`limit+1`), ali ne SQL agregat.
- **`loadTicketSlaSnapshots`** čita cijeli `TicketSlaState` red za bounded listu ID-eva; tabela nema slobodan
  tekst (samo oznake i vremena), pa nije dio ovog nalaza.
- **Strogi versioned schema/payload cap** Redis parsera — `BA-reports-15`; **privacy matrica** — `BA-reports-13`.

## CI i testni dokaz

**Run [`45178731646`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45178731646) — success iz prvog
pokušaja** (push na `arena/864951a6-help-desk-enterprise`, commit `8c30e75`, `CI gate` ✓). Poslovi:
`Backend build + test` ✓, `Backend PostgreSQL + Redis integration` ✓ (103/103 izolovana suitea),
`Frontend build + test` ✓, `Docs guard` ✓, `Backend container + supply chain` ✓; `E2E *` preskočeni (nema `e2e`
promjena).

**Zašto bez popravke:** promjena suzuje `select` u dva postojeća upita i ne dira tipove koje Prisma generiše
(`satisfies Prisma.TicketSelect` je provjeren lokalno u IDE smislu kroz `eslint`; tip je isti kao ranije), pa nije
bilo nove zavisnosti koju stub može sakriti.

**Ostale provjere (lokalno, prije commita):**

| provjera | rezultat |
| --- | --- |
| `jest` (backend, cijeli) | **947 suite / 5.465 testa** ✓, 104 suite skipped (integracije bez `PRIVACY_IT_DATABASE_URL`) |
| `jest src/modules/reports` | **38 suite / 213 testa** ✓ (+6 skipped, integracioni specovi) |
| `eslint src/modules/reports` | 0 problema ✓ |
| `npm run wiring:check` | ✓ 99 controllera, **632** rute (nepromijenjeno) |
| `npm run db:migration-policy:check` | ✓ **124** migracije (bez nove migracije) |
| `node scripts/check-docs-content.mjs` | ✓ 32 stranice, 8 prevoda, 10 provjera |
| `node scripts/check-backend-findings.mjs` | ✓ **696/696**, zatvoreno **319** / otvoreno **377** |

## Registar nalaza

`BA-reports-11` je prebačen u `zatvoreno` u [registru](../BACKEND-FINDINGS-REGISTER.md) i u tabeli
[audita 26](../audits/26-reports.md#12-registar-nalaza). Zbirovi poslije zatvaranja: **319 zatvoreno /
377 otvoreno / 696**; Val 7 **98 / 18 (0/8/10)**, `reports` **11/19**.

## Veze

- [Audit 26 — §4, §10 i §27 (closeout)](../audits/26-reports.md)
- [W7.53 — bounded pack reads](274-w753-reports-01-bounded-pack-reads.md)
- [W7.100 — authorization-aware cache](322-w7100-reports-10-authorization-aware-cache.md)
