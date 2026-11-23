<?php
declare(strict_types=1);
$dir='/var/www/html/public/static/';
$admin=file_get_contents($dir.'admin.html');
$script=file_get_contents($dir.'admin-public-link.js');
$style=file_get_contents($dir.'reseller-public-link.css');
$checks=[
 'admin HTML'=>'admin-public-link.js?v=admin-link-20261123-1',
 'reseller card styles'=>'reseller-public-link.css?v=admin-link-20261123-1',
];
foreach($checks as $label=>$needle){
 if(!is_string($admin)||substr_count($admin,$needle)!==1)
    throw new RuntimeException('Admin public Pix missing: '.$label);
}
foreach(["const URL_PATH='/pix'","state?.user?.role==='superadmin'",
          "navigator.share","navigator.clipboard?.writeText",
          "argus-admin-public-link-heading","new URL(URL_PATH,location.origin)"] as $needle){
 if(!is_string($script)||!str_contains($script,$needle))
    throw new RuntimeException('Admin public Pix JS regression: '.$needle);
}
if(!is_string($style)||!str_contains($style,'.argus-rpl-card'))
 throw new RuntimeException('Seller visual card CSS unavailable for admin');
if(str_contains($script,'/api/portal/public-pix-link') ||
   str_contains($script,'/api/admin/payouts') ||
   str_contains($script,'/api/admin/merchant-wallet'))
 throw new RuntimeException('Admin link must never use seller URLs or finance mutation APIs');
echo "PASS: admin public link card, secure role guard, copy/share and reused CSS.\n";
