#!/usr/bin/env bash
#
# Pulse UI — primjena patch fajlova (idempotentno).
#
# Zašto postoji: `git apply` je ATOMIČAN. Ako mu daš više patcheva odjednom
# (`git apply a.patch b.patch c.patch`) i samo jedan ne prođe — ne primijeni se
# NI JEDAN. Zato onaj ko je već primijenio 01 i 02, a onda ponovi sve tri,
# dobije 90 linija grešaka i patch 03 ostane neprimijenjen, iako je 03 jedini
# koji je trebalo primijeniti.
#
# Ova skripta:
#   1. provjeri CRLF zamku (patch fajl mora biti LF, inače `git apply` pada na Windowsu)
#   2. za svaki patch prepozna je li već primijenjen i preskoči ga
#   3. primijeni samo ono što treba, jedan po jedan patch
#
# Upotreba:
#   bash demo/patches/apply-pulse.sh              # primijeni sve što fali
#   bash demo/patches/apply-pulse.sh --dry-run    # samo reci šta bi se desilo
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
  "pulse-01-theme-tokens-and-infrastructure.patch:frontend/src/lib/theme/theme-storage.ts"
  "pulse-02-ui-primitives.patch:frontend/src/components/ui/segmented.tsx"
  "pulse-03-shell-palette-login-wizard.patch:frontend/src/components/layout/command-palette.tsx"
  "pulse-04-charts.patch:frontend/src/components/charts/dual-area-chart.tsx"
  "pulse-05-tickets.patch:frontend/src/components/ui/checkbox.tsx"
  "pulse-06-dashboard-reports.patch:frontend/src/components/dashboard/dashboard-charts.tsx:fade-in"
  "pulse-07-services-knowledge-base.patch:frontend/src/components/services/service-catalog-card.tsx:tnum text-[10px]"
  "pulse-08-sla-routing-policy-packs.patch:frontend/src/components/sla/sla-profile-detail.tsx:fade-in space-y-4"
  "pulse-09-admin-users-groups-ou-rbac-settings.patch:frontend/src/components/users/users-table.tsx:fade-in overflow-x-auto"
  "pulse-10-config-versions-queue-maintenance-feedback-auth-visual-qa.patch:frontend/src/components/config-versions/config-version-diff-panel.tsx:fade-in grid gap-1.5 font-mono"
  "pulse-11-pages-radius-system.patch:frontend/src/pages/login-page.tsx:page-in grid min-h-screen"
  "pulse-12-appearance-page.patch:frontend/src/pages/appearance-page.tsx"
  "pulse-13-accent-palettes.patch:frontend/src/index.css:data-accent=\"teal\""
  "pulse-14-docs-and-rules.patch:.cursor/docs/theme.md:## Brend palete"
  "pulse-15-verification-a11y-and-guard.patch:scripts/check-pulse-design-system.mjs"
  "pulse-16-accent-palettes-cyan-amber-orange.patch:frontend/src/index.css:data-accent=\"cyan\""
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
    echo "  (trajno rješenje: .gitattributes sa '*.patch text eol=lf', vidi PULSE_UI_HANDOFF.md §8)"
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
  echo "provjeri da si na bazi 5831dfd i da nemaš lokalnih izmjena:"
  echo "  git log --oneline -1        # očekivano: 5831dfd"
  echo "  git status --porcelain      # očekivano: prazno (osim patcheva koje već imaš)"
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  exit 0
fi

if [ "$applied" -gt 0 ]; then
  echo
  echo "Sljedeće:"
  echo "  cd frontend && npm install"
  echo "  npx tsc -b                 # očekivano: 0 grešaka"
  echo "  npx vitest run             # očekivano: 89 fajlova / 308 testova"
  echo "  npx vite build             # očekivano: uspješno"
  echo
  echo "Guard-ovi (iz korijena repoa, bez instalacije):"
  echo "  node scripts/check-pulse-design-system.mjs   # očekivano: OK"
  echo "  node scripts/check-ticket-id-leaks.mjs       # očekivano: OK"
fi
