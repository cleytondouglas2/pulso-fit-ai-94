<?php
declare(strict_types=1);
/**
 * ARGUS Pay public marketing homepage.
 * Executed only after all existing financial/security regression tests.
 * Does not change API, admin login, seller wallet or funds.
 */
$root='/var/www/html';
$gatewayPath=$root.'/src/Gateway.php';
$gateway=file_get_contents($gatewayPath);
$anchor='// Real-operation console: legacy demo pages, test checkout and demo login are removed.';
if(!is_string($gateway)||substr_count($gateway,$anchor)!==1)
    throw new RuntimeException('Landing route: expected GET routing anchor missing');
$routes=<<<'PHP'
            // Public presentation: no account is required, never expose credentials.
            // Existing private /admin, /conta and all /api routes are unchanged.
            if ($method === 'GET' && in_array($path, ['/', '/inicio', '/sobre', '/gateway'], true)) {
                self::htmlFile('landing.html');
                return;
            }
PHP;
$gateway=str_replace($anchor,$routes."\n            ".$anchor,$gateway);
if(file_put_contents($gatewayPath,$gateway)===false)
    throw new RuntimeException('Landing route: cannot write Gateway.php');

$static=$root.'/public/static';
foreach(['landing.html','landing.css','landing.js'] as $asset){
    if(!is_file($static.'/'.$asset)||filesize($static.'/'.$asset)<800)
        throw new RuntimeException('Landing asset missing: '.$asset);
}
foreach([
    'client.html'=>'<nav>',
    'docs.html'=>'<nav>'
] as $page=>$needle){
    $file=$static.'/'.$page;
    $html=file_get_contents($file);
    if(!is_string($html)||substr_count($html,$needle)!==1)
        throw new RuntimeException('Landing navigation anchor missing in '.$page);
    $link='<a href="/" title="Conheça a plataforma ARGUS Pay">Conhecer o ARGUS Pay</a>';
    if(str_contains($html,$link))
        throw new RuntimeException('Landing link already inserted '.$page);
    $html=str_replace($needle,$needle.$link,$html);
    if(file_put_contents($file,$html)===false)
        throw new RuntimeException('Landing navigation update failed '.$page);
}
echo "PASS: public ARGUS homepage and aliases connected; original customer/admin/API routes preserved.\n";
