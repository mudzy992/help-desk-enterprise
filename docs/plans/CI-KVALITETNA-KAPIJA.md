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

### Datumi u ogledalu dokumentacije nisu kapija

`backend/content/docs/manifest.json` nosi `updatedAt` iz gita, pa datum zavisi od dubine klona i od trenutka
generisanja. Prvi push ovog rasporeda je upravo zato oborio `frontend` job (`REVIEW_ANALIZA.md`, CI-3), dok je
`docs-guard` s plitkim checkoutom prolazio. Provjera sinhronizacije sada poreda sve **osim** datuma, a razliku
ispisuje kao napomenu s imenima stranica (`node scripts/generate-docs-content.mjs` u punom klonu ih osvježi);
kapija tako ne zavisi od okruženja.

### Šta je namjerno ostavljeno kako je bilo

- **Preflight i tvrda e2e kapija** (`::error title=E2E did not run`) — ostaju; e2e se i dalje ne može „tiho
  preskočiti".
- **Sekvencijalni pristup staging stacku**: `e2e/playwright.config.ts` je `fullyParallel: false`, `workers: 1`,
  a specovi dijele iste podatke. Do 2026-11-27 je `concurrency` grupa bila samo po refu, pa su se **nightly
  (`master`) i PR run (`arena/…`) mogli izvršavati paralelno nad istim stackom**; §10 to zatvara job-level
  grupom `e2e-shared-stack`.
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

Isto kroz API — jedan red, JSON ide na stdin (radi i u Git Bash na Windowsu; `gh api … --input -` čita sa
standardnog ulaza, pa nema privremenog fajla ni problema s `/tmp` putanjom):

```bash
echo '{"required_status_checks":{"strict":true,"contexts":["CI gate"]},"enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null}' | gh api -X PUT repos/mudzy992/help-desk-enterprise/branches/master/protection --input -
```

Provjera da je zaštita zaista postavljena:

```bash
gh api repos/mudzy992/help-desk-enterprise/branches/master/protection --jq '{checks: .required_status_checks.contexts, strict: .required_status_checks.strict, admins: .enforce_admins.enabled, approvals: .required_pull_request_reviews.required_approving_review_count}'
```

Ako i vlasnik dobije `403`/`404`, njegov `gh` token nema pravo administracije repoa: `gh auth status`, pa
`gh auth refresh -h github.com -s repo` (klasičan token), odnosno fine-grained token s dozvolom
*Administration: read and write*. UI put (`Settings → Branches`) ne traži nikakav token i uvijek je rezerva.

> Napomena o `gh api` sintaksi: komanda prima **jedan** argument (putanju). Ako se u terminal zalijepi cijeli
> red iz bilješke — uključujući opis i strelicu — shell ga razbije na više riječi i `gh` javi
> `accepts 1 arg(s), received 8`; to nije greška u zaštiti nego u nalijepljenoj komandi.

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

## 8. Kad stack nestane tokom noćnog runa (2026-11-17)

Noćni run [`44049572740`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/44049572740)
(`schedule`, `master` @ `2c7b12c`) pao je sa **18 crvenih testova**. Zeleni su bili build/unit, PostgreSQL+Redis
integracija, container i supply chain, frontend i Docs guard; pali su `E2E critical flows` i `CI gate`.
Playwright: 109 prošlo, 18 palo, 0 flaky, 1 preskočen, 47 minuta.

**Uzrok nije kod.** Preflight je u 08:46 UTC dobio `200` na `/health`, a onda je u toku runa reverse proxy
počeo da vraća **svoju HTML stranicu** (`<title>Site not available</title>`, HTTP 503, `meta robots noindex`,
`--accent #6b16ed`) i za API i za aplikaciju. Dokazi iz sačuvanog Playwright izvještaja:

- 13 padova = `ApiRequestError: HTTP_503: <!DOCTYPE html>` (specovi 42 ×4, 43, 44 ×3, 45, 46 ×2, 47 ×2) — svaki
  je ponovljen jedanput (`retries=1`) i opet dobio proxy stranicu;
- `43-privacy-notice-editor:129` — aplikacija je umjesto forme za prijavu prikazala ekran
  „Status instalacije nije moguće provjeriti / Server nije odgovorio…“ (gate na `GET /install/status`), a helper je
  to vidio kao 20 s timeout na `locator.fill`;
- `48-captcha-turnstile:66` — `SyntaxError: Unexpected token '<'` (JSON parse nad proxy stranicom);
- `49-docs-smoke:6` i `42:686` — timeout u istom prozoru.

Proxy se do kraja runa nije vratio. Zašto je aplikacija stajala (restart, OOM, deploy) iz runnera se **ne može**
utvrditi — to je zapis hosting sloja (Coolify) za taj interval. Zato je implementacija okrenuta ka tome da takav
događaj bude **prepoznat, kratko prekinut i tačno imenovan**, a ne da se čita kao 18 regresija:

| Mehanizam | Gdje | Efekat |
|---|---|---|
| Preflight čeka do 120 s | `.github/workflows/ci.yml` | restart/rolling redeploy prije runa ne obara job; provjerava `200` **i** `{"status":"ok"}`, pa i `$E2E_BASE_URL/` |
| Gateway retry u klijentu | `e2e/helpers/api-client.ts` | `502/503/504` sa tijelom koje nije naš JSON = proxy, pa se ponavlja (2 s / 10 s / 20 s) i za write; na kraju `STACK_UNAVAILABLE` |
| Watchdog | `e2e/scripts/run-e2e.mjs` | `/health` svakih 15 s; 4 uzastopna neuspjeha (~45 s) prekidaju Playwright uz jednu `::error` anotaciju i `stack-watch.json` |
| Klasifikacija | `e2e/scripts/summarize-playwright-json.mjs` | `[stack]` / `[stack-suspect]` oznake; trijažni red (`specs=…`) samo za prave padove |
| Vremenska linija | `stack-watch.json` (+ artifact) | tačan prozor `firstAt`–`lastAt` i da li se stack vratio — uporedivo sa Coolify historijom |

Jedini pravi (ne-infrastrukturni) pad u tom runu bio je **spec 30**: tvrdnja da je broj problema vidljiv na
stranici tiketa, bez otvaranja sekcije koja ga drži. `DetailSection` drži `problems`, `links` i `formData`
**sklopljene** (`frontend/src/lib/tickets/detail-sections.ts`), pa se link razriješio kao `<a>` koji je `hidden`.
Popravka: helper `openDetailSection(panel)` (`e2e/helpers/ticket-detail-sections.ts`) + provjera unutar panela.

Operativno: crven e2e job sa `STACK OUTAGE` blokom **ne** znači popravku koda. Provjeri da
`$E2E_API_URL/health` vraća `200` + `{"status":"ok"}`, pogledaj Coolify historiju za navedeni prozor, pa pusti
`specs=<brojevi iz sažetka>` (bez `[stack]` oznake).

## 9. Noćni run 45139438329 (2026-11-23): `06-confidential` — pretpostavka o rutiranju, ne procurena tajna

Noćni run [`45139438329`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45139438329)
(`schedule`, `master` @ `3d4ed11`) pao je na `E2E critical flows`/`CI gate`. Playwright: **125 prošlo, 1 palo,
1 flaky, 1 preskočen** (42 min). Jedini pravi pad:

```
FAIL 06-confidential.spec.ts:15 — agent without ACL is denied; SuperAdmin can open it
     Error: expect(received).rejects.toThrow() — Received promise resolved instead of rejected
```

**Uzrok nije procurena tajna.** Tiket je bio klasifikovan `INTERNAL` sa `isConfidential: true`, ali je dobio
`assignedGroupId` (grupa „Unrouted"), a E2E agent je član te grupe. `evaluate-confidential-ticket-access.ts`
tada vraća `allowed: true, via: 'handler_group'` — **član handlerske grupe je dokumentovan kanal pristupa**, uz
primaoca, učesnike, grantove, dozvoljene role/grupe i break-glass. Test je bio napisan na pretpostavci:

> „Svježa usluga nema routing pravilo, pa tiket ostaje `UNROUTED` i agent nema handlersku grupu."
> (`06-confidential.spec.ts`, komentar iznad testa)

Ta pretpostavka je o stack-podacima, ne o kodu: `resolveTicketRouting` traži pravilo **po tačnom `serviceId`**, pa
svježa usluga zaista nema pravilo — ali tiket onda ide u **unrouted queue**, a taj red ima
`private.ticket.unroutedQueue.targetGroupId` (na ovom stacku grupa „Unrouted"). Tiket je time dodijeljen grupi u
kojoj agent radi i pristup je legitimno otvoren. Ista stvar je već bila poznata u specu 02 („a live stack may have
a wildcard rule…"), ali u specu 06 nije bila pokrivena.

**Popravka (`06-confidential.spec.ts`).** Premisa se sada **gradi i dokazuje**, a ne pretpostavlja:

| Korak | Šta dokazuje |
|---|---|
| `POST /groups` → `E2E Confidential <stamp>` **bez članova** | handlerska grupa kojoj nijedan E2E akter ne pripada |
| `POST /routing/rules` za svježu uslugu → ta grupa | tiket ide `exact` rutom, ne u fallback red |
| `GET /tickets/:id` kao **primalac** (`isConfidential === true`, `assignedGroupId === grupa`) | premisa je stvarna prije nego što se tvrdi odbijanje |
| `GET /tickets/:id` kao agent → `rejects` | odbijanje je posljedica politike, ne slučajnosti stacka |
| `finally`: brisanje pravila i grupe (best effort) | nema nakupljanja E2E grupa; `ops/sql/cleanup-e2e-data.sql` čisti ostatke |

Faktovi se čitaju kao **primalac**, jer SuperAdmin prije break-glasa može legitimno imati *manje* prava od njega.

**Dokaz.** Ciljani trijažni run
[`45148046860`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45148046860)
(`workflow_dispatch`, `specs=06`, `retries=0`, `max_failures=8`) — **zelen**: `1 passed, 0 failed, 0 flaky,
0 skipped` (27 s), `CI gate` ✓. Push-CI istog commita `45148040366` ✓.

**Šta ovo govori o noći, a šta ne.** Prozor ispada stacka 08:48–09:22 UTC objašnjava *flaky* `09-config-ops`
(`CONFIG_CATALOG_STATE_CONFLICT` zbog istovremenih E2E izmjena kataloga), ali **ne** pad speca 06, koji se desio u
08:40, prije prozora. Prethodne dvije noći: 2026-11-22 (`44999494543`) crvena je bila zbog **greške u reporteru**
(`$E2E_API_URL` pod `set -u`), što je već popravljeno u `e2e/scripts/report-stack-outage.mjs`; 2026-11-21
(`44882525653`) pao je spec 31 (`CHANGE_CAB_GROUP_REQUIRED`), koji je od tada prošao.

**Operativna posljedica za konfiguraciju.** Confidencijalni tiket koji nema routing pravilo pada u unrouted red i
time postaje vidljiv **cijeloj ciljnoj grupi tog reda** — to je namjerno (ta grupa ga obrađuje), ali znači da
`private.ticket.unroutedQueue.targetGroupId` treba birati kao grupu koja smije vidjeti i povjerljive tikete.

## 10. Noćni run 45973287907 (2026-11-27): TOTP replay i mrtav socket, ne dvije regresije

Noćni run [`45973287907`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/45973287907)
(`schedule`, `master` @ `20de2627`) pao je na `E2E critical flows` i `CI gate`; svi ostali poslovi (build/unit,
PostgreSQL + Redis integracija, container + supply chain, frontend, Docs guard) bili su zeleni.
Playwright: **125 prošlo, 2 pala, 4 flaky, 2 preskočena**, 55 minuta. Padovi (oba poslije `retries=1`, dakle
dvaput):

| Test | Poruka | Šta je stvarno bilo |
|---|---|---|
| `37-authentication-security.spec.ts:33` | `ApiRequestError: MFA_INVALID_CODE` na `POST /auth/mfa/recovery-codes` | server-side replay guard je odbio TOTP korak koji je **drugi run** već potrošio |
| `59-notifications-realtime.spec.ts:9` | `expect.poll` na `notification.created` frame, 30 s timeout | socket je umro sa restartom stacka; frame nije mogao stići |

**Zašto `37` nije regresija.** TOTP korak je single-use i to se pamti **na računu**, a svaki E2E job drži svoj
`lastStep` u `e2e/.auth/mfa.json`. Noćni run je krenuo u 09:23 UTC; u 09:40 su istovremeno radili PR run i push
run iste grane nad istim dijeljenim stackom. Dva nezavisna brojača koraka, jedan server-side brojač — drugi
potrošač istog 30 s koraka dobija `MFA_INVALID_CODE`. To je replay zaštita koja radi, ne pokvaren login.

**Zašto `59` nije regresija.** Watchdog je u istom runu zabilježio 8 epizoda neuspjelog `/health` između
09:44:02 i 10:20:33 UTC (37 min, stack se vratio prije kraja joba). Socket test drži otvoren panel i traži
frame za konkretan `messageId`; ako transport padne poslije `POST /tickets/:id/messages`, frame je izgubljen i
nijedan retry ga ne može vratiti. Test to do sada nije razlikovao od „notifikacija nije poslana".

**Popravke (paket `27f49610`).**

| Popravka | Gdje | Efekat |
|---|---|---|
| Retry na replay, ne na grešku | `e2e/helpers/mfa.ts` (`withFreshTotpCode`, `isTotpReplayError`) + `e2e/helpers/api-client.ts` (`requestJsonWithTotp`, `requestWithTotp`) | `MFA_INVALID_CODE` ⇒ potroši **sljedeći** korak jednom; svaka druga greška se baca odmah. Svi API call siteovi (20, 37, 39, 46, 47) idu kroz helper |
| Živ socket prije upisa i poslije njega | `e2e/tests/59-notifications-realtime.spec.ts` | provjera `readySockets` neposredno prije `POST`; ako transport padne u toku isporuke, pad nosi `STACK_UNAVAILABLE` i klasifikuje se kao `[stack]`, a ne kao tihi `false` |
| Jedan browser run nad stackom | `.github/workflows/ci.yml` (`e2e`, `e2e-install-wizard`) | job-level `concurrency.group: e2e-shared-stack`, `cancel-in-progress: false` — nightly se **ne** otkazuje, nego čeka; PR run ne može trošiti iste račune paralelno |
| Guard nad guardom | `scripts/check-workflows-yaml.test.mjs`, `e2e/unit/mfa-fresh-code.spec.ts` | brisanje concurrency grupe ili retry semantike ruši test bez stacka |

**Dokaz.** Trijažni dispatch `45993969969` (`specs=37,59`, `retries=0`, `max_failures=8`, `skip_gates=true`) nad
istim stackom: **10 prošlo, 0 palo, 0 flaky, 0 preskočeno** — oba testa iz noćnog pada, bez ijednog retryja.
Push run `45993970452` (isti commit) zelen.

**Šta ovo ne tvrdi.** Popravka ne dokazuje da je notifikacija uvijek isporučena — dokazuje da mrtav transport
više ne izgleda kao tiha regresija i da mjerenje više ne zavisi od toga koji je run prvi potrošio TOTP korak.
Reprodukcija je namjerno ostala na trijažnom dispatchingu (`specs=37,59`, `retries=0`) nad istim stackom.

## 11. Dupli runovi, mapiranje specova i tihi e-mail (2026-11-27)

**Povod.** PR #52 (`W2.34`) je imao dva runa: `46061230132` na code commitu i `46064203121` na docs commitu
(`EXECUTION-PLAN-REMAINING.md` + jedan closeout). Drugi je ponovio **cijeli** matriks — backend 6m47s, integracija
22m26s, frontend 3m35s, container 2m57s, E2E 10m26s — jer `changes` radi `git diff --name-only origin/master HEAD`,
tj. gleda **cijeli PR**, a ne zadnji commit. U prozoru `W2.29`–`W2.34` bilo je 12 PR E2E runova; četiri su bila
docs-only commitovi na već zelenom PR-u. Nijedan od tih runova nije uhvatio regresiju, a specovi `01/02/03` prave
tikete kroz UI, pa stack pri tome **stvarno** šalje notifikacioni e-mail — svaki run i svaki rerun troše dnevnu kvotu
provajdera.

**Šta je promijenjeno.**

| Tačka | Prije | Sada | Dokaz |
|---|---|---|---|
| Obim posla za PR | diff `origin/base..HEAD` (cijeli PR) | `scripts/ci-change-scope.mjs`: posao se preskače **samo** kad je sve od zadnjeg **zelenog** PR runa dokumentacija; inače sve ide | 9 testova u `scripts/ci-change-scope.test.mjs` |
| E2E skup na PR-u | fiksno `01,02,03,15,22,54` | `scripts/e2e-spec-selection.mjs`: putanja → spec, fallback na istih šest za sve nepoznato i kad unija pređe 4 fajla | 11 testova u `scripts/e2e-spec-selection.test.mjs` (uključujući provjeru da svaki broj postoji u `e2e/tests`) |
| Preklapanje runova | workflow `concurrency` sa `cancel-in-progress` samo na PR | **nepromijenjeno** — `group: ci-${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress` na PR; master run se ne otkazuje jer je zapis | `.github/workflows/ci.yml` (postavljeno 2026-10-06) |
| E-mail u PR smoke runu | `E2E_ALLOW_EMAIL_SEND` čuva samo eksplicitni send u specu 18; `01/02/03` šalju mimo njega | `E2E_DISABLE_EMAIL_CHANNEL=1` na PR-u: suite zatvori kanal kroz settings API i vrati ga u teardownu; noćni run ga ostavlja otvorenog | `e2e/helpers/outbound-email-gate.ts` + 9 unit testova |

**Zašto ovo ne slabi kapiju.**

- `CI gate` ostaje jedini obavezni status check i ostaje `always()`; tabela u summary-ju sada ispisuje i
  `Scope: <scope> - <razlog>` i `E2E specs: <lista> (<razlog>)`, pa se preskočeno vidi, a ne pretpostavlja.
- Preskakanje je dozvoljeno **samo** kad je zadnji zeleni run te grane prošao cijeli workflow, a sve između je
  dokumentacija. Nema zelenog runa, nema API dozvole, ili nepoznat diff ⇒ sve se vrti (fail-safe).
- Mapiranje nikad ne smanjuje skup ispod onoga što može uhvatiti promjenu: nepoznata putanja, `common/**`,
  `app.module.ts`, `prisma/**`, `.github/**` i svaka unija veća od četiri fajla vraćaju **punih šest**.
- E-mail kanal se ne mockuje: in-app notifikacije, šabloni, delivery redovi i health panel rade dalje i bilježe
  `email_channel_disabled`; noćni run i dalje pokriva stvarno slanje.

**Kako se vidi u runu.** Odluka gejta se upisuje u `e2e/test-results/outbound-email-gate.json`
(`{requested, channelBefore, channelClosed, restoredTo}`), a taj direktorij ide u `playwright-report` artifact.
Iznad toga, korak **„Report the outbound e-mail gate"** (`if: always()`) čita taj fajl i ispisuje ga kao
`::notice` check-run annotaciju — pa je iz samog runa (bez loga i bez artefakta) vidljivo je li kanal za PR
zatvoren i je li poslije vraćen; ako fajl ne postoji, annotacija to kaže eksplicitno umjesto da prećuti.

**Šta ovo ne tvrdi.** Mapiranje ne dokazuje da je odabrani spec dovoljan za svaku izmjenu — dokazuje da nepoznata
izmjena ne može ostati bez browsera. Zato je fallback širi od mapiranog skupa, a ne obrnuto.
