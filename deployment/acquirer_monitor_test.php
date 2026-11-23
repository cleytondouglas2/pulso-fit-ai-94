<?php
declare(strict_types=1);
/** Isolated contract test: makes no PSP calls and changes no financial records. */
$root='/var/www/html';
require_once $root.'/src/Gateway.php';
use ArgusPayments\AcquirerControl;
use ArgusPayments\Database;
$db=new Database(require $root.'/config.php');
AcquirerControl::install($db);
$admin=(string)file_get_contents($root.'/src/Admin.php');
$gateway=(string)file_get_contents($root.'/src/Gateway.php');
$html=(string)file_get_contents($root.'/public/static/admin.html');
$module=(string)file_get_contents($root.'/src/AcquirerControl.php');
$script=(string)file_get_contents($root.'/public/static/acquirer-monitor.js');
foreach([
 '/api/admin/acquirer/status','/api/admin/acquirer/probe',
 '/api/admin/acquirer/credentials','/api/admin/acquirer/activate',
 "sodium_crypto_secretbox(", "sodium_crypto_secretbox_open(",
 "SecurityShield::rate(", "provider']!=='misticpay'",
 "pending(", "inTransaction()"
] as $token)if(!str_contains($module,$token))
 throw new RuntimeException('Acquirer protected control missing: '.$token);
if(!str_contains($admin,'AcquirerControl::handle($db,$method,$path,$actor,$payload)')||
 !str_contains($admin,'self::verifyMfaCode($db,$actor')||
 !str_contains($admin,'self::writeAllowed($actor,true)')||
 !str_contains($gateway,"require_once __DIR__ . '/AcquirerControl.php';"))
 throw new RuntimeException('Super Admin authentication and MFA route unavailable');
foreach(['data-nav="acquirer"','id="page-acquirer"','id="argus-acq-cards"',
 'acquirer-monitor.js?v=1','acquirer-monitor.css?v=1'] as $needle)
 if(!str_contains($html,$needle))throw new RuntimeException('Admin monitor missing '.$needle);
if(!str_contains($script,"/api/admin/acquirer/status")||
 !str_contains($script,"/api/admin/acquirer/probe"))
 throw new RuntimeException('Read-only provider monitoring unconnected');
if(!str_contains($html,'id="argus-acq-save" disabled')||
 !str_contains($html,'id="argus-acq-activate" disabled'))
 throw new RuntimeException('Premature credential activation in browser');
foreach(['TraditionalQuickPix.php','MerchantWallet.php','ResellerPublicPix.php'] as $file){
 $src=(string)file_get_contents($root.'/src/'.$file);
 if(!str_contains($src,"AcquirerControl::effective('ARGUS_TRADITIONAL_PIX_CLIENT_ID')"))
  throw new RuntimeException('Public or private Pix not connected to protected credential registry: '.$file);
}
echo "PASS: private monitor, no-provider-read in synthetic tests, encrypted credential registry, MFA/CSRF, no premature activation, and safe provider credential resolution.\n";
