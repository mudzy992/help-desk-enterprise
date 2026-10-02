#!/usr/bin/env bash
# Paket 1.8 (A6) — config snapshot za DR (ops/DR.md §3, automatizovano).
# Pravi config verziju "DR backup YYYY-MM-DD" i snima snapshot JSON off-box.
#
# Varijable:
#   API_URL        npr. https://api.desk.ba101.top            [obavezno]
#   ADMIN_EMAIL    lokalni ADMIN/SUPER_ADMIN nalog              [obavezno]
#   ADMIN_PASSWORD lozinka (env; nikad kao argument)
#   ADMIN_PASSWORD_FILE  alternativa za cron: fajl s lozinkom (npr. /etc/servicedesk/admin-password, 600)
#   OUT_DIR        odredište (default /var/backups/servicedesk)
# Tajne postavke se NE snimaju (collectConfigSnapshot ih izostavlja).
set -euo pipefail
command -v jq >/dev/null || { echo "Potreban je jq"; exit 2; }
: "${API_URL:?}"; : "${ADMIN_EMAIL:?}"
if [ -z "${ADMIN_PASSWORD:-}" ] && [ -n "${ADMIN_PASSWORD_FILE:-}" ]; then
  [ -f "$ADMIN_PASSWORD_FILE" ] || { echo "Nema fajla ${ADMIN_PASSWORD_FILE}"; exit 2; }
  ADMIN_PASSWORD="$(tr -d '\r\n' < "$ADMIN_PASSWORD_FILE")"
fi
: "${ADMIN_PASSWORD:?Postavite ADMIN_PASSWORD ili ADMIN_PASSWORD_FILE}"
OUT_DIR="${OUT_DIR:-/var/backups/servicedesk}"
STAMP="$(date -u +%F)"
mkdir -p "$OUT_DIR"

token=$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{email:$e,password:$p}' \
  | curl -fsS -H 'Content-Type: application/json' --data @- "${API_URL}/auth/login" \
  | jq -r '.accessToken // empty')
[ -n "$token" ] || { echo "Prijava nije uspjela (ili nalog traži promjenu lozinke)"; exit 1; }
auth=(-H "Authorization: Bearer ${token}")

id=$(jq -n --arg n "DR backup ${STAMP}" '{releaseNotes:$n}' \
  | curl -fsS "${auth[@]}" -H 'Content-Type: application/json' --data @- "${API_URL}/config-versions" \
  | jq -r '.id')
curl -fsS "${auth[@]}" "${API_URL}/config-versions/${id}" | jq '.snapshot' > "${OUT_DIR}/config-${STAMP}.json"
( cd "$OUT_DIR" && sha256sum "config-${STAMP}.json" > "config-${STAMP}.json.sha256" )
curl -fsS -X POST "${auth[@]}" "${API_URL}/auth/logout" >/dev/null || true

echo "[export-config] verzija ${id} → ${OUT_DIR}/config-${STAMP}.json"
