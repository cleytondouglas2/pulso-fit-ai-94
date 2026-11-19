<?php
declare(strict_types=1);
/**
 * Read-only revenue report. Runs LAST after CPF wallet, reseller layout and all
 * original finance tests. Does not change Pix, ledger, balances, rates, or payouts.
 */
$root='/var/www/html';
function revenueReplace(string $path,string $old,string $new,string $why):void {
    $source=file_get_contents($path);
    if(!is_string($source)||substr_count($source,$old)!==1)
        throw new RuntimeException('ARGUS revenue patch failed to match '.$why);
    if(file_put_contents($path,str_replace($old,$new,$source))===false)
        throw new RuntimeException('ARGUS revenue patch cannot update '.$why);
}
revenueReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/PfFinancialApproval.php';",
    "require_once __DIR__ . '/PfFinancialApproval.php';\nrequire_once __DIR__ . '/RevenueReport.php';",
    'report class inclusion after final PF patch');
revenueReplace($root.'/src/MerchantWallet.php',
    "    public static function portal(Database \$db,string \$method,string \$path,array \$account):never{\n",
    "    public static function portal(Database \$db,string \$method,string \$path,array \$account):never{\n".
    "        if(\$method==='GET'&&\$path==='/api/portal/wallet/revenue')\n".
    "            self::out(RevenueReport::build(\$db,(string)\$account['id']));\n",
    'authenticated seller-only revenue route');
revenueReplace($root.'/src/MerchantWallet.php',
    "        if(\$method==='GET'&&\$path==='/api/admin/merchant-wallet/overview'){",
    "        if(\$method==='GET'&&\$path==='/api/admin/merchant-wallet/revenue')\n".
    "            self::out(RevenueReport::build(\$db));\n".
    "        if(\$method==='GET'&&\$path==='/api/admin/merchant-wallet/overview'){",
    'superadmin-only consolidated revenue route');
// The original Admin::handle enforces the full session, Super Admin role,
// and its wallet admin protections before delegating to MerchantWallet::admin.
$admin=$root.'/public/static/admin.html';
revenueReplace($admin,
    '<button class="menu-item super-only" data-nav="merchant-wallet">',
    '<button class="menu-item super-only" data-nav="revenue"><span>▥</span> Faturamento</button>'.
    '<button class="menu-item super-only" data-nav="merchant-wallet">',
    'Super Admin revenue menu');
$screen=<<<'HTML'
<section class="page" id="page-revenue" hidden>
  <div class="merchant-admin-page">
    <div class="ar-revenue" id="ar-admin-revenue" aria-live="polite">
      <p>Consultando faturamento real confirmado…</p>
    </div>
  </div>
</section>
HTML;
revenueReplace($admin,
    '<section class="page" id="page-merchant-wallet" hidden>',
    $screen.'<section class="page" id="page-merchant-wallet" hidden>',
    'dedicated Super Admin revenue page');
foreach(['admin.html','client.html'] as $htmlFile){
    $target=$root.'/public/static/'.$htmlFile;
    revenueReplace($target,'</head>',
        '<link rel="stylesheet" href="/static/revenue-dashboard.css?v=20261119-1"></head>',
        $htmlFile.' revenue responsive styles');
    revenueReplace($target,'</body>',
        '<script defer src="/static/revenue-dashboard.js?v=20261119-1"></script></body>',
        $htmlFile.' revenue browser presentation');
}
echo "PASS: isolated authenticated seller report, total Super Admin report, responsive charts, no payment mutations.\n";
