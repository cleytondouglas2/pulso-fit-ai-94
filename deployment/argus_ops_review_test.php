<?php
declare(strict_types=1);
$root='/var/www/html';
$j=(string)file_get_contents($root.'/public/static/finance-operations.js');
$h=(string)file_get_contents($root.'/public/static/admin.html');
$backend=(string)file_get_contents($root.'/src/FinanceOperations.php');
foreach(['partial_refund_reviews','admin_partial_refund_reviews',
'unknown_charges_without_provider_id','admin_unknown_without_provider_id',
'untraceable_withdrawals','Devoluções parciais a conferir',
'Saques sem identificador do PSP','Análise somente leitura.'] as $k)
 if(!str_contains($j,$k))throw new RuntimeException('Financial queue UI lacks '.$k);
foreach(['partial_refund_reviews','admin_partial_refund_reviews',
'unknown_charges_without_provider_id','admin_unknown_without_provider_id',
'untraceable_withdrawals','FinancialControl::heartbeatStatus($db)'] as $k)
 if(!str_contains($backend,$k))throw new RuntimeException('Read-only API lacks '.$k);
if(substr_count($h,'finance-operations.js?v=review-20261123-v3')!==1)
 throw new RuntimeException('Invalid Admin version for queue');
if(!str_contains($j,'if(!admin()||loading')||
 str_contains($j,"method:'POST'")||str_contains($j,"method:'PUT'"))
 throw new RuntimeException('Financial dashboard must not mutate money');
if(trim((string)file_get_contents($root.'/public/healthz'))!=='ARGUS_OK')
 throw new RuntimeException('Static GET/HEAD health marker missing');
echo "PASS: read-only incident queue, health marker and Admin authorization preserved.\n";
