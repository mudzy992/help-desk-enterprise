# F1 — Backend ugovor (slojevi)

| Sloj | Sadržaj | GAP | Stanje |
|---|---|---|---|
| 0 | Plan folder, odluke | — | urađeno |
| 1 | Nazivi u odgovoru (`originUnitName/Path`, `serviceName`), FE tipovi, `DOWN` | DAT-01 | urađeno |
| 2 | Atomičan claim, 409, bez take-overa | INB-07 | urađeno |
| 3 | `ListTicketsQueryDto` + `buildTicketListFilters`, predikat vidljivosti u `where`-u, `{items,total,page,pageSize}`, sort, export na isti builder, FE `listTicketsPage` | DAT-01, LST-05/06 | urađeno (potrošači: vidi odstupanja) |
| 4 | `GET /tickets/counts` | INB-09, LST-03 (izvor) | otvoreno |
| 5 | Inbox paginacija + sort po SLA, `GET /groups/mine` (zaseban kontroler prije `GroupsController`) | INB-08, DAT-02 | otvoreno |
| 5b | `Group.autoAssignStrategy` (F1-2) | INB-02 | otvoreno |
| 6 | `POST /tickets/routing-preview`, `approvalSteps`, realtime payload, zatvaranje matrica | NEW-04/05 | otvoreno |

Pravila: svaki sloj završava zelenim `tsc -b` i jestom + prijedlogom commit poruke; fajlovi ≤150 linija; matrice i CHANGELOG uz svaku promjenu logike.
