<?php
declare(strict_types=1);
// Safe synthetic end-to-end contract test: never call the PSP or create real Pix.
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\Admin;
use ArgusPayments\Portal;
use ArgusPayments\MerchantWallet;
use ArgusPayments\KycStudio;
use ArgusPayments\IdentityProfile;
use ArgusPayments\ApiError;

$db=new Database(require '/var/www/html/config.php');
$db->installAndSeed();
Admin::install($db);
Portal::install($db);
KycStudio::install($db);
MerchantWallet::install($db);
$secret=str_repeat('payout-test-secret-only-',3);
putenv('ARGUS_DOC_HMAC_KEY='.$secret);
$document='52998224725'; // a checksum-valid synthetic example, not a real user credential
$accountId=bin2hex(random_bytes(16));
$merchant='mer_'.bin2hex(random_bytes(10));
$mail='test-'.$accountId.'@example.invalid';
$db->run("INSERT INTO b2b_merchants (id,legal_name,cnpj,email,misticpay_email,
    commission_bps,status,created_at,reviewed_at)
    VALUES(?,?,?,?,?,?,?,?,?)",[
    $merchant,'TEST REGISTERED SELLER',substr($accountId,0,14),$mail,$mail,
    150,'approved_live',Database::stamp(),Database::stamp()
]);
$db->run("INSERT INTO argus_portal_accounts
    (id,account_type,display_name,email,document_digest,document_last4,
     password_hash,status,merchant_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)",[
    $accountId,'PF','Revendedor Exemplo',$mail,hash_hmac('sha256',$document,$secret),
    substr($document,-4),'no-login-test','approved',$merchant,Database::stamp(),Database::stamp()
]);
$db->run('INSERT INTO argus_kyc_review_events
    (id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
    VALUES(?,?,?,?,?,?,?,?)',[
    bin2hex(random_bytes(16)),$accountId,'synthetic','superadmin',
    'identity_approved','Offline test','',Database::stamp()
]);
IdentityProfile::store($db,'portal',$accountId,'PF','Revendedor Exemplo',$document);
$account=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$accountId]);
$identity=IdentityProfile::sellerForPayout($db,$account);
if($identity['legal_name']!=='Revendedor Exemplo'||
   $identity['account_type']!=='PF'||$identity['document_number']!==$document)
    throw new RuntimeException('Seller identity was not loaded from verified portal record');

$public='agp_live_'.bin2hex(random_bytes(12));
$apiSecret='ags_live_'.bin2hex(random_bytes(32));
$keyId=bin2hex(random_bytes(16));
$db->run('INSERT INTO argus_portal_keys
 (id,account_id,merchant_id,public_key,secret_hash,created_at,revoked_at)
 VALUES(?,?,?,?,?,?,?)',[
    $keyId,$accountId,$merchant,$public,hash('sha256',$apiSecret),Database::stamp(),null
]);
$_SERVER['HTTP_X_ARGUS_KEY']=$public;
$_SERVER['HTTP_X_ARGUS_SECRET']=$apiSecret;
$auth=new ReflectionMethod(MerchantWallet::class,'auth');
$deny=static function(callable $callback,int $expected):void{
    try{$callback();}
    catch(ApiError $e){if($e->status===$expected)return;throw $e;}
    throw new RuntimeException('Incorrectly accepted key or destination override');
};
$deny(static fn()=> $auth->invoke(null,$db,true),403); // legacy charge-only key
$db->run('INSERT INTO argus_portal_key_permissions
    (key_id,account_id,allow_withdrawal,created_at) VALUES(?,?,?,?)',[
    $keyId,$accountId,1,Database::stamp()
]);
$authorized=$auth->invoke(null,$db,true);
if($authorized['id']!==$accountId)throw new RuntimeException('Authenticated wrong wallet');
$prepare=new ReflectionMethod(MerchantWallet::class,'prepareApiWithdraw');
$body=$prepare->invoke(null,$db,$authorized,
    ['amount_cents'=>1000,'confirm'=>true],'unique-seller-withdrawal-001');
if($body['pix_key']!==$document||$body['pix_key_type']!=='cpf'||
   $body['amount_cents']!==1000||$body['idempotency_key']!=='unique-seller-withdrawal-001')
    throw new RuntimeException('Withdrawal did not enforce verified seller Pix key');
$deny(static fn()=> $prepare->invoke(null,$db,$authorized,[
    'amount_cents'=>1000,'confirm'=>true,'pix_key'=>'victim@example.com'
],'unique-seller-withdrawal-002'),422);
$deny(static fn()=> $prepare->invoke(null,$db,$authorized,[
    'amount_cents'=>1000,'confirm'=>true,'account_id'=>bin2hex(random_bytes(16))
],'unique-seller-withdrawal-003'),422);
$db->run('UPDATE argus_portal_key_permissions SET allow_withdrawal=0 WHERE key_id=?',[$keyId]);
$deny(static fn()=> $auth->invoke(null,$db,true),403);
if($auth->invoke(null,$db,false)['id']!==$accountId)
    throw new RuntimeException('Disabling payout broke charge-only authentication');
$db->run('UPDATE argus_portal_key_permissions SET allow_withdrawal=1 WHERE key_id=?',[$keyId]);
$db->run("UPDATE argus_portal_keys SET revoked_at=? WHERE id=?",[Database::stamp(),$keyId]);
$deny(static fn()=> $auth->invoke(null,$db,true),401);
unset($_SERVER['HTTP_X_ARGUS_KEY'],$_SERVER['HTTP_X_ARGUS_SECRET']);

$merchantSrc=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$portalSrc=(string)file_get_contents('/var/www/html/src/Portal.php');
$client=(string)file_get_contents('/var/www/html/public/static/client.html');
$docs=(string)file_get_contents('/var/www/html/public/static/merchant-docs.js');
foreach([
    "'/api/v2/wallet/withdrawals'",
    "self::sendWithdraw(\$db",
    "'ARGUS_MISTICPAY_PAYOUT_PK'",
    "'ARGUS_MISTICPAY_PAYOUT_SK'",
    "ARGUS_TRADITIONAL_PIX_CLIENT_ID",
    "ARGUS_MERCHANT_CUSTODY_ENABLED",
    "ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED",
    "ARGUS_PAYOUTS_ENABLED"
] as $needle)
    if(!str_contains($merchantSrc,$needle))
        throw new RuntimeException('Central provider/wallet proxy safeguard missing: '.$needle);
foreach(['argus_portal_key_permissions','allow_withdrawal','hash(\'sha256\',$secret)']
    as $needle)
    if(!str_contains($portalSrc,$needle))
        throw new RuntimeException('Self-issue key permission contract missing: '.$needle);
if(!str_contains($client,'id="allow-api-withdraw"')||
   !str_contains($docs,'/api/v2/wallet/withdrawals'))
    throw new RuntimeException('Seller payout key opt-in / public API docs missing');
echo "PASS: seller-issued API key authorizes central Argus payout proxy only after explicit scope, uses own encrypted CPF, forbids destination overrides, and revocation blocks payment access. No PSP calls.\n";
