#!/usr/bin/env bash
#
# PERFORMANSE — primjena patch fajlova (idempotentno).
#
# Zašto postoji: `git apply` je ATOMIČAN. Ako mu daš više patcheva odjednom
# (`git apply a.patch b.patch c.patch`) i samo jedan ne prođe — ne primijeni se
# NI JEDAN. Faze se primjenjuju redom 00 → 01 → 02 → 03 → 04.
#
# Ova skripta:
#   1. provjeri CRLF zamku (patch fajl mora biti LF, inače `git apply` pada na Windowsu)
#   2. za svaki patch prepozna je li već primijenjen i preskoči ga
#   3. primijeni samo ono što treba, jedan po jedan patch
#
# Upotreba:
#   bash perf/patches/apply-perf.sh              # primijeni sve što fali
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
  echo "  npx jest                   # očekivano: 363 suita / 1366 testova"
  echo "  npm run build              # očekivano: uspješno"
  echo "  cd ../frontend && npm install && npm test   # očekivano: 95 fajlova / 333 testa"
  echo
  echo "Perf paket (bez k6, radi svuda):"
  echo "  node perf/validate.js      # očekivano: all checks passed"
  echo
  echo "Faza 4 (worker): pokreni i worker proces — poslovi su samo tamo:"
  echo "  node dist/src/worker.js    # očekivano: 5 rasporeda + job=... linije u logu"
fi
