#!/usr/bin/env bash
# Test scenarios for the checklist in docs/ops/test-okruzenje-1.8.md.
#   scenario.sh move       — premješta lejla.begic u Kakanj (očekivano: izmjena OU)
#   scenario.sh disable    — onemogućava haris.mujic (očekivano: deaktivacija)
#   scenario.sh enable     — vraća haris.mujic (očekivano: reaktivacija)
#   scenario.sh rename     — mijenja prezime amar.hodzic (očekivano: izmjena imena)
#   scenario.sh role       — dodaje selma.dzafic u HD-Agenti (očekivano: dodjela AGENT)
#   scenario.sh safeguard  — onemogućava 12 korisnika Visoko (očekivano: osigurač, >10 %)
#   scenario.sh restore    — poništava 'safeguard'
set -euo pipefail
# Pokrenuto na hostu → proslijedi u kontejner (samba-tool radi samo nad bazom DC-a).
if [ ! -f /var/lib/samba/private/sam.ldb ] && [ -f "$(dirname "$0")/docker-compose.yml" ]; then
  cd "$(dirname "$0")"
  exec docker compose exec -T samba-ad "$(basename "$0")" "$@"
fi
REALM="${SAMBA_REALM:-TEST.EPBIH.LAB}"
BASE="DC=$(echo "${REALM,,}" | sed 's/\./,DC=/g')"

case "${1:-}" in
  move)
    samba-tool user move lejla.begic "OU=Kakanj,OU=ED Zenica,OU=Korisnici,${BASE}" ;;
  disable) samba-tool user disable haris.mujic ;;
  enable)  samba-tool user enable haris.mujic ;;
  rename)  samba-tool user rename amar.hodzic --surname="Hodžić-Test" ;;
  role)    samba-tool group addmembers HD-Agenti selma.dzafic ;;
  safeguard)
    for i in $(seq -w 1 12); do samba-tool user disable "korisnik.visoko${i}"; done ;;
  restore)
    for i in $(seq -w 1 12); do samba-tool user enable "korisnik.visoko${i}"; done ;;
  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
echo "OK: $1"
