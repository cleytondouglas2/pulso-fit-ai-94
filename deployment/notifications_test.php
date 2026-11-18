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
}finally{unset($db);@unlink($file);@unlink($file.'-shm');@unlink($file.'-wal');}
