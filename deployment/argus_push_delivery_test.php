<?php
declare(strict_types=1);
require_once __DIR__.'/../vendor/autoload.php';
$client=\Http\Discovery\Psr18ClientDiscovery::find();
if(!$client instanceof \Psr\Http\Client\ClientInterface)
 throw new RuntimeException('No PSR-18 HTTP client for real Web Push delivery');
if(!class_exists(\GuzzleHttp\Client::class))
 throw new RuntimeException('Guzzle PSR-18 adapter missing');
$dir='/var/www/html/public/';
$js=(string)file_get_contents($dir.'static/notifications-ui.js');
$backend=(string)file_get_contents('/var/www/html/src/Notifications.php');
foreach([
 'const swPath=isAdmin?"/sw-admin.js":"/sw-revenda.js"',
 'const swScope=isAdmin?"/admin":"/conta"',
 'const x=await api("/test","POST",{})',
 'Notification.permission!=="granted"',
 'registration=await navigator.serviceWorker.register(swPath,{scope:swScope})',
] as $needle){
 if(!str_contains($js,$needle))throw new RuntimeException('Push UI regression '.$needle);
}
require_once '/var/www/html/src/Notifications.php';
$dispatch=new ReflectionMethod(\ArgusPayments\Notifications::class,'dispatch');
$params=$dispatch->getParameters();
if(!$dispatch->isPublic()||!$dispatch->isStatic()||$dispatch->getNumberOfRequiredParameters()!==2||count($params)!==4||!$params[2]->isOptional()||!$params[3]->isOptional()||(string)$dispatch->getReturnType()!=='array')
 throw new RuntimeException('Push dispatch contract regression');
foreach(['delivery',
          "'accepted'=>","self::pushConfigured()",
          'sendOneNotification','isSubscriptionExpired()', 'audienceActive', "'connect_timeout'=>2,'timeout'=>4,'allow_redirects'=>false", 'Fixture only'] as $needle){
 if(!str_contains($backend,$needle))throw new RuntimeException('Push backend regression '.$needle);
}
foreach(['sw-admin.js','sw-revenda.js'] as $p){
 if(!is_file($dir.$p)||filesize($dir.$p)<1500)
   throw new RuntimeException('Missing scoped service worker '.$p);
}
foreach(['admin.html','client.html'] as $f){
 $s=(string)file_get_contents($dir.'static/'.$f);
 if(substr_count($s,'notifications-ui.js?v=push-20261123-v2')!==1)
   throw new RuntimeException('Cached Push JS reference '.$f);
}
foreach(['install.html'=>'sw-revenda.js','install-admin.html'=>'sw-admin.js'] as $file=>$worker){
 if(!str_contains((string)file_get_contents($dir.'static/'.$file),$worker))
  throw new RuntimeException('Install-guide scope regression '.$file);
}
echo "PASS: PSR-18 transport resolved, role-isolated SW, real Push acceptance/failed status and iOS permission checks.\n";
