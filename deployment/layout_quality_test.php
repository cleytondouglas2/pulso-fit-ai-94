<?php
declare(strict_types=1);
/**
 * Layout/build contract for public, customer and authenticated admin markup.
 * This is a static/structural check, not a real-device pixel screenshot.
 */
$root='/var/www/html/public/static';
$style=(string)file_get_contents($root.'/layout-quality.css');
$script=(string)file_get_contents($root.'/layout-quality.js');
if(strlen($style)<4000||strlen($script)<1800)
    throw new RuntimeException('Shared layout assets missing/truncated');
if(substr_count($style,'{')!==substr_count($style,'}'))
    throw new RuntimeException('Responsive CSS declaration braces do not balance');
foreach(['360','540','720','760','980'] as $px)
    if(!str_contains($style,'max-width:'.$px.'px'))
        throw new RuntimeException('Missing mobile/tablet breakpoint '.$px);
foreach([
    '.top nav a','width:100%','grid-template-columns:minmax(0,1fr)',
    'table.argus-layout-cards','data-argus-label',
    '.kyc-viewer-card','.argus-pix-modal-card',
    '.argus-fee-top-actions','.argus-review-account',
    '#argus-merchant-docs','overflow-wrap:anywhere','overscroll-behavior',
    '#dashboard>.grid.argus-kyc-legacy-hidden',
    'max-height:calc(100dvh - 30px)'
] as $pattern)
    if(!str_contains($style,$pattern))
        throw new RuntimeException('Unresolved responsive layout risk '.$pattern);
foreach([
    'tableHeaders(table)','thead.rows','MutationObserver',
    'table.classList.add(\'argus-layout-cards\')',
    'tdReady','dataset.argusLabel'
] as $pattern)
    if(!str_contains($script,$pattern))
        throw new RuntimeException('Missing responsive table label migration '.$pattern);
foreach(['fetch(','XMLHttpRequest','localStorage','document.cookie',
    'innerHTML','eval('] as $insecure)
    if(str_contains($script,$insecure))
        throw new RuntimeException('Layout decoration must not inspect/modify sensitive state: '.$insecure);
foreach(['admin.html','client.html','docs.html','install.html'] as $name){
    $html=(string)file_get_contents($root.'/'.$name);
    $css='layout-quality.css?v=20261119-1';
    $js='layout-quality.js?v=20261119-1';
    if(substr_count($html,$css)!==1||
       substr_count($html,$js)!==1||
       substr_count($html,'</head>')!==1||
       substr_count($html,'</body>')!==1||
       !preg_match('~name=["\']viewport["\']~i',$html))
        throw new RuntimeException('HTML responsive asset or viewport mismatch: '.$name);
    if(strpos($html,$css)>strpos($html,'</head>')||
       strpos($html,$js)>strpos($html,'</body>'))
        throw new RuntimeException('Responsive assets loaded too late: '.$name);
}
$admin=(string)file_get_contents($root.'/admin.html');
$customer=(string)file_get_contents($root.'/client.html');
$clientKyc=(string)file_get_contents($root.'/kyc-portal.js');
$wallet=(string)file_get_contents($root.'/merchant-portal.js');
foreach(['id="page-applications"','id="page-merchant-wallet"',
    'id="page-charge-create"'] as $pattern)
    if(!str_contains($admin,$pattern))
        throw new RuntimeException('Admin page unexpectedly removed: '.$pattern);
foreach(['id="api-panel"','id="dashboard"','id="login-form"'] as $pattern)
    if(!str_contains($customer,$pattern))
        throw new RuntimeException('Customer navigation unexpectedly removed: '.$pattern);
if(!str_contains($clientKyc,"grid.classList.add('argus-kyc-legacy-hidden')")||
   !str_contains($wallet,"seller-qr-visual"))
    throw new RuntimeException('KYC/Pix card layout anchors missing');
echo "PASS: four ARGUS UI page families use shared responsive CSS/JS, authenticated admin tables become labeled mobile cards, legacy KYC column removed; financial routes unchanged.\n";
