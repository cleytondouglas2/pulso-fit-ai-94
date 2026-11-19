<?php
declare(strict_types=1);
/**
 * Synthetic security regression: never tests a real client, API secret or Pix.
 * No external HTTP requests, no money transfers.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\ApiError;
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\SecurityShield;

putenv('ARGUS_SECURITY_RATE_SECRET='.str_repeat('S',64));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);SecurityShield::install($db);
$unique='fictitious-'.bin2hex(random_bytes(16));
SecurityShield::rate($db,'test_attempt',$unique,2,60);
SecurityShield::rate($db,'test_attempt',$unique,2,60);
try{
    SecurityShield::rate($db,'test_attempt',$unique,2,60);
    throw new RuntimeException('Rate limit failed open');
}catch(ApiError $e){
    if($e->status!==429)throw new RuntimeException('Rate limiter returned wrong status');
}
$rows=$db->all("SELECT bucket_key,category,hits FROM argus_security_request_buckets
    WHERE category='test_attempt'");
$found=false;
foreach($rows as $row){
    if((int)$row['hits']>=3)$found=true;
    if(str_contains((string)$row['bucket_key'],$unique)||
       !preg_match('/^[a-f0-9]{64}$/D',(string)$row['bucket_key']))
        throw new RuntimeException('Raw identifier leaked into a rate-limit table');
}
if(!$found)throw new RuntimeException('Atomic request counter did not persist');
SecurityShield::rate($db,'test_attempt','other-'.bin2hex(random_bytes(16)),1,60);
SecurityShield::unknownPayout($db,$unique);
$risk=$db->one("SELECT * FROM argus_security_risk_events
    WHERE category='uncertain_payout' ORDER BY event_time DESC LIMIT 1");
if(!$risk||!preg_match('/^[a-f0-9]{64}$/D',(string)$risk['subject_hash'])||
   str_contains((string)$risk['subject_hash'],$unique))
    throw new RuntimeException('Financial security audit leaked account identifier');

$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$portal=(string)file_get_contents('/var/www/html/src/Portal.php');
$wallet=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$kyc=(string)file_get_contents('/var/www/html/src/KycStudio.php');
$face=(string)file_get_contents('/var/www/html/src/FaceCapture.php');
$apache=(string)file_get_contents('/etc/apache2/conf-available/argus-security.conf');
foreach([
    "SecurityShield::register(\$db,\$email);",
    "SecurityShield::login(\$db,\$email);",
    "a.merchant_id current_merchant_id",
    "KycStudio::identityApproved(\$db,(string)\$c['account_id'])"
] as $token)if(!str_contains($portal,$token))
    throw new RuntimeException('Portal abuse/legacy merchant guard missing');
foreach([
    "SecurityShield::merchant(\$db,(string)\$account['id'],'charge')",
    "SecurityShield::merchant(\$db,(string)\$account['id'],'withdraw')",
    "SecurityShield::unknownPayout(\$db,\$accountId)",
    "ARGUS_TRADITIONAL_PIX_CLIENT_ID",
    "ARGUS_TRADITIONAL_PIX_CLIENT_SECRET",
    "ARGUS_MERCHANT_CUSTODY_ENABLED",
    "ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED",
    "ARGUS_PAYOUTS_ENABLED",
    "KycStudio::identityApproved"
] as $token)if(!str_contains($wallet,$token))
    throw new RuntimeException('Finance hardening guard missing');
if(str_contains($wallet,"getenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID')?:getenv('ARGUS_FINANCE_QR_CLIENT_ID')")||
   str_contains($wallet,"getenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET')?:getenv('ARGUS_FINANCE_QR_CLIENT_SECRET')"))
    throw new RuntimeException('Finance provider credential fallback was not removed');
foreach([
    'X-Frame-Options "DENY"','Referrer-Policy "no-referrer"',
    'X-Content-Type-Options "nosniff"','Strict-Transport-Security',
    'Permissions-Policy','Content-Security-Policy',
    'form-action','object-src','ARGUS_PRIVATE','Cache-Control "private, no-store',
    'Options -Indexes', 'LimitRequestBody 8388608',
    'Cross-Origin-Resource-Policy "same-origin"',
    'Require all denied'
] as $token)if(!str_contains($apache,$token))
    throw new RuntimeException('HTTP security policy missing: '.$token);
foreach([
    'sodium_crypto_secretbox','argus_kyc_encrypted_documents',
    'document_viewed','Content-Disposition: '
] as $token)if(!str_contains($kyc,$token))
    throw new RuntimeException('Existing protected KYC access changed unexpectedly');
if(!str_contains($face,"'bank_grade_liveness'=>false")||
   !str_contains($face,"'identity_verified'=>false"))
    throw new RuntimeException('Uncertified camera capture must not authorize finances');
if(!str_contains($gateway,"require_once __DIR__ . '/SecurityShield.php'"))
    throw new RuntimeException('Gateway does not load security middleware');
echo "PASS: HMAC-only atomic abuse limits, private incidents, admin browser headers, protected KYC and merchant financial isolation, no provider credential crossover.\n";
