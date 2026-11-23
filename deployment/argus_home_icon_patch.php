<?php
declare(strict_types=1);
/**
 * ARGUS Pay home-screen branding for Android PWA and iOS Safari.
 * Only static icon metadata and manifest are changed; financial code stays
 * untouched. The user's submitted image is the sole source artwork.
 */
$dir='/var/www/html/public/static/';
$manifest=$dir.'manifest.webmanifest';
$m=json_decode((string)file_get_contents($manifest),true,32,JSON_THROW_ON_ERROR);
if(!is_array($m))throw new RuntimeException('ARGUS home icon: manifest invalid');
$m['name']='ARGUS Pay';
$m['short_name']='ARGUS Pay';
$m['icons']=[
 ['src'=>'/static/assets/argus-brand-home-192-v7.png','sizes'=>'192x192','type'=>'image/png','purpose'=>'any'],
 ['src'=>'/static/assets/argus-brand-home-512-v7.png','sizes'=>'512x512','type'=>'image/png','purpose'=>'any maskable']
];
if(file_put_contents($manifest,json_encode($m,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR))===false)
    throw new RuntimeException('ARGUS home icon: cannot save manifest');
$tagApple='<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-argus-brand-20261123.png">';
$tagManifest='<link rel="manifest" href="/static/manifest.webmanifest?v=argus-home-v7-20261123">';
$tagIcon='<link rel="icon" type="image/png" sizes="192x192" href="/static/assets/argus-brand-home-192-v7.png">';
$tagFavicon='<link rel="icon" type="image/png" sizes="32x32" href="/static/assets/argus-brand-home-32-v7.png">';
$pages=['admin.html','client.html','install.html','docs.html','public-pix.html','reseller-public-pix.html','landing.html'];
foreach($pages as $file){
 $path=$dir.$file;
 if(!is_file($path))continue;
 $html=file_get_contents($path);
 if(!is_string($html)||substr_count($html,'</head>')!==1)
    throw new RuntimeException('ARGUS home icon: invalid HTML '.$file);
 // Avoid duplicate/competing rel=apple-touch-icon and rel=manifest
 // references; keep unrelated metadata, scripts and application routes.
 $html=preg_replace('~<link\b(?=[^>]*\brel\s*=\s*["\x27]apple-touch-icon(?:-precomposed)?["\x27])[^>]*>~i','',$html);
 $html=preg_replace('~<link\b(?=[^>]*\brel\s*=\s*["\x27]manifest["\x27])[^>]*>~i','',$html);
 $html=preg_replace('~<link\b(?=[^>]*\brel\s*=\s*["\x27](?:shortcut\s+)?icon["\x27])[^>]*>~i','',$html);
 if(!is_string($html))throw new RuntimeException('ARGUS home icon: malformed head '.$file);
 $html=str_replace('</head>',$tagApple.$tagIcon.$tagFavicon.$tagManifest.'</head>',$html);
 foreach([$tagApple,$tagIcon,$tagFavicon,$tagManifest] as $tag){
  if(substr_count($html,$tag)!==1)
   throw new RuntimeException('ARGUS home icon: duplicate metadata '.$file);
 }
 if(file_put_contents($path,$html)===false)
  throw new RuntimeException('ARGUS home icon: cannot write '.$file);
}
echo "PASS: uploaded full-bleed ARGUS logo enabled for iOS home screen and Android PWA; no financial endpoints changed.\n";
