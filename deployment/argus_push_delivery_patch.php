<?php
declare(strict_types=1);
/**
 * Real Web Push repair: independent app registrations and accurate delivery
 * feedback. Do not affect Pix transactions, balances, or approval flows.
 */
$dir='/var/www/html/public/static/';
foreach(['admin.html','client.html'] as $file){
 $path=$dir.$file;
 $src=file_get_contents($path);
 if(!is_string($src))throw new RuntimeException('Push repair missing '.$file);
 $old='notifications-ui.js?v=1';
 $new='notifications-ui.js?v=push-20261123-v2';
 if(substr_count($src,$old)!==1)throw new RuntimeException('Push repair changed reference '.$file);
 $src=str_replace($old,$new,$src);
 if(file_put_contents($path,$src)===false)throw new RuntimeException('Push repair cannot persist '.$file);
}
foreach(['install.html'=>'sw-revenda.js','install-admin.html'=>'sw-admin.js'] as $file=>$worker){
 $path=$dir.$file;
 $src=(string)file_get_contents($path);
 $old='navigator.serviceWorker.register("/sw.js",{scope:"/"})';
 $scope=$worker==='sw-admin.js'?'/admin':'/conta';
 $new='navigator.serviceWorker.register("/'.$worker.'",{scope:"'.$scope.'"})';
 if(substr_count($src,$old)!==1)throw new RuntimeException('Push install guide registration changed '.$file);
 file_put_contents($path,str_replace($old,$new,$src));
}
echo "PASS: Admin and reseller Push registration isolated; test button reports gateway receipt status honestly.\n";
