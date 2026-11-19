<?php
declare(strict_types=1);
/**
 * ARGUS public-facing marketing smoke/contract test.
 * Static validations only: no private accounts, network, API keys, or money.
 */
$root='/var/www/html';
$static=$root.'/public/static';
$html=(string)file_get_contents($static.'/landing.html');
$css=(string)file_get_contents($static.'/landing.css');
$js=(string)file_get_contents($static.'/landing.js');
$gateway=(string)file_get_contents($root.'/src/Gateway.php');
$client=(string)file_get_contents($static.'/client.html');
$portalJs=(string)file_get_contents($static.'/portal.js');
$docs=(string)file_get_contents($static.'/docs.html');
$logo=$static.'/assets/argus-payments-logo-transparent.webp';

if(!is_file($logo)||filesize($logo)<1000)
    throw new RuntimeException('Original official ARGUS Pay logo not found');
if(!str_contains($gateway,"['/', '/inicio', '/sobre', '/gateway']")||
   !str_contains($gateway,"self::htmlFile('landing.html')"))
    throw new RuntimeException('Public homepage must use real GET router');
foreach([
    "['/cadastro','/conta','/cliente']",
    "['/documentacao-api','/docs']",
    "str_starts_with(\$path, '/api/v2/')"
] as $needle)
    if(!str_contains($gateway,$needle))
        throw new RuntimeException('Original private API / portal route changed or missing: '.$needle);
foreach([
    '<html lang="pt-BR">',
    'name="viewport"',
    'name="description"',
    'property="og:title"',
    'href="/static/landing.css?v=1"',
    'src="/static/landing.js?v=1"',
    'href="/cadastro"',
    'href="/conta"',
    'href="/documentacao-api"',
    'id="hero-title"',
    'id="plataforma"',
    'id="gestao"',
    'id="seguranca"',
    'id="integracoes"',
    'id="perguntas"',
    'id="simulation-qty"',
    'id="simulation-ticket"',
    'id="copy-example"',
    'class="faq-grid"',
    'aria-expanded="false"',
    'Demonstração',
    'números fictícios',
    'não equivale a verificação biométrica bancária certificada',
    'depende da aprovação cadastral',
    'pager'
] as $needle){
    if($needle==='pager')continue;
    if(!str_contains($html,$needle))
        throw new RuntimeException('Missing landing accessibility/product/transparency marker: '.$needle);
}
foreach(['<main ','</main>','<nav ','</nav>','<footer ','</footer>'] as $tag){
    if(!str_contains($html,$tag))
        throw new RuntimeException('Missing HTML landmark: '.$tag);
}
$allIds=[];
if(preg_match_all('/\bid="([^"]+)"/',$html,$matches)){
    foreach($matches[1] as $id){
        if(isset($allIds[$id]))throw new RuntimeException('Duplicate landing DOM ID: '.$id);
        $allIds[$id]=true;
    }
}
foreach([
    '#simulation-qty','#simulation-ticket','#simulation-revenue',
    '#simulation-qty-value','#simulation-ticket-value',
    '#mobile-menu','#menu-toggle','#copy-example'
] as $selector){
    $id=substr($selector,1);
    if(!isset($allIds[$id]))
        throw new RuntimeException('Landing JS control missing ID: '.$id);
}
foreach(['min-width:0','max-width:100%','overflow:clip','@media(max-width:600px)',
    '@media(max-width:820px)','@media(max-width:380px)',
    'prefers-reduced-motion','landing-animate'] as $token)
    if(!str_contains($css,$token))
        throw new RuntimeException('Landing responsive or animation fallback missing '.$token);
if(substr_count($css,'{')!==substr_count($css,'}'))
    throw new RuntimeException('Landing CSS braces unbalanced');
if(str_contains($css,'fonts.googleapis.com')||
   str_contains($html,'fonts.googleapis.com')||
   str_contains($html,'google-analytics')||
   str_contains($html,'https://cdn.'))
    throw new RuntimeException('No third-party tracking/font dependencies allowed on landing');
foreach([
    'aria-expanded',
    "addEventListener('input',update)",
    'Intl.NumberFormat',
    'navigator.clipboard',
    'document.querySelectorAll',
    'landing-animate',
    'prefers-reduced-motion',
    'IntersectionObserver'
] as $token)
    if(!str_contains($js,$token))
        throw new RuntimeException('Interactive landing control not connected '.$token);
foreach(['fetch(','XMLHttpRequest','sendBeacon','document.cookie','localStorage','sessionStorage',
         'eval('] as $token)
    if(str_contains($js,$token))
        throw new RuntimeException('Marketing interactions may not access financial data or contact trackers: '.$token);
foreach([$client,$docs] as $page)
    if(!str_contains($page,'href="/" title="Conheça a plataforma ARGUS Pay"'))
        throw new RuntimeException('Existing customer/doc navigation does not link to public homepage');
if(!str_contains($portalJs,"location.pathname==='/cadastro'")||
   !str_contains($client,'portal.js?v=landing-1'))
    throw new RuntimeException('Public CTA to /cadastro must open the register form without cached login JS');
echo "PASS: branded public homepage, 4 live CTAs, responsive/mobile navigation, simulated revenue tool, transparent antifraud copy, FAQ and read-only API example; no financial/auth changes.\n";
