# W7.84 — `BA-knowledge-base-10`: archive guard i placement se serijalizuju po kategoriji

**Paket:** Val 7, `knowledge-base`, **P2**<br>
**Nalaz:** „Category archive guard je TOCTOU prema paralelnom article placementu”<br>
**Kod:** `portal/knowledge-category-membership-lock.ts` (novo), `portal/knowledge-categories.ts`
(`setKnowledgeCategoryArchived`, `createKnowledgeCategory`, `updateKnowledgeCategory`), `portal/knowledge-portal.service.ts`
(`placeArticle`), `portal/knowledge-portal.service.spec.ts` (+2 testa), `knowledge-category-archive-race.integration.spec.ts`
(novo), `scripts/run-isolated-integration.mjs` (shard)<br>
**DB migracija:** nema<br>
**CI:** [`44956273227`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44956273227)

## Nalaz

Dvije polovine **jedne** invarijante, svaka odlučivana sama:

- **Arhiviranje** je radilo `count` aktivnih članaka i aktivne djece, pa `update { isArchived: true }`;
- **Placement** je provjeravao da je kategorija aktivna, pa upisivao `categoryId`.

Oba koraka su „provjeri-pa-upiši”. Ako se preklope, oba prođu svoju provjeru u istom trenutku:

| trenutak | arhiviranje | placement |
|---|---|---|
| 1 | `count` aktivnih članaka → **0** | |
| 2 | | provjera: kategorija aktivna → **prolazi** |
| 3 | `update isArchived = true` | |
| 4 | | `update categoryId = X` |

Ishod: **arhivirana kategorija sa živim, vidljivim člankom** — tačno ono što guard treba da spriječi. Portal
takav članak prikaže pod kategorijom koju korisnik više ne vidi u navigaciji; linkovi i FAQ lista pucaju.

Ista klasa greške postoji i za **djecu**, što audit eksplicitno ne imenuje ali je simetrično: novi članak-dijete
ili reparenting ubaci sadržaj u roditelja dok se roditelj arhivira (`count` djece = 0 → arhiviraj), a restore
djeteta pod roditeljem koji se upravo arhivira je ista trka u drugom smjeru.

## Rješenje

**Jedna brava po kategoriji, na obje strane.**

`withKnowledgeCategoryMembershipLock(transaction, categoryIds, operation)` uzima **transakcijski advisory lock**
kroz postojeći `DatabaseLockService` (`pg_advisory_xact_lock`), identitet `knowledge-base.category-membership`,
ključ `categoryId`:

- `setKnowledgeCategoryArchived`: **čitање, oba `count`-a i upis** idu pod bravu — guard više nije odluka
  „prije”, nego odluka **unutar** brave. Restore djeteta zaključava i **roditelja** (ista trka u drugom smjeru).
- `placeArticle`: brava nad **ciljnom kategorijom** drži se dok se provjerava da je aktivna i dok se upisuje
  `categoryId` (unutar iste transakcije koju je placement dobio u W7.83).
- `createKnowledgeCategory` i `updateKnowledgeCategory`: zaključavaju **roditelja** kome dodaju dijete —
  novi/reparentovani članak-dijete je sadržaj koji arhiviranje broji.

Tri svojstva koja nose rješenje:

1. `pg_advisory_xact_lock` **živi do kraja transakcije**, ne do kraja poziva — zaštita pokriva sve što ta
   transakcija upiše (i audit iz W7.83), ne samo funkciju koja je bravu uzela.
2. **Sortirani i deduplikovani ID-evi** — poziv koji dira dvije kategorije ne može se zaključati u ciklus sa
   drugim pozivom koji ih dira obrnutim redom.
3. Bez transakcije se brava ne uzima (nema na šta da se veže) — portаl uvijek prolazi kroz transakciju, a helper
   to i dokumentuje umjesto da se pretvara da štiti.

**Zašto ne `SERIALIZABLE` ili FK/CHECK:** `SERIALIZABLE` bi tražio retry petlju na nivou svakog pozivaoca i mijenjao
semantiku cijelog portala; „arhivirana kategorija ne smije imati članke” nije izrazivo FK-om ni CHECK-om bez
denormalizacije (brojač u kategoriji = novi izvor driftа, kao `ratingCount` u W7.81). Brava po redu je
najmanji zahvat koji daje tačno ponašanje, i to bez migracije.

### Cijena

Po arhiviranju/placementu dva dodatna `$queryRaw` (`set_config('lock_timeout')` + `pg_advisory_xact_lock`).
Kontencija je po **jednoj** kategoriji; rad na drugim kategorijama nije blokiran. Brava se drži milisekundama, dok
traje transakcija.

## Direktni testni dokaz

**Unit (`knowledge-portal.service.spec.ts`, 13 → 15 testova):**

- **arhiviranje uzima bravu prije brojanja**: `$queryRaw` nosi identitet
  `knowledge-base.category-membership:<id>`, a `invocationCallOrder` brave je **manji** od `knowledgeArticle.count`
  — dakle guard nije više „count pa odluka”, nego „brava pa count”;
- **placement uzima istu bravu** za kategoriju u koju članak ulazi, i članak završi u njoj.

**PostgreSQL integracija (`knowledge-category-archive-race.integration.spec.ts`, 2 testa, novi CI shard):**

- **5 rundi trke** `setCategoryArchived` vs `placeArticle` na istoj kategoriji (svaka runda svježa kategorija i
  svjež članak, oba poziva kroz **pravi servis**):
  - nemoguće stanje (`isArchived && article.categoryId === kategorija`) **nikad** ne opstaje;
  - tačno **jedan** od dva poziva uspije;
  - gubitnik gubi **zbog druge strane** — greška je `CATEGORY_NOT_EMPTY` ili `INVALID_CATEGORY`, ne nešto treće.
- **guard i dalje odbija** arhiviranje kategorije koja već ima živ članak (regresija postojećeg ponašanja).

**Ostalo:** runner guard **23/23** (svaki `knowledge-base` integration spec mora biti u listi); backend
`knowledge-base`+`users`+`audit-log` **63 suite / 286 testova** (6 integracionih suite preskočeno lokalno),
`eslint` zelen; `tsc --noEmit` bez novih stvarnih grešaka u diranim fajlovima.

## CI i testni dokaz

CI run [`44956273227`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44956273227) na `6ff475c` je
**success**:

- **Backend build + test** — uspješno (validate/generate/wiring/build/lint/puni `npm test`).
- **Backend PostgreSQL + Redis integration** — uspješno; u koraku „Run real PostgreSQL integration suites”
  izvršen je i novi `knowledge-category-archive-race` shard (5 rundi trke pod stvarnom bazom).
- **Frontend build + test** — uspješno (paket ne mijenja frontend).
- **Backend container + supply chain**, **Docs guard**, **CI gate** — uspješno; `Perf smoke` takođe **success**.
- **Skipped (po konfiguraciji):** `Read-only service-form pattern inventory`, `E2E critical flows`,
  `E2E install wizard` — puni E2E pokreće korisnik.

## Registar nalaza

- Zatvoreni: `BA-knowledge-base-10` (P2). Modul je time **11/19** (`01`–`11`).
- Ostaju otvoreni u `25-knowledge-base.md`: 8 nalaza, **P1: nema** (`12`–`15` P2; `16`–`19` P3).
- Globalno nakon regenerisanih zbira: **696 nalaza, 302 zatvoreno / 394 otvoreno**; Val 7 **81/111**, otvoreno
  **30** (P1 0 / P2 16 / P3 14).

## Migracija, rollout i rollback

Nema migracije i nema schema promjene. Rollback: revert `6ff475c` vraća TOCTOU prozor; nema podataka za
vraćanje.

**Preostali rizik (dokumentovan):**

1. **Brava pokriva samo pisce koji idu kroz ovaj kod.** Ručni SQL, budući bulk importer ili skripta koja piše
   `categoryId` bez brave i dalje može napraviti nemoguće stanje. Trajno rješenje (FK/trigger ili unique
   „jedan aktivni članak po arhiviranoj kategoriji”) traži migraciju.
2. **`lock_timeout` je 5 s** (default `DatabaseLockService`): ako neko drži bravu duže, arhiviranje vraća
   `DATABASE_LOCK_TIMEOUT` umjesto da čeka zauvijek — to je namjerno i vidljivo, ne tiho.
3. **Arhiviranje i placement su serijalizovani po kategoriji**, ne po članku; masovni placement u istu
   kategoriju se reda, što je i svrha.

## Sljedeći paket

**W7.85 — `BA-knowledge-base-12` (P2): unbounded reminder query i recipients bez active/scope provjere.**
