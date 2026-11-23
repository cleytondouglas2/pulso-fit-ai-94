<?php
declare(strict_types=1);
$path='/var/www/html/public/static/';
$admin=json_decode((string)file_get_contents($path.'manifest-admin.webmanifest'),true,32,JSON_THROW_ON_ERROR);
$seller=json_decode((string)file_get_contents($path.'manifest.webmanifest'),true,32,JSON_THROW_ON_ERROR);
if(($admin['start_url']??'')!=='/admin'||($admin['scope']??'')!=='/admin'||
  ($seller['start_url']??'')!=='/conta'||($seller['scope']??'')!=='/conta')
  throw new RuntimeException('ARGUS install split: start URL or scope points to wrong panel');
if(($admin['id']??'')===($seller['id']??'')||
  ($admin['short_name']??'')==='ARGUS Revenda'||
  ($seller['short_name']??'')==='ARGUS Admin')
  throw new RuntimeException('ARGUS install split: identity collision');
if(($admin['display']??'')!=='standalone'||($seller['display']??'')!=='standalone')
  throw new RuntimeException('ARGUS install split: not installable in standalone');
foreach([$admin,$seller] as $manifest){
  foreach($manifest['icons']??[] as $icon){
    if(!str_contains((string)($icon['src']??''),'argus-brand-home-'))
      throw new RuntimeException('ARGUS install split: branding lost');
  }
}
foreach([
 'admin.html'=>['manifest-admin.webmanifest?v=admin-20261123-v8','ARGUS Admin'],
 'install-admin.html'=>['manifest-admin.webmanifest?v=admin-20261123-v8','ARGUS Admin'],
 'client.html'=>['manifest.webmanifest?v=revenda-20261123-v8','ARGUS Revenda'],
 'install.html'=>['manifest.webmanifest?v=revenda-20261123-v8','ARGUS Revenda'],
 'docs.html'=>['manifest.webmanifest?v=revenda-20261123-v8','ARGUS Revenda']
] as $file=>[$manifestFragment,$title]){
  $s=(string)file_get_contents($path.$file);
  if(substr_count($s,$manifestFragment)!==1||
     substr_count($s,'name="apple-mobile-web-app-title" content="'.$title.'"')!==1||
     substr_count($s,'rel="manifest"')!==1)
      throw new RuntimeException('ARGUS install split: incorrect '.$file);
}
$adminHtml=(string)file_get_contents($path.'admin.html');
$sellerHtml=(string)file_get_contents($path.'client.html');
$adminGuide=(string)file_get_contents($path.'install-admin.html');
if(str_contains($adminHtml,'href="/instalar"')||
   !str_contains($adminHtml,'href="/admin/instalar"')||
   !str_contains($sellerHtml,'href="/conta/instalar"')||
   !str_contains($adminGuide,'href="/admin"')||
   str_contains($adminGuide,'href="/conta"'))
  throw new RuntimeException('ARGUS install split: install menu links point to wrong account');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
foreach(["'/conta/instalar'","'/admin/instalar'","'/conta'","'/admin'"] as $needle){
  if(!str_contains($gateway,$needle))
    throw new RuntimeException('ARGUS install split: route missing '.$needle);
}
echo "PASS: Android/iOS admin and reseller apps have independent manifest IDs, precise startup pages, scoped launch and dedicated install links.\n";
