<?php
declare(strict_types=1);
$root='/var/www/html';
function merchantReplace(string $file,string $from,string $to,string $why):void{
    $raw=file_get_contents($file);
    if(!is_string($raw)||substr_count($raw,$from)!==1)
        throw new RuntimeException('Merchant wallet install anchor: '.$why);
    if(file_put_contents($file,str_replace($from,$to,$raw))===false)
        throw new RuntimeException('Merchant wallet install write: '.$why);
}
merchantReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/FeeExecution.php';",
    "require_once __DIR__ . '/FeeExecution.php';\nrequire_once __DIR__ . '/MerchantWallet.php';",
    'merchant wallet service');
$portal=$root.'/src/Portal.php';
// Legacy direct-to-merchant split charges are NOT identical to custodial
// balances; never credit them as seller wallet deposits.
merchantReplace($portal,
    "        if(str_starts_with(\$path,'/api/v1/')){",
    "        if(str_starts_with(\$path,'/api/v2/'))MerchantWallet::api(\$db,\$method,\$path);\n        if(str_starts_with(\$path,'/api/v1/')){",
    'seller custody API v2 without changing existing v1 split endpoints');
merchantReplace($root.'/src/Gateway.php',
    "str_starts_with(\$path, '/api/v1/'))",
    "str_starts_with(\$path, '/api/v1/') || str_starts_with(\$path, '/api/v2/'))",
    'allow v2 server integration routes');
merchantReplace($portal,
    "        if(\$method!=='GET')self::csrf(\$account);",
    "        if(\$method!=='GET')self::csrf(\$account);\n        if(str_starts_with(\$path,'/api/portal/wallet'))MerchantWallet::portal(\$db,\$method,\$path,\$account);",
    'customer wallet protected by independent session and CSRF');
merchantReplace($portal,
    "            if(\$account['status']!=='approved'||!\$account['merchant_id'])self::fail('A emissão de credenciais exige validação documental e liberação operacional',403);",
    "            if(\$account['status']!=='approved'||!\$account['merchant_id'])self::fail('A emissão de credenciais exige validação documental e liberação operacional',403);\n            if(!KycStudio::identityApproved(\$db,(string)\$account['id']))self::fail('Aguarde aprovação da identidade na Central KYC',403);",
    'revoke ability to issue API keys without completed KYC');

$admin=$root.'/src/Admin.php';
$anchor=<<<'PHP'
        if($method==='GET'&&$path==='/api/admin/fees/operations'){
PHP;
$insert=<<<'PHP'
        if(str_starts_with($path,'/api/admin/merchant-wallet/')){
            self::writeAllowed($actor,true);
            if($method==='POST'&&preg_match('~^/api/admin/merchant-wallet/withdrawals/mww_[a-f0-9]{32}/execute$~D',$path)){
                $body=self::input();
                self::verifyMfaCode($db,$actor,self::str($body,'otp',6,6));
                MerchantWallet::admin($db,$method,$path,$actor,$body);
            }
            MerchantWallet::admin($db,$method,$path,$actor);
        }
        if($method==='GET'&&$path==='/api/admin/fees/operations'){
PHP;
merchantReplace($admin,$anchor,$insert,'superadmin authenticated withdrawals and 2FA');
// Appending to already-mounted reconciliation worker preserves all original
// notification jobs. Never call a provider's transfer endpoint in this worker.
$worker='/usr/local/share/argus/notify_worker.php';
$code=file_get_contents($worker);
if(!is_string($code)||substr_count($code,"\\ArgusPayments\\TraditionalQuickPix::worker(\$db);")!==1)
    throw new RuntimeException('Merchant reconciliation worker anchor mismatch');
$code.="\n// Seller-wallet read-only provider reconciliation, separate from direct split.\n";
$code.="try{ \\ArgusPayments\\MerchantWallet::worker(\$db); }\n";
$code.="catch(\\Throwable \$e){ error_log('ARGUS merchant reconciliation read failed: '.get_class(\$e)); }\n";
file_put_contents($worker,$code);

$client=$root.'/public/static/client.html';
merchantReplace($client,'</head>',
    '<link rel="stylesheet" href="/static/merchant-portal.css?v=3"></head>',
    'seller wallet CSS');
merchantReplace($client,'</body>',
    '<script src="/static/qrcode.min.js?v=1" defer></script><script src="/static/merchant-portal.js?v=4" defer></script></body>',
    'seller wallet dashboard');
$docs=$root.'/public/static/docs.html';
merchantReplace($docs,'</head>',
    '<link rel="stylesheet" href="/static/merchant-docs.css?v=1"></head>',
    'seller integration docs style');
merchantReplace($docs,'</body>',
    '<script src="/static/merchant-docs.js?v=1" defer></script></body>',
    'seller developer docs');

$adminHtml=$root.'/public/static/admin.html';
merchantReplace($adminHtml,
    '<button class="menu-item super-only" data-nav="fees">',
    '<button class="menu-item super-only" data-nav="merchant-wallet"><span>▣</span> Saldos de revendedores</button><button class="menu-item super-only" data-nav="fees">',
    'superadmin seller wallet navigation');
$screen=<<<'HTML'
<section class="page" id="page-merchant-wallet" hidden>
 <div class="merchant-admin-page">
  <div class="section-top"><div><p class="eyebrow">SUPER ADMIN · CARTEIRAS INDIVIDUAIS</p>
  <h1>Saldos de revendedores</h1><p>Confira cada carteira isolada e acompanhe os saques solicitados e enviados pelos próprios revendedores, sem aprovação manual.</p></div>
  <button class="btn secondary" id="merchant-admin-refresh" type="button">Atualizar saldos</button></div>
  <div class="panel"><h2>Contas e saldos</h2><div id="merchant-admin-accounts" aria-live="polite"></div></div>
  <div class="panel"><h2>Solicitações de saque</h2><div id="merchant-admin-withdrawals" aria-live="polite"></div></div>
  <p class="muted">Cada saque reserva exatamente o total solicitado e envia o valor líquido após a taxa de serviço. Em resultado incerto, não reenviar automaticamente.</p>
 </div>
</section>
HTML;
merchantReplace($adminHtml,
    '<section class="page" id="page-fees" hidden>',
    $screen.'<section class="page" id="page-fees" hidden>',
    'superadmin wallet review page');
merchantReplace($adminHtml,'</head>',
    '<link rel="stylesheet" href="/static/merchant-admin.css?v=1"></head>',
    'wallet staff stylesheet');
merchantReplace($adminHtml,'</body>',
    '<script src="/static/merchant-admin.js?v=1" defer></script></body>',
    'wallet staff controls');
echo "ARGUS seller wallet: merchant keys, isolated balances, docs, portal and 2FA-controlled payout review installed (custody remains gated).\n";
