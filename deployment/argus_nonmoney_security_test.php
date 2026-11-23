<?php
declare(strict_types=1);
/* Offline contracts; no external webhook delivery, checkout or real PSP call. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\MerchantWebhooks as Hooks;
use ArgusPayments\Database as DB;
putenv('ARGUS_WEBHOOK_ENCRYPTION_KEY='.bin2hex(random_bytes(32)));
putenv('ARGUS_SECURITY_RATE_SECRET='.bin2hex(random_bytes(32)));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
Hooks::install($db);
$a=bin2hex(random_bytes(16));$b=bin2hex(random_bytes(16));
$one=Hooks::register($db,$a,'https://example.com/argus-hook');
$other=Hooks::register($db,$b,'https://example.org/argus-hook');
foreach([[$a,$one],[$b,$other]] as [$account,$hook]){
 $id='whd_'.bin2hex(random_bytes(16));
 $db->run("INSERT INTO argus_merchant_webhook_deliveries
   (id,webhook_id,account_id,ledger_id,event_kind,payload,status,attempts,next_attempt_at,created_at,delivered_at,last_http_code)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
   [$id,$hook['id'],$account,'mwl_'.bin2hex(random_bytes(16)),'pix.paid','{}',
    'dead',6,time()+3600,DB::stamp(),null,500]);
 if($account===$a)$dead=$id;else $different=$id;
}
if(Hooks::retryDead($db,$b,$dead)!==false)
 throw new RuntimeException('Webhook retry crossed seller account');
if(Hooks::retryDead($db,$a,$dead)!==true)
 throw new RuntimeException('Cannot requeue dead own webhook');
if(Hooks::retryDead($db,$a,$dead)!==false)
 throw new RuntimeException('Replayed a pending webhook twice');
if(Hooks::retryDead($db,$a,$different)!==false)
 throw new RuntimeException('Replayed another seller webhook');
$row=$db->one('SELECT status,attempts,last_http_code FROM argus_merchant_webhook_deliveries WHERE id=?',[$dead]);
if($row['status']!=='pending'||(int)$row['attempts']!==0||$row['last_http_code']!==null)
 throw new RuntimeException('Webhook retry did not safely requeue');
$db->run("UPDATE argus_merchant_webhook_deliveries SET status='delivered' WHERE id=?",[$dead]);
if(Hooks::retryDead($db,$a,$dead)!==false)
 throw new RuntimeException('Delivered notification should never be manually retried');
$src=(string)file_get_contents('/var/www/html/src/MerchantWebhooks.php');
$ui=(string)file_get_contents('/var/www/html/public/static/merchant-webhooks.js');
$php=(string)file_get_contents('/var/www/html/src/PublicAdminPix.php');
$html=(string)file_get_contents('/var/www/html/public/static/public-pix.html');
$j=(string)file_get_contents('/var/www/html/public/static/public-pix.js');
$client=(string)file_get_contents('/var/www/html/public/static/client.html');
if(!str_contains($src,"status='dead'")||!str_contains($src,"SecurityShield::rate")||
 !str_contains($src,"/api/portal/webhooks/deliveries/")||
 !str_contains($ui,"data-webhook-retry")||!str_contains($ui,"d.status==='dead'")||
 !str_contains($client,'merchant-webhooks.js?v=retry-safe-20261123-v1')||
 (str_contains($php,"'provider'=>'MisticPay',"))||
 !str_contains($html,'public-pix.js?v=privacy-20261123-v3')||
 preg_match('/Mistic[\s_-]*Pay/i',$html.$j))
 throw new RuntimeException('Webhook or public-brand audit contract failed');
echo "PASS: dead webhook replay only for own account and only once; public Pix acquirer name absent.\n";
