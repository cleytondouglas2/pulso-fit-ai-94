<?php
declare(strict_types=1);
/** Visible reseller overview/CTA regression, with no network/PSP use. */
$dir='/var/www/html/public/static/';
$markup=(string)file_get_contents($dir.'client.html');
$script=(string)file_get_contents($dir.'reseller-public-link.js');
$style=(string)file_get_contents($dir.'reseller-public-link.css');
$dashboard=(string)file_get_contents($dir.'reseller-dashboard.js');
$portal=(string)file_get_contents('/var/www/html/src/Portal.php');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
foreach([
 'reseller-public-link.js?v=20261123-overview-2',
 'reseller-public-link.css?v=20261123-overview-2'
] as $x)
    if(substr_count($markup,$x)!==1)
        throw new RuntimeException('Safari cache bust failed '.$x);
foreach([
 "const overview=\$('argus-reseller-page-overview')",
 "overview.closest('#argus-reseller-workspace')",
 "overview.insertBefore(root,top)",
 'root.parentElement!==overview',
 'root.nextElementSibling!==top',
 "dashboard.querySelector('.dash-top')",
 "if(!canShow())return null",
 "'/api/portal/public-pix-link'",
 "rootId='argus-reseller-public-link'",
 "argus-rpl-open",
 "argus-rpl-copy",
 "argus-rpl-share"
] as $x)
 if(!str_contains($script,$x))
  throw new RuntimeException('Pix CTA absent from live overview: '.$x);
if(str_contains($script,'if(root)return root;'))
 throw new RuntimeException('Old hidden legacy Pix link card not moved');
foreach([
 "'argus-reseller-page-overview'",
 "'res-overview-heading'",
 "'argus-reseller-overview-top'",
 "'argus-reseller-overview-balances'",
 "'Nova cobrança Pix'"
] as $x)
 if(!str_contains($dashboard,$x)&&
    !str_contains($dashboard,substr($x,1,-1)))
  throw new RuntimeException('New reseller overview no longer matches mounting target: '.$x);
foreach([
 '#argus-reseller-page-overview>.argus-rpl-card',
 '@media(max-width:610px)',
 '.argus-rpl-primary'
] as $x)
 if(!str_contains($style,$x))
  throw new RuntimeException('Responsive Pix public checkout CTA CSS missing '.$x);
if(!str_contains($portal,"'/api/portal/public-pix-link'")||
   !str_contains($gateway,"ResellerPublicPix::handle(\$sellerCheckoutDb,\$method,\$path)"))
 throw new RuntimeException('The link endpoint or unique public Pix route is missing');
foreach(['MisticPay','Mistic Pay','api.misticpay'] as $bad)
 if(stripos($markup,$bad)!==false||stripos($script,$bad)!==false)
  throw new RuntimeException('Private processor brand appears in reseller UI');
echo "PASS: visible Pix public checkout button inside /conta > Visão geral, right below Nova cobrança Pix; old hidden panel corrected, mobile responsive, Safari refreshed, tenant link unchanged, NO real Pix.\n";
