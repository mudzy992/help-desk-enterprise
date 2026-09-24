#!/usr/bin/env bash
# Briše E2E podatke sa stagingu (vidi ops/sql/cleanup-e2e-data.sql za tačan opseg).
# Pokreće se NA SERVERU (Coolify), SQL ide kroz psql u Postgres kontejneru.
#
#   ops/cleanup-e2e-data.sh --db ephelpdesk-dev --user admin -W          # proba (samo broji)
#   ops/cleanup-e2e-data.sh --db ephelpdesk-dev --user admin -W --apply  # stvarno briše
#   ops/cleanup-e2e-data.sh --url 'postgresql://admin:LOZINKA@127.0.0.1:5432/ephelpdesk-dev'
#   ops/cleanup-e2e-data.sh ... --apply --seed   # + '[staging-seed]' tiketi (nakon k6)
#
# Opcije:  --db IME   --user KORISNIK   -W|--password (traži lozinku, ne ispisuje je)
#          --url URL  (ili env DATABASE_URL; host iz perspektive kontejnera, npr. 127.0.0.1)
#          --container IME (ili env PG_CONTAINER; default: prvi kontejner s 'postgres' u imenu)
set -euo pipefail

apply=0
seed=0
ask_password=0
db="${PG_DB:-}"
user="${PG_USER:-}"
url="${DATABASE_URL:-}"
container="${PG_CONTAINER:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1 ;;
    --seed) seed=1 ;;
    -W|--password) ask_password=1 ;;
    --db) db="${2:?--db traži ime}"; shift ;;
    --user) user="${2:?--user traži ime}"; shift ;;
    --url) url="${2:?--url traži URL}"; shift ;;
    --container) container="${2:?--container traži ime}"; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "nepoznat argument: $1" >&2; exit 2 ;;
  esac
  shift
done

here="$(cd "$(dirname "$0")" && pwd)"
sql="$here/sql/cleanup-e2e-data.sql"
[ -f "$sql" ] || { echo "nema $sql" >&2; exit 2; }

if [ -z "$container" ]; then
  container="$(docker ps --format '{{.Names}}' | grep -i postgres | head -n1 || true)"
fi
[ -n "$container" ] || { echo "Postgres kontejner nije pronađen; --container <ime>" >&2; exit 2; }

password=""
if [ "$ask_password" = 1 ]; then
  read -r -s -p "Lozinka za bazu: " password
  echo
fi

if [ -n "$url" ]; then
  target=("$url")
  echo "kontejner=$container url=$(printf '%s' "$url" | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#') apply=$apply seed=$seed"
else
  [ -n "$user" ] || user="$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || echo postgres)"
  if [ -z "$db" ]; then
    echo "Navedi bazu: --db <ime> (npr. --db ephelpdesk-dev) ili --url" >&2
    exit 2
  fi
  target=(-U "$user" -d "$db")
  echo "kontejner=$container baza=$db korisnik=$user apply=$apply seed=$seed"
fi

docker exec -i -e PGPASSWORD="$password" "$container" \
  psql "${target[@]}" -v apply="$apply" -v include_seed="$seed" -f - < "$sql"
