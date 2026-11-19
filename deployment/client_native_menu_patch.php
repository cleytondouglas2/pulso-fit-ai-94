<?php
declare(strict_types=1);
/**
 * Fix from iOS user screenshots. Renders the phone menu as native HTML so
 * the header can never depend on a delayed JS class/DOM insertion.
 * Must be run AFTER client_mobile_layout_patch.php and landing_route_patch.php.
 */
$root='/var/www/html/public/static';
$file=$root.'/client.html';
$html=file_get_contents($file);
if(!is_string($html)||substr_count($html,'</head>')!==1||
   substr_count($html,'</body>')!==1)
    throw new RuntimeException('Native iOS client menu: invalid HTML');

$pattern='~<header class="top">(<a class="brand" href="/conta">.*?</a>)<nav>(.*?)</nav></header>~s';
if(preg_match_all($pattern,$html,$matches)!==1)
    throw new RuntimeException('Native iOS client menu: original header anchor changed');
$brand=$matches[1][0];
$links=$matches[2][0];
if(substr_count($links,'href="/documentacao-api"')!==1||
   substr_count($links,'href="/instalar"')!==1||
   substr_count($links,'href="/"')!==1)
    throw new RuntimeException('Native menu: essential customer links missing');
$replacement='<header class="top argus-client-top">'.$brand.
    '<nav class="argus-desktop-nav" aria-label="Navegação do cliente">'.$links.'</nav>'.
    '<details class="argus-mobile-details" id="argus-mobile-details">'.
      '<summary aria-label="Abrir ou fechar menu da conta">☰ Menu</summary>'.
      '<nav class="argus-mobile-nav" aria-label="Navegação móvel do cliente">'.$links.'</nav>'.
    '</details></header>';
$html=preg_replace($pattern,$replacement,$html,1,$changed);
if(!is_string($html)||$changed!==1)
    throw new RuntimeException('Native iOS client menu: cannot replace header');

// Keep the inline minimal fallback in the HTML. Unlike external CSS, these
// rules survive an aggressive Safari/PWA resource cache and cannot load late.
$critical=<<<'CSS'
<style id="argus-ios-header-critical">
@media(max-width:760px){
 header.top.argus-client-top{position:relative!important;top:auto!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;height:auto!important;min-height:70px!important;max-height:none!important;padding:12px 15px!important;overflow:visible!important}
 header.top.argus-client-top>.brand{grid-column:1!important;grid-row:1!important;width:calc(100% - 113px)!important;min-width:0!important}
 header.top.argus-client-top>nav.argus-desktop-nav{display:none!important}
 header.top.argus-client-top>details.argus-mobile-details{grid-column:1!important;grid-row:1!important;width:100%!important;display:block!important;pointer-events:none!important}
 header.top.argus-client-top>details.argus-mobile-details>summary{display:flex!important;justify-content:center!important;align-items:center!important;width:101px!important;margin:0 0 0 auto!important;min-height:46px!important;pointer-events:auto!important}
 header.top.argus-client-top>details.argus-mobile-details>nav.argus-mobile-nav{position:static!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;width:100%!important;max-width:100%!important;pointer-events:auto!important}
 header.top.argus-client-top>details.argus-mobile-details:not([open])>nav.argus-mobile-nav{display:none!important}
 #dashboard .seller-checkbox input[type="checkbox"]{width:21px!important;min-width:21px!important;max-width:21px!important;height:21px!important;min-height:21px!important;max-height:21px!important;padding:0!important;flex:0 0 21px!important}
}
</style>
CSS;
$html=str_replace('</head>',
    '<link rel="stylesheet" href="/static/client-native-menu.css?v=native-20261119-4">'.
    $critical.'</head>',$html);
if(file_put_contents($file,$html)===false)
    throw new RuntimeException('Native iOS client menu: could not publish HTML');

// Serve fresh signup/account HTML even when an installed home-screen PWA was
// opened from the formerly cacheable /cadastro route.
$apache='/etc/apache2/conf-available/argus-security.conf';
$conf=file_get_contents($apache);
$old='SetEnvIf Request_URI "^/(api/|conta(?:/|$)|admin(?:/|$))" ARGUS_PRIVATE=1';
$new='SetEnvIf Request_URI "^/(api/|conta(?:/|$)|admin(?:/|$)|cadastro(?:/|$)|cliente(?:/|$))" ARGUS_PRIVATE=1';
if(!is_string($conf)||substr_count($conf,$old)!==1)
    throw new RuntimeException('Native iOS client menu: private-page cache policy changed');
$conf=str_replace($old,$new,$conf);
if(file_put_contents($apache,$conf)===false)
    throw new RuntimeException('Native iOS client menu: cannot protect registration HTML from caching');
echo "PASS: native iOS menu rendered in HTML (no JavaScript dependency), scroll-safe header, no-store cadastro, checkbox geometry and versioned CSS.\n";
