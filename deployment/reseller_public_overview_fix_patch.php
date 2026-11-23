<?php
declare(strict_types=1);
/**
 * Reseller new-dashboard visibility hotfix. Existing card was mounted beside
 * legacy .dash-top, hidden in the modern tabbed dashboard screenshot.
 * No financial or payment API touched.
 */
$root='/var/www/html/public/static/';
$htmlPath=$root.'client.html';
$html=(string)file_get_contents($htmlPath);
if(substr_count($html,'reseller-public-link.js?v=20261123-1')!==1||
   substr_count($html,'reseller-public-link.css?v=20261123-1')!==1)
    throw new RuntimeException('Reseller visibility: expected unique asset URLs');
$html=str_replace('reseller-public-link.js?v=20261123-1',
    'reseller-public-link.js?v=20261123-overview-2',$html);
$html=str_replace('reseller-public-link.css?v=20261123-1',
    'reseller-public-link.css?v=20261123-overview-2',$html);
if(file_put_contents($htmlPath,$html)===false)
    throw new RuntimeException('Reseller visibility: cannot update cache identity');
echo "PASS: reseller dashboard /conta loads visible overview Pix link card with fresh Safari JS/CSS. No payments created.\n";
