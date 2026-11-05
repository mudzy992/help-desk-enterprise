# Backend audit 16 — `templates`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **5,35/10**  
**Nalazi:** 3 P1, 7 P2, 3 P3

## 1. Executive summary

`templates` pruža shared/personal response templatee, lokalizovano renderovanje, scoped picker, verzionirane playbook definicije i snapshot checkliste na ticketu. Osnova je jaka: tri odvojene permisije, ticket access policy prije rendera/checkliste, soft-delete, transactional change log + ticket system event, row lock pri attachu i historijski snapshot koraka.

Baseline je ipak **5,35/10**. Tri P1 nalaza pogađaju izolaciju i enforcement. Service-scoped manager kroz management list/get može pročitati tijela svih shared templatea i sve playbook instrukcije iz drugih servisa, iako ih ne može izmijeniti. Settings kvar se tiho prevodi u default `enabled/warn`, pa instalacija konfigurirana na `block` može dozvoliti resolve/close sa otvorenim obaveznim koracima. Concurrent playbook update radi višekoračni delete/upsert/update bez locka/version preconditiona, pa paralelni administratori mogu proizvesti mješovitu definiciju, izgubljene korake i verziju koja ne opisuje nijedan originalni zahtjev.

Dodatno su step/upgrade događaji race-osjetljivi, auto-attach je best-effort bez recoveryja, config rollback zaobilazi template domenske provjere, playbook name uniqueness je aplikacijska, a management/candidate liste su hard-truncated bez paginacije. Nema P0. Implementacije se rade serijski po preciznom BA ID scopeu i uz zasebno odobrenje. W5.47–W5.49 su implementirali BA-templates-01/02/03; njihovi statusi su zatvoreni 2026-11-04 po izričitoj owner-directed uputi, uz zabilježenu činjenicu da E2E 16 nije pokrenut na finalnom SHA-u. Korisnik je sada odobrio BA-templates-04–10 (P2); acceptance/test plan izveden iz ovog audita dokumentovan je prije izmjene u [paketu 127](../implementation/127-templates-04-10-acceptance-plan.md). Nalazi 11–13 ostaju zasebni.


**BA-templates-01/02/03 — owner-directed closeout (2026-11-04):** korisnik je izričito zatražio dokumentovanje i zatvaranje ovih već implementiranih nalaza. W5.47/`41850862952` (uz registrovani PostgreSQL test) i Perf `41850863346`, W5.48/CI `41876403874`, te W5.49/CI `41886832531` i Perf `41886832553` daju dokaz implementacije; zajednički noviji CI `41915186268` i Perf `41915186314` prošli su na `70f52e4b`. E2E install/critical-flow poslovi su u push CI-ju `skipped`; run `41916949315` prošao je 4/4 na starijem SHA-u `a625446c` i pokrivao spec 42, ne templates E2E 16. Zato redovi su zatvoreni owner-directed, ali se ne tvrdi da je relevantni templates E2E ili puni Val-5 acceptance prošao; E2E 16 i ukupni Val-5 segment sign-off ostaju pending. Nije pristupljeno ciljnoj bazi niti pokretana migracija. Ovaj agent nije otvorio PR niti izvršio merge/deploy; read-only GitHub provjera pokazuje `master` na `70f52e4b`, a deployment nije potvrđen.


**BA-templates-04/10 code closeout (2026-11-05):** checklist mutacije/upgrade sada se serijalizuju, completion je tranzicijski idempotentan, a migracija štiti jedan aktivni checklist red uz fail-fast preflight. Commit `8e2692ca` prošao je automatski CI [`41923550409`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41923550409) i Perf [`41923550410`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41923550410); CI je uključio disposable PostgreSQL suite i migration replay. Nije korištena ciljna baza niti pokretana target migracija. E2E 16 je bio skipped/nepokrenut, pa Val-5 segment i puni critical-flow acceptance ostaju odvojeni pending gateovi.

**BA-templates-05 code closeout (2026-11-05):** ticket create transakcijski zapisuje deduplicirani auto-attach intent; worker ga retry/reconcile-a, a ops-health UI pokazuje pending/processing/dead-letter stanje. CI [`41984028707`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41984028707) na finalnom SHA `9158730b` prošao je backend build/lint/test, PostgreSQL/Redis integraciju i frontend build/test; BA-05 PostgreSQL integration spec bio je u runneru. Prvi CI `41983148763` otkrio je readonly fixture tip i in-memory fake `$queryRaw` koji je aktivirao SQL serializer putanju; oba testa popravljena su u `9158730`. Perf [`41983148764`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41983148764) prošao je na `bf302d0`, tj. glavnom implementacijskom commitu prije finalnog test-fixture-only popravka; zaseban Perf run za `9158730` nije se pojavio. Nije korištena ciljna baza niti pokretana migracija. E2E critical-flow/install poslovi su skipped, tako da se ne tvrdi full Val-5/E2E acceptance.

**BA-templates-06 code closeout (2026-11-05):** commit [`a7e1c2d`](https://github.com/mudzy992/help-desk-enterprise/commit/a7e1c2d7929a7b3fda4d385ada02c4c527415a30) čuva shared response-template service/category/group scopeove, playbook scope/version i uređene korake u snapshotima; apply validira reference prije izmjena, ignoriše personal templatee, piše actor/reason audit i inkrementira lokalnu playbook verziju samo kad se promijene koraci. Portable export/parse/resolve sada prenosi te relacije preko natural keys, uključujući knowledge-article i response-template reference u koracima. Lokalno su ciljano prošli 34/34 Jest testa (TypeScript diagnostics isključeni jer generated Prisma client nedostaje u checkoutu), isolated-runner harness 9/9, targeted ESLint i `git diff --check`. Automatski CI [`41989293925`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41989293925) i Perf [`41989293930`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41989293930) prošli su na istom SHA-u; CI je uključio generated-Prisma build/test i izolovanu PostgreSQL/Redis integraciju sa registrovanim BA-06 suiteom. Nije korištena ciljna baza niti lokalno pokretana migracija. Push E2E install/critical poslovi su skipped; templates E2E 16 i puni Val-5/BA-15 acceptance ostaju pending. Detaljan acceptance zapis je u [paketu 128](../implementation/128-templates-06-config-snapshot-restore.md).

**BA-templates-07 code closeout (2026-11-05):** implementacija je u [`1b6e483`](https://github.com/mudzy992/help-desk-enterprise/commit/1b6e483cc3f39de71fe0234e4651c4b1eae8fec1), a Prisma 7 adapter P2002 mapping correction i finalni SHA su [`600b981`](https://github.com/mudzy992/help-desk-enterprise/commit/600b9810288a2cfb7e038f8931202085bf647cf6). Migracija zaključava tabelu, fail-fast preflighte case-insensitive live duplikate bez auto-repaira i dodaje partial unique `lower(name)` gdje `deletedAt IS NULL`; inactive live redovi i dalje rezervišu ime, soft-delete ga oslobađa. Registrovani PostgreSQL suite pokriva paralelni create/rename, inactive live duplikat i soft-delete reuse. CI [`41994559728`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41994559728) na finalnom SHA-u prošao je generated-Prisma build/lint/test, disposable migration replay i PostgreSQL/Redis integration. Prvi CI [`41993188382`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41993188382) otkrio je da named index u Prisma 7 stiže kroz `meta.driverAdapterError.cause.constraint.index`; mapper je ispravljen prije finalnog zelenog CI-ja. Perf [`41993188370`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41993188370) prošao je na performance-relevant SHA `1b6e483`; mapper-only follow-up nije pokrenuo novi Perf po path filteru. Nije korištena ciljna baza niti lokalno pokretana migracija. Push E2E jobs su skipped; templates E2E 16, Val-5 i BA-15 full-flow acceptance ostaju pending. Puni dokaz je u [paketu 129](../implementation/129-templates-07-live-playbook-name-uniqueness.md).

## 2. Scope i inventar

- 24 produkcijska TypeScript fajla;
- 6 direktnih specova;
- 3.079 aktuelnih produkcijskih LOC;
- 3 kontrolera i 4 injectable klase uključujući configuration loader;
- Prisma: `ResponseTemplate` i tri scope join tabele; `Playbook`, `PlaybookStep`, dvije scope tabele; `TicketPlaybook`, `TicketPlaybookStep`;
- integracije sa authorization, tickets, settings, change-log, realtime, knowledge, SLA, service catalog, config-versioning i privacy;
- E2E 16 kao primarni dokaz, uz 11, 31, 32, 36, 52 i 54 reference.

## 3. Arhitektura i poslovni tok

Shared template je globalan ili scoped na service/category/group; personal pripada agentu. Picker prvo queryja relevantne aktivne templatee, opcionalno off-scope redove, pa rangira service → category → group → global. Render učitava ticket kroz centralni access policy, bira jezik i puni strogo definisane varijable. Message write ponovo provjerava active/kind/ownership i nakon commita best-effort povećava usage counter.

Playbook definicija ima mutable header i korake sa stabilnim `stepKey`; promjena koraka povećava version. Attach pod ticket row lockom kopira korake u JSON snapshot, a check state živi u zasebnim unique redovima. Upgrade zadržava checked ključeve koji postoje u novoj verziji. `block` mode sprečava resolve/close dok required koraci nisu završeni.

## 4. API, role, permission i scope matrica

Svi controlleri koriste session + RoleGuard i staff role. Fina prava se provjeravaju u servisima:

- `ticket.templates.use`: picker, render i ticket playbook;
- `ticket.templates.personal`: personal CRUD/preview;
- `ticket.templates.manage`: shared CRUD, playbook CRUD/preview.

Ticket operacije dodatno zahtijevaju centralnu staff visibility i writable policy. Shared write provjerava i stari i novi scope; service-restricted manager može upravljati samo čistim skupom vlastitih service ID-eva, ne global/category/group scopeom.

Read parity nedostaje: `listManaged/get` za templatee i `list/get` za playbooke traže samo da bilo koji assignment sadrži manage permission, ali ne filtriraju redove prema assignment service scopeu. Response vraća kompletno tijelo, instrukcije, reference i scope, uz `canEdit:false`. Ovo krši očekivanu izolaciju service-scoped administracije.

Picker `all=true` namjerno pokazuje off-scope templatee agentu koji već ima ticket pristup; scope je tamo relevance, ne authorization. Direktni render i message write provjeravaju owner/active/kind, ali ne scope-match, što je u skladu sa “show all” UX odlukom i mora ostati eksplicitno dokumentovano.

## 5. Podaci, transakcije i konkurencija

Pozitivno:

- partial expression unique indeksi štite aktivna shared/per-owner response-template imena;
- join tabele imaju composite PK;
- playbook step ima unique `(playbookId, stepKey)`;
- checked step ima unique `(ticketPlaybookId, stepKey)`;
- attach zaključava ticket red i atomarno provjerava jednu aktivnu checklistu;
- attach/detach/upgrade/set-step drže state, change log i ticket system event u istoj transakciji.

Rupe:

- “jedan aktivni TicketPlaybook” nema partial DB unique, iako attach row lock štiti poznatu putanju;
- playbook ime nema DB unique i create race može napraviti duplikate;
- response/playbook update učitava current prije transakcije i nema optimistic precondition;
- playbook update briše scope/korake, upsertuje korake i inkrementira version; dva updatea se mogu preplitati i napraviti hibrid;
- concurrent set-step oba mogu vidjeti unchecked, oba zapisati audit/event i duplirati completion event; dva različita posljednja koraka mogu oba propustiti completion event;
- upgrade i set-step nemaju shared row lock/version precondition pa stale step može biti reinserovan ili upgrade događaj dupliran.

## 6. Sigurnost, privatnost i rendering

Placeholder allowlist je mali i namjerno ne uključuje formData, interne note ili kontakt podatke drugih osoba. Ticket se autorizuje prije učitavanja requester/service/group/OU/SLA varijabli. Personal template druge osobe se ponaša kao not-found. Requester nema pristup ticket playbook ruti, što E2E 16 eksplicitno provjerava.

Template output je plain text i ne radi HTML escaping; to je sigurno samo dok svi consumeri tretiraju rezultat kao tekst. Unknown placeholder se ne može sačuvati, a stari unknown ostaje verbatim. Public URL se encodeuje po ticket ID-u.

Najveći privacy problem je management read scope: response template može sadržati interne procedure, lozinka-ne bi-smjela-biti-tu tekst, regulatorne formulacije ili foreign service instrukcije; service-scoped admin ih može enumerisati do hard limita 1000.

## 7. Playbook lifecycle, enforcement i recovery

Snapshot dizajn čuva historijski naziv/verziju/korake nakon edit/delete definicije. Required-step guard queryja sve aktivne checkliste u bulk status promjeni i blokira samo relevantne resolve/close tranzicije. Detach zahtijeva razlog.

Nalaz je opažen u baseline auditu: prethodni `TemplatesConfigurationLoader` hvatao je svaku settings grešku i vraćao default templates/playbooks/autoAttach `true` i required mode `warn`. Time je konfigurirana sigurnosna politika `block` mogla postati neblokirajući warning tokom settings incidenta, a eksplicitno ugašena funkcija mogla se uključiti. W5.48 je promijenio ovaj put na fail-closed 503 (bez defaulta); acceptance i dokaz su u [124 — BA-templates-02](../implementation/124-templates-02-fail-closed-settings.md). U W5.48 snapshotu status je bio otvoren; owner-directed statusno zatvaranje 2026-11-04 i preostali E2E 16 gate zabilježeni su u aktuelnoj napomeni iznad.

Auto-attach se izvršava nakon ticket createa kao best-effort callback. Greška se samo loguje; nema joba, outboxa ni reconciliationa. Ticket ostaje trajno bez jedinstveno primjenjivog playbooka. Candidate query je `take:1000`; truncation može promijeniti ambiguity/choice rezultat bez indikacije.

Realtime publish je poslije commita i bez retryja. Persistirani event omogućava eventualni refresh, ali live UI može ostati stale.

## 8. Config-versioning i cross-module integracije

Config snapshot obuhvata samo shared template header/body/status/deletedAt i playbook header/status/deletedAt; ne obuhvata scope relacije ni playbook steps. Apply direktno updateuje redove po ID-u i može reaktivirati soft-deleted resurs bez domenske permission/reason/reference provjere. Ne pravi per-entity template change log; oslanja se na config-version audit. Rollback zato nije potpuna reprodukcija template/playbook konfiguracije i može stvoriti header/step/scope kombinaciju koja nikad nije postojala.

Privacy anonimizacija briše personal templatee vlasnika, što je usklađeno sa ownership modelom. Ticket message čuva template FK i prije writea ponavlja active/kind provjeru. Usage counter je namjerno best-effort statistika i ne blokira poruku.

## 9. Performance i observability

Picker je bounded na 200 i scope filter se radi u bazi. Management list i playbook list koriste `take:1000`, ali nemaju cursor, total ni truncated signal. Playbook candidate list takođe hard-truncira 1000. Bulk attach prima do 500 ticketa i obrađuje ih u batchu od pet, što je razumno, ali nema request/job time budgeta; dug HTTP request vraća per-ticket skipped rezultat.

Nema metričkih signala za settings fallback, auto-attach failure/drift, ambiguous candidate, candidate truncation, stale realtime publish, duplicate completion event ili concurrent definition conflict.

## 10. Testovi i E2E dokaz

Pokrenuto:

```bash
cd backend
npm ci
npm test -- --runInBand --runTestsByPath $(find src/modules/templates -name '*.spec.ts' -print | sort)
```

`npm ci` je instalirao 1.000 paketa i prijavio 4 moderate dependency nalaza. Jest rezultat: **0/6 suiteova izvršeno, 6/6 compile-blocked, 0 testova**. Uzrok je nepotpun generated Prisma client/enumi i delegati (`responseTemplate`, `playbook`, `ticketPlaybook`, `$transaction` i povezani modeli). Ovo nije funkcionalni pad, ali nema lokalno izvršenog direktnog dokaza.

Specovi statički pokrivaju pure normalization/ranking, active/kind provjeru, permission gate, CRUD, snapshots, attach/detach/upgrade/step i row-lock helper. Nema foreign service-scoped management read, settings-failure block bypass, concurrent playbook update, completion race, auto-attach reconciliation, config rollback parity ni >1000 candidate testa.

E2E 16 potvrđuje shared service template, auto-attach, render/send, usage counter, block mode, step completion, requester denial i cleanup. Ne pokriva navedene failure/concurrency/scope slučajeve.

## 11. Pozitivni nalazi

1. Session/role guard na svim rutama i fine permission provjere u servisu.
2. Ticket central access policy prije rendera/checkliste.
3. Shared write provjerava stari i novi scope.
4. Personal ownership je fail-closed/not-found.
5. Partial unique response-template name indeksi štite race.
6. Attach koristi ticket row lock i transactional state/event/audit.
7. Snapshot čuva ticket checklistu nakon edit/delete definicije.
8. Stable step keys zadržavaju dovršene korake na upgradeu.
9. Soft delete čuva message/playbook reference.
10. Placeholder allowlist ne izlaže formData/interne note.
11. Message write ponavlja active/kind validaciju.
12. Picker scope/query/ranking je bounded i determinističan.
13. Bulk attach ima dedupe, bounded concurrency i per-ticket rezultat.
14. Required-step guard radi bulk query bez N+1.

## 12. Registar nalaza

| ID              | Severity | Nalaz                                                                                   | Status   |
| --------------- | -------- | --------------------------------------------------------------------------------------- | -------- |
| BA-templates-01 | P1       | Service-scoped manager može čitati sve foreign shared templatee i playbooke             | zatvoreno |
| BA-templates-02 | P1       | Settings kvar fail-open spušta `block` na `warn` i može uključiti ugašene funkcije      | zatvoreno |
| BA-templates-03 | P1       | Concurrent playbook update može proizvesti hibrid koraka/scopea i netačnu verziju       | zatvoreno |
| BA-templates-04 | P2       | Concurrent step/upgrade operacije daju duple ili izostale evente i stale checked redove | zatvoreno |
| BA-templates-05 | P2       | Auto-attach je best-effort bez durable retry/reconciliationa                            | zatvoreno |
| BA-templates-06 | P2       | Config snapshot nije potpun i apply zaobilazi domenske invariante/audit                 | zatvoreno |
| BA-templates-07 | P2       | Playbook name uniqueness je read-before-write bez DB zaštite                            | zatvoreno |
| BA-templates-08 | P2       | Definition updatei su silent last-write-wins bez optimistic preconditiona               | otvoreno |
| BA-templates-09 | P2       | Management/candidate liste su hard-truncated bez paginacije/truncation ugovora          | otvoreno |
| BA-templates-10 | P2       | Aktivna ticket-checklista nema DB partial unique invariant                              | zatvoreno |
| BA-templates-11 | P3       | Realtime publish poslije commita nema retry/delivery signal                             | otvoreno |
| BA-templates-12 | P3       | Bulk attach do 500 ticketa nema async job/time budget i može biti dug HTTP zahtjev      | otvoreno |
| BA-templates-13 | P3       | Kritična scope/failure/concurrency matrica nije lokalno izvršiva ni kompletna           | otvoreno |

## 13. Detalji P1 nalaza

### BA-templates-01 — Foreign management read

`hasPermission` ignoriše assignment scope. `listManaged/get` i playbook `list/get` nakon toga ne filtriraju prema `canManageSharedScope`; samo izračunaju `canEdit`. Service-scoped manager dobija body, instrukcije, reference i scope svih redova. Query mora prije paginationa primijeniti authorized service scope; global/category/group redovi zahtijevaju global manage assignment. Negativni interleaved-page test je obavezan.

### BA-templates-02 — Enforcement zavisi od tihog defaulta

Loader guta settings grešku i vraća `requiredStepsOnResolve:'warn'`. Ako je stvarna politika `block`, resolve/close prolazi upravo tokom settings/DB incidenta. Za enforcement setting koristiti last-known-good cache ili fail-closed `block`; feature enable state ne smije iz `false` preći u default `true` zbog read greške. Fallback mora imati metric/health signal.

**W5.48 implementation checkpoint (2026-11-04):** fail-closed 503, read-failure metric i zaštićeni Ops-health signal su implementirani; resolve test provjerava da ticket ostane nepromijenjen. Branch CI [`41876403874`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41876403874) na kodnom SHA `f1077dc` je passed; push E2E poslovi su `skipped`. Perf nije pokrenut jer active-branch path filter pokriva service-catalog/perf fajlove, a W5.48 ih ne mijenja; prethodni Perf [`41850863346`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41850863346) na `c098ad4` nije dokaz za ovaj SHA. U ovom W5.48 checkpointu `BA-templates-02` je još bio otvoren; kasniji owner-directed closeout i E2E 16 ograničenje dokumentovani su u aktuelnoj napomeni iznad. Detalji/lokalni i CI dokazi su u [implementation note 124](../implementation/124-templates-02-fail-closed-settings.md).

### BA-templates-03 — Concurrent definition corruption

Playbook update učita current, zatim bez locka briše joinove/uklonjene korake, upsertuje svaki korak i inkrementira version. Dva administratora mogu međusobno obrisati/dodati korake i scope, a oba change loga tvrde drugačiji before/after. Uvesti optimistic version/If-Match ili `FOR UPDATE`, conditional version increment i atomic replacement; jedan writer mora dobiti conflict.

**W5.49 implementation checkpoint (2026-11-04):** edit šalje `expectedUpdatedAt` iz učitanog playbooka; backend odbija nedostajući token, a zastarjeli token mapira u HTTP 409. Unutar jedne transakcije conditional `updateMany` claim na `updatedAt` je prva izmjena; tek nakon njega slijede zamjena scope joinova/koraka i audit. Gubitnik CAS-a ne može ostaviti djelimičan scope, korak ili audit. Semantika checklist `version` ostaje nepromijenjena: povećava se samo ako se promijeni sadržaj koraka. Dodati su direktni testovi za missing/stale token i nulti CAS count te registrovani PostgreSQL test za dvije paralelne zamjene i konačni koherentni snapshot. Lokalni frontend suite/build, i18n, targeted lint i integration-runner harness su zeleni. Push CI [`41886832531`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41886832531) na `d983943` je passed, uključujući generated-Prisma backend suite i PostgreSQL/Redis integration; Perf smoke [`41886832553`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41886832553) na istom SHA-u je passed uz nepromijenjene pragove. E2E install-wizard i critical-flow poslovi su skipped; u tom W5.49 checkpointu `BA-templates-03` je ostao otvoren. Kasniji owner-directed closeout, bez tvrdnje o E2E 16 prolazu, dokumentovan je u aktuelnoj napomeni iznad. Nije korištena lokalna baza, pokretana migracija ili ručni full E2E/CI dispatch. Detalji su u [implementation note 125](../implementation/125-templates-03-playbook-concurrency.md); W5.49 ne obuhvata `BA-templates-08` ili druge susjedne nalaze.

## 14. Ostali nalazi i korekcije

- **04:** lock/version TicketPlaybook pri upgrade/set-step; completion event vezati za atomarnu tranziciju incomplete→complete sa idempotency ključem.
- **05:** durable post-create job/outbox i periodic reconciliation za otvorene tickete bez očekivane checkliste.
- **06:** snapshot mora obuhvatiti scope/steps/version ili ih eksplicitno izuzeti; apply kroz domain validator i per-entity audit/reason.
- **07:** case-insensitive partial unique za live playbook name i mapiran conflict.
- **08:** response template i playbook update/delete trebaju updatedAt/version precondition.
- **09:** cursor/take/total-or-hasMore i scope prije cursor/count; candidate truncation mora biti vidljiva.
- **10:** partial unique `ticketId WHERE detachedAt IS NULL` uz postojeći row lock.
- **11:** publish outbox/retry ili client catch-up cursor; metric za failed publish.
- **12:** manji sync limit ili async bulk job sa progress/cancel/idempotency ugovorom.
- **13:** generated Prisma/PostgreSQL obavezni CI shard.

## 15. Baseline score

| Presjek                      |   Težina |      Ocjena |
| ---------------------------- | -------: | ----------: |
| A. Arhitektura i granice     |      10% |        7,50 |
| B. API i ugovori             |      12% |        6,40 |
| C. Auth/authz/scope          |      15% |        4,40 |
| D. Poslovna pravila/stanje   |      13% |        5,20 |
| E. Podaci/Prisma/transakcije |      13% |        5,60 |
| F. Sigurnost/privatnost      |      12% |        5,20 |
| G. Async/integracije         |       8% |        5,00 |
| H. Testovi/dokazivost        |      10% |        3,80 |
| I. Operativnost/perf.        |       7% |        5,20 |
| **Ukupno**                   | **100%** | **5,35/10** |

Ponderisani zbir je 5,350. Otvoreni P1 nalazi ograničavaju maksimum na 7,49.

## 16. Fazni plan popravki

### Faza 0 — safety net

Generated Prisma/PostgreSQL fixture; foreign scoped management read; settings read failure u block modu; dual playbook update; parallel last-step/upgrade; auto-attach failure; config rollback; >1000 candidate; bulk timeout.

### Faza 1 — P1 izolacija i enforcement

Scope-aware management query prije paginationa; last-known-good/fail-closed settings enforcement; playbook optimistic version/row lock i conflict API.

### Faza 2 — checklist concurrency i DB invariante

TicketPlaybook partial unique, row/version lock za upgrade/set-step, idempotent completion event i playbook name unique migration.

### Faza 3 — recovery i config-versioning

Auto-attach outbox/job/reconciliation; kompletan ili eksplicitno ograničen snapshot; domain-aware apply i entity audit; realtime delivery recovery.

### Faza 4 — API i scale

Paginacija/truncation, scope-aware totals, async bulk attach i candidate ambiguity/resource budžet.

### Faza 5 — integracije i observability

Tickets resolve/bulk/merge, privacy, knowledge, service changes i config parity; metrike za fallback, conflicts, auto-attach drift i publish failure.

### Faza 6 — finalni gate

Svih šest direktnih specova, povezani tickets/config/privacy testovi i E2E 16 na finalnom SHA-u; dokumentovati “scope kao relevance” za agent picker nasuprot authorization scopeu managera.

## 17. Rizik, rollback i acceptance

Postojeći scoped manageri možda se oslanjaju na globalni read, pa prvo izmjeriti usage i uvesti eksplicitno global read/manage pravo. DB unique migracije trebaju classifier duplikata/više aktivnih checklisti bez automatskog brisanja. Settings incident ne smije oslabiti enforcement ni uključiti ugašenu funkciju. Last-known-good je dozvoljen samo ako oba svojstva čuva; eksplicitni fail-closed 503 je sigurnija alternativa, uz metric/health signal i vidljiv oporavak. W5.48 bira fail-closed, pa konfiguracijski zavisni zahtjevi mogu biti privremeno odbijeni dok se čitanje ne oporavi.

Acceptance:

1. Scoped manager ne može enumerisati foreign template/playbook sadržaj.
2. `block` ostaje block kroz settings read incident ili operacija jasno fail-closed.
3. Jedan od paralelnih definition updatea dobija conflict; nema hibrida.
4. Parallel step/upgrade proizvodi tačan state i najviše jedan logical completion event.
5. Očekivani auto-attach se eventualno izvrši ili ima vidljiv failed status.
6. Config rollback ima potpunu i auditabilnu semantiku.
7. DB štiti live playbook name i jednu aktivnu checklistu.
8. Sve liste imaju scope-aware bounded pagination/truncation.
9. Realtime i bulk operacije imaju recovery/time-budget ugovor.
10. Direktni, integration i relevantni E2E testovi prolaze.

## 18. Traceability i konačna presuda

| Nalaz | Primarni dokaz                              | Faza  |
| ----- | ------------------------------------------- | ----- |
| 01    | management list/get + `hasPermission`       | 0–1/4 |
| 02    | tolerant configuration loader + block guard | 0–1   |
| 03    | playbook delete/upsert/increment update     | 0–1   |
| 04    | stale load pa set/upgrade                   | 0–2   |
| 05    | ticket afterCreate catch-and-warn           | 0–3   |
| 06    | templates snapshot header-only direct apply | 0–3   |
| 07–10 | schema i list/query ugovori                 | 0–2/4 |
| 11–12 | post-commit publish i sync bulk             | 0–3/4 |
| 13    | Jest compile blokada                        | 0–6   |

Templates modul ima dobar snapshot, permission i transactional temelj, ali management read scope, fail-open enforcement i concurrent definition update ruše enterprise pouzdanost. Iskren baseline je **5,35/10**.
