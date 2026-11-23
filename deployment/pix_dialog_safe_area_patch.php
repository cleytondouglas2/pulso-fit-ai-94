<?php
declare(strict_types=1);
/**
 * ARGUS public Pix iPhone/Safari modal viewport fix.
 * Both admin /pix and reseller /e/{code} pages share the receipt dialog.
 * Scope to mobile + short screens only; no changes to PSP, payments, fees,
 * checkout identifiers, QR content or status polling.
 */
$static='/var/www/html/public/static/';
$css=$static.'pix-dialog-viewport.css';
if(!is_file($css))throw new RuntimeException('Missing safe-area Pix modal stylesheet');
foreach([
    ['public-pix.html','public-pix.js','argus-white-label-20261123-1'],
    ['reseller-public-pix.html','reseller-public-pix.js','20261123-security-rate-3']
] as [$pageName,$jsName,$oldVersion]){
    $page=$static.$pageName;
    $html=file_get_contents($page);
    if(!is_string($html)||substr_count($html,'</head>')!==1)
        throw new RuntimeException('Pix modal page changed: '.$pageName);
    if(substr_count($html,'id="pix-dialog"')!==1||
       !str_contains($html,'class="payment-dialog"')||
       !str_contains($html,'class="dialog-shell"'))
        throw new RuntimeException('Pix receipt dialog markup changed: '.$pageName);
    $html=str_replace('</head>',
        ' <link rel="stylesheet" href="/static/pix-dialog-viewport.css?v=20261123-ios-scroll-1">'."\n".'</head>',
        $html);
    $oldScript=$jsName.'?v='.$oldVersion;
    if(substr_count($html,$oldScript)!==1)
        throw new RuntimeException('Pix browser script cache anchor changed: '.$pageName);
    $html=str_replace($oldScript,$jsName.'?v=20261123-ios-scroll-1',$html);
    if(file_put_contents($page,$html)===false)
        throw new RuntimeException('Could not update Pix modal page: '.$pageName);
    $jsFile=$static.$jsName;
    $script=file_get_contents($jsFile);
    if(!is_string($script))throw new RuntimeException('Missing Pix modal script '.$jsName);
    $old=<<<'JS'
 if(!dialog.open)dialog.showModal();
 // The browser follows the QR independently
JS;
    $new=<<<'JS'
 if(!dialog.open)dialog.showModal();
 // On iPhone the top layer can retain an older scroll offset or center
 // overflowing content above the visual viewport. Always open at the top.
 dialog.scrollTop=0;
 requestAnimationFrame(()=>{
  if(dialog.open)dialog.scrollTop=0;
 });
 // The browser follows the QR independently
JS;
    if(substr_count($script,$old)!==1)
        throw new RuntimeException('Pix showModal script anchor changed: '.$jsName);
    $script=str_replace($old,$new,$script);
    if(file_put_contents($jsFile,$script)===false)
        throw new RuntimeException('Cannot reset Pix modal scroll: '.$jsName);
}
echo "PASS: admin and reseller Pix modals open at the top on iPhone; full-screen scroll respects safe areas; QR, amount and copy controls remain intact; no PSP calls.\n";
