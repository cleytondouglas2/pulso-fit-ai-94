<?php
declare(strict_types=1);
require_once __DIR__.'/../src/Database.php';
require_once __DIR__.'/../src/Gateway.php';
require_once __DIR__.'/../src/Notifications.php';
require_once __DIR__.'/../vendor/autoload.php';
use ArgusPayments\Database;
use ArgusPayments\Notifications;

$file=sys_get_temp_dir().'/argus_notify_'.bin2hex(random_bytes(7)).'.db';
$db=new Database(['driver'=>'sqlite','sqlite_path'=>$file]);
try {
 Notifications::install($db);
 $first=Notifications::record($db,'portal','client-a','pix.received','confirmed:pay-123','Olha o Pix aí, cachorro!','Pix confirmado',9990);
 if(!$first)throw new RuntimeException('First notification missing');
 $same=Notifications::record($db,'portal','client-a','pix.received','confirmed:pay-123','Duplicate','Duplicate',9990);
 if($same!==null)throw new RuntimeException('Duplicate event was not deduplicated');
 $different=Notifications::record($db,'portal','client-b','pix.received','confirmed:pay-123','Another','Another',9990);
 if(!$different||$different===$first)throw new RuntimeException('Recipient isolation invalid');
 $a=$db->all('SELECT * FROM argus_notice_events WHERE audience_type=? AND audience_id=?',['portal','client-a']);
 $b=$db->all('SELECT * FROM argus_notice_events WHERE audience_type=? AND audience_id=?',['portal','client-b']);
 if(count($a)!==1||count($b)!==1||$a[0]['title']!== 'Olha o Pix aí, cachorro!')throw new RuntimeException('Inbox isolation invalid');
 $db->run('INSERT INTO argus_notice_settings(audience_type,audience_id,pix_received,pix_sent,announcements,show_amount) VALUES (?,?,?,?,?,?)',
  ['portal','client-b',0,1,1,0]);
 $disabled=Notifications::record($db,'portal','client-b','pix.received','confirmed:pay-124','Disabled','Disabled',1000);
 if($disabled!==null)throw new RuntimeException('Disabled category was recorded');
 $enabled=Notifications::record($db,'portal','client-b','pix.sent','payout-confirmed:pay-124','Sent','Sent',1000);
 if(!$enabled)throw new RuntimeException('Allowed category missing');
 echo "PASS: ARGUS notifications isolate recipients, deduplicate verified events and honor opt-in preferences.\n";
 $db->pdo()->exec("CREATE TABLE IF NOT EXISTS argus_portal_accounts(id VARCHAR(64) PRIMARY KEY,status VARCHAR(24) NOT NULL)");
 $db->run('INSERT INTO argus_portal_accounts(id,status) VALUES (?,?)',['client-a','approved']);
 $db->run('INSERT INTO argus_portal_accounts(id,status) VALUES (?,?)',['client-b','approved']);
 $endpoints=[];
 for($i=0;$i<12;$i++){
   $endpoint='https://fcm.googleapis.com/fcm/send/fixture-device-'.$i;$hash=hash('sha256',$endpoint);
   $endpoints[]=$hash;
   $db->run('INSERT INTO argus_notice_subscriptions(endpoint_hash,audience_type,audience_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?,?,?)',[$hash,'portal','client-a',$endpoint,str_repeat('a',87),str_repeat('b',22),Database::stamp()]);
 }
 if(!str_contains(file_get_contents(__DIR__.'/../src/Notifications.php'),"'connect_timeout'=>2,'timeout'=>4,'allow_redirects'=>false"))throw new RuntimeException('Push timeout missing');
 $send=static function(array $sub,string $payload):array{
    $decoded=json_decode($payload,true,16,JSON_THROW_ON_ERROR);
    if($decoded['title']!=='ARGUS Pay'||$decoded['url']!=='/'||str_contains($payload,'Pix')||str_contains($payload,'9990')||str_contains($payload,'client-a'))throw new RuntimeException('Private payload leaked');
    return ['accepted'=>true,'expired'=>false];
 };
 $report=Notifications::dispatch($db,$first,$send);
 if($report['accepted']!==8||$report['status']!=='continuation')throw new RuntimeException('Batch limit or continuation failed');
 $report=Notifications::dispatch($db,$first,$send);
 if($report['accepted']!==4||$report['previously_accepted']!==8||$report['failed']!==0||$report['deferred'])throw new RuntimeException('Remaining devices not notified');
 $report=Notifications::dispatch($db,$first,$send);
 if($report['attempted']!==0||$report['previously_accepted']!==12)throw new RuntimeException('Repeated device delivery');
 $pending=Notifications::record($db,'portal','client-a','pix.received','fixture-suspended','Fixture','Private',123);
 $db->run("UPDATE argus_portal_accounts SET status='suspended' WHERE id='client-a'");
 $report=Notifications::dispatch($db,$pending,static function(){throw new RuntimeException('Must never dispatch suspended account');});
 if($report['attempted']!==0||$report['status']!=='inactive_account')throw new RuntimeException('Suspended account not blocked');
 $db->run("UPDATE argus_portal_accounts SET status='approved' WHERE id='client-a'");
 sort($endpoints);$target=$endpoints[1];$sent=[];
 $report=Notifications::dispatch($db,$pending,function($sub,$payload)use($db,$target,&$sent,$send){
   $sent[]=$sub['endpoint_hash'];
   if(count($sent)===1)$db->run("UPDATE argus_notice_subscriptions SET audience_id='client-b' WHERE endpoint_hash=?",[$target]);
   return $send($sub,$payload);
 },12);
 if(in_array($target,$sent,true)||$report['accepted']!==11||$report['skipped']!==1)throw new RuntimeException('Reassigned device received previous account push');
 $expired=Notifications::record($db,'portal','client-a','announcement','fixture-expired','Fixture','Private');
 $report=Notifications::dispatch($db,$expired,function($sub,$payload)use($db){
    $db->run("UPDATE argus_notice_subscriptions SET audience_id='client-b' WHERE endpoint_hash=?",[$sub['endpoint_hash']]);
    return ['accepted'=>false,'expired'=>true];
 },12);
 if($report['expired']!==11||$report['status']!=='no_delivery'||(int)$db->one("SELECT COUNT(*) AS n FROM argus_notice_subscriptions WHERE audience_id='client-b'")['n']!==12)throw new RuntimeException('New binding deleted by stale transport');
 $tags=[];
 foreach(['tag-1','tag-2'] as $key){
  $event=Notifications::record($db,'portal','client-b','announcement',$key,'Fixture','Private');
  Notifications::dispatch($db,$event,function($sub,$payload)use(&$tags,$key){$tags[$key]=json_decode($payload,true)['tag'];return ['accepted'=>true];},1);
 }
 if($tags['tag-1']===$tags['tag-2'])throw new RuntimeException('Different events overwrite notification');
 $db->pdo()->exec('DROP TABLE argus_portal_accounts');
 $report=Notifications::dispatch($db,$first,static function(){throw new RuntimeException('No send when validation unavailable');});
 if(!$report['deferred']||$report['status']!=='validation_unavailable'||$report['attempted']!==0)throw new RuntimeException('Database error misclassified as inactive account');
 echo "PASS: bounded 12-device delivery, continuation, private push, suspended account, reassignment, stale expiry, unique tags and unavailable validation.\n";

}finally{unset($db);@unlink($file);@unlink($file.'-shm');@unlink($file.'-wal');}
