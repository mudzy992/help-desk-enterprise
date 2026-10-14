# Faza 3 — Closeout modula 01 i 02 (završena 2026-10-14)

## Modul 01
- B1–B22 imaju konačni status/dokaz u `audit/frontend/01-ljuska-routing-navigacija.md`.
- Gap 8 ostaje datirani **Prihvaćen rizik**: vlasnik je odlučio zadržati 15 `RequireAccess` blokova; reason/odbijena route-registry alternativa su dokumentovani.
- B22 screenshot-i su u `audit/frontend/assets/module-01-header-360.png` i `module-01-header-390.png`; mock preview mjerio širine i bez page errors, ali slike su samo header crop (56 px), ne cijeli ticket list/backend QA.

## Modul 02
- A1–A25 imaju konačni status/dokaz u `audit/frontend/02-auth-i-sesija.md`.
- A2: code fix je zatvoren; browser QA nije izvršen zbog nedostupnog Docker/`e2e/.env` i ostaje datirani prihvaćeni rizik, nikad „passed“.
- A8: app session token je HttpOnly cookie; MSAL cache ostaje u `sessionStorage`; `memoryStorage`/deprecated `storeAuthStateInCookie` se ne koriste.
- A14 fail-open je zadržan i testiran; A15 login split je odgođen kao datirani prihvaćeni rizik.
- A23 pregled bez izmjena; A24 dokumentacija-only, bez CSP/infra izmjena; A25 backend guard/test potvrđeni.
- E2E bearer cookie fallback/TODO ostaje dok cookie-enabled deployment ne prođe spec 37/39.

Nema daljnje implementacije u ovoj fazi. Bez commita bez izričitog zahtjeva vlasnika.
