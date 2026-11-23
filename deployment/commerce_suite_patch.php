<?php
declare(strict_types=1);
/** ARGUS Commerce Innovation Suite. Marketing pages + offline developer sandbox.
 * Existing wallet, PSP, split, payouts and fee rules are NOT modified. */
$root='/var/www/html';
function comReplace(string $file,string $old,string $new,string $description):void {
    $content=file_get_contents($file);
    if(!is_string($content)||substr_count($content,$old)!==1)
        throw new RuntimeException('Commerce suite installer mismatch '.$description);
    if(file_put_contents($file,str_replace($old,$new,$content))===false)
        throw new RuntimeException('Commerce suite installer write failed '.$description);
}
comReplace("$root/src/Gateway.php",
 "require_once __DIR__ . '/B2BActivationPreflight.php';",
 "require_once __DIR__ . '/B2BActivationPreflight.php';\nrequire_once __DIR__ . '/CommerceSuite.php';",
 'commerce service bootstrap');
$public=<<<'PHP'
            // Public infrastructure visibility only; this does NOT test the PSP.
            if($method==='GET'&&$path==='/status'){
                self::htmlFile('commerce-status.html');
                return;
            }
            // Public product presentation only. Real money flows continue to
            // require the existing /e/{seller code} PSP/KYC/custody safeguards.
            if($method==='GET'&&preg_match('~^/c/[a-f0-9]{32}/?$~D',$path)){
                self::htmlFile('commerce-public.html');
                return;
            }
            if($method==='GET'&&preg_match('~^/api/public/commerce/[a-f0-9]{32}$~D',$path)){
                $comPublicDb=new Database(self::$config);
                $comPublicDb->installAndSeed();
                CommerceSuite::public($comPublicDb,$method,$path);
                return;
            }
PHP;
comReplace("$root/src/Gateway.php",
 '// Real-operation console: legacy demo pages, test checkout and demo login are removed.',
 $public."\n".'// Real-operation console: legacy demo pages, test checkout and demo login are removed.',
 'public commerce landing and safe GET API routes');
$portal=<<<'PHP'
        // All merchant Commerce Studio writes inherit the established seller
        // session and portal CSRF guard. There are NO provider money routes.
        if(str_starts_with($path,'/api/portal/commerce/')){
            // Action endpoints carry their action in the path, not the body.
            // Portal::body rejects an empty JSON object ({}), leading to 400
            // for publish/archive. Keep session+CSRF, skip the needless parser
            // only for these explicitly enumerated no-payload actions.
            $actionNoBody=$method==='POST'&&preg_match(
                '~^/api/portal/commerce/pages/cmp_[a-f0-9]{32}/(?:publish|archive|delete)$~D',
                $path
            )===1;
            CommerceSuite::portal($db,$method,$path,$account,
                $method==='POST'&&!$actionNoBody?self::body():[]);
        }
PHP;
comReplace("$root/src/Portal.php",
 "        if(\$method!=='GET')self::csrf(\$account);",
 "        if(\$method!=='GET')self::csrf(\$account);\n".$portal,
 'tenant-only protected commerce editor and sandbox');
$admin=<<<'PHP'
        // Existing authenticated Super Admin; informational aggregate only.
        if($method==='GET'&&$path==='/api/admin/commerce/overview'){
            if(($actor['role']??'')!=='superadmin')
                self::fail('Super Admin obrigatório',403);
            CommerceSuite::respondAdmin($db,$actor);
        }
PHP;
comReplace("$root/src/Admin.php",
 "        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 $admin."\n        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){",
 'Super Admin informational metrics');
$dashboard="$root/public/static/reseller-dashboard.js";
comReplace($dashboard,
 "overview:'Visão geral',awards:'Ranking e placas',charges:'Cobrar com Pix'",
 "overview:'Visão geral',awards:'Ranking e placas',commerce:'Checkout Studio',charges:'Cobrar com Pix'",
 'reseller view registered before routing');
comReplace($dashboard,
 "const icons={\n awards:",
 "const icons={\n commerce:'<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><path d=\"M3 9h18M7 14h4m-4 4h10\"/>',\n awards:",
 'commerce navigation icon');
comReplace($dashboard,
 "nav('integrations'),nav('registration'),nav('assistant'),",
 "nav('integrations'),nav('commerce'),nav('registration'),nav('assistant'),",
 'merchant commerce navigation');
$screen=<<<'HTML'
 page('commerce','Monte páginas comerciais, compartilhe ofertas e teste integrações sem dinheiro real.',
  '<div id="argus-commerce-root"><div class="argus-commerce-header"><div><small>ARGUS PAY · COMMERCE SUITE</small><h3>Checkout Studio</h3><p>Crie páginas com sua marca e direcione o cliente ao checkout Pix autorizado. Você controla o conteúdo; os valores e taxas são confirmados no checkout existente.</p></div><button id="argus-commerce-refresh" type="button">↻ Atualizar</button></div>'+
  '<div class="argus-commerce-grid"><section class="argus-commerce-panel"><h4>Criar ou editar oferta</h4><form id="argus-commerce-form" autocomplete="off">'+
   '<label>Título da oferta<input name="title" maxlength="100" placeholder="Produto ou serviço" required></label>'+
   '<label>Descrição comercial<textarea name="description" maxlength="600" placeholder="O que seu cliente recebe?" required></textarea></label>'+
   '<div class="argus-commerce-form-row"><label>Valor sugerido (R$) · opcional<input name="amount" inputmode="decimal" value="" placeholder="Deixe vazio para valor livre"></label>'+
   '<label>Cor principal<input name="accent_color" type="color" value="#e9bc74"></label></div>'+
   '<label>Imagem ilustrativa (URL HTTPS)<input name="image_url" maxlength="600" placeholder="https://.../foto.webp"></label>'+
   '<div class="argus-commerce-form-row"><label>Texto do botão<input name="call_to_action" maxlength="70" value="Continuar para o Pix" required></label>'+
   '<label>Data de validade (opcional)<input name="expires_at" type="date"></label></div>'+
   '<div class="argus-commerce-btn-row"><button type="submit" id="argus-commerce-submit">Criar rascunho</button>'+
   '<button class="muted" type="button" id="argus-commerce-cancel" hidden>Cancelar edição</button></div></form></section>'+
   '<section class="argus-commerce-panel"><h4>Prévia instantânea</h4><div id="argus-commerce-preview"></div>'+
    '<div class="argus-commerce-notice">As páginas são comerciais. Não cobram nem creditam saldo: somente o Pix existente faz isso após autorização do PSP.</div></section></div>'+
  '<div class="argus-commerce-list-head"><h4>Minhas páginas</h4><span id="argus-commerce-count">0 páginas</span></div>'+
  '<div class="argus-commerce-list" id="argus-commerce-list"></div>'+
  '<section class="argus-commerce-panel argus-commerce-sandbox"><h4>Sandbox de desenvolvimento · 100% simulado</h4>'+
   '<p>Experimente respostas de pagamento sem usar a adquirente, sem QR Code real e sem movimentar carteiras. Resultados têm prefixo simulado.</p>'+
   '<form id="argus-commerce-sandbox-form"><div class="argus-commerce-form-row"><label>Cenário<select name="scenario"><option value="paid">Pagamento simulado</option><option value="pending">Pendente simulado</option><option value="failed">Falha simulada</option><option value="refunded">Estorno simulado</option></select></label>'+
   '<label>Valor fictício (R$)<input name="amount" inputmode="decimal" value="25,00" required></label></div><div><button type="submit">Simular resposta API</button></div></form>'+
   '<pre id="argus-commerce-sandbox-result" class="argus-commerce-sandbox-result">Nenhum teste executado nesta sessão.</pre></section>'+
  '<p class="argus-commerce-feedback" id="argus-commerce-feedback" aria-live="polite">Crie sua primeira página de oferta.</p></div>'),
HTML;
comReplace($dashboard,
 " page('history','Localize cobranças recentes pelo status, pelo ID ou pelo valor.',",
 $screen."\n page('history','Localize cobranças recentes pelo status, pelo ID ou pelo valor.',",
 'full reseller commerce page mounted at SPA initialization');
$adminHtml="$root/public/static/admin.html";
comReplace($adminHtml,
 '<button class="menu-item super-only" data-nav="site-studio">',
 '<button class="menu-item super-only" data-nav="innovation"><span>◈</span> Central de inovação</button>'.
 '<button class="menu-item super-only" data-nav="site-studio">',
 'Super Admin innovation menu');
$adminPage=<<<'HTML'
<section class="page" id="page-innovation" hidden>
 <div class="argus-innovation-shell" id="argus-innovation-shell">
  <div class="argus-commerce-header"><div><small>ARGUS PAY · PRODUTOS E INOVAÇÃO</small><h2>Central de inovação</h2>
   <p>Acompanhe produtos implementados, integrações pendentes e a evolução da plataforma com dados reais. Nenhuma função financeira será declarada ativa sem homologação.</p></div>
   <button type="button" id="argus-innovation-refresh">Atualizar</button></div>
  <div id="argus-innovation-metrics">Consultando páginas comerciais...</div>
  <div id="argus-innovation-roadmap"></div>
 </div>
</section>
HTML;
comReplace($adminHtml,
 '<section class="page" id="page-site-studio" hidden>',
 $adminPage.'<section class="page" id="page-site-studio" hidden>',
 'Admin innovation product dashboard');
foreach(['client.html','admin.html'] as $page){
    $file="$root/public/static/$page";
    comReplace($file,'</head>',
      '<link rel="stylesheet" href="/static/commerce-suite.css?v=20261123-2"></head>',
      "commerce style ".$page);
    comReplace($file,'</body>',
      '<script defer src="/static/commerce-suite.js?v=20261123-2"></script>'.
      '<script defer src="/static/commerce-admin.js?v=20261123-1"></script></body>',
      "commerce UI script ".$page);
}
echo "PASS: merchant Checkout Studio, sandbox, public pages and admin innovation board mounted safely; money handlers untouched.\n";
