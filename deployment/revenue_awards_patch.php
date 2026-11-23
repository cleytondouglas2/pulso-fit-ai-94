<?php
declare(strict_types=1);
/** ARGUS awards: presentation and authenticated read-only reporting only.
 * Consent is an explicitly authorized, nonfinancial preference.
 */
$root='/var/www/html';
function awardsReplace(string $file,string $old,string $new,string $label):void {
 $s=file_get_contents($file);
 if(!is_string($s)||substr_count($s,$old)!==1)
  throw new RuntimeException('Awards installer anchor changed: '.$label);
 if(file_put_contents($file,str_replace($old,$new,$s))===false)
  throw new RuntimeException('Awards installer write failure: '.$label);
}
awardsReplace("$root/src/Gateway.php",
 "require_once __DIR__ . '/AcquirerControl.php';",
 "require_once __DIR__ . '/AcquirerControl.php';\nrequire_once __DIR__ . '/RevenueAwards.php';",
 'authenticated awards service');
$publicRoute=<<<'PHP'
            // Only expressly opted-in seller recognition is public.
            if ($method === 'GET' && $path === '/api/public/revenue-ranking') {
                RevenueAwards::respond(RevenueAwards::publicRanking($db));
            }
PHP;
awardsReplace("$root/src/Gateway.php",
 "            // Public presentation: no account is required, never expose credentials.",
 $publicRoute."\n            // Public presentation: no account is required, never expose credentials.",
 'privacy-filtered public ranking route');
awardsReplace("$root/src/MerchantWallet.php",
 "        if(\$method==='GET'&&\$path==='/api/portal/wallet/revenue')",
 "        if(\$method==='GET'&&\$path==='/api/portal/wallet/awards')\n".
 "            self::out(RevenueAwards::seller(\$db,(string)\$account['id']));\n".
 "        if(\$method==='POST'&&\$path==='/api/portal/wallet/awards/visibility')\n".
 "            self::out(RevenueAwards::visibility(\$db,(string)\$account['id'],self::body()));\n".
 "        if(\$method==='GET'&&\$path==='/api/portal/wallet/revenue')",
 'seller-only awards and explicit consent');
awardsReplace("$root/src/MerchantWallet.php",
 "        if(\$method==='GET'&&\$path==='/api/admin/merchant-wallet/revenue')",
 "        if(\$method==='GET'&&\$path==='/api/admin/merchant-wallet/awards')\n".
 "            self::out(RevenueAwards::admin(\$db,(string)(\$_GET['seller']??'')));\n".
 "        if(\$method==='GET'&&\$path==='/api/admin/merchant-wallet/revenue')",
 'Super Admin awards');
$admin="$root/public/static/admin.html";
awardsReplace($admin,
 '<button class="menu-item super-only" data-nav="revenue">',
 '<button class="menu-item super-only" data-nav="awards"><span>🏆</span> Ranking e placas</button>'.
 '<button class="menu-item super-only" data-nav="revenue">',
 'new admin awards sidebar entry');
$screen=<<<'HTML'
<section class="page" id="page-awards" hidden>
 <div class="argus-awards" id="argus-awards-admin" aria-label="Ranking e placas de faturamento">
  <p>Carregando ranking e placas de faturamento confirmado…</p>
 </div>
</section>
HTML;
awardsReplace($admin,'<section class="page" id="page-revenue" hidden>',
 $screen.'<section class="page" id="page-revenue" hidden>',
 'new admin awards page');
$dashboard="$root/public/static/reseller-dashboard.js";
awardsReplace($dashboard,
 " overview:'Visão geral',charges:'Cobrar com Pix',history:'Cobranças',",
 " overview:'Visão geral',awards:'Ranking e placas',charges:'Cobrar com Pix',history:'Cobranças',",
 'reseller page name');
awardsReplace($dashboard,
 "const icons={\n overview:",
 "const icons={\n awards:'<circle cx=\"12\" cy=\"8\" r=\"6\"/><path d=\"M9 14v7l3-2 3 2v-7\"/>',\n overview:",
 'reseller achievements icon');
awardsReplace($dashboard,
 "nav('overview'),nav('charges'),nav('history'),",
 "nav('overview'),nav('awards'),nav('charges'),nav('history'),",
 'reseller awards navigation');
awardsReplace($dashboard,
 "  page('charges','Crie um QR Code e compartilhe o código Pix Copia e Cola.',",
 "  page('awards','Seu ranking, faturamento, gráficos e placas personalizadas.',".
 "\n   '<div id=\"argus-awards-seller\" class=\"argus-awards\"><p>Consultando conquistas reais…</p></div>'),\n".
 "  page('charges','Crie um QR Code e compartilhe o código Pix Copia e Cola.',",
 'reseller dedicated awards page');
$landing="$root/public/static/landing.html";
$public=<<<'HTML'
<section class="section-wrap argus-public-awards" id="ranking" aria-labelledby="argus-ranking-title">
 <div class="argus-awards" id="argus-awards-public">
  <h2 id="argus-ranking-title">Ranking e placas de faturamento ARGUS Pay</h2>
  <p>Reconhecimento com dados de vendas confirmadas e participação pública autorizada pelo revendedor.</p>
  <p>Consultando o ranking público…</p>
 </div>
</section>
HTML;
awardsReplace($landing,'      <section class="trust-ribbon"',
 $public.'      <section class="trust-ribbon"',
 'public recognition section without fictional sales');
awardsReplace($landing,
 '<nav class="desktop-nav" aria-label="Navegação principal">',
 '<nav class="desktop-nav" aria-label="Navegação principal"><a href="#ranking">Ranking</a>',
 'public navigation ranking link');
foreach(['admin.html','client.html','landing.html'] as $name){
 $path="$root/public/static/$name";
 awardsReplace($path,'</head>',
  '<link rel="stylesheet" href="/static/revenue-awards.css?v=awards-20261123-1"></head>',
  $name.' styling');
 awardsReplace($path,'</body>',
  '<script defer src="/static/revenue-awards.js?v=awards-20261123-1"></script></body>',
  $name.' script');
}
echo "PASS: authenticated admin and seller rankings, public opt-in, new menu and landing presentation linked.\n";
