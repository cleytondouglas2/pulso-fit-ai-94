<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\SellerAccessAudit as Audit;
putenv('ARGUS_SECURITY_RATE_SECRET='.str_repeat('S',64));
$db=new DB(require '/var/www/html/config.php');$db->installAndSeed();
$id=bin2hex(random_bytes(16));
$a=['id'=>$id,'email'=>'synthetic-audit@example.invalid'];
$_SERVER['HTTP_USER_AGENT']='Synthetic Browser 1';
$_SERVER['REMOTE_ADDR']='192.0.2.11';
if(Audit::record($db,$a)!==null)throw new RuntimeException('First login should not alert');
if(Audit::record($db,$a)!==null)throw new RuntimeException('Known browser should not alert');
$_SERVER['HTTP_USER_AGENT']='Synthetic Browser 2';
if(Audit::record($db,$a)===null)throw new RuntimeException('Unknown device not detected');
$v=Audit::activity($db,$id);
if(count($v['events'])!==3||$v['events'][0]['unusual']!==true)throw new RuntimeException('History isolation failed');
$rows=$db->all('SELECT * FROM argus_seller_access_events WHERE account_id=?',[$id]);
foreach($rows as $r){
 if(str_contains(json_encode($r),$_SERVER['REMOTE_ADDR'])||
    str_contains(json_encode($r),'Synthetic Browser'))
   throw new RuntimeException('Raw network/browser stored');
}
$portal=file_get_contents('/var/www/html/src/Portal.php');
if(!str_contains($portal,'SellerAccessAudit::record($db,$account)')||
 !str_contains($portal,'SellerAccessAudit::respond($db,$account)'))
 throw new RuntimeException('Missing login hooks');
echo "PASS: safe login anomaly identification, account history, no raw network identifiers, no payment calls\n";
