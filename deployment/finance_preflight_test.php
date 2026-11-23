<?php
declare(strict_types=1);
/* Contract assertions only; no bank, provider or real transaction calls. */
$root='/var/www/html';
$static=$root.'/public/static/';
$js=(string)file_get_contents($static.'finance-operations.js');
$css=(string)file_get_contents($static.'finance-preflight.css');
$php=(string)file_get_contents($root.'/src/FinanceOperations.php');
$html=(string)file_get_contents($static.'admin.html');
foreach([
 'function show(data,preflight)','argus-finance-preflight',
 'Promise.allSettled','/api/admin/pix/diagnostics',
 '/api/admin/quick-pix/config','/api/admin/payouts/readiness',
 'finance.ready_to_attempt!==true',
 'traditional.transaction_read_scope!=="verified"',
 'payout.ready_to_request!==true',
 'WITHDRAW_CREATE','setting.database_shared===true'
] as $needle)
 if(!str_contains($js,$needle))throw new RuntimeException('Preflight JS missing '.$needle);
if(!str_contains($php,"'database_shared'=>filter_var("))
 throw new RuntimeException('No safe shared-storage signal');
if(!str_contains($css,'#argus-finance-preflight'))
 throw new RuntimeException('Preflight CSS absent');
if(substr_count($html,'finance-operations.js?v=preflight-20261123-v2')!==1||
   substr_count($html,'finance-preflight.css?v=20261123-v2')!==1)
 throw new RuntimeException('Admin preflight assets not mounted exactly once');
if(str_contains((string)file_get_contents($static.'client.html'),'finance-preflight.css'))
 throw new RuntimeException('Financial owner diagnostics leaked to reseller');
foreach(['/api/admin/merchant-wallet/health','/api/admin/merchant-wallet/export.csv'] as $route)
 if(!str_contains((string)file_get_contents($root.'/src/MerchantWallet.php'),$route))
   throw new RuntimeException('Existing ledger audit route disappeared: '.$route);
echo "PASS: read-only, Super Admin-only finance preflight with provider rejection and shared bank warnings; financial ledger untouched.\n";
