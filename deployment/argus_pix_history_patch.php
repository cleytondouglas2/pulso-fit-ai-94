<?php
declare(strict_types=1);
/**
 * Unified traditional Pix history.
 * Adds a read-only recent QR area without touching payment creation, provider
 * signatures, money movements, authorizations, previous KYC or the original UI.
 */
$root='/var/www/html/public/static';
$path=$root.'/admin.html';
$src=file_get_contents($path);
if(!is_string($src)||substr_count($src,'</head>')!==1||substr_count($src,'</body>')!==1)
    throw new RuntimeException('ARGUS Pix history: malformed admin HTML');
foreach([
    'quick-pix-autostatus.js?v=3'=>'quick-pix-autostatus.js?v=4',
    'quick-pix-popup.js?v=3'=>'quick-pix-popup.js?v=4',
] as $old=>$new){
    if(substr_count($src,$old)!==1)
        throw new RuntimeException('ARGUS Pix history: missing cache version '.$old);
    $src=str_replace($old,$new,$src);
}
$src=str_replace('</head>',
    '<link rel="stylesheet" href="/static/quick-pix-history.css?v=1"></head>',$src);
$src=str_replace('</body>',
    '<script src="/static/quick-pix-history.js?v=1" defer></script></body>',$src);
if(substr_count($src,'id="charge-placeholder"')!==1||
   substr_count($src,'id="charge-receipt"')!==1||
   substr_count($src,'id="payment-rows"')!==1)
    throw new RuntimeException('ARGUS Pix history: original charge and transaction UI must remain intact');
file_put_contents($path,$src);

// Stale Safari clients may still send qpx_ to Finance's /charges route.
// Only legacy qpx_ reconciliation POST is forwarded to the existing, authenticated
// traditional route. Authorization, CSRF and MFA have ALREADY been checked by Admin.
$path='/var/www/html/src/Admin.php';
$admin=file_get_contents($path);
$anchor=<<<'PHP'
if(getenv('ARGUS_QUICK_PIX_PROVIDER')==='traditional' && str_starts_with($path,'/api/admin/quick-pix'))TraditionalQuickPix::handle($db,$method,$path,$actor);
PHP;
if(!is_string($admin)||substr_count($admin,$anchor)!==1)
    throw new RuntimeException('ARGUS Pix history: authenticated traditional API route missing');
$adapter=<<<'PHP'
if(getenv('ARGUS_QUICK_PIX_PROVIDER')==='traditional' && $method==='POST' &&
           preg_match('~^/api/admin/charges/(qpx_[a-f0-9]{32})/reconcile$~D',$path,$legacy)){
            TraditionalQuickPix::handle($db,'POST','/api/admin/quick-pix/'.$legacy[1].'/reconcile',$actor);
        }
PHP;
$admin=str_replace($anchor,$adapter."\n        ".$anchor,$admin);
file_put_contents($path,$admin);
echo "ARGUS: recent QR cards and same popup enabled; 30min expiry; old Finance reconciliation routed safely to traditional Pix.\n";
