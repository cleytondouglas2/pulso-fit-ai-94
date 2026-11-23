<?php
declare(strict_types=1);
/**
 * Actual missing Pix link fix: binding detached-card controls with
 * document.getElementById() throws null and prevents insertion into
 * the live reseller overview. The corrected asset binds on root itself.
 * Bump URLs to bypass mobile Safari/app caches. No money operations.
 */
$root='/var/www/html/public/static/';
$file=$root.'client.html';
$html=file_get_contents($file);
if(!is_string($html))throw new RuntimeException('No reseller client HTML');
$versions=[
    'reseller-public-link.js?v=20261123-overview-2'=>
        'reseller-public-link.js?v=20261123-overview-3',
    'reseller-public-link.css?v=20261123-overview-2'=>
        'reseller-public-link.css?v=20261123-overview-3',
];
foreach($versions as $old=>$new){
    if(substr_count($html,$old)!==1)
        throw new RuntimeException('Reseller hotfix asset reference changed: '.$old);
    $html=str_replace($old,$new,$html);
}
if(file_put_contents($file,$html)===false)
    throw new RuntimeException('Cannot apply reseller frontend cache version');
$script=(string)file_get_contents($root.'reseller-public-link.js');
if(!str_contains($script,"root.querySelector('#argus-rpl-copy').addEventListener('click',copy)")||
   !str_contains($script,"root.querySelector('#argus-rpl-share').addEventListener('click',share)")||
   str_contains($script,"$('argus-rpl-copy').addEventListener('click',copy)"))
    throw new RuntimeException('Reseller Pix link listener must bind before detached card insertion');
echo "PASS: Pix public link now attaches controls on its own detached card before insertion; latest version served to mobile browsers.\n";
