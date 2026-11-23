<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\TransactionReceipt;
$r=['id'=>'mwc_'.str_repeat('1',32),'amount_cents'=>12345,'status'=>'paid','created_at'=>'2026-11-23 00:00:00','provider_id'=>'test'];
$paid=TransactionReceipt::present('deposit',$r,123,12222,'2026-11-23 00:01:00',true,'Synthetic','1234');
if(!$paid['confirmed']||$paid['net_cents']!==12222||$paid['end_to_end_id']!==null||$paid['document_masked']!=='•••• 1234')throw new RuntimeException('Confirmed receipt data invalid');
foreach(['pending','queued','requested','failed','refunded','cancelled','review','partially_refunded'] as $status){
 $r['status']=$status;$v=TransactionReceipt::present('withdrawal',$r,null,null,null,true);
 if($v['confirmed']||!str_contains($v['notice'],'NÃO comprova'))throw new RuntimeException('Unsettled operation rendered as paid');
 if(TransactionReceipt::publicDeposit($r,12345,123,12222)!==null)throw new RuntimeException('Public unconfirmed receipt leaked');
}
$r['status']='paid';
if(TransactionReceipt::present('deposit',$r,null,null,null,false)['confirmed'])throw new RuntimeException('Unverified paid row accepted');
$public=TransactionReceipt::publicDeposit($r,12345,123,12222);
if(!$public['confirmed']||$public['account_name']!==null||$public['document_masked']!==null)throw new RuntimeException('Public receipt privacy failure');
$source=file_get_contents('/var/www/html/src/TransactionReceipt.php');
foreach(['WHERE id=? AND account_id=?','WHERE id=? AND actor_id=?','operation_kind=?','self::listing','superadmin'] as $anchor)if(!str_contains($source,$anchor))throw new RuntimeException('Receipt scope missing');
if(preg_match('/(?:INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|->transaction\(|->run\()/i',$source))throw new RuntimeException('Receipt must be read only');
echo "PASS: confirmed receipt, pending/refunded non-confirmation, masked documents, public privacy, account scope and read-only code.\n";


// Synthetic historical records: no provider calls or production data.
$db=new \ArgusPayments\Database(require '/var/www/html/config.php');
$db->installAndSeed();\ArgusPayments\Admin::install($db);\ArgusPayments\FeeExecution::install($db);
$a='receipt-history-'.bin2hex(random_bytes(8));$b='receipt-other-'.bin2hex(random_bytes(8));
$ids=[];
foreach(range(0,151) as $i){
 $id='qpx_'.bin2hex(random_bytes(16));$ids[]=$id;
 $owner=$i===151?$b:$a;$status=$i===150?'pending':'paid';
 $db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  [$id,$owner,hash('sha256','idem'.$id),hash('sha256','body'.$id),100+$i,'Synthetic archive','tr_test_'.$id,null,$status,'2024-01-01 00:00:00','2024-01-01 00:01:00']);
}
$first=TransactionReceipt::confirmedAdminPix($db,$a);
if(count($first['items'])!==100||!$first['next_cursor'])throw new RuntimeException('Archive first page wrong');
$second=TransactionReceipt::confirmedAdminPix($db,$a,$first['next_cursor']);
$all=array_column(array_merge($first['items'],$second['items']),'id');
if(count($all)!==150||count(array_unique($all))!==150||$second['next_cursor']!==null||in_array($ids[150],$all,true)||in_array($ids[151],$all,true))throw new RuntimeException('Historical pagination or account scope wrong');
$receipt=TransactionReceipt::admin($db,$a,$ids[0],'deposit');
if(!$receipt['confirmed']||$receipt['amount_cents']!==100||$receipt['fee_cents']!==null)throw new RuntimeException('Historical receipt wrong or invented fee');
try{TransactionReceipt::confirmedAdminPix($db,$a,$ids[151]);throw new RuntimeException('Foreign cursor accepted');}catch(\ArgusPayments\ApiError $expected){}
echo "PASS: all historical paid admin Pix, 150 records across pages, expired QR independent, tenant isolation and pending exclusion.\n";

$receiptJs=file_get_contents('/var/www/html/public/static/transaction-receipts.js');
foreach(["const fileName='ArgusPay.pdf'","https://app.arguspay.com.br/conta#cadastro","url:registerUrl","text:registerUrl","new File([prepared],fileName","document.title='ArgusPay'","Copiar link de cadastro"] as $needle)
 if(!str_contains($receiptJs,$needle))throw new RuntimeException('Receipt share name/link contract missing: '.$needle);
if(str_contains($receiptJs,'navigator.share({url:url')||str_contains($receiptJs,'ArgusPay-\'+r.kind'))throw new RuntimeException('Old receipt share name or temporary URL retained');
echo "PASS: ArgusPay.pdf filename, public registration link, native file sharing and copy fallback.\n";
