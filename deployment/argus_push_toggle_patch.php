<?php
declare(strict_types=1);
/** State-verified, one-button Web Push controls. No changes to money flows. */
$dir='/var/www/html/public/static/';
foreach(['admin.html','client.html'] as $file){
  $path=$dir.$file;
  $html=file_get_contents($path);
  $old='notifications-ui.js?v=push-20261123-v2';
  $new='notifications-ui.js?v=push-queue-20261123-v4';
  if(!is_string($html)||substr_count($html,$old)!==1||
     substr_count($html,'</head>')!==1)
    throw new RuntimeException('Push-toggle asset anchor missing in '.$file);
  $html=str_replace($old,$new,$html);
  $html=str_replace('</head>',
    '<link rel="stylesheet" href="/static/notifications-toggle.css?v=20261123-v3"></head>',
    $html);
  if(file_put_contents($path,$html)===false)
    throw new RuntimeException('Cannot write Push-toggle assets for '.$file);
}
echo "PASS: one dynamic Push button included in Admin and reseller panels.\n";
