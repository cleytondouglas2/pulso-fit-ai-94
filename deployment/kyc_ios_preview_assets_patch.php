<?php
declare(strict_types=1);
/** Run after legacy KYC UI build tests. Safari must load the new preview JS/CSS. */
$file='/var/www/html/public/static/admin.html';
$src=file_get_contents($file);
if(!is_string($src))throw new RuntimeException('Admin HTML unavailable for KYC preview assets');
foreach([
  'kyc-studio.js?v=3'=>'kyc-studio.js?v=4',
  'kyc-studio.css?v=3'=>'kyc-studio.css?v=4'
] as $old=>$new){
 if(substr_count($src,$old)!==1)
  throw new RuntimeException('KYC preview asset version mismatch: '.$old);
 $src=str_replace($old,$new,$src);
}
if(file_put_contents($file,$src)===false)
 throw new RuntimeException('Could not publish KYC preview assets');
echo "PASS: mobile KYC document preview cache version advanced.\n";
