<?php
declare(strict_types=1);
/** Apply ARGUS customer release safely to the immutable PHP source.zip during build. */
$root='/var/www/html';
function argusReplace(string $file,string $from,string $to,string $label):void{
  $str=file_get_contents($file);
  if($str===false||!str_contains($str,$from))throw new RuntimeException('ARGUS release missing: '.$label);
  $count=substr_count($str,$from);
  if($count!==1)throw new RuntimeException('ARGUS release ambiguous: '.$label.': '.$count);
  if(file_put_contents($file,str_replace($from,$to,$str))===false)throw new RuntimeException('ARGUS release write failure '.$label);
}
$gateway="$root/src/Gateway.php";
argusReplace($gateway,"require_once __DIR__ . '/Admin.php';","require_once __DIR__ . '/Admin.php';\nrequire_once __DIR__ . '/Portal.php';",'include portal');
argusReplace($gateway,"// Real-operation console: legacy demo pages, test checkout and demo login are removed.",
"// ARGUS public client and API documentation pages; customer auth is separate from admin.\n            if (\$method === 'GET' && in_array(\$path, ['/cadastro','/conta','/cliente'],true)) {self::htmlFile('client.html');return;}\n            if (\$method === 'GET' && in_array(\$path, ['/documentacao-api','/docs'],true)) {self::htmlFile('docs.html');return;}\n            // Real-operation console: legacy demo pages, test checkout and demo login are removed.",'public routes');
argusReplace($gateway,"// Only authenticated administrator API and provider-backed Pix API remain exposed.",
"// Customer portal and merchant API are isolated from administrative sessions.\n            if (str_starts_with(\$path, '/api/portal/') || str_starts_with(\$path, '/api/v1/')) {\n                \$portalDb = new Database(self::\$config);\n                \$portalDb->installAndSeed();\n                Portal::handle(\$portalDb,\$method,\$path);\n            }\n            // Only authenticated administrator API and provider-backed Pix API remain exposed.",'portal routes');
$admin="$root/src/Admin.php";
argusReplace($admin,"'ready'=>LivePix::readiness(\$db)['ready'], 'min_cents'=>100,'max_cents'=>10000,",
"'ready'=>\$configured && \$access['status']==='verified' && in_array(\$db->driver(),['pgsql','mysql'],true) && (LivePix::readiness(\$db)['checks']['storage_policy'] ?? false), 'min_cents'=>100,'max_cents'=>10000,",'dedicated finance QR availability');
argusReplace($admin,"if(!LivePix::readiness(\$db)['ready'])self::fail('Pix temporariamente indisponível',503);",
"if(!\\ArgusPayments\\Integrations\\MisticPayFinance::configured() || !in_array(\$db->driver(),['pgsql','mysql'],true) || !(LivePix::readiness(\$db)['checks']['storage_policy'] ?? false))self::fail('Pix indisponível: banco persistente ou configuração financeira ausente',503);",'independent quick Pix readiness');
$html="$root/public/static/admin.html";
argusReplace($html,'<script src="/static/admin.js?v=7" defer></script>','<script src="/static/qrcode.min.js?v=1" defer></script><script src="/static/admin.js?v=8" defer></script>','QR library');
argusReplace($html,'<link rel="icon" type="image/png" href="/static/assets/favicon.png">',
'<link rel="icon" type="image/png" href="/static/assets/argus-icon-192.png"><link rel="apple-touch-icon" href="/static/assets/argus-icon-180.png"><link rel="manifest" href="/static/manifest.webmanifest">','app icons');
argusReplace($html,'<div class="workspace-switch"><div class="workspace-switch-icon">◈</div><div><strong>ARGUS Payments</strong><small>Meu espaço financeiro</small></div><span class="workspace-chev">⌄</span></div>',
'<button type="button" class="workspace-switch" data-shortcut="dashboard" aria-label="Ir para visão geral ARGUS"><div class="workspace-switch-icon">◈</div><div><strong>ARGUS Payments</strong><small>Meu espaço financeiro</small></div><span class="workspace-chev">⌄</span></button>','functional workspace switch');
argusReplace($html,'<div class="two-col"><div class="panel">','<div class="two-col super-only"><div class="panel">','superadmin internal panels');
argusReplace($html,str_replace('\\n',"\n",'</form>\n  <p class="auth-foot">'),
str_replace('\\n',"\n",'</form><p class="muted" style="margin-top:20px">Quer receber pagamentos com a ARGUS? <a href="/cadastro">Criar conta PF ou PJ</a> · <a href="/documentacao-api">Conhecer a API</a></p>\n  <p class="auth-foot">'),'registration link');
$src=file_get_contents($html);
$src=str_replace(['MisticPay','Sem dados demonstrativos','PIX REAL · PILOTO','Pix real · piloto','Pix real piloto','PILOTO PIX','Registros reais da ARGUS','Operações reais · ARGUS'],['processamento financeiro','','','Pix autorizado','Pix autorizado','', 'Registros financeiros','Transações registradas'],$src);
$src=str_replace(['Operação Pix real · 2FA obrigatório · ','Encerramento do piloto','As cobranças estão sujeitas às regras do piloto Pix temporário da ARGUS.','Piloto: limite de R$ 100 por envio e R$ 500 por dia.','O banco compartilhado é temporário. Faça backups externos e migre antes do vencimento.'],
['','Período operacional','Cobranças sujeitas aos limites operacionais e à confirmação do pagamento.','Limites de envio aplicáveis.',''], $src);
$src=str_replace('Pix real','Pix',$src);
$src=str_replace('MisticPay · Pix real','ARGUS Payments',$src);
$src=str_replace('class="live-label"','class="live-label" hidden',$src);
file_put_contents($html,$src);
$js="$root/public/static/admin.js";
$script=file_get_contents($js);
$script=str_replace([
    'Falta cadastrar as credenciais QRCODES da MisticPay Finance na Render.',
    'O piloto Pix não está disponível. Confirme a ativação no dashboard.',
    'A MisticPay recusou a autenticação QRCODES',
    'Confira Client ID e Client Secret da API Finance, o escopo QRCODES e a lista de IPs autorizados na MisticPay.',
    'A autenticação da MisticPay não pôde ser verificada agora.',
    'No piloto, o Pix deve ser entre',
    'Piloto Pix: máximo de R$ 100 por cobrança.',
    'MisticPay Finance',
    'MisticPay'
],[
    'A emissão Pix não está disponível. Consulte o suporte ARGUS.',
    'A emissão Pix está indisponível no momento.',
    'A conexão de pagamentos recusou a autenticação',
    'Entre em contato com o suporte ARGUS para validar o acesso.',
    'A conexão Pix ainda não pôde ser verificada.',
    'O valor da cobrança deve ficar entre',
    'Limite atual: R$ 100 por cobrança.',
    'ARGUS Payments',
    'ARGUS Payments'
],$script);
$script .= <<<'JS'

/* ARGUS visual QR receipts; local QR renderer, no external API leaks payment payload. */
(function(){
 const previous=showChargeReceipt;
 showChargeReceipt=function(data){
  previous(data);
  let host=document.getElementById('charge-qr');
  if(!host){
   host=document.createElement('div');host.id='charge-qr';host.setAttribute('aria-label','QR Code de pagamento Pix');
   host.style.cssText='display:flex;align-items:center;justify-content:center;margin:20px auto;padding:16px;border-radius:13px;background:white;width:max-content;max-width:100%';
   document.getElementById('charge-code').closest('label').before(host);
  }
  host.replaceChildren();
  if(data.pix_copy_paste && typeof QRCode==='function'){
   try{new QRCode(host,{text:data.pix_copy_paste,width:210,height:210,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M})}
   catch(e){host.textContent='Use o Pix Copia e Cola abaixo para pagar';console.warn('QR render unavailable')}
  }else{host.hidden=true;}
  host.hidden=!data.pix_copy_paste;
 };
})();
JS;
file_put_contents($js,$script);
$css="$root/public/static/polish.css";
file_put_contents($css,<<<'CSS'

/* Compact ARGUS top header; page headings remain only in page content. */
.topbar .breadcrumb,.topbar #page-heading,.topbar .live-label{display:none!important}
.topbar{min-height:64px;align-items:center}
.topbar-nav{display:flex;align-items:center;gap:12px}
.workspace-switch{width:100%;font:inherit;text-align:left;cursor:pointer;color:inherit;border:1px solid transparent}
.workspace-switch:hover,.workspace-switch:focus-visible{border-color:#967543!important;outline:0;background:#24201a}
.sidebar .menu-item{min-height:40px}
#charge-qr img,#charge-qr canvas{width:210px!important;height:210px!important;max-width:100%!important;image-rendering:auto}
@media(max-width:600px){.topbar{min-height:58px}.topbar-nav{min-width:0}.topbar .account-chip{max-width:50vw}}
CSS,FILE_APPEND);
file_put_contents("$root/public/static/manifest.webmanifest",json_encode(['name'=>'ARGUS Payments','short_name'=>'ARGUS Pay','start_url'=>'/conta','scope'=>'/','display'=>'standalone','background_color'=>'#0c1119','theme_color'=>'#0c1119','icons'=>[['src'=>'/static/assets/argus-icon-192.png','sizes'=>'192x192','type'=>'image/png','purpose'=>'any maskable'],['src'=>'/static/assets/argus-icon-512.png','sizes'=>'512x512','type'=>'image/png','purpose'=>'any maskable']]],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE));
foreach(['client.html','portal.js','portal.css','docs.html'] as $file){
 if(!is_file("$root/public/static/$file"))throw new RuntimeException('ARGUS missing portal file '.$file);
}
echo "ARGUS Portal, QR separation, public documentation and interface patch applied\n";
