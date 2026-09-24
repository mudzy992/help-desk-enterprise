#!/usr/bin/env bash
#
# PERFORMANSE — primjena patch fajlova (idempotentno).
#
# BAZA (obavezno): `5831dfd` + Pulse UI patchevi (`demo/patches/pulse-01…15`).
# Perf patchevi su pravljeni nad radnim stablom koje je već imalo Pulse
# migraciju; na golom `5831dfd` prolazi samo perf-00 (dokazano pokretanjem
# cijelog lanca). Ako Pulse nije primijenjen, prvo:
#   bash demo/patches/apply-pulse.sh
#
# Zašto postoji: `git apply` je ATOMIČAN. Ako mu daš više patcheva odjednom
# (`git apply a.patch b.patch c.patch`) i samo jedan ne prođe — ne primijeni se
# NI JEDAN. Faze se primjenjuju redom 00 → 01 → 02 → 03 → 04 → 05.
#
# Ova skripta:
#   1. provjeri CRLF zamku (patch fajl mora biti LF, inače `git apply` pada na Windowsu)
#   2. za svaki patch prepozna je li već primijenjen i preskoči ga
#   3. primijeni samo ono što treba, jedan po jedan patch
#
# Upotreba:
#   bash perf/patches/apply-perf.sh              # primijeni sve što fali
#
# `ops-01` je ops/dokumentacija: dopunjava Redis ACL kanalima koje traže F3.1
# (Socket.IO adapter) i F4 (worker→API most), uključujući **literalni** pattern
# `&socket.io#/#*` — `PSUBSCRIBE` se ne poklapa po globu, nego doslovno.
# `perf-06` je kod: ACL odbijen kanal više ne obara API (unhandled rejection iz
# adaptera), nego daje `fallback=in_memory reason=acl_denied`.
# `ops-02` je CI: Prisma `DATABASE_URL` u backend jobu + design-check koji ne puca
# na pomjerene dokumente (uzrok crvenog CI-ja na masteru).
# `perf-07` je kod: settingsi se čitaju jednom po zahtjevu (snapshot u ALS-u) —
# 45 `*-configuration.loader.ts` fajlova je tražilo svoj `appSetting` red po ključu.
# `perf-08` je mjerni lanac: smoke seeda 120 tiketa kroz API (detalj, poruke i
# dashboard su do tada mjerili 0,00 jer u CI-ju nije bilo nijednog tiketa), poziva
# dashboard summary, šalje `{ type, body }` na poruke (DTO je tačno ta dva polja) i
# drži kapiju/cilj na izmjerenom (8/5). Izvještaj mjerenja
# (`perf/results/ci-smoke-*.md`) nije u patchu — to je artefakt runa, ne kod.
# `perf-09` je kod: pet kataloga za display labele (korisnik, grupa, form version,
# jedinica, servis) se pamti 60 s u Redisu — 9,6 → 5,0 upita po zahtjevu.
#   bash perf/patches/apply-perf.sh --dry-run    # samo reci šta bi se desilo
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$REPO_ROOT" ]; then
  echo "GREŠKA: nisam u git repou ($SCRIPT_DIR)." >&2
  exit 1
fi

cd "$REPO_ROOT" || exit 1

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ] || [ "${1:-}" = "-n" ]; then
  DRY_RUN=1
fi

# patch → sentinel koji postoji SAMO ako je taj patch primijenjen
#   "ime.patch:putanja"          → dovoljno je da fajl postoji
#   "ime.patch:putanja:marker"   → fajl mora da sadrži marker (za patcheve bez novih fajlova)
PATCHES=(
  "perf-00-measurement-and-baseline.patch:backend/src/common/database/db-query-counter.ts"
  "perf-01-stop-krvarenje.patch:backend/src/modules/search/search.controller.ts"
  "perf-02-baza-event-loop.patch:backend/src/common/principal-context/principal-context.cache.ts"
  "perf-03-realtime-klijent.patch:frontend/src/lib/query/query-client.ts"
  "perf-04-otpornost.patch:backend/src/modules/tickets/archive/ticket-archive.job.constants.ts"
  "perf-05-dnevna-granica-tz.patch:backend/src/modules/reports/summary/start-of-civil-day.ts"
  "ops-01-redis-acl-kanali.patch:ops/redis-acl.line:&socket.io#/#*"
  "perf-06-redis-acl-fail-graceful.patch:backend/src/modules/websocket/ws-redis-adapter.ts:realtimeAdapterChannelPattern"
  "ops-02-zeleni-ci.patch:scripts/check-pulse-design-system.mjs:existsPath("
  "perf-07-settings-snapshot.patch:backend/src/modules/settings/settings-snapshot.ts"
  "perf-08-mjerni-lanac.patch:.github/workflows/perf-smoke.yml:Seed load-test tickets"
  "perf-09-kes-labela.patch:backend/src/modules/tickets/labels/ticket-label-cache.ts"
)

applied=0
skipped=0
failed=0

echo "Repozitorij: $REPO_ROOT"
[ "$DRY_RUN" = "1" ] && echo "Režim: probni (--dry-run) — ništa se ne mijenja"
echo

for entry in "${PATCHES[@]}"; do
  name="${entry%%:*}"
  sentinel="${entry#*:}"
  patch="$SCRIPT_DIR/$name"

  if [ ! -f "$patch" ]; then
    echo "✗ NEMA patcha: $name"
    failed=$((failed + 1))
    continue
  fi

  # ── 1. CRLF zamka ────────────────────────────────────────────────────────
  work_patch="$patch"
  if grep -q $'\r' "$patch" 2>/dev/null; then
    tmp_patch="$(mktemp)"
    sed 's/\r$//' "$patch" > "$tmp_patch"
    work_patch="$tmp_patch"
    echo "⚠ $name ima Windows CRLF — koristim LF kopiju (patch na disku ne diram)"
  fi

  # ── 2. je li već primijenjen? ────────────────────────────────────────────
  case "$sentinel" in
    *:*)
      sentinel_file="${sentinel%%:*}"
      sentinel_marker="${sentinel#*:}"
      already=0
      if [ -f "$sentinel_file" ] && grep -qF -- "$sentinel_marker" "$sentinel_file"; then
        already=1
      fi
      ;;
    *)
      sentinel_file="$sentinel"
      already=0
      if [ -e "$sentinel_file" ]; then
        already=1
      fi
      ;;
  esac
  if [ "$already" = "1" ]; then
    echo "→ već primijenjen, preskačem: $name"
    skipped=$((skipped + 1))
    [ "$work_patch" != "$patch" ] && rm -f "$work_patch"
    continue
  fi

  # ── 3. primjena ──────────────────────────────────────────────────────────
  if [ "$DRY_RUN" = "1" ]; then
    if git apply --check "$work_patch" 2>/dev/null; then
      echo "✔ bi se primijenio: $name"
      applied=$((applied + 1))
    else
      echo "✗ NE MOŽE se primijeniti: $name"
      echo "  Očekivano je stanje: '$(echo "$sentinel_file" | sed 's|.*/||')' ne postoji."
      git apply --check "$work_patch" 2>&1 | head -5 | sed 's/^/  /'
      failed=$((failed + 1))
    fi
  else
    if out="$(git apply "$work_patch" 2>&1)"; then
      echo "✔ primijenjen: $name"
      applied=$((applied + 1))
    else
      echo "✗ PAD: $name"
      echo "$out" | head -15 | sed 's/^/  /'
      failed=$((failed + 1))
    fi
  fi

  [ "$work_patch" != "$patch" ] && rm -f "$work_patch"
done

echo
echo "──────────────────────────────────────────────"
echo "primijenjeno: $applied   preskočeno: $skipped   grešaka: $failed"
echo "──────────────────────────────────────────────"

if [ "$failed" -gt 0 ]; then
  echo
  echo "Ako patch pada na 'patch does not apply' za mnogo fajlova odjednom,"
  echo "provjeri da si na bazi 5831dfd (+ Pulse patchevi ako ih koristiš) i da nemaš lokalnih izmjena:"
  echo "  git log --oneline -1        # očekivano: 5831dfd ili noviji (tvoja grana)"
  echo "  git status --porcelain      # očekivano: čisto osim tvojih izmjena"
  echo "  ls frontend/src/components/layout/command-palette.tsx   # postoji = Pulse je primijenjen"
  echo "  # Ako pada na 'No such file or directory' za pulse fajlove:"
  echo "  bash demo/patches/apply-pulse.sh   # pa ponovi ovu skriptu"
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  exit 0
fi

if [ "$applied" -gt 0 ]; then
  echo
  echo "Sljedeće:"
  echo "  cd backend && npm install"
  echo "  npx prisma generate        # ako je blokiran download: PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate"
  echo "  # Faza 3 traži dvije nove zavisnosti (patch ne nosi lock fajlove):"
  echo "  #   backend: npm install @socket.io/redis-adapter@^8.3.0"
  echo "  #   frontend: npm install @tanstack/react-virtual@^3.14.13"
  echo "  npx prisma migrate deploy  # F1: 6 kompozitnih + 3 trigram indeksa; F2: authzVersion + SLA nextDueAt (CONCURRENTLY)"
  echo "  npx jest                   # očekivano: 365 suita / 1388 testova (u BILO kojoj TZ)"
  echo "  npm run build              # očekivano: uspješno"
  echo "  cd ../frontend && npm install && npm test   # očekivano: 95 fajlova / 334 testa"
  echo
  echo "Perf paket (bez k6, radi svuda):"
  echo "  node perf/validate.js      # očekivano: all checks passed"
  echo
  echo "Faza 4 (worker): pokreni i worker proces — poslovi su samo tamo:"
  echo "  node dist/src/worker.js    # očekivano: 5 rasporeda + job=... linije u logu"
fi
