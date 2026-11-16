# W7.21 — BA-problems-02: problem i povezani tiketi

**Status: implementacija kompletna i zelena na automatskom CI-ju; zatvaranje nalaza čeka korisničku vizuelnu provjeru nakon redeploya.** Politika koju je vlasnik izabrao: puni zapis, analiza i historija problema dostupni su samo unutar `problem.read` OU opsega; radnik na tiketu izvan tog opsega dobija minimalnu ticket karticu i workaround, a prijavitelj nema trajni izuzetak. Povezani tiketi bez pristupa ne pojavljuju se ni kroz broj. Nema proširenja prava i nema migracije.

## Triage

BA-problems-02 (P1), WS-F. Trebalo je obuhvatiti listu, detalj, historiju, povezane tikete, brojače, izvedene podatke, izvještaje, zakazane izvještaje, change veze, privacy izvoz i notifikacije. Ticket read i confidential policy ostaje izvor autoriteta; filtriranje se primjenjuje u SQL-u prije limita, paginacije i agregiranja. Historijski BA-problems-04 i susjedni BA-problems-03/05 nisu mijenjani.

## Implementacija po površini

- **Puni zapis problema** (`problem-visibility.ts`): `problemVisibilityWhere` daje pristup samo preko OU opsega relevantne permisije; uklonjeni su linked-ticket i reporter bypass. Prazan opseg je nemoguć ID skup, bez NUL sentinela.
- **Lista i detalj** (`problems.service.ts`): uklonjen je nefiltrirani `_count.tickets`; ukupni i otvoreni brojevi računaju se nakon centralnog ticket-predikata. Detalj i no-op update prolaze `problem.read` provjeru. Kreiranje i premještanje problema traže jedinicu u opsegu i `problem.report` i `problem.read`; odabir jedinice iz tiketa filtrira tikete po vidljivosti.
- **Povezani tiketi** (`problem-tickets.service.ts`): lista koristi centralni ticket-list predikat prije limita i brojeva; neuspjeh učitavanja vidljivosti odbija odgovor. Kartica na tiketu ostaje minimalna (`canOpen`, workaround), a `canUnlink` traži i problem read i report opseg. `unlink` zadržava provjere iz BA-04.
- **Historija problema** (`problems.service.ts`): `ticket_linked`/`ticket_unlinked` prikazuju se samo ako je referencirani tiket sada čitljiv; `tickets_resolved` agregati i nepoznate akcije se izostavljaju fail-closed. Straničenje ide dok se ne prikupi 200 vidljivih događaja.
- **Ticket historija** (`redact-problem-event-bodies.ts`): novi zapisi više ne sadrže identitet problema; stari zapisi oblika `action:<problemId>|<number> <title>` rediguju se pri čitanju za gledaoce izvan `problem.read`. Time se uklanja i realtime curenje kroz poruke.
- **Resolution** (`problem-resolution.service.ts`): preview i izvršenje obrađuju samo tikete iz centralnog ticket-predikata i traže `problem.read` uz `problem.manage`/`problem.close`; delegacija više ne otvara sve povezane tikete.
- **Izvedeni CMDB prijedlozi** (`problem-links.service.ts`): grupisanje i limit od 20 primjenjuju se nakon ticket-predikata.
- **Report packovi i zakazani izvještaji**: problem packovi traže `problem.read` i ticket visibility; `problem_top` brojači i `problem_recurrence` filtriraju se prije agregacije; zakazani prilozi grade se **zasebno za svakog primaoca** (odluka vlasnika), a bez opsega se pack izostavlja.
- **Privacy izvoz** (odluka vlasnika): problem dio ZIP-a ograničen je presjekom `problem.read` opsega subjekta i administratora koji je izvoz zatražio; bez opsega nema problem zapisa. Dokumentovan je uticaj na potpunost izvoza.
- **Change veze** (`changes.service.ts`, `change-access.service.ts`): detalj prikazuje problem samo uz `problem.read`; povezivanje traži čitljiv problem; historija ne prikazuje `problemId` iz `changes` detalja. Reverse lista po `problemId` vraća prazno bez pristupa.
- **Notifikacije** (`problem-notifier.ts`): primaoci se provjeravaju po trenutnom principalu i OU opsegu `problem.read`; bez opsega nema in-app ni e-mail isporuke. Recurrence notifikacije više ne sadrže brojeve tiketa, a dedupe ključ ne nosi identifikatore.

## Testni dokaz

- `problem-ticket-visibility.spec.ts`, `problem-tickets.service.spec.ts`, `problem-counts.spec.ts`, `problem-events-visibility.spec.ts`, `problem-links.service.spec.ts`, `problem-resolution.service.spec.ts`, `problem-notifier-visibility.spec.ts`, `problem-principal-scope.spec.ts`, `redact-problem-event-bodies.spec.ts`, `load-problem-report-visibility.spec.ts` — 47 ciljanih mock testova s `ts-jest diagnostics:false`.
- `problem-ticket-unlink.integration.spec.ts` (PostgreSQL): običan i povjerljivi tiket, staff/requester/strani gledalac, vidljivi brojači liste i detalja, filtrirana historija, resolution preview i report agregati. Suite je registrovana u `scripts/run-isolated-integration.mjs` i prošla je u CI-ju.

## Commitovi i CI

- `143faf9` — uklanjanje bypassa, scope i `canOpen`.
- `ccfea65` — SQL filter liste povezanih tiketa i write dozvole detalja.
- `0bb34b2` — vidljivi brojači liste i detalja.
- `5735e28` — filtriranje ticket-derived CMDB prijedloga.
- `3d97728` — historija, resolution, notifikacije, report packovi, zakazani prilozi, privacy izvoz i change veze.
- `5dca770` — uklanjanje identiteta problema iz ticket historije i redakcija starih zapisa.

Automatski CI: [`43855516535`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43855516535), [`43857849016`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43857849016), [`43860274112`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43860274112), [`43861927777`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43861927777), [`43869006635`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43869006635) i [`43870890089`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43870890089) — svi zeleni, uključujući PostgreSQL/Redis integraciju i generisani Prisma. E2E critical/install, inventory i „Enforce zero high/critical image vulnerabilities” su preskočeni po konfiguraciji workflowa; full E2E critical ostaje za kraj vala ili scheduled run.

## Lokalna ograničenja

Lokalno nisu izvedeni `prisma generate` (TLS prekid prema binaries.prisma.sh) ni PostgreSQL integracija; oboje je dokazano u CI-ju. Zbog toga lokalni `tsc` prijavljuje nedostajući generisani klijent, a dvije šire suite (`reports.service.spec.ts`, `change-access.service.spec.ts`) nisu lokalno pokrenute — prošle su u CI-ju.

## Preostali rizici (dokumentovani, nisu blokada zatvaranja)

- Već isporučene notifikacije, e-mailovi i ranije izgrađeni privacy ZIP-ovi nisu retroaktivno redigovani; prava se provjeravaju pri isporuci i izgradnji, ne pri svakom kasnijem čitanju.
- Historija problema s velikim brojem nedostupnih događaja može zahtijevati više upita (stranice od 200) prije nego prikupi 200 vidljivih.
- Grupno rješavanje sada preskače tikete koje gledalac ne vidi; to je namjerna promjena ponašanja. Potpuna HTTP role matrica i TOCTOU između previewa i izvršenja nisu posebno testirani.
- Treperenje kartice „Povezano i tok” pri link/unlink je zaseban UX follow-up iz [239](239-w720-problem-ticket-unlink.md).

## Korisnička vizuelna provjera (prije zatvaranja)

1. Kao PROBLEM_MANAGER u OU opsegu: problem detalj prikazuje pun zapis, povezane tikete, historiju i brojače.
2. Kao agent na povezanom tiketu **izvan** problem OU opsega: kartica problema prikazuje samo broj, naslov, status i workaround, bez linka na problem, bez dugmeta za odvezivanje; broj povezanih tiketa u listi problema se ne vidi.
3. Kao prijavitelj tiketa bez `problem.read`: nema pune problem kartice.
4. Provjeriti da link/unlink i dalje rade za ovlaštene, te da historija tiketa ne prikazuje identitet problema onome bez pristupa.

Zatvaranje nalaza i ažuriranje registra slijedi nakon ovih potvrda, prema `PACKAGE-CLOSEOUT-TEMPLATE.md`.
