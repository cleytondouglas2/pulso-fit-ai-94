<?php
declare(strict_types=1);
/** Mount a guarded, B2B-only, read-only preflight. Existing money handlers unchanged. */
$root='/var/www/html';
function b2bReplace(string $file,string $from,string $to,string $label):void {
    $s=file_get_contents($file);
    if(!is_string($s)||substr_count($s,$from)!==1)
        throw new RuntimeException('B2B readiness installer anchor changed: '.$label);
    if(file_put_contents($file,str_replace($from,$to,$s))===false)
        throw new RuntimeException('B2B readiness installer write failed: '.$label);
}
b2bReplace("$root/src/Gateway.php",
 "require_once __DIR__ . '/SiteStudio.php';",
 "require_once __DIR__ . '/SiteStudio.php';\nrequire_once __DIR__ . '/B2BActivationPreflight.php';",
 'load B2B readiness class');
$routes=<<<'PHP'
        // Super Admin only, environment-scoped, entirely read-only.
        // No secret values, activation, Pix creation or payout execution.
        if(str_starts_with($path,'/api/admin/b2b/')){
            if(($actor['role']??'')!=='superadmin')
                self::fail('Somente o Super Admin pode consultar o B2B',403);
            B2BActivationPreflight::handle($db,$method,$path,$actor);
        }
PHP;
b2bReplace("$root/src/Admin.php",
 "        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 $routes."\n        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 'role-protected B2B read-only status route');
$admin="$root/public/static/admin.html";
b2bReplace($admin,
 '<button class="menu-item super-only" data-nav="site-studio">',
 '<button class="menu-item super-only" data-nav="b2b-activation" hidden style="display:none"><span>◈</span> Habilitação B2B</button>'.
 '<button class="menu-item super-only" data-nav="site-studio">',
 'Super Admin B2B menu hidden outside authorized service');
$screen=<<<'HTML'
<section class="page" id="page-b2b-activation" hidden>
 <div class="argus-b2b-view-head">
  <div><small>CONTROLE DE INFRAESTRUTURA</small><h1>Habilitação financeira B2B</h1>
   <p>Confira os requisitos de segurança e prepare a operação com segurança, sem executar movimentações.</p></div>
  <button type="button" id="argus-b2b-readiness-refresh">↻ Atualizar diagnóstico</button>
 </div>
 <div id="argus-b2b-readiness-root" aria-live="polite">
  <p>Verificando banco, segurança e disponibilidade do B2B…</p>
 </div>
</section>
HTML;
b2bReplace($admin,'<section class="page" id="page-site-studio" hidden>',
 $screen.'<section class="page" id="page-site-studio" hidden>',
 'B2B readiness page');
b2bReplace($admin,'</head>',
 '<link rel="stylesheet" href="/static/b2b-activation.css?v=b2b-20261123-1"></head>',
 'B2B readiness style');
b2bReplace($admin,'</body>',
 '<script defer src="/static/b2b-activation.js?v=b2b-20261123-1"></script></body>',
 'B2B readiness script');
echo "PASS: strictly read-only Super Admin B2B diagnostics mounted without modifying Pix or payout gates.\n";
