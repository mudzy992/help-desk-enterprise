# Package closeout — W7.21

**Paket:** W7.21 — problem i povezani tiketi<br>
**Nalaz:** `BA-problems-02` (P1) — zatvoren<br>
**Kodni commit:** `fb41c66`<br>
**Finalni testani SHA:** `fb41c66c884a706a3262520e28e54d9e56089cb5`<br>
**CI:** [`43872624265`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43872624265) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

Pristup jednom povezanom tiketu otkrivao je puni problem (opis, RCA, workaround, resolution, vlasnike) i metapodatke svih ostalih povezanih tiketa, uključujući broj dostupnih tiketa. Vlasnik je odredio: puni zapis, analiza i historija samo unutar `problem.read` OU opsega; radnik na tiketu izvan opsega dobija minimalnu ticket karticu i workaround; prijavitelj nema trajni izuzetak; nedostupni povezani tiketi ne otkrivaju se ni kroz broj. Acceptance: sve direktne i izvedene površine poštuju isti predikat, filtriranje ide prije limita i agregiranja, a write putanje ne daju ovlast koju read opseg ne pokriva.

Susjedni nalazi `BA-problems-03` i `BA-problems-05`–`19` ostaju otvoreni; `BA-problems-04` (W7.20) nije mijenjan.

## Implementacija

- **Puni zapis** (`problem-visibility.ts`): pristup samo preko OU opsega permisije; uklonjeni linked-ticket i reporter bypass; prazan opseg je nemoguć ID skup umjesto NUL sentinela.
- **Lista i detalj** (`problems.service.ts`): vidljivi ukupni/otvoreni brojači nakon ticket-predikata, bez nefiltriranog `_count.tickets`; create/update traže jedinicu u `problem.report` i `problem.read` opsegu, a odabir jedinice iz tiketa filtrira tikete po vidljivosti.
- **Povezani tiketi** (`problem-tickets.service.ts`): centralni ticket-list predikat u SQL-u prije limita i brojeva; minimalna kartica sa `canOpen`; `canUnlink` traži read i report opseg.
- **Historija problema**: `ticket_linked`/`ticket_unlinked` samo za trenutno čitljiv tiket; `tickets_resolved` agregati i nepoznate akcije se izostavljaju fail-closed; stranice od 200 dok se ne prikupi limit.
- **Ticket historija** (`redact-problem-event-bodies.ts`): novi zapisi bez identiteta problema; stari `action:<problemId>|<number> <title>` zapisi rediguju se pri čitanju bez `problem.read` opsega.
- **Resolution**: preview i izvršenje obrađuju samo tikete iz ticket-predikata i traže `problem.read` uz `problem.manage`/`problem.close`; delegacija više ne obuhvata nevidljive tikete.
- **Izvedeni podaci**: CMDB prijedlozi filtrirani prije grupisanja i limita; report packovi i `problem_recurrence` filtriraju prije agregacije; zakazani prilozi grade se zasebno po primaocu.
- **Privacy izvoz**: problem dio ZIP-a ograničen presjekom opsega subjekta i administratora; bez opsega nema zapisa (vlasnička odluka, uz dokumentovan uticaj na potpunost).
- **Change veze**: detalj i povezivanje traže čitljiv problem; historija ne prikazuje `problemId`; reverse lista bez pristupa vraća prazno.
- **Notifikacije**: primaoci se provjeravaju po trenutnom principalu i OU opsegu; recurrence sadržaj i dedupe ključ ne nose brojeve tiketa.
- Error contract: izvan opsega pristup se ponaša kao nepostojeći zapis/tiket, bez novih kodova. Nema izmjene API shapea osim izostavljanja nedostupnih stavki i brojeva.

## Direktni testni dokaz

- `problem-ticket-visibility.spec.ts`, `problem-tickets.service.spec.ts`, `problem-counts.spec.ts`, `problem-events-visibility.spec.ts`, `problem-links.service.spec.ts`, `problem-resolution.service.spec.ts`, `problem-notifier-visibility.spec.ts`, `problem-principal-scope.spec.ts`, `redact-problem-event-bodies.spec.ts`, `load-problem-report-visibility.spec.ts` — 47 ciljanih mock testova; fail-closed slučajevi za nedostupnu vidljivost, nedostupne/obrisane tikete, agregate i strane primaoce.
- `problem-ticket-unlink.integration.spec.ts` (PostgreSQL): staff/requester/strani gledalac nad običnim i povjerljivim tiketom; brojači liste i detalja, historija, resolution preview i report agregati; registrovana u `scripts/run-isolated-integration.mjs`.
- Korisnička vizuelna provjera: **P1 DA, P2 DA, P3 DA, P4 DA**.

## CI i testni dokaz

CI run [`43872624265`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43872624265) na `fb41c66`:

- **Backend:** Prisma validate/generate, build, lint, full Jest i safety-net suite — passed.
- **PostgreSQL/Redis integration:** replay svih migracija kroz single-owner migrator, DDL denial, connection budget, backup/restore RPO/RTO, realne integracijske suite — passed.
- **Frontend:** lint, format, testovi, build i bundle/cold-route budget — passed.
- **Docs/CI gate/container:** docs guard, container hardening, SBOM, vulnerability inventory, signed provenance i CI gate — passed.
- **Skipped:** `E2E critical flows`, `E2E install wizard`, `Read-only service-form pattern inventory` i korak `Enforce zero high/critical image vulnerabilities` (scanner actionable count 0). Skipped nije passed; full E2E critical ostaje za kraj vala ili scheduled run.
- **Neuspjeli pokušaji:** nema u ovom paketu. Raniji CI runovi paketa [`43855516535`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43855516535), [`43857849016`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43857849016), [`43860274112`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43860274112), [`43861927777`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43861927777), [`43869006635`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43869006635) i [`43870890089`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43870890089) su također zeleni.

Dodatne lokalne provjere i ograničenja: 47 ciljanih mock testova i ESLint za izmijenjene fajlove prolaze; `node scripts/check-backend-findings.mjs` daje 694/694. Lokalno nisu izvedeni `prisma generate` (TLS prekid prema binaries.prisma.sh) ni PostgreSQL integracija, pa lokalni `tsc` i dvije šire suite (`reports.service.spec.ts`, `change-access.service.spec.ts`) nisu lokalno potvrđeni; CI ih je pokrenuo i prošao. Lokalni HEAD je nakon svakog prekida platforme vraćan na početni commit; prije svakog `reset --mixed` dokazana je identičnost treea sa originom.

## Registar nalaza

- Zatvoreni: `BA-problems-02` (P1, W7.21).
- Ostaju otvoreni: `BA-problems-03`, `BA-problems-05`–`19`; cijeli Val 7 osim zatvorenih.
- Kontrolni zbir: source/plan **450 otvoren / 244 zatvorena / 694 ukupno**; globalni registar **460 / 234 / 694**; Val 7 **23/109 zatvoreno, 86 otvoreno (17 P1 / 49 P2 / 20 P3)**. Deset ranijih statusnih divergencija registra ostaje netaknuto.

## Migracija, rollout i rollback

**Nema migracije.** Nema schema promjene; postojeći `ProblemVisibility` predikat i ticket-predikat se samo primjenjuju na više površina. API kompatibilnost: nedostupni tiketi, brojevi i historijski zapisi jednostavno izostaju; poznati klijenti (problems/tickets UI) su već prilagođeni ranijim commitovima ovog paketa. Rollback je vraćanje commita; nema podataka za migraciju ni backfill.

## Preostali rizici

- Već isporučene notifikacije, e-mailovi i ranije izgrađeni privacy ZIP-ovi nisu retroaktivno redigovani.
- Historija s velikim brojem nedostupnih događaja može zahtijevati više upita prije popunjavanja limita.
- Grupno rješavanje preskače tikete koje gledalac ne vidi (namjerna promjena); TOCTOU između previewa i izvršenja i puna HTTP role/scope matrica nisu posebno testirani.
- Treperenje kartice „Povezano i tok” je zaseban UX follow-up iz [239](239-w720-problem-ticket-unlink.md).

## Sljedeći paket

**W7.22 — još nije odabran.** Prioritet je 17 preostalih P1 nalaza, počevši od `BA-problems-03` i `BA-problems-05`–`07` ili P1 authorization/visibility nalaza u `BA-changes-02`–`05`. Nije započet prije zelenog gatea ovog paketa.
