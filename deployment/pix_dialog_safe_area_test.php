<?php
declare(strict_types=1);
/** Static runtime regression: no live Pix or external requests. */
$dir='/var/www/html/public/static/';
$css=(string)file_get_contents($dir.'pix-dialog-viewport.css');
foreach([
    'dialog.payment-dialog[open]',
    'position: fixed;',
    'height: 100dvh;',
    'max-height: none;',
    'overflow-y: auto;',
    'overscroll-behavior: contain;',
    '-webkit-overflow-scrolling: touch;',
    'env(safe-area-inset-top, 0px)',
    'env(safe-area-inset-bottom, 0px)',
    'dialog.payment-dialog[open] > .dialog-shell',
    'dialog.payment-dialog[open] .qr-stage .qr',
    'dialog.payment-dialog[open] .dialog-actions'
] as $needle)if(!str_contains($css,$needle))
    throw new RuntimeException('Pix modal safe-area/scroll CSS missing: '.$needle);
foreach(['public-pix','reseller-public-pix'] as $name){
    $html=(string)file_get_contents($dir.$name.'.html');
    $js=(string)file_get_contents($dir.$name.'.js');
    if(substr_count($html,'pix-dialog-viewport.css?v=20261123-ios-scroll-1')!==1||
       substr_count($html,$name.'.js?v=20261123-ios-scroll-1')!==1)
        throw new RuntimeException('Mobile Pix cache invalidation failed: '.$name);
    if(!str_contains($js,'dialog.scrollTop=0;')||
       !str_contains($js,'requestAnimationFrame(()=>{')||
       !str_contains($js,'if(dialog.open)dialog.scrollTop=0;')||
       !str_contains($js,'if(!dialog.open)dialog.showModal();'))
        throw new RuntimeException('Mobile Pix dialog does not reset scroll: '.$name);
    foreach([
      "QRCode(qr,",
      "pix-copy",
      "showStatus(charge)",
      "pix-verify",
      "pix-new",
      "active={id:charge.id,token",
      "verify(false)"
    ] as $needle)if(!str_contains($js,$needle))
        throw new RuntimeException('Pix issuance or verification UI was modified: '.$name.' '.$needle);
}
$h=(string)file_get_contents($dir.'reseller-public-pix.html');
if(!str_contains($h,'reseller-modal-recipient')||
   !str_contains($h,'id="reseller-dialog-business"'))
    throw new RuntimeException('The seller recipient header was lost');
if(stripos($h,'MisticPay')!==false)
    throw new RuntimeException('Underlying acquirer brand leaked to seller checkout');
echo "PASS: /pix and seller /e/code dialogs scroll from top in iOS Safari, safe-area and mobile controls verified; zero real Pix.\n";
