<?php
declare(strict_types=1);
/**
 * Regression: allow only approved ARGUS Pay reset origins.
 * No API calls, email sending, actual password changes, or real accounts.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\PortalPasswordReset;
use ArgusPayments\ApiError;
$method=new ReflectionMethod(PortalPasswordReset::class,'origin');
$base='https://app.arguspay.com.br';
$oldOrigin=$_SERVER['HTTP_ORIGIN']??null;
$oldSite=$_SERVER['HTTP_SEC_FETCH_SITE']??null;
$allowed=[
  'https://arguspay.com.br',
  'https://www.arguspay.com.br',
  'https://app.arguspay.com.br',
  'https://argus-payments-oregon-testes.onrender.com',
  'https://argus-payments-b2b-misticpay.onrender.com',
  'https://argus-payments-php-demo.onrender.com',
];
$blocked=[
  'https://attacker.example',
  'https://argus-payments-oregon-testes.onrender.com.attacker.example',
  'https://other-app.onrender.com',
  'http://argus-payments-oregon-testes.onrender.com',
  'https://argus-payments-oregon-testes.onrender.com:444',
  'https://argus-payments-oregon-testes.onrender.com@attacker.example',
];
try{
  foreach($allowed as $origin){
    $_SERVER['HTTP_ORIGIN']=$origin;
    $_SERVER['HTTP_SEC_FETCH_SITE']='same-origin';
    $method->invoke(null,$base);
  }
  foreach($blocked as $origin){
    $_SERVER['HTTP_ORIGIN']=$origin;
    $_SERVER['HTTP_SEC_FETCH_SITE']='same-origin';
    try{$method->invoke(null,$base);throw new RuntimeException('Accepted untrusted reset origin '.$origin);}
    catch(ApiError $e){if($e->status!==403)throw $e;}
  }
  // Cross-site requests remain blocked even with an otherwise listed Origin.
  $_SERVER['HTTP_ORIGIN']='https://argus-payments-oregon-testes.onrender.com';
  $_SERVER['HTTP_SEC_FETCH_SITE']='cross-site';
  try{$method->invoke(null,$base);throw new RuntimeException('Cross-site origin bypass');}
  catch(ApiError $e){if($e->status!==403)throw $e;}
  // No Origin is accepted only for a same-origin browser fetch.
  unset($_SERVER['HTTP_ORIGIN']);
  $_SERVER['HTTP_SEC_FETCH_SITE']='same-origin';
  $method->invoke(null,$base);
  $_SERVER['HTTP_SEC_FETCH_SITE']='same-site';
  try{$method->invoke(null,$base);throw new RuntimeException('Unverified same-site reset');}
  catch(ApiError $e){if($e->status!==403)throw $e;}
}finally{
  if($oldOrigin===null)unset($_SERVER['HTTP_ORIGIN']);else $_SERVER['HTTP_ORIGIN']=$oldOrigin;
  if($oldSite===null)unset($_SERVER['HTTP_SEC_FETCH_SITE']);else $_SERVER['HTTP_SEC_FETCH_SITE']=$oldSite;
}
echo "PASS: approved ArgusPay and exact Render origins; cross-site and untrusted origins rejected\n";
