#!/usr/bin/env bash
# Dnevna arhiva centralnog direktorija aplikacijskih fajlova + SHA-256 + retention.
# Cron na Coolify hostu (primjer, 02:15 UTC):
#   15 2 * * * /opt/servicedesk/ops/dr/backup-uploads.sh >> /var/log/servicedesk-files-backup.log 2>&1
#
# Varijable:
#   APP_FILES_ROOT  izvor (default /mnt/shared-app-files/service-desk)
#   BACKUP_DIR      odredište (default /var/backups/servicedesk)
#   RETENTION_DAYS  koliko dana se čuvaju lokalne arhive (default 14)
# Off-box kopiju (rclone/S3/NAS) radite nakon ove skripte; lokalno brisanje
# starijih arhiva je sigurno tek kad je off-box kopija potvrđena.
set -euo pipefail

APP_FILES_ROOT="${APP_FILES_ROOT:-/mnt/shared-app-files/service-desk}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/servicedesk}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%F)"
ARCHIVE="app-files-${STAMP}.tar.gz"

if [[ ! -d "$APP_FILES_ROOT" ]]; then
  echo "[backup-app-files] direktorij ne postoji: $APP_FILES_ROOT" >&2
  exit 1
fi
mkdir -p "$BACKUP_DIR"

started=$(date +%s)
docker run --rm \
  -v "${APP_FILES_ROOT}:/data:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3.20 sh -c "tar -C /data -czf /backup/${ARCHIVE}.partial . && mv /backup/${ARCHIVE}.partial /backup/${ARCHIVE}"

( cd "$BACKUP_DIR" && sha256sum "$ARCHIVE" > "${ARCHIVE}.sha256" )

# Manifest: broj fajlova i nekoliko putanja — verify-restore.mjs koristi
# ID priloga iz baze, a manifest služi kao dokaz sadržaja arhive u zapisniku.
files=$(tar -tzf "${BACKUP_DIR}/${ARCHIVE}" | grep -vc '/$' || true)
size=$(du -h "${BACKUP_DIR}/${ARCHIVE}" | cut -f1)
printf '{"archive":"%s","source":"%s","createdAtUtc":"%s","files":%s,"size":"%s"}\n' \
  "$ARCHIVE" "$APP_FILES_ROOT" "$(date -u +%FT%TZ)" "$files" "$size" > "${BACKUP_DIR}/${ARCHIVE%.tar.gz}.manifest.json"

find "$BACKUP_DIR" -maxdepth 1 -name 'app-files-*.tar.gz*' -mtime +"$RETENTION_DAYS" -print -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'app-files-*.manifest.json' -mtime +"$RETENTION_DAYS" -print -delete

echo "[backup-app-files] ${ARCHIVE}: ${files} fajlova, ${size}, $(( $(date +%s) - started )) s"
