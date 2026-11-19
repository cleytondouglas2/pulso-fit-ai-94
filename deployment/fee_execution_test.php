<?php
declare(strict_types=1);
/** Synthetic, local-only fee accounting tests. No provider network, Pix or money. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\FeePolicy as Policy;
use ArgusPayments\FeeExecution as Fees;
use ArgusPayments\Admin;

$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();Admin::install($db);
Fees::install($db);
$policy=Policy::current($db);
$deposit=Fees::quote($db,'deposit',10000);
$payout=Fees::quote($db,'withdraw',10000);
if($deposit['policy_version']!==$policy['version'] ||
   $payout['policy_version']!==$policy['version'])
    throw new RuntimeException('Per-operation fee version not frozen from active configuration');
if($deposit['provider_amount_cents']!==10000)
    throw new RuntimeException('Deposit QR value must remain identical to the requested amount');
if($payout['provider_amount_cents']!==10000-$payout['argus_fee_cents'])
    throw new RuntimeException('Actual provider payout must be NET of ARGUS fee');
if($payout['recipient_cents']!==$payout['provider_amount_cents']||
   $payout['mistic_cost_estimate_cents']!==(int)$policy['mistic_withdraw_cents'])
    throw new RuntimeException('Net payout accounting is inconsistent');
if($payout['recipient_cents']===10000-$payout['argus_fee_cents']-$policy['mistic_withdraw_cents'])
    throw new RuntimeException('MisticPay provider fee was deducted twice');
if($deposit['commercial_net_cents']!==10000-$deposit['argus_fee_cents'])
    throw new RuntimeException('Deposit commercial net fee math invalid');
if($deposit['deposit_ledger_only']!==true||$deposit['provider_fee_charged_here']!==false)
    throw new RuntimeException('Provider cost and deposit fee must remain separate');

$token=bin2hex(random_bytes(16));
$depositId='qpx_'.$token;
$withdrawId='payout_'.$token;
$db->transaction(static function(DB $db) use($depositId,$deposit){
    $db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
        $depositId,'fee-studio-test',hash('sha256',$depositId),hash('sha256','test-'.$depositId),
        10000,'Unit test fee snapshot','tr_synthetic','000201fake','pending',DB::stamp(),null]);
    Fees::reserve($db,'deposit',$depositId,$deposit);
});
$snapshot=Fees::reserve($db,'deposit',$depositId,$deposit);
if($snapshot['status']!=='reserved'||$snapshot['gross_cents']!==10000||
   $snapshot['policy_version']!==$policy['version'])
    throw new RuntimeException('Atomic deposit fee snapshot not persisted correctly');
if(Fees::depositPaid($db,$depositId)!==false)
    throw new RuntimeException('Pending Pix must not book an earned fee');

$db->run("UPDATE admin_quick_pix SET status='paid',checked_at=? WHERE id=?",
    [DB::stamp(),$depositId]);
if(Fees::depositPaid($db,$depositId)!==true||
   Fees::depositPaid($db,$depositId)!==false)
    throw new RuntimeException('Confirmed Pix fees must be recognized only ONCE');
if(Fees::get($db,'deposit',$depositId)['status']!=='settled')
    throw new RuntimeException('Deposit fee not settled in ledger');

$inserted=Fees::reserve($db,'withdraw',$withdrawId,$payout);
if($inserted['gross_cents']!==10000||
   $inserted['provider_amount_cents']!==$payout['recipient_cents']||
   $inserted['mistic_cost_estimate_cents']!==$policy['mistic_withdraw_cents'])
    throw new RuntimeException('Payout fee snapshot changed gross or duplicated provider costs');
Fees::payoutSubmitted($db,$withdrawId);
if(Fees::get($db,'withdraw',$withdrawId)['status']!=='submitted')
    throw new RuntimeException('Payout pending state lost');
Fees::payoutReconciled($db,$withdrawId,'failed');
if(Fees::get($db,'withdraw',$withdrawId)['status']!=='not_collected')
    throw new RuntimeException('Rejected payout may not be recognized as earned ARGUS fee');
Fees::payoutReconciled($db,$withdrawId,'paid');
if(Fees::get($db,'withdraw',$withdrawId)['status']!=='not_collected')
    throw new RuntimeException('Late contradictory provider states rewrote final fee state');
$history=Fees::summary($db,80);
if(!array_filter($history,static fn($row)=>($row['operation_id']??'')===$withdrawId))
    throw new RuntimeException('Accounting report missing the submitted payout');

$adminPhp=(string)file_get_contents('/var/www/html/src/Admin.php');
foreach([
 "FeeExecution::quote(\$db,'withdraw',\$amount)",
 'fee_acknowledged',
 'fee_version',
 "withdraw(\$providerNet,\$type,\$key,\$description,\$idem)",
 "FeeExecution::reserve(\$db,'withdraw',\$id,\$feeQuote)",
 'FeeExecution::payoutReconciled',
 "'/api/admin/fees/operations'",
 "'/api/admin/payouts/fee-quote'"
] as $needle){
    if(!str_contains($adminPhp,$needle))
        throw new RuntimeException('Actual payout fee connection missing: '.$needle);
}
$quick=(string)file_get_contents('/var/www/html/src/TraditionalQuickPix.php');
foreach([
 "FeeExecution::quote(\$db,'deposit',\$cents)",
 "FeeExecution::reserve(\$db,'deposit',\$id,\$quote)",
 "FeeExecution::depositPaid",
 "FeeExecution::settlePaidSnapshots(\$db)",
 "'/api/admin/quick-pix/fee-quote'"
] as $needle)
    if(!str_contains($quick,$needle))
        throw new RuntimeException('Verified deposit accounting binding missing: '.$needle);
$ui=(string)file_get_contents('/var/www/html/public/static/admin.js');
foreach([
 "'/api/admin/payouts/fee-quote?amount_cents='",
 'fee_acknowledged:true','fee_version:feeQuote.policy_version',
 'feeQuote.recipient_cents','const feeText='
] as $needle)
    if(!str_contains($ui,$needle))
        throw new RuntimeException('Customer-visible payout fee consent missing: '.$needle);
$html=(string)file_get_contents('/var/www/html/public/static/admin.html');
foreach([
 'id="argus-fee-operations-list"',
 'fee-operations.js?v=1','fee-operations.css?v=1',
 'data-nav="fees"','id="page-fees"'
] as $needle)
    if(!str_contains($html,$needle))
        throw new RuntimeException('Fee operation frontend missing: '.$needle);
$opsJs=(string)file_get_contents('/var/www/html/public/static/fee-operations.js');
foreach([
 "'/api/admin/fees/operations'",
 "'/api/admin/quick-pix/fee-quote?amount_cents='",
 "'/api/admin/payouts/fee-quote?amount_cents='",
 "'argus-deposit-fee-summary'","'argus-withdraw-fee-summary'",
] as $needle)
    if(!str_contains($opsJs,$needle))
        throw new RuntimeException('Deposit/withdraw fee preview missing: '.$needle);
if(str_contains($opsJs,'/transactions/withdraw')||
   str_contains($opsJs,'/transactions/create'))
    throw new RuntimeException('Fee preview must never call provider to move money');
$db->run('DELETE FROM argus_fee_operations WHERE operation_id IN (?,?)',[$depositId,$withdrawId]);
$db->run('DELETE FROM admin_quick_pix WHERE id=?',[$depositId]);
echo "PASS: real fee binding on new Pix and payout; paid-only deposit; idempotent snapshots; net withdrawal with explicit consent; no duplicate MisticPay cost; failed payout never earns fee.\n";
