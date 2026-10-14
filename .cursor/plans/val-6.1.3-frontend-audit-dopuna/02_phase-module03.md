# Faza 2 — Modul 03: Tiketi (završena 2026-10-14)

## Konačni status
T1–T26 imaju konačni status/dokaz u `audit/frontend/03-tickets.md`. Funkcionalne stavke su implementirane i pokrivene testom/guardom gdje je primjenjivo. T18 (navigacijska gustoća) i T23 (Profiler) su zaključene istraživačkim napomenama bez koda; nisu predstavljene kao QA/performance pass.

## Ključni zatvoreni rad
- T1/T26: latest-request gate i silent realtime refresh cache invalidation.
- T2/T13/T14/T19: debounce/filter empty states, responsive cards, frontend group inbox pagination koristeći postojeći backend metadata.
- T3/T12/T21: paralelna detail data load, odvojene/retryable panel greške i izolovani ErrorBoundary.
- T4/T20: typed translations/BS+EN CI guard, lint/format, ticket hook warnings/suppressions cleanup.
- T5/T6/T16: veći list/detail/composer/time tracking kod podijeljen u module; stabilan detail target/regression test. `TicketListPage`/`TicketListStandardView`, table/header/row i service picker/options su manji UI moduli.
- T9: `CreateTicketForm` je tanki view; model, safe draft persistence i service-form loading su zasebni hookovi.
- T7/T8/T9/T10/T11/T15/T17/T22/T24/T25: async template persistence guard, send/refresh split, safe per-ticket drafts, KB fallback, shared cache, server policy, localized dates, explicit async actions/focus cleanup, staff-capability gating, permission-gated audited export hint.

## Regresije/validacija
- T7 test čeka asinhroni template response i dokazuje da je tekst unesen tokom čekanja sačuvan.
- `use-ticket-detail.spec.ts` dokazuje da lokalni state update ne pokreće novo učitavanje i da promjena ticket ID-ja učitava novi detalj.
- Puni frontend Vitest: 247 fajlova / 1000 testova.
- Nema backend promjene. T25 backend audit-event emission nije verifikovan; ne tvrditi da jeste.
- Browser/E2E suite nije pokrenut; E2E cookie fallback/TODO ostaje otvoren do specs 37/39.

## Pravilo rada
Svaki bug-fix je dobio regresioni Vitest gdje je primjenjivo; novi vidljivi stringovi imaju BS+EN. Pulse komponente/tokene po postojećim primitivima. Nema commita bez izričitog zahtjeva vlasnika.
