<?php
declare(strict_types=1);
/**
 * Reproduces the exact production HTTP 500 at 23:03:33:
 * SecurityShield::rate rejected 'reseller_public_create_'.$code
 * because categories permit ONLY [a-z_]{3,40}.
 *
 * This test exercises the real private rate() against a disposable local
 * sqlite database. It NEVER triggers MerchantWallet::create or PSP calls.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\ResellerPublicPix as PublicPix;
use ArgusPayments\ApiError;
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
putenv('ARGUS_SECURITY_RATE_SECRET='.str_repeat('Z',64));
$guard=new ReflectionMethod(PublicPix::class,'rate');
$linkA=bin2hex(random_bytes(16));
$linkB=bin2hex(random_bytes(16));
for($i=0;$i<25;$i++)$guard->invoke(null,$db,$linkA);
try{
 $guard->invoke(null,$db,$linkA);
 throw new RuntimeException('Public checkout burst guard unexpectedly disabled');
}catch(ApiError $e){
 if($e->status!==429)throw $e;
}
$guard->invoke(null,$db,$linkB);
$rows=$db->all('SELECT bucket_key,category,hits FROM argus_security_request_buckets');
if(count($rows)!==4)throw new RuntimeException('Expected two scoped buckets per reseller link');
$categories=[];
foreach($rows as $row){
 if(!preg_match('/^[a-f0-9]{64}$/D',(string)$row['bucket_key']))
  throw new RuntimeException('Rate limit key not hashed');
 if(str_contains((string)$row['bucket_key'],$linkA)||
    str_contains((string)$row['bucket_key'],$linkB))
  throw new RuntimeException('Public seller URL code leaked into throttle record');
 if(!in_array($row['category'],['seller_pix_burst','seller_pix_sustained'],true))
  throw new RuntimeException('Rate limit category invalid');
 $categories[$row['category']]=true;
}
if(count($categories)!==2)throw new RuntimeException('Both time windows must be enforced');
$source=(string)file_get_contents('/var/www/html/src/ResellerPublicPix.php');
$script=(string)file_get_contents('/var/www/html/public/static/reseller-public-pix.js');
$html=(string)file_get_contents('/var/www/html/public/static/reseller-public-pix.html');
if(!str_contains($source,"SecurityShield::rate(\$db,'seller_pix_burst',\$subject,25,60)")||
   !str_contains($source,"SecurityShield::rate(\$db,'seller_pix_sustained',\$subject,100,600)")||
   str_contains($source,"'reseller_public_create_'.\$code"))
 throw new RuntimeException('The exact production 500 is still reachable');
if(!str_contains($script,'/^\\/e\\/[a-f0-9]{32}\\/create$/.test(path)')||
   !str_contains($html,'reseller-public-pix.js?v=20261123-security-rate-3'))
 throw new RuntimeException('POST create error reporting or mobile JS cache not corrected');
foreach(['MisticPay','Mistic Pay'] as $private)
 if(stripos($script,$private)!==false||stripos($html,$private)!==false)
  throw new RuntimeException('Private acquiring brand exposed in public checkout');
echo "PASS: production HTTP 500 invalid throttle category fixed; 25 valid seller Pix requests, 26th HTTP 429, another seller unaffected, HMAC-only keys, clear POST error, no real Pix.\n";
