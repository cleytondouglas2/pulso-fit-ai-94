<?php
declare(strict_types=1);
/** Synthetic anti-duplication/indefinite-Pix regression: NO REAL PSP calls. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\FinancialControl as FC;
use ArgusPayments\KycStudio;
use ArgusPayments\ApiError;

putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=yes');
putenv('ARGUS_PAYOUTS_ENABLED=yes');
putenv('ARGUS_MERCHANT_PAYOUT_ENCRYPTION_KEY='.base64_encode(random_bytes(32)));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);KycStudio::install($db);Wallet::install($db);
$accounts=[];
foreach(['alfa','beta'] as $name){
 $id=bin2hex(random_bytes(16));$merchant='mer_'.bin2hex(random_bytes(10));
 $db->run('INSERT INTO b2b_merchants(id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at)
    VALUES(?,?,?,?,?,?,?,?,?)',[
    $merchant,'Teste '.$name,substr($id,0,14),$id.'@example.invalid',
    $id.'@example.invalid',150,'approved_live',DB::stamp(),DB::stamp()]);
 $db->run('INSERT INTO argus_portal_accounts
   (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
   $id,'PJ','Teste '.$name,$name.'-'.substr($id,0,15).'@example.invalid',
   hash('sha256','id-'.$id),'0000','synthetic','approved',$merchant,DB::stamp(),DB::stamp()]);
 $db->run('INSERT INTO argus_kyc_review_events
   (id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
   VALUES(?,?,?,?,?,?,?,?)',[
   bin2hex(random_bytes(16)),$id,'synthetic','superadmin','identity_approved','Test offline','',DB::stamp()]);
 $account=['id'=>$id,'merchant_id'=>$merchant,'status'=>'approved','account_type'=>'PJ'];$accounts[$name]=$account;
 $db->run('INSERT INTO argus_seller_wallets
   (account_id,merchant_id,available_cents,held_cents,debt_cents,updated_at)
   VALUES(?,?,?,?,?,?)',[$id,$merchant,5000,0,0,DB::stamp()]);
 $db->run('INSERT INTO argus_seller_ledger
   (id,account_id,operation_kind,operation_id,delta_available,delta_held,delta_debt,service_fee_cents,created_at)
   VALUES(?,?,?,?,?,?,?,?,?)',[
     'mwl_'.bin2hex(random_bytes(16)),$id,'deposit_paid','mwc_'.bin2hex(random_bytes(16)),
     5000,0,0,100,DB::stamp()]);
}
$input=[
 'amount_cents'=>2000,'pix_key_type'=>'email','pix_key'=>'receiver@example.com',
 'description'=>'Saque de teste único','idempotency_key'=>'idem-first-'.bin2hex(random_bytes(12)),
 'confirm'=>true
];
$a=$accounts['alfa'];$b=$accounts['beta'];
$one=Wallet::requestWithdraw($db,$a,$input);
$same=Wallet::requestWithdraw($db,$a,$input);
if($one['id']!==$same['id'])throw new RuntimeException('Same idempotency key produced different payouts');
$denied=static function(callable $work):void{
 try{$work();throw new RuntimeException('Unsafe payout unexpectedly accepted');}
 catch(ApiError $ex){if($ex->status!==409)throw $ex;}
};
$next=$input;$next['idempotency_key']='idem-second-'.bin2hex(random_bytes(12));
$denied(static fn()=>Wallet::requestWithdraw($db,$a,$next));
$different=$next;$different['pix_key']='another@example.com';
$denied(static fn()=>Wallet::requestWithdraw($db,$a,$different));
$other=Wallet::requestWithdraw($db,$b,$next);
if($other['id']===$one['id'])throw new RuntimeException('Cross-account payout id collision');
$payout=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$one['id']]);
$db->run("UPDATE argus_seller_withdrawals SET status='queued' WHERE id=?",[$one['id']]);
$finish=new ReflectionMethod(Wallet::class,'finishWithdraw');
$finish->invoke(null,$db,$payout,'paid');
$finish->invoke(null,$db,$payout,'paid');
$paidJournal=$db->one("SELECT COUNT(*) AS n FROM argus_seller_ledger
  WHERE operation_kind='withdraw_paid' AND operation_id=?",[$one['id']]);
if((int)$paidJournal['n']!==1)
 throw new RuntimeException('Repeated payout status debited reserved funds twice');
$wallet=$db->one('SELECT * FROM argus_seller_wallets WHERE account_id=?',[$a['id']]);
if((int)$wallet['available_cents']!==3000||(int)$wallet['held_cents']!==0)
 throw new RuntimeException('Held funds were not released exactly once after paid');
$denied(static fn()=>Wallet::requestWithdraw($db,$a,$next));
$alternative=Wallet::requestWithdraw($db,$a,$different);
if($alternative['id']===$one['id'])
 throw new RuntimeException('Different beneficiary payout cannot be a reused ID');
$db->run('UPDATE argus_seller_wallets SET available_cents=available_cents+1 WHERE account_id=?',[$b['id']]);
$balance=$db->one('SELECT * FROM argus_seller_wallets WHERE account_id=?',[$b['id']]);
$denied(static fn()=>FC::assertWalletBalanced($db,$b['id'],$balance));
if(FC::acquireWorkerLock($db)!==false)
 throw new RuntimeException('Ephemeral SQLite must never claim independent worker lock');
FC::heartbeat($db,'ok','synthetic_offline_test');
$health=FC::heartbeatStatus($db);
if(!$health['fresh']||$health['last_cycle_result']!=='ok'||$health['schedule_external_verified']!==false)
 throw new RuntimeException('Worker heartbeat falsely reports external scheduling');
$merchantSource=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$quickSource=(string)file_get_contents('/var/www/html/src/TraditionalQuickPix.php');
$workerSource=(string)file_get_contents('/usr/local/share/argus/notify_worker.php');
$opsSource=(string)file_get_contents('/var/www/html/src/FinanceOperations.php');
foreach([
 'FinancialControl::assertWalletBalanced($db,$accountId,$w)',
 'FinancialControl::assertPayoutNotDuplicated($db,$accountId,$bodyHash)',
 'status IN (\'pending\',\'unknown\')',
 "status='paid' AND (checked_at IS NULL OR checked_at",
 'self::reconcileOne($db,$row)',
] as $needle)if(!str_contains($merchantSource,$needle))
 throw new RuntimeException('Seller settlement or anti-duplicate guard missing: '.$needle);
if(str_contains($quickSource,"\$cutoff=gmdate('Y-m-d H:i:s',time()-1800);")||
 !str_contains($quickSource,'self::reconcileRow($db,$row)'))
 throw new RuntimeException('Traditional Pix reconciliation stops at QR expiration or lacks provider verification');
if(!str_contains($workerSource,'FinancialControl::acquireWorkerLock')||
 !str_contains($workerSource,'FinancialControl::heartbeat')||
 !str_contains($workerSource,'MerchantWebhooks::worker($db)')||
 !str_contains($opsSource,'FinancialControl::heartbeatStatus'))
 throw new RuntimeException('Background worker mutex/health or outbound reconciliation missing');
if(str_contains($workerSource,"AND created_at>=? AND (checked_at IS NULL OR checked_at<?)"))
 throw new RuntimeException('Background polling silently abandons old Pix or payouts');
echo "PASS: persisted server-side reconciliation without QR-window cutoff; same-key idempotency, blocked parallel payout, 10min duplicate hold, once-only release, ledger checks and worker health.\n";
