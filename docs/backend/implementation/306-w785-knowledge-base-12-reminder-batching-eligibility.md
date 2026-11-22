# W7.85 — `BA-knowledge-base-12`: podsjetnik na pregled čita backlog u serijama i šalje se samo onima koji mogu djelovati

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „Reminder query je unbounded i recipients ne provjeravaju active/scope eligibility”<br>
**Kod:** `review-reminder-recipients.ts` (novo), `knowledge-base-review-reminder.service.ts` (prepisan
`processDue`), `knowledge-base.constants.ts` (dva limita), `knowledge-base-review-reminder-worker.module.ts`
(loader u workeru), `create-in-memory-knowledge-article-delegate.ts` (`cursor`/`skip`),
`knowledge-base-review-reminder.dedupe.spec.ts` (4 → **7** testova), `review-reminder-recipients.spec.ts` (novo,
**7** testova)<br>
**DB migracija:** nema<br>
**CI:** [`44965421827`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44965421827) — **success**
(prvi run [`44963521657`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44963521657) pao na DI tokenu,
vidi „CI i testni dokaz”)

## Nalaz

Dvije stvari u istom poslu, obje tihe:

1. **Neograničeno čitanje.** `knowledgeArticle.findMany({ where: { status: 'PUBLISHED', reviewDueAt: … } })` —
   bez `take`, bez `orderBy`, bez stranica. Svaki članak kojem pregled dospijeva ulazi u memoriju radnog procesa
   odjednom. Uz to je za **svaki** članak išao poseban upit za članove owner grupe: jedna grupa sa pedeset due
   članaka = pedeset identičnih upita.
2. **Recipijent koji ne može djelovati.** Resolver je vraćao `ownerUserId` (ili **svakog** člana owner grupe)
   bez ijedne provjere: deaktiviran račun, anonimizovana identiteta ili osoba kojoj je dozvola/scope ukinuta
   nastavljala je dobijati podsjetnike za članke koje **ne može** urediti. To je i šum za korisnika i pogrešan
   signal vlasništva (article izgleda „zbrinut” jer podsjetnik ode u prazno).

Napomena iz audita — „dedupe sprječava duplikat, ali ne rješava stalni backlog i orphan ownership” — pokrivena je
ovdje utoliko što backlog sada **teče** u serijama, a članak bez podobnog recipijenta završava kao **upozorenje u
logu** umjesto tihog preskakanja. Scheduler health signali su `BA-knowledge-base-13`.

## Rješenje

**Serije s ključem napretka + filter podobnosti, bez promjene ugovora.**

- **Serije.** `findMany` ide sa `orderBy: [{ reviewDueAt: 'asc' }, { id: 'asc' }]`, `take:
  reminderCandidateBatchSize` (**100**) i keyset kurzorom (`cursor: { id }, skip: 1`). Najstariji dug se obrađuje
  prvi, memorija ostaje ravna bez obzira na backlog, a jedan prolaz staje poslije `reminderMaximumBatches`
  (**20** ⇒ najviše 2.000 članaka) — nema beskonačnog posla u jednom tick-u.
- **Keširanje po prolazu.** Članstvo owner grupe se pamti za cijeli prolaz (`Map<groupId, Set<userId>>`) — tri
  članka iste grupe = **jedan** membership upit. Isto važi za `isActive` i za authorization kontekst po korisniku.
- **Podobnost.** Novi `resolveReviewReminderRecipients` propušta samo korisnike koji: (1) imaju **aktivan** račun,
  (2) imaju razrješiv authorization kontekst i (3) imaju **`knowledge.article.write` u OU i servisu tog članka**
  (SuperAdmin prolazi po definiciji). Vraća sortiran, determinističan spisak — dedupe ključevi ostaju isti.
- **Vidljivost problema.** Ako se scope članka više ne može razriješiti (npr. OU je obrisana) ili nema podobnog
  recipijenta, prolaz **ne pada** i ne šuti: piše `logger.warn` sa ID-em članka i vlasništvom. To je osnova za
  health signal iz `BA-knowledge-base-13`.
- **Wiring.** Worker modul sada provida `PrincipalContextLoader` + `AuthorizationContextLoader` (isto kao
  `report-schedules-worker.module.ts`), pa eligibility radi u worker procesu bez povlačenja API modula.
- **Testni dubl.** In-memory `knowledgeArticle.findMany` naučio je `cursor`/`skip` (Prisma semantika: kurzor
  pozicionira, `skip` preskače) — inače bi spec dokazivao petlju koju produkcijski upit ne izvršava.

### Zašto ne `hasMore`/stranice u API-ju

Ovo nije korisnički endpoint nego sweep; nema kome da vrati stranicu. Serije + cap daju istu zaštitu memorije bez
novog ugovora, a `processDue()` i dalje vraća broj **stvarno poslanih** notifikacija (isti tip, isti pozivaoci).

### Cijena

Po članku: jedan `loadKnowledgeArticleScope` (OU put je keširan katalogom kad je dostupan + jedan `service`
lookup), jedno `user.findUnique` i jedan `loader.loadBySubjectId` — svi keširani po korisniku/grupi unutar
prolaza. Za tipičan sajt sa nekoliko desetina due članaka to je manje upita nego prije (membership N+1 je nestao).

## Direktni testni dokaz

**`knowledge-base-review-reminder.dedupe.spec.ts` (4 → 7):**

- **deaktiviran vlasnik** ne dobija ništa (`0` poslanih, nula notifikacija);
- **vlasnik bez dozvole** (aktivan, ali kontekst bez `knowledge.article.write`) ne dobija ništa;
- **250 due članaka** prolazi u **tri** serije (100 + 100 + 50) i pošalje **250** notifikacija — dokaz da je
  čitanje ograničeno, a posao ipak završen;
- **tri članka iste owner grupe** ⇒ **jedan** membership upit i 6 notifikacija;
- postojeća četiri testa (dedupe po `(article, reviewDueAt, user)`, novi ciklus poslije pregleda, isključen ciklus)
  prolaze nepromijenjena.

**`review-reminder-recipients.spec.ts` (novo, 7):** aktivan + dozvola u scopeu → prolazi; deaktiviran → ispada
**prije** nego što se kontekst uopšte traži; dozvola u drugoj OU/servisu → ispada; nema konteksta → ispada;
SuperAdmin → prolazi; grupa se filtrira (neaktivan ispada, „autsajder” bez dozvole ispada, rezultat sortiran) i
**drugi članak iste grupe ne ponavlja** membership ni kontekste; članak bez vlasnika i bez grupe → prazno, bez
ijednog upita.

**Ostalo:** backend `knowledge-base`+`users`+`audit-log`+`notifications` **114 suite / 593 testa** (11
integracionih suite preskočeno lokalno), `eslint` zelen, `tsc --noEmit` bez novih grešaka u diranim fajlovima.

## CI i testni dokaz

Prvi run [`44963521657`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44963521657) na `48087d0` pao je
u jobu `Backend build + test`, korak **„Run suites previously blocked by missing generated Prisma types”**
(`npm run test:safety-net:compile`): `worker.module.spec.ts` nije mogao podići graf —
„Nest can't resolve dependencies of the KnowledgeBaseReviewReminderService (PrismaService,
KnowledgeBaseConfigurationLoader, ?, SettingsService)”.

**Uzrok nije bio test nego DI.** Servis je loader deklarisao kao `import type`, pa ga TypeScript izbaci iz emitovanog
koda i `emitDecoratorMetadata` upiše `Function` kao token konstruktora; worker modul je bio ispravan (oba loadera su
registrovana), ali Nest nije imao šta da razriješi. Popravka je vrijednosni import u
`knowledge-base-review-reminder.service.ts`; `worker.module.spec.ts` time postaje i regresioni test za ovaj paket —
pada čim se token izgubi.

Finalni run [`44965421827`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44965421827) na `b7cc886`:
**success** za `Detect changes`, `Docs guard`, `Backend build + test` (uključujući safety-net korak), `Backend
container + supply chain`, `Frontend build + test`, `Backend PostgreSQL + Redis integration` i `CI gate`; E2E poslovi
(`install wizard`, `critical flows`) i read-only inventory su `skipped`, kako je konfigurisano za push.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-12` (P2). Modul je time **12/19** (`01`–`12`).
- Ostaju otvoreni u `25-knowledge-base.md`: 7 nalaza, **P1: nema** (`13`–`15` P2; `16`–`19` P3).
- Globalno nakon regenerisanih zbira: **696 nalaza, 303 zatvoreno / 393 otvoreno**; Val 7 **82/111**, otvoreno
  **29** (P1 0 / P2 15 / P3 14).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Rollback: revert `48087d0`/`b7cc886` vraća neograničeno čitanje i slanje
neaktivnim/neovlaštenim korisnicima; nema podataka za vraćanje.

**Preostali rizik (dokumentovan):**

1. **Cap od 2.000 članaka po prolazu.** Ako je backlog veći, ostatak se obrađuje u sljedećem tick-u (i dalje
   sortirano po najstarijem dugu) — uz `logger.warn` kad se cap dostigne, pa je zaostajanje vidljivo. Trajni
   health signal (backlog, last-success) je `BA-knowledge-base-13`.
2. **Eligibility je „trenutna dozvola”.** Ako korisnik dobije dozvolu poslije neuspjelog prolaza, podsjetnik će
   dobiti u sljedećem — dedupe ključ nije potrošen jer notifikacija nikad nije nastala.
3. **Scope se čita po članku** (uz keširan OU put i kontekste); za vrlo velike backloge to je i dalje linearno,
   ali ograničeno serijama i bez membership N+1.

## Sljedeći paket

**W7.86 — `BA-knowledge-base-13` (P2): scheduler nema Redis-loss reconciliation; njegov gubitak ugrožava i view
flush.**
