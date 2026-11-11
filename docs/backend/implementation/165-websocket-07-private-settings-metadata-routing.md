# W6.50 — BA-websocket-07: privatno rutiranje metadata postavki

**Audit nalaz:** `BA-websocket-07` (P2), [audit 18 §12 — registar](../audits/18-websocket.md#12-registar-nalaza), [§14 — nalaz 07](../audits/18-websocket.md#14-ostali-nalazi-i-korekcije) i [§25 — status](../audits/18-websocket.md#25-w6-50-implementation-status-ba-websocket-07-2026-10-29)
**Scope:** samo privatnost realtime `settings.updated` signala i rutiranje privatnog ključa; bez zatvaranja susjednih nalaza.
**Status:** zatvoreno (2026-10-29) operativnom potvrdom vlasnika uz CI dokaz; vidi audit 18 §30.

## Implementacija

- `settings.updated` ostaje globalni invalidation signal za postojeće klijente, ali payload sadrži samo `occurredAt`. Ne izlaže `key`, `visibility` ni `invalidatesSession` svim autentifikovanim socketima.
- Za postavke čija vidljivost nije `public`, puni metadata payload (`key`, `visibility`, vrijeme i session-invalidating oznaka) šalje se odvojeno pod `settings.private-metadata.updated`, samo u postojeći `role:admins` room. Taj room se dodjeljuje na osnovu serverskog role snapshot-a i uklanja pri socket room revalidaciji.
- `role:admins` je uži od `settings.read`; ne uvodimo novu settings-permission sobu. Ne-admin korisnik s `settings.read` dobija samo keyless signal i promjene može ponovo učitati preko autorizovanog HTTP API-ja.
- Ako promjena poništava sesije, `session.invalidated` i dalje ide svim socketima, ali nosi samo `occurredAt`, bez ključa ili druge metadata vrijednosti.
- Frontend već koristi `settings.updated` kao signal za invalidaciju settings podataka i ne čita payload key; zato keyless signal zadržava postojeći refresh ponašaj bez frontend promjene.

## Ciljani dokaz i granice

- `broadcast-user-realtime.spec.ts` provjerava da globalni signal nema ključ, da se private/secret metadata šalje samo u admin room i da je session invalidation globalna, ali bez ključa. Public setting ne proizvodi admin metadata event. Zajedno sa `socket-room-revalidation.spec.ts`, targeted Jest je prošao **2 suitea / 18 tests** (`diagnostics:false`). Targeted ESLint je passed.
- Docs guard je prošao (**32 stranice / 8 prevoda / 10 provjera**), guard testovi **9/9**, a `git diff --check` je prošao.
- Puni `tsc --noEmit` nije prošao: sandbox nema generated Prisma Client (3.790 diagnostics ukupno), bez dijagnostika u BA-07 ciljanim putanjama. Nema CI, Redis ili deployment tvrdnje. `BA-websocket-07` ostaje **otvoren**; globalni finding brojevi i Val 6 acceptance status nisu izmijenjeni.
- Provjera ne mijenja API authorization, settings registry/value, role membership model, schema ili migracije. Ne mijenja `BA-websocket-06` ni druge nalaze.
