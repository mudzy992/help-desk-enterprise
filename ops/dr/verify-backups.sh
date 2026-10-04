#!/usr/bin/env bash
# Paket 1.8 (A6) — kontrola dnevnih DR backupa: postoje li, jesu li svježi (RPO) i ispravni (SHA-256).
# Exit 0 = sve u redu; 1 = bar jedan problem (ispisuje se šta). Pogodno za cron + monitoring:
#   /opt/servicedesk/ops/dr/verify-backups.sh >> /var/log/servicedesk-backup-verify.log 2>&1
#
# Varijable:
#   BACKUP_DIR   odredište (default /var/backups/servicedesk)
#   RPO_HOURS    dozvoljena starost backupa (default 24)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/servicedesk}"
RPO_HOURS="${RPO_HOURS:-24}"
problems=0

newest() {
  find "$BACKUP_DIR" -maxdepth 1 -name "$1" -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-
}
age_hours() {
  echo $(( ( $(date +%s) - $(stat -c %Y "$1") ) / 3600 ))
}
check_checksum() {
  local file="$1"
  if [ ! -f "${file}.sha256" ]; then
    echo "  FAIL: nema ${file##*/}.sha256"
    problems=1
    return
  fi
  if ! ( cd "$BACKUP_DIR" && sha256sum -c "$(basename "${file}").sha256" >/dev/null ); then
    echo "  FAIL: SHA-256 se ne poklapa ($(basename "${file}"))"
    problems=1
  fi
}

if [ ! -d "$BACKUP_DIR" ]; then
  echo "[verify-backups] FAIL: nema direktorija ${BACKUP_DIR} — cron nije instaliran ili nije radio"
  exit 1
fi

archive="$(newest 'uploads-*.tar.gz')"
if [ -z "$archive" ]; then
  echo "[verify-backups] FAIL: nema uploads arhive u ${BACKUP_DIR}"
  problems=1
else
  hours="$(age_hours "$archive")"
  echo "[verify-backups] uploads: $(basename "$archive"), starost ${hours} h (RPO ${RPO_HOURS} h)"
  if [ "$hours" -gt "$RPO_HOURS" ]; then
    echo "  FAIL: arhiva je starija od RPO-a"
    problems=1
  fi
  check_checksum "$archive"
  [ -f "${archive%.tar.gz}.manifest.json" ] || { echo "  FAIL: nema manifesta"; problems=1; }
fi

config="$(newest 'config-*.json')"
if [ -z "$config" ]; then
  echo "[verify-backups] FAIL: nema config snapshot-a u ${BACKUP_DIR}"
  problems=1
else
  hours="$(age_hours "$config")"
  echo "[verify-backups] config: $(basename "$config"), starost ${hours} h (RPO ${RPO_HOURS} h)"
  if [ "$hours" -gt "$RPO_HOURS" ]; then
    echo "  FAIL: snapshot je stariji od RPO-a"
    problems=1
  fi
  check_checksum "$config"
fi

if [ "$problems" -ne 0 ]; then
  echo "[verify-backups] FAIL: ima problema (vidi gore). Backup nije potpun — pogledaj ops/DR.md."
  exit 1
fi
echo "[verify-backups] OK: uploads i config su svježi i ispravni. Off-box kopiju provjeri odvojeno."
