#!/usr/bin/env bash
# Applies migrations to a throwaway local PostgreSQL database with Supabase stubs.
# Usage: DB=imz_test bash supabase/tests/apply_local.sh
set -euo pipefail
DB=${DB:-imz_test}
DIR=$(cd "$(dirname "$0")/.." && pwd)
su postgres -c "psql -q -c 'drop database if exists $DB' -c 'create database $DB'" >/dev/null
for f in tests/local_stub.sql migrations/0001_schema.sql migrations/0002_logic.sql migrations/0003_seed.sql; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $DIR/$f" 2>&1 | grep -v -E "NOTICE|^$" || true
done
su postgres -c "psql -q -d $DB -c 'grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role; grant usage, select on all sequences in schema public to anon, authenticated, service_role;'"
echo "applied to $DB"
