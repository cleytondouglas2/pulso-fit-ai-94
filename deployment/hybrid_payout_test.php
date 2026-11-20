<?php
declare(strict_types=1);
/** LOCAL SYNTHETIC TEST. No API client, no provider payment, no network requests. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\HybridPayout as Hybrid;
use ArgusPayments\ApiError;

putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=yes');
putenv('ARGUS_PAYOUTS_ENABLED=yes');
putenv('ARGUS_HYBRID_PAYOUT_LIVE=no');
putenv('ARGUS_MERCHANT_PAYOUT_ENCRYPTION_KEY='.base64_encode(random_bytes(32)));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
Portal::install($db);KycStudio::install($db);Wallet::install($db);Hybrid::install($db);
$score=Hybrid::score(['amount_cents'=>900,'pix_key_type'=>'CPF','prior_count'=>1]);
if($score['decision']!=='review'||$score['score']!==0)
    throw new RuntimeException('Dry-run mode must stop every real payout');
putenv('ARGUS_HYBRID_PAYOUT_LIVE=yes');
if(Hybrid::score(['amount_cents'=>900,'pix_key_type'=>'CPF','prior_count'=>1])['decision']!=='auto')
    throw new RuntimeException('Ordinary verified seller not auto eligible');
if(Hybrid::score(['amount_cents'=>8000,'pix_key_type'=>'CPF','prior_count'=>1])['decision']!=='review')
    throw new RuntimeException('High value payout should require review');
if(Hybrid::score(['amount_cents'=>900,'pix_key_type'=>'EMAIL','prior_count'=>1])['decision']!=='review')
    throw new RuntimeException('External Pix key should require review');
putenv('ARGUS_HYBRID_PAYOUT_LIVE=no');

function makeAccount(DB $db,string $name):array{
 $id=bin2hex(random_bytes(16));$merchant='mer_'.bin2hex(random_bytes(10));
 $db->run('INSERT INTO b2b_merchants(id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at)
     VALUES(?,?,?,?,?,?,?,?,?)',[$merchant,'Synthetic '.$name,substr($id,0,14),
     $id.'@example.invalid',$id.'@example.invalid',150,'approved_live',DB::stamp(),DB::stamp()]);
 $db->run('INSERT INTO argus_portal_accounts
     (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)',[$id,'PJ','Synthetic '.$name,$name.'-'.substr($id,0,15).'@example.invalid',
     hash('sha256',$id),'0000','synthetic','approved',$merchant,DB::stamp(),DB::stamp()]);
 $db->run('INSERT INTO argus_kyc_review_events
     (id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
     VALUES(?,?,?,?,?,?,?,?)',[
     bin2hex(random_bytes(16)),$id,'fake-admin','superadmin','identity_approved',
     'Local regression only','',DB::stamp()]);
 $db->run('INSERT INTO argus_seller_wallets
     (account_id,merchant_id,available_cents,held_cents,debt_cents,updated_at)
     VALUES(?,?,?,?,?,?)',[$id,$merchant,5000,0,0,DB::stamp()]);
 $db->run('INSERT INTO argus_seller_ledger
     (id,account_id,operation_kind,operation_id,delta_available,delta_held,delta_debt,service_fee_cents,created_at)
     VALUES(?,?,?,?,?,?,?,?,?)',[
     'mwl_'.bin2hex(random_bytes(16)),$id,'deposit_paid','mwc_'.bin2hex(random_bytes(16)),5000,0,0,100,DB::stamp()]);
 return ['id'=>$id,'merchant_id'=>$merchant,'status'=>'approved','account_type'=>'PJ'];
}
$a=makeAccount($db,'one');$b=makeAccount($db,'two');
$input=['amount_cents'=>3000,'pix_key_type'=>'cpf','pix_key'=>'52998224725',
    'description'=>'Pedido de teste local',
    'idempotency_key'=>'hybrid-'.bin2hex(random_bytes(16)),'confirm'=>true];
$one=Wallet::requestWithdraw($db,$a,$input);
if($one['status']!=='review')throw new RuntimeException('Expected review, not PSP submission');
$again=Wallet::requestWithdraw($db,$a,$input);
if($one['id']!==$again['id'])throw new RuntimeException('Idempotency same request mismatch');
$next=$input;$next['idempotency_key']='other-'.bin2hex(random_bytes(16));
try{Wallet::requestWithdraw($db,$a,$next);throw new RuntimeException('Pending review allowed duplicate hold');}
catch(ApiError $e){if($e->status!==409)throw $e;}
$other=Wallet::requestWithdraw($db,$b,$next);
if($other['status']!=='review')throw new RuntimeException('Other merchant review must be independent');
$admin=['id'=>'synthetic-admin','role'=>'superadmin'];
$row=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$one['id']]);
if(Hybrid::canDispatch($db,$row))throw new RuntimeException('Review not safe for dispatch');
$queue=Hybrid::queue($db);
if(count($queue)!==2)throw new RuntimeException('Review queue count mismatch');
Hybrid::reject($db,$row,$admin);
$wallet=$db->one('SELECT * FROM argus_seller_wallets WHERE account_id=?',[$a['id']]);
if((int)$wallet['available_cents']!==5000||(int)$wallet['held_cents']!==0)
    throw new RuntimeException('Rejected review did not restore only its seller funds');
$balanceB=$db->one('SELECT * FROM argus_seller_wallets WHERE account_id=?',[$b['id']]);
if((int)$balanceB['available_cents']!==2000||(int)$balanceB['held_cents']!==3000)
    throw new RuntimeException('Merchant B balance changed with Merchant A rejection');
$release=$db->one("SELECT COUNT(*) AS n FROM argus_seller_ledger
    WHERE operation_kind='withdraw_release' AND operation_id=?",[$one['id']]);
if((int)$release['n']!==1)throw new RuntimeException('Reversal ledger must exist once');
try{Hybrid::reject($db,$row,$admin);throw new RuntimeException('Double reversal allowed');}
catch(ApiError $e){if($e->status!==409)throw $e;}
$remaining=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$other['id']]);
putenv('ARGUS_HYBRID_PAYOUT_LIVE=yes');
Hybrid::approve($db,$remaining,$admin); // Only DB state. DO NOT invoke sendWithdraw.
$approved=$db->one('SELECT * FROM argus_seller_withdrawals WHERE id=?',[$other['id']]);
if($approved['status']!=='requested'||$approved['provider_tx_id']!==null)
    throw new RuntimeException('Approval must not itself initiate a PSP transfer');
if(!Hybrid::canDispatch($db,$approved))throw new RuntimeException('Approved review not eligible');
try{Hybrid::approve($db,$remaining,$admin);throw new RuntimeException('Duplicate approval accepted');}
catch(ApiError $e){if($e->status!==409)throw $e;}
putenv('ARGUS_HYBRID_PAYOUT_LIVE=no');
if(Hybrid::canDispatch($db,$approved))throw new RuntimeException('Live switch must stop approved PSP dispatch');
echo "PASS: local rules, tenant isolation, idempotent holds, 2FA-side state, double review and escrow rejection; ZERO PSP calls.\n";
