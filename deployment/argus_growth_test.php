<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\ArgusGrowth as G;
use ArgusPayments\Database;
use ArgusPayments\ApiError;
$db=new Database(require '/var/www/html/config.php');
if($db->driver()!=='sqlite')throw new RuntimeException('Synthetic tests only');
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

$invoice=G::create($db,'admin',$a,'invoice',['title'=>'Synthetic invoice','note'=>'','amount_cents'=>1234,'due'=>'2027-01-01','nonce'=>bin2hex(random_bytes(16))]);
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
