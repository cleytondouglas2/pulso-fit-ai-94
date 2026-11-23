<?php
declare(strict_types=1);
/** In-memory tests for the private acquirer vault; no real credentials or PSP calls. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\AcquirerControl;
use ArgusPayments\Database;
use ArgusPayments\ApiError;
putenv('ARGUS_DOC_HMAC_KEY=ARGUS_SYNTHETIC_DO_NOT_USE_OUTSIDE_OFFLINE_TESTS_2026');
putenv('ARGUS_TRADITIONAL_PIX_CLIENT_ID=pk_synthetic_acquirer_active_123456');
putenv('ARGUS_TRADITIONAL_PIX_CLIENT_SECRET=sk_synthetic_active_1234567890abcd');
$db=new Database(require '/var/www/html/config.php');
AcquirerControl::install($db);
function invokeAcq(string $method,array $args=[]):mixed {
 $r=new ReflectionMethod(AcquirerControl::class,$method);
 return $r->invokeArgs(null,$args);
}
$active=invokeAcq('current',[$db,'pix']);
if($active['key']!=='pk_synthetic_acquirer_active_123456')
 throw new RuntimeException('Active environment credentials not preserved');
$key='pk_synthetic_new_draft_123456789';
$secret='sk_'.str_repeat('synthetic',5);
invokeAcq('validatePair',['pix','misticpay',$key,$secret,'']);
invokeAcq('store',[$db,'pix','draft','misticpay','MisticPay',$key,$secret,'synthetic_actor']);
$draft=invokeAcq('current',[$db,'pix','draft']);
if($draft['key']!==$key||$draft['secret']!==$secret)
 throw new RuntimeException('Encrypted draft roundtrip failed');
$row=$db->one("SELECT key_sealed, secret_sealed FROM argus_acquirer_vault WHERE slot='pix' AND stage='draft'");
if(!$row||str_contains($row['key_sealed'],$key)||str_contains($row['secret_sealed'],$secret))
 throw new RuntimeException('Credential vault leaked plaintext');
$still=invokeAcq('current',[$db,'pix']);
if($still['key']!=='pk_synthetic_acquirer_active_123456'||$still['secret']!=='sk_synthetic_active_1234567890abcd')
 throw new RuntimeException('Saving draft replaced currently active PSP credentials');
if(AcquirerControl::effective('ARGUS_TRADITIONAL_PIX_CLIENT_ID')!=='pk_synthetic_acquirer_active_123456')
 throw new RuntimeException('Provider resolver chose a draft instead of active');
$result=invokeAcq('probe',['pix','other',$key,$secret]);
if($result['status']!=='adapter_required'||$result['http']!==null)
 throw new RuntimeException('Unknown acquiring PSP should never be queried or activated');
foreach([
 ['pix','misticpay','wrong_key','wrong_secret',''],
 ['finance','misticpay','ci_synthetic_123','cs_synthetic_123456789',''],
 ['pix','other',$key,$secret,'']
] as $bad){
 try{invokeAcq('validatePair',$bad);throw new RuntimeException('Unsafe credential pair accepted');}
 catch(ApiError $e){if($e->status!==422)throw $e;}
}
try {
 AcquirerControl::handle($db,'GET','/api/admin/acquirer/status',['id'=>'test','role'=>'reseller']);
 throw new RuntimeException('Reseller accessed Super Admin credentials');
} catch(ApiError $e){if($e->status!==403)throw $e;}
echo "PASS: encrypted draft roundtrip, active credentials unchanged, no plaintext in database, unknown provider fail-closed, 422 validation, 403 reseller denial, no external PSP traffic.\n";
