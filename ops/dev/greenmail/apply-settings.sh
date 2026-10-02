#!/usr/bin/env sh
# Paket 2.3: postavke za GreenMail (IMAP bez TLS-a, bez DMARC provjere — GreenMail
# ne dodaje Authentication-Results). Pokrenuti iz korijena repozitorija na serveru:
#   sh ops/dev/greenmail/apply-settings.sh <backend-kontejner>
set -eu
container="$1"
docker exec -i "$container" node dist/src/cli/apply-settings.js --reason "Paket 2.3 GreenMail test" <<'JSON'
{
  "private.inbound.enabled": true,
  "private.inbound.provider": "imap",
  "private.inbound.address": "helpdesk@example.com",
  "private.inbound.pollSeconds": 30,
  "private.inbound.imap.host": "greenmail.test",
  "private.inbound.imap.port": 3143,
  "private.inbound.imap.tls": false,
  "private.inbound.imap.username": "helpdesk@example.com",
  "private.inbound.imap.password": "helpdesk-test",
  "private.inbound.imap.authMethod": "password",
  "private.inbound.requireAuthPass": false
}
JSON
