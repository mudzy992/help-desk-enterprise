# Package closeout — W7.53

**Paket:** W7.53 — ograničeni readovi report packova (budžet, probe red, projekcija)<br>
**Nalaz:** `BA-reports-01` (P1) — **zatvoren**<br>
**Kodni commit:** `1f83ef2` (logika) + `2edc56e` (CI korekcija `take`)<br>
**Finalni testani SHA:** `2edc56e`<br>
**CI:** [`44518772985`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44518772985) — zelen (11m25s)<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit `26-reports.md` §4: limit (`previewRows` 200, `exportRows` 50.000, `attachmentMaxRows`) primjenjivao se
**poslije** `loadReportPackBuildInput` i `buildReportPackRows`. Ticket put je učitavao sve aktivne zapise prozora,
KB put sve article kolone (**uključujući `body`**) i sve voteove bez vremenskog filtera, time tracking sve entryje,
a asset/problem/change putevi imali su neujednačene capove. Preview je gradio cijeli rezultat samo radi
`totalRows`, iako vraća najviše 200 redova. `exportRows` i attachment limit nisu bili zaštita od rada koji se
već dogodio.

Acceptance: nijedan pack ne gradi neograničen scoped korpus prije row/size limita; preview ne gradi cijeli
rezultat radi `totalRows`; svaki pack ima projekciju, granicu i preflight/capped query (`limit + 1`); KB loader ne
čita `body` ni nekorištene kolone; KB voteovi ne idu bez filtera.

## Implementacija

- **Jedan budžet po pozivaocu.** `ReportsService.buildPack` prima obavezan `rowLimit` i prosljeđuje ga loaderu:
  preview → `reportPackPreviewRowLimits[pack]`, export → `reportPackLimits.exportRows` (50.000), scheduled
  attachment → `configuration.attachmentMaxRows`. Loader uvijek čita `rowLimit + 1` (probe red) i vraća
  `ReportPackLoadResult = { input, truncatedInput }`; probe red se **odbacuje** iz `input`, a `truncatedInput`
  označava da je korpus veći od pročitanog prozora.
- **Preview po obliku packa.** Red-list packovi (`kb_helpfulness`, `forward_ping_pong`, `time_tracking`,
  `change_schedule`) čitaju 200 redova + probe. Agregatni packovi (KPI, overdue/service, close codes, CMDB,
  problem, `change_outcomes`) dobijaju `previewAggregateRows` = 20.000: granica od 200 redova bi njihove brojeve
  učinila **pogrešnim** (KPI bi brojao 201 tiket), a ne samo malim. Preko 20.000 redova preview je eksplicitno
  donja granica. Izbor je zapisan u `reportPackPreviewRowLimits`, pa je budžet po packu pregledan na jednom mjestu.
- **Preview ugovor.** `ReportPackPreview` dobija `truncatedInput`; `truncated` je sada
  `truncatedInput || rows.length > previewRows`. Panel prikazuje `reports.packs.rowsAtLeast` („Najmanje N redova“)
  i napomenu `reports.packs.partialInput` da su brojevi donja granica i da treba suziti period ili OJ.
- **Export.** `exportPack` baca `REPORT_TOO_LARGE` kad je `truncatedInput` ili `rows.length > exportRows` — i to
  **prije** serijalizacije i prije audita, pa neispravan/prepolovičan fajl nikad ne nastaje.
- **Scheduled attachment.** Runner prosljeđuje `attachmentMaxRows` kao budžet; `too_many_rows` omit reason sada
  pokriva i `truncatedInput`, pa se djelimičan CSV ne šalje uz poruku koja tvrdi potpun presjek. (Prenos
  service/group/priority filtera u attachment je odvojen nalaz `BA-reports-02`.)
- **Loaderi.** `loadScopedReportTickets`, `loadForwardPingPongTickets`, `loadTimeTrackingEntries` i
  `loadScopedArticles` primaju `take`; `loadProblemReportData` i `loadChangeReportData` primaju `rowLimit`
  (`take: rowLimit + 1`, a change je dodatno ograničen `exportRows` capom). Duplikat forward evenata je
  ograničen i `reportPackLimits.forwardEventRows` (50.000), jer pack broji forwarde po tiketu.
- **KB projekcija.** Novi tip `ReportArticleRow` (`id`, `title`, `serviceId`, `organizationalUnitId`,
  `viewCount`) zamjenjuje `KnowledgeArticleRecord` u `ReportPackBuildInput.articles`; `knowledgeArticle.findMany`
  sada ima `select` bez `body` i bez ~20 nekorištenih kolona. Voteovi (`knowledgeFeedback.findMany`) su vezani na
  `articleId in (učitani članci)` **i** na `createdAt` prozor izvještaja, pa životna historija glasova ne ulazi u
  pack; builder i dalje radi window filter (dvostruka zaštita).
- **In-memory double.** `createInMemoryKnowledgeFeedbackDelegate` sada podržava `createdAt: { gte, lte }`, pa
  testovi mogu dokazati window filter.

### Namjerne odluke (trade-off)

1. **Agregatni packovi imaju veći preview budžet, ne SQL agregaciju.** Ručno prepisivanje KPI/overdue/close-code
   logike u SQL otvorilo bi divergenciju prema builderima (merged/confidential/CSAT pravila) i tražilo bi vlastiti
   paket sa parity testovima. Zato je preview za te packove **ograničen na 20.000 redova** i pošteno označen kao
   donja granica, a ne tiho pogrešan. DB-strana agregacija ostaje kandidat za budući paket (vidi „Preostali rizik“).
2. **`take: undefined` umjesto spread objekta.** Prva verzija je koristila `...(limit === undefined ? {} : {take})`,
   što je Prisma tipovima dalo union `{take?: undefined} | {take: number}` i oborilo build (TS2345). `take:
   undefined` je validan Prisma input, pa se vrijednost prosljeđuje direktno.
3. **Asset packovi zadržavaju svoje fiksne interne capove** (5.000 / 20.000 / 50.000) i vraćaju
   `truncatedInput: false`. Oni nisu bili neograničeni ni prije ovog paketa; detekcija prekoračenja tih capova je
   zabilježena kao preostali rizik, ne kao tiho tvrđenje potpunosti.

## Dokaz

- `backend/src/modules/reports/load-report-pack-build-input.budget.spec.ts` (novo, 6 testova): cap po delegatu,
  tačan fit bez flage, `take = rowLimit + 1` u DB pozivu, projekcija članaka bez `body`, voteovi ograničeni na
  učitane članke i prozor, ponašanje bez budžeta.
- `reports.service.spec.ts` (3 nova testa): preview sa `previewRows + 1` članaka → `rows` 200,
  `totalRows` 200, `truncated`/`truncatedInput` true i `take` 201; agregatni KPI preview sa 250 tiketa ostaje
  tačan (`createdCount` 250) uz `take` 20.001; export odbija capiran input sa `REPORT_TOO_LARGE` i **ne** piše
  audit (serijalizacija nije dostignuta).
- `frontend/src/components/reports/report-packs-panel.spec.tsx`: capiran preview prikazuje
  `rowsAtLeast` i `partialInput` napomenu.
- Lokalno: `npx jest --config /tmp/jest.local.json src/modules/reports src/modules/knowledge-base` → **217
  testova zeleno**; cijeli backend Jest `4993 testa` uz dva **pre-egzistirajuća okolinska** fails
  (`disk-ticket-attachment-storage.streaming.spec.ts` — storage root nedostupan u sandboxu;
  `announcement-delivery.spec.ts` — `import()` bez `--experimental-vm-modules`); frontend `tsc -b` i
  `vitest` za panel zeleni; ESLint nad `src/modules/reports` bez nalaza. Sandbox `npm run build` nije upotrebljiv
  kao gate (Prisma klijent je stub u sandboxu), pa je typecheck dokaz CI korak
  „Backend build + test“ na `2edc56e`.

## CI

- **Neuspjeli pokušaj:** [`44517581193`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44517581193)
  na `1f83ef2` — `nest build` TS2345: spread union `take` u problem/change loaderima. Korekcija `2edc56e`.
- **Finalni:** [`44518772985`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44518772985) na
  `2edc56e` — **success** (backend build/lint/full Jest, PostgreSQL+Redis integration, frontend, docs guard,
  container/supply-chain i CI gate). E2E critical/install i inventory su `skipped`.

## Registar nalaza

- Zatvoreni: `BA-reports-01` (P1).
- Ostaju otvoreni u `26-reports.md`: 18 nalaza, **P1: `BA-reports-02`** (scheduled attachment scope), pa P2/P3.
- `BA-reports-11` (P2, nekorištene osjetljive kolone) je **djelimično** adresiran: KB put više ne čita `body`,
  ali ticket snapshot i dalje nosi kolone koje svi packovi ne trebaju — nalaz ostaje otvoren.

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Ugovorne promjene su aditivne: preview odgovor dobija `truncatedInput`
(stari klijent ga ignorira), a ponašanje exporta je strože (capiran input → 413 `REPORT_TOO_LARGE` umjesto
prepolovičnog fajla). Rollback: revert `1f83ef2` + `2edc56e` vraća neograničene readove i staro export ponašanje,
bez podataka za vraćanje.

**Preostali rizik (dokumentovan):** (1) agregatni preview preko 20.000 scoped redova prikazuje donju granicu umjesto
tačnih brojeva — rješenje je DB agregacija u zasebnom paketu; (2) asset packovi imaju fiksne interne capove bez
probe flage; (3) ticket snapshot kolone ostaju široke (`BA-reports-11`); (4) filter prenos u scheduled attachment
je `BA-reports-02`.

## Sljedeći paket

**W7.54 — `BA-reports-02` (P1).**
