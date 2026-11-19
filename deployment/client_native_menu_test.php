<?php
declare(strict_types=1);
/** ARGUS iPhone native header contract, after the Docker build applies patch. */
$dir='/var/www/html/public/static/';
$h=(string)file_get_contents($dir.'client.html');
$c=(string)file_get_contents($dir.'client-native-menu.css');
$conf=(string)file_get_contents('/etc/apache2/conf-available/argus-security.conf');
$js=(string)file_get_contents($dir.'client-mobile-fix.js');
if(!str_contains($h,'<header class="top argus-client-top">')||
   !str_contains($h,'<details class="argus-mobile-details" id="argus-mobile-details">')||
   !str_contains($h,'<nav class="argus-desktop-nav"')||
   !str_contains($h,'<nav class="argus-mobile-nav"')||
   !str_contains($h,'<summary aria-label="Abrir ou fechar menu da conta">')||
   !str_contains($h,'client-native-menu.css?v=native-20261119-4')||
   !str_contains($h,'id="argus-ios-header-critical"'))
    throw new RuntimeException('Native iPhone signup header missing');
if(str_contains($h,'<header class="top"><a class="brand"'))
    throw new RuntimeException('Old sticky desktop header still mounted as customer header');
if(substr_count($h,'<header class="top argus-client-top">')!==1||
   substr_count($h,'id="argus-mobile-details"')!==1||
   substr_count($h,'<details ')!==1||
   substr_count($h,'</details>')!==1)
    throw new RuntimeException('Broken mobile menu or duplicate top header');
if(!preg_match('~<header class="top argus-client-top">(.*?)</header>~s',$h,$matched))
    throw new RuntimeException('Native menu header cannot be located');
foreach(['/documentacao-api','/instalar','/conta#api-panel'] as $url){
    if(substr_count($matched[1],'href="'.$url.'"')!==2)
        throw new RuntimeException('Desktop/mobile navigation links differ: '.$url);
}
foreach([
 'header.top.argus-client-top',
 'position:relative!important',
 '>nav.argus-desktop-nav{display:none!important}',
 '>details.argus-mobile-details:not([open])>nav.argus-mobile-nav',
 'pointer-events:auto!important',
 'width:21px!important',
 'height:21px!important',
 '@media(max-width:760px)'
] as $token)if(!str_contains($c,$token))
    throw new RuntimeException('Native menu / checkbox CSS missing: '.$token);
if(substr_count($c,'{')!==substr_count($c,'}'))
    throw new RuntimeException('Native customer menu CSS braces not balanced');
if(!str_contains($conf,'cadastro(?:/|$)|cliente(?:/|$)')||
   !str_contains($conf,'Cache-Control "private, no-store, max-age=0"'))
    throw new RuntimeException('Safari can retain old signup / cliente HTML');
if(!str_contains($js,"if(!top||top.classList.contains('argus-client-top'))return"))
    throw new RuntimeException('Old JS must not create duplicate hamburger on server-rendered header');
foreach(['id="register-form"','id="login-form"','id="dashboard"','id="api-panel"',
         '/static/portal.js?v=mobile-nov19-2',
         '/static/merchant-portal.js?v=mobile-nov19-2'] as $token)
    if(!str_contains($h,$token))
        throw new RuntimeException('Existing customer financial/signup UI unexpectedly altered '.$token);
echo "PASS: no-JS native iPhone menu, user-controlled accordion does not stick during scroll, signup HTML no-store, desktop navigation and original financial/login markup intact.\n";
