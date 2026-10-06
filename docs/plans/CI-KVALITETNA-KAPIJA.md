# CI i e2e kapija — jeftinije bez gubitka pokrivenosti

> **Status: odobreno 2026-10-06 (odluke vlasnika, §4); implementirano istog dana.** Vlasnik je izabrao:
> (1) **PR prema `master` je kapija**, (2) **smoke podskup na PR-u + puni prolaz noću**, (3) **samo obavijest o
> neuspješnom deployu u Coolifyju** (bez prebacivanja deploya u CI).
>
> Ulaz: zatečeno stanje od 2026-10-06 — push na `master` pokreće tri joba, e2e traje 35–60 min i vrti se protiv
> **živog staging stacka**, a Coolify istovremeno rebuilda taj isti stack iz istog commita.

## 1. Zašto — šta je zatečeno (s dokazima)

| Zatečeno | Dokaz |
|---|---|
| Push na `master` pokreće backend (4 min), frontend (4 min) i e2e, koji čeka oba | `.github/workflows/ci.yml` (prije izmjene, `needs: [backend, frontend]`) |
| Puni e2e traje **35–62 min** i vrti se samo na `master`/`main` i ručno | runovi `37366461655` (61 min), `37356911706` (60 min), `37319859974` (62 min) |
| Novi push na isti ref **otkazuje** prethodni run | `concurrency.cancel-in-progress: true`; 4 od 12 zadnjih runova su `cancelled` poslije 0/1/4/14 min (`37366334426`, `37427924024`, `37420530104`, `37351082075`) |
| Dokumentacija pokreće isti puni e2e — `418ac44` dira **3 fajla, sva tri dokumentacija** (`DOCS_CHANGELOG.md`, `REVIEW_ANALIZA.md`, `docs/plans/modules/5.1-…md`) | `gh api repos/…/commits/418ac44 --jq '.files[].filename'`; run `37431588635` (isti commit, e2e `in_progress`) |
| e2e mjeri **staging stack**, ne ono što je CI upravo izgradio: Coolify gradi iz `master` čim push stigne | `e2e/README.md` („expects a live stack … Coolify contract"), `ops/COOLIFY.md` |

Zaključak: problem nije broj testova, nego to što je jedini automatizovani sloj vezan za događaj
(`push → master`) na kojem ne može biti kapija — u trenutku izvršavanja **već je deployovano**. Kapija mora
stajati prije `master`, a puni e2e tamo gdje stack miruje.

## 2. Novi model (implementirano u `.github/workflows/ci.yml`)

| Događaj | Šta se vrti | Trajanje (procjena iz mjerenja) |
|---|---|---|
| **PR prema `master`/`main`, dira kod** | `changes` → backend + frontend → **e2e smoke** (5 fajlova: 01, 02, 03, 15, 22); `retries=0`, `--max-failures=1` | ~4 + ~4 + ~10–15 min (najduži job drži kapiju) |
| **PR koji dira samo dokumentaciju** (`docs/**`, `.cursor/**`, `*.md`, `perf/results/**`) | `changes` → **`docs-guard`** (`check-docs-content` + njegov test, bez `npm ci`) | ~1 min |
| **push na `master`, dira kod** | `changes` → backend + frontend; **e2e se ne vrti** (Coolify upravo rebuilda stack) | ~5 min |
| **push na `master`, samo dokumentacija** | ništa (workflow `paths-ignore`) | 0 min |
| **noćno (`schedule`, 01:00 UTC)** | backend + frontend + **puni e2e** (svih 36 fajlova, `retries=1`) | ~35–60 min, van radnog vremena |
| **ručno (`workflow_dispatch`)** | trijaža: `specs=10,18,22`, `retries: 0`, `max_failures: 8`, ili puni prolaz | minuti, ne desetine minuta |

### Zašto jedan `CI gate` job, a ne tri obavezna checka

Path filter na nivou workflowa i obavezni status check **ne idu zajedno**: kad je workflow preskočen, check se
nikad ne pojavi i PR ostaje „Expected — Waiting for status to be reported" — merge je blokiran trajno, bez
greške koja se vidi [1](https://github.com/orgs/community/discussions/44490). Zato filter radi **unutar** runa
(`changes` job), a obavezni check je jedan job `CI gate` koji:

- ima `if: always()` i `needs: [changes, backend, frontend, docs-guard, e2e]`,
- pada **samo** ako je neki job `failure` ili `cancelled`,
- u `$GITHUB_STEP_SUMMARY` ispisuje tabelu `job → result`, pa je u jednom pogledu vidljivo **šta je stvarno
  izvršeno**, a šta je preskočeno (nema „zelene kvačice bez testa" — preskočeno se eksplicitno vidi).

### Zašto `git diff`, a ne `dorny/paths-filter`

Repou se ne dodaje nijedna akcija trećeg lica; `changes` job koristi `git diff --name-only` protiv
`origin/<base>` (PR) ili `github.event.before` (push). Ako diff ne može da se izračuna (prvi push, force push,
plitka istorija), job se **fail-safe** ponaša: `code=true, docs=true` i vrti se sve. Provjereno simulacijom:

| Diff | `code` | `docs` | Ishod |
|---|---|---|---|
| samo `docs/d.md` | `false` | `true` | samo `docs-guard` |
| samo `src/a.ts` | `true` | `false` | backend + frontend + e2e smoke |
| `README.md` + `perf/results/r.md` | `false` | `true` | samo `docs-guard` |
| nepoznat base (`0000…`) | `true` | `true` | sve (fail-safe) |

### Šta je namjerno ostavljeno kako je bilo

- **Preflight i tvrda e2e kapija** (`::error title=E2E did not run`) — ostaju; e2e se i dalje ne može „tiho
  preskočiti".
- **Sekvencijalni pristup staging stacku**: `e2e/playwright.config.ts` je `fullyParallel: false`, `workers: 1`,
  a specovi dijele iste podatke; `concurrency` grupa je i dalje po refu, pa se dva runa nad istim stackom ne
  pokreću paralelno.
- **Perf smoke** ostaje nepromijenjen (samo `pull_request` + ručno).

## 3. Dokazi (izvršeno u ovom okruženju, 2026-10-06)

| Provjera | Komanda / način | Rezultat |
|---|---|---|
| YAML se parsira i ima očekivane okidače i jobove | `js-yaml` parse `.github/workflows/ci.yml` | okidači `push, pull_request, schedule, workflow_dispatch`; jobovi `changes, backend, frontend, docs-guard, e2e, gate` |
| Guard repoa za workflow YAML | `node scripts/check-workflows-yaml.mjs` | OK (dvotočke, dupli ključevi, tabovi) |
| Sintaksa svih `run` blokova | `bash -n` nad svakim `run` blokom (36 blokova) | 0 padova |
| Izbor moda e2e | simulacija `run` koraka za `pull_request` | `smoke subset (01,02,03,15,22)`, `retries=0`, `max-failures=1`, 5 fajlova |
| Izbor moda e2e | simulacija za `schedule` | bez `--max-failures`, `retries=1`, svi fajlovi |
| Klasifikacija izmjena | 4 scenarija u privremenom repou (tabela gore) | kako je opisano |
| Logika kapije | simulacija `gate` koraka kroz 5 ishoda | `skipped` prolazi; `failure` i `cancelled` padaju |

**Nije izvršeno ovdje:** sam GitHub run novog workflowa — prvi runovi su na grani vlasnika (PR) poslije mergea
ovih izmjena u `master`; dokaz je CI job `CI gate` i njegova tabela u summaryju.

## 4. Odluke vlasnika (2026-10-06)

| # | Pitanje | Odluka |
|---|---|---|
| 1 | Gdje je kapija za `master`? | **PR prema `master`** + obavezni status check (`CI gate`) |
| 2 | Koliko e2e na svakom mergu? | **Smoke podskup (~10–15 min)** na PR-u; **punih 71 test noću** i prije većeg mergea |
| 3 | Coolify? | **Samo obavijest o neuspješnom deployu**; auto-deploy ostaje, deploy se ne prebacuje u CI |

## 5. Šta vlasnik treba uraditi ručno (jednom)

Agentova GitHub integracija **nema** dozvolu za zaštitu grana (`gh api …/branches/master/protection` vraća
`403 Resource not accessible by integration`), pa ovaj korak radi vlasnik. Dovoljno je u GitHub UI-ju:
**Settings → Branches → Add branch protection rule** (`master`): ✅ *Require a pull request before merging*
(0 approvals), ✅ *Require status checks to pass* → dodati **`CI gate`**, ✅ *Require branches to be up to date*,
i **isključeno** *Include administrators* (da `git push origin master` iz ff-merge toka i dalje radi).

Isto kroz API (JSON u fajl zbog ugniježđenih polja):

```bash
cat > /tmp/protection.json <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["CI gate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
gh api -X PUT repos/mudzy992/help-desk-enterprise/branches/master/protection --input /tmp/protection.json
```

> `enforce_admins: false` je namjerno: vlasnik i dalje smije direktno gurnuti `master` (npr. ff-merge u nuzdi),
> ali PR-ovi prolaze kroz kapiju. Ako se to ikad poželi zabraniti, postavi `true` — tada svaki put na `master`
> ide isključivo kroz PR.

**Coolify (obavijest):** *Notifications* → kanal (email/Discord/webhook) → uključi događaj **Deployment failed**
i pošalji testnu obavijest. Auto-deploy ostaje uključen. Opciono, i neoslonjeno na provjeru iz ovog repoa:
Coolify „Watch Paths" može preskočiti build za docs-only commit (ako se to uključi, neka lista bude ista kao
`paths-ignore` u `ci.yml`).

**Nakon prvog zelenog PR-a:** provjeriti da se u zaštiti pojavljuje tačno ime checka **`CI gate`** (ime joba);
ako je dodano prije prvog runa, GitHub traži da se check pojavi barem jednom prije nego se može izabrati.

## 6. Kako se koristi u trijaži

1. Crven PR → u runu otvoriti **Summary** tabele `CI gate` (šta je palo), pa log e2e koraka.
2. Ponoviti samo problematične specove: **Actions → CI → Run workflow** (`specs=10,18,22`, `retries: 0`,
   `max_failures: 8`).
3. Puni prolaz prije većeg mergea: **Run workflow** bez `specs`; noćni prolaz teče sam.
4. Ako je PR samo dokumentacija, ne očekivati e2e — tabela pokazuje `skipped` za backend/frontend/e2e, a zelen
   je `Docs guard`.

## 7. Veze

- `e2e/README.md` — šta e2e job traži (varijable, secreti, preflight) i novi raspored po događajima.
- `ops/COOLIFY.md` — Coolify strana (deploy, healthcheck); obavijest o neuspješnom deployu je opisana ovdje, §5.
- `.cursor/plans/quality-e2e-critical-flows/HANDOFF.md` — izvorni dogovor („CI unit gate zasebno; E2E job na
  `workflow_dispatch` / `main`") je ovim dokumentom zamijenjen.
- `REVIEW_ANALIZA.md` — e2e kapija iz vala 5 (E-1) ostaje na snazi; ovaj dokument je ne mijenja, samo je
  pomjera na PR i dodaje noćni puni prolaz.
