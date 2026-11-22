<?php
declare(strict_types=1);
/** Native date input bounds in mobile Safari; no changes to export semantics. */
$root='/var/www/html/public/static/';
$js=(string)file_get_contents($root.'finance-operations.js');
$css=(string)file_get_contents($root.'reseller-statement-boundary.css');
$html=(string)file_get_contents($root.'client.html');
if(substr_count($js,'class="argus-date-shell"')!==2)throw new RuntimeException('Both seller dates require bounded shells');
foreach(['name="from" required','name="to" required','type="date"','window.location.assign(\'/api/portal/wallet/export.csv?\'','new URLSearchParams({from,to})'] as $token){
 if(!str_contains($js,$token))throw new RuntimeException('Native calendar/export handler changed: '.$token);
}
foreach(['@media(max-width:900px)','.argus-date-shell','overflow:hidden!important','flex-flow:column nowrap!important','input[type="date"]','max-inline-size:100%!important','form button[type="submit"]'] as $token){
 if(!str_contains($css,$token))throw new RuntimeException('Missing iPhone layout containment: '.$token);
}
if(substr_count($css,'{')!==substr_count($css,'}'))throw new RuntimeException('Statement mobile CSS unmatched braces');
if(!str_contains($html,'reseller-statement-boundary.css?v=20261122-3')||!str_contains($html,'finance-operations.js?v=20261122-boundary-1')){
 throw new RuntimeException('Client must load new CSS and bypass old JS cache');
}
echo "PASS: both original date pickers bounded; CSV endpoint and form unchanged; iPhone shell containment active\n";
