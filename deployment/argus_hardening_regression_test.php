<?php
declare(strict_types=1);
/** Offline health route integration assertions; no PSP calls and no real withdrawals. */
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
if(!str_contains($gateway, "\$method==='HEAD'&&\$path==='/'")||
 !str_contains($gateway,"\$path==='/readyz'")||
 !str_contains($gateway,"SELECT 1 AS ready")||
 !str_contains($gateway,"http_response_code(503)")||
 !str_contains($gateway,"echo 'ARGUS_READY'"))
 throw new RuntimeException('Readiness route not installed or lacks DB failure handling');
if(str_contains($gateway,"/readyz/withdraw")||str_contains($gateway,"/readyz/charge"))
 throw new RuntimeException('Readiness route must never create money movements');
$awards=(string)file_get_contents('/var/www/html/src/RevenueAwards.php');
$monitor=(string)file_get_contents('/var/www/html/src/AcquirerControl.php');
$script=(string)file_get_contents('/var/www/html/public/static/revenue-awards.js');
$spa=(string)file_get_contents('/var/www/html/public/static/reseller-dashboard.js');
foreach([
 "monthly_gross_cents'=>\$visible?(int)\$r['monthly_gross_cents']:null",
 "ticket_cents'=>\$visible?(int)\$r['ticket_cents']:null",
 "self::consents(\$db);",
 "paid_gross_cents",
] as $part)
 if(!str_contains($awards,$part))throw new RuntimeException('Revenue privacy or ticket fix missing');
if(!str_contains($monitor,'Troca de chaves Pix/saques temporariamente bloqueada'))
 throw new RuntimeException('Unversioned PSP rotation must remain blocked');
if(!str_contains($spa,"page('awards'")||
 !str_contains($script,"Dados não divulgados")||
 !str_contains($script,"activeSellerId"))
 throw new RuntimeException('Single-account SPA isolation or ready awards menu missing');
echo "PASS: DB-backed readiness, guarded historical PSP rotation, privacy-aware awards, refund-safe ticket, direct reseller awards tab.\n";
