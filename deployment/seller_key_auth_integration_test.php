<?php
declare(strict_types=1);

/**
 * Offline end-to-end credential checks against the actual Argus auth methods.
 * Uses only the build's isolated SQLite fixture: no production tokens, balances,
 * network requests, provider API requests, Pix issuance or money transfers.
 */
require_once '/var/www/html/src/Gateway.php';

use ArgusPayments\Database;
use ArgusPayments\Admin;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio;
use ArgusPayments\MerchantWallet;
use ArgusPayments\ApiError;

$db=new Database(require '/var/www/html/config.php');
$db->installAndSeed();
Admin::install($db);
Portal::install($db);
KycStudio::install($db);
MerchantWallet::install($db);

$users=[];
foreach([1,2] as $number){
    $id=bin2hex(random_bytes(16));
    $merchantId='mer_'.bin2hex(random_bytes(10));
    $email='seller-test-'.$number.'-'.substr($id,0,10).'@example.invalid';
    $db->run('INSERT INTO b2b_merchants
        (id,legal_name,cnpj,email,misticpay_email,commission_bps,status,created_at,reviewed_at)
        VALUES(?,?,?,?,?,?,?,?,?)',[
        $merchantId,'TEST SELLER '.$number,substr($id,0,14),$email,$email,150,
        'approved_live',Database::stamp(),Database::stamp()
    ]);
    $db->run('INSERT INTO argus_portal_accounts
        (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
        $id,'PJ','Test Seller '.$number,$email,hash('sha256',$id),'0000',
        'synthetic-not-for-login','approved',$merchantId,Database::stamp(),Database::stamp()
    ]);
    $db->run('INSERT INTO argus_kyc_review_events
        (id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at)
        VALUES(?,?,?,?,?,?,?,?)',[
        bin2hex(random_bytes(16)),$id,'synthetic-test','superadmin',
        'identity_approved','TEST ONLY', '',Database::stamp()
    ]);
    $public='agp_live_'.bin2hex(random_bytes(12));
    $secret='ags_live_'.bin2hex(random_bytes(32));
    $keyId=bin2hex(random_bytes(16));
    $db->run('INSERT INTO argus_portal_keys
        (id,account_id,merchant_id,public_key,secret_hash,created_at,revoked_at)
        VALUES(?,?,?,?,?,?,?)',[
        $keyId,$id,$merchantId,$public,hash('sha256',$secret),Database::stamp(),null
    ]);
    $users[]=['id'=>$id,'merchant'=>$merchantId,'public'=>$public,
        'secret'=>$secret,'key'=>$keyId];
}
$walletAuth=new ReflectionMethod(MerchantWallet::class,'auth');
$legacyAuth=new ReflectionMethod(Portal::class,'authPair');

$setHeaders=static function(string $public,string $secret):void{
    $_SERVER['HTTP_X_ARGUS_KEY']=$public;
    $_SERVER['HTTP_X_ARGUS_SECRET']=$secret;
};
$deny=static function(callable $fn,int $status,string $label):void{
    try{$fn();}catch(ApiError $e){
        if($e->status!==$status)throw new RuntimeException(
            $label.' returned unexpected HTTP '.$e->status);
        return;
    }
    throw new RuntimeException($label.' incorrectly accepted credentials');
};

// Two distinct sellers must authenticate to only their assigned records.
foreach($users as $u){
    $setHeaders($u['public'],$u['secret']);
    $account=$walletAuth->invoke(null,$db);
    if($account['id']!==$u['id']||$account['merchant_id']!==$u['merchant'])
        throw new RuntimeException('MerchantWallet v2 authenticated foreign seller');
    $merchant=$legacyAuth->invoke(null,$db);
    if($merchant['id']!==$u['merchant'])
        throw new RuntimeException('Portal v1 key pair authenticated foreign merchant');
}

// Wrong secret must fail even when a valid public key is supplied.
$setHeaders($users[0]['public'],$users[1]['secret']);
$deny(static fn()=> $walletAuth->invoke(null,$db),401,'V2 wrong-secret');
$deny(static fn()=> $legacyAuth->invoke(null,$db),403,'V1 wrong-secret');

// Missing and malformed auth must fail before any wallet operation.
unset($_SERVER['HTTP_X_ARGUS_SECRET']);
$deny(static fn()=> $walletAuth->invoke(null,$db),401,'V2 missing-secret');
$setHeaders('invalid','invalid');
$deny(static fn()=> $walletAuth->invoke(null,$db),401,'V2 malformed-keys');

// Revoking seller A's token must not affect seller B's own token.
$db->run('UPDATE argus_portal_keys SET revoked_at=? WHERE id=?',
    [Database::stamp(),$users[0]['key']]);
$setHeaders($users[0]['public'],$users[0]['secret']);
$deny(static fn()=> $walletAuth->invoke(null,$db),401,'V2 revoked-key');
$deny(static fn()=> $legacyAuth->invoke(null,$db),403,'V1 revoked-key');
$setHeaders($users[1]['public'],$users[1]['secret']);
if($walletAuth->invoke(null,$db)['id']!==$users[1]['id'])
    throw new RuntimeException('Revocation of A broke B');

// Account suspension must reject an otherwise valid seller token.
$db->run("UPDATE argus_portal_accounts SET status='suspended' WHERE id=?",
    [$users[1]['id']]);
$deny(static fn()=> $walletAuth->invoke(null,$db),403,'V2 suspended-account');
$deny(static fn()=> $legacyAuth->invoke(null,$db),403,'V1 suspended-account');
unset($_SERVER['HTTP_X_ARGUS_KEY'],$_SERVER['HTTP_X_ARGUS_SECRET']);
echo "PASS: real Argus v1/v2 credential auth methods accept synthetic valid seller pairs, reject wrong/missing/revoked/suspended pairs, and preserve account isolation. No provider calls.\n";
