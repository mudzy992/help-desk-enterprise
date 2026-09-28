#!/usr/bin/env bash
# Prijava na API iz terminala (i za naloge s MFA) za ručna perf mjerenja.
# Postavlja ACCESS_TOKEN i ORG_UNIT_ID (krovna OJ) u TRENUTNOJ sesiji, zato
# se pokreće preko `source`:
#
#   source perf/session-login.sh [https://api.desk.ba101.top]
#
# Lozinka i MFA kod se unose skriveno, ne ostaju u historiji ni u fajlovima.
# Zavisnosti: curl, python3. Pazi na limit prijava (5 pokušaja / 15 min).

_hd_api="${1:-${BASE_URL:-https://api.desk.ba101.top}}"
_hd_json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)" 2>/dev/null; }

read -rp "E-mail: " _hd_email
# Windows terminals / pasted blocks can bring a trailing CR or spaces.
_hd_email=$(printf '%s' "$_hd_email" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
case "$_hd_email" in
  *@*.*) ;;
  *) echo "Neispravan e-mail: '$_hd_email'. Pokreni skriptu ponovo i ukucaj samo adresu." >&2
     unset _hd_email; unset -f _hd_json; return 1 2>/dev/null || exit 1 ;;
esac
read -rsp "Lozinka: " _hd_password; echo
_hd_password=${_hd_password%$'\r'}
if [ -z "$_hd_password" ] || [ ${#_hd_password} -gt 128 ]; then
  echo "Lozinka je prazna ili duža od 128 znakova (${#_hd_password}). Vjerovatno je zalijepljena i sljedeća komanda — pokreni skriptu samu." >&2
  unset _hd_password _hd_email; unset -f _hd_json; return 1 2>/dev/null || exit 1
fi
_hd_body=$(EMAIL="$_hd_email" PASSWORD="$_hd_password" python3 -c 'import json,os; print(json.dumps({"email":os.environ["EMAIL"],"password":os.environ["PASSWORD"]}))')
unset _hd_password
_hd_login=$(curl -sS -X POST "$_hd_api/auth/login" -H 'Content-Type: application/json' --data-binary "$_hd_body")
unset _hd_body

_hd_status=$(printf '%s' "$_hd_login" | _hd_json "d.get('status','')")
if [ "$_hd_status" = "MFA_REQUIRED" ]; then
  _hd_mfa=$(printf '%s' "$_hd_login" | _hd_json "d['mfaToken']")
  read -rsp "MFA kod (6 cifara): " _hd_code; echo
  _hd_code=$(printf '%s' "$_hd_code" | tr -cd '0-9')
  _hd_login=$(curl -sS -X POST "$_hd_api/auth/mfa/verify" -H 'Content-Type: application/json' \
    --data-binary "{\"mfaToken\":\"$_hd_mfa\",\"code\":\"$_hd_code\"}")
  unset _hd_mfa _hd_code
elif [ -n "$_hd_status" ]; then
  echo "Prijava traži: $_hd_status (npr. MFA_ENROLLMENT_REQUIRED — prvo završi u pregledniku)." >&2
fi

ACCESS_TOKEN=$(printf '%s' "$_hd_login" | _hd_json "d.get('accessToken') or d.get('token') or ''")
if [ -z "$ACCESS_TOKEN" ]; then
  echo "Prijava nije uspjela. Odgovor API-ja (bez tajni):" >&2
  printf '%s' "$_hd_login" | _hd_json "{k: d.get(k) for k in ('code','message','status','details') if d.get(k) is not None}" >&2
  unset ACCESS_TOKEN _hd_login _hd_status _hd_email
  return 1 2>/dev/null || exit 1
fi
export ACCESS_TOKEN

_hd_tree=$(curl -sS "$_hd_api/organizational-units/tree" -H "Authorization: Bearer $ACCESS_TOKEN")
ORG_UNIT_ID=$(printf '%s' "$_hd_tree" | _hd_json "(d if isinstance(d,list) else [d])[0]['id']")
_hd_org_name=$(printf '%s' "$_hd_tree" | _hd_json "(d if isinstance(d,list) else [d])[0]['name']")
export ORG_UNIT_ID BASE_URL="$_hd_api"

echo "Prijavljen: $_hd_email"
echo "ORG_UNIT_ID=$ORG_UNIT_ID ($_hd_org_name)"
echo "ACCESS_TOKEN postavljen (${#ACCESS_TOKEN} znakova, važi ~1 h)."
unset _hd_login _hd_status _hd_tree _hd_org_name _hd_email _hd_api
unset -f _hd_json
