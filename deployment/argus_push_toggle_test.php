<?php
declare(strict_types=1);
/** Offline contract — no real device subscriptions or Push tests run here. */
$dir='/var/www/html/public/static/';
$js=(string)file_get_contents($dir.'notifications-ui.js');
$css=(string)file_get_contents($dir.'notifications-toggle.css');
$backend=(string)file_get_contents('/var/www/html/src/Notifications.php');
foreach([
 'async function syncPushState()','async function togglePush()',
 'pushState==="active"','pushState="checking"',
 '🔕 Desativar notificações','🔔 Ativar notificações',
 'aria-pressed','an-device-status',
 'verified.active===true','api("/status","POST",{endpoint:sub.endpoint})',
 'const verify=await api("/status","POST",{endpoint:sub.endpoint})',
 'window.addEventListener("focus"',
 'if(pushState==="active")await disable();else await enable();'
] as $str){
 if(!str_contains($js,$str))throw new RuntimeException('Push-toggle UI missing: '.$str);
}
if(str_contains($js,'id="an-deactivate"')||str_contains($js,'$("an-deactivate")'))
 throw new RuntimeException('Push-toggle still has an extra deactivate button');
foreach(["\$path===\$prefix.'/status'",'endpoint_hash=? AND audience_type=? AND audience_id=?',
 'hash(\'sha256\',$endpoint)',"'active'=>\$linked!==null"] as $needle){
 if(!str_contains($backend,$needle))throw new RuntimeException('Device status regression '.$needle);
}
if(!str_contains($css,'#an-activate.an-toggle-active'))
 throw new RuntimeException('Disabled styling missing');
foreach(['admin.html','client.html'] as $file){
 $html=(string)file_get_contents($dir.$file);
 if(substr_count($html,'notifications-ui.js?v=push-toggle-20261123-v3')!==1||
    substr_count($html,'notifications-toggle.css?v=20261123-v3')!==1)
  throw new RuntimeException('Missing single-toggle assets in '.$file);
}
echo "PASS: Admin/Reseller toggle activated only when device is subscribed on server; independent deactivate button removed.\n";
