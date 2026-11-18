# ARGUS Payments: temporary shared PostgreSQL, backup and later migration

The current Render free Postgres test database expires on **2026-12-18**. Render Free Postgres has **no automatic backups**. The ARGUS demo uses only its own `argus_payments_b2b` schema; however, this is logical separation, **not independent credentials or risk isolation** from PulsoFit.

## Health check

The ARGUS Docker container logs one `ARGUS_STORAGE_PROBE` line each boot, showing only `driver=sqlite` or `driver=pgsql`, whether a query succeeded and whether its schema isolation matched. This does not leak passwords.

The public `/health` route also returns 200 on database success or 503 if unavailable. Neither confirms real-provider settlement.

## Backup (manual, only on trusted machine)

- Provide `ARGUS_PGSQL_URL` through a private environment variable. Do **not** paste it into GitHub/chat.
- Install `postgresql-client` and run `backup_argus_schema.sh /PRIVATE/path/argus-YYYY-MM-DD.dump` on a machine with a stable private disk. Choose a destination outside the Render free container; otherwise an app redeploy can erase it.
- Keep the `.dump` and `.sha256` together, and a separate encrypted copy outside Render. Test restore to an empty staging database before depending on a backup.
- This utility exports **only** ARGUS schema; it does not dump or modify PulsoFit's tables. It does not provide an automated backup or point-in-time recovery.

## Later migration

1. Pause new ARGUS payment creation, let callbacks settle, and reconcile pending transactions with MisticPay.
2. Take a final export with `pg_dump` restricted to schema `argus_payments_b2b`. Verify checksum and restore the dump into an **empty dedicated** PostgreSQL database using `pg_restore --single-transaction --exit-on-error --no-owner --no-acl --dbname="$DESTINATION_PGURL" <backup.dump>`.
3. Compare merchant counts, charge counts, provider IDs, statuses, unique idempotency keys and ledger totals between source and destination, without moving PulsoFit tables.
4. Configure ARGUS to use the dedicated Postgres URL, set `ARGUS_PGSQL_SHARED=false` and perform read-only verification before allowing new payments. Do not run both instances as writers during migration.
5. Keep source read-only for audit and retain encrypted backups under an agreed retention schedule.

**Financial safety**: Do not treat records on the Render Free PostgreSQL as a production financial ledger. It can expire, has no built-in backup/recovery, and the app uses the same database credentials as PulsoFit. The production Pix API must remain disabled until independent protected storage, authenticated merchant onboarding, provider keys and verified split have been configured and tested.