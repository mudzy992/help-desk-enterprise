# Package closeout — `BA-service-catalog-02`

**Paket:** audit 15 / `service-catalog` — config snapshot activation i rollback<br>
**Nalaz:** `BA-service-catalog-02` (P1) — zatvoren uz service-catalog guardove i real-PostgreSQL CI dokaz<br>
**Implementacijski commit:** `32bf508036bffc2ba9ac07094f04e952edb5de08`<br>
**Finalni testani SHA:** `32bf508036bffc2ba9ac07094f04e952edb5de08`<br>
**CI:** [`41481182959`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41481182959) — success na finalnom kodnom SHA-u<br>
**Perf smoke:** [`41481183334`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41481183334) — failure samo na ticket-message latency pragu; service-catalog i query-budget gates prošli su<br>
**DB migracije:** nema Prisma schema promjene ni BA-02 migracije<br>
**PR stanje:** nema PR-a prema `master`; commit je na aktivnoj Arena grani, nije mergeovan

## Nalaz i acceptance

Config snapshot aktivacija je mogla direktno mijenjati servis/formu mimo aktuelnih service-catalog lifecycle pravila, reference i immutable zaštite. Stari kod nije imao stale-state precondition, mogao je preskočiti nepostojeće identitete, mijenjati korištenu historijsku shemu i prihvatiti nevažeće ACTIVE/routing stanje. Rollback je mogao pokušati vratiti historijske redove koji više ne postoje ili izostaviti redove nastale poslije historijskog cilja.

BA-02 acceptance je ispunjen: aktivacija poredi hash i pune skupove Service/FormVersion identiteta pod lockom prije izmjena; lifecycle tranzicije provjerava prema trenutno sačuvanom policyju; reference, slugs, form schema/lifecycle i catalog/routing invariants validiraju se prije apply-a; ticket-vezane i druge immutable FormVersion sheme se ne prepisuju; rollback je zasnovan na svježem živom stanju i ne kreira nedostajuće redove. Nema promjene u BA-10/11/12/01, BA-changes-08/13, specu 56 ili pragu `250 ms`.

## Implementacija

- `collectConfigSnapshot` dodaje `catalogStateHash`: deterministički SHA-256 nad kanonikalizovanim i sortiranim Service/FormVersion redovima, uključujući njihove sačuvane scalar vrijednosti i timestamps. Aktivacija poredi očekivani hash sa živim hashom nakon što je, u istoj Prisma transakciji, zaključala tabele/redove i učitala kompletne skupove. Hash i identiteti se provjere prije izmjena settings/SLA/catalog/routing/templates; uspješno primijenjeni snapshot vraća novi hash. Legacy snapshot bez hasha dozvoljen je samo kao katalog/form no-op koji je tačno jednak živim redovima; izmijenjeni legacy snapshot traži novu osnovu i vraća conflict.
- Tačan skup service i form ID-jeva poredi se sa bazom; duplikati, nedostajući ili dodatni identiteti ne mogu se tiho preskočiti. Validiraju se ServiceCategory/SLA profile/PolicyPack reference te FormVersion `id`, `serviceId` i `version`. Slug servisa ostaje nepromjenjiv.
- `loadCurrentServiceLifecycleConfiguration` učitava trenutno spremljeni lifecycle policy unutar transakcije, prije primjene settingsa iz kandidata. Svaka lifecycle tranzicija provjerava se kroz postojeći `assertServiceLifecycleTransition` prema tom trenutno spremljenom policyju.
- `validateMandatoryConfigSnapshot` uvijek izvršava catalog-domain i routing provjere, čak i kada su opcionalni config validation/scopes isključeni. Svaki ACTIVE servis mora imati ACTIVE formu; ACTIVE formi se poštuje postojeća multiple-active postavka. Routing pravila/identiteti i coverage se uvijek provjeravaju; nepokriveni OU/service par odbija se kad routing konfiguracija ne dopušta unrouted-queue fallback.
- Form schema prolazi kroz postojeći `parseConfiguredFormSchema`. `isFormVersionImmutable` uzima u obzir ACTIVE status i ticket count: korištena/immutable forma se ne prepisuje, nego se pri izmjeni kreira sljedeća verzija; lifecycle izmjene historijskih verzija također se materijalizuju novom verzijom gdje je potrebno. Ticket-bound red i njegova postojeća schema ostaju netaknuti. Završni materijalizovani katalog/form skup ponovo prolazi domensku validaciju prije nego se transakcija može commitovati.
- Rollback snapshot sastavlja se od svježe uhvaćenog live kataloga/hash-a i historijskog cilja. Tekući service/form redovi koji ne postoje u historijskom cilju zadržavaju se. Ako historijski cilj sadrži identitet koji je uklonjen iz živog kataloga, puni ID-set precondition odbija rollback umjesto da red tiho re-kreira.
- Mapiranje grešaka izlaže stale catalog kao HTTP 409 `CONFIG_CATALOG_STATE_CONFLICT`; domain violation je `CONFIG_CATALOG_INVARIANT_VIOLATION`. Frontend mapiranje i testovi daju korisniku objašnjenje konflikta.

## Direktni testni dokaz

- `apply-catalog-snapshot.spec.ts` pokriva stale hash bez write-a, nepotpune service/form ID skupove, nedostajuće reference, immutable/ticket-bound forme, novu verziju, slug i nedozvoljene lifecycle promjene.
- `apply-catalog-snapshot.integration.spec.ts` je dodat u `backend/scripts/run-isolated-integration.mjs`; PostgreSQL testovi provjeravaju zaključavanje i novu verziju za immutable ACTIVE formu te da stale hash odbije apply bez prepisivanja intervenišućeg service updatea.
- `validate-catalog-domain-snapshot.spec.ts`, `catalog-state-hash.spec.ts`, `load-current-service-lifecycle-configuration.spec.ts` i prošireni `config-versioning.validate.spec.ts` pokrivaju ACTIVE formu, obavezni routing validation i kad je opcionalni validator isključen, hash stabilnost, aktuelni lifecycle policy i rollback merge/hash.
- Lokalni targeted backend Jest na ekvivalentnom BA-02 patchu `cb8b27b6686e2360dedee2b419917da4be272d54` prošao je **7 suites / 32 tests**; ESLint za `config-versioning`, targeted Prettier i integration harness (**3/3**) prošli su. Frontend config-version mapper/helper testovi prošli su **5/5**, a produkcijski frontend build je prošao. Ovo su lokalni testovi iz prije rebase checkpointa; konačni rebased kodni SHA je dodatno pokriven punim CI-jem ispod.
- Lokalni full frontend `npm test` timeoutovao je nakon približno **180,7 s** bez aggregate rezultata — **nije passed**. Lokalni backend build/typecheck nije potvrđen jer generated Prisma Client/enumi nisu bili dostupni. Lokalni `npm run test:integration` stao je na preflightu zbog nedostajućeg `DATABASE_URL`; stvarni PostgreSQL testovi nisu se izvršili u sandboxu.

## CI, PostgreSQL i performance dokaz

CI [`41481182959`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41481182959) na `32bf508036bffc2ba9ac07094f04e952edb5de08` završio je **success**:

- **Backend build + test:** passed — Prisma schema/client generation, build, lint i puni backend Jest završili su uspješno.
- **Backend PostgreSQL + Redis integration:** passed — uključujući migracije na disposable CI bazi, izolacijski harness i korak `Run real PostgreSQL integration suites`; BA-02 integration spec je u registru runnera i izvršen u zelenom jobu. Pojedinačni suite count nije deklarisan jer CI run summary ne izlaže per-suite test count.
- **Frontend build + test:** passed — lint, format, full test suite, production build i budžeti prošli su.
- **Docs guard, backend container + supply chain i CI gate:** passed.
- **Skipped:** `E2E critical flows`, `E2E install wizard` i uslovni `Enforce zero high/critical image vulnerabilities` korak. Nema browser E2E/spec 56 sign-offa; ti koraci se ne računaju kao passed.
- **Perf smoke:** [`41481183334`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41481183334) je **failure** na `POST /tickets/:id/messages` p95 **1712.97 ms** prema `<1000 ms`. Ostali vidljivi k6 pragovi prošli su: `GET /services?take=100` p95 **69.31 ms** (max **3108.91 ms**), payload p95 **111.16 KB**, catalog contract failures **0**; global query budget avg **2.091** preko **47,998** zahtjeva prema limitu `2.1`. Ticket-message endpoint nije dio BA-02 izmjene i uzročnost nije utvrđena; nije diran. Perf failure se bilježi kao failure, ne pretvara se u green sign-off.

## Registar nalaza

- Zatvoren je samo `BA-service-catalog-02` (P1). BA-03 i ostali nalazi nisu promijenjeni; `BA-changes-08`/`13` ostaju zasebno otvoreni.
- `service-catalog`: **10 otvorenih / 5 zatvorenih** od 15 ukupnih nalaza; severity je i dalje 4 P1, 8 P2 i 3 P3.
- Globalni deklarisani zbir: **565 otvorenih / 127 zatvorenih / 692 ukupno**. Machine-readable source redovi: **568 otvorenih / 113 zatvorenih / 11 historijskih / 692 ukupno**. Preegzistentna razlika od tri statusa i severity zbir P1=174, P2=368, P3=150 ostaju nepromijenjeni osim BA-02 statusa.

## Migracija, rollout i rollback

Nema Prisma schema promjene, migracije, manual DB koraka ni pristupa ciljnoj bazi. CI je koristio disposable PostgreSQL; `DATABASE_URL` nije bio postavljen lokalno, a status produkcijske/target baze nije provjeravan niti mijenjan.

Rollout je aplikacijski: prvo deployati backend guard na sve API instance. Tokom miješanog starog/novog koda privremeno pauzirati config snapshot activation/rollback, jer stara instanca nema novi precondition/invariant guard. Nakon što sve instance koriste novi SHA, activation može nastaviti; novo uhvaćeni snapshoti nose hash. Legacy snapshot koji mijenja katalog/form stanje odbija se kao conflict i mora se ponovo uhvatiti/izvesti/uvoziti sa svježom osnovom. Ako se aplikacijski kod vrati na stari SHA, ponovo pauzirati activation/rollback do redeploya zaštićenog koda. Nema DB rollbacka niti migracijskog cleanup-a.

## Završni uslovi

Kod je pushovan samo na `arena/864951a6-help-desk-enterprise`; nema PR-a prema `master`, mergea ni promjene grane. `BA-03` je sljedeći neobrađeni service-catalog P1 kandidat, ali ovaj closeout ga ne započinje niti odobrava. `BA-changes-08`/`13`, spec 56 i prag `250 ms` ostaju nepromijenjeni.
