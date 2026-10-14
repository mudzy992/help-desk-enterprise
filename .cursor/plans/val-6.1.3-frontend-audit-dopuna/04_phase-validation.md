# Faza 4 — provjere i predaja (završena 2026-10-14)

## Izvršeno
Iz `frontend/`:
- `npm run lint` — exit 0, 0 grešaka / 12 `react-hooks/exhaustive-deps` upozorenja.
- `npm run format:check` — prolazi.
- `npx tsc -b` — prolazi.
- `npx vitest run` — 247 fajlova, 1000/1000 testova.
- `npm run build` — prolazi; Vite prijavljuje chunk-size warning (>500 kB).

Iz root-a:
- Svih 11 produkcijskih `scripts/check-*.mjs` guardova prolazi.
- Ticket translation guard: 572 ključa + 5 dinamičkih prefiksa (bs/en); Pulse guard i i18n parity prolaze.
- `node --test scripts/*.test.mjs` — 35/35.
- `git diff --check` — prolazi.

## Dokumenti/statusi
- Audit 03: svaki T1–T26 ima status/dokaz; T18/T23 imaju dokumentovan zaključak istraživanja bez koda.
- Auditi 01/02: svaki B/A ID ima status/dokaz ili datirani prihvaćeni rizik; A2 i B22 QA ograničenja su eksplicitna.
- Plan 6.1 §1 i redovi 6.1.1–6.1.3 ažurirani. Moduli 04+ nisu mijenjani osim opšte policy odredbe.
- TASKS: audit `[x]`; E2E kritični tokovi vraćeni kao aktivni `[~]`, cookie fallback/spec 37/39 ostaju otvoreni.

## Neizvršeno / bez tvrdnje da je prošlo
- A2 browser QA nije izvršena; Docker i `e2e/.env` nisu dostupni.
- Browser/E2E specs 37/39 nisu pokrenuti; B22 Playwright preview koristio je mock API i pokrivao samo header crop.
- T25 backend audit-event emission nije provjeren. Build size warning i 12 lint warnings su zabilježeni.

No commit/push/PR. Predložene commit poruke se daju korisniku; ništa se ne commit-uje bez eksplicitnog zahtjeva.
