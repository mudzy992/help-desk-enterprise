# DOCS_CHANGELOG — šta se mijenja u dokumentaciji i zašto

> Vodi se **modul po modulu**, uporedo sa `REVIEW_ANALIZA.md` (dokaz u kodu) i izmjenama samih dokumenata.
> Jedan unos = jedan modul: **dodato / izmijenjeno / uklonjeno / ostaje otvoreno**, sa razlogom.
>
> Pravilo: dokumentacija opisuje samo ono što stvarno postoji i radi. Ono što nije provjereno nosi `[NEJASNO]`.
> Nalazi u `docs/plans/**` se **ne ispravljaju** u ovoj fazi; ovdje se samo evidentiraju (odluka vlasnika,
> 2026-10-03).

## Pregled

| # | Datum | Modul | Dokumenti | Sažetak |
|---|---|---|---|---|
| M1 | 2026-10-03 | Instalacija (prvi start) | `user-guide/instalacija.md` (nov), `TEZE` (+T15–T17) | Instalacija prvi put dokumentovana |
| M2 | 2026-10-03 | Prijava i MFA | `user-guide/prijava-i-mfa.md` (nov), `TEZE` (+T18–T22) | Prijava, drugi faktor i sesije prvi put dokumentovani |
| — | 2026-10-03 | Opšti nalazi | ovaj dokument | Zastarjeli navodi u `docs/plans/**` evidentirani, ne dirani |
| M3 | 2026-10-03 | Korisnici, OJ i grupe | `user-guide/korisnici-oj-i-grupe.md` (nov), `TEZE` (+T23–T26) | Korisnici, OJ i grupe prvi put dokumentovani |
| M4 | 2026-10-03 | RBAC (role, permisije, OU scope) | `user-guide/uloge-i-permisije.md` (nov), `TEZE` (+T27–T31) | Uloge, permisije i OU scope dokumentovani |
| M5 | 2026-10-03 | Policy paketi | `user-guide/policy-paketi.md` (nov), `TEZE` (+T32–T35) | Paketi konfiguracije i njihove granice |
| M6 | 2026-10-03 | Katalog usluga i forme | `user-guide/katalog-usluga-i-forme.md` (nov), `TEZE` (+T36–T41) | Katalog, forme i verzionisanje |
| M7 | 2026-10-03 | Usmjeravanje i prioritet | `user-guide/usmjeravanje-i-prioritet.md` (nov), `TEZE` (+T42–T47) | Routing pravila, prioritet i neusmjereni red |
| M8 | 2026-10-03 | Tiketi | `user-guide/tiketi.md` (nov), `TEZE` (+T48–T56) | Životni ciklus tiketa, merge/split, bulk |
| M9 | 2026-10-03 | Odobrenja i CSAT | `user-guide/odobrenja-i-csat.md` (nov), `TEZE` (+T57–T61) | Odobrenja, ocjene i zadovoljstvo |
| M10 | 2026-10-03 | SLA | `user-guide/sla.md` (nov), `TEZE` (+T62–T67) | Rokovi, kalendari i eskalacije |
| M11 | 2026-10-03 | Realtime i obavještenja | `user-guide/realtime-i-obavjestenja.md` (nov), `TEZE` (+T68–T73) | Sobe, obavještenja i e-mail fan-out |
| M12 | 2026-10-03 | Pošta | `user-guide/posta.md` (nov), `TEZE` (+T74–T80) | Izlazna i dolazna pošta, šabloni, broadcast |
| M13 | 2026-10-03 | Šabloni i playbooks | `user-guide/sabloni-i-playbooks.md` (nov), `TEZE` (+T81–T87) | Gotovi odgovori i tokovi rješavanja |
| M14 | 2026-10-03 | Baza znanja | `user-guide/baza-znanja.md` (nov), `TEZE` (+T88–T94) | Portal znanja, ocjene i ciklus pregleda |
| M15 | 2026-10-03 | Nadzorna ploča i izvještaji | `user-guide/nadzorna-ploca-i-izvjestaji.md` (nov), `TEZE` (+T95–T101) | Ploča, izvještaji, trendovi i zakazani |
| **Z** | 2026-10-03 | **Zaključak Faze 2** | `REVIEW_ANALIZA.md` (zaključak), ovaj dokument | **Sumarne ocjene, must-have, roadmap i stanje dokumentacije** |
| **Val 0** | 2026-10-03 | **RBAC — popravka B1** | `REVIEW_ANALIZA.md` (§M4 + `# Val 0`), `user-guide/uloge-i-permisije.md`, `user-guide/instalacija.md`, `TEZE` (T31), ovaj dokument | **Default mapping rola → permisije upisuje se pri instalaciji + CLI za postojeće instalacije** |
| **F3 (d)** | 2026-10-03 | **Docs modul — Faza 2 modula, pravilo i evidencija** | `frontend/src/lib/docs/docs-slug.ts` (nov), `frontend/src/lib/docs/docs-local.ts` (nov), `frontend/src/lib/docs/{docs-slug,docs-local}.spec.ts` (nov), `frontend/src/components/docs/{docs-help-button,docs-feedback}.tsx` (nov), `frontend/src/components/docs/docs-sidebar.tsx`, `frontend/src/components/docs/{docs-pager,docs-search}.tsx`, `frontend/src/components/ui/page-header.tsx`, `frontend/src/pages/docs-page.tsx`, `frontend/src/i18n/locales/{bs,en}/common.json`, `scripts/check-docs-content.mjs`, `CONTRIBUTING.md` (nov), `README.md`, `docs/DOCS_MODULE.md`, `REVIEW_ANALIZA.md` (`# Faza 3 — korak (d)`), ovaj dokument | **Kontekstualna „?" pomoć (20 ruta → 17 stranica), feedback i nedavno posjećeno u `localStorage`, štampa/PDF preko print CSS-a, i18n okvir + obavještenje za EN UI, pravilo „dokumentacija ide uz kod" i CI provjera mape ekran→stranica; Faza 3 zatvorena (9/9 kriterija)** |
| **F3 (c)** | 2026-10-03 | **Docs modul — `/docs` UI** | `frontend/src/pages/docs-page.tsx` (nov), `frontend/src/components/docs/**` (nov), `frontend/src/lib/docs/**` (nov), `frontend/src/services/docs-api.ts` (nov), `frontend/src/lib/navigation.ts`, `frontend/src/lib/session/route-access.ts`, `frontend/src/app/router.tsx`, `frontend/src/i18n/locales/{bs,en}/common.json`, `frontend/src/lib/privacy/simple-markdown.ts`, `frontend/src/components/privacy/markdown-view.tsx`, `backend/src/modules/docs/**`, `REVIEW_ANALIZA.md` (`# Faza 3 — korak (c)`), ovaj dokument | **Meni Dokumentacija, ruta `/docs`, nav/TOC/breadcrumbs/pager, pretraga sa isticanjem, filter po publici, 404 i prazno stanje, prošireni renderer; i18n BS/EN** |
| **F3 (b)** | 2026-10-03 | **Docs modul — sadržaj, backend i ogledalo** | `scripts/generate-docs-content.mjs` (nov), `scripts/check-docs-content.mjs` (nov), `backend/content/docs/**` (nov), `backend/src/modules/docs/**` (nov), `backend/Dockerfile`, `.github/workflows/ci.yml`, `docs/user-guide/*.md` (29 stranica), `docs/DOCS_MODULE.md`, `REVIEW_ANALIZA.md` (`# Faza 3 — korak (b)`), ovaj dokument | **Ogledalo + manifest, backend `/docs` rute sa serverskom provjerom uloga, 18 testova, Dockerfile i CI provjera; nalaz N1 zatvoren** |
| **Val 2** | 2026-10-04 | **Sigurnost i vidljivost (M6, M8, M9, M10, M12, M13, M14)** | `user-guide/odobrenja-i-csat.md`, `user-guide/sla.md`, `user-guide/tiketi.md`, `user-guide/posta.md`, `user-guide/baza-znanja.md`, `user-guide/sabloni-i-playbooks.md`, `user-guide/katalog-usluga-i-forme.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§M6, §M8, §M9, §M10, §M12, §M13, §M14, `# Val 2`), ovaj dokument | **Deset nalaza zatvoreno: provjera šablona pri slanju, zamjena ličnih podataka i pri upisu članka, redakcija broadcasta, nacrti usluga samo adminima, jedan izvor retencije priloga, obavještenje o odobrenju i kapija za `UNROUTED`, eskalacije s primaocem, retroaktivni satovi i prvi odgovor nezavisan od SLA-a** |
| **Val 3** | 2026-10-04 – 2026-10-05 | **Pouzdanost i performanse (M8, M11, M12, M13, M14)** | `user-guide/posta.md`, `user-guide/realtime-i-obavjestenja.md`, `user-guide/tiketi.md`, `user-guide/sabloni-i-playbooks.md`, `user-guide/baza-znanja.md`, `user-guide/sta-je-novo.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§M8, §M11, §M12, §M13, §M14, `# Val 3`), ovaj dokument | **Devet nalaza i jedan preventivni guard: Redis limiteri (broadcast, testno slanje), preuzimanje zaglavljene isporuke e-maila + pločica Operativno zdravlje, dijeljeni SMTP pool, dvojezične oznake obavijesti, provjera soba tokom veze i limit ulaska u sobu, opseg u upitu pickera, vidljivost baze znanja u jednom prolazu; „Šta je novo“ dopunjeno i za val 2 (nedostajao)** |
| M10 | 2026-10-05 | SLA — dnevnik skenera (B5) | `user-guide/sla.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§M10, `# Popravke poslije vala 4`), ovaj dokument | **[interno]** Uzorak ciklusa prijavljuje stvarni broj stanja koja čekaju sljedeći ciklus (do sada uvijek 0); ograničenje uklonjeno iz vodiča |
| M9 | 2026-10-05 | Odobrenja i CSAT; Nadzorna ploča | `user-guide/odobrenja-i-csat.md`, `user-guide/nadzorna-ploca-i-izvjestaji.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§M9, `# Popravke poslije vala 4`), ovaj dokument | **Skala i prag „zadovoljan“ sada važe i na serijama taba Trendovi; ograničenje uklonjeno iz vodiča** |
| — | 2026-10-05 | Postavke i čarobnjak — mrtvi prekidači | `user-guide/instalacija.md`, `user-guide/nadzorna-ploca-i-izvjestaji.md`, `user-guide/TEZE-ZA-DOKUMENTACIJU.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§M15, `# Popravke poslije vala 4`), ovaj dokument | **Uklonjeno 11 postavki bez potrošača (4 dodatka iz čarobnjaka, 5 iz „Dnevnika izmjena“, naziv/opis Teams aplikacije); sažetak ploče više ne prima neiskorišteni `scope`; ispravljena tvrdnja da su postavke održavanja mrtve — one rade (banner i picker)** |
| — | 2026-10-05 | Mrtve površine (M9 B4, M8 B3, M7 B2) | `user-guide/usmjeravanje-i-prioritet.md`, `user-guide/TEZE-ZA-DOKUMENTACIJU.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§M7, §M8, §M9, `# Popravke poslije vala 4` §5), ovaj dokument | **Preview rutanja sada radi u koraku pregleda tiketa; uklonjene dvije postavke bez efekta (`allowRequesterManager`, `allowSharing`); `roleSource` ostaje dokumentovano odstupanje** |
| — | 2026-10-05 | E2E pokrivenost pošte (M12) | `REVIEW_ANALIZA.md` (`# Popravke poslije vala 4` §6), ovaj dokument, `e2e/tests/36-notifications-email.spec.ts` (nov) | **Novi e2e spec: kanal e-pošte u `/ops/alerts/test`, `components.email` u `/ops/health` i pločica e-pošte u kartici Operativno zdravlje** |
| — | 2026-10-05 | EN stranice vodiča (prevodi, `?locale=`) | `docs/user-guide/en/*.md` (novo, 5 fajlova), `docs/DOCS_MODULE.md` (§9, §10), `backend/content/docs/en/*` (ogledalo), `REVIEW_ANALIZA.md` (`# Popravke poslije vala 4` §7), ovaj dokument | **Pet ključnih stranica prevedeno (Početak rada, Prijava i MFA, Tiketi, Uloge i dozvole, Česta pitanja); `?locale=en` vraća prevod ili bosanski uz `translated: false`, obavijest ostaje samo za neprevedene** |
| **Val 5 (M5)** | 2026-10-05 | Policy paketi | `user-guide/policy-paketi.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (`# Val 5 — M5`), ovaj dokument | **Zatvoreno šest nalaza: dodjela paketa servisu bez OJ (B3), SuperAdmin kapija na API-ju (B4), povlačenje paketa `unapply` s auditom (B5), plan iz `validate` prije primjene (B6), paket kao bundle — klasifikacija, odobrenje i SLA profil na servisu (B1), postavka `private.policyPacks.disabledKeysCsv` (B2)** |
| **Val 5 (M13)** | 2026-10-05 | Serverski testovi (obavještenja) | `REVIEW_ANALIZA.md` (`# Val 5 — M13`), ovaj dokument | **Sedam notifications servisa dobilo specove (44 nova testa): keš brojača i realtime događaji, fan-out izolacija kanala i broadcast kroz red, retencija i digest scheduler, dnevni sažetak, sedmični izvještaj i korisničke postavke** |
| **Val 5 (M8)** | 2026-10-05 | Tiketi — tip zahtjeva i željeni rok | `user-guide/tiketi.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (`# Val 5 — M8 #3`), ovaj dokument | **RAW `service → request type → due date` zatvoren: nova kolona `Ticket.requestType`, `dueAt` se konačno upisuje, oba polja u formi i u detalju tiketa, normalizacija i validacija, i jasna razlika željeni rok ≠ SLA rok** |
| **Val 5 (M7)** | 2026-10-05 | Usmjeravanje i prioritet — mrtva postavka i prekidač matrice | `user-guide/usmjeravanje-i-prioritet.md`, `user-guide/sla.md`, `user-guide/sta-je-novo.md`, `user-guide/TEZE-ZA-DOKUMENTACIJU.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§M7, `# Val 5 — M7 B2/B5`), ovaj dokument | **M7 zatvoren: nova postavka `private.ticket.priorityMatrix.enabled` stvarno isključuje matricu (vrijedi i za prioritet problema), pet mrtvih `private.changeLog.*` postavki je uklonjeno zajedno s tvrdnjom u vodiču, a ose Nizak–Kritičan ostaju dokumentovano odstupanje od RAW-a** |
| — | 2026-10-05 | E2E kapija u CI-ju — bez tihog preskakanja | `e2e/README.md`, `.github/workflows/ci.yml`, `REVIEW_ANALIZA.md` (`# Val 5 — izvještaj vala`), ovaj dokument | **Kad `E2E_API_URL` nije postavljen, korak `Run E2E` pada s `::error` (`exit 1`) umjesto `exit 0`; zelen e2e job sada znači da su specovi izvršeni** |
| — | 2026-10-05 | **[interno]** Worker modul — DI greška poslije M7 B5 | `backend/src/modules/tickets/worker-core/tickets-worker-core.module.ts`, `REVIEW_ANALIZA.md` (`# Val 5 — ispravka poslije CI-ja`), ovaj dokument | **CI je pao na `worker.module.spec.ts`: `TicketsWorkerCoreModule` sam nabraja providere pa mu je falio `TicketPriorityMatrixConfigurationLoader`; dodat je u listu (worker čita istu postavku kao API)** |
| — | 2026-10-05 | **[interno]** E2E u CI-ju — scope varijabli, nedostupna baza, dodatak `sla` | `.github/workflows/ci.yml`, `e2e/helpers/database-diagnostic.ts` (nov), `e2e/helpers/reset-super-admin-mfa.ts`, `e2e/helpers/ensure-install.ts`, `e2e/README.md`, `REVIEW_ANALIZA.md` (`# Val 5 — e2e u CI-ju`), ovaj dokument | **Preflight ispisuje `set`/`empty` po imenu i provjerava `/health`; nedostupna baza daje akcionu poruku umjesto `getaddrinfo EAI_AGAIN`, uz opcioni SSH tunel; uklonjen `sla` iz e2e instalacionog payloada (dodatak ne postoji od vala 5)** |
| — | 2026-10-05 | **[interno]** E2E trijaža — sažetak padova, artefakti, trijaž režim | `e2e/scripts/summarize-playwright-json.mjs` (nov) + `*.test.mjs` (nov), `.github/workflows/ci.yml`, `e2e/playwright.config.ts`, `e2e/README.md`, `REVIEW_ANALIZA.md` (`# Val 5 — e2e u CI-ju` §4), ovaj dokument | **Prvi pravi prolaz prijavio je padove u specovima 10–27; dodati su čitljiv sažetak u logu, upload `playwright-report`/`test-results`/`results.json` i `max_failures`/`retries` inputi za brzu trijažu** |
| **Val 1 (d)** | 2026-10-03 | **Nadzorna ploča i izvještaji; CSAT — nazivi u razrezima** | `user-guide/nadzorna-ploca-i-izvjestaji.md`, `user-guide/odobrenja-i-csat.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§2b.1), ovaj dokument | **Tabovi Uska grla i CSAT prikazuju nazive jedinica/servisa/grupa, a prioritet na jeziku interfejsa; ID ostaje samo kao rezerva za obrisane zapise** |
| **Val 1** | 2026-10-03 | **Nadzorna ploča i izvještaji; CSAT** | `user-guide/nadzorna-ploca-i-izvjestaji.md`, `user-guide/odobrenja-i-csat.md`, `backend/content/docs/**` (ogledalo), `REVIEW_ANALIZA.md` (§M9, §M15, `# Val 1`), ovaj dokument | **Dva nova taba (Uska grla, CSAT), tačne liste i grafik na ploči, razdvojene postavke perioda, skala CSAT-a iz postavke** |
| — | 2026-10-05 | Dokumentacija — automatika i veze | `scripts/generate-docs-content.mjs`, `scripts/check-docs-content.mjs` (+ `.test.mjs`), `frontend/src/lib/privacy/simple-markdown.ts` (+ spec), `frontend/src/components/privacy/markdown-view.tsx`, `user-guide/sta-je-novo.md`, `docs/DOCS_MODULE.md`, `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `backend/content/docs/**` (ogledalo), ovaj dokument | **Reference na stranice su klikabilne (ruta `/docs/<slug>` u ogledalu), a CI traži red u „Šta je novo“ za svaki novi datum u ovom dokumentu** |
| — | 2026-10-05 | Dokumentacija — napomene o dostupnosti u vodičima | `user-guide/status-incidenti-i-planirani-prekidi.md`, `user-guide/prosljedjivanje-tiketa.md`, `user-guide/sta-je-novo.md`, `backend/content/docs/**` (ogledalo), ovaj dokument | **Dvije napomene „važi od verzije sa…“ prepisane u korisnički jezik („dostupno u verzijama od 28.09.2026.“ / „od 26.09.2026.“), uz provjeru datuma u istoriji koda** |
| — | 2026-10-05 | Dokumentacija — prikaz datuma | `frontend/src/lib/docs/format-docs-date.ts` (nov), `frontend/src/pages/docs-page.tsx`, `frontend/src/i18n/locales/{bs,en}/common.json`, `frontend/src/lib/docs/format-docs-date.spec.ts` (nov), ovaj dokument | **„Ažurirano: 2026 M10 4“ zamijenjeno stvarnim datumom („Ažurirano: 4. oktobar 2026.“) — datum se čita iz manifesta, bez `Intl.DateTimeFormat` i bez pomjeranja zbog vremenske zone** |
| — | 2026-10-05 | Dokumentacija — automatika i veze (CI popravka) | `scripts/generate-docs-content.mjs`, `scripts/check-docs-content.mjs` (+ `.test.mjs`), `scripts/check-workflows-yaml.mjs` (+ `.test.mjs`), `.github/workflows/ci.yml`, `docs/DOCS_MODULE.md`, `CONTRIBUTING.md`, ovaj dokument | **CI je bio crven od vala 3: plitak `actions/checkout` kvari `updatedAt` iz gita, a jedan korak je imao dva `run:` ključa (GitHub odbija cijeli workflow); oba popravljena + guard sada hvata duple ključeve** |
| **F3 (a)** | 2026-10-03 | **Docs modul — dizajn** | `DOCS_MODULE.md` (nov), `user-guide/instalacija.md`, `user-guide/prijava-i-mfa.md`, `REVIEW_ANALIZA.md` (`# Faza 3 — korak (a)`), ovaj dokument | **Dizajn modula Dokumentacija + poravnanje dva vodiča na 8 sekcija; nalaz N1 o 8 tematskih vodiča** |

---

## M1 — Instalacija (prvi start) · 2026-10-03

**Zašto:** modul uopšte nije bio dokumentovan, a jedini je korak bez kojeg se aplikacija ne može pokrenuti. RAW ga
izričito traži (`RAW_PROJECT.md:1063`). Analiza: `REVIEW_ANALIZA.md` §M1.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/instalacija.md` (novo) | Cijela stranica: kome je namijenjena, preduslovi (`INSTALL_TOKEN`), šest koraka sa tačnim nazivima dugmadi, polja i validacije, kodovi grešaka, poznata ograničenja, veze na `ops/COOLIFY.md` | `install.controller.ts:45,64–129`; `install-token.ts:13,19,44–60`; `validate-install-super-admin-credentials.ts:16–29`; `validate-install-smtp.ts`; `install-seed.constants.ts:3–11`; `addon-catalog.ts`; `install-page.tsx:27–33`; i18n `install.*` (bs) |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T15** — prvi SuperAdmin je uvijek lokalni (break-glass), i kad je izabran Entra; **T16** — wizard se otvara samo uz `INSTALL_TOKEN`; **T17** — nakon „Završi“ koraci instalacije su zaključani i mijenjaju se kroz Settings | `create-install-super-admin.ts:46–70`; `install-token.ts`; `is-install-wizard-mutation-locked.ts:7–10,35` |

### Izmijenjeno

- Ništa. Nijedan postojeći dokument nije tvrdio nešto netačno o instalaciji (teme nije bilo), pa nije bilo
  ispravki. Postojeći fajlovi `docs/user-guide/*` nisu dirani.

### Uklonjeno

- Ništa.

### Popravka guarda klijentske neutralnosti (D-19)

**Zašto:** CI je pao na `check-client-neutral` jer su primjeri izlaza u `e2e/README.md` i u samotestu summarizera
sadržavali klijentsku skraćenicu u broju tiketa — prepisanu iz stvarnog loga. Frontend job je pao na koraku 5,
pa su svi kasniji koraci **i cijeli e2e job** bili preskočeni (`needs: [backend, frontend]`).

**Dokazi:** `node scripts/check-client-neutral.mjs` → zeleno; `node --test scripts/check-client-neutral.test.mjs` → 3/3;
`node --test scripts/summarize-playwright-json.test.mjs` → 12/12.

| Dokument / fajl | Šta je izmijenjeno | Izvor (dokaz) |
|---|---|---|
| `e2e/README.md` | Uzorak izlaza: `[HD-2026-000124]` umjesto klijentske skraćenice | `scripts/check-client-neutral.mjs:43` (`ep[ _-]?hd\b`) |
| `e2e/scripts/summarize-playwright-json.test.mjs` | Isti neutralni broj u tri linije (fixture + tvrdnja) | isto |
| `REVIEW_ANALIZA.md` | Nalaz **D-19** u tabeli trijaže | ova izmjena |

### Drugi e2e prolaz: auto-dodjela poslije prosljeđivanja i zaostali timer (D-20, D-21)

**Zašto:** run `37353690845` (sužen na 7 testova) završio je s 4 passed / 2 failed / 1 skipped. Oba pada su
popravljena u **e2e sloju** — proizvod radi kako je dizajniran:

- **D-20 (spec 10):** poslije prosljeđivanja backend namjerno primijeni strategiju auto-dodjele ciljne grupe
  (`tickets-forwarding.service.ts:75`), a spec je tražio **nedodijeljen** tiket u grupi; to zavisi od postavke
  instalacije. Spec sada fiksira `private.ticket.autoAssign.enabled` i `private.ticket.groupInbox.enabled`
  preko `withSettings` i vraća ih poslije testa.
- **D-21 (spec 14):** prethodni run je ostavio **pokrenut timer**, pa je prvi `time-start` otvorio dijalog za
  prebacivanje i indikator je zadržao stari tiket (`T-000162` vs `T-000164`). Novi `e2e/helpers/time-tracking.ts`
  (`stopRunningTimer`) čisti timer u `globalSetup`-u (sva tri naloga) i na početku samog speca, pa ni retry ne
  nasljeđuje vlastito zaostalo stanje.

**Potvrđeno u istom prolazu (`specs=10,14,15,18`, 7 testova → 4 passed / 2 failed / 1 skipped):** spec **15 je 3/3
zelen** (D-14, slugifikacija), a spec **18 je 1 passed + 1 vidljivo preskočen** (D-18) — oba nalaza iz prve trijaže
su time provjerena na živom stacku, ne samo u kodu.

**Dokazi:** `node --experimental-strip-types /tmp/timer-check.mjs` → **6/6** (jedan POST na pravi put, `reason:
MANUAL`, bez timera nema POST-a, greška se propagira); `cd e2e && npx tsc --noEmit -p tsconfig.json` → 0;
`npx playwright test --list` → **71 test u 36 fajlova**; `node scripts/check-client-neutral.mjs` → zeleno;
`node scripts/check-docs-content.mjs` → OK.

| Dokument / fajl | Šta je izmijenjeno | Izvor (dokaz) |
|---|---|---|
| `e2e/helpers/time-tracking.ts` | Novi `stopRunningTimer` (idempotentan) | `backend/src/modules/tickets/time-tracking/tickets-time-tracking.controller.ts:140` (`GET /me/active-timer`), `:84` (`POST …/stop`) |
| `e2e/global-setup.ts` | Novi korak `clearStaleTimers` za sva tri naloga; greška je upozorenje | run `37353690845`, spec 14 |
| `e2e/tests/14-time-tracking.spec.ts` | Čisti vlastiti timer prije prvog koraka (retry ne nasljeđuje stanje) | isto |
| `e2e/tests/10-forward-cross-ou.spec.ts` | `withSettings` fiksira auto-dodjelu i grupni inbox; tvrdnja na `:90` nosi poruku s putem provjere | `backend/src/modules/tickets/forwarding/tickets-forwarding.service.ts:75–77` |
| `REVIEW_ANALIZA.md` | Nalazi **D-20** i **D-21**, dokazi, status otvorenog | ova izmjena |

### Ostaje otvoreno `[NEJASNO]`

1. RAW upućuje na `.cursor/docs/04-install-wizard.md`; taj fajl ne postoji u repou (`.cursor/docs/` sadrži
   `theme.md`). Ako postoji kod izvornog šablona, vrijedi ga uvesti u `docs/` — odluka vlasnika.
2. Polja za AD u wizardu upisuju vezu, ali stvarno čitanje iz AD-a zavisi od `private.auth.adRead.*` postavki;
   tačan tok se potvrđuje u M3 (Korisnici/OJ/grupe) i tada se dopunjuje stranica.

---

## Opšti nalazi — zastarjeli navodi u `docs/plans/**` (evidentirano, ne dirano)

Odluka vlasnika (2026-10-03): ove tvrdnje ostaju kakve jesu; ne mijenjaju se u Fazi 2. Zapisujem ih ovdje da se ne
izgube i da se riješe kad bude vrijeme za `docs/plans/**`.

| Fajl : linija | Tvrdnja | Stvarno stanje (dokaz) |
|---|---|---|
| `docs/plans/05-FAZNI-PLAN-NADOGRADNJE-2026.md:99` | 1.8: „LDAPS provider i Entra login tok ne postoje“ | Postoje `backend/src/modules/directory-sync/ldaps/` (24 fajla, uključujući `directory-full-sync.service.ts`) i `authentication/entra-*.ts`; dizajn 1.8 ih i opisuje kao implementirane |
| `docs/plans/modules/3.3-analiza-stanja-2026-10-01.md:59` | „korisnički vodič `docs/user-guide/problemi.md` ❌ ne postoji“ | `docs/user-guide/problemi.md` postoji (49 linija) |
| `docs/plans/05-FAZNI-PLAN-NADOGRADNJE-2026.md:222` | 4.1 „čeka odobrenje“ | 4.1 implementiran i deployan; A9 prelazak u toku (handoff `docs/plans/HANDOFF-4.1-A9.md`) |

---

## M2 — Prijava i potvrda u dva koraka (MFA) · 2026-10-03

**Zašto:** najvažniji korisnički tok (ulaz u aplikaciju) nije bio dokumentovan nijednim fajlom, iako je RAW
izričito traži (`RAW_PROJECT.md:894–902`) i iako paket 2.1 dodaje TOTP, rezervne kodove i registar sesija.
Analiza: `REVIEW_ANALIZA.md` §M2.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/prijava-i-mfa.md` (novo) | Prijava (lokalna i Microsoft), prisilna promjena lozinke, upis i verifikacija potvrde u dva koraka, rezervni kodovi, stranica **Sigurnost naloga**, administratorski **Reset MFA** i **Odjavi sve sesije**, tabela politike iz Admin → Postavke, poruke grešaka i poznata ograničenja | `authentication.controller.ts:64–182`; `authentication.service.ts:204–271`; `security/mfa.service.ts`; `security/totp.ts:8–13`; `settings/definitions/account-security-settings.ts`; `pages/login-page.tsx:30–48`; `pages/account-security-page.tsx`; `i18n` `session.*`, `auth.*`, `account.security.*` |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T18** obavezan drugi faktor (SUPER_ADMIN uvijek, ADMIN po postavci); **T19** redoslijed lozinka → promjena → MFA i rokovi međukoraka; **T20** rezervni kodovi se prikazuju jednom i jednokratni su; **T21** Entra nalozi koriste Microsoftov drugi faktor; **T22** brojač neuspjelih prijava | `security/account-security-rules.ts:16–22`; `authentication.service.ts:204–271`; `authentication.constants.ts:7,11`; `security/recovery-codes.ts`; `login-attempt-limiter.ts:17–30` |
| `REVIEW_ANALIZA.md` §M2 | Nalazi (detalji i dokazi u fajlu) | isto |

### Izmijenjeno

- Ništa. Postojeći fajlovi `docs/user-guide/*` nisu tvrdili ništa o prijavi, pa nije bilo ispravki; `user-guide`
   fajlovi drugih modula nisu dirani.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. Entra režim **uvijek** nudi i lokalnu formu (link „Prijavi se lokalnim nalogom“) — to je break-glass odluka
   iz RAW-a, ali treba potvrditi da nijedan klijent ne traži isključivo SSO.
2. Nalaz #1 iz §M2 (gašenje `mfa.allowOptional` tiho preskače verifikaciju postojećim korisnicima) mijenja
   ponašanje; dokumentacija ga zasad opisuje kao **poznato ograničenje**, a ne kao pravilo. Kad se kod popravi,
   i ovaj tekst treba uskladiti.

---

## M3 — Korisnici, organizacione jedinice i grupe · 2026-10-03

**Zašto:** administracija naloga, OU stabla i grupa za rutiranje nije imala nijednu stranicu u `user-guide`, a
to je prvi ekran na koji administrator dolazi poslije instalacije. Analiza: `REVIEW_ANALIZA.md` §M3.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/korisnici-oj-i-grupe.md` (novo) | Dodavanje/uređivanje korisnika, privremena lozinka, reset lozinke i MFA-a, odjava sesija, AD veza i raskid veze, OU stablo (Dodaj OU, izmjena, brisanje, DN/ouPath), AD sinhronizacija (Test veze, Probni prolaz, Primijeni plan, osigurač), grupe (fallback, članovi, problem/CAB), validacije, poruke grešaka, FAQ i poznata ograničenja | `users/users.controller.ts:37–188`; `users/create-user.ts:19–69`; `users/issue-temporary-password-for-user.ts:22–43`; `users/delete-user.ts:12–40`; `users/link-user-directory-identity.ts:32–60`; `organizational-units/*`; `groups/*`; `directory-sync/directory-full-sync.service.ts:149–197`; `LdapsDirectorySyncPanel` i i18n `users.*`, `groups.*`, `directory.*` (bs) |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T23** jedan identitet po nalogu i eksplicitna AD veza (SuperAdmin); **T24** OU se ne briše s djecom/korisnicima (i šta se ne provjerava); **T25** fallback grupa je jedna po OU-u i aktivira problem/CAB module; **T26** audit pokriva samo role — dokumentacija to mora reći | `users/user-directory-identity.controller.ts:24`; `organizational-units/delete-organizational-unit.ts:20–25`; `groups/create-group.ts:18–35`; `users/assign-user-role.ts:92`, `remove-user-role.ts:35` |
| `REVIEW_ANALIZA.md` §M3 | 9 cjelina + gap tabela + 7 nalaza (B1–B7) | isto |

### Izmijenjeno

- Ništa. Nijedan postojeći `docs/user-guide/*` fajl nije tvrdio ništa o administraciji korisnika/OJ/grupa, pa
  nije bilo ispravki; ostali modulski fajlovi nisu dirani.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. RAW traži „opcionalno Manager“ pri sync-u iz AD-a (`RAW_PROJECT.md:30`), ali ne definiše upotrebu manager
   hijerarhije u aplikaciji; polje `User.managerUserId` postoji, mapiranje iz direktorija ne (`grep manager` u
   `directory-sync` je prazan).
2. Nalazi B1–B4 iz §M3 mijenjaju ponašanje kad se poprave (brisanje OU-a, audit, reset lozinke AD nalogu);
   stranica ih zasad opisuje u **Poznata ograničenja** i treba je uskladiti s popravkama.

---

## M4 — RBAC (role, permisije i OU scope) · 2026-10-03

**Zašto:** sistem ima 63 permisije, OU/servis scope, preview uticaja i read-only režim, a korisnički vodič nije
objašnjavao ni šta je permisija ni kako se mijenja. Analiza: `REVIEW_ANALIZA.md` §M4.

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/uloge-i-permisije.md` (novo) | Dva sloja dozvola (rola + permisija), katalog od 63 permisije po kategorijama, **Pregled uticaja** i **Potvrdi i sačuvaj**, dodjela role s OU/service scope-om, read-only režim, validacije/greške (403, `READ_ONLY_MODE`, `INVALID_PERMISSION_KEY`), FAQ i poznata ograničenja | `authorization/authorization.constants.ts:3–217`; `evaluate-authorization-access.ts:88–132`; `evaluate-admin-read-only-access.ts:11–58`; `rbac/roles.controller.ts:31–82`; `rbac/preview-role-permission-impact.ts`; `frontend/src/components/rbac/permissions-panel.tsx:91–124` |
| `TEZE-ZA-DOKUMENTACIJU.md` | **T27** SuperAdmin ima sve i zaobilazi provjere, ali mora biti lokalan; **T28** scoped dodjela ne zadovoljava provjeru bez scope-a (izuzetak `oncall.read`); **T29** preview uticaja i diff u auditu (razlog još nije obavezan); **T30** read-only režim i bypass; **T31** default mapping nije upisan u bazu | `authorization.constants.ts:101,205–217`; `to-current-session-response.ts:29–35`; `replace-role-permissions.ts:46–57`; `read-only-mode.constants.ts:3–89` |
| `REVIEW_ANALIZA.md` §M4 | 9 cjelina + gap tabela + nalazi B1–B5 | isto |

### Izmijenjeno

- Ništa. Postojeći fajlovi `docs/user-guide/*` nisu tvrdili ništa o RBAC-u.

### Uklonjeno

- Ništa.

### Ostaje otvoreno `[NEJASNO]`

1. RAW traži change log s **reason + diff** (`RAW_PROJECT.md:223`); implementiran je samo diff, pa treba
   odluka da li se dodaje obavezno polje razloga pri promjeni permisija.
2. RAW `:479` navodi `entra_groups` kao vrijednost `private.auth.roleSource`, a kod poznaje `local_db` i
   `ad_groups` — potrebno je potvrditi da li je riječ samo o nazivu.

---

## M5 — Policy paketi (2026-10-03)

**Dodato**

- `docs/user-guide/policy-paketi.md` — novi vodič: čemu modul služi, kome je namijenjen (SuperAdmin u UI-u),
  kako se dolazi (Administracija → **Korisnici** → panel **Paketi politika**), korak-po-korak primjena, tabela tri
  default paketa sa sadržajem grantova, tabela polja/validacija/poruka, česta pitanja i greške, poznata
  ograničenja i povezani moduli.
- `REVIEW_ANALIZA.md` §M5 — gap tabela (7 redova), recenzija koda, nalazi B1–B6, ocjene **F6 / K8 / S8** i red
  iteracije 1 prebačen u „M5 ✅ (iteracija 1 završena)“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T32** (transakciona, idempotentna primjena uz audit i invalidaciju keša),
  **T33** (default paketi nose samo permisije; SLA/required fields/approvals nisu implementirani), **T34**
  (primjena je jednosmjerna, povlačenja nema), **T35** (paket ne može dodijeliti SUPER_ADMIN ni permisiju van
  default mappinga role).

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — policy paketi do sada nisu bili dokumentovani.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul je bio nedokumentovan i lako ga je pogrešno razumjeti: naziv „paket politika“ i polja u zapisu paketa
  (`defaultClassification`, `requiresApproval`, `slaProfileId`) sugerišu da paket mijenja SLA, obavezna polja i
  odobrenja, dok stvarna primjena mijenja **samo role i permisije** te vezu paketa na OJ/servis. Dokumentacija i
  teze sada eksplicitno razdvajaju ta dva pojma i navode nalaze B1–B6.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/policy-packs/*` (`policy-pack.registry.ts`,
  `policy-pack.types.ts`, `assert-policy-pack-definition.ts`, `apply-policy-pack.ts`,
  `apply-policy-pack-user-grants.ts`, `bind-policy-pack-targets.ts`, `ensure-policy-pack-catalog.ts`,
  `list-policy-packs.ts`, `policy-packs.controller.ts`, `dto/apply-policy-pack.dto.ts`),
  `frontend/src/components/policy-packs/*`, `frontend/src/pages/users-page.tsx` i
  `backend/prisma/schema/identity.prisma`.

---

## M6 — Katalog usluga i forme (2026-10-03)

**Dodato**

- `docs/user-guide/katalog-usluga-i-forme.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela rola i
  permisija), kako se dolazi (**Usluge i znanje → Katalog usluga**), korak-po-korak (grupe usluga, nova usluga,
  forma i verzije, aktivacija, onboarding čarobnjak, status i prekidi), tabele polja/validacija/statusa s tačnim
  nazivima iz UI-a, česta pitanja i greške s porukama, poznata ograničenja (B1–B7) i povezani moduli.
- `REVIEW_ANALIZA.md` §M6 — planirano/idealno/preporuka, stanje u kodu (model, API, servisni sloj, forme i
  verzionisanje, tiket tok, onboarding, frontend), gap tabela s 12 redova, recenzija, nalazi **B1–B9**, ocjene
  **F7 / K8 / S7** i novi red tabele iteracija „2 … M6 ✅ · M7 u toku“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T36** (životni ciklus i vidljivost usluge), **T37** (jedna forma po usluzi,
  verzije, nepromjenjivost), **T38** (šema forme: tipovi i ograničenja; šta se validira na serveru, a šta ne),
  **T39** (obavezna polja pri rješavanju/zatvaranju), **T40** (onboarding čarobnjak i šta finalizacija
  postavlja), **T41** (status dostupnosti i prekidi ne blokiraju prijavu tiketa).

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — katalog usluga i forme do sada nisu bili dokumentovani.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul je bio potpuno nedokumentovan, a dvije stvari se lako pogrešno razumiju: (1) obavezna polja iz forme
  **ne** blokiraju kreiranje tiketa (provjeravaju se pri rješavanju/zatvaranju), i (2) forma se validira na
  serveru **samo kao šema** — vrijednosti koje korisnik pošalje provjerava isključivo ekran za prijavu. Vodič i
  teze zato eksplicitno razdvajaju ta dva nivoa i navode nalaze B1–B7.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/service-catalog/*` (`service-catalog.constants.ts`,
  `service-catalog.types.ts`, `service-catalog.error.ts`, `form-schema.*`, `service-forms.*`,
  `parse-form-*`, `create-service-form*`, `update/activate-service-form-version.ts`,
  `is-form-version-immutable.ts`, `load-form-version.ts`, `select-active-form-version-ref.ts`,
  `bind-ticket-form-version-ref.ts`, `resolve-ticket-form-version.ts`, `services|service-forms|service-availability|service-categories.controller.ts`,
  `map-service-catalog-error.ts`, `map-service-forms-error.ts`, `evaluate-service-runtime-availability.ts`),
  `backend/src/modules/service-onboarding/*` (`service-onboarding.constants.ts`, `validate-onboarding-steps.ts`,
  `finalize-service-onboarding.ts`), `backend/src/modules/tickets/*` (`create-ticket.ts`,
  `resolve-create-form-version-ref.ts`, `to-ticket-form-data-input.ts`, `required-fields/*`,
  `close-codes/apply-ticket-resolution.ts`, `update-ticket.ts`), `backend/prisma/schema/catalog.prisma`,
  `backend/src/modules/authorization/read-authorization-requirements.ts`, te frontend
  (`pages/services-page.tsx`, `components/services/*`, `components/tickets/service-form-fields.tsx`,
  `components/tickets/ticket-form-data-view.tsx`, `lib/tickets/validate-service-form.ts`,
  `services/service-catalog-api.ts`, `lib/services/use-service-catalog.ts`, i18n `services.*`).

---

## M7 — Usmjeravanje i prioritet (2026-10-03)

**Dodato**

- `docs/user-guide/usmjeravanje-i-prioritet.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela rola i
  permisija), kako se dolazi (**Administracija → Usmjeravanje**, **SLA → Matrica prioriteta**, detalj tiketa,
  grupni inbox), korak-po-korak (novo pravilo, izmjena/brisanje s prikazom „prije → poslije“, matrica pokrivanja,
  test rezolucije, matrica prioriteta, ručna promjena prioriteta), tabele polja/ishoda/prioriteta/statusa s
  tačnim nazivima iz UI-a, česta pitanja i poruke grešaka, poznata ograničenja (B1–B6, B9) i povezani moduli.
- `REVIEW_ANALIZA.md` §M7 — planirano/idealno/preporuka, stanje u kodu (model, API, servisni sloj, prioritet,
  UNROUTED tok, konfiguracija i realtime, frontend), gap tabela sa 16 redova, recenzija, nalazi **B1–B9**, ocjene
  **F8 / K8 / S8** i novi red tabele iteracija „2 … M7 ✅ · M8 u toku“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T42** (rutanje kao deterministička odluka iz para OU + usluga), **T43** (pravilo:
  jedinstven par, obavezan razlog, before/after zapis), **T44** (matrica pokrivanja i `requireCoverage`),
  **T45** (neusmjereni red: ciljna grupa, vlasnik, rok, digest), **T46** (prioritet: matrica i override s
  auditom), **T47** (konfiguracija rutanja: žive postavke, validacija snapshot-a, realtime, read-only).

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — usmjeravanje i prioritet do sada nisu bili dokumentovani.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul nosi odluke koje se lako pogrešno razumiju: rutanje određuje **grupu, nikad agenta**; tiket bez pravila
  **nije izgubljen** (neusmjereni red ili podešena ciljna grupa); prioritet je izveden iz matrice, a ručna
  promjena je izuzetak koji se auditira i pomjera SLA rokove. Vodič i teze zato eksplicitno razdvajaju ta stanja i
  navode nalaze B1–B6 i B9.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/routing/*` (`resolve-ticket-routing.ts`,
  `compute-routing-coverage.ts`, `evaluate-service-routing-coverage.ts`, `persist-routing-rule-change.ts`,
  `update/delete-routing-rule.ts`, `assert-routing-*.ts`, `read-required-routing-reason.ts`,
  `routing.controller.ts`, `dto/routing.dto.ts`, `routing-configuration.loader.ts`,
  `parse-routing-configuration.ts`, `routing-onboarding-support.ts`),
  `backend/src/modules/tickets/*` (`apply-create-ticket-routing.ts`, `create-ticket.ts`, `update-ticket.ts`,
  `resolve-ticket-priority.ts`, `calculate-ticket-priority.ts`, `priority/override-ticket-priority.ts`,
  `routing-preview/*`, `unrouted/*`, `counts/*`, `list/build-ticket-list-filters.ts`),
  `backend/src/modules/sla/*` (`priority-matrix.controller.ts`, `list/patch-priority-matrix.ts`,
  `default-priority-matrix.ts`), `backend/src/modules/settings/*` (`setting-keys.ts`,
  `definitions/ticket-routing-settings.ts`, `routing-dead-settings.spec.ts`),
  `backend/src/modules/config-versioning/validate-routing-snapshot.ts`,
  `backend/src/common/admin-realtime/*`, `backend/prisma/schema/{catalog,ticketing,enums}.prisma`, te frontend
  (`pages/routing-page.tsx`, `components/routing/*`, `components/sla/priority-matrix-panel.tsx`,
  `components/tickets/{ticket-priority-panel,ticket-detail-sidebar,ticket-inbox-*}.tsx`,
  `lib/tickets/{inbox-view-tabs,use-ticket-list,calculate-ticket-priority,lookup-ticket-priority}.ts`,
  `services/routing-api.ts`) i e2e (`02-routing-fallback`, `13-priority-merge`, `15-workflow-unrouted-realtime`).

---

## M8 — Tiketi (2026-10-03)

**Dodato**

- `docs/user-guide/tiketi.md` — novi vodič kroz cijeli tok: prijava tiketa, rad iz grupnog inboxa, detalj tiketa
  (poruke, učesnici, prilozi, vrijeme, prioritet), spajanje i razdvajanje, dijeljenje (split), skupne akcije,
  sačuvani pogledi, tabele statusa i dozvoljenih prelazaka, automatika i rokovi, česta pitanja i poruke grešaka,
  poznata ograničenja (B1–B5, B7) i povezani moduli.
- `REVIEW_ANALIZA.md` §M8 — planirano/idealno/preporuka, stanje u kodu (model i kontrakti, API, kreiranje i
  vidljivost, lista i filteri, tok statusa/arhiva/reopen, saradnja, bulk/saved views/prilozi/vrijeme/izvoz,
  frontend), gap tabela sa 16 redova, recenzija, nalazi **B1–B7**, ocjene **F9 / K8 / S8** i red tabele iteracija
  „2 … M8 ✅ · M9 u toku“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T48–T56**: tok statusa kao podatak; vidljivost iz aktera; pravila zatvaranja;
  merge/unmerge; split; skupne akcije; sačuvani pogledi; mjerenje vremena; prilozi.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — `prosljedjivanje-tiketa.md` ostaje zasebna stranica za forwarding i
  nije mijenjan.

**Uklonjeno**

- Ništa.

**Zašto**

- Osnovni tok tiketa nije bio dokumentovan, a tri stvari se lako pogrešno razumiju: (1) grupni inbox je radni red
  grupe i ne prikazuje naručiocu njegove tikete, (2) zatvaranje ima najstrože provjere i traži close code,
  napomenu i obavezna polja, i (3) skupno zatvaranje **nije** dozvoljeno. Vodič i teze zato te dijelove navode
  eksplicitno, uz nalaze B1–B5 i B7.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/tickets/*` (`workflow/ticket-workflow-definition.ts`,
  `tickets.controller.ts`, `assert-patch-ticket-status.ts`, `authorize-ticket-actor.ts`,
  `resolve-ticket-actor-access.ts`, `list/build-ticket-visibility-where.ts`, `list-tickets.ts`,
  `list/list-tickets.types.ts`, `apply-ticket-lifecycle-timestamps.ts`, `merge/*`, `split/*`, `bulk/*`,
  `saved-views/*`, `attachments/*`, `time-tracking/*`, `archive/*`, `reopen/*`, `waiting-for-user/*`, `export/*`,
  `context/*`, `map-ticket-realtime-change.ts`), `backend/src/modules/settings/definitions/ticket-*.ts`,
  `backend/src/modules/privacy/retention/retention-executors.ts`, `backend/prisma/schema/{ticketing,enums}.prisma`,
  te frontend (`pages/ticket-*.tsx`, `components/tickets/*`, `lib/tickets/*`) i e2e
  (`01-ticket-create`, `05-bulk-broadcast`, `06-confidential`, `10-forward-cross-ou`, `14-time-tracking`,
  `15-workflow-unrouted-realtime`).

---

## M9 — Odobrenja i CSAT (2026-10-03)

**Dodato**

- `docs/user-guide/odobrenja-i-csat.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela rola),
  kako se dolazi (nadzorna ploča → **Čeka odobrenje**, panel **Odobrenja**, traka **CSAT ocjena**),
  korak-po-korak (kako tiket dođe u odobrenje, odluka **Odobri**/**Odbij** s razlogom i posljedice, ocjenjivanje
  tiketa), tabele polja/statusa/validacija, česta pitanja i poruke grešaka, poznata ograničenja (B1–B5) i
  povezani moduli.
- `REVIEW_ANALIZA.md` §M9 — planirano/idealno/preporuka, stanje u kodu (model i kontrakti, API, tok odobrenja,
  SLA i obavještenja, tok CSAT-a, agregacija i izvještaji, frontend), gap tabela sa 16 redova, recenzija,
  nalazi **B1–B5**, ocjene **F7 / K8 / S8** i red tabele iteracija „2 … M9 ✅ · M10 u toku“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T57–T61**: odobrenje kao blokirajuće stanje s obaveznim razlogom; ko smije
  odlučiti; SLA pauza u `PENDING_APPROVAL`; CSAT pravila (ko, kada, jednom, komentar); CSAT agregacija po
  jedinici/servisu/grupi.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — odobrenja i CSAT do sada nisu bili dokumentovani.

**Uklonjeno**

- Ništa.

**Zašto**

- Tri stvari se lako pogrešno razumiju i zato su u vodiču posebno istaknute: (1) **odbijanje odobrenja zatvara
  tiket** (status **Zatvoreno**, ishod **Odbijeno** je vidljiv u panelu), (2) odobrenje **ne dodjeljuje agenta**
  — samo vraća tiket u red grupe, i (3) CSAT može poslati **samo naručilac i samo jednom**, uz uzorkovanje.
  Uz to su navedena stvarna ograničenja (B1–B5), uključujući to da obavještenje *„Čeka odobrenje“* u praksi ne
  stiže nikome.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/tickets/approvals/*` (`create-pending-ticket-approval.ts`,
  `decide-ticket-approval.ts`, `assert-can-decide-ticket-approval.ts`, `resolve-ticket-approval-requirement.ts`,
  `list-ticket-approvals.ts`, `parse-ticket-approvals-configuration.ts`, `tickets-approvals.controller.ts`),
  `backend/src/modules/tickets/csat/*` (`submit-ticket-csat.ts`, `can-submit-ticket-csat.ts`,
  `is-ticket-csat-sampled.ts`, `summarize-visible-ticket-csat.ts`, `aggregate-ticket-csat.ts`,
  `describe-ticket-csat.ts`, `tickets-csat*.controller.ts`), `backend/src/modules/tickets/write-created-ticket-follow-up.ts`,
  `workflow/ticket-workflow-definition.ts`, `to-ticket-client-responses.ts`,
  `backend/src/modules/sla/is-sla-pause-status.ts`, `backend/src/modules/settings/definitions/{ticket-approvals,ticket-csat,ticket-sla}-settings.ts`,
  `backend/src/modules/notifications/fan-out/*`, `backend/src/modules/reports/dashboard/aggregate-report-dashboard-kpis.ts`,
  `backend/prisma/schema/{ticketing-support,enums}.prisma`, te frontend
  (`components/tickets/ticket-approvals-panel.tsx`, `components/tickets/ticket-csat-panel.tsx`,
  `lib/tickets/use-ticket-approvals.ts`, `services/tickets-csat-api.ts`, `services/tickets-approvals-api.ts`) i
  e2e (`03-approvals.spec.ts`, `08-close-codes-csat.spec.ts`).

---

## M10 — SLA (2026-10-03)

**Dodato**

- `docs/user-guide/sla.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela rola + permisija
  `sla.write`), kako se dolazi (**SLA pravila**, **Upravljaj kalendarima**, **Matrica prioriteta**, panel
  **SLA tajmeri** na tiketu), korak-po-korak (kalendar sa praznicima → profil → pravila po prioritetu →
  override pravila → eskalacije → matrica → ponašanje na tiketu → usklađenost), tabele polja i validacija za
  kalendar/profil/pravilo/eskalaciju/matricu, značenje stanja sata (**U okviru**, **Pod rizikom**,
  **Prekoračen**, **pauza**) i razloga „SLA nije primijenjen“ (`NO_PROFILE`, `PROFILE_INACTIVE`, `NO_RULE`,
  `NO_CALENDAR`, `NOT_APPLIED`), česta pitanja i poruke grešaka, poznata ograničenja (**B1–B5**) i povezani
  moduli.
- `REVIEW_ANALIZA.md` §M10 — planirano/idealno/preporuka, stanje u kodu (model i granice, izračun u radnom
  vremenu, životni ciklus sata, skener i `nextDueAt`, eskalacije i obavještenja, administracija i change log,
  usklađenost i izvještaji, frontend, testovi), gap tabela sa 23 reda, recenzija, nalazi **B1–B5**, ocjene
  **F8 / K9 / S8** i red tabele iteracija „2 … M10 ✅ · iteracija 2 završena“.
- `TEZE-ZA-DOKUMENTACIJU.md` — **T62–T67**: rok u radnom vremenu od kreiranja; pauze i pomjeranje rokova;
  izbor pravila i matrica prioriteta; eskalacije (offseti, mete, dežurni, dedupe); usklađenost i nadzor
  skenera; administracija, change log i verzije konfiguracije.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama — SLA do sada nije bio dokumentovan kao samostalan modul (spominjan
  je u vodičima o tiketima i usmjeravanju).

**Uklonjeno**

- Ništa.

**Zašto**

- Praktično je najvažnije objasniti da su rokovi u **radnom vremenu** i da sat **počinje od kreiranja tiketa**, da
  statusi **Čeka korisnika**/**Čeka odobrenje** pauziraju satove, da se prekoračenje **ne briše** promjenom
  prioriteta, te da eskalacija bez meta u praksi ne stiže nikome. Uz to su navedena stvarna ograničenja (B1–B5) i
  odstupanja od RAW postavki (konfiguracija je u bazi, `escalations.inAppEnabled` ne postoji).

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/sla/*` (140 `.ts`, 24 spec fajla) — posebno
  `add-business-minutes.ts`, `count-business-minutes.ts`, `parse-weekly-hours.ts`, `business-hours-civil-time.ts`,
  `resolve-matching-sla-rule.ts`, `start-ticket-sla-timers.ts`, `sync-ticket-sla-timers.ts`,
  `apply-ticket-sla-pause.ts`/`apply-ticket-sla-resume.ts`, `recompute-ticket-sla-targets.ts`,
  `compute-sla-next-due-at.ts`, `scan-due-ticket-sla-states.ts`, `sla-scan.processor.ts`,
  `sla-scan.scheduler.service.ts`, `select-due-sla-escalations.ts`, `apply-due-sla-escalations.ts`,
  `emit-ticket-sla-runtime-events.ts`, `record-ticket-sla-runtime-event.ts`, `sla-compliance.*`,
  `assert-sla-*-constraints.ts`, `starting-sla.constants.ts`, `seed-starting-sla-profiles.ts`,
  `priority-matrix.controller.ts`, `sla-*-settings` definicije; `backend/prisma/schema/sla.prisma`;
  `backend/src/modules/config-versioning/{validate-sla-snapshot,apply-sla-snapshot,compute-shadow-diff}.ts`;
  `backend/src/modules/tickets/context/load-ticket-sla-context.ts`;
  `backend/src/modules/notifications/fan-out/resolve-sla-notification-recipients.ts` i
  `resolve-notification-recipients.ts`; `backend/src/modules/notifications/email/fan-out-email-notifications.ts`;
  `backend/src/modules/ops-health/evaluate-ops-signals.ts`; te frontend (`pages/sla-page.tsx`,
  `components/sla/*`, `components/tickets/ticket-sla-panel.tsx`, `lib/sla/*`, `services/sla-api.ts`,
  `lib/session/route-access.ts`) i e2e `tests/07-sla.spec.ts`.

---

## M11 — Realtime i obavještenja (2026-10-03)

**Dodato**

- `docs/user-guide/realtime-i-obavjestenja.md` — novi vodič: čemu modul služi, kome je namijenjen (tabela
  rola), kako se dolazi (zvono → panel, filteri **Sve**/**Nepročitane**, **Označi sve**), korak-po-korak
  (pregled, označavanje pročitanog, šta se osvježava samo, kada obavještenje izostane), tabele tipova
  obavještenja i sadržaja/privatnosti (povjerljiv tiket nosi samo broj, interna bilješka ide samo spomenutima),
  ponašanje pri padu veze (fallback 30 s), česta pitanja i poznata ograničenja (**B1–B5** + ograničenje broja
  na 1000) i povezani moduli.
- `REVIEW_ANALIZA.md` §M11 — planirano/idealno/preporuka, stanje u kodu (transport i autentikacija, sobe i
  emit, skaliranje i bridge, in-app model i keš, frontend, testovi), gap tabela sa 17 redova, recenzija,
  nalazi **B1–B5**, ocjene **F8 / K9 / S8** i **novi red tabele iteracija 3** („M11 ✅ · M12 u toku“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T68–T73**: arhitektura kanala i soba; autentikacija i pravila pristupa;
  model vidljivosti obavještenja i „pročitano“; fan-out i sadržaj; fallback pri padu veze; operativni zahtjevi
  (više instanci, metrike, rollout, retencija).

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama.

**Uklonjeno**

- Ništa.

**Zašto**

- Najvažnije je objasniti **razliku između ličnog i grupnog obavještenja** (i zašto se grupno vidi jednom), da
  se **sopstvene radnje ne obavještavaju**, da **interna bilješka** obavještava samo spomenute i da
  **povjerljiv tiket** u obavještenju nosi samo broj. Uz to su navedena stvarna ograničenja (B1–B5): prava se u
  aktivnoj vezi ne provjeravaju ponovo, ulazak u sobu tiketa nije ograničen, metrika veze nema alarm, prelazni
  režim je uključen po defaultu i postoji mrtvi izvoz u klijentu.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/websocket/*` (38 `.ts`, 13 spec — gateway-i,
  `socket-authentication.*`, `jwt-socket-authentication.verifier.ts`, `ticket-socket-rooms.ts`,
  `broadcast-*-realtime.ts`, `group-feed-change.ts`, `websocket-emit-counter.ts`, `ws-redis-adapter.ts`),
  `backend/src/modules/notifications/*` (26 spec — `notifications.controller.ts`, `notifications.service.ts`,
  `notification-audience.ts`, `count-unread-notifications.ts`, `mark-notification-read.ts`,
  `unread-count-cache.ts`, `fan-out/*`, `notification-retention.constants.ts`),
  `backend/src/modules/tickets/ticket-realtime.{hub,types,bridge.*,redis-forwarder}.ts`,
  `backend/src/modules/integration-queue/edge-event-realtime.subscriber.ts`,
  `backend/src/common/{cors/resolve-cors-origin,admin-realtime/*}.ts`,
  `backend/src/modules/settings/to-settings-realtime-payload.ts`, `backend/src/worker.module.ts`,
  te frontend (`services/helpdesk-socket.ts`, `services/ticket-socket.ts`, `lib/realtime/*`,
  `lib/notifications/use-inbox-notifications.ts`, `components/layout/notifications-*.tsx`) i e2e
  (`tests/04-realtime-notifications.spec.ts`, `tests/15-workflow-unrouted-realtime.spec.ts`).

---

## M12 — Pošta (e-mail kanal, šabloni i dolazna pošta) (2026-10-03)

**Dodato**

- `docs/user-guide/posta.md` — novi vodič: čemu modul služi (obavještenja e-mailom, odgovor e-mailom, tekstovi
  e-mailova, sažetak i tihi sati), kome je namijenjen (tabela rola), kako se dolazi (Postavke → E-mail;
  **Uredi tekstove**; **Dolazna pošta**; **Moj profil** → Obavještenja), korak-po-korak (uključivanje kanala i
  domene, uređivanje šablona uz pregled i testno slanje, odgovor iz mail klijenta, pregled dolazne pošte),
  tabele (postavke kanala, polja šablona, statusi i razlozi odbijanja dolazne poruke, kada e-mail stiže odmah
  a kada u sažetku), česta pitanja i poznata ograničenja (**B1–B5**, Gmail API nije isporučen, obrada kasni do
  jednog ciklusa) i povezani moduli.
- `REVIEW_ANALIZA.md` §M12 — planirano/idealno/preporuka, stanje u kodu (odluka o slanju, sastavljanje i
  render, isporuka i queue, fan-out i lične postavke, bulk broadcast, šabloni i admin ekran, dolazna pošta,
  testovi), gap tabela sa 27 redova, recenzija, nalazi **B1–B5**, ocjene **F8 / K9 / S8** i ažuriran red
  tabele iteracija 3 („M11 ✅ · M12 ✅ · M13 u toku“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T74–T80**: izlazni kanal i dozvoljene adrese; sastavljanje poruke (šabloni,
  escape, povjerljivi režim, redakcija); isporuka (queue, idempotencija, DLQ, ručni retry); lične postavke,
  tihi sati i sažetak; dolazna pošta: konektori i potpisani token; pravila prihvatanja, anti-loop i prilozi;
  nadzor, retencija i operativni zahtjevi.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama.

**Uklonjeno**

- Ništa.

**Zašto**

- Najvažnije je objasniti **tri prekidača** koja moraju biti uključena da e-mail uopšte ode, pravilo
  **dozvoljenih adresa** (zadano samo interno), da **povjerljiv tiket nosi samo broj**, i da se **odgovor
  e-mailom** vezuje za tiket potpisanim `Message-ID`-om, a ne naslovom. Uz to su navedena stvarna ograničenja
  (B1–B5): zapis o isporuci bez roka, bulk obavijest bez redakcije, nova SMTP veza po poruci, limiter testnog
  slanja u memoriji i engleske oznake polja u bulk tekstu.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/notifications/email/*` (33 `.ts`, 10 spec —
  `load-email-channel-configuration.ts`, `compose-ticket-email.ts`, `render-email-message.ts`,
  `deliver-notification-email.ts`, `persist-notification-email-delivery.ts`, `fan-out-email-notifications.ts`,
  `send-broadcast-emails.ts`, `compose-digest-email.ts`, `reply-token.ts`, `default-email-templates.ts`,
  `smtp-mail-transport.ts`), `notifications/email-templates/*`, `notifications/preferences/*` (digest, tihi
  sati, preferencije), `backend/src/modules/inbound-email/*` (25 `.ts`, 2 spec — servis, procesor, scheduler,
  port i dva konektora, `process-inbound-message.ts`, `reply-token` verifikacija, raw store, admin servis),
  `backend/src/modules/integration-queue/process-email-integration-job.service.ts`,
  `backend/src/modules/tickets/bulk/*`, `backend/src/modules/settings/definitions/{smtp,notification-email,inbound-email}-settings.ts`,
  `backend/src/modules/privacy/retention/*`, te frontend (`components/settings/{smtp-email-settings-card,
  email-templates-card,email-templates-editor,inbound-email-card}.tsx`, `pages/email-templates-page.tsx`,
  `app/router.tsx`) i e2e `tests/11-email-templates.spec.ts`; planovi `docs/plans/modules/{1.5,2.2,2.3}*.md`
  i `docs/ops/inbound-email.md`.

---

## M13 — Šabloni (gotovi odgovori i playbooks) (2026-10-03)

**Dodato**

- `docs/user-guide/sabloni-i-playbooks.md` — novi vodič: čemu modul služi (gotovi odgovori i checklista
  koraka kao pomoć, bez mijenjanja modela tiketa), kome je namijenjen (tabela rola: agent, ADMIN,
  SUPER_ADMIN, korisnik), kako se dolazi (`Šabloni` u okviru za poruku, `Sačuvaj kao šablon`, meni
  **Administracija** → **Šabloni**, kartica **Playbook** na tiketu), korak-po-korak (ubacivanje šablona,
  čuvanje ličnog šablona, uređivanje zajedničkog uz razlog, pravljenje playbooka, checklista na tiketu,
  rješavanje sa obaveznim koracima), tabele (polja šablona i playbooka, 16 dozvoljenih varijabli, tri režima
  obaveznih koraka, poruke grešaka), česta pitanja i poznata ograničenja (**B1–B5**) i povezani moduli.
- `REVIEW_ANALIZA.md` §M13 — planirano/idealno/preporuka, stanje u kodu (model i postavke, odabir i
  popunjavanje, upotreba i statistika, playbook na tiketu, administracija i ekrani, testovi), gap tabela sa 21
  redom, recenzija, nalazi **B1–B5**, ocjene **F8 / K7 / S7** i ažuriran red tabele iteracija 3
  („M11 ✅ · M12 ✅ · M13 ✅ · M14 u toku“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T81–T87**: model šablona, opseg i tip; varijable i pad na bosanski; prava
  (lični, zajednički, ograničenje po servisima); playbook (snimka, verzija, nadogradnja); obavezni koraci pri
  rješavanju i automatsko vezivanje; administracija, revizija i verzije konfiguracije; ponuda šablona,
  statistika upotrebe i ekrani.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul nije bio dokumentovan, a jedini je primjer gdje pravilo postoji **samo u interfejsu**: pregled nudi
  aktivne šablone koji odgovaraju načinu pisanja, ali slanje to ne provjerava ponovo. Zato vodič izričito
  kaže „provjerite tekst prije slanja“ i navodi B1 kao ograničenje, a ne kao preporuku.
- Najvažnije je objasniti **razliku između ličnog i zajedničkog šablona**, zašto administrator vezan na
  servise ne može praviti globalni šablon, da **tiket čuva kopiju koraka** (izmjena playbooka ne mijenja
  tiket u toku) i da **checklista nije vidljiva podnosiocu**. Uz to su navedena stvarna ograničenja (B1–B5):
  tip i aktivnost šablona se ne provjeravaju pri slanju, ponuda čita fiksni broj zapisa bez redoslijeda,
  jedinstvenost naziva nije zaštićena u bazi, playbook se ne uvodi na tikete koji su već u toku i statistika
  upotrebe raste i kad poruka nije upisana.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/templates/*` (23 `.ts`, 1 spec —
  `response-templates.service.ts`, `templates.constants.ts` (`templateLimits`, 16 varijabli),
  `template-placeholders.ts`, `template-scope.ts` (`scoreTemplateScope`, `canManageSharedScope`),
  `build-template-variables.ts`, `templates-environment.ts`, `normalize-template-input.ts`,
  `record-templates-change.ts`, `templates.error.ts`, `dto/templates.dto.ts`, `response-templates.controller.ts`,
  `playbooks/*` (`playbooks.service.ts`, `normalize-playbook-input.ts`, `playbooks.controller.ts`),
  `ticket-playbooks/*` (`attach-playbook-to-ticket.ts`, `ticket-playbook-snapshot.ts`,
  `ticket-playbooks.service.ts`), `templates-configuration.loader.ts`),
  `backend/src/modules/tickets/{playbooks/assert-playbook-steps-complete.ts,create-ticket-message.ts:63–108,
  update-ticket.ts:102,bulk/apply-bulk-status.ts:49,collaboration.constants.ts:32–36,tickets.service.ts:154–178}`,
  `backend/src/modules/settings/definitions/ticket-templates-settings.ts`, `settings/setting-keys.ts:148`,
  `backend/src/modules/authorization/authorization.constants.ts:22–24`,
  `backend/src/modules/config-versioning/{collect-config-snapshot.ts:47–62,137,apply-templates-snapshot.ts}`,
  `backend/prisma/schema/templates.prisma:4–157`, te frontend (`components/templates/*`,
  `pages/{templates,response-template-editor,playbook-editor}-page.tsx`,
  `components/tickets/ticket-message-composer.tsx`, `services/templates-api.ts`, `app/router.tsx:274–335`,
  `lib/templates/*`) i e2e `tests/16-templates-playbooks.spec.ts`; plan `docs/plans/modules/1.4-sabloni-playbooks.md`
  i RAW `RAW_PROJECT.md:104–105,681–682,784,929–930`.

---

## M14 — Baza znanja (članci, portal, ocjene i review cycle) (2026-10-03)

**Dodato**

- `docs/user-guide/baza-znanja.md` — novi vodič: čemu modul služi (self-service članci, presretanje pri
  kreiranju, ocjene, vlasništvo i ciklus pregleda, članak iz odgovora), kome je namijenjen (tabela rola:
  korisnik, agent, reviewer, ADMIN/SUPER_ADMIN), kako se dolazi (meni **Baza znanja**; korak **Baza znanja**
  u wizardu; meni **⋯** → **Napravi članak**; tab **Uvidi**; grupa **Baza znanja** u postavkama),
  korak-po-korak (pretraga i čitanje, ocjena i komentar, presretanje, pisanje i objava kroz pregled,
  kategorije i FAQ, uvidi, članak iz odgovora), tabele (polja članka, klase i statuse sa dozvoljenim
  prelazima, osam postavki sa zadanim vrijednostima, poruke grešaka), česta pitanja i poznata ograničenja
  (**B1–B7**) i povezane module.
- `REVIEW_ANALIZA.md` §M14 — planirano/idealno/preporuka, stanje u kodu (model i postavke, vidljivost,
  presretanje, ocjene i pregledi, ciklus pregleda, portal i „članak iz odgovora“, autorizacija i ekrani,
  testovi), gap tabela sa 23 reda, recenzija, nalazi **B1–B7**, ocjene **F8 / K7 / S7** i ažuriran red tabele
  iteracija 3 („M11 ✅ · M12 ✅ · M13 ✅ · M14 ✅ · M15 u toku“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T88–T94**: model članka, statusi i klasifikacije; vidljivost i opseg;
  presretanje i rezolucija; ocjene, komentari i rangiranje; pregledi kao dnevni agregat; vlasništvo i ciklus
  pregleda; portal znanja i „članak iz odgovora“.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama.

**Uklonjeno**

- Ništa.

**Zašto**

- Modul je nosio tri RAW zahtjeva (self-service baza znanja, presretanje sa ishodom „pomoglo“ i povratna
  sprega ocjena sa review cycle-om), a u međuvremenu je kroz paket 2.9 (K1) dobio i portal sa kategorijama,
  FAQ-om, ocjenama 1–5, pregledima i uvide — sve to treba opisati tačnim nazivima dugmadi i stvarnim
  ograničenjima.
- Najvažnije je objasniti **tri različite klase vidljivosti**, da se **ocjena može promijeniti** i da
  **komentar „šta nedostaje“ vide samo urednici**, te da **objava traži prethodni pregled**. Uz to su
  navedena stvarna ograničenja (B1–B7): zamjena ličnih podataka samo u pregledu, obavještenje o roku bez
  naslova i odredišta, „pomoglo“ koje ne sprječava tiket i veže se na prvi predlog, brojanje pregleda bez
  pravila od pet sekundi, neograničene liste sa provjerom vidljivosti po članku, kolona `isStale` koja se
  nikad ne postavlja, i arhiviranje kategorije sa člancima koje uputa zabranjuje a server dozvoljava.

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/knowledge-base/*` (73 `.ts`, 11 spec —
  `knowledge-base.controller.ts`, `knowledge-base-workflow.{controller,service}.ts`,
  `create-knowledge-article.ts`, `update-knowledge-article.ts`, `publish-knowledge-article.ts`,
  `review-knowledge-article.ts`, `submit-knowledge-feedback.ts`, `intercept-knowledge-articles.ts`,
  `rank-knowledge-articles.ts`, `resolve-knowledge-intercept.ts`, `can-read-knowledge-article.ts`,
  `load-knowledge-article-scope.ts`, `list-knowledge-articles.ts`, `fetch-knowledge-articles-for-list.ts`,
  `evaluate-knowledge-article-freshness.ts`, `with-knowledge-article-freshness.ts`,
  `knowledge-base-review-reminder.{service,processor,scheduler.service}.ts`, `knowledge-base.constants.ts`,
  `parse-knowledge-base-configuration.ts`, `dto/*` i `portal/*` (`knowledge-portal.controller.ts` sa 13 ruta,
  `knowledge-portal.service.ts` 682 linije, `knowledge-categories.ts` 253, `knowledge-article-views.ts` 126,
  `scrub-reply-personal-data.ts` 71, `update-article-counters.ts` 68)),
  `backend/prisma/schema/knowledge.prisma` (`KnowledgeArticle`, `KnowledgeFeedback`,
  `KnowledgeInterceptResolution`, `KnowledgeCategory`, `KnowledgeArticleView`),
  `backend/src/modules/authorization/authorization.constants.ts:61–65,112–136,160–161,187–189`,
  `backend/src/modules/settings/{setting-keys.ts:328–342,definitions/knowledge-base-settings.ts}`,
  `backend/src/modules/reports/{dashboard/build-reports-dashboard.ts:137–151,packs/build-kb-helpfulness-report.ts}`,
  te frontend (`pages/knowledge-base-page.tsx`, `pages/knowledge-article-detail-page.tsx`,
  `components/knowledge-base/**` (10 komponenti + 6 portal komponenti),
  `components/tickets/{knowledge-intercept-panel,create-ticket-intercept-view,create-ticket-form,ticket-detail-conversation}.tsx`,
  `lib/knowledge-base/*`, `lib/notifications/notification-kind.ts`, `lib/navigation.ts:89–94`,
  `app/router.tsx:159–162`, `services/knowledge-base-api.ts`) i e2e (`tests/01-ticket-create.spec.ts:23–28`,
  `tests/22-accessibility.spec.ts:69,115–116`); plan `docs/plans/modules/2.9-dodatne-nadogradnje.md` §2 i §10
  i RAW `RAW_PROJECT.md:8,71,130–135,632–634,683–685,780–781,824`.
- **Nalaz o planu (samo evidentirano, `docs/plans/**` se ne dira):** plan 2.9 nema odjeljak „Implementacija i
  odstupanja (K1)“ — postoje samo za K2 (§3.4) i K4 (§5.4) — a u §2.4 opisuje prelazak na klasifikaciju
  `PUBLIC`, koja u modelu ne postoji (`DataClassification` = INTERNAL, CONFIDENTIAL, RESTRICTED,
  `backend/prisma/schema/enums.prisma:122–126`).

## M15 — Nadzorna ploča i izvještaji (2026-10-03)

**Dodato**

- `docs/user-guide/nadzorna-ploca-i-izvjestaji.md` — novi vodič: čemu modul služi (brzi pregled rada na
  **Nadzornoj ploči** i nadzor kroz **Izvještaje**), kome je namijenjen (tabela rola: korisnik, agent,
  ADMIN/SUPER_ADMIN sa `reports.export`/`audit.export` i `reports.schedule.manage`), kako se dolazi (meni
  **Nadzorna ploča**, meni **Izvještaji**, tabovi **Pregled**, **Trendovi**, **Paketi izvještaja**,
  **Zakazani**, dugme **Zakaži ovaj izvještaj** iz Trendova), korak-po-korak (čitanje brojača i
  grafikona, SLA nadzor i grupni inbox, KPI pregled i PDF, trendovi sa filterima i izvozom, paketi sa
  pregledom i preuzimanjem, zakazani izvještaji sa testnim slanjem i historijom), tabele (značenje
  brojača, KPI formule i uzorci, sadržaj paketa, poruke i greške), česta pitanja (keš brojača, razlika
  između brojača i lista, pristup izvještajima, prigušeni CSAT, razlozi preskakanja primalaca), poznata
  ograničenja (**B1–B6** i gapovi prema RAW-u) i povezane module.
- `REVIEW_ANALIZA.md` §M15 — planirano (RAW `:171`, `:258–262`, `:278–284`, `:360`, `:660–661`, `:805`,
  `:814`, `:1000`, `:1031`, `:1039`, `:1047`), idealno i preporuka, stanje u kodu (nadzorna ploča i
  izvor brojača, SLA nadzor, četiri taba izvještaja, KPI, trendovi, paketi, usko grlo API, zakazani,
  postavke, testovi), gap tabela, recenzija, nalazi **B1–B6**, ocjene **F8 / K8 / S8** i ažuriran red
  tabele iteracija 3 („M11 ✅ · M12 ✅ · M13 ✅ · M14 ✅ · M15 ✅ (iteracija 3 završena)“).
- `TEZE-ZA-DOKUMENTACIJU.md` — **T95–T101**: nadzorna ploča i izvor brojača; SLA nadzor i grupni inbox;
  KPI formule, uzorci i KB stopa; trendovi, granularnost i izvoz; paketi izvještaja, limiti i audit;
  uska grla (API bez ekrana); zakazani izvještaji, primaoci i historija.

**Izmijenjeno**

- Ništa u postojećim `user-guide` stranicama; u `REVIEW_ANALIZA.md` i `TEZE-ZA-DOKUMENTACIJU.md` samo
  dodate sekcije (bez izmjena ranijih modula).

**Uklonjeno**

- Ništa.

**Zašto**

- Modul nosi RAW zahtjeve za KPI nadzor (tiketi po OU, prosječno rješenje, KB stopa, CSAT), uska grla i
  predefinisane izvještaje sa izvozom i OU opsegom, a do sada nije imao nijednu stranicu za krajnjeg
  korisnika; uz to su kroz pakete 1.6 i 2.5 dodati trendovi, zakazani izvještaji i PDF, što treba opisati
  tačnim nazivima dugmadi.
- Najvažnije je razdvojiti **brojače sa servera** (tačni, keširani 60 s) od **pogleda koji se računaju u
  pregledaču iz prve strane od 50 tiketa** (B6), objasniti formule (KB stopa = pomoglo / (pomoglo +
  kreirani), zadovoljan CSAT = ocjena ≥ 4) i navesti stvarna ograničenja: uska grla postoje kao API ali ne
  i kao ekran (B2), postavka uskih grla ne djeluje na prikaz (B1), jedna postavka perioda dijeli se s
  paketima (B3), `scope` sažetka se ne koristi (B4) i dugme **Izvještaji** na ploči je trajno onemogućeno
  (B5).

**Napomena o izvorima**

- Sve tvrdnje su provjerene u kodu: `backend/src/modules/reports/*` (109 `.ts`, 24 spec / 2 810 linija —
  `report-summary.{controller,service}.ts`, `summary/report-summary-cache.ts:2–22`,
  `summary/report-summary.types.ts`, `summary/load-dashboard-summary-counts.ts`,
  `summary/load-sla-summary-counts.ts`, `dashboard/build-reports-dashboard.ts:31–40`,
  `dashboard/aggregate-report-dashboard-kpis.ts:4–18,63–87`, `dashboard/report-dashboard.cache.ts`,
  `bottleneck/aggregate-bottleneck-dashboard.ts:23–41,71–116`,
  `bottleneck/sql-bottleneck-dashboard-store.ts:30–40`, `trends/report-trends.constants.ts:1–43`,
  `schedules/report-schedule.constants.ts:1–65`, `packs/build-{top-close-codes,kb-helpfulness,forward-ping-pong}-report.ts`,
  `reports.controller.ts:45–56,78–130,151–189`, `reports.service.ts:130–199`,
  `record-report-export-audit.ts:9–41`), `backend/src/modules/settings/definitions/reports-settings.ts`,
  `setting-keys.ts:439–453`, `audit-log/audit-log.constants.ts:31,59–66`, te frontend
  (`pages/dashboard-page.tsx:39–124`, `pages/reports-page.tsx:52–64,252–257`,
  `lib/dashboard/use-dashboard-summary.ts:71–90`, `lib/dashboard/build-volume-14d.ts:11–25`,
  `lib/dashboard/dashboard-ticket-sets.ts:13–35`, `lib/session/route-access.ts:58–71`,
  `components/reports/*`) i e2e (`tests/12-reports-packs.spec.ts`, `17-reports-trends`, `18-reports-schedules`,
  `19-reports-print`, `22-accessibility.spec.ts:64,79`); planovi `docs/plans/modules/1.6-izvjestaji-ui.md`
  i `2.5-izvjestavanje-i-analitika.md` §7.1, §11, §13 i RAW `RAW_PROJECT.md:171,258–262,278–284,360,660–661,805,814,1000,1031,1039,1047`.
- **Nalaz o dokumentima (samo evidentirano, `docs/plans/**` se ne dira):** nijedan plan ne predviđa
  **ekran** za uska grla (`/reports/bottlenecks` je zatečeni endpoint koji plan 2.5 §13.1 samo sanira,
  a tabovi u §7.1 su Pregled/Trendovi/Paketi/Zakazani); dva RAW reda o predefinisanim izvještajima
  (`RAW_PROJECT.md:278–279`) zapisana su unutar odjeljka „Config versioning + rollback“, a ne u odjeljku
  o analitici. Obje stvari su nalazi u `REVIEW_ANALIZA.md` §M15, bez izmjena planova.

## Z — Zaključak Faze 2 (2026-10-03)

**Dodato**

- `REVIEW_ANALIZA.md` — završna sekcija **„Zaključak Faze 2“**: sumarna tabela ocjena za svih 15 modula
  (prosjek **F 7,8 · K 8,2 · S 7,7**), raspodjela nalaza (1 VISOKO, 38 SREDNJE, 53 NISKO), pregled
  gap tabela (236 redova: 151 ispunjeno, 65 djelimično, 15 odstupanja, 4 nedostaje, 1 van opsega),
  tabela **14 stavki koje RAW traži a nedostaju** (sa modulom i dokazom), **šest must-have unapređenja**,
  **prioritetizovani roadmap u šest valova sa procjenom napora** (~0,5 RD za val 0, ~4–5 RD val 1, ~5–6 RD
  val 2, ~4–5 RD val 3, ~2–3 RD val 4, ~8–10 RD val 5) i **sažetak stanja dokumentacije** sa ograničenjima
  ovog audita (statička analiza, bez penetracijskog testa i bez mjerenja na stagingu).
- `DOCS_CHANGELOG.md` — tabela **Pregled** dopunjena redovima **M3–M15** i redom **Z** (do sada su u
  pregledu bila samo prva dva modula), pa pregled sada odgovara stanju dokumenta.

**Izmijenjeno**

- Ništa u ranijim modulskim sekcijama `REVIEW_ANALIZA.md` i ništa u `docs/user-guide/**`; ocjene i nalazi
  M1–M15 ostaju kako su zapisani u svojim sekcijama.

**Uklonjeno**

- Ništa.

**Zašto**

- Faza 2 je zatvorena (M1–M15, tri iteracije), pa dokument treba jedan ulaz koji sabira ocjene, pokazuje
  šta od RAW-a nije isporučeno i daje redoslijed popravki s procjenom napora — bez toga bi 4 900 linija
  analize ostalo bez izlaznog zaključka.
- Red **Z** u pregledu je dodat jer tabela „Pregled“ nije bila održavana od M2; ovako se iz jednog mjesta
  vidi koji modul ima koji vodič i koje teze.

**Napomena o izvorima**

- Sumarni brojevi su izračunati iz samog `REVIEW_ANALIZA.md`: 15 sekcija `# M1`–`# M15` (ocjene iz §9),
  92 naslova nalaza sa oznakom ozbiljnosti, 236 redova gap tabela (§5) i 101 teza `### T*` u
  `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` (uz 15 blokova odluka korisnika i jedan šablon naslova).
- Procjene napora u roadmapu su recenzentske (označene `[MIŠLJENJE]`), izvedene iz broja i prirode nalaza
  po modulu; ne predstavljaju obavezu ni plan isporuke.
- **Stanje vodiča (provjereno):** 13 vodiča (M3–M15) ima obaveznu strukturu od osam sekcija; `instalacija.md`
  i `prijava-i-mfa.md` imaju šest sekcija (pisani prije usvajanja strukture) i predloženi su za poravnanje
  u Fazi 3.

---

## Val 0 — RBAC: popravka nalaza M4/B1 (2026-10-03)

**Dodato**

- U `REVIEW_ANALIZA.md`: nova sekcija `# Val 0 — popravka M4/B1` (šta je promijenjeno, dokazi iz izvršenih
  provjera, dokumentacija uz popravku, re-ocjena M4 i šta ostaje otvoreno), red u tabeli *Stanje po iteracijama*
  i oznaka `RIJEŠENO` na nalazu B1 u §M4.
- U `docs/user-guide/uloge-i-permisije.md`: česta pitanja „Uklonio sam permisiju roli, a poslije je opet tu“ i
  tehnički put za starije instalacije (`npm run cli:seed-role-permissions --dry-run`).
- U `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md`: **T31** je prepisan iz ograničenja u pravilo (detalji ispod).

**Izmijenjeno**

- `REVIEW_ANALIZA.md` §M4: gap red *Default mapping* prelazi iz **Odstupa** u **Implementirano**; ocjena
  funkcionalnosti M4 **7 → 9** (uz obrazloženje re-ocjene); sumarna tabela zaključka dobila red
  „M4 poslije vala 0“ i napomenu da je jedini `VISOKO` zatvoren (otvoreno: 0 / 0 / 38 / 53).
- `REVIEW_ANALIZA.md` §2 zaključka: must-have stavka 1 precrtana kao riješena.
- `docs/user-guide/uloge-i-permisije.md` → *Česta pitanja*: tvrdnja „Nakon instalacije ADMIN ne može otvoriti
  Grupe/Postavke — očekivano ponašanje“ zamijenjena stvarnim stanjem (svježa instalacija radi; starije
  instalacije popravljaju CLI-em).
- `docs/user-guide/uloge-i-permisije.md` → *Poznata ograničenja*: nalaz B1 zamijenjen stvarnim ograničenjem
  **aditivnog** seeda (nikad ne briše, pa se uklonjena permisija može vratiti).
- `docs/user-guide/instalacija.md` → korak 4 (**Početni podaci**): dodato da instalacija upisuje i sistemske
  role s default permisijama (ADMIN 58, AGENT 22, SUPER_ADMIN 63, ostale 4–6 — ukupno 161 veza).
- `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` **T31**: naslov i teza više ne tvrde da mapping „nije upisan“;
  teza sada opisuje upis pri instalaciji, aditivnost, `--dry-run`, audit `role_permission.replace` i nove
  izvore (`seed-install-minimum.ts:27–31`, `rbac/seed-default-role-permissions.ts:52–133`,
  `cli/seed-default-role-permissions.ts:26–75`, `authorization.constants.ts:21–30`); status
  „Privremeno (nalaz B1)“ → „Riješeno (val 0)“.
- Ovaj dokument: red **Val 0** u tabeli *Pregled*.

**Uklonjeno**

- Ništa. Nalaz B1 nije izbrisan iz §M4 — ostaje zapisan kao stanje prije popravke, s oznakom da je riješen.

**Zašto**

- B1 je bio jedini nalaz `VISOKO` u auditu i činio je RBAC neupotrebljivim za ADMIN/AGENT na svježoj
  instalaciji (403 na svakoj akciji koja traži permisiju, suprotno RAW `:195–216`). Dokumentacija je do sada
  morala opisivati to odstupanje kao „očekivano ponašanje“ — sada opisuje stvarno ponašanje.
- Seed je **aditivan**, pa dokumentacija mora objasniti i cijenu: ručno uklonjena permisija može se vratiti
  ponovnim pokretanjem. Bez te rečenice vodič bi prešutio stvarno svojstvo alata.

**Napomena o dokazima**

- Brojevi u ovoj sekciji (`161` veza; ADMIN 58 / AGENT 22 / SUPER_ADMIN 63; 494 suitea i 2 341 test) izvedeni su
  iz koda i iz stvarnog izvršavanja u razvojnom okruženju 2026-10-03, ne iz planova.
- **Nije provjereno na stvarnoj bazi:** seed i CLI su pokrenuti samo u in-memory harnessu (testovi) i protiv
  nedostupne baze (provjera izlaznog koda). Zato je za postojeće instalacije prvi korak `--dry-run`.

---

## Faza 3 — korak (a): dizajn Docs modula (2026-10-03)

**Dodato**

- `docs/DOCS_MODULE.md` (nov): dizajn modula **Dokumentacija** u aplikaciji — svrha i obim, potvrđene odluke
  (single source of truth, backend + ogledalo, provjera uloge na serveru, proširenje `simple-markdown.ts`,
  tehničke stranice samo za ADMIN/SUPER_ADMIN, BS/EN), šema frontmattera, generisano ogledalo i manifest,
  mapiranje 23 vodiča u šest dijelova wikija, navigacija i elementi stranice, backend (fajlovi, endpointi,
  učitavanje sadržaja), autorizacija i sigurnost (XSS, path traversal, tajne), renderer i pretraga, frontend,
  build/CI provjere, Faza 2 modula, koraci (b)–(d), **9 kriterija prihvatanja**, rizici R1–R9.
- `REVIEW_ANALIZA.md`: nova sekcija `# Faza 3 — korak (a)` (isporuke, nalaz **N1**, zavisnosti za korak (b)) i
  red **5** u tabeli *Stanje po iteracijama*.
- `docs/user-guide/instalacija.md` i `docs/user-guide/prijava-i-mfa.md`: poravnati sa obaveznom strukturom od
  osam sekcija (detalji pod *Izmijenjeno*).

**Izmijenjeno**

- `docs/user-guide/instalacija.md`: dodate sekcije **Čemu služi ovaj modul**, **Kome je namijenjen**, **Kako doći**
  (sa `### Prije početka` i `### Otključavanje`, koji su prije bili samostalne sekcije), nova
  **Polja, validacije i statusi** (tabela polja po koracima wizarda, statusi `SETUP_REQUIRED`/`INSTALL_LOCKED` i
  izričito „šta se ne provjerava“), **Česta pitanja i greške** (četiri pitanja + postojeća tabela kodova grešaka,
  ranije „Poruke i kodovi grešaka“) i **Povezani moduli** (ranije „Povezano“). Nijedna tvrdnja nije mijenjana;
  sadržaj je samo raspoređen u propisane sekcije.
- `docs/user-guide/prijava-i-mfa.md`: dodate sekcije **Čemu služi ovaj modul** i **Kome je namijenjen** (tekst je
  bio u uvodu bez naslova), **Kako doći** (ranije „Kako doći do modula“) i **Povezani moduli** (ranije
  „Povezano“); ostale sekcije su već odgovarale propisanoj strukturi.
- `REVIEW_ANALIZA.md` §5 zaključka: tvrdnja da dva vodiča „imaju skraćenu strukturu“ i da je poravnanje „posao
  za Fazu 3“ zamijenjena stanjem poslije koraka (a).
- `DOCS_MODULE.md`: rizik **R8** (8 tematskih vodiča bez propisane strukture — nalaz N1) i **R9** (shallow klon
  i `updatedAt`/sinhronizacija) dodati u tabelu rizika.
- Ovaj dokument: red **F3 (a)** u tabeli *Pregled* i ova sekcija.

**Uklonjeno**

- Ništa. Nalaz N1 nije prepravljan u izvorima — osam tematskih vodiča je za sada **netaknuto** i čeka odluku
  (poravnati ih u koraku (b) ili voditi ih kao tematske stranice).

**Zašto**

- Modul Dokumentacija je jedina preostala isporuka zadatka; bez dizajna (izvor sadržaja, frontmatter, autorizacija
  i provjere) implementacija bi krenula u pogrešnom smjeru — npr. dupliranjem sadržaja u kodu, što je izričito
  zabranjeno odlukom D1.
- Dokumentacija mora biti jednaka kroz cijeli modul: dva vodiča iz Faze 2 nisu imala sve sekcije, pa bi u
  aplikaciji izgledala drugačije od ostalih i imala slabiju pretragu (nema sekcije „Česta pitanja“).

**Napomena o dokazima**

- Tvrdnje o strukturi vodiča su **provjerene skriptom** nad stvarnim fajlovima u `docs/user-guide/` (23 vodiča,
  naslovi `^## `) 2026-10-03: 15 vodiča ima propisanih osam sekcija, osam ima tematske naslove.
- Kod modula **još ne postoji**; sve što u `DOCS_MODULE.md` stoji o endpointima, fajlovima i ponašanju je dizajn,
  ne opis stanja — zato u koracima (b)–(d) svaka stavka dobija dokaz iz izvršavanja (test, provjera, build).

---

## Faza 3 — korak (b): sadržaj, backend i ogledalo (2026-10-03)

**Zašto:** modul Dokumentacija je jedina preostala isporuka zadatka; korak (a) je dao dizajn, a korak (b) ga
pretvara u stvarni sadržaj i backend koji ga služi. Bez ogledala i manifesta nema ni navigacije ni pretrage, a
bez serverske provjere uloga tehničke stranice bi bile dostupne svakome.

**Dodato**

- `scripts/generate-docs-content.mjs` — generator ogledala: parsira frontmatter, sabira naslove za TOC, računa
  `updatedAt` iz gita (`git log -1 --format=%cs`; fallback na postojeći manifest u shallow klonu) i piše
  `backend/content/docs/*.md` + `manifest.json`; `--check` ne piše, nego pada ako ogledalo nije u sinhronizaciji.
- `scripts/check-docs-content.mjs` — CI provjera sa 7 provjera (frontmatter, sinhronizacija, linkovi, slike,
  tajne, `docsSlug(...)` slugovi iz koda, anchori) i novi korak u `.github/workflows/ci.yml` (uz postojećih 7
  `check-*`).
- `backend/content/docs/` — generisano ogledalo: 29 stranica + `manifest.json` (dijelovi, naslovi za TOC,
  publika, role, `order`, tagovi, `updatedAt`, broj riječi).
- `backend/src/modules/docs/` — novi modul: `docs.controller.ts` (`GET /docs/navigation`, `GET /docs/pages/:slug`,
  `GET /docs/search`, svi `Cache-Control: no-store`), `docs.service.ts` (navigacija, stranica sa prethodnom/
  sljedećom i TOC-om, pretraga sa rangiranjem i `excerptParts`), `docs-content.repository.ts` (učitava ogledalo
  jednom, `OnModuleInit`, indeks u memoriji, ne dira bazu), `docs-access.service.ts` (provjera `roles` na
  serveru), `docs.constants.ts`, `docs.error.ts` (404 za nepoznat **i** nedozvoljen slug, 503 kad ogledala nema,
  400 za prekratak upit), `docs.types.ts`.
- Testovi: `docs-access.service.spec.ts`, `docs-content.repository.spec.ts`, `docs.service.spec.ts`,
  `docs.controller.spec.ts` — 18 testova.
- Šest uvodnih stranica u `docs/user-guide/`: `pocetak-rad.md`, `pregled-modula.md` (dio `pocetak`),
  `uloge-i-dozvole.md`, `cesta-pitanja.md`, `rjecnik.md`, `sta-je-novo.md` (dio `referenca`).
- `backend/Dockerfile`: `COPY --from=builder /usr/app/content ./content` u runtime stage (bez toga bi modul u
  kontejneru vraćao 503, jer `docs/` nije u backend build contextu).

**Izmijenjeno**

- Svih **23 vodiča** dobilo je YAML frontmatter (`title, slug, module, part, audience, roles, order, tags`) i
  ujednačenu strukturu; osam tematskih vodiča (`dezurstva`, `imovina`, `najave`, `precice-i-pristupacnost`,
  `problemi`, `promjene`, `prosljedjivanje-tiketa`, `status-incidenti-i-planirani-prekidi`) prepisano je u
  propisanih osam sekcija bez novih tvrdnji.
- `docs/DOCS_MODULE.md` §3.4 — konačno mapiranje svih 29 stranica u šest dijelova, zapisane dvije izmjene u
  odnosu na radnu verziju (`usmjeravanje-i-prioritet` u dio `administrator`, `referenca` kao stvarni dio) i
  označen zatvoren nalaz N1.
- `REVIEW_ANALIZA.md` — nova sekcija `# Faza 3 — korak (b)` i red **6** u tabeli *Stanje po iteracijama*.
- `backend/src/app.module.ts` — registracija `DocsModule`.
- `README`/`CONTRIBUTING` pravilo (izmjena funkcionalnosti = izmjena Docs stranice) ostaje za korak (d).

**Uklonjeno**

- Ništa. Ogledalo je nova kopija sadržaja koja se **ne uređuje ručno** — jedini izvor ostaje `docs/user-guide/**`.

**Napomena o dokazima**

- Provjere su izvršene 2026-10-03 u razvojnom okruženju: `npx jest src/modules/docs` 18/18; cijeli backend
  498 suiteova / 2 359 testova, 0 padova (prije: 494 / 2 341); `npx tsc --noEmit`, `npx eslint src/modules/docs` i
  `npm run build` bez grešaka; `generate-docs-content.mjs --check` i `check-docs-content.mjs` prolaze
  (29 stranica, 7 provjera). **Nije** pokretano u Docker kontejneru — `COPY content` je provjeren čitanjem
  Dockerfilea, a putanja resolve-a (`dist/src/modules/docs → /usr/app/content/docs`) odgovara.
- UI još ne postoji: `/docs` ekran, meni i renderer dolaze u koraku (c), pa u aplikaciji modul trenutno nije
  vidljiv korisnicima (rute postoje i rade).

---

## Faza 3 — korak (c): `/docs` UI (2026-10-03)

**Zašto:** sadržaj i backend su bili spremni u koraku (b), ali modul nije bio vidljiv korisnicima; korak (c) je
jedina korisnička površina — meni, ruta, čitanje, pretraga i filter.

**Dodato**

- `frontend/src/pages/docs-page.tsx` — jedna stranica za `/docs` i `/docs/:slug`: preusmjerava `/docs` na prvu
  dostupnu stranicu, drži `?q=` u URL-u (pretraga je dublja od 250 ms), prikazuje breadcrumbs, datum izmjene iz
  `updatedAt`, TOC na `xl` ekranima i prethodnu/sljedeću stranicu.
- `frontend/src/components/docs/` — `docs-sidebar` (dijelovi i stranice, filtrirano po publici),
  `docs-toc` (`IntersectionObserver` prati aktivnu sekciju), `docs-search` (rezultati sa `excerptParts` kao
  `<mark>`, filtrirani po publici), `docs-breadcrumbs`, `docs-pager`, `docs-role-filter` (Sve/Korisnik/Agent/
  Administrator), `docs-empty-state` (prazno stanje, 404, nedostupno ogledalo — uvijek sa linkom na `/docs`).
- `frontend/src/services/docs-api.ts` + `frontend/src/lib/docs/use-docs.ts` — tipovi i hookovi
  (`useDocsNavigation`, `useDocsPage`, `useDocsSearch`); `docs-audience.ts` (filter po publici),
  `docs-labels.ts` (naziv dijela uz BS fallback), `slugify-heading.ts` (isti algoritam kao generator).
- Renderer: `simple-markdown.ts` je dobio **tabele**, **fenced code blokove** sa isticanjem
  (`json`, `ts`, `bash`, `sql`), **calloute** (`> **Napomena:**`, `> **Upozorenje:**`, `> **Namjena:**`) i
  **slike** (samo relativne putanje); `markdown-view.tsx` dodaje `id` i klizni `#` link naslovima `##`/`###`
  koristeći `manifest.json`, uz iste Tailwind tokene kao ostatak aplikacije.

**Izmijenjeno**

- `frontend/src/lib/navigation.ts` — nova stavka `docs` u dijelu **Pregled** (`navigation.docs`).
- `frontend/src/lib/session/route-access.ts` — `navigationAccessKinds.docs` i `canOpenDocs`
  (svaki prijavljeni korisnik; filtriranje sadržaja je na serveru).
- `frontend/src/app/router.tsx` — rute `docs` i `docs/:slug` (lazy `DocsPage`).
- `frontend/src/i18n/locales/{bs,en}/common.json` — `navigation.docs` i `docs.*` (29 ključeva po jeziku).
- `frontend/src/lib/command-palette/build-navigation-commands.spec.ts` — očekivanja dopunjena za novu stavku
  (komandna paleta prati sidebar).
- `backend/src/modules/docs/` — `roles` u stavkama navigacije i rezultatima pretrage, da klijentski filter po
  publici radi i nad pretragom.
- `backend/content/docs/manifest.json` — regenerisan: šest stranica iz koraka (b) dobilo je `updatedAt` iz gita
  (prije commita su bile `null`).

**Uklonjeno**

- Ništa. Modul ne dira postojeće ekrane; `simple-markdown` proširenja su aditivna (privatnost se renderuje isto).

**Napomena o dokazima**

- Provjere su izvršene 2026-10-03 u razvojnom okruženju: frontend **151 test fajl / 594 testa**, `npx tsc -b` i
  `npm run build` bez grešaka, svih **8 `check-*`** prolazi; backend `npx jest src/modules/docs` 4/18.
- **Živa provjera ekrana nije rađena u ovom okruženju** (nema baze): ponašanje je provjereno testovima logike,
  statičkim provjerama i buildom, a prvi pregled u browseru treba uraditi na stagingu.
- EN sadržaj stranica (prevod) je odvojen posao iz koraka (d)/budućnosti; sada su prevedeni UI okviri, a sadržaj
  je BS — kako dizajn §10 i predviđa.

---

## Faza 3 — korak (d): Faza 2 modula, pravilo i evidencija (2026-10-03)

**Zašto:** korak (c) je dao čitanje i pretragu, ali bez pomoći u kontekstu ekrana, bez povratne informacije, bez
brzog povratka na nedavno čitano i bez pravila koje dokumentaciju drži uz kod — modul time ne bi bio „gotov".

**Dodato**

- `frontend/src/lib/docs/docs-slug.ts` — mapa **ekran → stranica dokumentacije** (20 ruta, 17 stranica) i
  `docsHref`; jedina tačka koju treba dopuniti kad se doda nova ruta.
- `frontend/src/components/docs/docs-help-button.tsx` — dugme „?" koje vodi na stranicu koja opisuje ekran;
  ugrađeno u `frontend/src/components/ui/page-header.tsx`, pa ga dobijaju svi ekrani sa naslovom (bez diranja
  40+ stranica). Skriveno je na samoj Dokumentaciji, na rutama bez mapirane stranice i u štampi.
- `frontend/src/lib/docs/docs-local.ts` + `frontend/src/components/docs/docs-feedback.tsx` — „Je li vam ova
  stranica pomogla?" i lista **nedavno posjećenih** (zadnjih 5). Oba stoje u `localStorage`, bez servera, bez
  nove tabele i bez identiteta korisnika; otkazan storage (privatni režim) ne kvari stranicu.
- Štampa/PDF: dugme u zaglavlju stranice poziva `window.print()`, a print CSS skriva lijevi nav, TOC, pretragu,
  pager i feedback — ostaje čist sadržaj.
- `CONTRIBUTING.md` (nov) + sekcija u `README.md`: **izmjena funkcionalnosti povlači izmjenu stranice
  dokumentacije u istom commitu**, uz komande (`generate-docs-content.mjs`, `--check`, `check-docs-content.mjs`),
  pravila frontmattera i spisak `check-*` skripti.
- i18n: `docs.feedback.*`, `docs.recent`, `docs.print`, `docs.helpLabel`, `docs.languageNotice` (BS/EN).

**Izmijenjeno**

- `scripts/check-docs-content.mjs` — provjera 6 više ne traži samo `docsSlug('…')` literale nego i mapu
  ekran→stranica: svaki slug i svaki anchor iz `docs-slug.ts` mora postojati u sadržaju (anchori se porede sa
  `slugifyHeading` nad `##`/`###` naslovima). Time tipfeler u mapi pada u CI-u, a ne u produkciji.
- `frontend/src/pages/docs-page.tsx` — dugme za štampu, feedback na dnu, obavještenje za EN UI, `print:hidden`
  na pomoćnim kolonama, prosljeđivanje nedavno posjećenih u sidebar.
- `docs/DOCS_MODULE.md` — §9 (opis provjere 6), §10 (odluke koraka (d): feedback i nedavno u `localStorage`,
  „?" kroz mapu, štampa bez serverskog PDF-a, i18n okvir), §11 (koraci (a)–(d) označeni sa dokazima), §12
  (kriteriji 1–9 označeni + napomena šta je dokazano kako), §13 (R4, R5, R7 zatvoreni), §14.

**Ne mijenja se**

- Backend modul `docs` nije diran; njegova 4 suitea / 18 testova ostaju nepromijenjeni.
- `REVIEW_ANALIZA.md` — auditni nalazi M1–M15 ostaju nepromijenjeni; korak (d) dodaje evidenciju i ocjenu
  isporuke modula, ne dira nalaze. `docs/plans/**` i `EPHELPDESK.pdf/.docx` nisu dirani.

**Napomene i ograničenja (iskreno)**

- **Živa provjera ekrana nije rađena** u ovom okruženju (nema baze): dokazi su `tsc`, build, testovi logike i
  statičke provjere; prvi pregled u browseru treba uraditi na stagingu pri deployu.
- Feedback i nedavno posjećeno su **lokalni po uređaju** (prihvaćeno ograničenje; obrazloženje u §10 dizajna).
- **Sadržaj je samo na bosanskom**; EN je preveden samo kao UI okvir, uz vidljivo obavještenje. Prevod stranica
  ostaje odvojen posao.
- UI nema DOM testova jer repozitorij nema `jsdom`/testing-library; to je postojeće ograničenje okruženja, ne
  posljedica ovog koraka.

---

## Val 1 — nadzor i tačnost brojeva: šta se mijenja u dokumentaciji (2026-10-03)

Popravke iz vala 1 zatvorile su nalaze **M15 B1, B2, B3, B5, B6** i **prvi dio M9 B3**; dokumentacija je
morala prestati opisivati stanje koje više ne postoji („uska grla nisu na ekranu“, „dugme je onemogućeno“).

**Dodato**

- `docs/user-guide/nadzorna-ploca-i-izvjestaji.md` — **tab Uska grla** (četiri brojača, tri razreza, dnevni
  trend, poštovanje postavke) i **tab CSAT** (prosjek na važećoj skali, uzorak, prag zadovoljan, razrez po
  organizacionoj jedinici, servisu i grupi sa veličinom uzorka), oba u „Čemu služi ovaj modul“, „Kako doći“ i
  kao nova korak-po-korak uputstva (**3a. Uska grla**, **3b. CSAT razrez**).
- Isto, u tabeli polja: **CSAT (zadovoljstvo)** sada izričito kaže da skala dolazi iz postavke
  `private.csat.scaleMax` (2–10, zadano 5).

**Izmijenjeno**

- `docs/user-guide/nadzorna-ploca-i-izvjestaji.md` — nadzorna ploča: liste i SLA nadzor dolaze iz
  **ciljanih upita** (prekoračeni, dodijeljeni meni, bez izvršioca), a grafik zadnjih 14 dana je vezan na
  period i **označen kao donja granica** kad stranica nije dovoljna (B6).
- „Česta pitanja“: uklonjeno pitanje o trajno onemogućenom dugmetu „Izvještaji“ (B5) i dodana dva stvarna
  pitanja — zašto gumba nema bez prava i zašto se broj na grafiku razlikuje od brojača (B6).
- „Poznata ograničenja“: uklonjena četiri zastarjela ograničenja (uska grla nisu na ekranu, postavka ne
  djeluje, podijeljen period, onemogućeno dugme) i zamijenjena **stvarnim** — fiksna skala na tabu Trendovi,
  nekorišteni opseg sažetka (B4), grafik kao donja granica, „opterećenje admina“ samo kao izvoz, razrez po
  organizacionoj jedinici postoji na tabovima Uska grla i CSAT.
- „Povezani moduli — Postavke“: navedeni ključevi koji stvarno mijenjaju ponašanje modula
  (`private.reports.defaultWindowDays`, `private.dashboard.bottlenecks.defaultWindowDays`,
  `private.csat.scaleMax`).
- `docs/user-guide/odobrenja-i-csat.md` — skala i prag „zadovoljan“ opisani kao **konfiguracija** (80 %
  skale), uz pokazivač na tab **CSAT** u izvještajima.
- `backend/content/docs/**` — ogledalo regenerisano (`node scripts/generate-docs-content.mjs`); provjera
  `check-docs-content.mjs` prolazi (29 stranica, 7 provjera).

**Uklonjeno**

- Iz vodiča: tvrdnje da detaljan prikaz uskih grla nije na ekranu, da postavka ne djeluje na prikaz, da ista
  postavka perioda vuče i pakete izvještaja i da je dugme „Izvještaji“ trajno onemogućeno.

### CI workflow: nevalidan YAML (2026-10-03)

Ime CI koraka sadržavalo je dvotočku u neukotvljenoj vrijednosti, pa je GitHub odbio **cijeli**
`.github/workflows/ci.yml` (*„You have an error in your yaml syntax on line 73"*). Popravljeno ime koraka,
a uz to je uvedena trajna provjera `scripts/check-workflows-yaml.mjs` (dvotočka u neukotvljenom skalaru i tab
u uvlačenju) s vlastitim testom; obje su navedene u `CONTRIBUTING.md` (spisak `check-*` provjera).

### Regresija sa staginga (2026-10-03): `pageSize` grafikona

Prva verzija vala 1 tražila je `GET /tickets?pageSize=100`, a server odbija sve iznad 50
(`VALIDATION: pageSize must not be greater than 50`) — grafik zadnjih 14 dana je zato padao do isporuke ove
popravke. Dokumentacija je morala promijeniti **broj**: oba mjesta koja su pominjala „do 100 zapisa“ sada
kažu „šest stranica po 50 (do 300 tiketa)“:

- `docs/user-guide/nadzorna-ploca-i-izvjestaji.md` — FAQ o razlici brojača i grafikona i „Poznata
  ograničenja“.
- `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` — T95.
- `backend/content/docs/**` — ogledalo regenerisano; `check-docs-content.mjs` prolazi.

**Ostaje otvoreno (i dalje opisano kao ograničenje)**

- **Serije na tabu Trendovi** nisu vezane na `private.csat.scaleMax` (prag je i dalje 4 na skali 5) — dio
  nalaza **M9 B3** koji namjerno nije zatvoren u ovom valu.
- **Opseg sažetka (M15 B4)** — API prima `all`/`assignedToMe`/`requestedByMe`/`unassigned`, ploča uvijek
  traži `all`; odluka je na vlasniku, pa ostaje dokumentovano, ne „popravljeno na papiru“.
- **Živa provjera ekrana** nije rađena u ovom okruženju (nema baze) — prvi pregled u browseru treba uraditi
  na stagingu pri deployu.

### Nastavak vala 1 — M15 gapovi (2026-10-03)

Dva RAW-ova zahtjeva za nadzor (`RAW_PROJECT.md:171`, `:1031`) nisu bila nalaz nego **praznina**: nije bilo
razreza „tiketi po OU“ ni prikaza „opterećenje admina“. Oba su sada na tabu **Pregled** u izvještajima.

- `docs/user-guide/nadzorna-ploca-i-izvjestaji.md` — „Čemu služi ovaj modul“ i korak 3 sada navode **šest**
  prikaza (dodati **Tiketi po organizacionoj jedinici** i **Opterećenje admina**), uz objašnjenje da je
  opterećenje **stanje sada** (otvoreni tiketi), a ne period, i da prikazuje najviše osam osoba.
- „Poznata ograničenja“: uklonjena rečenica da opterećenje postoji samo kao izvoz vremena; sada piše da
  grafik mjeri **broj otvorenih tiketa**, dok sati ostaju u izvozu **Evidentiranje vremena**.
- `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` — T97 dopunjen novim grafikonima i njihovim izvorima
  (`originUnitVolume`, `assigneeWorkload`).
- `backend/content/docs/**` — ogledalo regenerisano; `check-docs-content.mjs` prolazi.

### Dopuna vala 1 (2026-10-03, ista večer): nazivi u razrezima umjesto ID-eva

Prijava sa staginga: tabovi **Uska grla** i **CSAT** pisali su ID-eve organizacionih jedinica, servisa i grupa —
server nije slao nazive, a nove view funkcije su red gradile kao `label: row.key`. Popravka je u kodu, a
dokumentacija je morala prestati tvrditi da je razrez „po jedinici, servisu i grupi“ dovoljan opis:

- `docs/user-guide/nadzorna-ploca-i-izvjestaji.md` — korak 3 na tabu **Uska grla** i korak 3 na tabu **CSAT**
  sada kažu da redovi nose **nazive**, a prioritet **prevod**; u „Poznata ograničenja“ dodato je pravilo da se
  naziv čita iz šifarnika u trenutku prikaza i da obrisan zapis znači **ID iz tiketa/ocjene** (nikad prazno
  polje, istorijski naziv se ne čuva).
- `docs/user-guide/odobrenja-i-csat.md` — red **Gdje se vidi** sada izričito piše „sa nazivima, ne ID-evima“;
  u „Poznata ograničenja“ isti fallback za CSAT razrez.
- `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` — T100/T101 provjereni protiv koda; tvrdnje o razrezu dopunjene
  nazivom kao dijelom odgovora servera (`label`), a ne samo ključem.
- `backend/content/docs/**` — ogledalo regenerisano; `check-docs-content.mjs` prolazi.
- **Zaštita:** `scripts/check-ticket-id-leaks.mjs` je proširen na izvještaje (zabranjen `label:`/`title:`/`text:`
  iz `.key` i `{…key}` kao JSX tekst) i dobio test `check-ticket-id-leaks.test.mjs`; oba su u CI-u.

---

### Val 2 (2026-10-04): sigurnost i vidljivost — deset nalaza, sedam stranica i evidencija

Val 2 je popravljao **ponašanje sistema**, a ne opis: dokumentacija je morala pratiti svaku promjenu koja se
vidi korisniku, i to tako da „Poznata ograničenja“ više ne obećavaju ono što je popravljeno.

**Odobrenja i CSAT (`user-guide/odobrenja-i-csat.md`)**

- korak 4 toka sada opisuje da tiket nastao kao **Nije usmjereno** dobija zahtjev za odobrenje **pri prvom
  rutiranju**, kao i rutirani tiket (isti zapis, isti sistemski događaj);
- FAQ „Nemamo obavještenje o tiketu koji čeka odobrenje“ zamijenjen je odgovorom **kome obavještenje stiže**:
  nosiocima role odobravaoca **u OU/servis opsegu tiketa**, uz fallback na handler grupu, a odluka ide naručiocu;
- „Poznata ograničenja“ više ne tvrde da obavještenje ne stiže nikome niti da `UNROUTED` nikad ne prolazi
  odobrenje — oba nalaza su označena kao **zatvorena u valu 2**, sa novim ponašanjem.

**SLA (`user-guide/sla.md`)**

- FAQ o eskalaciji bez primaoca sada kaže da ugrađeno pravilo obavještava **zaduženog agenta i handler grupu**;
- „Poznata ograničenja“: eskalacija bez mete (B1) i „satovi se ne uspostavljaju retroaktivno“ (B2) zamijenjeni
  su opisom stvarnog ponašanja — **backfill batch do 25 otvorenih tiketa bez stanja po ciklusu**, sat od
  `createdAt`, zatvoreni/arhivirani se ne diraju;
- „Prvi odgovor zavisi od SLA modula“ (B4) zamijenjeno je pravilom da se prvi odgovor **bilježi pri prvom
  agentskom odgovoru**, nezavisno od SLA-a.

**Tiketi (`user-guide/tiketi.md`)** — politika zadržavanja priloga: stara postavka modula Tiketi je **zastarjela
i bez dejstva**, a brisanje vodi isključivo modul **Privatnost** (kategorija *Prilozi*); dodata rečenica da
kolona **Prvi odgovor** ne zavisi od SLA modula.

**Pošta (`user-guide/posta.md`)** — broadcast sada prolazi **redakciju** kao svaka druga poruka; pogodak se u
tiketu bilježi kao sistemski događaj upozorenja (`ticket_redaction_warned`), po tiketu; stara tvrdnja da
broadcast ne prolazi redakciju uklonjena iz „Poznatih ograničenja“.

**Šabloni i playbooks (`user-guide/sabloni-i-playbooks.md`)** — dodato da se šablon provjerava **u trenutku
slanja** (postoji, aktivan, ispravna vrsta) i da brojač korištenja raste samo za poslan odgovor.

**Baza znanja (`user-guide/baza-znanja.md`)** — zamjena ličnih podataka radi i **na serveru** pri upisu
članka; odgovor nosi spisak zamjena, radnja ide u audit.

**Katalog usluga i forme (`user-guide/katalog-usluga-i-forme.md`)** — nacrti usluga i njihovih formi vidljivi
su **samo administratorima**; skriveno stanje se preko API-ja vraća kao „nije pronađeno“.

- `backend/content/docs/**` — ogledalo regenerisano (`node scripts/generate-docs-content.mjs`), a
  `check-docs-content.mjs` prolazi sa novim `updatedAt` datumima.
- `REVIEW_ANALIZA.md` — statusi nalaza (M6 B2, M8 B1, M9 B1/B2, M10 B1/B2/B4, M12 B2, M13 B1, M14 B1),
  re-ocjene u tabeli, nova sekcija `# Val 2 — sigurnost i vidljivost`.
- `TEZE-ZA-DOKUMENTACIJU.md` nije mijenjan u ovom valu: nijedna teza nije oborena, samo su nalazi prešli iz
  „poznatog ograničenja“ u opis stvarnog ponašanja.

---

## Val 3 (2026-10-04 – 2026-10-05): pouzdanost i performanse — devet nalaza, jedan guard, šest stranica

**Zašto:** val 3 je popravljao stanje koje ne preživi restart i koje druga instanca ne vidi (limiteri u
memoriji, SMTP veza po e-mailu), zaglavljenu isporuku e-maila bez alarma i upite koji su čitali cijeli skup pa
provjeravali red po red. Dokumentacija je morala promijeniti svaku tvrdnju koja je opisivala staro ponašanje —
uključujući jednu tvrdnju iz vala 2 koja je ostala kao „poznato ograničenje“ iako je popravka već bila u kodu.

**Pošta (`user-guide/posta.md`)** — četiri stavke iz „Poznatih ograničenja“ zamijenjene opisom stvarnog
ponašanja:

- **B1 (M12)** — zaglavljen zapis o isporuci se **preuzima ponovo** poslije 10 minuta i e-mail se šalje; broj
  takvih zapisa prikazuje pločica **Operativno zdravlje** (`stuckClaims`);
- **B3** — **SMTP veza se dijeli** (pool po konfiguraciji, keš po `host:port:tls:korisnik` i otisku lozinke;
  promjena postavki gradi novi, stari se zatvara kad ostane neiskorišten);
- **B4** — **ograničenje testnog slanja (pet u deset minuta) drži se u Redisu**, vrijedi za sve instance i ne
  resetuje se restartom (lokalna rezerva ako Redis nije dostupan);
- **B5** — **oznake polja prate jezik**: zapis u tiketu na jeziku pošiljaoca, e-mail na jeziku primaoca.

**Realtime i obavještenja (`user-guide/realtime-i-obavjestenja.md`)** — (B1, M11) članstvo u grupnim sobama i
admin rola **provjeravaju se ponovo tokom veze** (najviše svakih pet minuta), uz napomenu da se sobe
pojedinačnih tiketa ne diraju jer ih `ticket:join` provjerava pri svakom ulasku; (B2) ulazak/izlazak iz sobe
tiketa **ograničen na 30 poruka u minuti po vezi**, isto kao „kucanje“.

**Tiketi (`user-guide/tiketi.md`)** — (B2, M8) ograničenje broadcasta **drži se u Redisu po korisniku i
minuti**, pa vrijedi za sve instance.

**Šabloni i playbooks (`user-guide/sabloni-i-playbooks.md`)** — (B2, M13) picker **filtrira opseg i redoslijed
u upitu** (globalni ili po servisu/kategoriji/grupi, `usageCount` pa naziv, najviše 200; opseg „drugdje“ samo
uz „prikaži sve“), lista playbooka po nazivu. Uklonjena je i **zastarjela tvrdnja iz vala 2** da „slanje ne
provjerava tip i aktivnost šablona“ — ta provjera postoji od vala 2, ali je stara rečenica ostala u
„Poznatim ograničenjima“.

**Baza znanja (`user-guide/baza-znanja.md`)** — (B5, M14) vidljivost cijele stranice rješava se **grupnim
čitanjem** (OU put iz keširanog kataloga, usluge i članovi grupa po jedan upit), pretraga je dio upita, a
presretanje gleda **500 najsvježijih** objavljenih članaka usluge; lista i dalje nema paginaciju (navedeno).

**Šta je novo (`user-guide/sta-je-novo.md`) — dopuna i za val 2 i za val 3.** Provjera je pokazala da stranica
nije bila ažurirana za **val 2**: zadnji red je bio `2026-10-03`, iako `DOCS_CHANGELOG.md` val 2 opisuje od
2026-10-04 i vodiči su tada mijenjani (odgovor na pitanje vlasnika). Dodata su četiri reda: val 2 (deset
nalaza) i tri reda vala 3 (zajednički limiti; pouzdanost e-maila; realtime/šabloni/baza znanja), svaki sa
linkom na stranice koje detalj objašnjavaju.

**Evidencija:**

- `REVIEW_ANALIZA.md` — devet naslova nalaza označeno „✅ popravljeno u valu 3“, novi redovi 11 (val 2) i 12
  (val 3) u tabeli „Stanje po iteracijama“, ažurirana raspodjela ozbiljnosti (**0 / 0 / 20 SREDNJE / 46
  NISKO**) i nova sekcija `# Val 3 — pouzdanost i performanse` (tabela nalaz→popravka→dokaz, dokazi iz
  testova, sopstvene greške, šta ostaje otvoreno).
- `backend/content/docs/**` — ogledalo regenerisano (`node scripts/generate-docs-content.mjs`), a
  `check-docs-content.mjs` prolazi (29 stranica, 7 provjera). **Napomena za svaki sljedeći val:** generator
  izvodi `updatedAt` iz datuma zadnjeg commita izvorne stranice, pa se ogledalo mora regenerisati **poslije**
  commita stranica i manifest commitovati zasebno — prvi commit vala 3 to nije uradio, pa je `updatedAt`
  zaostajao (uhvaćeno na re-verifikaciji 2026-10-05 i ispravljeno u `docs(val 3): manifest…`).
- `TEZE-ZA-DOKUMENTACIJU.md` nije mijenjan: nijedna teza nije oborena, nalazi su samo prešli iz „poznatog
  ograničenja“ u opis stvarnog ponašanja (isto pravilo kao u valu 2).

## Dokumentacija — automatika i veze (2026-10-05)

**Zašto:** dva propusta iz istog korijena — „Šta je novo“ je ručna tabela koju nijedna provjera nije čuvala
(zato je **val 2 prošao bez ijednog reda u njoj**, a otkriveno je tek 2026-10-05 na pitanje vlasnika), a
kolona *Detalji* navodi fajlove kao običan tekst, pa se u aplikaciji ne mogu otvoriti (renderer je puštao samo
`http(s)`/`mailto`, a relativne `.md` veze su ostajale mrtvo slovo).

**Šta je urađeno:**

- generator ogledala prevodi relativne `.md` veze na objavljene stranice u rute `/docs/<slug>(#anchor)` —
  svi unakrsni linkovi u vodičima sada su klikabilni u aplikaciji;
- `safeHref` pušta isključivo `/docs/[a-z0-9-]+(#anchor)?` (ništa drugo relativno), a `MarkdownView` interne
  rute otvara kroz router (bez novog taba), vanjske kao i do sada;
- `check-docs-content.mjs` dobija dvije provjere: **rute** (slug i anchor postoje) i **sta-je-novo** (zadnji
  datum ≥ zadnji datum iz `DOCS_CHANGELOG.md`; `[interno]` se preskače; reference iz kolone *Detalji* moraju
  biti objavljene stranice) — ukupno 9 provjera, uz `node --test scripts/check-docs-content.test.mjs` u CI;
- tabela u `sta-je-novo.md` sada nosi linkove, val 3 je datiran 2026-10-05, a ograničenje „ne ažurira se
  automatski“ zamijenjeno opisom stvarne CI provjere; `CONTRIBUTING.md` i `docs/DOCS_MODULE.md` opisuju obaveze.

**Dokaz da provjera hvata propust:** sa simuliranim starim sadržajem (bez redova za 2026-10-04/05) provjera
pada sa `[sta-je-novo] DOCS_CHANGELOG.md ima unos 2026-10-05, a „Šta je novo“ zadnji red 2026-10-03`.

## Dokumentacija — automatika i veze: CI popravka (2026-10-05)

Poslije commita automatike (`3b2b726`) CI je pao **bez ijednog joba** — GitHub je odbio cijeli
`.github/workflows/ci.yml` jer je korak „Check docs content and mirror sync“ imao **dva `run:` ključa**
(prvi je puštao provjeru, drugi test provjere). To je ista klasa greške kao 2026-10-03 (dvotočka u
neukotvljenoj vrijednosti) — GitHub validira workflow tek poslije pusha, pa tipfeler tiho ugasi CI.

Odvojeno od toga, `master` je bio crven od vala 3 (`95e98d2e`, `08d07231`): korak „Check docs content and
mirror sync“ padao je sa `[sinhronizacija] manifest.json se razlikuje — pokrenite generator`. Uzrok nije bio
sadržaj, nego **plitak klon**: `actions/checkout` po zadanom uzima samo vršni commit, a `git log -1 -- <fajl>`
tada vraća datum tog vršnog commita za **svaki** fajl, pa generator u CI-ju izračuna druge datume nego što su
u commitovanom manifestu. Lokalno (pun klon) provjera je prolazila, u CI-ju nije.

**Šta je urađeno:**

- `.github/workflows/ci.yml`: test provjere je vlastiti korak („Test the docs-content guard itself“), a
  `frontend` job radi **pun checkout** (`with: fetch-depth: 0`) — datum iz gita je tada stvaran;
- `generate-docs-content.mjs`: `isShallowRepository()` — u plitkom klonu se datum **ne izmišlja**, nego se
  preuzme vrijednost iz postojećeg manifesta (`previousUpdatedAt`);
- `check-docs-content.mjs`: u plitkom klonu se porede svi podaci osim `updatedAt`
  (`sameManifestIgnoringDates`) + ispisuje se napomena `plitki klon: updatedAt ... (git fetch --unshallow)`;
- `check-workflows-yaml.mjs`: sada hvata i **ponovljeni ključ u istom bloku** (lista je vlastita mapa, pa su
  dva `- name:` koraka ispravna), uz test koji reprodukuje tačno ovaj propust;
- `DOCS_MODULE.md` §3.3 i `CONTRIBUTING.md`: zapisano da CI koristi punu istoriju i šta znači plitak klon.

**Dokaz:** stari skripti u plitkom klonu (`git clone --depth 1`) padaju sa `manifest.json se razlikuje —
pokrenite generator`; poslije popravke isti klon prolazi (`Docs provjera: OK (29 stranica, 9 provjera).` uz
napomenu o plitkom klonu). Novi guard na starom `ci.yml` vraća `.github/workflows/ci.yml:76 ponovljeni ključ
"run" u istom bloku — GitHub odbija cijeli workflow`, a na popravljenom fajlu je čist.

## Dokumentacija — prikaz datuma „Ažurirano“ (2026-10-05)

Zaglavlje stranice dokumentacije prikazivalo je datum iz manifesta kroz
`new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" })`. U runtimeu bez bosanskih CLDR podataka to
izlazi kao **„Ažurirano: 2026 M10 4“** (isto ograničenje koje `announcement-view.ts:117` i
`asset-view.ts:209–210` već opisuju za svoje ekrane), a `new Date("2026-10-04")` se tumači kao UTC ponoć, pa
zapadno od UTC prikaže prethodni dan.

**Šta je urađeno:**

- `frontend/src/lib/docs/format-docs-date.ts` (nov): `formatDocsDate(value, t)` čita datum iz stringa
  (`YYYY-MM-DD`, uz opcionalni dio s vremenom), provjerava da je datum stvaran (npr. `2026-02-30` → `null`) i
  ime mjeseca uzima iz prijevoda `changes.calendar.months.m<indeks>` — bez `Intl.DateTimeFormat`;
- `docs-page.tsx`: neispravan ili nepoznat datum prikazuje „Ažurirano: —“ (ključ `docs.updatedAtUnknown`);
- novi ključ `docs.updatedAtValue` u `bs` („{{day}}. {{month}} {{year}}.“) i `en` („{{month}} {{day}}, {{year}}“);
- `frontend/src/lib/docs/format-docs-date.spec.ts` (nov): 4 testa (bs/en, dio s vremenom, neispravni datumi).

## Vodiči — napomene o dostupnosti u korisničkom jeziku (2026-10-05)

Dvije korisničke stranice nosile su napomenu s **tehničkim oznakama** koje čitalac-vodiča ne može provjeriti:

- `docs/user-guide/status-incidenti-i-planirani-prekidi.md:13` — „Paket 2.7 · važi od verzije s modulom
  `status-page` (commit 1cb86d6 i dalje)“;
- `docs/user-guide/prosljedjivanje-tiketa.md:13` — „Paket 1.1 · važi od verzije sa migracijom
  `20260926090000_ticket_forward_event`“.

**Provjera u istoriji koda (dokaz da su datumi tačni):** modul `status-page` uveden je commitima `415925fb`
(API) i `2aa25f15` (UI), oba **28.09.2026**; `1cb86d6` (28.09.2026) je popravka kojom su `/status` rute za
čitanje postale dostupne **prijavljenim korisnicima** — prije nje ih je `RoleGuard` odbijao jer nemaju
`@RequirePermissions`. Prosljeđivanje tiketa uvedeno je commitom `9667689d` (**25.09.2026**) s migracijom
`20260926090000_ticket_forward_event` (**26.09.2026**).

**Šta je urađeno:** obje napomene su prepisane u korisnički jezik, s datumom od kojeg je mogućnost dostupna
(„dostupno u verzijama od 28.09.2026.“ i „od 26.09.2026.“); tehnički commit/migracija ostaju u `REVIEW_ANALIZA.md`
i u istoriji koda. Ponašanje aplikacije se ne mijenja.

## SLA — dnevnik skenera prijavljuje stvarni zaostatak, M10 B5 (2026-10-05)

**Nalaz (NISKO, otvoren od Faze 2):** uzorak dnevnika skenera SLA računao je `remaining` kao
`processed - slaScanBatchSize`. Ciklus nikad ne obradi više stanja nego što ih je pročitao u batchu (2000), pa je
izraz praktično uvijek **0** i nadzor je davao sliku da nema zaostatka — baš u situaciji kad ga ima.

**Šta je urađeno (interna izmjena, bez promjene ponašanja prema korisniku):**

- `backend/src/modules/sla/count-due-ticket-sla-states.ts` (nov): broji stanja koja su **još** due
  (`resolutionCompletedAt = null`, `nextDueAt <= now`) — isti `where` koji koristi i sam skener, na istom
  indeksu `@@index([resolutionCompletedAt, nextDueAt])` (`backend/prisma/schema/sla.prisma:92`);
- `ticket-sla-timers.service.ts`: nova metoda `countDue()` koja se poziva **poslije** ciklusa (obrađeno stanje je
  u međuvremenu pomjerilo `nextDueAt`, zato mjerenje prije ciklusa ne bi bilo tačno);
- `sla-scan.processor.ts`: u log ide stvarni broj (`sla_scan_remaining=<n>`), uz komentar zašto stara formula nije
  radila; `format-sla-scan-sample.ts` i imena polja u logu **nepromijenjeni** (nema prekida za postojeći log pipeline);
- testovi: `count-due-ticket-sla-states.spec.ts` (nov, 3 testa: `where`, isključen modul bez upita, `now` default) i
  `sla-scan.processor.spec.ts` (traži `sla_scan_remaining=23` umjesto nule).

**Dokaz:** `npx jest src/modules/sla` → **26 suita / 71 test**; `npx tsc --noEmit` → 0; `npm run lint` → 0 grešaka.

**Iz vodiča uklonjeno:** `docs/user-guide/sla.md` više ne navodi ograničenje „uzorak može prikazati da nema
zaostatka“ — ono je ovim zatvoreno.

## CSAT na trendovima prati skalu iz postavke, M9 B3 drugi dio (2026-10-05)

**Nalaz (NISKO, otvoren od vala 1):** tab **Pregled** i tab **CSAT** čitali su skalu iz postavke
`private.csat.scaleMax`, ali **serije na tabu Trendovi** računale su „zadovoljan“ kao ocjenu ≥ 4 na skali do 5 —
konstante `reportCsatSatisfiedMinRating = 4` i `reportCsatScaleMax = 5`. Promjena skale na 10 mijenjala je
Pregled i CSAT, a trendove ne.

**Šta je urađeno (backend):**

- `reports/trends/report-trends-configuration.loader.ts` čita i `private.csat.scaleMax` (parser
  `parseCsatScaleMax` je izvezen iz `reports/parse-reports-configuration.ts` — jedan parser za sve tri površine,
  granica 2–10, neispravno → 5);
- `ReportTrendsConfiguration` nosi `csatScaleMax`, a prag se izvodi u `assemble-report-trends.ts` preko
  `satisfiedMinRating(scaleMax)` (80 % skale, isto pravilo kao CSAT modul);
- **oba izvora** koriste isti prag: SQL (`count(*) FILTER (WHERE r.rating >= ${input.csatSatisfiedMinRating})`)
  i in-memory izvor; ranije su imali konstantu;
- keš ključ trendova sada sadrži i skalu (`csatScale`), pa promjena postavke ne vraća stari proračun iz keša;
- konstante `reportCsatScaleMax`/`reportCsatSatisfiedMinRating` ostaju **samo kao rezerva** i dokumentovane su tako.

**Testovi:** `report-trends.spec.ts` — nov test sa `csatScaleMax: 10` (prag 8, ocjena 5 nije „zadovoljna“, a
`settings` vraća 10/8) i `csatScaleMax` u osnovnoj konfiguraciji; nov
`report-trends-configuration.loader.spec.ts` (3 testa: validna skala, rezerva za neispravan unos, ostale postavke
nepromijenjene).

**Iz vodiča uklonjeno:** `user-guide/nadzorna-ploca-i-izvjestaji.md` i `user-guide/odobrenja-i-csat.md` više ne
navode „skala na trendovima je fiksna“; tabela u `odobrenja-i-csat.md` sada pominje i **Trendovi** kao mjesto gdje
se CSAT vidi.

## Postavke bez potrošača i `scope` sažetka — uklanjanje, M15 B4 i ispravka nalaza (2026-10-05)

Odluka vlasnika (2026-10-05): „ukloniti“ za sve što registar nudi, a nijedan kod ne čita. Prije uklanjanja
provjereno je **svako** polje u cijelom repou (backend, frontend, e2e, skripte) — i tu se našla greška u ranijem
nalazu.

**Ispravka ranijeg nalaza (važno).** U `REVIEW_ANALIZA.md` (§Val 2, §3) stoji da je 18 registriranih postavki bez
ijedne reference. To je tačno za **11** postavki, ali **nije** za sedam postavki održavanja
(`public.maintenance.*`): njih čita **frontend** iz javnog snimka postavki —
`frontend/src/lib/maintenance/parse-public-maintenance.ts` (banner na ekranu i oznaka servisa u izboru servisa pri
kreiranju tiketa, `use-public-maintenance.ts:42`). Prvobitna provjera je gledala samo backend, pa je propustila
potrošača. Tih sedam postavki **ostaje**; uklonjeno je 11.

**Uklonjeno (11):**

| Gdje je bilo | Šta je uklonjeno | Zašto je bilo mrtvo |
|---|---|---|
| Čarobnjak za instalaciju i registar | `private.addons.sla`, `…autoAssign`, `…timeTracking`, `…serviceDowntime` | Prekidač se prikazivao s opisom „uključuje ili isključuje dodatak“, a nijedan kod ga ne čita: auto-dodjela je polje po servisu (`autoAssignStrategy`), praćenje vremena ima `private.timeTracking.*`, nedostupnost `private.services.downtimeScheduling.*`, SLA nema kapiju |
| Registar | `private.changeLog.settings.enabled`, `…routing.enabled`, `…sla.enabled`, `…includeDiff`, `…requireReason` | Dnevnik izmjena se upisuje bezuslovno, a razlog se traži u kodu toka; nijedna od pet postavki nije imala potrošača |
| Registar | `private.integrations.teams.appShortName`, `…appDescription` | Generisanje Teams paketa čita brending, ne ove postavke |

Uz to je uklonjena kategorija **„Dnevnik izmjena“** (ostala bi prazna), njeni prijevodi i prijevodi uklonjenih
postavki, te kopije u čarobnjaku (`frontend/src/lib/install-addon-copy.ts`). Čarobnjak ne mijenja kod — listu
dodataka dobija s API-ja, pa uklanjanje iz kataloga automatski uklanja i prekidače iz ekrana.

**M15 B4 — `scope` sažetka.** `GET /reports/dashboard/summary` primao je `scope=all|assignedToMe|requestedByMe|
unassigned` i držao **četiri** keš ključa, a ploča je uvijek tražila `all` i lične brojače (`assignedToMe`,
`requestedByMe`) čitala iz istog odgovora. Uklonjeni su: parametar i DTO, `ticketSummaryScopeClause`, segment iz
keš ključa i polje `scope` iz odgovora — jedna površina, jedan ključ.

**Dokazi:** `npx jest --maxWorkers=2` → **519 prošlih + 5 preskočenih suita (524)**, **2510 prošlo / 2541 test**
(31 preskočen), 0 padova; `npx tsc --noEmit` → 0; `npm run lint` → 0 grešaka; frontend `tsc -b` → 0 i
`vitest` → **158 fajlova / 643 testa**; `Docs provjera: OK (29 stranica, 9 provjera)`.

**Iz vodiča:** `instalacija.md` više ne nabraja uklonjene dodatke (liste zadano uključenih/isključenih su
usklađene s katalogom), a `nadzorna-ploca-i-izvjestaji.md` više ne opisuje neiskorišteni opseg sažetka.

## Mrtve površine iz must-have liste — preview rutanja i dvije postavke bez efekta (2026-10-05)

**M7 B2 — preview rutanja u koraku pregleda.** Ruta `POST /tickets/routing-preview` radila je od ranije (isti motor
kao kreiranje, bez upisa i bez internih id-eva), ali je nijedan ekran nije zvao: korak pregleda je samo pisao da se
ishod „određuje pri slanju“. Sada pregled prikazuje **ciljnu grupu**, **dubinu fallbacka**, **SLA profil** ili
poruku da tiket ide u neusmjereni red. Novi fajlovi u frontend-u:
`services/tickets-routing-preview-api.ts`, `lib/tickets/use-ticket-routing-preview.ts`,
`lib/tickets/describe-routing-preview.ts` (+ test), izmjena `components/tickets/create-ticket-review-view.tsx`.

**M9 B4 — `private.ticket.approvals.allowRequesterManager`.** Postavka se čitala, validirala i prenosila u
konfiguraciju, a nijedna logika je nije koristila (odobravanje po AD menadžeru nije implementirano). Uklonjena je
zajedno s poljem u tipu, parseru i loaderu.

**M8 B3 — `private.ticket.savedViews.allowSharing`.** Parser je vrijednost provjeravao, a zatim uvijek vraćao
`allowSharing: false` (dijeljenje sačuvanih pogleda nije implementirano). Postavka je uklonjena; prikazi ostaju lični.

**`roleSource`.** Ostaje **bez promjene koda**: kod i UI dosljedno govore `local_db` / `ad_groups` i role se zaista
čitaju iz AD grupa; RAW navodi `entra_groups`. Preimenovanje bi tražilo migraciju postojećih vrijednosti u bazama, a
funkcionalnost je ista — zato je razlika zavedena kao dokumentovano odstupanje (`REVIEW_ANALIZA.md`, §M8 i §5).

**Iz vodiča:** `usmjeravanje-i-prioritet.md` više ne navodi da pregled ne koristi preview; u uvodu je opisan
prikaz ishoda rutanja pri kreiranju.

**Dokazi:** backend `tsc --noEmit` → 0; `npx jest src/modules/tickets src/modules/settings src/modules/notifications
--maxWorkers=2` → 148 suita / 768 testova; frontend `tsc -b` → 0, `vitest` → 159 fajlova / 649 testova.

## E2E pokrivenost pošte — spec 36 (2026-10-05, M12)

Must-have tačka 6 tražila je e2e za module koji ga nisu imali; portal znanja (34) i nadzorna ploča (35) dobili su
specove u valu 4, a **pošta** je ostala bez njih. Novi `e2e/tests/36-notifications-email.spec.ts` pinuje ugovor
vanjskog kanala:

- `/ops/health` → `components.email` (`lastSentAt` je `null` ili ISO datum; `stuckClaims` je cijeli broj ≥ 0 — to je
  ulaz u upozorenje iz M12 B1);
- `POST /ops/alerts/test` → kanal `email` sa statusom iz skupa `sent/partial/failed/skipped`; ako je `skipped`,
  razlog mora biti poznat (`email_channel_disabled`, `no_recipients`, `not_configured`), pa **isključen SMTP ne
  ruši poziv** i administratorski ekran i dalje dobija odgovor po kanalima;
- `inApp` kanal je `sent`, red tipa `ops.alert` se pojavi u listi obavijesti, a `POST /notifications/:id/read`
  vraća `isRead: true` (broj nepročitanih ne raste);
- UI: pločica **Slanje e-maila** prikazuje jedno od tri stanja, a **Pošalji testni alarm** u toastu ispiše
  `E-mail: <status> (<n>)` uz ostale kanale.

**Dokazi:** `npx tsc --noEmit -p tsconfig.json` u `e2e/` → 0; `npx playwright test --list` → **70 testova u 36
fajlova** (prije 68/35). Spec se izvršava samo na živom stacku (`E2E_API_URL`).

## EN stranice vodiča — prevodi i izbor jezika (2026-10-05, val 5)

Dizajn Docs modula (§10) predviđao je prevode kao `docs/user-guide/en/<slug>.md`, a korak (d) ih je ostavio za
„odvojen posao“ uz obavijest `docs.languageNotice`. Odluka vlasnika 2026-10-05: prevesti **ključne** stranice.

**Prevedeno (5 stranica):** Početak rada, Prijava i potvrda u dva koraka (MFA), Tiketi, Uloge i dozvole, Česta
pitanja. Nazivi na engleskom: *Getting started*, *Sign-in and two-step verification (MFA)*, *Tickets*, *Roles and
permissions*, *Frequently asked questions*.

**Kako radi.** Prevod je isti dokument na drugom jeziku: isti slug, isti obavezni frontmatter, tijelo na
engleskom. Generator ga piše u `backend/content/docs/en/<slug>.md`, a u manifest dodaje `englishTitle` (naslov
prevoda, `null` kad prevoda nema). API prima `?locale=bs|en`: `GET /docs/pages/:slug?locale=en` vraća engleski
tekst kad prevod postoji, a inače bosanski uz `translated: false`; `GET /docs/navigation?locale=en` mijenja naslove
samo onih stranica koje imaju prevod. Nepoznata vrijednost `locale` je 400. Prevoda bez bosanskog originala nema —
provjera pada ako se pojavi.

**UI.** Jezik sadržaja prati jezik interfejsa. Obavijest „Sadržaj dokumenata je za sada samo na bosanskom jeziku“
sada se prikazuje **samo** na stranicama bez prevoda, pa čitalac na engleskom zna šta ga čeka.

**Dokazi:** backend `tsc --noEmit` → 0; `npx jest src/modules/docs --maxWorkers=2` → **4 suita / 23 testa**
(prije 18); frontend `tsc -b` → 0 i `vitest` → **158 fajlova / 649 testova**; `Docs provjera: OK (29 stranica,
5 prevoda, 10 provjera)`; `node --test scripts/check-docs-content.test.mjs` → 8/8.

## Policy paketi — bundle, povlačenje i isključivanje (2026-10-05, val 5, M5)

**Zašto:** vodič `policy-paketi.md` je opisivao modul koji je stvarno radio samo pola posla — paket je nosio role
i permisije, a polja paketa (klasifikacija, odobrenje, SLA profil) i povlačenje primjene nisu postojali. Šest
nalaza iz `REVIEW_ANALIZA.md` §M5 zatvoreno je u kodu, a stranica je prepisana tako da opisuje novo stanje.

### Izmijenjeno

| Dokument | Šta je izmijenjeno | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/policy-paketi.md` | Cilj primjene je **OJ, servis ili oboje** (nova sekcija *Isključivanje paketa postavkom*, red u tabeli validacija, ispravljen FAQ); tok primjene ima korak **Provjeri** i plan iznad dugmadi; nova sekcija **Povlačenje paketa** (šta se uklanja, šta ostaje, veza se skida samo ako pokazuje na taj paket); paket opisuje i kao bundle (klasifikacija, odobrenje, SLA profil na servisu, `servicePolicyResolved`); uklonjena su četiri „poznata ograničenja“ (B1 djelimično, B2 djelimično, B3, B4, B5, B6) i zamijenjena onim što stvarno ostaje otvoreno (obavezna polja tiketa, novi paketi kroz postavke, povratak servisnih polja) | `backend/src/modules/policy-packs/{policy-packs.controller.ts, policy-packs.service.ts, apply-policy-pack.ts, unapply-policy-pack.ts, apply-policy-pack-service-policy.ts, plan-policy-pack-service-policy.ts, remove-policy-pack-user-grants.ts, unbind-policy-pack-targets.ts, list-policy-packs.ts, read-disabled-policy-pack-keys.ts}`, `backend/src/modules/settings/definitions/policy-pack-settings.ts`, `frontend/src/components/policy-packs/policy-pack-apply-form.tsx`, `frontend/src/lib/policy-packs/policy-pack-apply-target.ts` |
| `backend/content/docs/**` (ogledalo) | Regenerisan manifest i stranica iz izvora | `node scripts/generate-docs-content.mjs` |
| `REVIEW_ANALIZA.md` | Nova sekcija `# Val 5 — M5: policy paketi kao stvarni bundle` — tabela nalaza B1–B6, dokazi (komande i rezultati) i šta ostaje otvoreno | `npx jest src/modules/policy-packs --maxWorkers=2` → 11 suite-a / 43 testa; `npx vitest run` → 653 testa |

### Ostaje otvoreno

- **Obavezna polja tiketa nisu dio paketa** — žive u `private.workflow.requiredFields.byServiceJson`; spajanje te
  postavke s paketima je samostalan posao.
- **Novi paketi se ne dodaju kroz postavke** — registar je i dalje u kodu; postavka samo isključuje postojeće.
- **Povlačenje ne vraća klasifikaciju, odobrenje i SLA profil servisa** — stare vrijednosti ostaju u auditu
  (`servicePolicyBefore` / `servicePolicyAfter` u `policy_pack.apply`).

## Serverski testovi za sedam notifications servisa (2026-10-05, val 5, M13)

**Zašto:** must-have tačka 6 traži serverske testove za servise bez njih. Sedam servisa u modulu obavještenja
nije imalo nijedan direktan spec, a nose odluke koje korisnik osjeti (brojač nepročitanih, dva kanala koji ne
smiju srušiti jedan drugog, dnevni i sedmični sažetak, korisničke postavke).

### Dodato

| Dokument | Šta je dodato | Izvor u kodu (dokaz) |
|---|---|---|
| `REVIEW_ANALIZA.md` (`# Val 5 — M13`) | Tabela sedam specova sa pokrivenim ponašanjem, dokazi (komande i brojevi) i napomena da proizvodni kod nije mijenjan | `npx jest src/modules/notifications --maxWorkers=2` → 38 suite-a / 199 testova (prije 31 / 155) |
| `backend/src/modules/notifications/**` (specovi) | `notifications.service.spec.ts`, `fan-out/notifications-fan-out.service.spec.ts`, `notification-retention.scheduler.service.spec.ts`, `preferences/notification-digest.scheduler.service.spec.ts`, `preferences/notification-digest.service.spec.ts`, `preferences/notification-preferences.service.spec.ts`, `preferences/weekly-ticket-report.service.spec.ts` | `npx tsc --noEmit` → 0 grešaka |

### Ostaje otvoreno

- **Nijedna korisnička dokumentacija nije mijenjana** — specovi nisu promijenili ponašanje, pa nije bilo osnova
  za izmjenu vodiča (pravilo „izmjena funkcionalnosti = izmjena Docs stranice“ nije aktivirano).

## Tiketi — tip zahtjeva i željeni rok (2026-10-05, val 5, M8 #3)

**Zašto:** `docs/user-guide/tiketi.md` je do sada nosio „poznato ograničenje“ da polja **tip zahtjeva** i
**rok (due date)** iz projektnog zadatka ne postoje kao zasebna polja. Kod je sada dobio oba (`requestType` je
nova kolona, `dueAt` je postojao u šemi ali se nikad nije upisivao), pa je ograničenje zamijenjeno pravilima i
razlikovanjem dva roka.

### Izmijenjeno

| Dokument | Šta je izmijenjeno | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/tiketi.md` | Korak prijave dobio **Tip zahtjeva** i **Željeni rok**; tabela polja dobila oba reda s pravilima i kodovima grešaka (`INVALID_REQUEST_TYPE`, `INVALID_DUE_AT`, `DUE_AT_IN_PAST`); sekcija **Svojstva** opisuje prikaz u detalju; FAQ dobio dvije stavke; „poznato ograničenje“ zamijenjeno objema stvarnim ograničenjima (tip ≠ forma usluge, željeni rok ≠ SLA rok) | `backend/src/modules/tickets/{create-ticket.ts, update-ticket.ts, normalize-ticket-request-type.ts, parse-ticket-due-at.ts, to-ticket-response.ts}`, `frontend/src/components/tickets/{create-ticket-fields.tsx, ticket-detail-sidebar.tsx}` |
| `backend/content/docs/**` (ogledalo) | Regenerisan manifest i stranica iz izvora | `node scripts/generate-docs-content.mjs` |
| `REVIEW_ANALIZA.md` | Nova sekcija `# Val 5 — M8 #3` — tabela dodataka, dokazi i šta ostaje | `npx jest src/modules/tickets --maxWorkers=2` → 98 suite-a / 555 testova; `npx vitest run` → 653 testa |

### Ostaje otvoreno

- **Tip zahtjeva je slobodan tekst** (do 80 znakova), ne šifarnik; RAW ne traži administraciju tipova.
- **Željeni rok ne pokreće automatiku** (nema eskalacije ni SLA veze) — i dokumentovan je kao razlika prema SLA roku.

## Usmjeravanje i prioritet — mrtva postavka change loga i prekidač matrice prioriteta (2026-10-05, val 5, M7 B2/B5)

**Zašto:** vodič je nosio dva ograničenja koja kod više ne opravdava — da postavka „change log za routing“ ne
mijenja ponašanje (B2) i da se matrica prioriteta ne može isključiti (B5).

### Dodato / izmijenjeno

| Dokument | Šta je izmijenjeno | Izvor u kodu (dokaz) |
|---|---|---|
| `docs/user-guide/usmjeravanje-i-prioritet.md` | §5 dobio korak 4: prekidač `private.ticket.priorityMatrix.enabled` isključuje čitanje matrice, prioritet tada računa ugrađena formula, ćelije ostaju sačuvane; iz „Poznatih ograničenja“ **uklonjena** rečenica o change logu (B2), a ograničenje B5 prepisano (ose Nizak–Kritičan ostaju odstupanje) | `backend/src/modules/tickets/priority/ticket-priority-matrix-configuration.loader.ts`, `backend/src/modules/tickets/resolve-ticket-priority.ts:28–44` |
| `docs/user-guide/sla.md` | Ispod tabele **Matrica prioriteta** dodata napomena o prekidaču i ugrađenoj formuli | isto |
| `docs/user-guide/sta-je-novo.md` | Dva nova reda za 2026-10-05: tip zahtjeva i željeni rok (M8 #3) i prekidač matrice prioriteta (M7 B5) | `docs/user-guide/tiketi.md`, `docs/user-guide/usmjeravanje-i-prioritet.md` |
| `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` | T46: status „Važi“ bez ograde o prekidaču + osvježeni izvori (`resolve-ticket-priority.ts:28–44`, `override-ticket-priority.ts:41–141`, `update-ticket.ts:148–175`) | `backend/src/modules/tickets/**` |
| `backend/content/docs/**` (ogledalo) | Regenerisan manifest i stranice iz izvora | `node scripts/generate-docs-content.mjs` |
| `REVIEW_ANALIZA.md` | §M7: B2 označen kao zatvoren (uklanjanje), B5 kao popravljen; nova sekcija `# Val 5 — M7 B2/B5` s tabelom slojeva i dokazima | `npx jest src/modules/tickets src/modules/problems src/modules/settings src/modules/sla src/modules/assets src/modules/status-page --maxWorkers=2` → **170 suita / 865 testova** |

### Ostaje otvoreno

- **Ose matrice ostaju `TicketImpact`/`TicketUrgency`** (Nizak–Kritičan), a ne `self/team/unit/company` i
  `low/medium/high` iz RAW-a — promjena bi bila izmjena šeme i podataka, pa je zadržano postojeće stanje.
- **Nijedna stranica EN vodiča nije dirana** — izmjena je u BS izvoru; ogledalo i prevodi prate generator.

## E2E kapija u CI-ju — nema više tihog preskakanja (2026-10-05, val 5)

**Zašto:** e2e job je mogao biti zelen bez ijednog izvršenog testa — bez repozitorijske varijable
`E2E_API_URL` korak je ispisivao `::notice` i izlazio s `exit 0`. Nalaz je bio kritičan jer je zelena kvačica
izgledala kao dokaz da specovi prolaze.

### Izmijenjeno

| Dokument | Šta je izmijenjeno | Izvor (dokaz) |
|---|---|---|
| `e2e/README.md` | Upozorenje „zelen job ništa ne dokazuje“ zamijenjeno tvrdim ugovorom: bez `E2E_API_URL` job **pada** s `E2E did not run`; tabela varijabli i koraci 4. ažurirani | `.github/workflows/ci.yml` (korak **Run E2E**: `::error … exit 1`) |
| `.github/workflows/ci.yml` | `::notice` + `exit 0` → `::error` + `exit 1` | nema izvršnog dokaza u sandboksu; YAML korak je jedina izmjena |

### Ostaje otvoreno

- **Prvi živi prolaz** (70 testova u 36 fajlova) pokreće vlasnik na `master` poslije spajanja grane; dokaz je
  GitHub Actions (izvještaj i artefakt).
- **Specovi se u sandboksu ne mogu izvršiti** — provjereni su tipovi (`tsc --noEmit` → 0) i kompletan spisak
  (`playwright test --list`).

## E2E trijaža prvog crvenog prolaza — popravke u e2e sloju (2026-10-05, val 5)

**Zašto:** prvi pravi prolaz (70 testova / 36 fajlova) završio je s 58 passed / 10 failed / 2 flaky. Proslijeđeni
sažetak iz loga nosio je samo prvu liniju greške, pa se za dio padova (11, 14, 17, 22, 26, 27) nije znalo šta je
stiglo, a `skipped` se nije vidio uopšte. Uz to su dva pada (`TypeError: fetch failed`, specovi 23 i 24) bila bez
metode, putanje i `cause`.

**Dokazi:** `cd e2e && npx tsc --noEmit -p tsconfig.json` → 0; `node --test scripts/summarize-playwright-json.test.mjs`
→ 10/10; `node scripts/check-docs-content.mjs` → OK (29 stranica, 5 prevoda, 10 provjera).

| Dokument / fajl | Šta je izmijenjeno | Izvor (dokaz) |
|---|---|---|
| `e2e/README.md` | Odjeljak „Triage: reading a red run“: uzorak izlaza sada pokazuje detalje (Expected/Received) i blok `SKIPPED … — a skip is not a pass`; dodata su tri pravila — detalj do 15 linija, mrežna greška imenuje metodu/putanju/`cause`, `GET` se ponavlja jednom | `e2e/scripts/summarize-playwright-json.mjs` (`errorDetail`, `collectSkipped`), `e2e/helpers/api-client.ts` (`send`) |
| `e2e/helpers/create-ticket.ts` | Nova `slugifyServiceLabel`; slug usluge više ne nosi razmak iz labele | `backend/src/modules/service-catalog/normalize-service-slug.ts:5` (`INVALID_SLUG`, spec 15 ×2) |
| `e2e/tests/10-forward-cross-ou.spec.ts` | DN djeteta se izvodi iz `root.distinguishedName` umjesto fiksnog `,OU=E2E` | `backend/src/modules/organizational-units/assert-distinguished-name-matches-parent.ts:17` |
| `e2e/helpers/api-client.ts` | `NETWORK <METHOD> <path> failed: … (cause: …)` + jedan ponovljeni `GET` | padovi specova 23 i 24 (`TypeError: fetch failed`) |
| `e2e/scripts/summarize-playwright-json.mjs` (+ `*.test.mjs`) | `errorDetail` i `collectSkipped`, `detail` u `collectFailures`, ispis u `formatSummary` | 10/10 samotest |
| `e2e/tests/18-reports-schedules.spec.ts` | Razdvojen na „bez pošte“ i „pošalji test“ (vidljiv skip uz `EMAIL_CHANNEL_DISABLED`) | `backend/src/modules/reports/schedules/scheduled-report.runner.ts:137` |
| `REVIEW_ANALIZA.md` | Novi odjeljak „Val 5 — trijaža prvog crvenog e2e prolaza“ (D-14…D-18, dokazi, otvoreno) | ova izmjena |
| `.github/workflows/ci.yml` | Novi `workflow_dispatch` input `specs` (npr. `10,18,22`): trijaža se svodi na te fajlove, nepoznat broj ruši korak | `node scripts/check-workflows-yaml.mjs`, parse YAML-a, `bash -n` nad `run` blokovima |
| `e2e/README.md` | Uz trijažni režim opisan i `specs` input; sažetak ispisuje `NEXT TRIAGE RUN: specs=…` spremno za kopiranje | `e2e/scripts/summarize-playwright-json.mjs` (`triageSpecNumbers`) |

### Ostaje otvoreno

- **Specovi 11, 12, 14, 17, 20–23, 26, 27** čekaju novi prolaz: sažetak u logu sada nosi detalje, a artefakt
  (`playwright-report`, `test-results`, `results.json`) ostaje dokaz.
- **Axe nalazi (22 ×4)** traže spisak pravila i selektora iz `test-results/a11y-report.jsonl`; statička provjera
  kontrasta je zelena (`node scripts/check-theme-contrast.mjs`), pa nalaz dolazi iz DOM-a, ne iz palete.
- **Prvi zelen prolaz** je kapija za merge na `master` (radi vlasnik).
