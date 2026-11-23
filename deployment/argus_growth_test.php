<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\ArgusGrowth as G;
use ArgusPayments\Database;
use ArgusPayments\ApiError;
$db=new Database(require '/var/www/html/config.php');
if($db->driver()!=='sqlite')throw new RuntimeException('Synthetic tests only');
putenv('ARGUS_SECURITY_RATE_SECRET='.bin2hex(random_bytes(32))); // ephemeral test-only secret
$db->installAndSeed();\ArgusPayments\Admin::install($db);\ArgusPayments\FeeExecution::install($db);G::install($db);
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
