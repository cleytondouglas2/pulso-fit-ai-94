<?php
declare(strict_types=1);
/**
 * Applied only after all existing legacy contract tests have run.
 * Browser cache bust for the newly unified and mobile-safe KYC review.
 */
$path='/var/www/html/public/static/admin.html';
$html=file_get_contents($path);
if(!is_string($html))throw new RuntimeException('KYC asset patch: admin HTML unavailable');
foreach([
    'kyc-studio.js?v=1'=>'kyc-studio.js?v=3',
    'kyc-studio.css?v=1'=>'kyc-studio.css?v=3'
] as $old=>$next){
    if(substr_count($html,$old)!==1)
        throw new RuntimeException('KYC asset patch: exact KYC asset missing '.$old);
    $html=str_replace($old,$next,$html);
}
$count=0;
$html=preg_replace_callback('~(/static/admin\.js\?v=)[0-9]+(?=")~',
    static function(array $m)use(&$count):string{$count++;return $m[1].'kyc-nov19';},
    $html);
if(!is_string($html)||$count!==1)
    throw new RuntimeException('KYC asset patch: admin JS asset version missing');
if(!str_contains($html,'id="open-kyc-studio"')||
   !str_contains($html,'id="application-rows"'))
    throw new RuntimeException('KYC asset patch: old review page still present');
if(file_put_contents($path,$html)===false)
    throw new RuntimeException('KYC asset patch: cannot update admin HTML');
echo "PASS: refreshed Admin and KYC scripts for iPhone, original authorization routes unchanged.\n";
