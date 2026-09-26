#!/usr/bin/env bash
# Paket 1.8 (A6) — dnevna arhiva uploads volumena + SHA-256 + retention.
# Cron na Coolify hostu (primjer, 02:15 UTC):
#   15 2 * * * /opt/ephelpdesk/ops/dr/backup-uploads.sh >> /var/log/ephd-uploads-backup.log 2>&1
#
# Varijable:
#   UPLOADS_VOLUME   ime Docker volumena (docker volume ls | grep uploads)  [obavezno]
#   BACKUP_DIR       odredište (default /var/backups/ephelpdesk)
#   RETENTION_DAYS   koliko dana se čuvaju lokalne arhive (default 14)
# Off-box kopiju (rclone/S3/NAS) radite nakon ove skripte; lokalno brisanje
# starijih arhiva je sigurno tek kad je off-box kopija potvrđena.
set -euo pipefail

: "${UPLOADS_VOLUME:?Postavite UPLOADS_VOLUME (npr. abc123_uploads)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ephelpdesk}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%F)"
ARCHIVE="uploads-${STAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"
docker volume inspect "$UPLOADS_VOLUME" >/dev/null

started=$(date +%s)
docker run --rm \
  -v "${UPLOADS_VOLUME}:/data:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3.20 sh -c "tar -C /data -czf /backup/${ARCHIVE}.partial . && mv /backup/${ARCHIVE}.partial /backup/${ARCHIVE}"

( cd "$BACKUP_DIR" && sha256sum "$ARCHIVE" > "${ARCHIVE}.sha256" )

# Manifest: broj fajlova i nekoliko putanja — verify-restore.mjs koristi
# ID priloga iz baze, a manifest služi kao dokaz sadržaja arhive u zapisniku.
files=$(tar -tzf "${BACKUP_DIR}/${ARCHIVE}" | grep -vc '/$' || true)
size=$(du -h "${BACKUP_DIR}/${ARCHIVE}" | cut -f1)
printf '{"archive":"%s","createdAtUtc":"%s","files":%s,"size":"%s"}\n' \
  "$ARCHIVE" "$(date -u +%FT%TZ)" "$files" "$size" > "${BACKUP_DIR}/${ARCHIVE%.tar.gz}.manifest.json"

find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tar.gz*' -mtime +"$RETENTION_DAYS" -print -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.manifest.json' -mtime +"$RETENTION_DAYS" -print -delete

echo "[backup-uploads] ${ARCHIVE}: ${files} fajlova, ${size}, $(( $(date +%s) - started )) s"
