# HANDOFF — tickets-ui-alignment

## Urađeno
F1 slojevi 0–3 (vidi `CHANGELOG.md`).

## Test status
Pisano bez `node_modules`/Prisma klijenta: `jest`, `tsc -b` i `vitest` nisu pokrenuti u tom okruženju. Specovi su izvršeni kroz privremeni CommonJS runner uz stubove: ticket specovi prolaze uz iste 4 poznate pada shima kao prije izmjena. **Prije commita pokreni `npm run build` i `jest` u `backend/` te `npm run build` i `npm test` u `frontend/`.** Prisma tipovi (`Prisma.TicketWhereInput`, `TicketOrderByWithRelationInput`, `updateMany`, `orderBy` po relaciji `slaState`) nisu provjereni protiv pravog klijenta.

## Ograničenje testova sloja 3
Paritet vidljivosti i paginacija izvršavaju `where` kroz in-memory evaluator, ne kroz Postgres. Dokazuju logiku predikata (mutacijska provjera: 16/16 mutacija predikata i 6/6 mutacija paginacije obara spec), ali ne dokazuju SQL semantiku ni performanse. Za to služi sloj 3b.

## Next
Sloj 4 (`GET /tickets/counts`, isti builder). Zatim inbox + `/groups/mine` (5), `Group.autoAssignStrategy` (5b), routing preview + `approvalSteps` + realtime (6).

## Otvoreno
- D1, D3–D10 nisu odlučeni (F0).
- Sloj 3b (`int.spec.ts`): pokrenuti lokalno uz Postgres; provjeriti (1) paritet vidljivosti na pravoj bazi, (2) `orderBy` po `slaState.resolutionDueAt` i redoslijed NULL-ova (Postgres: NULL zadnji za `asc`), (3) `contains`/`mode: 'insensitive'` s `%`/`_` u `q` (Prisma možda ne escapeuje wildcarde), (4) EXPLAIN: indeksi za sort/filter (Ticket ima samo jednokolonske; složeni tek ako plan pokaže potrebu), (5) 1000 tiketa < 300 ms i bez N+1.
- Odgovor liste od 1000 tiketa < 300 ms (RAW NFR) nije izmjeren.
