<?php
declare(strict_types=1);
/** Synthetic offline tests: no API requests or real money changes. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\TraditionalQuickPix as Pix;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio;

if(Pix::status('DEVOLVIDO_PARCIAL')!=='partial_review'||
   Pix::status('DEVOLVIDO')!=='failed'||
   Pix::status('COMPLETO')!=='paid')
 throw new RuntimeException('Partial/full refund PSP state mapping unsafe');
putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=yes');
putenv('ARGUS_PAYOUTS_ENABLED=yes');
putenv('ARGUS_MERCHANT_PAYOUT_ENCRYPTION_KEY='.base64_encode(random_bytes(32)));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);KycStudio::install($db);Wallet::install($db);
$account=bin2hex(random_bytes(16));$merchant='mer_'.bin2hex(random_bytes(10));
$db->run("INSERT INTO b2b_merchants(id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?)",
 [$merchant,'Partial refund test','00000000000000',$account.'@example.invalid',$account.'@example.invalid',0,'approved_live',DB::stamp(),DB::stamp()]);
$db->run("INSERT INTO argus_portal_accounts(id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)",
 [$account,'PJ','Seller partial refund',$account.'@example.invalid',hash('sha256','test'.$account),'0000','synthetic','approved',$merchant,DB::stamp(),DB::stamp()]);
$db->run("INSERT INTO argus_kyc_review_events(id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
 VALUES(?,?,?,?,?,?,?,?)",
 [bin2hex(random_bytes(16)),$account,'synthetic','superadmin','identity_approved','Offline test','',DB::stamp()]);
$db->run("INSERT INTO argus_seller_wallets(account_id,merchant_id,available_cents,held_cents,debt_cents,updated_at)
 VALUES(?,?,?,?,?,?)",[$account,$merchant,1000,0,0,DB::stamp()]);
$id='mwc_'.bin2hex(random_bytes(16));
$db->run("INSERT INTO argus_seller_charges(id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,net_cents,description,provider_id,copy_paste,status,created_at,checked_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
 [$id,$account,$merchant,hash('sha256','idem'.$id),hash('sha256','body'.$id),1100,100,1000,'Synthetic paid charge','tr_synthetic','000201TEST','paid',DB::stamp(),DB::stamp()]);
$db->run("INSERT INTO argus_seller_ledger(id,account_id,operation_kind,operation_id,delta_available,delta_held,delta_debt,service_fee_cents,created_at)
 VALUES(?,?,?,?,?,?,?,?,?)",
 ['mwl_'.bin2hex(random_bytes(16)),$account,'deposit_paid',$id,1000,0,0,100,DB::stamp()]);
$method=new ReflectionMethod(Wallet::class,'applyVerifiedStatus');
$row=$db->one('SELECT * FROM argus_seller_charges WHERE id=?',[$id]);
$method->invoke(null,$db,$row,'partial_review');
$method->invoke(null,$db,$row,'partial_review');
$w=$db->one('SELECT * FROM argus_seller_wallets WHERE account_id=?',[$account]);
$c=$db->one('SELECT status FROM argus_seller_charges WHERE id=?',[$id]);
$n=$db->one('SELECT COUNT(*) AS n FROM argus_seller_ledger WHERE account_id=?',[$account]);
if($c['status']!=='partial_review'||(int)$w['available_cents']!==1000||
 (int)$w['debt_cents']!==0||(int)$n['n']!==1)
 throw new RuntimeException('Partial refund incorrectly moved, credited or reversed money');
try{
 Wallet::requestWithdraw($db,['id'=>$account,'merchant_id'=>$merchant,'status'=>'approved','account_type'=>'PJ'],
 ['amount_cents'=>200,'confirm'=>true,'pix_key_type'=>'email','pix_key'=>'synthetic@example.invalid',
  'description'=>'Test only','idempotency_key'=>'safe-partial-'.bin2hex(random_bytes(12))]);
 throw new RuntimeException('Partial-refund seller withdrawal incorrectly allowed');
}catch(\ArgusPayments\ApiError $e){
 if($e->status!==409)throw new RuntimeException('Payout did not reach the partial-refund block: '.$e->status);
}
$src=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$quick=(string)file_get_contents('/var/www/html/src/TraditionalQuickPix.php');
$ops=(string)file_get_contents('/var/www/html/src/FinanceOperations.php');
if(substr_count($src,"'DEVOLVIDO_PARCIAL'=>'unknown'")!==2||
   str_contains($src,"'DEVOLVIDO','DEVOLVIDO_PARCIAL'=>'refunded'")||
   !str_contains($quick,"'DEVOLVIDO_PARCIAL'=>'partial_review'")||
   !str_contains($ops,'unknown_charges_without_provider_id')||
   !str_contains($ops,'untraceable_withdrawals'))
 throw new RuntimeException('Missing fail-closed PSP partial/unknown state contract');
echo "PASS: synthetic partial refund preserved funds, blocked seller payout, and flagged missing PSP IDs; no real API calls.\n";
