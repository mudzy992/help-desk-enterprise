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
