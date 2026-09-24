#!/usr/bin/env bash
# Skuplja brojke staging runa jednom komandom:
#   1) SLO tabela iz k6 summaryja (perf/import-results.mjs)
#   2) db_queries_per_request iz API loga — ISTA awk pravila kao CI kapija u
#      .github/workflows/perf-smoke.yml (ANSI strip prije pristupa poljima;
#      bootstrap /install*, /health, /auth/{login,logout,refresh} izuzet).
#
# Upotreba:
#   ops/collect-staging-numbers.sh perf/results/staging-2026-09-30.json api.log
#   ops/collect-staging-numbers.sh <k6.json> <api.log> [--label staging-2026-09-30]
#   ops/collect-staging-numbers.sh --self-test
#
# API log sa Coolify servera (Linux):  docker logs <api-kontejner> > api.log 2>&1
#
# Env: DB_QUERY_BUDGET (default 2.5 = CI kapija), DB_QUERY_TARGET (default 2.0 = cilj)
# Izlaz: 0 = sve u budžetu, 1 = SLO red ili kapija upita pada, 2 = ulaz ne valja.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUDGET="${DB_QUERY_BUDGET:-2.5}"
TARGET="${DB_QUERY_TARGET:-2.0}"

# Ispisuje KEY=VALUE linije; per-path prosjeke piše u $2 (ako je dat).
query_stats() {
  local log="$1" paths="${2:-/dev/null}"
  awk -v paths="$paths" '
    { gsub(/\033/, ""); gsub(/\[[0-9;]*m/, ""); gsub(/[^[:print:]]/, "") }
    /db_queries_per_request=/ {
      query = ""; path = "";
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^db_queries_per_request=/) { split($i, pair, "="); query = pair[2] + 0 }
        if ($i ~ /^path=/) { split($i, pair, "="); path = pair[2] }
      }
      if (path == "") path = "?";
      if (path ~ /^[/](install|health)/ || path ~ /^[/]auth[/](login|logout|refresh)/) {
        bootstrap_n += 1;
      } else {
        app_sum += query; app_n += 1;
        if (query > app_max) app_max = query;
        path_sum[path] += query; path_n[path] += 1;
      }
    }
    END {
      printf "APP_N=%d\nAPP_AVG=%.3f\nAPP_MAX=%d\nBOOTSTRAP_N=%d\n",
        app_n, (app_n ? app_sum / app_n : 0), app_max, bootstrap_n;
      for (p in path_sum)
        printf "%.3f %d %s\n", path_sum[p] / path_n[p], path_n[p], p > paths;
    }
  ' "$log"
}

self_test() {
  local tmp pass=0 fail=0
  tmp="$(mktemp -d)"
  check() { # opis, očekivano, dobiveno
    if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "  ok   $1";
    else fail=$((fail + 1)); echo "  FAIL $1 (očekivano '$2', dobiveno '$3')"; fi
  }
  E=$'\033'
  {
    echo "${E}[32m[Nest] 1  - ${E}[39mLOG db_queries_per_request=4 duration_ms=3.1 status=200 method=GET path=/tickets${E}[39m"
    echo "LOG db_queries_per_request=6 duration_ms=2.0 status=200 method=GET path=/tickets"
    echo "LOG db_queries_per_request=20 duration_ms=9.0 status=201 method=POST path=/install/seed"
    echo "LOG db_queries_per_request=9 duration_ms=1.0 status=200 method=GET path=/health"
    echo "LOG db_queries_per_request=7 duration_ms=1.0 status=200 method=POST path=/auth/login"
    echo "LOG db_queries_per_request=5 duration_ms=1.0 status=200 method=GET path=/auth/me"
    echo "neka druga linija bez metrike"
  } > "$tmp/api.log"
  query_stats "$tmp/api.log" "$tmp/paths.txt" > "$tmp/env"
  . "$tmp/env"
  check "aplikacijski zahtjevi (bootstrap izuzet)" 3 "$APP_N"
  check "prosjek aplikacije"                      "5.000" "$APP_AVG"
  check "maksimum aplikacije"                     6 "$APP_MAX"
  check "bootstrap broj (install/health/login)"   3 "$BOOTSTRAP_N"
  check "ANSI strip: /tickets je jedan path"      2 "$(awk '$3=="/tickets"{print $2}' "$tmp/paths.txt")"
  check "/auth/me NIJE bootstrap"                 1 "$(awk '$3=="/auth/me"{print $2}' "$tmp/paths.txt")"
  : > "$tmp/empty.log"; query_stats "$tmp/empty.log" > "$tmp/env2"; . "$tmp/env2"
  check "prazan log -> 0 zahtjeva"                0 "$APP_N"
  rm -rf "$tmp"
  echo "self-test: $pass/$((pass + fail))"
  [ "$fail" -eq 0 ]
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi

K6_JSON="${1:-}"; API_LOG="${2:-}"; shift 2 2>/dev/null || true
if [ -z "$K6_JSON" ] || [ -z "$API_LOG" ]; then
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 2
fi
for f in "$K6_JSON" "$API_LOG"; do
  [ -r "$f" ] || { echo "Ne mogu pročitati: $f" >&2; exit 2; }
done

status=0
echo "## SLO tabela (k6: $K6_JSON)"
echo
node "$ROOT/perf/import-results.mjs" "$K6_JSON" "$@"
rc=$?
[ $rc -eq 2 ] && exit 2
[ $rc -ne 0 ] && status=1

paths="$(mktemp)"
eval "$(query_stats "$API_LOG" "$paths")"
echo
echo "## db_queries_per_request (API log: $API_LOG)"
echo
echo "| Mjera | Vrijednost |"
echo "|---|---|"
echo "| avg (aplikacija) | **${APP_AVG}** preko ${APP_N} zahtjeva (kapija ${BUDGET}, cilj ${TARGET}) |"
echo "| max (aplikacija) | ${APP_MAX} |"
echo "| bootstrap (izuzeto) | ${BOOTSTRAP_N} |"
echo
echo "Top 5 ruta po prosjeku:"
sort -k1,1nr "$paths" | head -5 | sed 's/^/  /'
rm -f "$paths"

if [ "$APP_N" -eq 0 ]; then
  echo "UPOZORENJE: nema aplikacijskih linija s db_queries_per_request — je li log od API-ja?" >&2
  status=1
elif awk -v a="$APP_AVG" -v b="$BUDGET" 'BEGIN { exit !(a > b) }'; then
  echo "PAD: avg ${APP_AVG} > kapija ${BUDGET}"; status=1
elif awk -v a="$APP_AVG" -v t="$TARGET" 'BEGIN { exit !(a > t) }'; then
  echo "U kapiji, iznad cilja ${TARGET} (radna stavka, ne pad)."
else
  echo "U kapiji i u cilju."
fi
exit $status
