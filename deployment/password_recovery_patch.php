<?php
declare(strict_types=1);
/**
 * Password recovery is installed after all existing account/login/KYC patches.
 * The admin route reuses the mail transport while retaining its own credentials and sessions.
 */
$root=$argv[1]??'/var/www/html';
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
    '<link rel="stylesheet" href="/static/reseller-password-recovery.css?v=reset-20261121-1"></head>',
    'admin-matching recovery stylesheet');
argusResetReplace($client,'</body>',
    '<script defer src="/static/reseller-password-recovery.js?v=reset-20261121-1"></script></body>',
    'reseller password reset UI');
$admin=$root.'/src/Admin.php';
argusResetReplace($admin,
    "        if(\$method==='POST'&&\$path==='/api/admin/login'){",
    "        if(str_starts_with(\$path,'/api/admin/password-reset/')){\n".
    "            PortalPasswordReset::handle(\$db,\$method,\$path,true);\n".
    "        }\n".
    "        if(\$method==='POST'&&\$path==='/api/admin/login'){",
    'anonymous admin recovery route');
argusResetReplace($admin,
    "                \$db->run('DELETE FROM admin_sessions WHERE user_id=? OR expires_at<?'",
    <<<'PHP'
                // A login that verified an old password cannot create a session after a reset.
                $lock=$db->driver()==='sqlite'?'':' FOR UPDATE';
                $current=$db->one('SELECT password_hash,status,locked_until FROM admin_users WHERE id=?'.$lock,[$row['id']]);
                if(!$current||$current['status']!=='active'||time()<(int)$current['locked_until']||
                   !hash_equals($row['password_hash'],$current['password_hash']))
                    self::fail('Credenciais inválidas ou acesso temporariamente bloqueado',401);
                $db->run('DELETE FROM admin_sessions WHERE user_id=? OR expires_at<?'
PHP,
    'serialise admin session creation with password recovery');
$adminPage=$root.'/public/static/admin.html';
argusResetReplace($adminPage,'</head>',
    '<link rel="stylesheet" href="/static/reseller-password-recovery.css?v=reset-20261121-1"></head>',
    'admin recovery stylesheet');
argusResetReplace($adminPage,'</body>',
    '<script defer src="/static/reseller-password-recovery.js?v=reset-20261121-1"></script></body>',
    'admin password reset UI');
echo "PASS: password recovery routes and shared interface installed.\n";
