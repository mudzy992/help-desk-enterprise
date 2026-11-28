# Runbook: `AuditLog` upis pada — oštećen B-tree indeks (PostgreSQL `XX002`)

Stanje od 2026-11-28 (prijava vlasnika): SuperAdmin nije mogao kreirati organizacionu
jedinicu iz „Imenika korisnika" (`500`, `AUDIT_SCOPE_REQUIRED` — to je **drugi**, nezavisan
bug, popravljen u `W2.35b`), a otvaranje permisija je vraćalo `503`
`AUTHORIZATION_AUDIT_UNAVAILABLE` uz:

```
Invalid `prisma.auditLog.create()` invocation:
Database error. Code: `XX002`. Message: `table tid from new tuple (38586,9) cannot find
insert offset between offsets 11 and 19 of block 427 in relation ...`
```

`XX002` (`index_corrupted`) nije greška aplikacije: **B-tree indeks na `AuditLog` je
fizički oštećen**, pa svaki `INSERT` u tu tabelu padne. Aplikacija se tada ponaša tačno
kako je projektovana — **fail-closed**: bez audit reda nema ni akcije.

## Zašto se to vidi kao pad cijele administracije

`authorize-http-execution.ts` upisuje **superadmin bypass** u audit za svaki zahtjev koji
je prošao po `SUPER_ADMIN` grani (per-request memoizacija, jedan red po zahtjevu). Kad
`AuditLog` ne prima upise, svaki takav zahtjev — uključujući `GET /roles/permissions/catalog`
— vraća `503 AUTHORIZATION_AUDIT_UNAVAILABLE`. To **nije** posljedica permisija niti
scopea; to je posljedica oštećenog indeksa.

## 1. Potvrdi da je indeks, a ne nešto drugo

```bash
# 1) Greška u logu: traži XX002 / index_corrupted / "cannot find insert offset"
docker logs --since 30m "$BACKEND" 2>&1 | grep -E 'XX002|cannot find insert offset|AUTHORIZATION_AUDIT_UNAVAILABLE' | tail -20

# 2) Indeksi i veličine (najveći je obično pkey)
psql "$DATABASE_URL" -c "
  SELECT indexrelid::regclass AS index, pg_size_pretty(pg_relation_size(indexrelid)) AS size
  FROM pg_index WHERE indrelid = '\"AuditLog\"'::regclass ORDER BY 2 DESC;"

# 3) amcheck na onom indeksu koji je u grešci (PostgreSQL 14+; traži CREATE EXTENSION amcheck)
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS amcheck;"
psql "$DATABASE_URL" -c "SELECT bt_index_check('\"AuditLog_pkey\"', true);"
```

`bt_index_check` baca grešku na prvi oštećeni list; `bt_index_parent_check(..., true)` je
temeljniji (i skuplji). Ako greška iz `amcheck`-a **ne** postoji, a upisi i dalje padaju,
problem je na heap-u tabele ili na stranici `pg_class`/`pg_attribute` — tada idi na
korak 4 sa `REINDEX TABLE` i otvori incident prema hostingu (vidi §5).

## 2. Popravi

Indeks se popravlja **bez zastoja** (PostgreSQL 12+); `CONCURRENTLY` ne može u transakciju
i traži slobodan disk ≈ veličina indeksa + WAL.

```bash
psql "$DATABASE_URL" -c 'REINDEX INDEX CONCURRENTLY "AuditLog_pkey";'
# po potrebi, istim redom, za svaki indeks koji amcheck prijavi:
#   "AuditLog_entityType_entityId_idx", "AuditLog_actorUserId_idx",
#   "AuditLog_organizationalUnitId_idx", "AuditLog_createdAt_idx",
#   "AuditLog_chainPartition_createdAt_id_idx"
psql "$DATABASE_URL" -c 'VACUUM (ANALYZE) "AuditLog";'
```

Ako `REINDEX ... CONCURRENTLY` padne sa `could not create unique index`: indeks je
oštećen **i** u njemu postoje duplikati (to se na `pkey`-u ne bi smjelo desiti) — ne
briši redove. Sačuvaj `pg_dump --data-only --table '"AuditLog"'` i otvori incident;
lanac (`previousHash`/`hash`) je dokaz, ne smije se „počistiti".

## 3. Dokaži da je popravljeno

```bash
psql "$DATABASE_URL" -c "SELECT bt_index_check('\"AuditLog_pkey\"', true);"   # bez greške
```

Zatim u aplikaciji, istim redom (sve tri stvari su nekada padale na istom upisu):

1. `GET /roles/permissions/catalog` kao SuperAdmin → `200` (prije: `503`).
2. Kreiranje OU iz „Imenika korisnika" → `201` (prije: `500`, ali **drugi** uzrok; vidi `W2.35b`).
3. Provjera lanca: `node dist/src/cli/verify-audit-chain.js` (ili odgovarajući `cli:*` skript)
   → `ok`, bez `gap`.

Tek poslije ovoga ima smisla ponoviti noćni E2E: `58-inbound-mailbox-to-ticket` pada kao
„nema `InboundEmail` reda" i to je isti obrazac kao ovaj — upis u transakciji padne i sve
se rollbackuje.

## 4. Šta **ne** raditi

- **Ne** isključivati audit guard i **ne** „popravljati" kod: fail-closed je namjeran.
- **Ne** `VACUUM FULL` (drži `ACCESS EXCLUSIVE` lock, ne popravlja indeks) i ne `DROP INDEX`
  pa ponovni `CREATE` bez `CONCURRENTLY` na produkcionoj tabeli.
- **Ne** vraćati bazu iz backupa: izgubili biste audit redove koje lanac i dalje očekuje;
  hash lanac tada prijavljuje pukotinu koju ne možete razlikovati od napada.
- **Ne** brisati „sumnjive" redove iz `AuditLog`-a.

## 5. Zašto se indeks ošteti (i kako to spriječiti)

B-tree korupcija na jednom indeksu gotovo uvijek dolazi **ispod** PostgreSQL-a:

| Uzrok | Kako se prepoznaje | Šta uraditi |
|---|---|---|
| Nestanak struje / hard reset sa `fsync=off` ili `full_page_writes=off` | `SHOW fsync;` / `SHOW full_page_writes;` — oba moraju biti `on` | uključiti oba, restart, pa `REINDEX` |
| Loša RAM/disk memorija (bit flip) | ponavlja se na različitim indeksima/tabelama | `dmesg -T \| grep -iE 'mce\|edac\|ext4-fs error'`, `smartctl -a`, zamjena |
| `data_checksums = off` | `SHOW data_checksums;` → `off` | uključiti na klasteru (traži `pg_checksums` uz restart) |
| Prekid upisa na storage sloju (network FS, pretrpan disk) | `dmesg`, metrike diska, `df -h` | popraviti storage |

**Nadzor koji ovo hvata prije korisnika:** sedmični `amcheck` nad `AuditLog` indeksima
(`bt_index_check`) izvan radnog vremena. `http-5xx` alarm (`ALERTS.md`) hvata samo
posljedicu, i to tek kad SuperAdmin nešto pokuša; `AUTHORIZATION_AUDIT_UNAVAILABLE` u logu
je rani signal i treba ga alarmirati po `route`.

**Napomena o obimu.** `AuditLog` raste sa svakim superadmin zahtjevom, a `appendAuditLog`
uzima `pg_advisory_xact_lock` na particiji lanca (`global` za sve što nije OU-scope).
Velika tabela + globalna brava su poznato usko grlo; retention postoji (`private.privacy.*`),
ali particionisanje samog `AuditLog`-a nije urađeno. Ako `REINDEX` traje dugo, to je
argument za taj posao, ne za preskakanje popravke.
