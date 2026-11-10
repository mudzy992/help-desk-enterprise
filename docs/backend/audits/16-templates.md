# Backend audit 16 — `templates`

**Status:** audit završen  
**Datum:** 2026-10-23  
**Rizik modula:** visok  
**Baseline ocjena:** **5,35/10**  
**Nalazi:** 3 P1, 7 P2, 3 P3

## 1. Executive summary

`templates` pruža shared/personal response templatee, lokalizovano renderovanje, scoped picker, verzionirane playbook definicije i snapshot checkliste na ticketu. Osnova je jaka: tri odvojene permisije, ticket access policy prije rendera/checkliste, soft-delete, transactional change log + ticket system event, row lock pri attachu i historijski snapshot koraka.

Baseline je ipak **5,35/10**. Tri P1 nalaza pogađaju izolaciju i enforcement. Service-scoped manager kroz management list/get može pročitati tijela svih shared templatea i sve playbook instrukcije iz drugih servisa, iako ih ne može izmijeniti. Settings kvar se tiho prevodi u default `enabled/warn`, pa instalacija konfigurirana na `block` može dozvoliti resolve/close sa otvorenim obaveznim koracima. Concurrent playbook update radi višekoračni delete/upsert/update bez locka/version preconditiona, pa paralelni administratori mogu proizvesti mješovitu definiciju, izgubljene korake i verziju koja ne opisuje nijedan originalni zahtjev.

Dodatno su step/upgrade događaji race-osjetljivi, auto-attach je best-effort bez recoveryja, config rollback zaobilazi template domenske provjere, playbook name uniqueness je aplikacijska, a management/candidate liste su hard-truncated bez paginacije. Nema P0. Popravke se ne implementiraju prije završetka cijelog audit ciklusa.

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

`TemplatesConfigurationLoader` hvata svaku settings grešku i vraća default: templates/playbooks/autoAttach `true`, required mode `warn`. Time konfigurirana sigurnosna politika `block` postaje neblokirajući warning tokom settings incidenta. Isto tako eksplicitno ugašena funkcija može biti uključena.

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
| BA-templates-01 | P1       | Service-scoped manager može čitati sve foreign shared templatee i playbooke             | otvoreno |
| BA-templates-02 | P1       | Settings kvar fail-open spušta `block` na `warn` i može uključiti ugašene funkcije      | otvoreno |
| BA-templates-03 | P1       | Concurrent playbook update može proizvesti hibrid koraka/scopea i netačnu verziju       | otvoreno |
| BA-templates-04 | P2       | Concurrent step/upgrade operacije daju duple ili izostale evente i stale checked redove | otvoreno |
| BA-templates-05 | P2       | Auto-attach je best-effort bez durable retry/reconciliationa                            | otvoreno |
| BA-templates-06 | P2       | Config snapshot nije potpun i apply zaobilazi domenske invariante/audit                 | otvoreno |
| BA-templates-07 | P2       | Playbook name uniqueness je read-before-write bez DB zaštite                            | otvoreno |
| BA-templates-08 | P2       | Definition updatei su silent last-write-wins bez optimistic preconditiona               | otvoreno |
| BA-templates-09 | P2       | Management/candidate liste su hard-truncated bez paginacije/truncation ugovora          | otvoreno |
| BA-templates-10 | P2       | Aktivna ticket-checklista nema DB partial unique invariant                              | otvoreno |
| BA-templates-11 | P3       | Realtime publish poslije commita nema retry/delivery signal                             | otvoreno |
| BA-templates-12 | P3       | Bulk attach do 500 ticketa nema async job/time budget i može biti dug HTTP zahtjev      | otvoreno |
| BA-templates-13 | P3       | Kritična scope/failure/concurrency matrica nije lokalno izvršiva ni kompletna           | otvoreno |

## 13. Detalji P1 nalaza

### BA-templates-01 — Foreign management read

`hasPermission` ignoriše assignment scope. `listManaged/get` i playbook `list/get` nakon toga ne filtriraju prema `canManageSharedScope`; samo izračunaju `canEdit`. Service-scoped manager dobija body, instrukcije, reference i scope svih redova. Query mora prije paginationa primijeniti authorized service scope; global/category/group redovi zahtijevaju global manage assignment. Negativni interleaved-page test je obavezan.

### BA-templates-02 — Enforcement zavisi od tihog defaulta

Loader guta settings grešku i vraća `requiredStepsOnResolve:'warn'`. Ako je stvarna politika `block`, resolve/close prolazi upravo tokom settings/DB incidenta. Za enforcement setting koristiti last-known-good cache ili fail-closed `block`; feature enable state ne smije iz `false` preći u default `true` zbog read greške. Fallback mora imati metric/health signal.

### BA-templates-03 — Concurrent definition corruption

Playbook update učita current, zatim bez locka briše joinove/uklonjene korake, upsertuje svaki korak i inkrementira version. Dva administratora mogu međusobno obrisati/dodati korake i scope, a oba change loga tvrde drugačiji before/after. Uvesti optimistic version/If-Match ili `FOR UPDATE`, conditional version increment i atomic replacement; jedan writer mora dobiti conflict.

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

Postojeći scoped manageri možda se oslanjaju na globalni read, pa prvo izmjeriti usage i uvesti eksplicitno global read/manage pravo. DB unique migracije trebaju classifier duplikata/više aktivnih checklisti bez automatskog brisanja. Fail-closed settings mora koristiti last-known-good da izolovani settings incident ne blokira sav rad nepotrebno.

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
