<?php
declare(strict_types=1);
/** Accounting regression: offline synthetic PSP-confirmation events only. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\PlatformFeeTreasury as Fees;
putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=yes');
putenv('ARGUS_PAYOUTS_ENABLED=yes');
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();\ArgusPayments\Admin::install($db);
\ArgusPayments\Portal::install($db);
\ArgusPayments\KycStudio::install($db);
Wallet::install($db);
$id=bin2hex(random_bytes(16));$merchant='mer_'.bin2hex(random_bytes(10));$charge='mwc_'.bin2hex(random_bytes(16));
$db->run('INSERT INTO b2b_merchants(id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at)
 VALUES(?,?,?,?,?,?,?,?,?)',[$merchant,'Teste Recebedor',$id.'01',$id.'@example.invalid',$id.'@example.invalid',150,'approved_live',DB::stamp(),DB::stamp()]);
$db->run('INSERT INTO argus_portal_accounts(id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)',[$id,'PJ','Revendedor Teste',$id.'@example.invalid',hash('sha256',$id),'0000','synthetic','approved',$merchant,DB::stamp(),DB::stamp()]);
$db->run('INSERT INTO argus_seller_wallets(account_id,merchant_id,available_cents,held_cents,debt_cents,updated_at)
 VALUES(?,?,?,?,?,?)',[$id,$merchant,0,0,0,DB::stamp()]);
$db->run('INSERT INTO argus_seller_charges(id,account_id,merchant_id,idem_hash,body_hash,
 amount_cents,service_fee_cents,net_cents,description,provider_id,copy_paste,status,created_at,checked_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$charge,$id,$merchant,hash('sha256',$charge),hash('sha256','test'),
 1000,100,900,'Teste local','tr_synthetic','QR synthetic','pending',DB::stamp(),null]);
$apply=new ReflectionMethod(Wallet::class,'applyVerifiedStatus');
$before=Fees::summary($db);
if($before['net_recognized_cents']!==0)throw new RuntimeException('Unpaid Pix credited administrator');
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$id],'paid');
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$id],'paid');
$s=Fees::summary($db);
if($s['net_recognized_cents']!==100||$s['deposit_fees_cents']!==100||
 $s['owner_email']!=='cleyton.douglas2@gmail.com'||$s['event_count']!==1)
 throw new RuntimeException('Deposit fee not attributed exactly once to admin');
if(Fees::backfill($db,20)['posted']!==0)throw new RuntimeException('Backfill double booked deposit');
$withdraw='mww_'.bin2hex(random_bytes(16));
$db->run('INSERT INTO argus_seller_withdrawals
 (id,account_id,idem_hash,body_hash,amount_cents,service_fee_cents,debit_cents,pix_key_type,pix_key_masked,
 pix_key_encrypted,description,provider_tx_id,provider_job_id,status,created_at,checked_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
 $withdraw,$id,hash('sha256','wd'.$withdraw),hash('sha256',$withdraw),500,100,500,'CPF','111••••1234','sealedfake',
 'synthetic','tx_synthetic','job_synthetic','queued',DB::stamp(),null]);
$db->run('UPDATE argus_seller_wallets SET available_cents=400,held_cents=500 WHERE account_id=?',[$id]);
$db->run('INSERT INTO argus_seller_ledger(id,account_id,operation_kind,operation_id,
 delta_available,delta_held,delta_debt,service_fee_cents,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[
 'mwl_'.bin2hex(random_bytes(16)),$id,'withdraw_hold',$withdraw,-500,500,0,100,DB::stamp()
]);
$pending=Fees::summary($db);
if($pending['net_recognized_cents']!==100)
 throw new RuntimeException('Queued withdrawal fee credited before payment');
$finish=new ReflectionMethod(Wallet::class,'finishWithdraw');
$finish->invoke(null,$db,['id'=>$withdraw,'account_id'=>$id],'paid');
$finish->invoke(null,$db,['id'=>$withdraw,'account_id'=>$id],'paid');
$s=Fees::summary($db);
if($s['net_recognized_cents']!==200||$s['withdrawal_fees_cents']!==100||$s['event_count']!==2)
 throw new RuntimeException('Confirmed withdrawal fee not posted exactly once');
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$id],'refunded');
$apply->invoke(null,$db,['id'=>$charge,'account_id'=>$id],'refunded');
$s=Fees::summary($db);
if($s['net_recognized_cents']!==100||$s['refunded_fees_cents']!==100||$s['event_count']!==3)
 throw new RuntimeException('Refund fee not reversed exactly once');
if(Fees::backfill($db,30)['posted']!==0)
 throw new RuntimeException('Backfill duplicates existing fee journal');
if($s['mode']!=='internal_accounting_only'||$s['not_withdrawable']!==true||
    $s['provider_transfer_created']!==false)
 throw new RuntimeException('Unsafe promise of financial transfer');
$ledger=$db->all('SELECT event_kind,amount_cents FROM argus_platform_fee_journal WHERE owner_email=?',[$s['owner_email']]);
if(count($ledger)!==3)throw new RuntimeException('Unexpected fee journal count');
echo "PASS: fee admin attribution from PSP-paid seller deposits and payouts, refund reversal, no duplicates, read-only accrual and no real transfer\n";
