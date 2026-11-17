# W7.23 — BA-problems-05: per-ticket autorizacija pri group rješavanju

**Status: implementacija kompletna; čeka automatski CI gate i korisničku vizuelnu provjeru.** `problem.close` je sada delegacija samo nad tiketima koji su u trenutku upisa stvarno povezani s tim problemom, dok je problem `RESOLVED`, a korisnik i dalje ima problem permisije u OU problema i autoritet u problem grupi. Povjerljivi tiketi nikad nisu pokriveni delegacijom — traže vlastiti ticket/confidential pristup. Nema migracije i nema promjene API shape-a.

## Triage

BA-problems-05 (P1), audit [23-problems.md](../audits/23-problems.md) §6:

> `problem.close` se tretira kao delegacija za svaki linked ticket „whatever unit it came from“. Kada viewer ima permission, `candidates` potpuno preskače `loadAccessibleTicket`; group membership nad problemom postaje pravo preuzimanja i rješavanja svih ticketa, uključujući confidential/foreign ticket kojem viewer više nema pristup. […] Delegacija mora biti scope-aware, eksplicitno zabilježena i provjerenja po ticketu u trenutku writea.

W7.21 je već sveo kandidate na centralni ticket read predikat, ali je delegacija i dalje bila potpuni bypass: `loadAccessibleTicket`, `getTicket` i `updateTicket` su preskakali ticket access kad je `problemDelegation` prisutan, pa je manager mogao zatvoriti povjerljiv tiket, tiket iz druge OU bez ticket prava, ili tiket kojem je u međuvremenu izgubljen pristup.

**Odluka vlasnika (2026-11-16, `ask_user`):** zadržava se cross-OU rješavanje povezanih tiketa (delegacija je namijenjena upravo tiketima iz različitih OU), ali uz stroge uslove — povezanost s problemom, `RESOLVED` problem, problem permisije u OU problema, group authority, bez povjerljivih/arhiviranih/merged tiketa i provjera pri svakom upisu. Povjerljivi tiket i dalje traži vlastiti pristup.

Dio §6 o tome da se problem commit-a `RESOLVED` prije bulk ticketa (durable retry/resume) pripada **BA-problems-06** i ovdje nije mijenjan.

## Implementacija

- **Nova provjera** (`backend/src/modules/tickets/problem-delegation.ts`): `assertProblemDelegation(prisma, { problemId, ticketId, actorUserId })` redom provjerava:
  1. `problemTicket` veza za taj problem i tiket još postoji (inače `FORBIDDEN`),
  2. problem postoji i status mu je `RESOLVED`,
  3. principal postoji i aktivan,
  4. `problem.read`, `problem.manage` i `problem.close` su grantovani,
  5. svaki od tih opsega pokriva OU problema (`resolveAssetScope` + `isPathInScope`, home-unit fallback),
  6. korisnik je član grupe problema — osim installation-wide ADMIN/SUPER_ADMIN.
  Sve grane su fail-closed (`TicketsError('FORBIDDEN')`), bez oracle-a o razlogu.
- **`loadAccessibleTicket`**: delegacija se primjenjuje samo za ne-povjerljive tikete i tek nakon `assertProblemDelegation`; povjerljivi tiket ide kroz redovni `resolveTicketActorAccess` (confidential policy + staff/requester provjera).
- **`getTicket`**: delegirani read vraća tiket samo za ne-povjerljive uz istu provjeru; povjerljivi tiket prolazi redovne `assertTicketVisibleOrMergedRequester` + `assertConfidentialTicketAccess` provjere (uključujući postojeći confidential audit).
- **`updateTicket`**: `assertTicketVisible` se preskače samo kad je delegacija stvarno primijenjena (`problemDelegation` + ne-povjerljiv tiket); `assertPatchTicketStatus` dobija `delegated` samo u tom slučaju. Change-log razlog je tada novi `ticket_problem_resolution` umjesto `ticket_update`, pa je delegirani upis eksplicitno zabilježen u historiji tiketa.
- **Group resolution** (`problem-resolution.service.ts`):
  - preview označava povjerljive tikete kao `no_access` osim kad korisnik ima vlastiti staff pristup (provjera ide kroz `loadAccessibleTicket` bez delegacije),
  - prije takeover upisa (PENDING/UNROUTED/ASSIGNED) ponovno se dokazuje autorizacija: delegacija za ne-povjerljive, vlastiti writable pristup za povjerljive; bez toga tiket pada u `failed` i **ne** dolazi do takeovera, promjene statusa ni poruke.
- **Nepromijenjeno:** transakcioni obrazac takeovera, problem event/audit `tickets_resolved`, `problem.close` gate na ulazu, W7.21 read predikat i redoslijed „status pa poruka”. Nema DTO/route/frontend promjena.

## Testni dokaz

- **`problem-delegation.spec.ts` (novo, 8 testova)**: odvezan tiket odbija se prije čitanja problema; problem koji nije `RESOLVED` ili ne postoji; nedostajući/neaktivni principal; nedostaje `problem.close`; OU izvan opsega i `null` OU; nedostatak članstva u grupi i problem bez grupe; član sa scoped permisijama prolazi; installation-wide ADMIN preskače članstvo ali ne i permisiju.
- **`problem-resolution.service.spec.ts` (13 testova, 3 nova)**: povjerljivi tiketi se nikad ne delegiraju (jedan prolazi vlastitim pristupom, drugi je `no_access`), revokacija tokom izvršenja pada u `failed` za taj tiket bez zaustavljanja ostalih, takeover se ne izvršava kad delegacija padne.
- **`problem-delegation.integration.spec.ts` (novo, PostgreSQL + stvarni principal/role/group redovi, registrovano u `scripts/run-isolated-integration.mjs`)**: manager problem grupe prolazi za povezani tiket iz druge OU; odbijeni su nepovezan tiket, tiket drugog problema, problem koji je napustio `RESOLVED`, korisnik bez permisija i korisnik bez članstva; revokacija `GroupMember` trenutno gasi delegaciju; `loadAccessibleTicket` daje staff pristup za delegirani ne-povjerljivi tiket, odbija povjerljivi tiket bez vlastitog pristupa i odbija tiket koji nije povezan s navedenim problemom.
- Lokalno: ciljane suite prošle s `ts-jest diagnostics:false` (`problem-delegation`, `problem-resolution.service`, `get-ticket`, `problem-tickets.service`, `ticket-playbooks`, 43 testa u potonjim) i ESLint je čist; puni `tsc`/Prisma generisanje nisu izvedivi lokalno.

## Lokalna ograničenja

- Lokalni `prisma generate` pada na TLS-u prema `binaries.prisma.sh`, pa suiteovi koji uvoze generisani klijent (uključujući novu integracionu) rade samo u CI-ju.
- Integraciona suite je pisana protiv šeme iz `prisma/schema/*`; prvo izvršavanje je u CI PostgreSQL poslu.

## Preostali rizici (dokumentovani, nisu blokada zatvaranja)

- **Cross-OU delegacija ostaje moguća** (odluka vlasnika) — namjerno; granica je povezanost + group authority + OU problema, ne ticket OU.
- **Takeover je interni servisni poziv** (`TicketsService.takeOverForProblem`) bez vlastite autorizacije; poziva se isključivo iz group resolution i sada tek nakon ponovne provjere. Novi pozivalac mora ponoviti istu provjeru.
- **Djelomični ishod** ostaje moguć: tiket koji padne autorizaciju ide u `failed` sa kodom, ostali se rješavaju; durable retry/resume je `BA-problems-06`.
- **Poruka nakon statusa** i `messageSent=false` ponašanje nije mijenjano (dio `BA-problems-06`).
- **Performanse**: po tiketu se dodaje nekoliko upita (veza, problem, principal, membership) pri svakom upisu; bulk limit ostaje konfigurabilan.
- **Installation-wide ADMIN** preskače članstvo grupe (postojeći model problem autoriteta), ali ne i permisije — nije mijenjano.

## Commitovi i CI

_(popunjava se nakon pusha)_

## Korisnička vizuelna provjera (prije zatvaranja)

Priprema: problem u statusu `RESOLVED` s najmanje tri povezana tiketa — jedan iz druge OU (običan), jedan povjerljiv, jedan koji korisnik ne smije vidjeti. Korisnik A: `problem.read/manage/close` + članstvo u problem grupi; korisnik B: bez članstva u toj grupi.

1. Kao **A** otvoriti problem → „Riješi tikete“ (preview). Očekivano: običan tiket iz druge OU je u listi za rješavanje; povjerljivi je `no_access` (osim ako A ima vlastiti pristup).
2. Kao **A** izvršiti group rješavanje sa porukom. Očekivano: običan tiket je `RESOLVED` i dobija javnu poruku; povjerljivi ostaje nepromijenjen; u historiji tiketa stoji razlog „problem resolution“.
3. Kao **A** otvoriti tiket iz druge OU koji je povezan s problemom. Očekivano: pristup radi dok je problem `RESOLVED`; nakon što se problem vrati u `INVESTIGATING`, isti tiket se više ne može mijenjati kroz problem (i preview ga označava kao nedostupnog).
4. Kao **B** (bez članstva u problem grupi) pokušati group rješavanje. Očekivano: `403`/zabrana, bez promjena na tiketima.
5. Ukloniti A iz problem grupe (Administracija → Grupe) i ponoviti rješavanje. Očekivano: zabrana, nijedan tiket nije promijenjen.
6. Provjeriti da tiket koji nije povezan s problemom nije diran ni u jednom koraku.

Format odgovora: **DA / NE / N/A** po tački.
