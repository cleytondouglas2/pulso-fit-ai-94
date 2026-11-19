<?php
declare(strict_types=1);
/** Synthetic signed webhook queue regression. No external HTTP or live money. */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\Portal;
use ArgusPayments\MerchantWallet;
use ArgusPayments\MerchantWebhooks;
use ArgusPayments\ApiError;
putenv('ARGUS_WEBHOOK_ENCRYPTION_KEY='.bin2hex(random_bytes(32)));
putenv('ARGUS_MERCHANT_WEBHOOKS_ENABLED=no');
$db=new Database(require '/var/www/html/config.php');
$db->installAndSeed();Portal::install($db);MerchantWallet::install($db);MerchantWebhooks::install($db);
foreach([
 'http://example.com/x','https://127.0.0.1/x','https://localhost/x',
 'https://user:pass@example.com/webhook',
 'https://example.com:8443/callback','https://example.com/x?token=x',
 'https://example.com/path#fragment','https://example.com/x y',
 'https://example.com\\internal/path','https://10.0.0.1/notify',
] as $unsafe){
 if(MerchantWebhooks::validUrl($unsafe))
     throw new RuntimeException('Accepted unsafe callback URL: '.$unsafe);
}
if(!MerchantWebhooks::validUrl('https://example.com/api/argus-notifications'))
 throw new RuntimeException('Valid public HTTPS webhook rejected');
$a=bin2hex(random_bytes(16));$b=bin2hex(random_bytes(16));
foreach([$a,$b] as $i=>$id){
 $db->run('INSERT INTO argus_portal_accounts
 (id,account_type,display_name,email,document_digest,document_last4,password_hash,status,merchant_id,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)',[$id,'PF','Webhook Test',
 'webhook-test-'.substr($id,0,16).'@example.invalid',
 hash('sha256','webhook-test'.$id),'0000',password_hash('TestOnlyPassword123',PASSWORD_DEFAULT),
 'documents_required',null,Database::stamp(),Database::stamp()]);
}
$wa=MerchantWebhooks::register($db,$a,'https://example.com/api/hooks');
$wb=MerchantWebhooks::register($db,$b,'https://example.org/api/hooks');
if(!preg_match('/^wh_[a-f0-9]{32}$/D',$wa['id'])||
 !str_starts_with($wa['signing_secret'],'whsec_')||
 $wa['signing_secret']===$wb['signing_secret'])
 throw new RuntimeException('Webhook secret or event identity is invalid');
$stored=$db->one('SELECT secret_sealed,account_id,status FROM argus_merchant_webhook_endpoints WHERE id=?',[$wa['id']]);
if(!$stored||str_contains($stored['secret_sealed'],$wa['signing_secret'])||$stored['account_id']!==$a)
 throw new RuntimeException('Webhook secret leaked or tenant mismatch');
foreach([[$a,'deposit_paid',990],[$b,'withdraw_paid',-500]] as [$id,$kind,$delta]){
 $db->run('INSERT INTO argus_seller_ledger
 (id,account_id,operation_kind,operation_id,delta_available,delta_held,
 delta_debt,service_fee_cents,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
 ['mwl_'.bin2hex(random_bytes(16)),$id,$kind,
  ($kind==='deposit_paid'?'mwc_':'mww_').bin2hex(random_bytes(16)),
  $delta,0,0,$kind==='deposit_paid'?100:0,Database::stamp()]);
}
$queued=MerchantWebhooks::queue($db,200);
$all=$db->all("SELECT id,webhook_id,account_id,event_kind,payload,status FROM argus_merchant_webhook_deliveries
 WHERE account_id=? OR account_id=? ORDER BY account_id",[$a,$b]);
if(count($all)!==2||
 !in_array($all[0]['event_kind'],['pix.paid','payout.paid'],true)||
 !in_array($all[1]['event_kind'],['pix.paid','payout.paid'],true))
 throw new RuntimeException('Audited ledger events did not queue exactly once');
foreach($all as $event){
 $payload=json_decode($event['payload'],true);
 if($event['status']!=='pending'||!is_array($payload)||
    ($payload['data']['account_id']??'')!==$event['account_id']||
    !str_starts_with((string)$payload['id'],'evt_')||
    ($event['account_id']===$a&&$event['webhook_id']!==$wa['id'])||
    ($event['account_id']===$b&&$event['webhook_id']!==$wb['id'])||
    str_contains($event['payload'],'@example.invalid'))
  throw new RuntimeException('Webhook event contains another account or sensitive profile');
}
if(MerchantWebhooks::queue($db,200)!==0)
 throw new RuntimeException('Requeue duplicated an immutable event');
$worker=MerchantWebhooks::worker($db);
if($worker['delivery_enabled']!==false||$worker['delivered']!==0)
 throw new RuntimeException('Outbound delivery ignored disabled safety flag');
MerchantWebhooks::disable($db,$a,$wa['id']);
$after=$db->one('SELECT status FROM argus_merchant_webhook_deliveries WHERE webhook_id=?',[$wa['id']]);
$remain=$db->one('SELECT status FROM argus_merchant_webhook_deliveries WHERE webhook_id=?',[$wb['id']]);
if($after['status']!=='cancelled'||$remain['status']!=='pending')
 throw new RuntimeException('Disabling a seller webhook affected another account');
$portal=(string)file_get_contents('/var/www/html/src/Portal.php');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$workerSource=(string)file_get_contents('/usr/local/share/argus/notify_worker.php');
$html=(string)file_get_contents('/var/www/html/public/static/client.html');
$docs=(string)file_get_contents('/var/www/html/public/static/docs.html');
if(!str_contains($portal,"MerchantWebhooks::portal(\$db,\$method,\$path,\$account)")||
 !str_contains($gateway,"require_once __DIR__ . '/MerchantWebhooks.php';")||
 !str_contains($workerSource,'MerchantWebhooks::worker($db)')||
 !str_contains($html,'merchant-webhooks.js?v=20261119-1')||
 !str_contains($docs,'merchant-webhooks-docs.js?v=20261119-1'))
 throw new RuntimeException('Webhook authentication, worker or documentation not mounted');
echo "PASS: strict HTTPS callback validation, encrypted secret, isolated merchant events, unique delivery, disabled-by-default egress and scoped disable.\n";
