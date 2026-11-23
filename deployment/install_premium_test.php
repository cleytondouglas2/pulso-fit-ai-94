<?php
declare(strict_types=1);
ini_set('display_errors','1');
ini_set('log_errors','1');
ini_set('error_log','/dev/stderr');
$static='/var/www/html/public/static/';
foreach([
 'install.html'=>['/conta','sw-revenda.js','ARGUS Revenda','manifest.webmanifest?v=revenda-20261123-v8'],
 'install-admin.html'=>['/admin','sw-admin.js','ARGUS Admin','manifest-admin.webmanifest?v=admin-20261123-v8']
] as $file=>[$target,$worker,$name,$manifest]){
 $html=(string)file_get_contents($static.$file);
 if(strlen($html)<9000||substr_count($html,'</html>')!==1)
  throw new RuntimeException('Install page missing '.$file);
 foreach(['id="argus-install-root"','id="guide-ios"','id="guide-android"',
  'id="tab-ios"','id="tab-android"','id="install-cta"',
  'install-premium.css?v=20261123-1','install-premium.js?v=20261123-1',
  'apple-touch-icon-argus-brand-20261123.png','argus-brand-home-512-v7.png',
  'href="'.$target.'"','data-worker="'.$worker.'"','data-worker-scope="'.$target.'"',
  'content="'.$name.'"','href="/static/'.$manifest.'"'] as $needle)
  if(!str_contains($html,$needle))
   throw new RuntimeException('Missing installation component '.$file.': '.$needle);
 if(substr_count($html,'rel="manifest"')!==1||
    substr_count($html,'name="viewport"')!==1||
    str_contains($html,'<style>')||
    str_contains($html,'<script>'))
  throw new RuntimeException('Inline styles, scripts, duplicate manifest or viewport in '.$file);
 if($target==='/admin'&&str_contains($html,'href="/conta"'))
  throw new RuntimeException('Admin guide links to seller');
}
foreach(['install-premium.css','install-premium.js'] as $file){
 if(!is_file($static.$file)||filesize($static.$file)<($file==='install-premium.css'?10000:1500))
  throw new RuntimeException('Install page static asset missing '.$file);
}
$css=(string)file_get_contents($static.'install-premium.css');
$js=(string)file_get_contents($static.'install-premium.js');
foreach(['#argus-install-root .hero','#argus-install-root .device-tab',
 '@media(max-width:560px)','prefers-reduced-motion'] as $fragment)
 if(!str_contains($css,$fragment))
  throw new RuntimeException('Mobile CSS missing '.$fragment);
foreach(["switchDevice('android')","selected=isAndroid?'android':'ios'",
 "'beforeinstallprompt'","role=document.documentElement.dataset.role",
 "navigator.serviceWorker.register('/'+worker,{scope:scope})"] as $frag)
 if(!str_contains($js,$frag))
  throw new RuntimeException('Install JS missing '.$frag);
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
if(!str_contains($gateway,"'/conta/instalar'")||
   !str_contains($gateway,"'/admin/instalar'"))
 throw new RuntimeException('Install routes lost');
echo "PASS: premium install layout is structured, mobile responsive, platform-specific, and preserves Admin/revenda PWA separation.\n";
