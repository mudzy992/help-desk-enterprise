# BA-templates-11–13 closeout i E2E 25/32 trijaža

- **Datum:** 2026-11-05
- **Scope:** samo preostali `BA-templates-11`, `BA-templates-12`, `BA-templates-13` i dijagnostika Val-5 E2E problema 25/32.
- **Implementation SHA:** [`1fb7c9f`](https://github.com/mudzy992/help-desk-enterprise/commit/1fb7c9f0d61a40e2a0e4fd9f63b8b6a985ea07f2).
- **Finding status:** 11–13 zatvoreni na nivou nalaza nakon zelenog CI-ja; puni Val-5/BA-15 acceptance ostaje pending.

## Šta je promijenjeno

- **BA-templates-11 — pouzdana realtime isporuka:** transactional outbox worker sada koristi awaited Hub putanju. `TicketRealtimeRedisForwarder` vraća i propagira Redis publish rezultat; publish sa nula API subscriber-a se tretira kao neuspjela isporuka. Outbox poruka se zato ne potvrđuje prije uspješnog `ticket.message.created` i `ticket.updated` bridge publish-a, već ulazi u retry/dead-letter mehanizam. Dodani su unit testovi za forwarder, Redis subscriber count i PostgreSQL retry test za auto-attach `SYSTEM_EVENT`: prva isporuka ostaje `PENDING` sa jednim pokušajem nakon simuliranog kvara, a retry dovršava oba realtime projectiona.
- **BA-templates-12 — ograničen sinhroni bulk attach:** `BulkAttachPlaybookDto` i service odbijaju više od 25 ticket ID-eva. Service provjeru radi prije settings/DB rada, pa prevelik zahtjev ne započinje djelimičnu obradu; ispod limita ostaju dedupe, concurrency cap i nezavisni per-ticket ishodi. Greška ima stabilan `TICKET_PLAYBOOK_BULK_LIMIT_EXCEEDED` kod za service putanju; uveden je DTO/service/error-map test.
- **BA-templates-13 — CI registry guard:** isolated integration harness sada automatski pronađe svaki `src/modules/templates/**/*.integration.spec.ts` i poredi ga sa CI registryjem. Svaki novi templates PostgreSQL integration spec mora biti registrovan ili harness test pada. Ticket auto-attach/realtime PostgreSQL shard je eksplicitno označen za BA-templates-05/11.
- **E2E 32:** fiksni kalendarski slot zamijenjen je budućim terminom izvedenim iz `uniqueStamp()`. Test sada poll-uje kalendar dok se durable downtime prozor ne pojavi, odnosno dok se poslije otkazivanja ne ukloni, umjesto da pretpostavi trenutno ažuriranje. E2E TypeScript provjera prolazi; Playwright test nije izvršen u ovom runu.
- **E2E 25:** kod nije mijenjan jer dostupni failure sažetak pokazuje navigaciju na `chrome-error://chromewebdata/`, a ne business assertion. Korisnik je prijavio uspješan retry; nema novog reproducibilnog root-cause dokaza koji bi opravdao izmjenu testa.

## Dokazi

- Lokalno ciljano Jest: **44/44** testova kroz 7 suiteova, uz `ts-jest diagnostics:false` zato što lokalni Prisma client nije generisan.
- Lokalni isolated integration harness: **12/12**; targeted ESLint: passed; `e2e` `tsc --noEmit`: passed.
- Automatski CI [`42032046504`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42032046504) na implementation SHA-u: **success** za backend build/lint/full Jest, disposable PostgreSQL+Redis integration (uključujući registrovani auto-attach/realtime shard), frontend, docs, container/supply-chain i CI gate. CI je generisao Prisma client i izvršio migracije samo na disposable CI bazi.
- Perf smoke [`42032046507`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42032046507) na istom SHA-u: **success**; Perf pragovi nisu mijenjani.
- CI jobovi **E2E install wizard** i **E2E critical flows** bili su `skipped`. Run `42032046504` zato nije browser dokaz za E2E 16, E2E 25/32 niti BA-15 full critical flow.
- Raniji korisnički E2E runovi `42017184877` i ciljano ponavljanje `42028107388` bili su na SHA-u `ba7ce88`. Run `42028107388` obuhvatio je samo spec 32 (4 passed / 1 failed; očekivan 1 downtime prozor, dobijeno 0), a ne test 25 ni puni CI. Novi E2E 32 kod na `1fb7c9f` nije još izvršen u browseru.
- Lokalni `npm run db:generate` sa placeholder URL-om nije uspio jer TLS veza za Prisma schema-engine download nije uspostavljena. Nije uspostavljena veza prema bilo kojoj bazi niti su lokalno pokretane migracije.

## Acceptance i granice

Izvorni audit i registri imaju `BA-templates-11–13` zatvorene, pa je Val 5 **74/74 na nivou BA nalaza**. Naknadni CI `42036534042` je sada browser-validirao ciljane specs 16/25/32 sa **6/6 passed**, bez failed/flaky/skipped testova; templates E2E 16 i trijažirani 25/32 su zeleni. Ipak, to **nije** puni Val-5 acceptance: BA-15 full critical-flow gate ostaje pending jer run nije izvršio puni suite niti servisni spec 42.

Nije korištena ciljna baza, `.env`, niti lokalna migracija. Nisu mijenjani Perf pragovi. Nije otvoren PR, izvršen merge ili deploy; ručni full CI/E2E nije dispatchan.

## E2E follow-up: CI `42036534042` (2026-11-05)

Korisnik je pokrenuo CI [`42036534042`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/42036534042) na `master` SHA [`f3cbadf`](https://github.com/mudzy992/help-desk-enterprise/commit/f3cbadfddf4ed08a9b0deb8ca5b8a86691d25b2f). Run je `success`; backend/full Jest, PostgreSQL/Redis integration, frontend, docs, container/supply-chain i CI gate su prošli. E2E critical-flow job je izvršen za odabrane specs 16/25/32; check-run sažetak potvrđuje **6 passed / 0 failed / 0 flaky / 0 skipped**. Time su browser-validirani templates E2E 16 i testovi 25/32. E2E install wizard i read-only service-form inventory su `skipped`.

Ovo je targeted, ne full critical-flow dispatch: nije izvršen puni E2E skup niti spec 42. Zato Val 5 ostaje zatvoren na nivou svih 74 BA nalaza, a ciljane E2E provjere 16/25/32 su zelene, ali BA-15 full critical-flow acceptance gate i dalje čeka puni green suite. Nema tvrdnje da je puni Val-5 acceptance zatvoren. Prateća evidencija je u [auditu 15, sekcija 35](../audits/15-service-catalog.md#35-ba-15-targeted-e2e-follow-up-2026-11-05).
