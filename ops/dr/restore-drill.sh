#!/usr/bin/env bash
# Paket 1.8 (A6) — DR drill: vraća dump u ZASEBNU bazu i uploads u zaseban
# direktorij. Produkcijska/staging baza se nikad ne dira.
#
# Varijable:
#   PG_CONTAINER   Postgres kontejner (npr. hgpchekxb6dutalsyctu42al)   [obavezno]
#   PG_USER        korisnik (default admin)
#   DRILL_DB       ciljna baza (default ephelpdesk-drill) — mora sadržati "drill"
#   DUMP_FILE      Coolify backup (.dmp custom format ili .sql / .sql.gz)  [obavezno]
#   UPLOADS_ARCHIVE uploads-YYYY-MM-DD.tar.gz                            [obavezno]
#   DRILL_UPLOADS_VOLUME  volumen za drill stack (default ephd-drill-uploads)
# Ispisuje starost backupa (RPO) i trajanje; rezultat ide u zapisnik.
set -euo pipefail

: "${PG_CONTAINER:?}"; : "${DUMP_FILE:?}"; : "${UPLOADS_ARCHIVE:?}"
PG_USER="${PG_USER:-admin}"
DRILL_DB="${DRILL_DB:-ephelpdesk-drill}"
DRILL_UPLOADS_VOLUME="${DRILL_UPLOADS_VOLUME:-ephd-drill-uploads}"

case "$DRILL_DB" in *drill*) ;; *) echo "DRILL_DB mora sadržati 'drill' (zaštita od prepisivanja)"; exit 2;; esac
[ -f "$DUMP_FILE" ] && [ -f "$UPLOADS_ARCHIVE" ] || { echo "Dump ili arhiva ne postoje"; exit 2; }
if [ -f "${UPLOADS_ARCHIVE}.sha256" ]; then
  ( cd "$(dirname "$UPLOADS_ARCHIVE")" && sha256sum -c "$(basename "$UPLOADS_ARCHIVE").sha256" )
fi

started=$(date +%s)
dump_age_h=$(( ( started - $(stat -c %Y "$DUMP_FILE") ) / 3600 ))
echo "[drill] starost dumpa: ${dump_age_h} h (RPO cilj ≤ 24 h)"

psql_c() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_USER" "$@"; }

psql_c -d postgres -c "DROP DATABASE IF EXISTS \"${DRILL_DB}\" WITH (FORCE);"
psql_c -d postgres -c "CREATE DATABASE \"${DRILL_DB}\";"

case "$DUMP_FILE" in
  *.sql.gz) gunzip -c "$DUMP_FILE" | psql_c -q -d "$DRILL_DB" >/dev/null ;;
  *.sql)    psql_c -q -d "$DRILL_DB" < "$DUMP_FILE" >/dev/null ;;
  *)        docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$DRILL_DB" --no-owner --no-privileges < "$DUMP_FILE" ;;
esac
db_done=$(date +%s)

docker volume create "$DRILL_UPLOADS_VOLUME" >/dev/null
docker run --rm -v "${DRILL_UPLOADS_VOLUME}:/data" -v "$(cd "$(dirname "$UPLOADS_ARCHIVE")" && pwd):/backup:ro" \
  alpine:3.20 sh -c "find /data -mindepth 1 -delete && tar -C /data -xzf /backup/$(basename "$UPLOADS_ARCHIVE")"
up_done=$(date +%s)

tickets=$(psql_c -d "$DRILL_DB" -tAc 'SELECT count(*) FROM "Ticket";')
attachments=$(psql_c -d "$DRILL_DB" -tAc 'SELECT count(*) FROM "TicketAttachment";' 2>/dev/null || echo "?")
sample=$(psql_c -d "$DRILL_DB" -tAc 'SELECT "ticketId" || '"' '"' || id FROM "TicketAttachment" ORDER BY "createdAt" DESC LIMIT 1;' 2>/dev/null || true)
ou=$(psql_c -d "$DRILL_DB" -tAc 'SELECT id FROM "OrganizationalUnit" ORDER BY "createdAt" LIMIT 1;' 2>/dev/null || true)
last=$(psql_c -d "$DRILL_DB" -tAc 'SELECT max("createdAt") FROM "Ticket";')

cat <<REPORT
[drill] baza ${DRILL_DB}: $(( db_done - started )) s, tiketa ${tickets}, priloga ${attachments}, zadnji tiket ${last}
[drill] uploads → volumen ${DRILL_UPLOADS_VOLUME}: $(( up_done - db_done )) s
[drill] ukupno restore: $(( up_done - started )) s

Sljedeće: podignite privremeni Coolify stack (docs/ops/test-okruzenje-1.8.md §4)
s DATABASE_URL → ${DRILL_DB} i uploads volumenom ${DRILL_UPLOADS_VOLUME},
pa pokrenite:
  API_URL=https://<drill-api> ADMIN_EMAIL=... ADMIN_PASSWORD=... \\
  ATTACHMENT_TICKET_ID=${sample% *} ATTACHMENT_ID=${sample#* } AUDIT_OU_ID=${ou} \\
  node ops/dr/verify-restore.mjs
REPORT
