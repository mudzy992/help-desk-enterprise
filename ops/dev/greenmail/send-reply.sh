#!/usr/bin/env sh
# Paket 2.3: pošalji testni odgovor na tiket u GreenMail sandučić helpdesk@epbih.ba.
#   ./send-reply.sh <broj-tiketa|-> <pošiljalac> "<tekst>" [dodatno zaglavlje]
# Primjeri:
#   ./send-reply.sh T-000123 ana.anic@epbih.ba "Printer radi, hvala."
#   ./send-reply.sh - ana.anic@epbih.ba "Novi laptop" "Subject: Trebam novi laptop"
#   ./send-reply.sh T-000123 ana.anic@epbih.ba "Van ureda" "Auto-Submitted: auto-replied"
set -eu
number="$1"; from="$2"; text="$3"; extra="${4:-}"
subject="RE: [$number] Test odgovor"
[ "$number" = "-" ] && subject="Test bez broja tiketa"
case "$extra" in Subject:*) subject="${extra#Subject: }"; extra="";; esac
file="messages/reply-$(date +%s).eml"
{
  printf 'From: %s\r\n' "$from"
  printf 'To: helpdesk@epbih.ba\r\n'
  printf 'Subject: %s\r\n' "$subject"
  printf 'Message-ID: <test-%s-%s@epbih.ba>\r\n' "$(date +%s)" "$$"
  printf 'Date: %s\r\n' "$(date -R)"
  [ -n "$extra" ] && printf '%s\r\n' "$extra"
  printf 'Content-Type: text/plain; charset=utf-8\r\n\r\n'
  printf '%s\r\n\r\nOn Mon, 1 Oct 2026 Help Desk <helpdesk@epbih.ba> wrote:\r\n> citat koji se mora ukloniti\r\n' "$text"
} > "$file"
docker compose exec -T mailer curl -sS --url smtp://greenmail.test:3025 \
  --mail-from "$from" --mail-rcpt helpdesk@epbih.ba --upload-file "/$file"
echo "Poslano: $file"
