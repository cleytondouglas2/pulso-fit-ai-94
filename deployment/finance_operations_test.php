<?php
declare(strict_types=1);
/** Read-only, synthetic control-plane tests; no external PSP or transfers. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\Portal;
use ArgusPayments\MerchantWallet;
use ArgusPayments\FinanceOperations;
use ArgusPayments\ApiError;
$db=new Database(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);MerchantWallet::install($db);
$idA=bin2hex(random_bytes(16));$idB=bin2hex(random_bytes(16));
$today=gmdate('Y-m-d');
foreach([[$idA,'Test A'],[$idB,'Test B']] as [$id,$name]){
 $db->run('INSERT INTO argus_portal_accounts
 (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
  $id,'PF',$name,substr($id,0,24).'@example.invalid',hash('sha256','doc'.$id),'1234',
  password_hash('SyntheticPassword123',PASSWORD_DEFAULT),'documents_required',null,
  Database::stamp(),Database::stamp()
 ]);
 $db->run('INSERT INTO argus_seller_wallets
 (account_id,merchant_id,available_cents,held_cents,debt_cents,updated_at) VALUES(?,?,?,?,?,?)',[
 $id,'mer_test_'.$id,900,100,0,Database::stamp()]);
 $db->run('INSERT INTO argus_seller_ledger
 (id,account_id,operation_kind,operation_id,delta_available,delta_held,delta_debt,service_fee_cents,created_at)
 VALUES(?,?,?,?,?,?,?,?,?)',[
 'mwl_'.bin2hex(random_bytes(16)),$id,'deposit_paid','mwc_'.bin2hex(random_bytes(16)),
 1000,0,0,100,$today.' 11:00:00']);
 $db->run('INSERT INTO argus_seller_ledger
 (id,account_id,operation_kind,operation_id,delta_available,delta_held,delta_debt,service_fee_cents,created_at)
 VALUES(?,?,?,?,?,?,?,?,?)',[
 'mwl_'.bin2hex(random_bytes(16)),$id,'withdraw_hold','mww_'.bin2hex(random_bytes(16)),
 -100,100,0,0,$today.' 12:00:00']);
}
$range=['from'=>$today,'to'=>$today];
$csvA=FinanceOperations::csv($db,$idA,$range);
$csvB=FinanceOperations::csv($db,$idB,$range);
$csvAll=FinanceOperations::csv($db,null,$range);
if(!str_starts_with($csvA,"\xEF\xBB\xBF")||
 !str_contains($csvA,$idA)||str_contains($csvA,$idB)||
 !str_contains($csvB,$idB)||str_contains($csvB,$idA)||
 !str_contains($csvAll,$idA)||!str_contains($csvAll,$idB))
 throw new RuntimeException('Tenant export leaked another reseller, or Super Admin export is incomplete');
if(!str_contains($csvA,'10,00')||!str_contains($csvA,'-1,00')||
   !str_contains($csvA,'1,00'))
 throw new RuntimeException('CSV cents and signed ledger movements not formatted accurately');
try{FinanceOperations::csv($db,$idA,['from'=>'2026-02-30','to'=>'2026-03-02']);throw new RuntimeException('Invalid export date accepted');}
catch(ApiError $e){if($e->status!==422)throw $e;}
try{FinanceOperations::csv($db,$idA,['from'=>'2025-01-01','to'=>'2026-11-19']);throw new RuntimeException('Unbounded export accepted');}
catch(ApiError $e){if($e->status!==422)throw $e;}
$health=FinanceOperations::health($db);
if($health['read_only']!==true||!isset($health['settings']['background_reconciliation_configured'])||
 !isset($health['settings']['database_persistent']))
 throw new RuntimeException('Operational report malformed');
foreach($health['ledger_mismatches'] as $row){
 if(in_array($row['account_id'],[$idA,$idB],true))
     throw new RuntimeException('Balanced synthetic wallet incorrectly flagged as mismatch');
}
$db->run('UPDATE argus_seller_wallets SET available_cents=901 WHERE account_id=?',[$idA]);
$health=FinanceOperations::health($db);
$own=array_values(array_filter($health['ledger_mismatches'],static fn($r)=>$r['account_id']===$idA));
$other=array_values(array_filter($health['ledger_mismatches'],static fn($r)=>$r['account_id']===$idB));
if(count($own)!==1||count($other)!==0||(int)$own[0]['available_delta_cents']!==1)
 throw new RuntimeException('Ledger discrepancy detection failed for one seller');
$source=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$admin=(string)file_get_contents('/var/www/html/public/static/admin.html');
$client=(string)file_get_contents('/var/www/html/public/static/client.html');
foreach([
 "FinanceOperations::download(\$db,(string)\$account['id'])",
 "FinanceOperations::admin(\$db,\$method,\$path)",
 '/api/admin/merchant-wallet/health',
 '/api/portal/wallet/export.csv',
 '/api/v2/wallet/export.csv',
] as $needle)if(!str_contains($source,$needle))throw new RuntimeException('Tenant authorization route missing: '.$needle);
if(!str_contains($gateway,"require_once __DIR__ . '/FinanceOperations.php';")||
 !str_contains($admin,'id="page-operations"')||
 !str_contains($admin,'finance-operations.js?v=20261119-1')||
 !str_contains($client,'finance-operations.js?v=20261119-1'))
 throw new RuntimeException('Financial control plane not mounted in Admin/seller UI');
echo "PASS: tenant-isolated CSV, ledger cents, strict date validation, mismatched-wallet alert, read-only Admin control-plane and account routing.\n";
