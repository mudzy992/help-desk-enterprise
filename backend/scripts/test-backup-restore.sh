#!/bin/sh
set -eu

source_url="${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"
drill_db="servicedesk_restore_drill_$$"
dump="${RUNNER_TEMP:-/tmp}/servicedesk-restore-$$.dump"
started="$(date +%s)"
pg() { docker run --rm --network host postgres:17-alpine "$@"; }
cleanup() {
  pg dropdb --if-exists --force --maintenance-db="$source_url" "$drill_db" >/dev/null 2>&1 || true
  rm -f "$dump"
  pg psql "$source_url" -v ON_ERROR_STOP=1 -c 'DROP TABLE IF EXISTS public."_dr_restore_probe"' >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

pg psql "$source_url" -v ON_ERROR_STOP=1 -c 'CREATE TABLE public."_dr_restore_probe" (value text NOT NULL)' >/dev/null
pg psql "$source_url" -v ON_ERROR_STOP=1 -c "INSERT INTO public.\"_dr_restore_probe\" VALUES ('restore-ok')" >/dev/null
pg pg_dump --format=custom --no-owner --no-privileges "$source_url" > "$dump"
pg createdb --maintenance-db="$source_url" "$drill_db"
drill_url="$(node -e "const u=new URL(process.argv[1]);u.pathname='/$drill_db';process.stdout.write(u.href)" "$source_url")"
pg pg_restore --no-owner --no-privileges --dbname="$drill_url" < "$dump"
value="$(pg psql "$drill_url" -tAc 'SELECT value FROM public."_dr_restore_probe"')"
compatible="$(pg psql "$drill_url" -tAc "SELECT EXISTS (SELECT 1 FROM public.\"_prisma_migrations\" WHERE migration_name='20271012120000_add_security_audit_webhook_state' AND finished_at IS NOT NULL AND rolled_back_at IS NULL)")"
[ "$value" = "restore-ok" ] || { echo "restore marker mismatch" >&2; exit 1; }
[ "$compatible" = "t" ] || { echo "restored schema is stale" >&2; exit 1; }
finished="$(date +%s)"
age="$(( finished - $(stat -c %Y "$dump") ))"
duration="$(( finished - started ))"
[ "$age" -le 86400 ] && [ "$duration" -le 14400 ] || { echo "RPO/RTO objective failed" >&2; exit 1; }
echo "✓ backup/restore drill: marker+schema PASS, RPO=${age}s <=86400s, RTO=${duration}s <=14400s"
