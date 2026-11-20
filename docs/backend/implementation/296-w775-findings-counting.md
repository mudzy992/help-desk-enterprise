# W7.75 — brojanje nalaza: jedan izvor, generisani zbirovi i CI guard

**Paket:** Val 7, alat + dokumentacija (nije BA nalaz)<br>
**Povod:** korisničko pitanje zašto plan daje **292 zatvoreno / 404 otvoreno / 696**, raniji checkpointi **418/278**, a registar **702 reda** sa **6 historijskih duplikata**<br>
**Kod:** `scripts/check-backend-findings.mjs` (+ test), `.github/workflows/ci.yml`, dokumentacija<br>
**DB migracija:** nema

## Nalaz istrage

Ista činjenica je postojala u četiri prikaza, a samo je jedan bio tačan:

1. **44 izvorne audit tabele** — izvor. Njihov parser (`buildFindingsPlan`) daje **696** nalaza i plan je
   **čista funkcija** tih tabela: poređenje svih 696 ID-eva dalo je **nula** razlika između plana i izvora.
2. **`backend-findings-plan.json`** — generisan, dakle tačan: **292/404** prije W7.74, **293/403** poslije.
3. **Tabela registra** — ručno održavana: **702 reda** za 696 ID-eva. Šest redova je bilo dvostruko
   (`BA-search-03`–`08`: jednom `zatvoreno (W7.5x)`, jednom staro `otvoreno`), a **10 nalaza** je u auditima
   bilo `zatvoreno`, dok ih je tabela vodila kao `otvoreno`: `BA-authorization-02`, `BA-rbac-04`,
   `BA-routing-05`/`06`/`07`, `BA-status-page-07`/`08`/`10`, `BA-users-04`/`05`. Zato je tabela davala
   **282/414** tamo gdje plan kaže 292/404.
4. **Narativ checkpointa** (master plan i registar) — brojevi „source/plan” su se **prenosili ručno** i
   uvećavali za ±1 po paketu, pa je „zatvoreno” *opadalo* dok su se nalazi zatvarali (422 → 418 → …).
   `--write` na W7.73 je prvi put poslije duže serije ponovno izračunao JSON i pokazao stvarno stanje
   (292/404): **pad od 126 je ispravka narativa, ne ponovno otvaranje nalaza**. Dokazi: nijedan audit red nije
   prešao `zatvoreno` → `otvoreno`, svih 292 zatvorenih ima implementacioni dokument, a jedina odstupanja
   (10 njih) išla su u suprotnom smjeru — registar je zaostajao za auditima.

**Zaključak:** problem nije bio u nalazima ni u njihovom zatvaranju, nego u **tri ručno održavana broja**
(tabela registra, „kontrolni zbir” i narativ) koja su opisivala isti skup kao generisani plan. Ručni broj u
dokumentu koji se ažurira svakog paketa neminovno odstupa; zato popravka nije „prepisati brojeve”, nego
**ukloniti ručno brojanje**.

## Šta je urađeno

**1. Registar je usklađen sa izvorom** — bez prepisivanja istorije i bez dodirivanja audit tabela:

- uklonjeno je **6 dvostrukih redova** (`BA-search-03`–`08`), zadržan je noviji, ažurirani red svakog ID-a;
- ispravljeno je **10 statusa** na `zatvoreno`, tačno kako ih vode izvorni auditi;
- tabela sada ima **696 redova** i daje isti presjek kao plan: **293 zatvoreno / 403 otvoreno**.

**2. Checker čuva invarijantu** (`scripts/check-backend-findings.mjs`):

| Provjera | Ponašanje |
| --- | --- |
| plan = izvor | kao i prije (`--write` je jedini način da se plan promijeni) |
| svaki red registra | mora postojati u planu, sa istim prioritetom |
| klasa statusa | `otvoreno` vs `zatvoreno`; kvalifikator (`zatvoreno (W7.74)`) je dozvoljen, klasa nije |
| jedinstvenost | dupliciran ID pada |
| broj redova | mora biti `plan.total` (696) |
| generisani blokovi | `Kontrolni zbir` u registru, blok u master planu i blok u `audits/README.md` moraju biti **identični** onome što alat generiše |
| wave tabela | dvije numeričke kolone (zatvoreno/ukupno, otvoreno po prioritetu) moraju biti tačne |

Poruke su operatorske: pokazuju prvi desetak odstupanja i kažu „pokreni `--write`” kad je riječ samo o
zbirovima.

**3. Zbirovi su generisani, ne otkucani.** `--write` sada piše i **tri dokumenta**: plan, `BACKEND-FINDINGS-REGISTER.md`
i `BACKEND-IMPLEMENTATION-MASTER-PLAN.md` (+ `audits/README.md` block). Brojevi žive samo unutar markera:

```
<!-- findings-totals:start -->
- Ukupno: **696** (P1 174 · P2 371 · P3 151)
- Zatvoreno: **293**
- Otvoreno: **403** (P1 88 / P2 217 / P3 98)
- Val 7: **72 / 111** zatvoreno, otvoreno **39** (P1 0 / P2 22 / P3 17)
<!-- findings-totals:end -->
```

Ručni „Kontrolni zbir” (koji je tvrdio `Otvoreno 423`, `Zatvoreno 273` i `Duplicirani ID-evi: 0`) je zamijenjen
ovim blokom. U master planu su i dvije numeričke kolone wave tabele sada generisane; **prozne** kolone
(dnevnik paketa, zaključak) ostaju ručne, jer opisuju pakete, a ne brojeve. Iz proze su uklonjeni brojevi koji
su se ponavljali (`26 pojedinačnih izvornih redova`, `17 dodijeljenih nalaza`, `preostalih 70`) — zamijenjeni
su uputom na tabelu/blok.

**4. Guard se izvršava tamo gdje se dokumentacija mijenja.** `audit:traceability` je već bio u backend jobu; sada
je i u **Docs guard** jobu, jer docs-only izmjena ne pokreće backend job — a upravo docs-only izmjena kvari
zbirove.

**5. Standard je dopunjen** ([§7a](BACKEND-AUDIT-STANDARD.md)): izvor je audit tabela, zbirovi se ne pišu rukom,
istorija se ne prepisuje, a novi tekst se poziva na generisani blok.

## Dokazi

- `node --test scripts/check-backend-findings.test.mjs` — **24 testa** (novi: parser registra sa escaped pipe,
  duplikat, nepoznat ID, razlika klase, skraćen status, nedostajući red/broj redova, sažetak, zamjena bloka,
  wave tabela, **realni repozitorij**: registar = plan i sva tri bloka sinhronizovana).
- `node scripts/check-backend-findings.mjs` — `696/696, P1=174 P2=371 P3=151, owner/val=potpun,
  zatvoreno=293 otvoreno=403, registar=usklađen`.
- `node scripts/check-docs-content.mjs` — `OK (32 stranice, 8 prevoda, 10 provjera)`.
- `node scripts/check-workflows-yaml.mjs` — OK nakon dodavanja koraka u Docs guard.
- Nema migracije, nema promjene API-ja, nema zavisnosti.

## Šta ostaje netaknuto

- **Audit tabele** nisu mijenjane: jedini izvor statusa ostaje ono što piše u 44 audita.
- **Istorijski checkpointi** (418/278, 420/276, …) nisu prepisani; oni su zapis svog datuma. Novi checkpointi
  se pozivaju na generisani blok.
- Kvalifikatori u registru (`zatvoreno (W7.70)`) ostaju kakvi su; guard poredi klasu, ne tekst.
- Liste po scopeu u `audits/README.md` (npr. „14/44 scopeova”) ostaju ručni presjeci sa datumom — nisu zbirovi.

## Preostali rizik

- Ručni brojevi u **istorijskim** zapisima ostaju netačni po današnjem stanju; to je namjerno (append-only
  istorija). Čitalac koji traži aktuelno stanje ima tri generisana bloka i `plan`.
- Guard provjerava **klase** statusa, ne kvalifikator: ako paket zaboravi upisati `(W7.xx)` u registar, klasa je
  i dalje tačna i guard ne pada. To je svjesno — kvalifikator je napomena, ne činjenica; tačan broj paketa je u
  audit redu i implementacionom dokumentu.
