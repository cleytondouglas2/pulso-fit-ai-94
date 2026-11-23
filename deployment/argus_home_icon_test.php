<?php
declare(strict_types=1);
$root='/var/www/html/public';
$assets=$root.'/static/assets';
$icons=[
 [$assets.'/argus-brand-home-32-v7.png',32],
 [$assets.'/argus-brand-home-192-v7.png',192],
 [$assets.'/argus-brand-home-512-v7.png',512],
 [$assets.'/argus-brand-home-1024-v7.png',1024],
 [$root.'/apple-touch-icon-argus-brand-20261123.png',180],
 [$root.'/apple-touch-icon.png',180]
];
foreach($icons as [$p,$size]){
 $dims=@getimagesize($p);
 if(!$dims||$dims[0]!==$size||$dims[1]!==$size||$dims[2]!==IMAGETYPE_PNG)
    throw new RuntimeException('ARGUS home icon: invalid '.$size.'px '.basename($p));
 if(filesize($p)<1500)throw new RuntimeException('ARGUS home icon: unexpectedly empty '.basename($p));
}
$m=json_decode((string)file_get_contents($root.'/static/manifest.webmanifest'),true,32,JSON_THROW_ON_ERROR);
if(($m['short_name']??'')!=='ARGUS Pay'||count($m['icons']??[])!==2||
   ($m['icons'][0]['sizes']??'')!=='192x192'||
   ($m['icons'][1]['sizes']??'')!=='512x512'||
   !str_contains($m['icons'][1]['purpose']??'','maskable'))
 throw new RuntimeException('ARGUS home icon: PWA manifest regression');
foreach(['admin.html','client.html','install.html','docs.html','public-pix.html','reseller-public-pix.html','landing.html'] as $f){
 $p=$root.'/static/'.$f;
 if(!is_file($p))continue;
 $html=(string)file_get_contents($p);
 foreach(['apple-touch-icon-argus-brand-20261123.png',
           'argus-brand-home-192-v7.png','manifest.webmanifest?v=argus-home-v7-20261123'] as $needle){
  if(substr_count($html,$needle)!==1)
   throw new RuntimeException('ARGUS home icon: missing or duplicate reference '.$f.' '.$needle);
 }
}
echo "PASS: full-bleed PNG icon sizes 32/180/192/512/1024, Android maskable PWA and iOS Safari links.\n";
