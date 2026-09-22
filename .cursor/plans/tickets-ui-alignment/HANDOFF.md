# HANDOFF — tickets-ui-alignment

## Urađeno
**F1 kompletan (slojevi 0–6)**, vidi `CHANGELOG.md`.

## Test status
Pisano bez `node_modules`/Prisma klijenta: `jest`, `tsc -b` i `vitest` nisu pokrenuti u tom okruženju. Specovi su izvršeni kroz privremeni CommonJS runner uz stubove: ticket specovi prolaze uz iste 4 poznate pada shima kao prije izmjena. **Prije commita pokreni `npm run build` i `jest` u `backend/` te `npm run build` i `npm test` u `frontend/`.** Prisma tipovi (`Prisma.TicketWhereInput`, `TicketOrderByWithRelationInput`, `updateMany`, `orderBy` po relaciji `slaState`) nisu provjereni protiv pravog klijenta.

## Ograničenje testova sloja 3
Paritet vidljivosti i paginacija izvršavaju `where` kroz in-memory evaluator, ne kroz Postgres. Dokazuju logiku predikata (mutacijska provjera: 16/16 mutacija predikata i 6/6 mutacija paginacije obara spec), ali ne dokazuju SQL semantiku ni performanse. Za to služi sloj 3b.

## Next
F1 (backend ugovor) je gotov. Slijedi F2 (grupni inbox — frontend) prema `04-FAZNI-PLAN-TIKETI-UI.md`, uz migraciju preostalih FE potrošača liste (sidebar/dashboard/pretraga/SLA stranica) na `listTicketsPage`/`getTicketCounts` iz slojeva 3–4, koja je odgođena zbog prelaznog režima (F1-4).

## Otvoreno
- `ServiceResponse.approvalSteps` na mutacionim odgovorima (create/update/transition/availability/downtime-window) ne uzima u obzir per-servis approvals overlay, samo `requiresApproval`. Namjerno ograničenje obima (vidi `service-catalog-lifecycle` CHANGELOG); proširiti ako se pokaže da FE to očekuje odmah nakon mutacije, ne tek nakon sljedećeg GET-a.
- `Group.autoAssignStrategy` u `prisma/schema/identity.prisma` + ručno napisana migracija `prisma/migrations/20260921120000_group_auto_assign_strategy/migration.sql` (`ALTER TABLE "Group" ADD COLUMN "autoAssignStrategy" "AutoAssignStrategy" NOT NULL DEFAULT 'NONE'`; enum već postoji od `Service.autoAssignStrategy`, nema novog tipa). Napisana ručno jer `prisma migrate dev` traži shadow bazu koju sam u ovom okruženju nemao. **Primijeniti s `npx prisma migrate deploy`** (ne `migrate dev` — deploy ne treba shadow bazu i to je i dosad radilo kod vas). Ako nakon primjene `prisma validate`/`prisma generate` prijavi razliku od stvarne baze, to znači da je neko ranije ručno mijenjao bazu mimo migracija; u tom slučaju provjeriti sa `prisma migrate diff --from-url <DB> --to-schema-datamodel prisma/schema`.
- 3 nova testa (`groups-mine.controller.guard.spec.ts`, `groups-module-order.spec.ts` × 2) nisu izvršena mojim shimom (`Reflect.getMetadata` nije polyfillovan) — isto ograničenje kao postojeći `groups.controller.guard.spec.ts` drugi test. Logika je provjerena čitanjem, ne izvršavanjem; pokrenuti pravi `jest` da se potvrdi.
- `effectiveAutoAssign` u `/groups/mine` ignoriše servisni nivo (grupa opslužuje više servisa). Ako se ispostavi da agenti očekuju da vide i servisni fallback po grupi, treba prošireno polje (npr. lista servisa sa strategijama) — nije u planu, dodatna odluka.
- Odluka o `overdue`/`atRisk`: brojači i list-filteri broje i zatvorene tikete s probijenim SLA (matrica `overdue-ui-badge-filter` definiše `isOverdue` bez statusa). Ako proizvod želi samo otvorene, mijenja se u `buildTicketListFilters` i time oba mjesta odjednom.
- F2 tabovi inboxa (INB-01) trebaju brojač po grupi; `counts.inbox` je jedan broj. Dodati `inboxByGroup` u sloju 5 ako se potvrdi.
- Realtime invalidacija brojača (F1 zadatak 2/11) čeka payload događaja (sloj 6); do tada sidebar osvježava TTL cache od 30 s.
- D1, D3–D10 nisu odlučeni (F0).
- Sloj 3b (`int.spec.ts`): pokrenuti lokalno uz Postgres; provjeriti (1) paritet vidljivosti na pravoj bazi, (2) `orderBy` po `slaState.resolutionDueAt` i redoslijed NULL-ova (Postgres: NULL zadnji za `asc`), (3) `contains`/`mode: 'insensitive'` s `%`/`_` u `q` (Prisma možda ne escapeuje wildcarde), (4) EXPLAIN: indeksi za sort/filter (Ticket ima samo jednokolonske; složeni tek ako plan pokaže potrebu), (5) 1000 tiketa < 300 ms i bez N+1.
- Odgovor liste od 1000 tiketa < 300 ms (RAW NFR) nije izmjeren.
