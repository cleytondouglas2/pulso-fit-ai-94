<?php
declare(strict_types=1);
$root='/var/www/html';
function notifyReplace(string $path,string $old,string $new,string $label):void {
 $src=file_get_contents($path);
 if($src===false)throw new RuntimeException('ARGUS notify missing file: '.$label);
 $count=substr_count($src,$old);
 if($count!==1)throw new RuntimeException('ARGUS notify patch mismatch: '.$label.' occurrences: '.$count);
 if(file_put_contents($path,str_replace($old,$new,$src))===false)throw new RuntimeException('ARGUS notify write failed: '.$label);
}
// Load the audited Web Push library; nothing financial uses notifications for state changes.
notifyReplace("$root/src/Gateway.php",
    "require_once __DIR__ . '/Portal.php';",
    "require_once __DIR__ . '/Portal.php';\nrequire_once __DIR__ . '/Notifications.php';\nrequire_once dirname(__DIR__) . '/vendor/autoload.php';",
    'notification dependencies');
notifyReplace("$root/src/Portal.php",
    "if(\$method==='POST'&&\$path==='/api/portal/documents')",
    "if(str_starts_with(\$path,'/api/portal/notifications'))Notifications::handle(\$db,\$method,\$path,'portal',\$account['id']);\n        if(\$method==='POST'&&\$path==='/api/portal/documents')",
    'client notifications require active session and CSRF');
notifyReplace("$root/src/Admin.php",
    "if(str_starts_with(\$path,'/api/admin/portal/')){self::writeAllowed(\$actor,true);Portal::admin(\$db,\$method,\$path);}",
    "if(str_starts_with(\$path,'/api/admin/portal/')){self::writeAllowed(\$actor,true);Portal::admin(\$db,\$method,\$path);}\n        if(str_starts_with(\$path,'/api/admin/notifications'))Notifications::handle(\$db,\$method,\$path,'admin',\$actor['id'],\$actor['role']==='superadmin');",
    'admin notifications behind MFA and CSRF');
// Paid transition only, never on QR generation or unverified webhook.
notifyReplace("$root/src/LivePix.php",
    "if(\$mapped!==\$current['status'])self::audit(\$db,\$row['id'],'pix.status.'.\$mapped,'Estado autenticado MisticPay: '.\$status);\n        });",
    "if(\$mapped!==\$current['status'])self::audit(\$db,\$row['id'],'pix.status.'.\$mapped,'Estado autenticado MisticPay: '.\$status);\n        });\n        if(\$mapped==='paid' && \$current['status']!=='paid'){\n            try { Notifications::pixReceived(\$db,\$row['merchant_id'],\$row['id'],(int)\$row['amount_cents']); }\n            catch(\\Throwable \$e){ error_log('ARGUS notification recording failed: '.get_class(\$e)); }\n        }",
    'B2B received Pix after verified status transition');
notifyReplace("$root/src/Admin.php",
    "\$row['status']=\$status;return self::quickPublic(\$row);",
    "if(\$status==='paid' && \$row['status']!=='paid'){\n            try { Notifications::adminPixReceived(\$db,\$row['id'],(int)\$row['amount_cents']); }\n            catch(\\Throwable \$e){ error_log('ARGUS quick Pix notification failed: '.get_class(\$e)); }\n        }\n        \$row['status']=\$status;return self::quickPublic(\$row);",
    'quick Pix received after authenticated confirmation');
notifyReplace("$root/src/Admin.php",
    "self::audit(\$db,\$actor,'payout.reconciled','payout',\$row['id'],'Estado retornado pela MisticPay: '.\$status);self::reply(['id'=>\$row['id'],'status'=>\$status]);",
    "self::audit(\$db,\$actor,'payout.reconciled','payout',\$row['id'],'Estado retornado pela MisticPay: '.\$status);\n            if(\$status==='paid' && \$row['status']!=='paid'){\n                try { Notifications::adminPixSent(\$db,\$row['actor_id'],\$row['id'],(int)\$row['amount_cents']); }\n                catch(\\Throwable \$e){ error_log('ARGUS payout notice failed: '.get_class(\$e)); }\n            }\n            self::reply(['id'=>\$row['id'],'status'=>\$status]);",
    'outgoing Pix after confirmed payout');
notifyReplace("$root/src/Portal.php",
    "self::out(['ok'=>true,'status'=>'identity_verified','message'=>'Identidade verificada.",
    "try{Notifications::accountUpdate(\$db,\$a['id'],'identity_verified');}catch(\\Throwable \$e){error_log('ARGUS KYC notice failed: '.get_class(\$e));}\n                self::out(['ok'=>true,'status'=>'identity_verified','message'=>'Identidade verificada.",
    'PF identity review notification');
notifyReplace("$root/src/Portal.php",
    "self::out(['ok'=>true,'status'=>'approved','merchant_id'=>\$merchant]);",
    "try{Notifications::accountUpdate(\$db,\$a['id'],'approved');}catch(\\Throwable \$e){error_log('ARGUS KYC notice failed: '.get_class(\$e));}\n            self::out(['ok'=>true,'status'=>'approved','merchant_id'=>\$merchant]);",
    'PJ approval notification');
$portal="$root/public/static/client.html";
$admin="$root/public/static/admin.html";
foreach([$portal,$admin] as $file){
 $html=file_get_contents($file);
 if($html===false||substr_count($html,'</head>')!==1||substr_count($html,'</body>')!==1)throw new RuntimeException('Invalid ARGUS notification HTML structure');
 $html=str_replace('</head>','<link rel="stylesheet" href="/static/notifications-ui.css?v=1"></head>',$html);
 $html=str_replace('</body>','<script src="/static/notifications-ui.js?v=1" defer></script></body>',$html);
 if($file===$portal){
    $html=str_replace('</title>','</title>', $html); // Keep brand title unchanged.
    if(!str_contains($html,'rel="manifest"'))$html=str_replace('</head>','<link rel="manifest" href="/static/manifest.webmanifest"></head>',$html);
    if(!str_contains($html,'apple-touch-icon'))$html=str_replace('</head>','<link rel="apple-touch-icon" href="/static/assets/argus-icon-180.png"></head>',$html);
 }
 file_put_contents($file,$html);
}
file_put_contents("$root/public/static/manifest.webmanifest",json_encode([
 'id'=>'/conta','name'=>'ARGUS Payments','short_name'=>'ARGUS Pay','description'=>'Seu gateway de pagamentos e notificações Pix.',
 'start_url'=>'/conta','scope'=>'/','display'=>'standalone','background_color'=>'#10141a','theme_color'=>'#10141a',
 'icons'=>[
  ['src'=>'/static/assets/argus-icon-192.png','sizes'=>'192x192','type'=>'image/png','purpose'=>'any'],
  ['src'=>'/static/assets/argus-icon-512.png','sizes'=>'512x512','type'=>'image/png','purpose'=>'any'],
  ['src'=>'/static/assets/argus-icon-512.png','sizes'=>'512x512','type'=>'image/png','purpose'=>'maskable'],
 ]
],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
echo "ARGUS notifications wired securely: portal/admin routes, confirmed Pix events, PWA and alerts.\n";
