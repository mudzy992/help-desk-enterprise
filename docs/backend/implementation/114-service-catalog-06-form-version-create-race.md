# Implementacijski checkpoint — `BA-service-catalog-06` (u toku)

**Paket:** audit 15 / `service-catalog` — konkurentno kreiranje prve forme i narednih verzija<br>
**Nalaz:** `BA-service-catalog-06` (P2) — **otvoren**; implementacija započeta, CI acceptance čeka<br>
**Grana:** `arena/864951a6-help-desk-enterprise`<br>
**BA-05 prethodni status:** korisnik je 2026-11-02 prijavio uredan redeploy BA-05 i izričito odobrio početak BA-06; BA-05 je evidentiran kao owner-directed zatvoren, ali redeploy nije nezavisno provjeren. Kodni CI BA-05 [`41529212182`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41529212182) na `6d98cff` je passed; odvojeni Perf [`41529212249`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/41529212249) je failure samo na nepovezanom ticket-message p95. E2E, inventory i uslovni image-enforcement bili su skipped; nema spec 56 sign-offa.<br>
**Kontrolni zbir poslije BA-05:** deklarisano 562 otvorena / 130 zatvorenih / 692 ukupno; machine-readable 565 otvorenih / 116 zatvorenih / 11 historijskih; `service-catalog` 7 otvorenih / 8 zatvorenih. Preegzistentna razlika od tri statusa ostaje dokumentovana.<br>
**Migracija / ciljna baza:** nema Prisma schema promjene, migracije ni pristupa/upisa u ciljnu bazu<br>
**Spec 56 / prag:** nisu mijenjani; nema browser/spec 56 sign-offa

## Nalaz i acceptance

Audit 15 utvrdio je da `createServiceForm` prvo provjerava postojeće redove izvan transakcije, a zatim bez ponovne provjere ubacuje verziju 1. `createServiceFormVersion` isto tako računa `MAX(version) + 1` prije transakcije. Paralelni zahtjevi mogu zato naletjeti na `@@unique([serviceId, version])` i klijentu vratiti sirovu Prisma `P2002` grešku umjesto stabilnog application-level ugovora.

Acceptance ovog paketa:

1. Prvo kreiranje forme ponovo provjerava stanje nakon per-service locka u transakciji. Kod dva istovremena zahtjeva jedan kreira verziju 1, a drugi dobija stabilni HTTP 409 `FORM_ALREADY_EXISTS`; nema drugog reda ni sirove provider greške.
2. Kreiranje naredne verzije čita najviši broj tek unutar zaključane `ReadCommitted` transakcije. Istovremeni pozivi dobijaju različite uzastopne brojeve. Preostali `P2002` za baš `(serviceId, version)` se retry-a u svježoj transakciji; nakon ograničenog broja pokušaja API vraća HTTP 409 `FORM_VERSION_CREATE_CONFLICT`.
3. API create, API activation i install-seed koriste istu per-service advisory-lock identity. Writer uzima `FormVersion` `ROW EXCLUSIVE` table lock prije čitanja/mutacije, čime zadržava siguran redoslijed sa `applyCatalogSnapshot` `SHARE ROW EXCLUSIVE` lockom.
4. Real PostgreSQL integration suite dokazuje da se oba create scenarija zaista takmiče pod lockom i ostavljaju ispravne jedinstvene verzije/audit zapise.

Nema client idempotency-key ugovora niti obećanja da ponovljen zahtjev vraća prethodni uspješan rezultat; ovaj paket definiše samo stabilno ponašanje za concurrent conflict. Nema zahtjeva za schema migracijom: postojeći unique constraint ostaje konačna DB zaštita. BA-07 i svi drugi nalazi ostaju van scopea.

## Implementacija

- Zajednički helper je generalizovan kao `withServiceFormVersionMutationLock`; legacy BA-05 namespace `service-catalog.form-activation` i aktivacijski alias ostaju nepromijenjeni radi serijalizacije sa već redeployanim BA-05 instancama tokom rollouta.
- `createServiceForm` premješta provjeru broja postojećih formi u lockom zaštićenu transakciju i ponovo učitava servis nakon čekanja. `P2002` na composite service/version key-u mapira se na postojeći 409 `FORM_ALREADY_EXISTS`.
- `createServiceFormVersion` premješta latest-version read u istu transakciju, alocira sljedeći broj nakon locka i bounded-retry-a klasifikovani composite-key `P2002`; iscrpljeni retry dobija stabilni 409 `FORM_VERSION_CREATE_CONFLICT`.
- Dodani su klasifikator/testovi za Prisma unique-conflict oblik, provjera stabilnog HTTP ugovora, dvije real-PostgreSQL concurrency provjere i novi isolated-integration registry unos.

## Verifikacija

- Ciljani ESLint nad izmijenjenim BA-06 TypeScript fajlovima: **passed**.
- Lock-helper i unique-conflict unit testovi, uz lokalni `ts-jest` diagnostics workaround: **3/3 passed**.
- Isolated-integration registry/harness testovi: **3/3 passed**.
- Backend findings traceability: **passed** (692/692; P1=174, P2=368, P3=150); source-registry testovi: **12/12 passed**.
- Docs guard: **passed** (32 stranice, 8 prevoda, 10 provjera); docs ogledalo sinhronizovano; docs testovi: **9/9 passed**.
- `ServiceFormsService` unit suite je pokušan, ali nije mogao učitati nedostajući `backend/src/generated/prisma/client`; `npm run db:generate` nije uspio jer je Prisma engine download sa `binaries.prisma.sh` nedostupan u ovom okruženju. Zato generated-client build/full Jest ostaju **unverified** (ne passed/skipped). Generisanje je korišteno samo s privremenim lokalnim placeholder URL-om; target baza nije kontaktirana.
- PostgreSQL suite nije lokalno izvršen jer `PRIVACY_IT_DATABASE_URL` nije postavljen. Potrebni su generated-Prisma build/full Jest i disposable PostgreSQL integration run.

## Status i sljedeći korak

BA-06 ostaje **otvoren** dok build/full Jest, real PostgreSQL concurrency suite i ostali potrebni CI gateovi ne prođu i dok owner ne prihvati paket. Ne praviti PR prema `master`, merge niti deployment bez zasebne dozvole. Nema migracije, target-DB pristupa, promjene BA-routing-02, speca 56, praga `250 ms` ili W7.15 ponašanja.
