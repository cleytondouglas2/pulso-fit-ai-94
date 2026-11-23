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
