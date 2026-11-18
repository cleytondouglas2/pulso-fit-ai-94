#!/usr/bin/env bash
# Export *only* ARGUS schema from a temporary shared Render Postgres database.
# Must run in a private trusted environment; never put output into public/ or Git.
set -euo pipefail
set +x
umask 077

if [[ $# != 1 || -z "${1:-}" ]]; then
  echo 'Usage: backup_argus_schema.sh /PRIVATE/PATH/argus_YYYYMMDD.dump' >&2
  exit 64
fi
if [[ -z "${ARGUS_PGSQL_URL:-}" ]]; then
  echo 'ARGUS_PGSQL_URL must be set in the private environment.' >&2
  exit 78
fi
for tool in pg_dump pg_restore sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Required tool missing: $tool" >&2; exit 78; }
done

output="$1"
case "$output" in
  /*) ;;
  *) echo 'Use an absolute path outside the deployed application.' >&2; exit 78;;
esac
case "$output" in
  *'/public/'*|*'/static/'*|*'/tmp/'*|*'/var/www/html/'*) echo 'Choose a private, persistent destination outside web root and ephemeral directories.' >&2; exit 78;;
esac
if [[ -e "$output" || -e "$output.sha256" ]]; then
  echo 'Destination already exists; refusing to overwrite a backup.' >&2
  exit 73
fi
mkdir -p -- "$(dirname -- "$output")"
tmp="${output}.partial.$$"
trap 'rm -f -- "$tmp" "${tmp}.toc"' EXIT

pg_dump --dbname="$ARGUS_PGSQL_URL" --schema='argus_payments_b2b' \
  --format=custom --compress=6 --no-owner --no-acl \
  --file="$tmp"
pg_restore --list "$tmp" > "${tmp}.toc"
if ! grep -q 'argus_payments_b2b' "${tmp}.toc"; then
  echo 'Backup missing expected ARGUS schema.' >&2
  exit 65
fi
rm -f -- "${tmp}.toc"
mv -- "$tmp" "$output"
( cd -- "$(dirname -- "$output")" && sha256sum -- "$(basename -- "$output")" > "$(basename -- "$output").sha256" )
trap - EXIT
printf 'ARGUS_SCHEMA_BACKUP status=created location=%s\n' "$output"
printf '%s\n' 'Store a second encrypted copy outside Render. Exports are NOT scheduled automatically.'