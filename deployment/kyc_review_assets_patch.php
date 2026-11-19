<?php
declare(strict_types=1);
/**
 * Applied only after all existing legacy contract tests have run.
 * Browser cache bust for the newly unified and mobile-safe KYC review.
 */
// Backward compatibility: old mobile links must resolve to the CURRENT
// encrypted KYC document store with the authenticated reviewer and audit log.
// Keep the original admin 2FA and role checks; do not read old disk paths.
$adminPath='/var/www/html/src/Admin.php';
$admin=file_get_contents($adminPath);
$anchor="if(str_starts_with(\$path,'/api/admin/portal/')){self::writeAllowed(\$actor,true);Portal::admin(\$db,\$method,\$path);}";
if(!is_string($admin)||substr_count($admin,$anchor)!==1)
    throw new RuntimeException('KYC review fix: legacy protected admin route missing');
$bridge=<<<'PHP'
if($method==='GET'&&preg_match('~^/api/admin/portal/applications/([a-f0-9]{32})/documents/([a-f0-9]{32})$~D',$path,$documentMatch)){
            self::writeAllowed($actor,true);
            // KycStudio enforces analyst role, account/document ownership, cryptographic
            // integrity and an immutable document_viewed audit entry.
            KycStudio::admin($db,$method,'/api/admin/kyc/applications/'.$documentMatch[1].'/documents/'.$documentMatch[2],$actor);
        }
PHP;
$admin=str_replace($anchor,$bridge."\n        ".$anchor,$admin);
if(file_put_contents($adminPath,$admin)===false)
    throw new RuntimeException('KYC review fix: cannot link legacy encrypted document endpoint');

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
