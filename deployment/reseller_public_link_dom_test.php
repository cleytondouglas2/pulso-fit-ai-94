<?php
declare(strict_types=1);
/** Regression for the actual client-side null-reference that hid Pix CTA. */
$path='/var/www/html/public/static/';
$html=(string)file_get_contents($path.'client.html');
$script=(string)file_get_contents($path.'reseller-public-link.js');
$css=(string)file_get_contents($path.'reseller-public-link.css');
$dash=(string)file_get_contents($path.'reseller-dashboard.js');
foreach([
 'reseller-public-link.js?v=20261123-overview-3',
 'reseller-public-link.css?v=20261123-overview-3'
] as $needle)if(substr_count($html,$needle)!==1)
    throw new RuntimeException('Reseller Pix browser cache not invalidated: '.$needle);
foreach([
 "root.querySelector('#argus-rpl-copy').addEventListener('click',copy)",
 "root.querySelector('#argus-rpl-share').addEventListener('click',share)",
 "overview.insertBefore(root,top)",
 "overview.closest('#argus-reseller-workspace')",
 "root.innerHTML=markup",
 "root.querySelector('h2').id='argus-rpl-heading'",
 "reseller-public-link",
 "'/api/portal/public-pix-link'",
 "setInterval(tick,2500)"
] as $needle)if(!str_contains($script,$needle))
    throw new RuntimeException('Pix CTA registration/mount regression: '.$needle);
if(str_contains($script,"$('argus-rpl-copy').addEventListener('click',copy)")||
   str_contains($script,"$('argus-rpl-share').addEventListener('click',share)"))
    throw new RuntimeException('Detached elements cannot be found via document ID lookup');
if(strpos($script,"root.querySelector('#argus-rpl-copy')")>
   strpos($script,'overview.insertBefore(root,top)'))
    throw new RuntimeException('Pix listener must be created before mounting');
if(!str_contains($dash,'argus-reseller-page-overview')||
   !str_contains($dash,'argus-reseller-overview-top')||
   !str_contains($dash,'Nova cobrança Pix'))
    throw new RuntimeException('Pix CTA placement differs from live reseller dashboard');
if(!str_contains($css,'#argus-reseller-page-overview>.argus-rpl-card'))
    throw new RuntimeException('Pix card responsive style no longer targets the new workspace');
echo "PASS: public Pix link card mounts under Nova cobrança Pix in the actual reseller Visão geral; detached-node event listeners no longer throw; mobile cache updated. NO Pix.\n";
