<?php
declare(strict_types=1);
// Runtime storage diagnosis. Never logs credentials or connection strings.
require '/var/www/html/src/Database.php';
$config = require '/var/www/html/config.php';
$driver = (string)($config['driver'] ?? 'unknown');
$shared = filter_var(getenv('ARGUS_PGSQL_SHARED') ?: 'false', FILTER_VALIDATE_BOOLEAN);
try {
    $database = new \ArgusPayments\Database($config);
    $result = $database->one('SELECT 1 AS probe');
    if (!$result || (int)($result['probe'] ?? 0) !== 1) {
        throw new RuntimeException('Probe query failed');
    }
    if ($database->driver() === 'pgsql') {
        $expected = \ArgusPayments\Database::validatedPgSchema((string)($config['pgsql_schema'] ?? 'argus_payments_b2b'));
        $actual = (string)$database->pdo()->query('SELECT current_schema()')->fetchColumn();
        if ($actual !== $expected) {
            throw new RuntimeException('Schema isolation check failed');
        }
    }
    error_log('ARGUS_STORAGE_PROBE status=connected driver='.$driver.' shared='.($shared?'yes':'no').' schema_isolated=yes');
} catch (Throwable $error) {
    error_log('ARGUS_STORAGE_PROBE status=unavailable driver='.$driver.' shared='.($shared?'yes':'no').' error_type='.get_class($error));
    // Keep the web server running so /health can report a precise HTTP 503 status.
    // Financial API readiness remains fail-closed on unavailable DB.
}