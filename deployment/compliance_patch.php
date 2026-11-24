<?php
declare(strict_types=1);
$root='/var/www/html';
function complianceReplace(string $p,string $a,string $b):void {
 $s=file_get_contents($p);
 if(!is_string($s)||substr_count($s,$a)!==1)throw new RuntimeException('Compliance anchor: '.basename($p));
 if(file_put_contents($p,str_replace($a,$b,$s))===false)throw new RuntimeException('Compliance write failed');
}
complianceReplace($root.'/src/Gateway.php',"require_once __DIR__ . '/ArgusGrowth.php';","require_once __DIR__ . '/ArgusGrowth.php';\nrequire_once __DIR__ . '/Compliance.php';\nrequire_once __DIR__ . '/LegalAcceptance.php';\nrequire_once __DIR__ . '/TransactionJournal.php';");
$routes=<<<'PHP'
            if($method==='GET'&&$path==='/api/public/legal')LegalAcceptance::publicInfo();
            if($method==='GET'&&$path==='/cookies'){self::htmlFile('cookies-policy.html');return;}
            if($method==='GET'&&in_array($path,['/privacidade','/termos'],true)){
                self::htmlFile($path==='/privacidade'?'privacy-lgpd.html':'terms-of-use.html');return;
            }
PHP;
complianceReplace($root.'/src/Gateway.php',"            if(\$method==='GET'&&\$path==='/verify'){",$routes."\n            if(\$method==='GET'&&\$path==='/verify'){");
complianceReplace($root.'/src/Admin.php',"        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){","        if(\$method==='GET'&&\$path==='/api/admin/compliance/trace')Compliance::admin(\$db,\$actor);\n        if(\$method==='GET'&&\$path==='/api/admin/fees/operations'){");
$d=$root.'/public/static/';
foreach(['landing.html','client.html','admin.html','public-pix.html','reseller-public-pix.html','commerce-public.html'] as $f){
 complianceReplace($d.$f,'</head>','<link rel="stylesheet" href="/static/compliance.css?v=1"></head>');
 complianceReplace($d.$f,'</body>','<nav class="argus-legal-links" aria-label="Documentos legais"><a href="/privacidade">Privacidade e LGPD</a><a href="/termos">Termos de Uso</a></nav></body>');
}
complianceReplace($d.'admin.html','<button class="menu-item super-only" data-nav="site-studio">','<button class="menu-item super-only" data-nav="compliance-trace"><span>◎</span> Auditoria e rastreabilidade</button><button class="menu-item super-only" data-nav="site-studio">');
$view=<<<'HTML'
<section class="page" id="page-compliance-trace" hidden><article class="argus-compliance-panel"><h1>Auditoria e rastreabilidade</h1><p>Consulta somente leitura dos registros financeiros existentes. Não executa pagamentos nem saques.</p><form id="argus-trace-form"><label>Origem<select name="source"><option value="seller-deposit">Pix revendedor</option><option value="seller-withdrawal">Saque revendedor</option><option value="admin-deposit">Pix administrativo</option><option value="admin-withdrawal">Saque administrativo</option></select></label><label>ID interno<input name="id" required maxlength="80" pattern="[A-Za-z0-9_-]+"></label><button type="submit">Consultar</button></form><div id="argus-trace-result" aria-live="polite"></div></article></section>
HTML;
complianceReplace($d.'admin.html','<section class="page" id="page-site-studio" hidden>',$view.'<section class="page" id="page-site-studio" hidden>');
complianceReplace($d.'admin.html','</body>','<script defer src="/static/compliance.js?v=1"></script></body>');
// Explicit acknowledgement after authenticated login. Do not block existing withdrawals.
$portal=$root.'/src/Portal.php';
$legalRoutes=<<<'PHP'
        if($method==='GET'&&$path==='/api/portal/legal'){
            self::out(LegalAcceptance::status($db,(string)$account['id']));
        }
        if($method==='POST'&&$path==='/api/portal/legal'){
            self::out(LegalAcceptance::record($db,(string)$account['id'],self::body()));
        }
PHP;
complianceReplace($portal,"        if(\$method!=='GET')self::csrf(\$account);","        if(\$method!=='GET')self::csrf(\$account);\n".$legalRoutes);
complianceReplace($d.'client.html','</body>','<script defer src="/static/legal-acceptance.js?v=1"></script></body>');
// Cookie preferences are same-origin and never gate payment or login.
foreach(['landing.html','client.html','admin.html','public-pix.html','reseller-public-pix.html','commerce-public.html','privacy-lgpd.html','terms-of-use.html','cookies-policy.html','docs.html','install.html','argus-verify.html','commerce-status.html'] as $f){
 complianceReplace($d.$f,'</head>','<link rel="stylesheet" href="/static/cookie-consent.css?v=1"><script defer src="/static/cookie-consent-core.js?v=1"></script><script defer src="/static/cookie-consent-ui.js?v=1"></script></head>');
}
echo "PASS: legal drafts and read-only superadmin trace mounted\n";
