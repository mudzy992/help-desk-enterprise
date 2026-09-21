# Tiketi UI alignment — overview

Izvor: `03-GAP-ANALIZA-TIKETI-UI.md`, `04-FAZNI-PLAN-TIKETI-UI.md` (faze F0–F8, F4b, F4c). Ekrani: grupni inbox, Svi tiketi, Detalji tiketa, Novi tiket.

## Odluke

Potvrđene za F1 (2026-09-21):

| # | Odluka |
|---|---|
| F1-1 | Claim ne radi take-over. Tuđi tiket samo kroz „Dodijeli“ (bulk `assign_user`). |
| F1-2 | D2 = auto-assign **po grupi** (`Group.autoAssignStrategy`, prioritet grupa > servis > globalno). Zaseban sloj 5b. |
| F1-3 | Aktivni break-glass **ulazi** u SQL predikat vidljivosti liste (paritet sa `isConfidentialTicketVisible`). |
| F1-4 | Lista: prelazni režim — bez `page`/`pageSize` vraća niz kao danas. Web FE i e2e migriraju odmah; edge ekstenzije do F8. |
| F1-5 | `approvalSteps` je 0 ili 1 (izvedeno iz `resolveTicketApprovalRequirement`); višekoračno odobravanje nije u opsegu. |
| F1-6 | Testovi nad pravom bazom: mali `*.int.spec.ts` set (paritet vidljivosti, istovremeni claim), uključen env varijablom. CI nema Postgres, pa se tamo preskače. |

Nisu odlučene (default iz `03-GAP` §9, potvrđuje se u F0): D1, D3–D10.

## Odstupanja od `04-FAZNI-PLAN`

- Zadatak 8: guard claima nije samo `PENDING` nego `assignedUserId: null` + pročitani status (vidi matricu `ticket-group-inbox`).
- Zadatak 4: `sort=slaDueAt` znači `TicketSlaState.resolutionDueAt` (nema kolone `Ticket.slaDueAt`).
- Zadatak 10: `approvalSteps` prelazi u sloj 6 (traži `TicketApprovalsConfigurationLoader` u service-catalog modulu; isti izvor koristi routing preview).
- Zadatak 5 (sloj 3): potrošači liste (`use-ticket-list`, `use-sidebar-ticket-counts`, `header-search-match`, `use-dashboard-summary`, `use-sla-page-data`) **nisu migrirani** na omotnicu. Zbog prelaznog režima (F1-4) rade nepromijenjeni, a svaki prelazi kad dobije pravi izvor: sidebar značke na `/tickets/counts` u sloju 4 (urađeno; dashboard koristi liste za više od brojeva pa ostaje), tabela na server-side stranicu u F3, pretraga i SLA stranica u F3/F6. FE u sloju 3 dobija samo `listTicketsPage`. Ovo mijenja dogovor F1-4 („web FE migrira odmah“).
- Saved views: server ih ne izvršava nad tiketima (čuva JSON filtera koji tumači FE), pa nema šta preseliti na builder. Proširenje ključeva filtera (`atRisk`, `unassigned`, `status[]`, sort `slaDueAt`) ide u F3.
- Zadatak 4: DTO se zove `ListTicketsQueryDto` (postojeće ime, bez preimenovanja); `priority` je jedna vrijednost; export DTO ostaje svoj (jedan `status`, flagovi kao `'true'`), a koristi isti builder.
- F1-6: `int.spec.ts` nad Postgresom **nije napisan** u sloju 3 (nema Postgresa u okruženju, pa ga ne mogu izvršiti). Zamjena: paritet vidljivosti i paginacija su testirani nad in-memory Prismom koji izvršava generisani `where` (vidi HANDOFF za ograničenje).
- NEW-04 (GAP): „1–3“ u matrici `ticket-approvals` znači 1–3 osjetljiva servisa, ne koraka.

## TASKS.md (ručno)

```
## Faza 10 — Tiketi UI alignment
- [ ] F0 Odluke + baseline
- [~] F1 Backend ugovor
- [ ] F2 Grupni inbox
- [ ] F3 Svi tiketi (lista)
- [ ] F4 Detalji (+ F4b forwarding, F4c templates)
- [ ] F5 Novi tiket
- [ ] F6 Vizuelni paritet
- [ ] F7 Toast
- [ ] F8 Testovi, matrice, CI
```
