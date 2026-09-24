#!/usr/bin/env bash
# Briše E2E podatke sa stagingu (vidi ops/sql/cleanup-e2e-data.sql za tačan opseg).
# Pokreće se NA SERVERU (Coolify), SQL ide direktno u Postgres kontejner.
#
#   ops/cleanup-e2e-data.sh                 # proba: samo broji, ništa ne briše
#   ops/cleanup-e2e-data.sh --apply         # stvarno briše
#   ops/cleanup-e2e-data.sh --apply --seed  # + '[staging-seed]' tiketi (nakon k6 mjerenja)
#
# Env (opcionalno): PG_CONTAINER (default: prvi kontejner čije ime sadrži 'postgres'),
#                   PG_USER (default: POSTGRES_USER iz kontejnera), PG_DB (default: POSTGRES_DB).
set -euo pipefail

apply=0
seed=0
for arg in "$@"; do
  case "$arg" in
    --apply) apply=1 ;;
    --seed) seed=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "nepoznat argument: $arg" >&2; exit 2 ;;
  esac
done

here="$(cd "$(dirname "$0")" && pwd)"
sql="$here/sql/cleanup-e2e-data.sql"
[ -f "$sql" ] || { echo "nema $sql" >&2; exit 2; }

container="${PG_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -i postgres | head -n1 || true)}"
[ -n "$container" ] || { echo "Postgres kontejner nije pronađen; postavi PG_CONTAINER=<ime>" >&2; exit 2; }
user="${PG_USER:-$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || echo postgres)}"
db="${PG_DB:-$(docker exec "$container" printenv POSTGRES_DB 2>/dev/null || echo "$user")}"

echo "kontejner=$container baza=$db korisnik=$user apply=$apply seed=$seed"
docker exec -i "$container" psql -U "$user" -d "$db" \
  -v apply="$apply" -v include_seed="$seed" -f - < "$sql"
