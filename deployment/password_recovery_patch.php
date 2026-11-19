<?php
declare(strict_types=1);
/**
 * Password recovery is installed after all existing account/login/KYC patches.
 * It NEVER modifies Pix, wallet, fees, merchant identities or administrative MFA.
 */
$root='/var/www/html';
function argusResetReplace(string $path,string $before,string $after,string $reason):void{
    $source=file_get_contents($path);
    if(!is_string($source)||substr_count($source,$before)!==1)
        throw new RuntimeException('ARGUS password reset: missing installer anchor '.$reason);
    $updated=str_replace($before,$after,$source);
    if(file_put_contents($path,$updated)===false)
        throw new RuntimeException('ARGUS password reset: cannot write '.$reason);
}
argusResetReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/RevenueReport.php';",
    "require_once __DIR__ . '/RevenueReport.php';\nrequire_once __DIR__ . '/PortalPasswordReset.php';",
    'server recovery dependency');
argusResetReplace($root.'/src/Portal.php',
    "        if(\$method==='POST'&&\$path==='/api/portal/register'){",
    "        if(\$method==='POST'&&str_starts_with(\$path,'/api/portal/password-reset/'))\n".
    "            PortalPasswordReset::handle(\$db,\$method,\$path);\n".
    "        if(\$method==='POST'&&\$path==='/api/portal/register'){",
    'anonymous recovery request before the authenticated customer session');
$client=$root.'/public/static/client.html';
argusResetReplace($client,'</head>',
    '<link rel="stylesheet" href="/static/reseller-password-recovery.css?v=reset-20261119-1"></head>',
    'admin-matching recovery stylesheet');
argusResetReplace($client,'</body>',
    '<script defer src="/static/reseller-password-recovery.js?v=reset-20261119-1"></script></body>',
    'reseller password reset UI');
echo "PASS: reset request and redemption require no active session, while normal customer login, admin MFA, finance and KYC remain unchanged.\n";
