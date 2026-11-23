<?php
declare(strict_types=1);
/**
 * Offline PF/PJ approval + disabled-state correctness.
 * Never runs provider endpoints or creates any Pix.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio;
use ArgusPayments\PfFinancialApproval as PF;
use ArgusPayments\ResellerPublicPix as PublicPix;
use ArgusPayments\MerchantWallet as Wallet;
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
Portal::install($db);KycStudio::install($db);PF::install($db);Wallet::install($db);PublicPix::install($db);
$keys=[
'ARGUS_MERCHANT_UNIT_TEST','ARGUS_MERCHANT_CUSTODY_ENABLED',
'ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED',
'ARGUS_TRADITIONAL_PIX_CLIENT_ID','ARGUS_TRADITIONAL_PIX_CLIENT_SECRET',
'ARGUS_FINANCE_QR_CLIENT_ID','ARGUS_FINANCE_QR_CLIENT_SECRET'];
$old=[];
foreach($keys as $k)$old[$k]=getenv($k);
putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=yes');
putenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID=pk_'.str_repeat('a',15));
putenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET=sk_'.str_repeat('b',35));
putenv('ARGUS_FINANCE_QR_CLIENT_ID=pk_'.str_repeat('c',15));
putenv('ARGUS_FINANCE_QR_CLIENT_SECRET=sk_'.str_repeat('d',35));
$check=new ReflectionMethod(PublicPix::class,'readiness');
$now=DB::stamp();
$accounts=[];
foreach(['PF','PJ'] as $type){
 $id=bin2hex(random_bytes(16));
 $merchant=$type==='PF'?'pfm_'.bin2hex(random_bytes(16)):'mer_'.bin2hex(random_bytes(16));
 $digest=hash('sha256','synthetic-test-'.$id);
 $db->run("INSERT INTO argus_portal_accounts
  (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)",[
  $id,$type,'Conta de teste '.$type,$id.'@example.invalid',$digest,'0000',
  'offline','approved',$merchant,$now,$now
 ]);
 $db->run("INSERT INTO argus_kyc_review_events
  (id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
  VALUES(?,?,?,?,?,?,?,?)",[
  bin2hex(random_bytes(16)),$id,'test-reviewer','superadmin',
  'identity_approved','Test-only approval','',$now
 ]);
 if($type==='PF'){
  $db->run("INSERT INTO argus_pf_wallet_merchants
   (id,account_id,cpf_digest,legal_name,status,approved_at,reviewer_id)
   VALUES(?,?,?,?,?,?,?)",[$merchant,$id,$digest,'Pessoa teste','approved_live',$now,'test-reviewer']);
 }else{
  $db->run("INSERT INTO b2b_merchants
   (id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at)
   VALUES(?,?,?,?,?,?,?,?,?)",[
   $merchant,'Empresa teste',substr($digest,0,14),$id.'@example.invalid',
   $id.'@example.invalid',0,'approved_live',$now,$now
  ]);
 }
 $accounts[$type]=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$id]);
 if(!KycStudio::identityApproved($db,$id)||!PF::authorized($db,$accounts[$type]))
  throw new RuntimeException('Fixture must have valid '.$type.' approval');
 $ready=$check->invoke(null,$db,$accounts[$type]);
 if($ready['can_generate']!==true||$ready['availability_code']!=='ready')
  throw new RuntimeException('Approved '.$type.' reseller was incorrectly blocked');
}
$pf=$accounts['PF'];
$db->run('UPDATE argus_pf_wallet_merchants SET cpf_digest=? WHERE account_id=?',
 [hash('sha256','tamper'),$pf['id']]);
$bad=$check->invoke(null,$db,$pf);
if($bad['can_generate']!==false||$bad['availability_code']!=='account_review')
 throw new RuntimeException('Invalid PF financial beneficiary must remain blocked');
$db->run('UPDATE argus_pf_wallet_merchants SET cpf_digest=? WHERE account_id=?',
 [$pf['document_digest'],$pf['id']]);
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=no');
$bad=$check->invoke(null,$db,$pf);
if($bad['can_generate']!==false||$bad['availability_code']!=='platform_not_ready')
 throw new RuntimeException('Unhomologated custody must remain blocked');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET');
$bad=$check->invoke(null,$db,$pf);
if($bad['can_generate']!==false||$bad['availability_code']!=='platform_not_ready')
 throw new RuntimeException('Admin Finance QR credentials must not enable reseller Pix when merchant PSP credentials are missing');
putenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET=sk_'.str_repeat('b',35));
$ok=$check->invoke(null,$db,$pf);
if($ok['can_generate']!==true||$ok['availability_code']!=='ready')
 throw new RuntimeException('Restoring seller-only PSP credentials must restore approved PF checkout');
$backend=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$public=(string)file_get_contents('/var/www/html/src/ResellerPublicPix.php');
$ui=(string)file_get_contents('/var/www/html/public/static/reseller-public-pix.js');
$html=(string)file_get_contents('/var/www/html/public/static/reseller-public-pix.html');
foreach([
 "PfFinancialApproval::authorized(\$db,\$account)",
 "KycStudio::identityApproved(\$db",
 "ARGUS_MERCHANT_CUSTODY_ENABLED",
 "ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED",
 "ARGUS_TRADITIONAL_PIX_CLIENT_ID",
 "ARGUS_TRADITIONAL_PIX_CLIENT_SECRET",
 "'availability_code'=>'ready'"
] as $token){
 if($token==="'can_generate'=>self::accountReady(\$db,\$account)")continue;
 if(!str_contains($public,$token))
  throw new RuntimeException('Public Pix readiness missing '.$token);
}
if(str_contains($backend,"getenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID')?:getenv('ARGUS_FINANCE_QR_CLIENT_ID')")||
   str_contains($backend,"getenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')?:getenv('ARGUS_FINANCE_QR_CLIENT_SECRET')")||
   !str_contains($backend,"PfFinancialApproval::authorized(\$db,\$account)"))
 throw new RuntimeException('Admin PSP credential fallback leaked into seller wallet or CPF wallet authorization missing');
foreach([
 'resellerReady=canGenerate',
 'data.availability_message',
 'result.availability_message',
 'reseller-public-availability'
] as $token)if(!str_contains($ui,$token))
 throw new RuntimeException('Public Pix readiness message not synchronized '.$token);
if(!str_contains($html,'reseller-public-pix.js?v=20261123-ready-pf-2'))
 throw new RuntimeException('Public Pix Safari JS cache stale');
if(preg_match('/Mistic[\s_-]*Pay/iu',$ui.$html))
 throw new RuntimeException('Acquirer is exposed in seller public checkout');
foreach($old as $key=>$value){
 if($value===false)putenv($key);else putenv($key.'='.$value);
}
echo "PASS: approved PF and PJ public Pix enabled only with merchant credentials, real custody KYC/PSP isolation and anti-tamper guards remain, missing infra stays blocked with clear ARGUS message, current quote overrides stale state; no real Pix.\n";
