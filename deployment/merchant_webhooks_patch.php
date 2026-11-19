<?php
declare(strict_types=1);
/** No financial state change: signed asynchronous notification of ledger events. */
$root='/var/www/html';
function argusHookReplace(string $f,string $old,string $new,string $why):void{
    $content=file_get_contents($f);
    if(!is_string($content)||substr_count($content,$old)!==1)
        throw new RuntimeException('Webhook patch mismatch: '.$why);
    if(file_put_contents($f,str_replace($old,$new,$content))===false)
        throw new RuntimeException('Webhook patch cannot write: '.$why);
}
argusHookReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/FinanceOperations.php';",
    "require_once __DIR__ . '/FinanceOperations.php';\nrequire_once __DIR__ . '/MerchantWebhooks.php';",
    'webhook class inclusion');
argusHookReplace($root.'/src/Portal.php',
    "        if(str_starts_with(\$path,'/api/portal/wallet'))MerchantWallet::portal(\$db,\$method,\$path,\$account);",
    "        if(str_starts_with(\$path,'/api/portal/webhooks'))MerchantWebhooks::portal(\$db,\$method,\$path,\$account);\n".
    "        if(str_starts_with(\$path,'/api/portal/wallet'))MerchantWallet::portal(\$db,\$method,\$path,\$account);",
    'protected merchant webhook management');
$worker='/usr/local/share/argus/notify_worker.php';
$w=file_get_contents($worker);
if(!is_string($w)||!str_contains($w,'MerchantWallet::worker($db);'))
    throw new RuntimeException('Merchant webhook worker requires authenticated merchant reconcile first');
$w.="\n// Signed outbound notifications of immutable ledger events (never credit funds).\n";
$w.="try{ \ArgusPayments\MerchantWebhooks::worker(\$db); }\n";
$w.="catch(\\Throwable \$e){error_log('ARGUS merchant outbound webhook worker: '.get_class(\$e));}\n";
if(file_put_contents($worker,$w)===false)
    throw new RuntimeException('Webhook worker extension failed');
$client=$root.'/public/static/client.html';
argusHookReplace($client,'</head>',
    '<link rel="stylesheet" href="/static/merchant-webhooks.css?v=20261119-1"></head>',
    'seller webhooks style');
argusHookReplace($client,'</body>',
    '<script defer src="/static/merchant-webhooks.js?v=20261119-1"></script></body>',
    'seller webhooks controls');
$docs=$root.'/public/static/docs.html';
argusHookReplace($docs,'</body>',
    '<script defer src="/static/merchant-webhooks-docs.js?v=20261119-1"></script></body>',
    'developer documentation');
echo "PASS: account-scoped outbound webhook management, ledger-only queue and guarded transport mounted after reconciliation.\n";
