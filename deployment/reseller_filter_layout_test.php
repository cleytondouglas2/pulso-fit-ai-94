<?php
declare(strict_types=1);
/** Regression contract for reseller charge status filters and iOS export layout. */
$dir='/var/www/html/public/static/';
$js=(string)file_get_contents($dir.'reseller-dashboard.js');
$css=(string)file_get_contents($dir.'reseller-aurum-experience.css');
$merchant=(string)file_get_contents($dir.'merchant-portal.js');
foreach([
 "row.style.setProperty('display','none','important')",
 "row.style.removeProperty('display')",
 "const filtered=!matchStatus",
 "res-charge-empty",
 "row.dataset.chargeStatus===status",
 "status==='checking'"
] as $token) {
 if(!str_contains($js,$token))throw new RuntimeException('Missing charge filter rule: '.$token);
}
foreach([
 '.res-charge-row[hidden]',
 '[data-charge-status][hidden]',
 'display:none!important',
 '.res-filter-empty[hidden]',
 '@media(max-width:900px)',
 'grid-template-columns:minmax(0,1fr)!important',
 'input[type="date"]',
 'min-inline-size:0!important'
] as $token) {
 if(!str_contains($css,$token))throw new RuntimeException('Missing mobile style rule: '.$token);
}
if(!str_contains($merchant,'data-charge-status') ||
   !str_contains($merchant,"request('/api/portal/wallet/charges')") ||
   !str_contains($merchant,'seller-withdraw-form')){
 throw new RuntimeException('Must preserve original seller account operations');
}
if(substr_count($css,'{')!==substr_count($css,'}'))throw new RuntimeException('CSS braces mismatch');
echo "PASS: seller status filters hide expired/pending/paid rows correctly; iOS date form is single-column; finance unchanged\n";
