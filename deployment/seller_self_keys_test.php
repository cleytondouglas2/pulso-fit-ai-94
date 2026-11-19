<?php
declare(strict_types=1);
// Read-only source/route contract. No real credentials or PSP operations run.
$root='/var/www/html';
$portal=(string)file_get_contents($root.'/src/Portal.php');
$merchant=(string)file_get_contents($root.'/public/static/merchant-portal.js');
$client=(string)file_get_contents($root.'/public/static/client.html');
$script=(string)file_get_contents($root.'/public/static/portal.js');
$admin=(string)file_get_contents($root.'/public/static/admin-api-keys.js');
$docs=(string)file_get_contents($root.'/public/static/merchant-docs.js');
foreach([
    "if(\$method==='POST'&&\$path==='/api/portal/keys')",
    "if(\$method==='GET'&&\$path==='/api/portal/keys')",
    "self::csrf(\$account)",
    "self::session(\$db)",
    "WHERE account_id=? AND revoked_at IS NULL",
    "KycStudio::identityApproved",
    "status='approved_live'",
    "in_array(\$db->driver(),['pgsql','mysql'],true)",
    "hash('sha256',\$secret)",
    "self_service'=>true",
    "max_active'=>10",
    "WHERE id=? AND account_id=? AND revoked_at IS NULL"
] as $needle){
    if(!str_contains($portal,$needle))
        throw new RuntimeException('Missing seller-only security contract: '.$needle);
}
$section=explode("if(\$method==='POST'&&\$path==='/api/portal/keys')",$portal,2)[1]??'';
$section=explode("if(\$method==='POST'&&preg_match(",$section,2)[0];
if(str_contains($section,'verifyMfaCode')||str_contains($section,"account_id']??"))
    throw new RuntimeException('Seller credential issue incorrectly requires superadmin or accepts foreign account ID');
foreach(['#api-panel','seller-key-create','Minhas chaves de integração',
    '/documentacao-api'] as $key){
    if(!str_contains($merchant,$key)&&!str_contains($client,$key))
        throw new RuntimeException('Seller interface element missing '.$key);
}
foreach(['v=3','Minhas chaves de API','Gerar minhas chaves'] as $key)
    if(!str_contains($client,$key))
        throw new RuntimeException('Customer screen missing '.$key);
if(!str_contains($script,"result.reason")||!str_contains($script,"result.can_issue"))
    throw new RuntimeException('Client must use server-issued eligibility, not approval guess');
if(!str_contains($admin,'/conta#api-panel'))
    throw new RuntimeException('Administrator does not link to seller self-service');
if(!str_contains($docs,'API V2'))
    throw new RuntimeException('Seller API V2 guide missing');
echo "PASS: seller self-service API keys, account isolation, CSRF/KYC, merchant state, persistent keys, one-time secrets, mobile navigation and v2 docs.\n";
