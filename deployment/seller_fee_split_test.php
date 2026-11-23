<?php
declare(strict_types=1);
/** Offline financial allocation regression. Never calls the Pix provider. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\FeePolicy;
use ArgusPayments\SellerFeeSplit as Split;
use ArgusPayments\PlatformFeeTreasury as Treasury;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio;
use ArgusPayments\ApiError;
putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=yes');
putenv('ARGUS_PAYOUTS_ENABLED=yes');
putenv('ARGUS_MERCHANT_PAYOUT_ENCRYPTION_KEY='.base64_encode(random_bytes(32)));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();\ArgusPayments\Admin::install($db);
Portal::install($db);KycStudio::install($db);Wallet::install($db);
Split::install($db);Treasury::install($db);

$actor=['role'=>'superadmin','id'=>'seller-split-regression'];
$policy=FeePolicy::current($db);
$defaults=[
 'version'=>$policy['version'],'mistic_deposit_cents'=>50,'mistic_withdraw_cents'=>50,
 'argus_deposit_fixed_cents'=>50,'argus_withdraw_fixed_cents'=>50,
 'argus_deposit_bps'=>0,'argus_withdraw_bps'=>0,
 'reason'=>'Regression: default provider and platform fee allocation'
];
$current=FeePolicy::save($db,$actor,$defaults);
$d=Split::quote($db,'deposit',1000);
$w=Split::quote($db,'withdraw',500);
if($d['total_fee_cents']!==100||$d['argus_fee_cents']!==50||
   $d['provider_fee_cents']!==50||$d['net_cents']!==900||
   $w['total_fee_cents']!==100||$w['net_cents']!==400||
   $d['policy_version']!==$current['version'])
 throw new RuntimeException('Default R$1 seller fee is not split 50/50');
$id=bin2hex(random_bytes(16));$merchant='mer_'.bin2hex(random_bytes(10));
$email=$id.'@example.invalid';
$db->run('INSERT INTO b2b_merchants
 (id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at)
 VALUES(?,?,?,?,?,?,?,?,?)',[
 $merchant,'Operador synthetic',substr($id,0,14),$email,$email,150,'approved_live',
 DB::stamp(),DB::stamp()]);
$db->run('INSERT INTO argus_portal_accounts
 (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
 $id,'PJ','Teste Divisao', $email,hash('sha256',$id),'0000','synthetic','approved',
 $merchant,DB::stamp(),DB::stamp()]);
$db->run('INSERT INTO argus_kyc_review_events
 (id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
 VALUES(?,?,?,?,?,?,?,?)',[
 bin2hex(random_bytes(16)),$id,'synthetic','superadmin','identity_approved','Teste offline','',DB::stamp()]);
$db->run('INSERT INTO argus_seller_wallets
 (account_id,merchant_id,available_cents,held_cents,debt_cents,updated_at)
 VALUES(?,?,?,?,?,?)',[$id,$merchant,0,0,0,DB::stamp()]);
$charge='mwc_'.bin2hex(random_bytes(16));
$db->transaction(static function(DB $db)use($charge,$id,$merchant,$d){
 $db->run('INSERT INTO argus_seller_charges
  (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,net_cents,description,
   provider_id,copy_paste,status,created_at,checked_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
   $charge,$id,$merchant,hash('sha256',$charge),hash('sha256','body'.$charge),
   1000,$d['total_fee_cents'],$d['net_cents'],'Synthetic Pix','tr_synthetic',
   'synthetic QR','pending',DB::stamp(),null]);
 Split::reserve($db,'deposit',$charge,$id,$d);
});
$apply=new ReflectionMethod(Wallet::class,'applyVerifiedStatus');
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$id],'paid');
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$id],'paid');
$fee=$db->one('SELECT amount_cents FROM argus_platform_fee_journal
 WHERE event_kind=? AND operation_id=?',['deposit_paid',$charge]);
if((int)($fee['amount_cents']??-1)!==50)
 throw new RuntimeException('Administrator was credited more than own R$0.50 share');
$balance=$db->one('SELECT available_cents FROM argus_seller_wallets WHERE account_id=?',[$id]);
if((int)$balance['available_cents']!==900)
 throw new RuntimeException('Seller wallet not debited exactly R$ 1.00');

$acc=['id'=>$id,'merchant_id'=>$merchant,'status'=>'approved'];
$req=[
 'amount_cents'=>500,'pix_key_type'=>'email','pix_key'=>'receiver@example.invalid',
 'description'=>'Saque teste split','confirm'=>true,
 'fee_version'=>$current['version'],'idempotency_key'=>'idem-'.bin2hex(random_bytes(16))
];
$merchantCheck=$db->one('SELECT id,status FROM b2b_merchants WHERE id=?',[$merchant]);
if(!$merchantCheck||$merchantCheck['status']!=='approved_live')
 throw new RuntimeException('Synthetic merchant not authorized by fixture; status='.($merchantCheck['status']??'missing'));
$payout=Wallet::requestWithdraw($db,$acc,$req);
$payoutAgain=Wallet::requestWithdraw($db,$acc,$req);
if($payout['id']!==$payoutAgain['id']||$payout['service_fee_cents']!==100||
   $payout['recipient_cents']!==400)
 throw new RuntimeException('Payout fee or idempotency inconsistent');
$snapshot=Split::get($db,'withdraw',$payout['id']);
if(!$snapshot||$snapshot['argus_fee_cents']!==50||
   $snapshot['provider_fee_cents']!==50)
 throw new RuntimeException('Payout split missing');
$db->run("UPDATE argus_seller_withdrawals SET status='queued',provider_tx_id=? WHERE id=?",
 ['tx_synthetic',$payout['id']]);
$finish=new ReflectionMethod(Wallet::class,'finishWithdraw');
$finish->invoke(null,$db,['id'=>$payout['id'],'account_id'=>$id],'paid');
$finish->invoke(null,$db,['id'=>$payout['id'],'account_id'=>$id],'paid');
$paid=$db->one('SELECT amount_cents FROM argus_platform_fee_journal
 WHERE event_kind=? AND operation_id=?',['withdraw_paid',$payout['id']]);
if((int)($paid['amount_cents']??-1)!==50)
 throw new RuntimeException('Paid payout earned wrong ARGUS share');

$updated=FeePolicy::save($db,$actor,[
 'version'=>$current['version'],'mistic_deposit_cents'=>70,'mistic_withdraw_cents'=>70,
 'argus_deposit_fixed_cents'=>30,'argus_withdraw_fixed_cents'=>30,
 'argus_deposit_bps'=>0,'argus_withdraw_bps'=>0,
 'reason'=>'Regression: new 70/30 provider and platform split'
]);
$new=Split::quote($db,'deposit',1000);
$old=Split::get($db,'deposit',$charge);
if($new['total_fee_cents']!==100||$new['provider_fee_cents']!==70||
   $new['argus_fee_cents']!==30||$old['provider_fee_cents']!==50||
   $old['argus_fee_cents']!==50||$old['policy_version']===$updated['version'])
 throw new RuntimeException('Changing admin rates rewrote historical fee or did not reprice new operations');

$next='mwc_'.bin2hex(random_bytes(16));
$db->transaction(static function(DB $db)use($next,$id,$merchant,$new){
 $db->run('INSERT INTO argus_seller_charges
  (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,net_cents,description,
   provider_id,copy_paste,status,created_at,checked_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
   $next,$id,$merchant,hash('sha256',$next),hash('sha256','body'.$next),
   1000,$new['total_fee_cents'],$new['net_cents'],'New synthetic Pix','tr_synthetic',
   'synthetic QR','pending',DB::stamp(),null]);
 Split::reserve($db,'deposit',$next,$id,$new);
});
$apply->invoke(null,$db,['id'=>$next,'account_id'=>$id],'paid');
$paidNext=$db->one('SELECT amount_cents FROM argus_platform_fee_journal
 WHERE event_kind=? AND operation_id=?',['deposit_paid',$next]);
if((int)($paidNext['amount_cents']??-1)!==30)
 throw new RuntimeException('Admin rate change not reflected in next ARGUS receipt');
try{
 $bad=$req;$bad['idempotency_key']='stale-'.bin2hex(random_bytes(16));
 Wallet::requestWithdraw($db,$acc,$bad);
 throw new RuntimeException('Old fee consent was allowed after price change');
}catch(ApiError $e){if($e->status!==409)throw $e;}
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$id],'refunded');
$refund=$db->one('SELECT amount_cents FROM argus_platform_fee_journal
 WHERE event_kind=? AND operation_id=?',['deposit_refund',$charge]);
if((int)($refund['amount_cents']??0)!==-50)
 throw new RuntimeException('Refund did not reverse historical ARGUS fee snapshot');
$provider=Split::providerCostSummary($db);
if($provider['estimated_provider_cost_cents']<170)
 throw new RuntimeException('Provider fee provisional share not recorded after paid events');
$statement=Treasury::summary($db);
if($statement['owner_email']!=='cleyton.douglas2@gmail.com'||
   $statement['provider_cost_mode']!=='contractual_estimate_not_second_psp_debit')
 throw new RuntimeException('Treasury account or provider-cost labeling broken');
$walletPhp=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$portalJs=(string)file_get_contents('/var/www/html/public/static/merchant-portal.js');
foreach(['SellerFeeSplit::reserve','SellerFeeSplit::quote',
         "'/api/portal/wallet/fee-quote'","'fee_version'"] as $needle)
 if(!str_contains($walletPhp,$needle))
  throw new RuntimeException('Dynamic seller backend fee contract missing '.$needle);
foreach(['fee_version:liveFee.policy_version','feeCents:FEE',
         '/api/portal/wallet/fee-quote?direction=withdraw'] as $needle)
 if(!str_contains($portalJs,$needle))
  throw new RuntimeException('Fee quote version not acknowledged in seller UI '.$needle);
echo "PASS: R$1.00 is R$0.50 MisticPay provision + R$0.50 ARGUS earned; admin changes affect new fees, not old; refund, payout, anti-duplicate and stale-quote safety; ZERO real Pix.\n";
