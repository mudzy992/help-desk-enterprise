# Package closeout — W7.23

**Paket:** W7.23 — per-ticket autorizacija pri group rješavanju<br>
**Nalaz:** `BA-problems-05` (P1) — implementacija i testni dokaz kompletni; zatvaranje čeka korisničku vizuelnu provjeru<br>
**Kodni commit:** `040add6`<br>
**Finalni testani SHA:** `e77e1e6`<br>
**CI:** [`44043856970`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44043856970) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Audit [23-problems.md](../audits/23-problems.md) §6: `problem.close` se tretira kao delegacija za svaki povezani tiket, a `candidates`/write putanje preskaču ticket access. Group membership nad problemom postaje pravo preuzimanja i rješavanja svih ticketa, uključujući povjerljive i one kojima manager više nema pristup. Zahtjev audita: delegacija mora biti scope-aware, eksplicitno zabilježena i provjerena po tiketu u trenutku upisa.

Acceptance: delegacija vrijedi samo za tikete koji su u trenutku upisa stvarno povezani s tim problemom, dok je problem `RESOLVED`; korisnik mora imati `problem.read`/`problem.manage`/`problem.close` u OU problema i autoritet u problem grupi; povjerljivi tiket nikad nije pokriven delegacijom; svaki delegirani upis je zabilježen u historiji. Cross-OU rješavanje ostaje moguće (odluka vlasnika), ali bez ikakvog ticket-scope bypassa za povjerljive tikete i bez djelovanja na nepovezane tikete. Durable retry/resume i problem `RESOLVED`-prije-tiketa ostaju `BA-problems-06`.

**Odluka vlasnika (2026-11-16, `ask_user`):** zadržati cross-OU delegaciju za povezane tikete uz stroge uslove (opcija „linked_scope“); odbačeno je strogo traženje ticket staff pristupa za svaki tiket jer bi ukinulo namjenu problem managera da rješava tikete iz više OU.

## Implementacija

- `backend/src/modules/tickets/problem-delegation.ts` (novo): `assertProblemDelegation` provjerava vezu `problemTicket`, `RESOLVED` status problema, aktivan principal, tri problem permisije, OU opseg svake permisije prema OU problema i članstvo u problem grupi (ADMIN/SUPER_ADMIN installation-wide preskaču članstvo). Svaka grana je fail-closed `FORBIDDEN`.
- `load-accessible-ticket.ts`: delegacija se primjenjuje samo za ne-povjerljive tikete i nakon provjere; povjerljivi tiket ide kroz redovni `resolveTicketActorAccess`.
- `get-ticket.ts`: isto za read putanju; povjerljivi tiket prolazi redovne visibility/confidential provjere (uključujući postojeći confidential audit).
- `update-ticket.ts`: `assertTicketVisible` i `delegated` status-transition bypass važe samo kad je delegacija stvarno primijenjena; change-log razlog je `ticket_problem_resolution` (novo u `tickets.constants.ts`), inače `ticket_update`.
- `problem-resolution.service.ts`: preview označava povjerljive tikete kao `no_access` osim uz vlastiti staff pristup; prije takeover upisa ponovno se dokazuje delegacija (ili vlastiti writable pristup za povjerljive), pa neuspjeh ne ostavlja takeover/promjenu statusa/poruku.
- Nema promjena DTO-a, ruta, frontenda, šeme ni migracije. Error contract: `FORBIDDEN` u ticket putanjama; agregate i problem event/audit `tickets_resolved` zadržani.

## Direktni testni dokaz

- `backend/src/modules/tickets/problem-delegation.spec.ts` (novo, 8 testova) — nepovezan tiket, problem koji nije `RESOLVED`/ne postoji, nedostajući i neaktivni principal, nedostajuće permisije, OU izvan opsega i `null` OU, manjkavo članstvo i `groupId = null`, uspješan scoped član, ADMIN bypass članstva bez bypassa permisija.
- `backend/src/modules/problems/problem-resolution.service.spec.ts` (13 testova, 3 nova) — povjerljivi tiket nikad delegiran (vlastiti pristup radi, bez pristupa `no_access`), revokacija tokom izvršenja daje `failed` za taj tiket bez zaustavljanja ostalih, takeover se preskače kad provjera padne.
- `backend/src/modules/tickets/problem-delegation.integration.spec.ts` (novo, PostgreSQL, registrovano u `scripts/run-isolated-integration.mjs`) — stvarni permission/role/userRole/group/groupMember/problem/ticket redovi: manager prolazi za povezani tiket iz druge OU; odbijeni su nepovezan tiket, tiket drugog problema, problem van `RESOLVED`, korisnik bez permisija i bez članstva; revokacija članstva momentalno gasi delegaciju; `loadAccessibleTicket` daje staff pristup delegiranom ne-povjerljivom tiketu, odbija povjerljivi bez vlastitog pristupa i odbija nepovezani tiket.
- Popratne suite (`get-ticket`, `problem-tickets.service`, `ticket-playbooks`, `knowledge-portal.from-reply`) — 43 testa prolaze; lokalno samo suiteovi koji uvoze generisani Prisma klijent ne mogu startati.

## CI i testni dokaz

CI run [`44043856970`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44043856970) na `e77e1e6`:

- **Backend:** generisani Prisma + `check:prisma-generated`, build/lint, full Jest — success.
- **PostgreSQL/Redis integration:** `npm run test:integration` — success, uključujući novu `problem-delegation.integration.spec.ts` i postojeću problems matricu.
- **Frontend:** lint/format/test/build i budget — success (bez frontend izmjena).
- **Docs/CI gate/container:** docs guard, container + supply chain i CI gate — success.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory` i uslovni high/critical image enforcement — skipped po konfiguraciji workflowa, ne passed.
- **Neuspjeli pokušaji:**
  - [`44041796410`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44041796410) na `040add6` — vlastita greška `TS2345` u `problem-resolution.service.spec.ts` (`Promise<{}>` nije `Promise<void>`), popravljena u `e77e1e6`; PostgreSQL/Redis integracija je u tom runu već bila success.
- Perf smoke na finalnom SHA nije pokrenut jer commit mijenja test fajl; posljednji Perf za prethodni paket (`43881288118`) bio je success.

Dodatne lokalne provjere i ograničenja: ciljane mock suite prošle su s `ts-jest diagnostics:false` (21 test u dvije nove/izmijenjene suite), ESLint čist, `check-docs-content` OK, `check-backend-findings` 694/694. Lokalni `prisma generate`/puni `tsc` nisu izvedivi (TLS prema Prisma binaries), pa je mjerodavan CI.

## Registar nalaza

- Zatvoreni: `BA-problems-05` uz zeleni CI; statusna oznaka `zatvoreno (W7.23)`, konačna potvrda čeka vizuelnu provjeru.
- Ostaju otvoreni: `BA-problems-06` (durable bulk resolution), `BA-problems-07`, ostali P2/P3 audita 23 i svi nalazi audita 24–27.
- Kontrolni zbir: registar **458 otvoren / 236 zatvorena / 694**; audit/plan **448 / 246 / 694** (P1 174, P2 370, P3 150 nepromijenjeno). Val 7 **25/109**, **84 otvorena (15 P1 / 49 P2 / 20 P3)**; problems **5/19** (2/9/3 = 14 otvorenih).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Deploy je aplikacijski; nema backfilla ni manualnih koraka. API kompatibilnost: rute i shape nepromijenjeni; mijenja se odluka o dozvoli (403/`no_access`) za delegirane upise i dodaje se change-log razlog `ticket_problem_resolution`. Rollback = prethodni build; podaci nisu dirani.

## Preostali rizici

- Cross-OU delegacija ostaje namjeravan ishod; granica je povezanost + problem permisije/OU + group authority, ne ticket OU.
- `TicketsService.takeOverForProblem` je interni poziv bez vlastite autorizacije; group resolution ga zove tek nakon ponovne provjere — novi pozivalac mora ponoviti provjeru.
- Djelomični ishod (neki tiketi `failed`) ostaje moguć; durable retry/resume je `BA-problems-06`.
- Poruka nakon statusa i `messageSent=false` ponašanje nije mijenjano (`BA-problems-06`).
- Po tiketu se dodaje nekoliko upita pri upisu; bulk limit ostaje konfigurabilan.
- Installation-wide ADMIN preskače članstvo grupe ali ne permisije (postojeći model, nije mijenjan).

## Sljedeći paket

**W7.24 — `BA-problems-06` (P1):** problem se ne smije trajno commit-ati kao `RESOLVED` prije bulk ticketa bez durable, ponovljive putanje (persisted run/item status, idempotency, retry/resume i jasan completion kriterij). Nije započet prije zelenog gatea i korisničke vizuelne potvrde za W7.23.
