<?php
declare(strict_types=1);
// Local synthetic balance tests only. This program never calls payment providers.
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\ApiError;
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();\ArgusPayments\Admin::install($db);
Portal::install($db);KycStudio::install($db);Wallet::install($db);
putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=yes');
putenv('ARGUS_PAYOUTS_ENABLED=yes');
putenv('ARGUS_MERCHANT_PAYOUT_ENCRYPTION_KEY='.base64_encode(random_bytes(32)));
$aId=bin2hex(random_bytes(16));$bId=bin2hex(random_bytes(16));
$aMerchant='mer_'.bin2hex(random_bytes(10));$bMerchant='mer_'.bin2hex(random_bytes(10));
$accounts=[];
foreach([[$aId,$aMerchant,'vendedor.a@example.invalid'],[$bId,$bMerchant,'vendedor.b@example.invalid']] as [$id,$mer,$email]){
 $db->run('INSERT INTO b2b_merchants(id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?)',[
  $mer,'Empresa Teste '.$id,substr($id,0,14),$email,$email,150,'approved_live',DB::stamp(),DB::stamp()]);
 $db->run('INSERT INTO argus_portal_accounts(id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
  $id,'PJ','Empresa Teste '.$id,$email,hash('sha256',$id),'0000','synthetic','approved',$mer,DB::stamp(),DB::stamp()]);
 $db->run('INSERT INTO argus_kyc_review_events(id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at) VALUES(?,?,?,?,?,?,?,?)',[
  bin2hex(random_bytes(16)),$id,'synthetic-superadmin','superadmin','identity_approved','Teste offline','',DB::stamp()]);
 $accounts[$id]=['id'=>$id,'merchant_id'=>$mer,'status'=>'approved'];
}
$walletMethod=new ReflectionMethod(Wallet::class,'wallet');
$aWallet=$walletMethod->invoke(null,$db,$accounts[$aId]);
$bWallet=$walletMethod->invoke(null,$db,$accounts[$bId]);
if((int)$aWallet['available_cents']!==0||(int)$bWallet['available_cents']!==0)
 throw new RuntimeException('Wallet must never start with platform money');
$id='mwc_'.bin2hex(random_bytes(16));$charge=['id'=>$id,'account_id'=>$aId];
$db->run('INSERT INTO argus_seller_charges
 (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,net_cents,description,
 provider_id,copy_paste,status,created_at,checked_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
 $id,$aId,$aMerchant,hash('sha256','synthetic-sale-'.$id),hash('sha256',$id),1000,100,900,
 'Compra teste','tr_synthetic','fake QR not issued','pending',DB::stamp(),null
]);
$apply=new ReflectionMethod(Wallet::class,'applyVerifiedStatus');
$apply->invoke(null,$db,$charge,'paid'); // test-only simulation of a trusted provider result
$apply->invoke(null,$db,$charge,'paid'); // duplicate, must not credit again
$readWallet=static fn($id)=>$db->one('SELECT * FROM argus_seller_wallets WHERE account_id=?',[$id]);
if((int)$readWallet($aId)['available_cents']!==900||
   (int)$readWallet($bId)['available_cents']!==0)
 throw new RuntimeException('Second merchant credited or duplicate settlement occurred');
$journal=$db->one("SELECT COUNT(*) AS n FROM argus_seller_ledger WHERE operation_kind='deposit_paid' AND operation_id=?",[$id]);
if((int)$journal['n']!==1)throw new RuntimeException('Duplicate credit ledger entry');

try{Wallet::reconcile($db,$id,$bId);throw new RuntimeException('Merchant B saw merchant A sale');}
catch(ApiError $e){if($e->status!==404)throw $e;}
try{Wallet::requestWithdraw($db,$accounts[$bId],[
 'amount_cents'=>100,'pix_key_type'=>'email','pix_key'=>'example@example.com',
 'description'=>'Teste saque B','idempotency_key'=>'idem-b-'.bin2hex(random_bytes(12)),'confirm'=>true
]);throw new RuntimeException('Merchant B withdrew funds owned by A');}
catch(ApiError $e){if($e->status!==409)throw $e;}
$req=[
 'amount_cents'=>800,'pix_key_type'=>'email','pix_key'=>'example@example.com',
 'description'=>'Teste saque A','idempotency_key'=>'idem-a-'.bin2hex(random_bytes(12)),'confirm'=>true
];
$first=Wallet::requestWithdraw($db,$accounts[$aId],$req);
$again=Wallet::requestWithdraw($db,$accounts[$aId],$req);
if($first['id']!==$again['id']||(int)$readWallet($aId)['available_cents']!==0||
   (int)$readWallet($aId)['held_cents']!==900)
 throw new RuntimeException('Withdrawal reservation not isolated / not idempotent');
try{
 $repeated=$req;$repeated['idempotency_key']='different-'.bin2hex(random_bytes(12));
 Wallet::requestWithdraw($db,$accounts[$aId],$repeated);
 throw new RuntimeException('Seller overdrawn during concurrent reservation');
}catch(ApiError $e){if($e->status!==409)throw $e;}
$apply->invoke(null,$db,$charge,'refunded');
if((int)$readWallet($aId)['debt_cents']!==900||
   (int)$readWallet($aId)['held_cents']!==900 ||
   (int)$readWallet($bId)['debt_cents']!==0)
 throw new RuntimeException('Refund and reserved payout did not create seller-specific debt');
$apply->invoke(null,$db,$charge,'refunded');
if((int)$readWallet($aId)['debt_cents']!==900)
 throw new RuntimeException('Repeated reversal accumulated duplicate debt');
$payout=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$first['id']]);
$db->run("UPDATE argus_seller_withdrawals SET status='queued' WHERE id=?",[$first['id']]);
$finish=new ReflectionMethod(Wallet::class,'finishWithdraw');
$finish->invoke(null,$db,$payout,'failed');
$finish->invoke(null,$db,$payout,'failed');
if((int)$readWallet($aId)['available_cents']!==0||
   (int)$readWallet($aId)['held_cents']!==0||
   (int)$readWallet($aId)['debt_cents']!==0)
 throw new RuntimeException('Failed transfer reservation was released twice or refund debt not settled');
$credit=$db->one("SELECT COUNT(*) AS n FROM argus_seller_ledger WHERE operation_kind='deposit_paid' AND operation_id=?",[$id]);
if((int)$credit['n']!==1)throw new RuntimeException('Paid credit record changed');

$merchantPhp=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$portalPhp=(string)file_get_contents('/var/www/html/src/Portal.php');
$adminPhp=(string)file_get_contents('/var/www/html/src/Admin.php');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
foreach(['KycStudio::identityApproved','account_id=?','FOR UPDATE',
  "self::provider('/transactions/check'",'service_fee_cents',
  "getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')", 'hash_equals',
  'sodium_crypto_secretbox','Idempotency-Key','withdraw_hold','deposit_refund'] as $needle)
 if(!str_contains($merchantPhp,$needle))throw new RuntimeException('Missing merchant financial safeguard '.$needle);
if(!str_contains($portalPhp,'MerchantWallet::api($db,$method,$path)')||
   !str_contains($portalPhp,'MerchantWallet::portal($db,$method,$path,$account)'))
 throw new RuntimeException('Seller API routes not installed');
if(!str_contains($adminPhp,'MerchantWallet::admin($db,$method,$path,$actor')||
   !str_contains($adminPhp,'self::verifyMfaCode($db,$actor'))
 throw new RuntimeException('Staff 2FA safeguard missing');
if(!str_contains($gateway,"require_once __DIR__ . '/MerchantWallet.php';"))
 throw new RuntimeException('Wallet class not loaded');
foreach([
 ['/var/www/html/public/static/client.html','merchant-portal.js?v=1'],
 ['/var/www/html/public/static/docs.html','merchant-docs.js?v=1'],
 ['/var/www/html/public/static/admin.html','merchant-admin.js?v=1'],
 ['/var/www/html/public/static/admin.html','id="page-merchant-wallet"']
] as [$file,$needle])if(!str_contains((string)file_get_contents($file),$needle))
 throw new RuntimeException('Merchant interface or docs missing '.$needle);
echo "PASS: two independent seller balances, real-only credit model, R$1 fees, duplicate Pix ignored, overdraw denied, refund debt isolated, double-release blocked, MFA and private keys.\n";
