#!/usr/bin/env bash
# Paket 2.3: dolazna pošta preko Gmail IMAP-a (isti nalog i app password kao SMTP).
# Pokretanje na serveru (iz korijena repozitorija):
#   bash ops/inbound/apply-gmail-imap.sh <backend-kontejner>
# Skripta pita adresu i app password (ne ispisuje ga) i upisuje postavke kroz
# CLI apply-settings (ista validacija i change log kao UI; tajna ide šifrovano).
# Nakon toga: Postavke → Dolazna pošta → „Testiraj konekciju”, pa uključi
# `private.inbound.enabled` (ovdje ostaje isključeno dok test ne prođe).
set -euo pipefail
container="${1:?Upotreba: $0 <backend-kontejner>}"
read -r -p "Gmail adresa (ista kao SMTP korisnik): " address
read -r -s -p "App password (16 znakova, razmaci su dozvoljeni): " password; echo
password="${password// /}"
[ ${#password} -eq 16 ] || { echo "App password treba imati 16 znakova (bez razmaka)." >&2; exit 1; }
json=$(ADDRESS="$address" PASSWORD="$password" python3 - <<'PY'
import json, os
a = os.environ["ADDRESS"].strip().lower()
print(json.dumps({
  "private.inbound.provider": "imap",
  "private.inbound.address": a,
  "private.inbound.imap.host": "imap.gmail.com",
  "private.inbound.imap.port": 993,
  "private.inbound.imap.tls": True,
  "private.inbound.imap.username": a,
  "private.inbound.imap.password": os.environ["PASSWORD"],
  "private.inbound.imap.authMethod": "password",
  "private.inbound.requireAuthPass": True,
}))
PY
)
printf '%s' "$json" | docker exec -i "$container" node dist/src/cli/apply-settings.js --reason "Paket 2.3 Gmail IMAP"
echo "Gotovo. Provjeri u aplikaciji: Testiraj konekciju, zatim uključi private.inbound.enabled."
