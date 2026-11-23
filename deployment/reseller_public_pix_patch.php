<?php
declare(strict_types=1);
$root='/var/www/html';
function resellerPublicReplace(string $path,string $from,string $to,string $name):void{
    $s=file_get_contents($path);
    if(!is_string($s)||substr_count($s,$from)!==1)
        throw new RuntimeException('Reseller public Pix integration anchor changed: '.$name);
    if(file_put_contents($path,str_replace($from,$to,$s))===false)
        throw new RuntimeException('Reseller public Pix file write failed: '.$name);
}
$gateway=$root.'/src/Gateway.php';
resellerPublicReplace($gateway,
    "require_once __DIR__ . '/PublicAdminPix.php';",
    "require_once __DIR__ . '/PublicAdminPix.php';\nrequire_once __DIR__ . '/ResellerPublicPix.php';",
    'reseller Pix class bootstrap');
$routes=<<<'PHP'
            // Unique seller-scoped /e/{code} public Pix checkout. A public
            // code is only a payment landing URL, NEVER account permission.
            if($method==='GET'&&preg_match('~^/e/[a-f0-9]{32}/?$~D',$path)){
                self::htmlFile('reseller-public-pix.html');
                return;
            }
            if(preg_match('~^/e/[a-f0-9]{32}/(config|quote|create|status)$~D',$path)){
                $sellerCheckoutDb=new Database(self::$config);
                $sellerCheckoutDb->installAndSeed();
                ResellerPublicPix::handle($sellerCheckoutDb,$method,$path);
                return;
            }
PHP;
resellerPublicReplace($gateway,
    '// Real-operation console: legacy demo pages, test checkout and demo login are removed.',
    $routes.'// Real-operation console: legacy demo pages, test checkout and demo login are removed.',
    'seller public Pix routes before private fallback');

$portal=$root.'/src/Portal.php';
resellerPublicReplace($portal,
    "            IdentityProfile::store(\$db,'portal',\$id,\$type,\$name,\$number);",
    "            IdentityProfile::store(\$db,'portal',\$id,\$type,\$name,\$number);\n            ResellerPublicPix::linkForAccount(\$db,\$id);",
    'create stable unique link at seller registration');
resellerPublicReplace($portal,
    "        if(\$method!=='GET')self::csrf(\$account);",
    "        if(\$method!=='GET')self::csrf(\$account);\n".
    "        if(\$method==='GET'&&\$path==='/api/portal/public-pix-link')\n".
    "            self::out(ResellerPublicPix::myLink(\$db,\$account));",
    'authenticated seller public link retrieval');

$src=$root.'/public/static/';
$public=file_get_contents($src.'public-pix.html');
$js=file_get_contents($src.'public-pix.js');
if(!is_string($public)||!is_string($js))
    throw new RuntimeException('Existing Argus public checkout unavailable');
$publicReplace=static function(string $old,string $new,string $description)use(&$public):void{
    if(substr_count($public,$old)!==1)throw new RuntimeException('Seller checkout HTML: '.$description);
    $public=str_replace($old,$new,$public);
};
$publicReplace('<title>Gerar Pix | ARGUS Pay</title>',
    '<title>Pague com Pix | ARGUS Pay</title>','page title');
$publicReplace('<link rel="stylesheet" href="/static/public-pix.css?v=pix-premium-20261123-1">',
    '<link rel="stylesheet" href="/static/public-pix.css?v=pix-premium-20261123-1"><link rel="stylesheet" href="/static/reseller-public-pix.css?v=20261123-1">',
    'reseller theme');
$publicReplace('<script src="/static/public-pix.js?v=argus-white-label-20261123-1" defer></script>',
    '<script src="/static/reseller-public-pix.js?v=20261123-1" defer></script>',
    'reseller checkout script');
$publicReplace('Seu Pix, do jeito <em>mais simples.</em>',
    'Pague com Pix, <em>com segurança.</em>','reseller headline');
$publicReplace('Escolha o valor, confira a taxa e gere um QR Code Pix para pagar diretamente pelo aplicativo do seu banco.',
    'Informe o valor, confira a taxa de serviço ARGUS Pay e pague usando o aplicativo do seu banco.',
    'reseller introduction');
$publicReplace('<div class="intro-chips">',
    '<div class="reseller-public-merchant" id="reseller-public-merchant"><span>RECEBEDOR ARGUS PAY</span><strong id="reseller-public-business">Carregando estabelecimento...</strong><small id="reseller-public-availability">Consultando disponibilidade do Pix</small></div><div class="intro-chips">',
    'merchant identity');
$publicReplace('O pagamento é disponibilizado pela ARGUS Pay. A confirmação aparece somente após validação da transação Pix.',
    'Este pagamento é destinado ao revendedor identificado acima. O QR Code e a confirmação são processados pela ARGUS Pay.',
    'seller recipient');
$publicReplace('<span>Valor-base do pagamento</span>',
    '<span>Valor líquido previsto para o revendedor</span>',
    'seller net amount label');
$publicReplace('<p>Preencha o valor que deseja pagar.</p>',
    '<p>Valor da compra, taxa e QR Code em um só lugar.</p>',
    'seller checkout summary');
$publicReplace('<div class="dialog-shell">',
    '<div class="dialog-shell"><div class="reseller-modal-recipient">Recebedor <strong id="reseller-dialog-business">ARGUS Pay</strong></div>',
    'recipient visible in modal');
if(preg_match('/Mistic[\s_-]*Pay/i',$public))
    throw new RuntimeException('Seller Pix public page discloses acquiring provider');
if(file_put_contents($src.'reseller-public-pix.html',$public)===false)
    throw new RuntimeException('Cannot build seller public Pix HTML');

function sellerJSReplace(string &$js,string $old,string $new,string $name):void {
    if(substr_count($js,$old)!==1)throw new RuntimeException('Seller public Pix JS anchor: '.$name);
    $js=str_replace($old,$new,$js);
}
$sellerInit=<<<'JS'
const match=location.pathname.match(/^\/e\/([a-f0-9]{32})\/?$/);
const resellerBase=match?'/e/'+match[1]:'';
let resellerReady=false;
async function loadReseller(){
 if(!resellerBase)return;
 try{
  const result=await api(resellerBase+'/config');
  const business=String(result.business_name||'Revendedor ARGUS Pay').slice(0,90);
  $('reseller-public-business').textContent=business;
  $('reseller-dialog-business').textContent=business;
  resellerReady=result.can_generate===true;
  $('reseller-public-availability').textContent=resellerReady?
   'Pix público disponível • ARGUS Pay':
   'O recebimento ficará disponível após aprovação financeira da conta.';
 }catch(_){
  resellerReady=false;
  $('reseller-public-business').textContent='Revendedor ARGUS Pay';
  $('reseller-public-availability').textContent='Link não disponível no momento';
 }
}
JS;
sellerJSReplace($js,
    "const \$=id=>document.getElementById(id);",
    "const \$=id=>document.getElementById(id);\n".$sellerInit,
    'dynamic reseller link');
sellerJSReplace($js,
    "const enabled=!busy&&canGenerate&&quote&&v===quote.base_amount_cents&&agree.checked;",
    "const enabled=!busy&&resellerReady&&canGenerate&&quote&&v===quote.base_amount_cents&&agree.checked;",
    'disable generation until account approved');
sellerJSReplace($js,
    "const data=await api('/pix/quote?amount_cents='+encodeURIComponent(v));",
    "const data=await api(resellerBase+'/quote?amount_cents='+encodeURIComponent(v));",
    'seller-specific quote');
sellerJSReplace($js,
    "const fresh=await api('/pix/quote?amount_cents='+value);",
    "const fresh=await api(resellerBase+'/quote?amount_cents='+value);",
    'fresh fee confirmation');
sellerJSReplace($js,
    "const response=await api('/pix/create',{method:'POST',body:JSON.stringify({",
    "const response=await api(resellerBase+'/create',{method:'POST',body:JSON.stringify({",
    'seller-specific create');
sellerJSReplace($js,
    "const result=await api('/pix/status',{method:'POST',",
    "const result=await api(resellerBase+'/status',{method:'POST',",
    'seller-specific status');
sellerJSReplace($js,
    "!Number.isInteger(q.provider_fee_cents)",
    "!Number.isInteger(q.service_fee_cents)",
    'seller quote shape must validate total service fee');
sellerJSReplace($js,
    "money(q.provider_fee_cents);",
    "money(q.service_fee_cents);",
    'total reseller service fee');
sellerJSReplace($js,
    "money(q.admin_expected_net_cents);",
    "money(q.seller_expected_net_cents);",
    'seller net accurate');
sellerJSReplace($js,
    "if(!quote||quote.base_amount_cents!==value||!canGenerate)",
    "if(!quote||quote.base_amount_cents!==value||!canGenerate||!resellerReady)",
    'only approved seller can create');
sellerJSReplace($js,
    "  if(!response?.charge?.id)throw new Error('O provedor não confirmou a emissão. Consulte o atendimento antes de tentar novamente.');",
    "  if(!response?.charge?.id)throw new Error('A ARGUS Pay não confirmou a emissão. Verifique a cobrança antes de tentar novamente.');",
    'seller brand only');
sellerJSReplace($js,
    "price();\n})();",
    "loadReseller().then(()=>price());\n})();",
    'seller metadata fetch on load');
if(preg_match('/Mistic[\s_-]*Pay/i',$js))
    throw new RuntimeException('Seller public Pix JS discloses underlying acquiring provider');
if(file_put_contents($src.'reseller-public-pix.js',$js)===false)
    throw new RuntimeException('Cannot build seller public Pix JS');

$client=$src.'client.html';
if(substr_count((string)file_get_contents($client),'</head>')!==1||
   substr_count((string)file_get_contents($client),'</body>')!==1)
    throw new RuntimeException('Seller dashboard asset injection unavailable');
resellerPublicReplace($client,'</head>',
    '<link rel="stylesheet" href="/static/reseller-public-link.css?v=20261123-1"></head>',
    'new account Pix landing card theme');
resellerPublicReplace($client,'</body>',
    '<script defer src="/static/reseller-public-link.js?v=20261123-1"></script></body>',
    'new account Pix landing card');
echo "PASS: /e/{unique_code} public ARGUS Pay checkout mapped to merchant wallet, dynamic fees, seller-specific QR, registration + dashboard link, no external acquiring name.\n";
