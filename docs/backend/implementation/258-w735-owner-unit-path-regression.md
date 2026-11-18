# Package closeout — W7.35

**Paket:** W7.35 — regresija W7.33 u filteru vlasnika (putanja jedinice), UX predaje problema<br>
**Nalaz:** regresija paketa W7.33 (`BA-problems-15`); nema novog BA ID-a, pa se kontrolni zbir ne mijenja<br>
**Kodni commit:** `ad4dab1` (popravka + guard), `ddf6dd5` (predaja u tab + uputa za prazan birač), `d412821` (dva test-only nalaza iz CI-a)<br>
**Finalni testani SHA:** `d412821`<br>
**CI:** [`44286554422`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44286554422) — zelen; [`44295296759`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44295296759) na `a58e5a3` (W7.37) — zelen (Backend build + test, Frontend build + test, PostgreSQL + Redis integracija, Docs guard, container + supply chain)<br>
**DB migracije:** nema

## Šta je korisnik prijavio

Pri kreiranju problema, kad se odabere problem-grupa čiji je član nosilac role `PROBLEM_MANAGER`, birač
vlasnika ostane prazan („Nema agenata za ovu pretragu.“). Prije W7.33 je radilo.

## Uzrok

W7.33 je uveo pravilo „vlasnik mora imati `problem.manage` koji pokriva **jedinicu problema**“ u dva
oblika: tačnu provjeru u memoriji (`evaluateProblemOwnerEligibility`, preko `resolveAssetScope` +
`isPathInScope`) i isti uslov kao Prisma filter (`eligibleProblemOwnerWhere`) za ograničene upite —
birač vlasnika, upravitelje ciljne grupe kod predaje i primaoce obavještenja.

Filter gradi listu predaka jedinice preko `problemUnitAncestors`, koja je putanju sjekla na `/` i
sastavljala **bez** korijena:

```
problemUnitAncestors('/Korisnici')  ->  ['Korisnici']        // W7.33
problemUnitAncestors('/root/ou1')   ->  ['root', 'root/ou1']
```

`OrganizationalUnit.ouPath` se u bazi čuva **sa** vodećim `/` (`/Korisnici`, `/root/ou1`), pa
`organizationalUnit: { ouPath: { in: ['Korisnici'] } }` nikad nije pogodio nijednu dodjelu. Tačna
provjera je istovremeno radila ispravno, jer poredi iste stringove iz baze.

Posljedice, sve tri tihe:

1. **Birač vlasnika** (`GET /problems/owners`) — prazna lista za svakog kandidata sa jedinicom vezanom
   dodjelom; prolazile su samo **globalne** (bezjedinične) dodjele `ADMIN`/`SUPER_ADMIN`/`PROBLEM_MANAGER`.
   To je ono što je korisnik vidio.
2. **Predaja problema** — lista upravitelja ciljne grupe (`problem-handoff.service.ts`) — prazna, pa
   niko nije mogao biti pozvan da prihvati predaju.
3. **Obavještenja** — primaoci iz reda upravitelja grupe (`problem-notifier.ts`) — prazni, pa je
   obavještenje moglo ispasti kao `NO_RECIPIENT` iako upravitelj postoji.

Korisnik nije griješio: podaci su bili ispravni, a filter je tražio format koji baza ne koristi.

## Zašto testovi nisu uhvatili

`problem-owner-eligibility.spec.ts` je testirao `problemUnitAncestors('sales/emea/sarajevo')`, a
`problem-owner-scope.spec.ts` je na istom fixtureu **očekivao** pogrešan izlaz
(`expect(...in).toEqual(['root', 'root/ou1'])` za jedinicu `/root/ou1`). Dvije kopije pravila testirane
su odvojeno, pa neslaganje formata nije bilo vidljivo; DB-backed suiteovi ne provjeravaju birač, a E2E
critical/install su u tom runu bili `skipped`.

## Popravka

- `problemUnitAncestors` čuva format ulaza: `/a/b/c` → `/a`, `/a/b`, `/a/b/c`; putanja bez korijena
  ostaje bez korijena (kompatibilnost sa fixtures i sa eventualnim pozivima bez `/`).
- `GET /problems/owners` sada vraća i `unitPath` (jedinicu koju je pretražio), pa prazna lista može reći
  **gdje** je tražila: „Nema kandidata u jedinici {{unit}}. Članovi grupe moraju imati dozvolu
  „Upravljanje problemima“ koja pokriva tu jedinicu.“ Umjesto nagađanja da li je filter pokvaren ili
  grupa zaista nema kandidata.

**Novi guard.** `problem-owner-eligibility.spec.ts` dobio je blok koji **izvršava Prisma filter u
memoriji** (samo operatori koje filter emituje) i poredi ga sa tačnom provjerom nad istim fixtureima, sa
putanjama u formatu baze: dodjela na jedinici, na roditelju, na podjedinici, na sestri, globalna dodjela,
pad na matičnu jedinicu, član bez `problem.manage`, upravitelj druge grupe i deaktiviran korisnik.
Regresijski slučaj (`/Korisnici`) ima i svoj test. Dodatno, `problem-owner-scope.spec.ts` sada tvrdi
`['/root', '/root/ou1']` — format koji baza stvarno čuva.

## UX: predaja problema

Korisnik je primijetio da obrazac predaje stoji iznad tabova i dominira stranicom. Procjena: predaja je
**radnja**, ne stanje — a stanje koje neko mora odlučiti (predaja čeka odluku) zaslužuje vidljivost na
vrhu. Zato:

- **Predaja koja čeka odluku** ostaje kartica na vrhu (Prihvati/Odbij/Otkaži, razlog odbijanja).
- **Pokretanje predaje** je sada sažeta kartica **unutar taba „Pregled“**, sklopljena na jednu liniju,
  sa dugmetom „Zatraži predaju“ koja je otvara. Ne dira se ostatak records; ne troši prostor na svakom
  tabu.
- Obrazac i dalje traži ciljnu grupu (bez trenutne) i razlog ≥ 5 znakova, greške idu inline **i** kao
  danger toast (pravilo za duge forme), a uspjeh zatvara obrazac i osvježava zapis.

Da bi stranica ostala pod size ceilingom (500 linija), pregled problema je izdvojen u
`components/problems/problem-overview.tsx` (markup i labele nepromijenjeni), a stranica je spala na ~390
linija; novi `problem-handoff-request-card.tsx` ima svoj spec.

## Dokazi

- Backend: `problem-owner-eligibility.spec.ts` (prošireno — uključujući matricu filter-vs-tačna
  provjera i regresijski slučaj), `problem-owner-scope.spec.ts` (8, format putanje u filteru).
- Frontend: `problem-handoff-request-card.spec.tsx` (7 — skriven bez ovlasti, skriven dok predaja čeka,
  sklopljen pa otvoren, trenutna grupa nije u listi, validacija, uspjeh zatvara obrazac, greška inline +
  toast), `problem-handoff-panel.spec.tsx` (5 — samo odluka o predaji), `module-size.spec.ts`,
  `settings-registry-coverage.spec.ts` i i18n guardovi.
- CI [`44286554422`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44286554422) na
  `d412821` — svi obavezni poslovi zeleni.

### Šta je prvi CI run našao (i zašto je to dobro)

Prvi run na `ddf6dd5` ([`44284481652`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44284481652))
pao je na dva **test-only** mjesta, oba popravljena u `d412821`:

1. `problem-notifier-owner-drift.spec.ts` je tvrdio `['inside']` — tj. **kodirao je isti bug**. Sada tvrdi
   `['/inside']`, format koji baza čuva; da popravka nije urađena, ovaj test bi ostao zelen i regresija
   bi se vratila.
2. `ws-redis-adapter.integration.spec.ts` je objavljivao odmah nakon `ready`, a adapter se na Redis
   pretplaćuje iz konstruktora; `ready` ne čeka taj krug, pa je publish mogao pobjeći pretplati i biti
   izgubljen (3043 ms → timeout). Oba cross-instance testa sada čekaju da svaka instanca vidi svaku na
   request kanalu adaptera — a pošto adapter prvo psubscribuje room kanal na istoj vezi, to dokazuje da je
   i room kanal živ. Nije mijenjan produkcioni kod ni timeout.

## W7.37 — prazna lista ciljnih grupa (nizak nalaz iz iste prijave)

Poslije popravke vlasnika korisnik je otvorio „Predaju u drugu grupu“ i u biraču vidio samo
placeholder. Uzrok nije filter: `GET /problems/options` vraća **sve** problem-grupe, a predaja
isključuje **trenutnu** grupu — na instalaciji sa jednom problem-grupom lista je po definiciji prazna,
a komanda bi istu grupu odbila sa `handoffSameGroup`. Bilo je to tiho stanje, ne greška podataka.

Popravka (`a58e5a3`): kada nema druge problem-grupe, kartica u „Pregledu“ zadrži naslov i napiše zašto
nema cilja i gdje se dodaje nova grupa („Korisnici → Problem grupe“); nema praznog selecta ni dugmeta
koje može samo pasti. Test: instalacija sa jednom grupom renderuje objašnjenje, bez preklopnika i bez
selecta.

**Poznato ograničenje (kandidat za nalaz, ne dira ovaj paket):** lista ciljnih grupa nije filtrirana na
opseg onoga koji predaje — `problem-handoff.service.ts` traži da jedinica ciljne grupe bude u njegovom
`problem.manage` i `problem.read` opsegu, pa ograničeni administrator može izabrati grupu koju će
backend odbiti. SuperAdmin to ne vidi (globalni opseg).
## Operativna provjera

1. `Problemi → Novi problem` → izaberi grupu `Problem grupa` (jedinica `/Korisnici`) → **očekivano:**
   u biraču vlasnika se pojavljuje član grupe sa rolom `PROBLEM_MANAGER`.
2. Ako je lista prazna, ispod piše jedinica koju je pretraga provjerila i koja dozvola treba članu —
   to je sada dijagnostika, ne nagađanje.
3. `Problemi → P0000019` → tab `Pregled` → kartica `Predaja u drugu grupu` je sklopljena;
   `Zatraži predaju` otvara obrazac; nakon slanja problem ostaje u grupi i na vrhu se pojavi
   `Predaja čeka odluku`.
4. Kao upravitelj ciljne grupe: kartica na vrhu nudi `Prihvati` / `Odbij` (razlog ≥ 5 znakova).
5. Čišćenje: otkaži predaju (`Otkaži predaju`) ako je testna.

## Rollout i rollback

Nema migracije ni schema promjene. Popravka je u backend filteru i u frontend bundleu; do deploya birač
ostaje prazan za jedinicom vezane dodjele, poslije deploya radi bez promjene podataka. Rollback je
vraćanje prethodne slike — ali vraća i regresiju, pa nije preporučen. Stanje podataka nije dirano ni u
jednom smjeru.
