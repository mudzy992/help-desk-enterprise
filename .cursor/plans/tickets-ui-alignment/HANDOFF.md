# HANDOFF — tickets-ui-alignment

## Urađeno
F1 slojevi 0–2 (vidi `CHANGELOG.md`).

## Test status
Pisano bez `node_modules`/Prisma klijenta: `jest` i `tsc -b` nisu pokrenuti u tom okruženju. Specovi su izvršeni kroz privremeni CommonJS runner uz stubove (ticket specovi: isti 4 pada prije i poslije, novi prolaze). **Prije commita pokreni `npm run build` i `jest` u `backend/` i `npm run build` u `frontend/`.**

## Next
Sloj 3 (lista). Prije koda pročitati `tickets/export/*`, `saved-views/*`, `use-sla-page-data.ts`.

## Otvoreno
- D1, D3–D10 nisu odlučeni (F0).
- `int.spec.ts` set nad Postgresom (F1-6) počinje u sloju 3.
