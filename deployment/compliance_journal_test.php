<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\LegalAcceptance;
use ArgusPayments\TransactionJournal;
use ArgusPayments\ApiError;
$db=new \ArgusPayments\Database(require '/var/www/html/config.php');
$db->installAndSeed();\ArgusPayments\Admin::install($db);\ArgusPayments\Portal::install($db);
\ArgusPayments\MerchantWallet::install($db);\ArgusPayments\FeeExecution::install($db);\ArgusPayments\MerchantWebhooks::install($db);
LegalAcceptance::install($db);TransactionJournal::install($db);
$m=LegalAcceptance::manifest('/var/www/html/public/static','v1',str_repeat('a',64));
if($m['active'])throw new RuntimeException('Draft activated');
try{LegalAcceptance::validate(['accepted_terms'=>true,'read_privacy'=>true,'legal_digest'=>$m['digest']],$m);throw new RuntimeException('Draft accepted');}catch(ApiError $expected){}
$tmp=sys_get_temp_dir().'/argus-legal-'.bin2hex(random_bytes(8));mkdir($tmp,0700);
try{
 file_put_contents($tmp.'/terms-of-use.html','Synthetic approved terms');
 file_put_contents($tmp.'/privacy-lgpd.html','Synthetic approved policy');
 $m=LegalAcceptance::manifest($tmp,'test-v1','');
 $m=LegalAcceptance::manifest($tmp,'test-v1',$m['digest']);
 if(!$m['active'])throw new RuntimeException('Approved digest refused');
 $account='synthetic-'.bin2hex(random_bytes(10));
 $body=['accepted_terms'=>true,'read_privacy'=>true,'legal_digest'=>$m['digest']];
 foreach([['accepted_terms'=>false]+$body,['legal_digest'=>'wrong']+$body] as $bad){try{LegalAcceptance::validate($bad,$m);throw new RuntimeException('Invalid acknowledgement accepted');}catch(ApiError $expected){}}
 $one=LegalAcceptance::record($db,$account,$body,$m);
 $two=LegalAcceptance::record($db,$account,$body,$m);
 if(!$one['accepted']||$one['acceptance']!==$two['acceptance']||LegalAcceptance::status($db,$account.'other',$m)['accepted'])throw new RuntimeException('Acceptance persistence or isolation failure');
 file_put_contents($tmp.'/terms-of-use.html','Synthetic modified terms');
 if(LegalAcceptance::manifest($tmp,'test-v1',$m['digest'])['active'])throw new RuntimeException('Modified terms approved by old digest');
}finally{unlink($tmp.'/terms-of-use.html');unlink($tmp.'/privacy-lgpd.html');rmdir($tmp);}
$id='qpx_'.bin2hex(random_bytes(16));$owner='synthetic-audit';
$db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$id,$owner,hash('sha256',$id),hash('sha256','body'.$id),1200,'Synthetic trace','test-reference',null,'pending','2026-01-01 00:00:00','2026-01-01 00:01:00']);
$db->run("UPDATE admin_quick_pix SET status='paid' WHERE id=?",[$id]);
$db->run("UPDATE admin_quick_pix SET status='paid' WHERE id=?",[$id]);
$r=TransactionJournal::entries($db,'admin_quick_pix',$id,$owner);
if(count($r['entries'])!==2||$r['entries'][1]['old_status']!=='pending'||$r['entries'][1]['new_status']!=='paid')throw new RuntimeException('Status capture invalid');
if(TransactionJournal::entries($db,'admin_quick_pix',$id,'foreign')['entries'])throw new RuntimeException('Owner mismatch');
$pdo=$db->pdo();$pdo->beginTransaction();
try{$db->run("DELETE FROM argus_transaction_journal WHERE operation_id=?",[$id]);throw new RuntimeException('Journal mutation allowed');}catch(PDOException $expected){}finally{if($pdo->inTransaction())$pdo->rollBack();}
if(count(TransactionJournal::entries($db,'admin_quick_pix',$id,$owner)['entries'])!==2)throw new RuntimeException('Journal mutated');
echo "PASS: explicit versioned acknowledgement, digest verification, future state history and mutation guard\n";

$owner='trace-seller-'.bin2hex(random_bytes(6));$other='trace-other-'.bin2hex(random_bytes(6));$op='mwc_'.bin2hex(random_bytes(12));$stamp=gmdate('Y-m-d H:i:s');
$db->run('INSERT INTO argus_seller_charges(id,account_id,merchant_id,idem_hash,body_hash,amount_cents,service_fee_cents,net_cents,description,provider_id,copy_paste,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$op,$owner,'synthetic',hash('sha256',$op),hash('sha256','body'.$op),1200,0,1200,'Synthetic',null,null,'paid',$stamp,$stamp]);
foreach([$owner,$other] as $account){
 $ledger='mwl_'.bin2hex(random_bytes(12));$event=bin2hex(random_bytes(16));$operation=$account===$owner?$op:'another-'.$op;
 $db->run('INSERT INTO argus_seller_ledger(id,account_id,operation_kind,operation_id,delta_available,delta_held,delta_debt,service_fee_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[$ledger,$account,'deposit_paid',$operation,1200,0,0,0,$stamp]);
 $db->run('INSERT INTO argus_merchant_webhook_deliveries(id,webhook_id,account_id,ledger_id,event_kind,payload,status,attempts,next_attempt_at,created_at,delivered_at,last_http_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[$event,'synthetic-webhook',$account,$ledger,'deposit_paid','{}','pending',0,time(),$stamp,null,null]);
 $db->run("UPDATE argus_merchant_webhook_deliveries SET status='delivered',attempts=1,last_http_code=200,delivered_at=? WHERE id=?",[$stamp,$event]);
}
$r=TransactionJournal::entries($db,'argus_seller_charges',$op,$owner);
$wh=array_values(array_filter($r['entries'],static fn($e)=>$e['source']==='argus_merchant_webhook_deliveries'));
if(count($wh)!==2||$wh[1]['new_status']!=='delivered')throw new RuntimeException('Webhook journal association failed');
$trace=\ArgusPayments\Compliance::trace($db,['role'=>'superadmin'],'seller-deposit',$op);
if(count($trace['webhook_deliveries'])!==1||$trace['webhook_deliveries'][0]['status']!=='delivered'||isset($trace['webhook_deliveries'][0]['payload']))throw new RuntimeException('Webhook trace wrong or leaked payload');
echo "PASS: webhook delivery metadata and state journal linked to correct transaction and owner\n";
