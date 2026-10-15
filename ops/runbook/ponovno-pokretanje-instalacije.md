# Runbook: ponovno pokretanje instalacije (ops-only)

> Odluka vlasnika 6 (`.cursor/plans/install-wizard-v2/00_overview.md` §9): završena instalacija se otvara
> **samo** kroz dva ops prekidača — `INSTALL_ALLOW_RERUN=true` u okruženju backenda i install token. Redovni
> administrator nema ni rutu ni dugme; u UI-u se za ovu akciju ništa ne mijenja.
>
> Implementacija: `POST /install/restart` (`install-rerun.controller.ts`, `install-rerun.service.ts`) i
> `npm run cli:install-rerun` (`src/cli/install-rerun.ts`). Oba dijele isti plan — `plan-install-rerun.ts`.

## Kada se smije koristiti

- dev/staging: demonstracija čarobnjaka, ponovno postavljanje koraka, F6 provjere (provisioning, checklista);
- produkcija: izuzetno, najavljeno, kad instalacija zaista treba da se ponovi uz sačuvane podatke.

**Upozorenje.** Čim je `private.install.completedAt` obrisan, sistem je u „setup“ modu: UI vodi svaku rutu na
`/install`, a API vraća `503 SETUP_REQUIRED` svuda osim `/install/*`, `GET /health`, `GET /health/ready` i
`GET /branding`. Nema prijave ni rada u aplikaciji dok wizard ponovo nije završen. Zato: nikad bez ispravnog
`INSTALL_TOKEN`-a i nikad bez najave korisnicima.

## Preduslovi (env backenda, pa restart)

| Varijabla | Vrijednost | Zašto |
|---|---|---|
| `INSTALL_TOKEN` | ≥16 znakova | Bez njega `/install` odbija svaki zahtjev (`403 INSTALL_TOKEN_NOT_CONFIGURED`) — a to je i put kojim se wizard zatvara, pa je token uslov za povratak, ne samo za otvaranje. |
| `INSTALL_ALLOW_RERUN` | `true` | Ops prekidač. Sve ostalo (prazno, `1`, `yes`, `FALSE`) znači „isključeno“ (`read-install-rerun-allowed.ts`). |

Env se čita pri pokretanju kontejnera: nakon izmjene u Coolify-u (Environment Variables → backend) slijedi
**restart/redeploy backenda**. Token se poslije instalacije obično ukloni (`docs/user-guide/instalacija.md`), pa
ga ovdje treba vratiti — i opet ukloniti kad je posao gotov.

## Korak 1 — proba bez upisa

```bash
BACKEND=$(docker ps --format '{{.Names}}' | grep '^backend-' | head -1)
docker exec -it "$BACKEND" node dist/src/cli/install-rerun.js --reason "Ponovno pokretanje instalacije" --dry-run
```

`--dry-run` ispiše ključeve koje bi obrisao („`private.install.completedAt -> ""`“) i ne piše ništa.
Ako ispiše `Nothing to clear: the wizard is already open.`, instalacija je već otvorena.

## Korak 2 — otvaranje wizarda

**CLI (preporučeno, ne treba mreža do API-ja):**

```bash
docker exec -it "$BACKEND" node dist/src/cli/install-rerun.js --reason "Ponovno pokretanje instalacije"
```

**API (uz token, npr. sa svoje mašine):**

```bash
curl -sS -X POST https://<api-host>/install/restart \
  -H "x-install-token: $INSTALL_TOKEN" -H 'content-type: application/json' -d '{}'
```

Odgovor oba puta ima isto značenje:

```json
{ "restarted": true, "alreadyOpen": false, "includeStepMarkers": false,
  "previousCompletedAt": "2026-10-15T08:12:03.114Z",
  "clearedKeys": ["private.install.completedAt", "private.install.completedByUserId"],
  "nextStep": "profile" }
```

- `--include-step-markers` (ili `{"includeStepMarkers": true}`) briše **i** markere čarobnjaka: paket,
  `blueprint`, `policyPack`, `slaReview` i sve `private.install.steps.<korak>.{saved,skipped}`. Koraci vođeni
  markerima se tada pitaju ponovo; koraci koji stanje čitaju iz stvarnih redova (SuperAdmin, identitet, način
  prijave, SMTP, seed, tim) ostaju „done“. Za **potpuno prazan** tok koristi praznu bazu — to radi F6 E2E
  projekat nad čistim stackom.
- Ponovni poziv je bezopasan: kad je wizard već otvoren, odgovor je `{ "restarted": false, "alreadyOpen": true,
  "clearedKeys": [] }` i ništa se ne upisuje.
- Upis ide kroz isti settings servis kao svaka druga izmjena postavke: validacija, promjena u change logu
  (`reason = install_wizard_rerun`, `entityId` = pojedinačni ključ) i invalidacija keša. Ostali procesi vide
  promjenu u roku od `SETTINGS_SNAPSHOT_TTL_MS` (zadano 5000 ms) — restart nije potreban.

## Korak 3 — kroz wizard

`/install` → token → korak koji je vratio `nextStep` (za stanje u svakom trenutku: `GET /install/status`) →
na kraju **Završi**, što kroz `POST /install/complete` ponovo upiše `private.install.completedAt` i zaključa
instalacijske rute.

## Korak 4 — pospremi okruženje

1. Ukloni `INSTALL_ALLOW_RERUN` (i `INSTALL_TOKEN` ako ga inače ne držiš) + restart backenda.
2. Provjeri change log: u zapisu `install_wizard_rerun` stoji tačno ono što je obrisano.

## Šta se **ne** dira

Tiketi, korisnici, servisi, SLA, dodaci, tajne i sve ostale postavke ostaju; briše se samo zaključavanje (i
markeri, ako je traženo). Rerun ne „vraća“ sistem na tvorničke vrijednosti.

## Ako nešto pukne

| Simptom | Uzrok i lijek |
|---|---|
| `403 INSTALL_RERUN_NOT_ALLOWED` | `INSTALL_ALLOW_RERUN` nije tačno `true` ili backend nije restartovan poslije izmjene env-a. |
| `403 INSTALL_TOKEN_NOT_CONFIGURED` | `INSTALL_TOKEN` nije postavljen (ili je kraći od 16 znakova). |
| `403 INSTALL_TOKEN_INVALID` | Pogrešan `x-install-token`; pazi na razmake (upoređuje se `sha256` + `timingSafeEqual`). |
| `alreadyOpen: true`, `clearedKeys: []` | Wizard je već otvoren; nema šta da se briše. |
| Poslije završetka i dalje `503 SETUP_REQUIRED` | `completedAt` nije upisan — provjeri change log i `GET /install/status`. |

## Ručni SQL (krajnja opcija)

Ako CLI i API nisu dostupni, isti efekat ima jedan `UPDATE` (kolona `value` je `jsonb`):

```sql
UPDATE "AppSetting" SET value = '""'::jsonb, "updatedAt" = now()
WHERE key IN ('private.install.completedAt', 'private.install.completedByUserId');
```

Ovo **preskače** change log i keš invalidaciju (vide se kroz TTL), pa ostaje krajnja opcija. Nikad se ne koristi
bez postavljenog `INSTALL_TOKEN`-a — bez njega wizard nema čime da se otključa.
