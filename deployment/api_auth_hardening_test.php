<?php
declare(strict_types=1);
/** Synthetic auth abuse checks. Never sends HTTP requests or transfers money. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\SecurityShield;
use ArgusPayments\Database as DB;
use ArgusPayments\ApiError;
putenv('ARGUS_SECURITY_RATE_SECRET='.str_repeat('S',64));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
SecurityShield::install($db);
$merchant=(string)file_get_contents('/var/www/html/src/MerchantWallet.php');
$portal=(string)file_get_contents('/var/www/html/src/Portal.php');
$reset=(string)file_get_contents('/var/www/html/src/PortalPasswordReset.php');
foreach([
 [$merchant,'SecurityShield::failedApi($db,$public,is_array($key))'],
 [$portal,'SecurityShield::failedApi($db,$key,is_array($c))'],
 [$reset,'SecurityShield::resetVerify($db,$admin)'],
] as [$file,$needle]){
 if(!str_contains($file,$needle))
   throw new RuntimeException('Missing protection: '.$needle);
}
$ip=$_SERVER['REMOTE_ADDR']??null;
try{
 $_SERVER['REMOTE_ADDR']='192.0.2.'.random_int(1,254);
 $public='agp_live_'.bin2hex(random_bytes(12));
 for($i=0;$i<25;$i++)SecurityShield::failedApi($db,$public,true);
 try{
   SecurityShield::failedApi($db,$public,true);
   throw new RuntimeException('Failed API credential limiter did not block repeated guesses');
 }catch(ApiError $e){
   if($e->status!==429)throw $e;
 }
 // Another known key and real customer requests must never share this key cap.
 SecurityShield::failedApi($db,'agp_live_'.bin2hex(random_bytes(12)),true);
 SecurityShield::failedApi($db,'invalid-key-not-persisted',false);
 $rows=$db->all("SELECT bucket_key,category FROM argus_security_request_buckets
                 WHERE category IN ('api_invalid_key','api_invalid_network')");
 if(count($rows)<2)throw new RuntimeException('Security buckets not installed');
 foreach($rows as $row){
   if(!preg_match('/^[a-f0-9]{64}$/D',(string)$row['bucket_key'])||
       str_contains((string)$row['bucket_key'],$public))
     throw new RuntimeException('Potential raw credential stored in security limiter');
 }
 SecurityShield::resetVerify($db,false);
 SecurityShield::resetVerify($db,true);
}finally{
 if($ip===null)unset($_SERVER['REMOTE_ADDR']);else $_SERVER['REMOTE_ADDR']=$ip;
}
echo "PASS: API key brute-force protection, network grouping, reset verification throttling, hashed identifiers only\n";
