<?php
declare(strict_types=1);
/**
 * Two truly separate installable ARGUS Pay experiences. Previously the same
 * /conta PWA manifest was included on /admin, forcing even admin installs
 * to launch the reseller portal.
 *
 * This changes only public manifest/HTML/install-guide metadata + GET routes.
 * All authenticated endpoints, providers, fees, payments and wallets remain.
 */
$root='/var/www/html';
$static=$root.'/public/static';
$original=$static.'/manifest.webmanifest';
$manifest=json_decode((string)file_get_contents($original),true,32,JSON_THROW_ON_ERROR);
if(!is_array($manifest)||!isset($manifest['icons'])||count($manifest['icons'])<2)
    throw new RuntimeException('ARGUS install split: existing brand manifest unavailable');

$adminManifest=$manifest;
$adminManifest['id']='/argus-admin-pwa';
$adminManifest['name']='ARGUS Pay · Administração';
$adminManifest['short_name']='ARGUS Admin';
$adminManifest['description']='Painel administrativo ARGUS Pay.';
$adminManifest['start_url']='/admin';
$adminManifest['scope']='/admin';
$adminManifest['display']='standalone';

$resellerManifest=$manifest;
$resellerManifest['id']='/argus-revenda-pwa';
$resellerManifest['name']='ARGUS Pay · Revendedor';
$resellerManifest['short_name']='ARGUS Revenda';
$resellerManifest['description']='Painel do revendedor ARGUS Pay.';
$resellerManifest['start_url']='/conta';
$resellerManifest['scope']='/conta';
$resellerManifest['display']='standalone';

$encode=static fn(array $m):string=>json_encode(
    $m,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);
if(file_put_contents($static.'/manifest-admin.webmanifest',$encode($adminManifest))===false ||
   file_put_contents($original,$encode($resellerManifest))===false)
    throw new RuntimeException('ARGUS install split: cannot write independent manifests');

$adminGuide=(string)file_get_contents($static.'/install.html');
if(!str_contains($adminGuide,'href="/conta"')||
   !str_contains($adminGuide,'Instale o ARGUS Pay no seu celular'))
    throw new RuntimeException('ARGUS install split: seller guide template changed');
$adminGuide=str_replace([
  'href="/conta"',
  'Minha conta ARGUS',
  'Instale o ARGUS Pay no seu celular',
  'ARGUS PAYMENTS · SEU APP NA TELA INICIAL',
  'Acesse sua conta rapidamente, acompanhe seus recebimentos e receba notificações de Pix e comunicados.',
  'Entrar na minha conta',
  'Instalar ARGUS agora',
  'Entre na conta, toque',
  'Entre na conta e toque',
],[
  'href="/admin"',
  'Painel ARGUS Admin',
  'Instale o ARGUS Admin no seu celular',
  'ARGUS PAY · PAINEL ADMINISTRATIVO',
  'Acesse diretamente o painel administrativo, sem ser enviado ao painel de revendas. Notificações dependem da sua autorização.',
  'Abrir painel administrativo',
  'Instalar ARGUS Admin',
  'Entre no painel administrativo, toque',
  'Entre no painel administrativo e toque',
],$adminGuide);
$adminGuide=str_replace(
  '<div class="cards">',
  '<p class="note"><b>Atalho exclusivo do administrador.</b> Depois de instalado, ele sempre inicia em <strong>/admin</strong>, sem encaminhar ao painel do revendedor.</p><div class="cards">',
  $adminGuide
);
if(file_put_contents($static.'/install-admin.html',$adminGuide)===false)
    throw new RuntimeException('ARGUS install split: cannot write admin installation guide');

function argusPwaHtml(string $path,string $manifestUrl,string $title):void {
    $s=file_get_contents($path);
    if(!is_string($s)||substr_count($s,'</head>')!==1)
        throw new RuntimeException('ARGUS install split: HTML missing '.basename($path));
    $pattern='~<link\b(?=[^>]*\brel\s*=\s*["\x27]manifest["\x27])[^>]*>~i';
    $s=preg_replace($pattern,'',$s,-1,$count);
    if(!is_string($s)||$count!==1)
        throw new RuntimeException('ARGUS install split: manifest not unique in '.basename($path));
    // Safari uses this title when saving the standalone home-screen shortcut.
    $s=preg_replace('~<meta\b(?=[^>]*\bname\s*=\s*["\x27]apple-mobile-web-app-title["\x27])[^>]*>~i','',$s);
    $s=preg_replace('~<meta\b(?=[^>]*\bname\s*=\s*["\x27]apple-mobile-web-app-capable["\x27])[^>]*>~i','',$s);
    if(!is_string($s))throw new RuntimeException('ARGUS install split: meta rewrite failed');
    $tags='<meta name="apple-mobile-web-app-title" content="'.$title.'">'.
          '<meta name="apple-mobile-web-app-capable" content="yes">'.
          '<link rel="manifest" href="'.$manifestUrl.'">';
    $s=str_replace('</head>',$tags.'</head>',$s);
    if(file_put_contents($path,$s)===false)
        throw new RuntimeException('ARGUS install split: cannot update '.basename($path));
}

$adminUrl='/static/manifest-admin.webmanifest?v=admin-20261123-v8';
$resellerUrl='/static/manifest.webmanifest?v=revenda-20261123-v8';
argusPwaHtml($static.'/admin.html',$adminUrl,'ARGUS Admin');
foreach(['client.html','install.html','docs.html','install-admin.html'] as $file){
    argusPwaHtml($static.'/'.$file,
        $file==='install-admin.html'?$adminUrl:$resellerUrl,
        $file==='install-admin.html'?'ARGUS Admin':'ARGUS Revenda');
}

$adminHtml=$static.'/admin.html';
$h=(string)file_get_contents($adminHtml);
$h=str_replace('href="/instalar"','href="/admin/instalar"',$h);
file_put_contents($adminHtml,$h);

$clientHtml=$static.'/client.html';
$h=(string)file_get_contents($clientHtml);
$h=str_replace('href="/instalar"','href="/conta/instalar"',$h);
file_put_contents($clientHtml,$h);

$path=$root.'/src/Gateway.php';
$gateway=file_get_contents($path);
$anchor="if (\$method === 'GET' && \$path === '/instalar') {self::htmlFile('install.html');return;}";
if(!is_string($gateway)||substr_count($gateway,$anchor)!==1)
    throw new RuntimeException('ARGUS install split: public install route anchor changed');
$routes=<<<'PHP'
if ($method === 'GET' && $path === '/instalar') {
    header('Location: /conta/instalar',true,302);
    return;
}
if ($method === 'GET' && $path === '/conta/instalar') {
    self::htmlFile('install.html');
    return;
}
if ($method === 'GET' && $path === '/admin/instalar') {
    self::htmlFile('install-admin.html');
    return;
}
PHP;
$gateway=str_replace($anchor,$routes,$gateway);
if(file_put_contents($path,$gateway)===false)
    throw new RuntimeException('ARGUS install split: route write unavailable');
echo "PASS: distinct ARGUS Admin /admin and ARGUS Revenda /conta Android/iOS install identity and launch URL; dedicated install guides; no Pix changes.\n";
