#!/usr/bin/env bash
# Paket 1.8 — upisuje sve postavke za testni AD odjednom (umjesto ručno u UI).
# Pokreće se na serveru iz ops/dev/samba-ad/:
#
#   ./apply-settings.sh                    # auto-detekcija backend kontejnera
#   ./apply-settings.sh --dry-run          # samo validacija, ništa se ne upisuje
#   BACKEND_CONTAINER=<ime> ./apply-settings.sh
#   ROLE_SOURCE=ad_groups OU_STRATEGY=by_company_department STRATEGY=scheduled ./apply-settings.sh
#
# Lozinka za bind se čita iz .env (SVC_BIND_PASSWORD) i ne ispisuje se.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "Nema .env (cp .env.example .env)"; exit 1; }
SVC_BIND_PASSWORD="$(grep -E '^SVC_BIND_PASSWORD=' .env | head -1 | cut -d= -f2-)"
REALM="$(grep -E '^SAMBA_REALM=' .env | head -1 | cut -d= -f2-)"
REALM="${REALM:-TEST.EPBIH.LAB}"
[ -n "$SVC_BIND_PASSWORD" ] || { echo "SVC_BIND_PASSWORD nije postavljen u .env"; exit 1; }

# DC=test,DC=epbih,DC=lab iz realma
BASE_DN="$(echo "$REALM" | tr 'A-Z' 'a-z' | sed 's/^/DC=/; s/\./,DC=/g')"
HOST="dc1.$(echo "$REALM" | tr 'A-Z' 'a-z')"

ROLE_SOURCE="${ROLE_SOURCE:-local_db}"
OU_STRATEGY="${OU_STRATEGY:-by_dn_ou_path}"
STRATEGY="${STRATEGY:-manual_only}"
SCHEDULE_CRON="${SCHEDULE_CRON:-*/20 * * * *}"
COOLDOWN="${COOLDOWN:-0}"

if [ -z "${BACKEND_CONTAINER:-}" ]; then
  BACKEND_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^backend-' | head -1 || true)"
fi
[ -n "$BACKEND_CONTAINER" ] || {
  echo "Backend kontejner nije pronađen. Pogledaj 'docker ps' i pokreni: BACKEND_CONTAINER=<ime> $0"
  exit 1
}
echo "Backend kontejner: $BACKEND_CONTAINER"

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

cat <<JSON | docker exec -i "$BACKEND_CONTAINER" node dist/src/cli/apply-settings.js \
  --reason "Paket 1.8 — testni AD (apply-settings.sh)" "$@"
{
  "private.auth.adLdapsUrlsCsv": "ldaps://$HOST:636",
  "private.auth.adBindDn": "CN=svc-helpdesk,OU=Servisni,OU=HelpDesk,$BASE_DN",
  "private.auth.adBindPassword": "$(json_escape "$SVC_BIND_PASSWORD")",
  "private.auth.adRead.enabled": true,
  "private.auth.adRead.source": "ldaps",
  "private.auth.adRead.usersBaseDn": "OU=Korisnici,$BASE_DN",
  "private.auth.adRead.groupsBaseDn": "OU=Grupe,OU=HelpDesk,$BASE_DN",
  "private.auth.ouMappingStrategy": "$OU_STRATEGY",
  "private.auth.roleSource": "$ROLE_SOURCE",
  "private.auth.adRoleGroupDnAdmin": "CN=HD-Administratori,OU=Grupe,OU=HelpDesk,$BASE_DN",
  "private.auth.adRoleGroupDnAgent": "CN=HD-Agenti,OU=Grupe,OU=HelpDesk,$BASE_DN",
  "private.auth.adRead.maxDeactivationPercent": 10,
  "private.auth.adRead.syncCooldownMinutes": $COOLDOWN,
  "private.auth.adRead.strategy": "$STRATEGY",
  "private.auth.adRead.scheduleCron": "$SCHEDULE_CRON"
}
JSON
