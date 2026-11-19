<?php
declare(strict_types=1);
/**
 * E2E contract with synthetic PSP response, never money or network.
 * Exercises verified seller key, payer selection, MisticPay request/response
 * parsers, owner-scoped persistent QR listing and paid-only credit.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\MerchantWallet as Wallet;
use ArgusPayments\KycStudio;
use ArgusPayments\IdentityProfile;
use ArgusPayments\TraditionalQuickPix;
use ArgusPayments\ApiError;

$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
\ArgusPayments\Admin::install($db);
Portal::install($db);KycStudio::install($db);Wallet::install($db);

putenv('ARGUS_MERCHANT_UNIT_TEST=local-sqlite-only');
putenv('ARGUS_MERCHANT_CUSTODY_ENABLED=yes');
putenv('ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED=yes');
putenv('ARGUS_DOC_HMAC_KEY='.str_repeat('argus-test-hmac-only-',3));

$doc='52998224725'; // checksum-valid synthetic fixture
if(!IdentityProfile::validCpf($doc))throw new RuntimeException('Synthetic document invalid');
$sellers=[];
foreach([1,2] as $n){
    $id=bin2hex(random_bytes(16));
    $merchant='mer_'.bin2hex(random_bytes(10));
    $mail='sandbox-seller-'.$n.'-'.$id.'@example.invalid';
    $digest=hash_hmac('sha256',$doc,(string)getenv('ARGUS_DOC_HMAC_KEY'));
    $db->run("INSERT INTO b2b_merchants(id,legal_name,cnpj,email,misticpay_email,
        commission_bps,status,created_at,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?)",[
        $merchant,'Synthetic Seller '.$n,substr($id,0,14),$mail,$mail,
        150,'approved_live',DB::stamp(),DB::stamp()
    ]);
    // Unique source document hashes per account are not necessary in SQLite,
    // but the identity belongs to the logged-in owner and is never supplied by a client.
    $registeredDoc=$n===1?$doc:'11144477735';
    if(!IdentityProfile::validCpf($registeredDoc))throw new RuntimeException('Synthetic second document invalid');
    $digest=hash_hmac('sha256',$registeredDoc,(string)getenv('ARGUS_DOC_HMAC_KEY'));
    $db->run("INSERT INTO argus_portal_accounts
        (id,account_type,display_name,email,document_digest,document_last4,
         password_hash,status,merchant_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[
        $id,'PF','Vendedor Teste '.$n,$mail,$digest,substr($registeredDoc,-4),
        'synthetic-no-login','approved',$merchant,DB::stamp(),DB::stamp()
    ]);
    $db->run("INSERT INTO argus_kyc_review_events(id,account_id,reviewer_id,reviewer_role,
        event_type,note,document_types,created_at) VALUES(?,?,?,?,?,?,?,?)",[
        bin2hex(random_bytes(16)),$id,'synthetic','superadmin','identity_approved',
        'offline fixture','',DB::stamp()
    ]);
    IdentityProfile::store($db,'portal',$id,'PF','Vendedor Teste '.$n,$registeredDoc);
    $key='agp_live_'.bin2hex(random_bytes(12));
    $secret='ags_live_'.bin2hex(random_bytes(32));
    $db->run('INSERT INTO argus_portal_keys
        (id,account_id,merchant_id,public_key,secret_hash,created_at,revoked_at)
        VALUES(?,?,?,?,?,?,?)',[
        bin2hex(random_bytes(16)),$id,$merchant,$key,hash('sha256',$secret),DB::stamp(),null
    ]);
    $sellers[]=['id'=>$id,'merchant'=>$merchant,'document'=>$registeredDoc,
        'key'=>$key,'secret'=>$secret];
}
$auth=new ReflectionMethod(Wallet::class,'auth');
$resolve=new ReflectionMethod(Wallet::class,'payerDetails');
$view=new ReflectionMethod(Wallet::class,'chargePublic');
$wallet=new ReflectionMethod(Wallet::class,'wallet');
$apply=new ReflectionMethod(Wallet::class,'applyVerifiedStatus');
$reject=static function(callable $fn,int $status):void{
    try{$fn();}catch(ApiError $e){if($e->status===$status)return;throw $e;}
    throw new RuntimeException('Invalid payer or owner unexpectedly accepted');
};
$_SERVER['HTTP_X_ARGUS_KEY']=$sellers[0]['key'];
$_SERVER['HTTP_X_ARGUS_SECRET']=$sellers[0]['secret'];
$owner=$auth->invoke(null,$db);
if($owner['id']!==$sellers[0]['id'])throw new RuntimeException('Wrong merchant signed in');
// Seller-funded deposit: legal fields are loaded from the verified owner,
// never from arbitrary values in the external caller request.
$self=$resolve->invoke(null,$db,$owner,[
 'amount_cents'=>1000,'description'=>'Deposito proprio',
 'payer_mode'=>'registered_seller','seller_is_payer'=>true
]);
if($self['payer_name']!=='Vendedor Teste 1'||
   $self['payer_document']!==$sellers[0]['document'])
    throw new RuntimeException('Seller profile not used for self-funded payment');
$reject(static fn()=> $resolve->invoke(null,$db,$owner,[
 'payer_mode'=>'registered_seller','seller_is_payer'=>false]),422);
$reject(static fn()=> $resolve->invoke(null,$db,$owner,[
 'payer_mode'=>'registered_seller','seller_is_payer'=>true,
 'payer_name'=>'Terceiro']),422);
// True customer purchase must preserve true customer payer identity.
$buyer=$resolve->invoke(null,$db,$owner,[
 'amount_cents'=>1000,'payer_name'=>'Comprador Teste',
 'payer_document'=>'11144477735','description'=>'Pedido externo'
]);
if($buyer['payer_name']!=='Comprador Teste'||
   $buyer['payer_document']!=='11144477735')
    throw new RuntimeException('Buyer identity overwritten by seller');
$id='mwc_'.bin2hex(random_bytes(16));
$providerRequest=TraditionalQuickPix::createBody(
    $buyer['amount_cents'],$buyer['payer_name'],$buyer['payer_document'],
    'qpx_'.substr($id,4),$buyer['description']);
if($providerRequest['payerName']!=='Comprador Teste'||
   $providerRequest['payerDocument']!=='11144477735'||
   (float)$providerRequest['amount']!==10.0)
    throw new RuntimeException('Incorrect PSP request payload');
$copy='00020101021226800014br.gov.bcb.pix2601synthetic_test_no_payment_520400005303986540510.00';
$response=['data'=>['transactionId'=>'offline_mock_tx_001',
    'copyPaste'=>$copy,'transactionState'=>'PENDENTE']];
$parsed=TraditionalQuickPix::readCreated($response);
if($parsed['copy']!==$copy||$parsed['status']!=='pending'||
   $parsed['provider_id']!=='tr_offline_mock_tx_001')
    throw new RuntimeException('PSP QR output not read correctly');
$wallet->invoke(null,$db,$owner);
$other=$db->one('SELECT * FROM argus_portal_accounts WHERE id=?',[$sellers[1]['id']]);
$wallet->invoke(null,$db,$other);
$db->run('INSERT INTO argus_seller_charges
 (id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,
 net_cents,description,provider_id,copy_paste,status,created_at,checked_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
 $id,$owner['id'],$owner['merchant_id'],hash('sha256','unique-order-001'),
 hash('sha256','synthetic-body'),1000,100,900,'Pedido externo',
 $parsed['provider_id'],$copy,'pending',DB::stamp(),DB::stamp()
]);
$row=$db->one('SELECT * FROM argus_seller_charges WHERE id=? AND account_id=?',
    [$id,$owner['id']]);
$public=$view->invoke(null,$row);
if($public['pix_copy_paste']!==$copy||
   $public['amount_cents']!==1000||
   $public['net_cents']!==900||
   $public['status']!=='pending')
    throw new RuntimeException('Seller QR missing in public own-charge payload');
// The authenticated seller's own portal uses the same chargePublic() method.
if($db->one('SELECT * FROM argus_seller_charges WHERE account_id=?',
  [$other['id']]))
  throw new RuntimeException('Another seller can view foreign QR');
$reject(static fn()=>Wallet::reconcile($db,$id,$other['id']),404);
$available=$db->one('SELECT available_cents FROM argus_seller_wallets WHERE account_id=?',
    [$owner['id']]);
if((int)$available['available_cents']!==0)
    throw new RuntimeException('Unpaid QR incorrectly credited wallet');
// Simulate *verified* provider settlement in the offline test only.
$apply->invoke(null,$db,$row,'paid');
$apply->invoke(null,$db,$row,'paid');
$a=$db->one('SELECT available_cents FROM argus_seller_wallets WHERE account_id=?',[$owner['id']]);
$b=$db->one('SELECT available_cents FROM argus_seller_wallets WHERE account_id=?',[$other['id']]);
if((int)$a['available_cents']!==900||(int)$b['available_cents']!==0)
    throw new RuntimeException('Settlement double-credited or leaked to another seller');
$frontend=(string)file_get_contents('/var/www/html/public/static/merchant-portal.js');
$client=(string)file_get_contents('/var/www/html/public/static/client.html');
$docs=(string)file_get_contents('/var/www/html/public/static/merchant-docs.js');
foreach(['function drawSellerPix','new QRCode(qr,','ownCharges=new Map(',
 'seller-active-pix','data-seller-open-pix','payment.seller_is_payer=true'] as $token){
 if(!str_contains($frontend,$token))
     throw new RuntimeException('External QR seller UI hook missing: '.$token);
}
if(!str_contains($client,'qrcode.min.js?v=1')||
  !str_contains($docs,'payer_mode')||
  !str_contains($docs,'/api/v2/pix/charges'))
    throw new RuntimeException('Local QR encoder / documentation missing');
echo "PASS: reseller API credentials, verified self-payer vs buyer, central PSP payload/QR mock, seller dashboard QR, isolation, fee and paid-only single credit. No money or PSP calls.\n";
