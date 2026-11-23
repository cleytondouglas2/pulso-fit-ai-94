<?php
declare(strict_types=1);
$dir='/var/www/html/public/static/';
foreach([
 'install.html'=>['/conta','revenda','ARGUS Revenda','sw-revenda.js','manifest.webmanifest?v=revenda-20261123-v8'],
 'install-admin.html'=>['/admin','admin','ARGUS Admin','sw-admin.js','manifest-admin.webmanifest?v=admin-20261123-v8']
] as $file=>[$target,$role,$name,$worker,$manifest]){
 $html=file_get_contents($dir.$file);
 if(!is_string($html)||strlen($html)<21000)
   throw new RuntimeException('ARGUS install v4: missing page '.$file);
 foreach([
  '<!doctype html>','<style>','<script>','<meta name="viewport"',
  'data-role="'.$role.'"','data-worker="'.$worker.'"','data-worker-scope="'.$target.'"',
  'href="/static/'.$manifest.'"','href="'.$target.'"',
  'name="apple-mobile-web-app-title" content="'.$name.'"',
  'argus-brand-home-192-v7.png','argus-brand-home-512-v7.png',
  'id="install-cta"','id="passos"','id="guide-ios"','id="guide-android"',
  '@media(max-width:560px)', 'style="display:flex;align-items:center;justify-content:space-between;min-height:74px',
  'style="padding:36px 0 29px;min-height:0"'
 ] as $needle){
  if(!str_contains($html,$needle))throw new RuntimeException('ARGUS install v4 missing '.$file.': '.$needle);
 }
 if(substr_count($html,'<style>')!==1||substr_count($html,'<script>')!==1||
    substr_count($html,'rel="manifest"')!==1||
    str_contains($html,'class="atmosphere"')||
    str_contains($html,'<svg')||
    str_contains($html,'install-premium.css')){
   throw new RuntimeException('ARGUS install v4: legacy layout or huge SVG in '.$file);
 }
 if($role==='admin'&&str_contains($html,'href="/conta"'))
   throw new RuntimeException('ARGUS install v4: Admin launch points to revenda');
}
$routes=(string)file_get_contents('/var/www/html/src/Gateway.php');
foreach(["'/conta/instalar'","'/admin/instalar'"] as $route)
 if(!str_contains($routes,$route))throw new RuntimeException('ARGUS install v4: route missing '.$route);
echo "PASS: install v4 headers, inline fallback styling, safe mobile layout, app targets, manifests, worker scopes and device tabs.\n";
