# Uputstvo — tri verifikacije koje radi korisnik

Za koga: operater koji radi na **Windowsu (Git Bash / MINGW64)** ili direktno na
**Linux serveru gdje je podignut Coolify** (preporučeno za A i C — nema tunela,
nema CRLF problema).

Pravilo prijave greške: pošalji **tačnu komandu i kompletan ispis** (copy/paste),
ne opis.

| # | Šta | Komanda | Treba |
|---|---|---|---|
| A | WS cross-instance dokaz | `node ops/ws-cross-instance-check.mjs` | Redis |
| B | E2E paket | `cd e2e && npm test` | `e2e/.env` s `DATABASE_URL` |
| C | k6 staging + brojke | `k6 run -e REPORT_LABEL=staging-<datum> perf/full.js` pa `ops/collect-staging-numbers.sh` | k6, API log |

Priprema (jednom): `git pull`, zatim `cd backend && npm ci` i `cd ../frontend && npm ci`
(skripta A učitava `ioredis`/`socket.io` iz tih paketa).

---

## A — WS cross-instance (Redis)

### A0. Najjeftiniji dokaz — bez tunela
Na Coolify serveru pročitaj log API-ja:

```bash
docker logs <api-kontejner> 2>&1 | grep -E 'ws_adapter_redis_(ok|acl_denied)'
```

- `ws_adapter_redis_ok=1` → adapter radi.
- `ws_adapter_redis_acl_denied channel=...` → ACL (vidi A4).

### A1. Varijanta 1 (preporuka) — pokreni na serveru, bez tunela
Na serveru, iz checkouta repoa, uzmi IP Redis kontejnera:

```bash
docker ps --format '{{.Names}} | {{.Ports}}' | grep -i redis
docker inspect redis-core --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'
REDIS_URL='redis://ephelpdesk:<lozinka>@<IP>:6379' node ops/ws-cross-instance-check.mjs --preflight
REDIS_URL='redis://ephelpdesk:<lozinka>@<IP>:6379' node ops/ws-cross-instance-check.mjs
```

### A2. Varijanta 2 — SSH tunel s Windowsa
**Poznata zamka:** `-L 6380:redis-core:6379` NE radi ako je `redis-core` Docker
mrežno ime — host ga ne razrješava. `netstat` tada pokazuje `LISTENING` (SSH
prihvata lokalno), ali svaka veza pukne → ioredis javlja
`ECONNRESET` + `MaxRetriesPerRequestError`.

Dijagnoza — pokreni tunel s `-v` i pogledaj prozor tunela pri pokušaju:

```bash
ssh -v -N -p 2222 -L 6380:redis-core:6379 administrator@sql.ba101.top
# traži: channel N: open failed: connect failed: <razlog>
```

Rješenje — cilj tunela mora biti nešto što **host** vidi:

```bash
# a) IP kontejnera (iz A1, docker inspect):
ssh -N -p 2222 -L 6380:<IP-kontejnera>:6379 administrator@sql.ba101.top
# b) ili objavljeni host port (docker port redis-core → npr. 127.0.0.1:6379):
ssh -N -p 2222 -L 6380:127.0.0.1:<host-port> administrator@sql.ba101.top
```

U drugom Git Bash prozoru:

```bash
REDIS_URL='redis://ephelpdesk:<lozinka>@127.0.0.1:6380' node ops/ws-cross-instance-check.mjs --preflight
REDIS_URL='redis://ephelpdesk:<lozinka>@127.0.0.1:6380' node ops/ws-cross-instance-check.mjs
```

Napomena: IP kontejnera se mijenja pri redeployu — tunel treba ponovo podesiti.

### A3. Izlazni kodovi
`0` dokazano · `1` adapter nije prenio · `2` Redis nedostupan / ACL · `3` greška harnessa.

### A4. `NOPERM` → ACL (aditivno)
`PSUBSCRIBE` traži **literalno** poklapanje patterna:

```
ACL SETUSER ephelpdesk '&socket.io#/#*'
ACL SAVE
```

Ne koristiti `resetchannels`, ne dirati `maxmemory-policy` (ostaje `volatile-lru`).
`WRONGPASS` = pogrešna lozinka/korisnik u `REDIS_URL`.

---

## B — E2E paket

```bash
cd e2e
cp .env.example .env      # pa upiši BASE_URL, naloge i DATABASE_URL
npm ci
npx playwright install chromium
npm test
```

`DATABASE_URL` mora biti dostupan s mašine gdje se test vrti (na Windowsu opet
tunel prema IP-u/portu Postgres kontejnera — ista zamka kao A2). Detalji u
`e2e/README.md`. Pri grešci pošalji ispis `npm test` i `playwright-report/`
(ili bar prvi neuspjeli test sa stack traceom).

---

## C — k6 staging run + brojke

1. Seed (jednom, na stagingu): `ops/sql/seed-large-dataset.sql` (vidi `ops/staging-checklist.md`).
2. Run:

```bash
k6 run -e BASE_URL=https://<staging> -e REPORT_LABEL=staging-2026-09-30 perf/full.js
```

   Rezultat: `perf/results/staging-2026-09-30.{json,md}`.
3. API log iz istog vremenskog prozora (na Coolify serveru):

```bash
docker logs --since 30m <api-kontejner> > api.log 2>&1
```

4. Brojke jednom komandom:

```bash
ops/collect-staging-numbers.sh perf/results/staging-2026-09-30.json api.log
```

   Ispisuje SLO tabelu (`perf/import-results.mjs`) i `db_queries_per_request`
   (ista pravila kao CI kapija: ANSI strip, bootstrap `/install*`, `/health`,
   `/auth/{login,logout,refresh}` izuzet). Izlaz `0` = sve u budžetu, `1` = nešto
   pada, `2` = ulaz ne valja. Kapija/cilj: `DB_QUERY_BUDGET` (8) / `DB_QUERY_TARGET` (5).
   Provjera same skripte: `ops/collect-staging-numbers.sh --self-test` → `7/7`.

5. Pošalji cijeli ispis iz koraka 4 — ide u `PERF_BUDGETS.md` §1.

### Windows napomene
- Ako `bash` javi `$'\r': command not found`, fajl je dobio CRLF: `rm ops/collect-staging-numbers.sh && git checkout -- ops/collect-staging-numbers.sh`
  (`.gitattributes` forsira LF za `*.sh` i `*.patch`).
- `api.log` preuzet s Windowsa je u redu — skripta čisti ANSI i `\r`.
