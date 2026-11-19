# Package closeout — W7.54

**Paket:** W7.54 — scheduled CSV prilozi nose presjek rasporeda (servis/grupa/prioritet)<br>
**Nalaz:** `BA-reports-02` (P1) — **zatvoren**<br>
**Kodni commit:** `4be518d` (logika) + `db9b398` (CI korekcija tipova u specu)<br>
**Finalni testani SHA:** `db9b398`<br>
**CI:** [`44528116159`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44528116159) — zelen (16m43s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `26-reports.md` §7 i §4: `buildContent` je primjenjivao schedule filtere (service, group, priority) na trend i
overdue sekcije, ali `buildAttachments` je pozivao `loadReportPackBuildInput` samo sa OU ID-jevima i prozorom.
Primalac je dobijao OU-wide CSV uz e-mail koji u `reportScope` eksplicitno piše „servis VPN, grupa X, prioritet
visok”, a napomena uz priloge je tvrdila da prilozi pokrivaju „cijelu organizacionu jedinicu”. To je podatkovna i
ugovorna greška: dokument je širi od prijavljenog presjeka.

Acceptance (audit §16.2): svaka scheduled sekcija **i svaki prilog** primjenjuju identičan OU/service/group/priority
scope.

## Implementacija

- **Novi tip `ReportPackFilters`** (`serviceId`, `groupId`, `priority`) u `reports.types.ts` i novi opcioni
  `options.filters` u `loadReportPackBuildInput`. Filter se **gura u upit** prije nego se potroši row budžet
  (W7.53), pa se ne učitava korpus koji bi bio odbačen.
- **Ticket put:** `loadScopedReportTickets` dodaje `serviceId`, `assignedGroupId` i `priority` u `where`
  (`monthly_kpi`, `overdue_by_service`, `top_close_codes`). Time tracking filtrira kroz `ticket: { serviceId,
  assignedGroupId, priority }`, forward ping-pong filtrira lookup tiketa (paket i dalje broji forwarde po tiketu),
  pa tiket izvan presjeka ne ulazi u CSV.
- **Problemski packovi:** filter ide na **problem zapis** (`problem.serviceId/groupId/priority`), ne na povezane
  tikete — problem ima vlastiti servis, grupu i prioritet i to je dimenzija koju pack prikazuje.
- **KB pack:** podržava samo `serviceId` (`knowledgeArticle.serviceId`); grupa i prioritet ne postoje na članku.
- **Change i CMDB packovi:** nemaju service/group/priority dimenziju. Umjesto tihog ignorisanja, takav pack se
  **izostavlja** iz e-maila sa novim reasonom `filter_unsupported` (`reportPackScheduleFilterSupport` deklariše
  podršku po packu). Fail-closed: e-mail nikad ne tvrdi uži presjek od sadržaja.
- **Runner:** `schedulePackFilters(schedule)` jednom po izvršenju; `unsupportedScheduleFilterKeys(pack, filters)`
  odlučuje o izostavljanju; filter se prosljeđuje loaderu uz `rowLimit: attachmentMaxRows`.
- **E-mail i UI:** napomena uz priloge sada kaže da prilozi koriste **isti period i isti presjek** kao izvještaj;
  novi label za `filter_unsupported` (bs/en) u e-mailu i u „Historiji izvršenja” (runs sheet), a hint uz izbor
  priloga u formi rasporeda objašnjava pravilo.
- **Bez migracije** — nema schema promjene; filteri su postojeće kolone.

### Namjerne odluke (trade-off)

1. **Izostavljanje umjesto slanja šireg fajla.** Alternativa (poslati OU-wide CSV uz napomenu „nije filtrirano”)
   bi zadržala podatkovni leak u sanduku primaoca i proturječila scope labeli. Izostavljanje je vidljivo u e-mailu
   i u historiji, a korisnik CSV može izvesti u aplikaciji sa istim filterima.
2. **Filter na problem zapisu, ne na tiketima.** Problem pack prikazuje problem (njegov servis/grupu/prioritet);
   filtriranje po tiketima bi značilo „problemi koji imaju bar jedan tiket u presjeku” — druga metrika i drugi
   redovi nego što ih pack prikazuje.
3. **Validacija pri čuvanju rasporeda nije dio ovog paketa.** Postojeći rasporedi sa „nespojivim” packom ne smiju
   početi padati na update; fail-closed ponašanje pri slanju je sigurnije. Reference/Ou-scope validacija je
   `BA-reports-03` (P2).

## Dokaz

- `load-report-pack-build-input.filters.spec.ts` (novo, 6 testova): presjek po servisu/grupi/prioritetu na ticket
  korpusu, filter u `where` umjesto post-filtriranja, time tracking kroz tiket, KB po servisu, forward ping-pong
  odbacuje tiket izvan presjeka, problem loader stavlja presjek na problem zapis.
- `schedule-pack-filters.spec.ts` (novo, 4 testa): mapiranje raspored → presjek, aktivne dimenzije, podržane
  dimenzije po packu, odbijanje nepodržanih.
- `report-schedules.spec.ts` (3 nova testa): prilog se gradi iz presjeka (`where` nosi serviceId/assignedGroupId/
  priority), nepodržan pack se izostavlja sa `filter_unsupported` i ne pokreće se njegov upit, e-mail nosi novu
  napomenu i label.
- Lokalno: `npx jest --config /tmp/jest.local.json src/modules/reports src/modules/knowledge-base` → **230 zeleno**;
  `src/modules/tickets src/modules/problems` → **1030 zeleno** uz jedan **pre-egzistirajući okolinski** fail
  (`disk-ticket-attachment-storage.streaming.spec.ts` — storage root nedostupan u sandboxu). Frontend: `tsc -b`,
  `prettier --check` i `vitest` za reports (6 testova) zeleni; ESLint nad `src/modules/reports` bez nalaza.
  Sandbox `npm run build` nije gate (Prisma klijent je stub), pa je typecheck dokaz CI korak „Build backend with
  annotated diagnostics”.

## CI

- **Neuspjeli pokušaj:** [`44525161936`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44525161936)
  na `4be518d` — build, lint, integration, frontend, docs i container/supply-chain zeleni; `npm test` pao jer
  ts-jest kompajlira specove sa dijagnostikom: `mock.calls[0][0]` nad `jest.fn()` bez argumenta je TS2352/TS2493,
  a pristup `.where` TS2532. Korekcija `db9b398` (mock deklariše argument, čitanje je opciono).
- **Finalni:** [`44528116159`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44528116159) na
  `db9b398` — **success** (backend build/lint/full Jest, PostgreSQL+Redis integration, frontend, docs guard,
  container/supply-chain i CI gate). E2E critical/install i inventory su `skipped`.

## Registar nalaza

- Zatvoreni: `BA-reports-02` (P1).
- Ostaju otvoreni u `26-reports.md`: 17 nalaza, **P1: nema** (P2/P3 ostaju, npr. `BA-reports-03` za relacijsku
  validaciju service/group reference i `BA-reports-11` za širinu ticket snapshot kolona).

## Migracija, rollout i rollback

Nema migracije. Ponašanje je strože: raspored sa filterom i packom koji ga ne podržava više ne šalje taj CSV,
nego ga izostavlja uz objašnjenje. Rollback: revert `4be518d` + `db9b398` vraća OU-wide priloge i staru napomenu;
nema podataka za vraćanje.

**Preostali rizik (dokumentovan):** (1) schedule se može sačuvati sa packom koji ne podržava njegov filter — tada
se prilog izostavlja pri svakom slanju (vidljivo u historiji), a validacija pri čuvanju je `BA-reports-03`;
(2) `filter_unsupported` je novi reason u run JSON-u — stariji klijenti koji mapiraju samo poznate reasone
prikazuju sirovi ključ dok se UI ne osvježi; (3) CMDB/change packovi ostaju bez filter dimenzija dok ih model ne
dobije.

## Sljedeći paket

**W7.55 — `BA-search-01` (P1).**
