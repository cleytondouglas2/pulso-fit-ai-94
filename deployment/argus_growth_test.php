<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\ArgusGrowth as G;
use ArgusPayments\Database;
use ArgusPayments\ApiError;
$db=new Database(require '/var/www/html/config.php');
if($db->driver()!=='sqlite'){
 if(getenv('ARGUS_OFFLINE_PG_FIXTURE')!=='yes'||$db->driver()!=='pgsql'||$db->pdo()->query('SELECT current_database()')->fetchColumn()!=='argus_ci_fixture'||$db->pdo()->query('SELECT current_schema()')->fetchColumn()!=='argus_payments_b2b')throw new RuntimeException('Synthetic tests only');
}
putenv('ARGUS_SECURITY_RATE_SECRET='.bin2hex(random_bytes(32))); // ephemeral test-only secret
$db->installAndSeed();\ArgusPayments\Admin::install($db);\ArgusPayments\Portal::install($db);\ArgusPayments\MerchantWallet::install($db);\ArgusPayments\Notifications::install($db);\ArgusPayments\FeeExecution::install($db);G::financialIndexes($db,false);G::financialIndexes($db,true);G::install($db);
$a='growth-a-'.bin2hex(random_bytes(8));$b='growth-b-'.bin2hex(random_bytes(8));
$v=['title'=>'Test subscription','note'=>'Synthetic','amount_cents'=>5000,'due'=>'2028-01-31','cycle'=>'monthly','nonce'=>bin2hex(random_bytes(16))];
$x=G::create($db,'admin',$a,'subscription',$v);
if(!$x['created']||G::create($db,'admin',$a,'subscription',$v)['created'])throw new RuntimeException('Idempotency failed');
if(count(G::listing($db,'admin',$a,'subscription')['items'])!==1||G::listing($db,'admin',$b,'subscription')['items']!==[])throw new RuntimeException('Scope failed');
try{G::transition($db,'admin',$b,$x['id'],'archive');throw new RuntimeException('Cross owner write');}catch(ApiError $e){}
G::transition($db,'admin',$a,$x['id'],'advance');
if(G::listing($db,'admin',$a,'subscription')['items'][0]['data']['due']!=='2028-02-29')throw new RuntimeException('Cycle calendar failed');
try{G::create($db,'portal',$a,'routing',$v);throw new RuntimeException('Admin module exposed');}catch(ApiError $e){}
$now=gmdate('Y-m-d H:i:s');$id='qpx_'.bin2hex(random_bytes(16));
$db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$id,$a,hash('sha256','idem'.$id),hash('sha256','body'.$id),1234,'Synthetic','tr_test_'.$id,null,'paid',$now,$now]);
$metrics=G::metrics($db,'admin',$a);
if($metrics['gross_cents']!==1234||$metrics['confirmed_count']!==1||$metrics['forecast_30d_cents']!==null)throw new RuntimeException('Metrics failed');
$issued=G::verification($db,'admin',$a,'deposit',$id);$token=substr($issued['path'],8);$r=G::verify($db,$token);
if(!$r['confirmed']||$r['amount_cents']!==1234||isset($r['account_name'])||isset($r['operation_id']))throw new RuntimeException('Verification privacy failed');
$db->run("UPDATE admin_quick_pix SET status='refunded' WHERE id=?",[$id]);
if(G::verify($db,$token)['confirmed'])throw new RuntimeException('Stale verified status');
G::revokeVerification($db,'admin',$a,$id);
try{G::verify($db,$token);throw new RuntimeException('Revoked link accepted');}catch(ApiError $e){}
echo "PASS: growth scope, idempotent records, monthly calendar, actual paid metrics, privacy and revocable current-status verification. No PSP calls.\n";

$invoice=G::create($db,'admin',$a,'invoice',['title'=>'Synthetic invoice','note'=>'','amount_cents'=>1234,'due'=>'2020-01-01','nonce'=>bin2hex(random_bytes(16))]);
try{G::invoiceMatch($db,'admin',$a,$invoice['id'],$id);throw new RuntimeException('Refunded matched');}catch(ApiError $e){}
$db->run("UPDATE admin_quick_pix SET status='paid' WHERE id=?",[$id]);
G::invoiceMatch($db,'admin',$a,$invoice['id'],$id);
if(!G::listing($db,'admin',$a,'invoice')['items'][0]['match_confirmed'])throw new RuntimeException('Invoice match missing');
$ticket=G::create($db,'portal',$a,'support',['title'=>'Test ticket','note'=>'Synthetic','category'=>'technical','nonce'=>bin2hex(random_bytes(16))]);
G::thread($db,'portal',$a,$ticket['id'],'Test question');
G::thread($db,'admin',$b,$ticket['id'],'Test answer');
if(count(G::thread($db,'portal',$a,$ticket['id'])['messages'])!==2)throw new RuntimeException('Support conversation missing');
try{G::thread($db,'portal',$b,$ticket['id']);throw new RuntimeException('Thread scope leak');}catch(ApiError $e){}
echo "PASS: existing confirmed Pix matched to invoice, refunded exclusion, admin support replies and seller thread isolation.\n";

G::transition($db,'admin',$a,$x['id'],'advance');
if(G::listing($db,'admin',$a,'subscription')['items'][0]['data']['due']!=='2028-03-31')throw new RuntimeException('Anchor day lost');
if(G::create($db,'admin',$a,'subscription',$v)['created'])throw new RuntimeException('Idempotency lost after change');
$row=G::listing($db,'admin',$a,'subscription')['items'][0];$edit=$row['data'];$edit['title']='Edited test';$edit['revision']=$row['revision'];G::edit($db,'admin',$a,$x['id'],$edit);
try{G::edit($db,'admin',$a,$x['id'],$edit);throw new RuntimeException('Stale revision accepted');}catch(ApiError $e){}
if(G::localDay(strtotime('2026-11-23T01:00:00Z'))!=='2026-11-22')throw new RuntimeException('Brazil local day wrong');
echo "PASS: original subscription anchor, immutable idempotency, optimistic editing and Brazilian calendar.\n";

$clock=strtotime('2026-11-23T12:00:00Z');$many='growth-volume-'.bin2hex(random_bytes(8));
for($i=0;$i<405;$i++){
 $k='qpx_'.bin2hex(random_bytes(16));$db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$k,$many,hash('sha256','idem'.$k),hash('sha256','body'.$k),100,'Synthetic','tr_test_'.$k,null,'paid','2026-11-23 01:00:00','2026-11-23 01:01:00']);
}
$k='qpx_'.bin2hex(random_bytes(16));$db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$k,$many,hash('sha256','idem'.$k),hash('sha256','body'.$k),100,'Synthetic','tr_test_'.$k,null,'pending','2025-01-01 00:00:00','2025-01-01 00:00:00']);
$report=G::metrics($db,'admin',$many,$clock);
if($report['confirmed_count']!==405||$report['gross_cents']!==40500||$report['daily'][28]['gross_cents']!==40500||$report['pending_count']!==1)throw new RuntimeException('Complete local-date aggregate failed');
G::saveCursor($db,'test','portal|abc');if(G::cursor($db,'test')!=='portal|abc')throw new RuntimeException('Cursor persistence failed');
$due=G::create($db,'admin',$a,'invoice',['title'=>'Synthetic overdue','note'=>'','amount_cents'=>1234,'due'=>'2020-01-01','nonce'=>bin2hex(random_bytes(16))]);
if(G::metrics($db,'admin',$a,$clock)['due_count']!==1)throw new RuntimeException('Unmatched overdue missing');
try{G::create($db,'portal',$b,'support',['title'=>'Private document','note'=>'123.456.789-00','category'=>'technical','nonce'=>bin2hex(random_bytes(16))]);throw new RuntimeException('Formatted CPF accepted');}catch(ApiError $e){}
echo "PASS: complete 405-payment aggregate, local time boundary, historical pending, worker cursor and formatted-document guard.\n";

for($i=0;$i<10;$i++)G::verification($db,'admin',$a,'deposit',$id);
try{G::verification($db,'admin',$a,'deposit',$id);throw new RuntimeException('Token cap exceeded');}catch(ApiError $e){}
G::revokeVerification($db,'admin',$a,$id);
$nonce=bin2hex(random_bytes(16));
G::thread($db,'portal',$a,$ticket['id'],'Retry-safe message',$nonce);G::thread($db,'portal',$a,$ticket['id'],'Retry-safe message',$nonce);
if(count(G::thread($db,'portal',$a,$ticket['id'])['messages'])!==3)throw new RuntimeException('Duplicate support message');
try{G::thread($db,'portal',$a,$ticket['id'],'senha: example-secret');throw new RuntimeException('Sensitive support data accepted');}catch(ApiError $e){}
for($i=0;$i<105;$i++)G::create($db,'portal',$b,'support',['title'=>'Ticket '.$i,'note'=>'Synthetic','category'=>'technical','nonce'=>bin2hex(random_bytes(16))]);
$first=G::inbox($db);$cursor=$first['next_cursor'];if(!$cursor)throw new RuntimeException('Missing support cursor');
$db->run('UPDATE argus_growth_records SET updated_at=? WHERE id=?',['2099-01-01 00:00:00',$cursor]);
$next=G::inbox($db,$cursor);
if(array_intersect(array_column($first['items'],'id'),array_column($next['items'],'id')))throw new RuntimeException('Unstable inbox pagination');
echo "PASS: verification cap, message replay, sensitive text and immutable inbox cursor.\n";

$batch=['title'=>'Identical order','note'=>'','amount_cents'=>100,'due'=>'2027-01-01'];
$one=G::create($db,'admin',$b,'invoice',$batch+['nonce'=>bin2hex(random_bytes(16))]);$two=G::create($db,'admin',$b,'invoice',$batch+['nonce'=>bin2hex(random_bytes(16))]);
if($one['id']===$two['id'])throw new RuntimeException('Distinct identical records collapsed');
echo "PASS: identical legitimate records have independent idempotency identifiers.\n";

$batchNonce=bin2hex(random_bytes(16));$row=['title'=>'Batch fixture','note'=>'','amount_cents'=>100,'due'=>'2027-01-01'];$before=count(G::listing($db,'admin',$b,'invoice')['items']);
try{G::batch($db,'admin',$b,['nonce'=>$batchNonce,'items'=>[$row,array_replace($row,['due'=>'2027-02-31'])]]);throw new RuntimeException('Invalid batch accepted');}catch(ApiError $e){}
if(count(G::listing($db,'admin',$b,'invoice')['items'])!==$before)throw new RuntimeException('Partial batch persisted');
$result=G::batch($db,'admin',$b,['nonce'=>$batchNonce,'items'=>[$row,$row]]);
if(!$result['created']||G::batch($db,'admin',$b,['nonce'=>$batchNonce,'items'=>[$row,$row]])['created'])throw new RuntimeException('Batch replay failed');
try{G::batch($db,'admin',$b,['nonce'=>$batchNonce,'items'=>[$row]]);throw new RuntimeException('Changed batch replay accepted');}catch(ApiError $e){}
if(count(G::listing($db,'admin',$b,'invoice')['items'])!==$before+2)throw new RuntimeException('Distinct rows lost');
for($i=0;$i<205;$i++)G::thread($db,'portal',$a,$ticket['id'],'Synthetic message '.$i);
$history=G::thread($db,'portal',$a,$ticket['id']);$ids=[];
while(true){array_push($ids,...array_column($history['messages'],'id'));if(!$history['next_cursor'])break;$history=G::thread($db,'portal',$a,$ticket['id'],null,null,$history['next_cursor']);}
if(count($ids)!==208||count(array_unique($ids))!==208)throw new RuntimeException('Support history pagination failed');
echo "PASS: atomic batch, changed replay rejection, identical distinct rows, paginated 208-message history.\n";

foreach(['senha: example-secret','Bearer example-token','PIN = 1234','meu cartão 4111 1111 1111 1111','telefone (11) 99999-0000'] as $q)if(!\ArgusPayments\ArgusAI::sensitive($q))throw new RuntimeException('Sensitive input accepted');
if(\ArgusPayments\ArgusAI::publicTopic('meu saldo é 25 reais')!==null||\ArgusPayments\ArgusAI::publicTopic('como integrar a api?')!=='integration'||\ArgusPayments\ArgusAI::chooseFaq('pix','R$ 1000 confirmado')!==null)throw new RuntimeException('Untrusted model output or private question accepted');
$payload=json_encode(['items'=>array_fill(0,50,['title'=>str_repeat('á',100),'note'=>str_repeat('ã',100),'amount_cents'=>100,'due'=>'2027-01-01']),'nonce'=>bin2hex(random_bytes(16))],JSON_UNESCAPED_UNICODE);
if(strlen($payload)<=12288||count(G::batchInput($payload)['items'])!==50)throw new RuntimeException('Long batch rejected');
try{G::batchInput(str_repeat('x',65537));throw new RuntimeException('Oversized batch accepted');}catch(ApiError $e){}
$hash=hash('sha256','expired synthetic token');$db->run('INSERT INTO argus_growth_verify(token_hash,audience,owner_id,operation_id,kind,expires_at,revoked,created_at) VALUES (?,?,?,?,?,?,?,?)',[$hash,'admin',$b,$id,'deposit','2000-01-01 00:00:00',0,'1999-01-01 00:00:00']);
G::maintenance($db);if($db->one('SELECT token_hash FROM argus_growth_verify WHERE token_hash=?',[$hash]))throw new RuntimeException('Expired token not removed');
$cached=G::cachedMetrics($db,'admin',$a);$cached2=G::cachedMetrics($db,'admin',$a);if(!$cached2['cached']||$cached['gross_cents']!==$cached2['gross_cents'])throw new RuntimeException('Cache consistency');
$fake='ntf_fixture_'.bin2hex(random_bytes(8));G::queueAdvisory($db,'admin',$a,'test',$fake);$now=time();$calls=0;
$send=function($eid)use(&$calls){$calls++;return ['failed'=>$calls===1?1:0];};
G::retryAdvisories($db,$send,$now);G::retryAdvisories($db,$send,$now+1);G::retryAdvisories($db,$send,$now+61);G::retryAdvisories($db,$send,$now+900);
if($calls!==2)throw new RuntimeException('Retry backoff or terminal deduplication failed');
echo "PASS: private AI inputs, constrained FAQ output, 64KiB batch, metric cache, expired token cleanup and advisory retry backoff.\n";

if(G::deliveryComplete(['failed'=>0,'deferred'=>true,'status'=>'transport_unavailable'])||!G::deliveryComplete(['failed'=>0,'deferred'=>false,'status'=>'processed']))throw new RuntimeException('Push transport state lost');
$subject='fixture-deferred';$calls=0;$process=function($subject)use(&$calls){if(++$calls===1)throw new RuntimeException('Synthetic temporary failure');};
$clock=time();if(G::scanAccount($db,'fixture',$subject,$process,$clock))throw new RuntimeException('Failed account marked processed');
G::retryScans($db,'fixture',$process,$clock+1);if($calls!==1)throw new RuntimeException('Backoff bypassed');
G::retryScans($db,'fixture',$process,$clock+31);if($calls!==2||$db->one("SELECT subject FROM argus_growth_scan_retry WHERE job='fixture'"))throw new RuntimeException('Deferred account not recovered');
G::heartbeat($db,'start',$clock);G::heartbeat($db,'complete',$clock+1);$health=G::workerHealth($db,$clock+2);
if(!$health['last_completed_at']||$health['status']!==($db->driver()==='pgsql'?'healthy':'not_supported'))throw new RuntimeException('Heartbeat invalid');
if($db->driver()==='pgsql'&&G::workerHealth($db,$clock+400)['status']!=='stale')throw new RuntimeException('Stale worker undetected');
echo "PASS: delivery deferral, durable account retry, heartbeat and isolated database driver=".$db->driver().".\n";

$dead='ntf_dead_'.bin2hex(random_bytes(8));$clock=time();
$db->run('INSERT INTO argus_notice_events(id,unique_key,audience_type,audience_id,category,title,body,amount_cents,link,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[$dead,hash('sha256',$dead),'admin',$a,'announcement','Fixture','Synthetic',null,'/admin',Database::stamp()]);
G::queueAdvisory($db,'admin',$a,'dead',$dead);
$fail=static fn($eid)=>['failed'=>1,'deferred'=>true];foreach([0,61,182,423,904] as $seconds)G::retryAdvisories($db,$fail,$clock+$seconds);
$deadId=hash('sha256','notice|advisory|'.$dead);
if(!$db->one("SELECT id FROM argus_growth_failed_jobs WHERE id=? AND state='pending'",[$deadId]))throw new RuntimeException('Exhausted notification lost');
G::recoverJob($db,$deadId,$a,$clock+905);
if((int)$db->one('SELECT attempts FROM argus_growth_notice_retry WHERE event_id=?',[$dead])['attempts']!==0)throw new RuntimeException('Manual notification recovery failed');
try{G::recoverJob($db,$deadId,$a,$clock+906);throw new RuntimeException('Duplicate recovery accepted');}catch(ApiError $e){}
G::retryAdvisories($db,static fn($eid)=>['failed'=>0],$clock+905);
$subject='portal|fixture-terminal';for($i=0;$i<8;$i++)G::deferScan($db,'flow',$subject,$clock);
$scanId=hash('sha256','scan|flow|'.$subject);
$tries=0;G::retryScans($db,'flow',function($s)use(&$tries){$tries++;},$clock+3600);
if($tries!==0||!$db->one("SELECT id FROM argus_growth_failed_jobs WHERE id=? AND state='pending'",[$scanId]))throw new RuntimeException('Terminal scan still active or lost');
G::recoverJob($db,$scanId,$a,$clock+3601);G::retryScans($db,'flow',function($s)use(&$tries){$tries++;},$clock+3601);
if($tries!==1)throw new RuntimeException('Manual account recovery failed');
if($db->driver()==='pgsql'){
 $other=new Database(require '/var/www/html/config.php');
 $owner='snapshot-'.bin2hex(random_bytes(8));$record='qpx_'.bin2hex(random_bytes(16));
 $counts=G::readSnapshot($db,function()use($db,$other,$owner,$record){
  $before=(int)$db->one('SELECT COUNT(*) AS n FROM admin_quick_pix WHERE actor_id=?',[$owner])['n'];
  $stamp=Database::stamp();$other->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$record,$owner,hash('sha256','idem'.$record),hash('sha256','body'.$record),100,'Snapshot fixture','fixture_'.$record,null,'paid',$stamp,$stamp]);
  $after=(int)$db->one('SELECT COUNT(*) AS n FROM admin_quick_pix WHERE actor_id=?',[$owner])['n'];
  return [$before,$after];
 });
 if($counts!==[0,0]||G::metrics($db,'admin',$owner)['confirmed_count']!==1)throw new RuntimeException('Repeatable-read snapshot failed');
 echo "PASS: PostgreSQL read-only repeatable snapshot under independent committed write.\n";
}
echo "PASS: exhausted alerts, terminal account scans, audited manual recovery and duplicate recovery protection.\n";

$crash='ntf_crash_'.bin2hex(random_bytes(8));$clock=time();
$db->run('INSERT INTO argus_notice_events(id,unique_key,audience_type,audience_id,category,title,body,amount_cents,link,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[$crash,hash('sha256',$crash),'admin',$a,'announcement','Fixture','Synthetic',null,'/admin',Database::stamp()]);
G::queueAdvisory($db,'admin',$a,'crash',$crash);
$db->run('UPDATE argus_growth_notice_retry SET attempts=4,next_at=?,expires_at=? WHERE event_id=?',[$clock,$clock+30,$crash]);
$claim=G::claimAdvisory($db,$crash,$clock);
if(!$claim||$claim['attempt']!==5)throw new RuntimeException('Final claim failed');
$crashId=hash('sha256','notice|advisory|'.$crash);
G::maintenance($db,$clock+31);
if($db->one('SELECT id FROM argus_growth_failed_jobs WHERE id=?',[$crashId]))throw new RuntimeException('Cleanup raced active delivery');
G::maintenance($db,$clock+121);
if(!$db->one("SELECT id FROM argus_growth_failed_jobs WHERE id=? AND state='pending' AND reason='delivery_interrupted'",[$crashId]))throw new RuntimeException('Final interrupted attempt lost');
if(G::finishAdvisory($db,$crash,$claim,['failed'=>0,'accepted'=>1],$clock+122))throw new RuntimeException('Stale worker finalized expired claim');
G::recoverJob($db,$crashId,$a,$clock+123);
$db->run('UPDATE argus_growth_notice_retry SET attempts=4,next_at=? WHERE event_id=?',[$clock+124,$crash]);
$second=G::claimAdvisory($db,$crash,$clock+124);if(!$second)throw new RuntimeException('Reclaim failed');
G::finishAdvisory($db,$crash,$second,['failed'=>1,'deferred'=>true],$clock+125);
G::archiveJob($db,$crashId,$a,$clock+126);
$history=G::failureHistory($db,$crashId);
if(count($history['items'])!==4||!in_array('requeued',array_column($history['items'],'action'),true)||!in_array('archived',array_column($history['items'],'action'),true))throw new RuntimeException('Immutable history lost');
if($db->one("SELECT id FROM argus_growth_failed_jobs WHERE id=? AND state='pending'",[$crashId]))throw new RuntimeException('Archived job still pending');
if(G::workerHealth($db,$clock+127)['notice_outcome']!=='deferred')throw new RuntimeException('False push delivery status');
echo "PASS: final-attempt crash recovery, active lease protection, stale worker rejection, append-only recovery history and archival.\n";

$terminal='portal|terminal-'.bin2hex(random_bytes(8));$clock=time();
for($i=0;$i<7;$i++)G::deferScan($db,'flow',$terminal,$clock);
$terminalId=hash('sha256','scan|flow|'.$terminal);
$pdo=$db->pdo();
if($db->driver()==='pgsql'){
 $pdo->exec("CREATE FUNCTION argus_fixture_fail_history() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Synthetic rollback'; END; \$\$");
 $pdo->exec("CREATE TRIGGER argus_fixture_history BEFORE INSERT ON argus_growth_failure_history FOR EACH ROW EXECUTE FUNCTION argus_fixture_fail_history()");
}else $pdo->exec("CREATE TRIGGER argus_fixture_history BEFORE INSERT ON argus_growth_failure_history BEGIN SELECT RAISE(ABORT,'Synthetic rollback'); END");
$failed=false;try{G::deferScan($db,'flow',$terminal,$clock+1);}catch(\PDOException $e){$failed=true;}
if($db->driver()==='pgsql'){$pdo->exec('DROP TRIGGER argus_fixture_history ON argus_growth_failure_history');$pdo->exec('DROP FUNCTION argus_fixture_fail_history()');}
else $pdo->exec('DROP TRIGGER argus_fixture_history');
if(!$failed||(int)$db->one('SELECT attempts FROM argus_growth_scan_retry WHERE job=? AND subject=?',['flow',$terminal])['attempts']!==7||$pdo->inTransaction())throw new RuntimeException('Terminal scan rollback failed');
G::deferScan($db,'flow',$terminal,$clock+2);
G::archiveJob($db,$terminalId,$a,$clock+3);
$archived=G::failedJobs($db,null,'archived');
$found=array_values(array_filter($archived['items'],static fn($x)=>$x['id']===$terminalId));
if(count($found)!==1||$found[0]['retry_allowed']||$found[0]['reviewed_by']!==$a)throw new RuntimeException('Archived history inaccessible');
$hist=G::failureHistory($db,$terminalId)['items'];
if(array_column($hist,'action')!==['failed','archived'])throw new RuntimeException('History not chronological');
$orphan='portal|orphan-'.bin2hex(random_bytes(8));$db->run('INSERT INTO argus_growth_scan_retry(job,subject,attempts,next_at) VALUES (?,?,?,?)',['flow',$orphan,8,$clock]);
G::repairTerminalScans($db,$clock);
if(!$db->one('SELECT id FROM argus_growth_failed_jobs WHERE id=?',[hash('sha256','scan|flow|'.$orphan)]))throw new RuntimeException('Legacy interrupted scan not repaired');
$before=(int)$db->one('SELECT COUNT(*) AS n FROM argus_growth_mutex')['n'];
for($i=0;$i<40;$i++)G::deferScan($db,'fixture','bounded-'.$i.'-'.bin2hex(random_bytes(8)),$clock);
$after=(int)$db->one('SELECT COUNT(*) AS n FROM argus_growth_mutex')['n'];
if($db->driver()==='pgsql'&&$before!==$after)throw new RuntimeException('Persistent PostgreSQL locks grew');
if($db->driver()==='sqlite'&&(int)$db->one("SELECT COUNT(*) AS n FROM argus_growth_mutex WHERE lock_key LIKE 'v8:%'")['n']>4096)throw new RuntimeException('Mutex namespace unbounded');
echo "PASS: atomic terminal scan rollback, legacy repair, archived list, chronological history and bounded locks.\n";

if(!$db->one("SELECT id FROM argus_growth_failed_jobs WHERE id=? AND state='resolved'",[$deadId])||!$db->one("SELECT id FROM argus_growth_failed_jobs WHERE id=? AND state='resolved'",[$scanId]))throw new RuntimeException('Recovered work not resolved');
if(!in_array('resolved',array_column(G::failureHistory($db,$deadId)['items'],'action'),true)||!in_array('resolved',array_column(G::failureHistory($db,$scanId)['items'],'action'),true))throw new RuntimeException('Resolution not audited');
$retry=$db->one('SELECT attempts,next_at FROM argus_growth_scan_retry WHERE job=? AND subject=?',['flow',$terminal]);
if((int)$retry['attempts']!==0||(int)$retry['next_at']!==$clock+1803)throw new RuntimeException('Archive permanently paused account');
$ran=0;G::retryScans($db,'flow',function($s)use(&$ran,$terminal){if($s===$terminal)$ran++;},$clock+1802);
if($ran!==0)throw new RuntimeException('Archive cooldown bypassed');
G::retryScans($db,'flow',function($s)use(&$ran,$terminal){if($s===$terminal)$ran++;},$clock+1803);
if($ran!==1||!$db->one("SELECT id FROM argus_growth_failed_jobs WHERE id=? AND state='resolved'",[$terminalId]))throw new RuntimeException('Archived account not resumed and resolved');
$legacy='portal|legacy-archived-'.bin2hex(random_bytes(8));$legacyId=hash('sha256','scan|flow|'.$legacy);
for($i=0;$i<8;$i++)G::deferScan($db,'flow',$legacy,$clock);
G::archiveJob($db,$legacyId,$a,$clock+1);
$db->run('UPDATE argus_growth_scan_retry SET attempts=8 WHERE job=? AND subject=?',['flow',$legacy]);
G::saveCursor($db,'terminal_scan_repair_job','');G::saveCursor($db,'terminal_scan_repair_subject','');
G::repairTerminalScans($db,$clock+2);
$legacyRow=$db->one('SELECT attempts,next_at FROM argus_growth_scan_retry WHERE job=? AND subject=?',['flow',$legacy]);
if((int)$legacyRow['attempts']!==0||(int)$legacyRow['next_at']!==$clock+1802)throw new RuntimeException('Legacy archived scan not resumed');
$resolved=G::failedJobs($db,null,'resolved');
if(!in_array($terminalId,array_column($resolved['items'],'id'),true))throw new RuntimeException('Resolved filter missing');
echo "PASS: resumed archived account after cooldown, repaired legacy archive, audited scan and notification resolution.\n";
