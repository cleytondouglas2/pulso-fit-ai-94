<?php
declare(strict_types=1);
/* Install read-only financial audit without any mutation of charges or money. */
$root='/var/www/html';
function opReplace(string $file,string $from,string $to,string $why):void{
    $str=file_get_contents($file);
    if(!is_string($str)||substr_count($str,$from)!==1)
        throw new RuntimeException('Operations patch mismatch: '.$why);
    if(file_put_contents($file,str_replace($from,$to,$str))===false)
        throw new RuntimeException('Operations patch write failed: '.$why);
}
opReplace($root.'/src/Gateway.php',
    "require_once __DIR__ . '/PortalPasswordReset.php';",
    "require_once __DIR__ . '/PortalPasswordReset.php';\nrequire_once __DIR__ . '/FinanceOperations.php';",
    'operations class autoload');
opReplace($root.'/src/MerchantWallet.php',
    "    public static function portal(Database \$db,string \$method,string \$path,array \$account):never{\n",
    "    public static function portal(Database \$db,string \$method,string \$path,array \$account):never{\n".
    "        if(\$method==='GET'&&\$path==='/api/portal/wallet/export.csv')\n".
    "            FinanceOperations::download(\$db,(string)\$account['id']);\n",
    'session-only seller CSV');
opReplace($root.'/src/MerchantWallet.php',
    "        if(\$method==='GET'&&\$path==='/api/v2/wallet/balance')",
    "        if(\$method==='GET'&&\$path==='/api/v2/wallet/export.csv')\n".
    "            FinanceOperations::download(\$db,(string)\$account['id']);\n".
    "        if(\$method==='GET'&&\$path==='/api/v2/wallet/balance')",
    'API v2 tenant-only CSV');
opReplace($root.'/src/MerchantWallet.php',
    "        if(\$method==='GET'&&\$path==='/api/admin/merchant-wallet/revenue')",
    "        if(\$method==='GET'&&in_array(\$path,['/api/admin/merchant-wallet/health',".
    "'/api/admin/merchant-wallet/export.csv'],true))\n".
    "            FinanceOperations::admin(\$db,\$method,\$path);\n".
    "        if(\$method==='GET'&&\$path==='/api/admin/merchant-wallet/revenue')",
    'superadmin-only diagnostics and CSV');
$admin=$root.'/public/static/admin.html';
opReplace($admin,
    '<button class="menu-item super-only" data-nav="revenue">',
    '<button class="menu-item super-only" data-nav="operations"><span>◉</span> Saúde financeira</button>'.
    '<button class="menu-item super-only" data-nav="revenue">',
    'operations menu');
$screen=<<<'HTML'
<section class="page" id="page-operations" hidden>
 <div class="argus-operations" id="argus-operations">
  <div class="argus-operations-head">
    <div><span class="eyebrow">ARGUS · SUPER ADMIN</span>
      <h1>Saúde e conciliação financeira</h1>
      <p>Verificação somente leitura dos lançamentos, saldos, pendências e configurações de operação. Nenhum Pix ou saque é emitido.</p></div>
    <button class="btn secondary" type="button" id="argus-operations-refresh">Atualizar</button>
  </div>
  <div id="argus-operations-status" role="status" aria-live="polite">Carregando diagnóstico…</div>
  <div id="argus-operations-alerts"></div>
  <section class="argus-op-panel">
    <h2>Exportar extrato financeiro (CSV)</h2>
    <p>Livro-razão completo no período, por conta ou consolidado. Horários em UTC. Nenhuma movimentação é criada.</p>
    <form id="argus-operations-export">
      <label>Início <input type="date" name="from" required></label>
      <label>Fim <input type="date" name="to" required></label>
      <label>Revendedor <select name="account_id"><option value="">Todos</option></select></label>
      <button type="submit" class="btn secondary">Baixar CSV</button>
    </form>
  </section>
 </div>
</section>
HTML;
opReplace($admin,
    '<section class="page" id="page-revenue" hidden>',
    $screen.'<section class="page" id="page-revenue" hidden>',
    'operations admin page');
foreach(['admin.html','client.html'] as $page){
    $p=$root.'/public/static/'.$page;
    opReplace($p,'</head>',
        '<link rel="stylesheet" href="/static/finance-operations.css?v=20261119-1"></head>',
        $page.' operations css');
    opReplace($p,'</body>',
        '<script defer src="/static/finance-operations.js?v=20261119-1"></script></body>',
        $page.' operations script');
}
echo "PASS: superadmin operations page, private CSV exports, and immutable tenant-scoped reporting routes installed.\n";
