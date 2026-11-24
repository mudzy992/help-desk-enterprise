# W1.5 — `BA-xcut-08`: demo CLI nije više write-by-default, `--remove` ima guard, potvrdu i audit

**Paket:** Val 1, cross-cutting (CLI/seed), **P1**<br>
**Nalaz:** „Destruktivni/demo CLI ima write-by-default i hard-delete bez production target guarda, potvrde i audita”<br>
**Kod:** `src/cli/safety/cli-target.ts` (**novo**), `src/cli/safety/cli-invocation.ts` (**novo**),
`src/cli/safety/cli-operator-audit.ts` (**novo**), `src/cli/assets-demo-inventory.ts` (**novo**, izdvojeno iz CLI-ja),
`src/cli/assets-seed-demo.ts` (prerаđen), `src/modules/audit-log/audit-log.constants.ts` (+`cli.command.executed`,
+`cli_command`), `audit-action-schema-registry.ts`, `audit-action-scope-registry.ts`,
`audit-action-compatibility-registry.ts`<br>
**Frontend:** `lib/audit/audit-log-actions.ts`, `audit-log-entities.ts`, `audit-log-fields.ts`,
`audit-log-values.ts`, `bs`/`en` `common.json` (label akcije, entiteta, šest polja i tri zatvorena rječnika)<br>
**Specovi:** `cli-target.spec.ts`, `cli-invocation.spec.ts`, `cli-operator-audit.spec.ts`,
`assets-demo-inventory.spec.ts` (**novi, 28 testova**), `cli-demo-inventory.integration.spec.ts` (**novo, realni
PostgreSQL**), `scripts/run-isolated-integration.mjs` (+suite)<br>
**DB migracija:** **nema** (koristi postojeći `audit_log` i njegov particionisani lanac)<br>
**Rute:** nepromijenjene (632)

## Nalaz

Audit (`44-cross-cutting-infrastructure.md` §11) je bio konkretan: `assets-seed-demo` je **pisao demo podatke po
defaultu** u bazu na koju pokazuje `DATABASE_URL`, a `--remove` je **hard-deleteao** četiri tabele bez ijednog od
četiri pitanja koja takva komanda mora postaviti:

1. **Koja baza je to?** Nije bilo `--environment`, target fingerprinta ni production allow flaga — isto ponašanje
   nad laptopom i nad produkcijom.
2. **Da li je operator to stvarno mislio?** Nije bilo potvrde; `--remove` je radio na prvi Enter.
3. **Zašto?** Nije bilo `--reason`.
4. **Ko je to uradio i šta je nestalo?** Nije bilo audit reda — komanda je ostavljala samo stdout, pa se hard delete
   demo podataka nije razlikovao od deletea koji se nikad nije dogodio.

Nalaz je P1 upravo zbog prve i četvrte stavke: nepovratna radnja bez traga.

## Odluka

**Default je dry run, a write je eksplicitan i dokaziv.** Matrica je namjerno monotona — nema tier-a u kojem nešto
„manje opasno” preskače guard:

| Režim | Šta treba |
| --- | --- |
| dry run (bez `--apply`) | samo `--environment`; ništa se ne piše, **ni audit** |
| `--apply` | `--environment E`, `--reason` (≥5), `--operator <admin>`, `--confirm <komanda>@E:<fingerprint>` |
| `environment=production` | + `--allow-production` |
| `--remove` | **mora** `--apply` (destruktivni režim ne preskače guard write-a) |

Dvije posljedice koje su namjerne, ne slučajne:

- **Okruženje se deklariše, ne pogađa.** Nema heuristike „localhost ⇒ development”. Jedini zaključak koji CLI izvodi
  sam je **refusal**: kontejner sa `NODE_ENV=production` ne može se izjasniti kao development/staging.
- **Nepoznat flag je greška.** `--aply` je nekad bio tihi dry run koji izgleda kao uspjeh; sada je
  `CLI_UNKNOWN_FLAG:--aply`.

## Implementacija

### 1. Target guard — `safety/cli-target.ts`

`DATABASE_URL` se parsira u `(host, port, database)`; **fingerprint** je `sha256("host:port/database")` skraćen na 12
hex znakova. Kredencijali nikad ne ulaze u fingerprint, u ispis ni u audit. `formatCliTarget` ispisuje
`environment host:port/database (fingerprint)` i test dokazuje da u tom ispisu nema ni korisnika ni lozinke iz URL-a.

### 2. Invocation guard — `safety/cli-invocation.ts`

Sva pravila su u **jednoj čistoj funkciji** `resolveCliInvocation`, pa ih test pokriva bez baze i nijedna komanda ne
može „zaboraviti” guard: `CLI_ENVIRONMENT_REQUIRED`, `CLI_ENVIRONMENT_INVALID`, `CLI_ENVIRONMENT_MISMATCH`,
`CLI_DATABASE_URL_REQUIRED`, `CLI_REMOVE_REQUIRES_APPLY`, `CLI_APPLY_REQUIRES_REASON`, `CLI_REASON_TOO_SHORT`,
`CLI_APPLY_REQUIRES_OPERATOR`, `CLI_OPERATOR_INVALID`, `CLI_APPLY_REQUIRES_CONFIRMATION`,
`CLI_CONFIRMATION_MISMATCH` (ispisuje očekivanu frazu — to je fingerprint, ne tajna), 
`CLI_PRODUCTION_REQUIRES_ALLOW_FLAG`, `CLI_UNKNOWN_FLAG`, `CLI_COMMAND_HAS_NO_REMOVE_MODE`. Izlazni kod za svaki
refusal je **2**, isti kao u ostalim CLI-jevima ovdje.

`--apply` se **ne može** zadati env varijablom (`CLI_ENVIRONMENT`/`CLI_REASON`/`CLI_OPERATOR` mogu; `--apply` ne) —
write mora biti otkucan.

### 3. Operator i audit — `safety/cli-operator-audit.ts`

- **Operator** je stvarni, aktivni, neanonimizovani račun sa `ADMIN` ili `SUPER_ADMIN` rolom; lookup je
  case-insensitive. Nepostojeći račun ⇒ `CLI_OPERATOR_NOT_FOUND`, neprivilegovan ⇒ `CLI_OPERATOR_NOT_PRIVILEGED`.
  Audit red nosi `actorUserId`, kao i svaka druga akcija — „neko je otkucao `--operator`” nije dokaz.
- **Nova akcija** `cli.command.executed`, entitet `cli_command`, scope **`global`** (CLI radnja pripada instalaciji,
  ne jednoj OU), `entityId = <komanda>@<environment>:<fingerprint>`.
- **Metapodaci su zatvoren skup:** `command`, `environment`, `mode`, `outcome`, `reason`, `targetFingerprint`,
  `confirmation`, `counts`. Test pušta red kroz pravi `prepareAuditEntry`, pa allowlist nije dokumentacija nego
  izvršno pravilo; `counts` je izostavljen na `started` redu (ne tvrdimo da je posao završen). `counts` nosi i
  `retainedAssets`/`retainedLicenses`/`retainedContracts`, pa audit kaže i šta **nije** obrisano i zašto.
- **Fail-closed:** `started` se piše **prije** prvog write-a. Ako taj red ne može nastati, komanda ne dira bazu.
  `completed` nosi brojeve koje je run stvarno commitovao. Kod `--remove` taj red se piše **u istoj transakciji** kao
  i delete-i, pa rollback ostavlja samo pošten zapis „pokušano”.

### 4. Inventar — `assets-demo-inventory.ts`

Seed/remove tijelo je izdvojeno iz CLI-ja: modul ne zna ništa o flagovima i ne piše na stdout, vraća brojeve. Dvije
posljedice:

- `planDemoInventory` je **read-only** i to je dokaz da dry run ništa ne piše (unit test koristi klijent koji baca
  grešku na svaki write poziv).
- `--remove` sada briše u **redoslijedu zavisnosti**: prvo demo-graf (licence-assignment, contract-item, relacije) za
  imovinu koja se briše, pa imovinu, pa lokacije. Bez toga DB guard `Asset_hard_delete_dependencies` (W7.15) odbije
  svaki delete — stara komanda je brisala imovinu prvu, pa se seedovani inventar **nije mogao ukloniti uopšte**.
- Demo imovina koju referencira **tiket, prenosnica, problem ili promjena** se **zadržava** i **prijavljuje**
  (`retainedAssets`): brisanje bi odvezalo poslovnu istoriju. Isto važi za demo licence koje su dodijeljene **ljudima**
  (`retainedLicenses`) i ugovore koji još imaju stavke (`retainedContracts`) — odvezivanje osobe je poslovna odluka, ne
  čišćenje demo podataka, pa se broj prijavi umjesto da se tiho odveže.

### 5. Šta ostaje za W1.17 (`BA-xcut-25`)

Ovaj paket uvodi **zajednički guard modul** i primjenjuje ga na jedinu komandu iz nalaza. Namjerno **nije** dirao
`ensure-e2e-actors`, `apply-settings`, `assets-import`, `install-rerun`, `secrets`, `privacy-replay`,
`rekey-asset-licenses`, `seed-default-role-permissions`, `reset-mfa` ni `db:seed`: oni su već `--dry-run`/`--apply` sa
`--reason`, a njihova konsolidacija (target fingerprint za sve, checkpoint/budžet, seed client kroz common pool) je
upravo predmet `BA-xcut-25` (W1.17) i `BA-xcut-32` (W1.21). Granica je zapisana i u registru.

## Direktni testni dokaz

- `src/cli/safety/cli-target.spec.ts` (9) — parsiranje URL-a bez kredencijala, odsustvo lozinke u ispisu i
  fingerprintu, obavezan i validan `--environment`, mismatch sa `NODE_ENV=production`, obavezan `DATABASE_URL`,
  format fraze potvrde, razlika između odsutnog flaga i flaga bez vrijednosti.
- `src/cli/safety/cli-invocation.spec.ts` (10) — cijela matrica: dry run bez ijednog uslova, `--remove` bez `--apply`,
  prekratak/odsutan `--reason`, odsutan/neispravan operator (+ `CLI_OPERATOR` iz env-a), tražena i pogrešna
  potvrda, production sa i bez `--allow-production`, `--remove` na komandi bez tog režima, `--aply` kao greška,
  i dokaz da env varijable **ne mogu** započeti write.
- `src/cli/safety/cli-operator-audit.spec.ts` (5) — operator lookup (aktivnost, anonimizacija, case-insensitive,
  privilegovana rola), refusal za nepostojećeg i neprivilegovanog operatora, i audit red propušten kroz pravi
  `prepareAuditEntry` (akcija/entitet/entityId/actor, allowlist odbija nepoznat ključ, `started` nema `counts`).
- `src/cli/assets-demo-inventory.spec.ts` (4) — plan je read-only (klijent koji baca na svaki write), removable vs.
  retained podjela, nedostajući tipovi imovine se prijavljuju a ne izmišljaju, nema OU ⇒ jasan ispis, marker `DEMO`
  ostaje ugovor sa `--remove`.
- `src/cli/cli-demo-inventory.integration.spec.ts` (**realni PostgreSQL**) — operator se resolvuje kroz rolu; seed
  ostavlja **dva** audit reda (`started`, `completed` sa `counts`) na **istom** globalnom lancu i istim actorom; drugi
  seed ne slaže demo podatke i ostavlja samo `started`; `--remove` briše inventar (uključujući demo-graf, pa lokacije),
  **zadržava** tiketom vezanu imovinu i ljudima dodijeljene licence i to prijavljuje, piše `completed` sa brojevima u
  istoj transakciji i lanac se nastavlja (`previousHash` = prethodni `hash`); nakon odvezivanja tiketa **drugi** run
  dovrši posao (`assets=1`, `retained=0`) — komanda je idempotentna; forsirani rollback **ne** ostavlja `completed` red i
  ne briše ništa.

## Registar nalaza

- Zatvoreno: `BA-xcut-08` (uz zeleni CI i gornji dokaz).
- Ostaje otvoreno: `BA-xcut-25` (W1.17 — framework za sve CLI-jeve, target fingerprint svuda, checkpoint/budžet) i
  `BA-xcut-32` (W1.21 — seed client kroz common pool/metrics). Granica je zapisana u auditu 44 (§11 dodatak).
