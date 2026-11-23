#!/usr/bin/env bash
# Read-only verification of an existing private ARGUS PostgreSQL dump.
set -euo pipefail
set +x
umask 077
if [[ $# -ne 1 || -z "$1" ]]; then
 echo 'Usage: argus_backup_verify.sh /PRIVATE/PATH/argus-YYYYMMDD.dump' >&2;exit 64
fi
file="$1"
if [[ ! -f "$file" || ! -r "$file" || ! -f "$file.sha256" ]]; then
 echo 'FAIL: backup and checksum are both required. No restore attempted.' >&2;exit 66
fi
command -v sha256sum >/dev/null || { echo 'FAIL: sha256sum missing' >&2;exit 78; }
command -v pg_restore >/dev/null || { echo 'FAIL: pg_restore missing' >&2;exit 78; }
folder="$(cd "$(dirname "$file")" && pwd -P)"
base="$(basename "$file")"
(cd "$folder" && sha256sum --status -c "$base.sha256") ||
 { echo 'FAIL: SHA256 mismatch. No restore attempted.' >&2;exit 65; }
if ! pg_restore --list "$file" 2>/dev/null | grep -q 'argus_payments_b2b'; then
 echo 'FAIL: invalid dump or schema missing. No restore attempted.' >&2;exit 65
fi
echo 'PASS: checksum and ARGUS schema verified, without database changes.'
echo 'NEXT: restore into a separate empty staging database and compare ledger totals.'
