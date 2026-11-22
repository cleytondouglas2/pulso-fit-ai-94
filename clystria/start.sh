#!/bin/sh
set -eu
PORT="${PORT:-10000}"
sed -ri "s/^Listen [0-9]+$/Listen ${PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf
# Verify the isolated PostgreSQL schema and secret before accepting real traffic.
if [ "${APP_ENV:-}" = "production" ]; then
  php -r 'require "/var/www/html/src/core.php"; if (!getenv("DATABASE_URL")) { fwrite(STDERR, "CLYSTRIA_PRODUCTION_DATABASE_REQUIRED\\n"); exit(1); } if (strlen(getenv("SETUP_TOKEN") ?: "") < 20) { fwrite(STDERR, "CLYSTRIA_SETUP_SECRET_REQUIRED\\n"); exit(1); } appKey(); $db=getDb(); $db->query("SELECT 1")->fetch(); fwrite(STDOUT, "CLYSTRIA_POSTGRES_SCHEMA_READY\\n");'
fi
exec apache2-foreground
