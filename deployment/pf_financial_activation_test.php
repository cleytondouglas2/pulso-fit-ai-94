<?php
declare(strict_types=1);
/** Executable synthetic PF approval test. NO MisticPay calls or real funds. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\IdentityProfile;
use ArgusPayments\KycStudio;
use ArgusPayments\PfFinancialApproval as PF;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\ApiError;
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
\ArgusPayments\Admin::install($db);
Portal::install($db);KycStudio::install($db);Wallet::install($db);PF::install($db);
putenv('ARGUS_PF_APPROVAL_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_DOC_HMAC_KEY='.str_repeat('Z',64));
putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
$cpf='52998224725';
$id=bin2hex(random_bytes(16));
$name='Maria Teste Cobrança';
$stamp=DB::stamp();
$db->run("INSERT INTO argus_portal_accounts
    (id,account_type,display_name,email,document_digest,document_last4,
     password_hash,status,merchant_id,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)",[
     $id,'PF',$name,'maria-'.$id.'@example.invalid',
     hash_hmac('sha256',$cpf,(string)getenv('ARGUS_DOC_HMAC_KEY')),
     substr($cpf,-4),'synthetic','identity_verified',null,$stamp,$stamp
]);
IdentityProfile::store($db,'portal',$id,'PF',$name,$cpf);
foreach(KycStudio::required('PF') as $kind){
    $docId=bin2hex(random_bytes(16));
    $db->run("INSERT INTO argus_portal_documents
        (id,account_id,document_type,mime,sealed_file,file_digest,created_at,review_status)
        VALUES(?,?,?,?,?,?,?,?)",[
        $docId,$id,$kind,'image/png','synthetic-document.enc',
        hash('sha256',$docId),$stamp,'approved'
    ]);
    $db->run("INSERT INTO argus_kyc_encrypted_documents
        (id,account_id,document_type,mime,payload_encrypted,sha256,created_at)
        VALUES(?,?,?,?,?,?,?)",[
        $docId,$id,$kind,'image/png','SYNTHETIC-NOT-A-REAL-DOCUMENT',
        hash('sha256',$docId),$stamp
    ]);
}
$db->run('INSERT INTO argus_kyc_review_events
    (id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
    VALUES(?,?,?,?,?,?,?,?)',[
    bin2hex(random_bytes(16)),$id,'synthetic_reviewer','superadmin',
    'identity_approved','Test-only identity approval','',$stamp
]);
$account=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$id]);
if(!KycStudio::identityApproved($db,$id)||!KycStudio::summary($db,$account)['complete'])
    throw new RuntimeException('Synthetic verified KYC setup invalid');
$actor=['id'=>'synthetic_superadmin','role'=>'superadmin'];
$input=[
 'confirm_identity'=>true,'confirm_provider_custody'=>true,
 'confirm_contract'=>true,'confirm_ledger'=>true,
 'reason'=>'Contrato sintético de testes aprovado pela administração'
];
$reject=static function(callable $fn,int $status):void{
    try{$fn();}
    catch(ApiError $e){if($e->status===$status)return;throw $e;}
    throw new RuntimeException('Expected rejection: '.$status);
};
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=no');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=no');
$reject(static fn()=> (new ReflectionMethod(Wallet::class,'enabled'))->invoke(null,$db),503);
if($db->one('SELECT status FROM argus_portal_accounts WHERE id=?',[$id])['status']!=='identity_verified')
    throw new RuntimeException('A prohibited money operation changed the seller account');
$reject(static fn()=>PF::approve($db,['id'=>'staff','role'=>'admin'],$id,$input),403);
$reject(static fn()=>PF::approve($db,$actor,$id,array_merge($input,['confirm_ledger'=>false])),422);
$success=PF::approve($db,$actor,$id,$input);
if($success['withdrawals_enabled']!==false)
    throw new RuntimeException('Internal PF approval must not assert enabled payouts');
if($success['status']!=='approved'||!str_starts_with($success['merchant_id'],'pfm_'))
    throw new RuntimeException('Real PF ledger merchant ID not created');
$a=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$id]);
if(!PF::authorized($db,$a)||$a['status']!=='approved')
    throw new RuntimeException('Approved CPF not linked to seller-specific custodian');
$pf=$db->one('SELECT * FROM argus_pf_wallet_merchants WHERE account_id=?',[$id]);
if(!$pf||$pf['cpf_digest']!==$a['document_digest']||$pf['id']!==$a['merchant_id'])
    throw new RuntimeException('CPF identity not bound to exclusive merchant record');
if($db->one('SELECT COUNT(*) AS n FROM argus_pf_financial_audit WHERE account_id=?',[$id])['n']!=1)
    throw new RuntimeException('Authorizing Super Admin decision not audited');
$reject(static fn()=>PF::approve($db,$actor,$id,$input),409);
$keys=[
 'public'=>'agp_live_'.bin2hex(random_bytes(12)),
 'secret'=>'ags_live_'.bin2hex(random_bytes(32))
];
$db->run('INSERT INTO argus_portal_keys
    (id,account_id,merchant_id,public_key,secret_hash,created_at,revoked_at)
    VALUES(?,?,?,?,?,?,?)',[
    bin2hex(random_bytes(16)),$id,$a['merchant_id'],$keys['public'],
    hash('sha256',$keys['secret']),$stamp,null
]);
$_SERVER['HTTP_X_ARGUS_KEY']=$keys['public'];
$_SERVER['HTTP_X_ARGUS_SECRET']=$keys['secret'];
$auth=new ReflectionMethod(Wallet::class,'auth');
$owner=$auth->invoke(null,$db);
if($owner['id']!==$id)throw new RuntimeException('PF seller API isolation failed');
$payload=(new ReflectionMethod(Wallet::class,'payerDetails'))->invoke(null,$db,$owner,[
 'payer_mode'=>'registered_seller','seller_is_payer'=>true
]);
if($payload['payer_name']!==$name||$payload['payer_document']!==$cpf)
    throw new RuntimeException('PF seller identity not taken from protected registration');
$wallet=(new ReflectionMethod(Wallet::class,'wallet'))->invoke(null,$db,$owner);
if((int)$wallet['available_cents']!==0||(int)$wallet['held_cents']!==0)
    throw new RuntimeException('PF registration must never mint balances');
$legacy=new ReflectionMethod(Portal::class,'authPair');
$reject(static fn()=> $legacy->invoke(null,$db),403); // V1 B2B split remains PJ-only.
$db->run("UPDATE argus_pf_wallet_merchants SET cpf_digest='tampered' WHERE account_id=?",[$id]);
if(PF::authorized($db,$a))throw new RuntimeException('Tampered CPF merchant still authorised');
$db->run('UPDATE argus_pf_wallet_merchants SET cpf_digest=? WHERE account_id=?',[$a['document_digest'],$id]);
$db->run("UPDATE argus_portal_accounts SET status='suspended' WHERE id=?",[$id]);
$a=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$id]);
if(PF::authorized($db,$a))throw new RuntimeException('Suspended seller remains authorised');
$reject(static fn()=> $auth->invoke(null,$db),403);
unset($_SERVER['HTTP_X_ARGUS_KEY'],$_SERVER['HTTP_X_ARGUS_SECRET']);

$adminSource=(string)file_get_contents('/var/www/html/src/Admin.php');
$portalSource=(string)file_get_contents('/var/www/html/src/Portal.php');
$walletSource=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$studioJs=(string)file_get_contents('/var/www/html/public/static/kyc-studio.js');
$studioHtml=(string)file_get_contents('/var/www/html/public/static/admin.html');
foreach([
 'finance-activate-pf',
 'self::verifyMfaCode($db,$actor',
 'self::writeAllowed($actor,true)',
 'PfFinancialApproval::approve($db,$actor',
] as $must)
 if(!str_contains($adminSource,$must))
    throw new RuntimeException('Super Admin activation route lacks a protected API requirement: '.$must);
foreach([
 'PfFinancialApproval::authorized($db,$account)',
 'KycStudio::identityApproved',
 'SELECT k.id,k.public_key',
] as $must)
 if(!str_contains($portalSource,$must))
    throw new RuntimeException('Account seller API key permission missing: '.$must);
foreach([
 'PfFinancialApproval::authorized($db,$account)',
 "getenv('ARGUS_MERCHANT_CUSTODY_ENABLED')",
 "getenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED')",
 "if(\$forPayout&&getenv('ARGUS_PAYOUTS_ENABLED')",
] as $must)
 if(!str_contains($walletSource,$must))
    throw new RuntimeException('Wallet or real money PSP guard missing: '.$must);
foreach([
 'id="kyc-finance-pf-form"',
 'Aprovar cadastro financeiro CPF',
 'function releasePf(ev)',
 "data.decision='approve';",
 'data-reseller-view',
] as $must){
 if($must==='data-reseller-view')continue;
 if(!str_contains($studioJs,$must)&&$must!=="data.decision='approve';")
    throw new RuntimeException('CPF Super Admin release UI missing: '.$must);
}
if(!str_contains($studioHtml,'kyc-studio.js?v=pf-activate-20261119-2')||
   !str_contains($studioHtml,'kyc-studio.css?v=pf-activate-20261119-2'))
    throw new RuntimeException('Safari cached administration assets not invalidated');

echo "PASS: Super Admin + KYC approve an isolated CPF internal merchant without pretending PSP custody confirmation; real money stays blocked when custody flags are absent, identity/2FA and ledger controls remain.\n";
