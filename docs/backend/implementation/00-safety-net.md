# Backend implementacija — Val 0: reprodukcija i safety net

**Status:** završeno

**Početak:** 2026-10-23  
**Master plan:** [Backend implementacijski master plan](../BACKEND-IMPLEMENTATION-MASTER-PLAN.md)

## Pravilo završetka

Val 0 je završen tek kada clean checkout ima reproducibilan install/generate/build/test tok, disposable PostgreSQL/Redis integration harness, migration replay, route/guard i API/worker wiring dokaz, BA traceability gate te početne container safety testove. Lokalna environment blokada se ne označava kao pass; CI dokaz mora biti vezan za tačan SHA.

## Paket 0.1 — zaključan baseline i BA traceability

**Status:** završeno; potvrđeno u CI runu `40014367779` na SHA `f7202a52e53b1d6b32dfa38e4d83e98631497fd0`.

Implementirano:

- Node/npm runtime contract je deklarisan u `backend/package.json` (`Node 22`, `npm 10`);
- `packageManager` i lockfile zajedno zaključavaju installer major/version;
- `scripts/check-backend-findings.mjs` parsira svih 44 source audita i odbija:
  - nestalu audit jedinicu;
  - dupliciran BA ID;
  - promjenu zaključanog total/severity baselinea;
  - nalaz bez primarnog workstream ownera i implementacijskog vala;
  - nesinhronizovan machine-readable plan;
- `docs/backend/backend-findings-plan.json` mapira svih 692 nalaza na ownera, prvi val i početni status;
- guard ima četiri direktna Node testa;
- backend CI izvršava guard i njegove testove prije Prisma generate/build/test koraka.

### Direktni dokaz

```text
npm ci
PASS — 1000 paketa instalirano iz lockfilea

node scripts/check-backend-findings.mjs
PASS — 692/692; P1=174, P2=368, P3=150; owner/val potpun

node --test scripts/check-backend-findings.test.mjs
PASS — 4/4
```

Lokalni `prisma generate` ostaje **environment-blocked** jer sandbox nema mrežni pristup `binaries.prisma.sh`; lokalni build/full Jest zato nije zamijenio CI dokaz. CI je na SHA-u paketa 0.2 uspješno izvršio traceability gate prije Prisma/build/test lanca.

### Nalazi i status

Paket 0.1 nije samostalno zatvorio produkcijski BA nalaz; njegov guard sada čuva status koji dolazi iz izvornog audit reda i sinhronizuje machine-readable plan.

## Paket 0.2 — generated Prisma/build gate i compile-blokirani suiteovi

**Status:** završeno; CI run [`40014942994`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40014942994) zelen na završnom SHA paketa `803a0a173878bb93500d57c72895768005202f9f`.

Implementirano:

- CI validira kompletnu multi-file Prisma schemu prije generisanja;
- `npm run db:generate` je eksplicitan obavezni korak;
- novi generated-artifact gate dokazuje `client.ts`, `enums.ts`, `models.ts` i `internal/class.ts` prije builda;
- gate ima tri izolovana testa za kompletan, nedostajući i stale/pogrešan output;
- šest suiteova koji su tokom audita bili compile-blokirani sada imaju eksplicitan CI korak prije full Jest regresije;
- branch push daje zvanični CI dokaz bez PR-a i bez pokretanja remote E2E stacka.

### CI dokaz

```text
Prisma validate                         PASS
Prisma generate                         PASS
Generated Prisma artefakti              4/4 PASS
Generated-artifact guard testovi        3/3 PASS
Backend build                           PASS
Backend lint                            PASS
Ranije compile-blokirani suiteovi       6/6 PASS
Kompletan backend Jest                  PASS
Frontend build + test                   PASS
Docs guard                              PASS
CI gate                                 PASS
```

Prvi run `40013822041` je ispravno pao na preuskom `PrismaClient` content markeru nakon uspješnog generate koraka. Marker je korigovan da prihvati stvarni Prisma 7 export shape, njegov unit test je ponovo prošao, a kompletan drugi run je zelen. Neuspjeli run nije skriven niti predstavljen kao pass.

### Zatvoren nalaz

- `BA-xcut-31` — generated Prisma artefakt je sada obavezni CI gate, a svih šest ranije compile-blokiranih suiteova izvršava se i prolazi.

## Paket 0.3 — disposable PostgreSQL/Redis harness i migration replay

**Status:** završeno; CI run [`40018015822`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40018015822) zelen na SHA `cb446d9483f2ee22b3d306ff68e0335564f6e5c0`.

Implementirano:

- zaseban required `Backend PostgreSQL + Redis integration` CI job;
- disposable PostgreSQL 17 i Redis 7 service containeri sa healthcheckovima;
- kompletan `prisma migrate deploy` replay svih 76 migracijskih direktorija na praznoj bazi;
- `prisma migrate status` dokaz da nema pending/failed migracije;
- PostgreSQL read/write/rollback i Redis NX/read/delete/cleanup smoke;
- tri direktna testa dependency smoke harnessa;
- izolacijski runner koji za svaki real-DB suite klonira potpuno migriranu template bazu, izvršava suite i bazu briše sa `FORCE` cleanupom;
- tri direktna testa sigurnog database naming/URL isolation contracta;
- pet stvarnih PostgreSQL integration suiteova sada ulazi u obavezni CI gate;
- integration failure output se objavljuje kao GitHub annotation, pa dokaz nije skriven iza nedostupnog runner log hosta;
- završni CI gate eksplicitno zavisi od integration joba.

### CI dokaz

```text
PostgreSQL 17 / Redis 7 healthcheck       PASS
Prisma generate + artefakti               PASS
76/76 migration direktorija replay        PASS
Prisma migrate status                     PASS — database schema up to date
Dependency/isolation harness testovi       6/6 PASS
PostgreSQL transaction + Redis cleanup     PASS
Privacy retention integration              8/8 PASS
Privacy anonymization integration          6/6 PASS
Privacy export integration                 4/4 PASS, 1 budget test svjesno skipped
Status-page integration                    5/5 PASS
Ops-alert engine integration               7/7 PASS
Backend build/lint/full Jest                PASS
Frontend build/test, docs i CI gate         PASS
```

Prvi integration run je otkrio dvije stvarne safety-net greške, bez prikrivanja:

1. suiteovi su dijelili istu bazu pa su retention countovi bili kontaminirani podacima drugih suiteova;
2. tri ops-alert integration scenarija nisu pratila deklarisani `openAfter: 2` hysteresis i 15-minutni notification retry.

Prvi problem je riješen per-suite database izolacijom; drugi korekcijom test scenarija prema postojećem produkcijskom state-machine ugovoru. Produkcijska ops-alert logika nije mijenjana.

### Nalazi i status

Paket uvodi izvršni migration/dependency dokaz, ali ne zatvara široke production nalaze o TLS-u, privilege separationu, rollout concurrencyju, restoreu ili Redis failoveru. Oni ostaju otvoreni za Valove 1 i 9. Zbir ostaje **691 otvoren / 1 zatvoren**.

## Paket 0.4 — route/guard manifest i API/worker wiring snapshot

**Status:** završeno; CI run [`40021429467`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40021429467) zelen na SHA `5401f15c65887d434aa54f32306ad75e21f1b976`.

Implementirano:

- TypeScript AST inventar svih backend controllera i HTTP route dekoratora;
- deterministični machine-readable snapshot `docs/backend/backend-wiring-manifest.json`;
- za svaku rutu zapisani su source fajl, controller, handler, HTTP metoda, puna putanja, class/method `UseGuards` i guard-boundary klasifikacija;
- neutralna klasifikacija `inherited-or-public` namjerno ne proglašava rutu javnom samo zato što nema lokalni `UseGuards`;
- snapshot root `AppModule` i `WorkerModule` import/controller/provider/export metadata;
- četiri direktna testa AST parsera i snapshot semantike;
- stale manifest prekida CI prije builda;
- zaseban izvršni CI korak kompajlira API i worker module te provjerava scheduler ownership i worker shutdown;
- workflow guard zaključava da se wiring provjere ne mogu neprimjetno ukloniti iz backend joba.

### Snapshot rezultat

```text
Controller fajlovi                       98
HTTP rute                               610
Rute sa eksplicitnim lokalnim guardom   590
Inherited/public review granica          20
Root moduli                                2
Wiring parser testovi                    4/4 PASS
API/worker/scheduler/shutdown suiteovi   4/4 PASS
```

Dvadeset ruta bez lokalnog guarda sada je vidljivo u jednom diffabilnom registru: authentication entrypointi, health, branding, Teams inbound, privacy notice, public on-call calendar i public status. Snapshot ne tvrdi da su sve ispravno autorizovane; sigurnosna klasifikacija i centralni policy ostaju posao Vala 2. Njegova sadašnja uloga je da svaka nova/uklonjena ruta ili promjena guarda napravi obavezan review diff.

### Nalazi i status

`BA-xcut-19` ostaje otvoren: manifest uklanja nevidljivost wiring-a, ali još ne centralizuje globalni guard/filter/interceptor ownership niti dokazuje semantičku auth klasu svih 20 ruta. Paket ne zatvara nalaz prije te behavior korekcije i negativnih testova. Zbir ostaje **691 otvoren / 1 zatvoren**.

## Paket 0.5 — container UID/filesystem/signal/storage safety

**Status:** završeno; CI run [`40024200985`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40024200985) zelen na SHA `96036bfa6ecc8eea03bf540d109f12d7870a8992`.

Implementirano:

- finalni Docker stage eksplicitno radi kao korisnik `node`, koristi `STOPSIGNAL SIGTERM`, kopira runtime artefakte sa `node:node` vlasništvom i priprema writable uploads granicu;
- backend i worker Compose servisi imaju read-only root filesystem, `cap_drop: ALL`, `no-new-privileges`, ograničen `/tmp` tmpfs i zajednički persistent uploads volume;
- statički contract guard prekida CI ako nestane bilo koja Dockerfile ili Compose sigurnosna granica;
- tri direktna testa guarda pokrivaju validan ugovor, nedostajući hardening i lažno zadovoljavanje `USER` pravilom samo u builder stageu;
- zaseban CI posao gradi stvarni runtime image i dokazuje non-root UID/GID, read-only root, writable `/tmp`, writable persistent uploads te prijem i graceful obradu `SIGTERM` signala;
- runtime failure output postaje GitHub annotation, a container posao je obavezan ulaz završnog CI gatea.

### CI dokaz

```text
Statički container contract                 PASS
Container contract testovi                  3/3 PASS
Docker Compose model                        PASS
Backend runtime image build                 PASS
Runtime UID/GID != 0                        PASS
Read-only root filesystem                   PASS
/tmp tmpfs + persistent uploads write       PASS
SIGTERM readiness/delivery/graceful exit     PASS
Backend build/test                          PASS
PostgreSQL/Redis integration                PASS
Frontend build/test i docs                  PASS
Završni CI gate                             PASS
```

Prva dva zvanična runtime pokušaja nisu prikazana kao uspjeh: inicijalni signal probe je zaustavljao proces prije registracije handlera pa je Docker nakon timeouta vratio `137`. Probe sada prvo čeka eksplicitni `signal-ready` marker i tek zatim šalje `SIGTERM`; završni run je dokazao graceful exit. Usput je ispravljena i nedostajuća završna navodnica u shell komandi CI summaryja, otkrivena kroz stvarni gate run.

### Zatvoreni nalazi

- `BA-xcut-01` — stvarni runtime image sada radi kao non-root korisnik i CI to provjerava numeričkim UID/GID probeom;
- `BA-xcut-23` — read-only root, capability drop, `no-new-privileges`, ograničeni tmpfs i writable persistent storage sada su deklarisani i izvršno testirani.

Zbir je sada **689 otvorenih / 3 zatvorena** nalaza.

## Paket 0.6 — završni regression, traceability i dokaz

**Status:** završeno; završni CI run [`40024951273`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40024951273) zelen na konsolidovanom SHA `cefda62f5731549a7d63560fb100eb0ad101ad45`.

Konsolidovano:

- kanonski audit, registar i machine-readable plan sinhronizovani su na **692 ukupno = 689 otvorenih + 3 zatvorena** nalaza;
- severity baseline ostaje **174 P1 + 368 P2 + 150 P3**;
- findings guard sada potvrđuje nove statuse `BA-xcut-01` i `BA-xcut-23` uz ranije zatvoreni `BA-xcut-31`;
- promjena kanonskog registra, plana ili source audita više se ne klasifikuje kao docs-only: pokreće i backend/code gate, pa traceability dokaz ne može biti preskočen;
- workflow guard ima regresijski test za ovu klasifikaciju;
- završna lokalna regresija obuhvatila je findings i wiring checkere, njihove testove, container contract/testove, backend lint, workflow parser/testove i `git diff --check`.

Završni run je ponovo izvršio i potvrdio backend build/full Jest, generated Prisma gate, svih pet real-DB suiteova, PostgreSQL/Redis harness, svih 76 migracija, container image/runtime probe, frontend build/test, docs guard i završni CI gate. Time je Val 0 završen bez zamjene izvršnog dokaza dokumentacijskom tvrdnjom.
