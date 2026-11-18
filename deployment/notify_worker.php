<?php
declare(strict_types=1);
/**
 * ARGUS read-only, opt-in reconciliation worker.
 * This file never creates a charge, makes a withdrawal or marks a payment paid
 * without verifying the original provider transaction and its amount.
 */
if(PHP_SAPI!=='cli')exit(1);
if(getenv('ARGUS_NOTIFICATIONS_WORKER_ENABLED')!=='yes')exit(0);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\Admin;
use ArgusPayments\Notifications;
use ArgusPayments\LivePix;
use ArgusPayments\Integrations\MisticPayFinance;
use ArgusPayments\Integrations\MisticPayPayout;
if(getenv('ARGUS_DB_DRIVER')!=='pgsql'&&getenv('ARGUS_DB_DRIVER')!=='mysql')exit(0);
$db=new Database(require '/var/www/html/config.php');
$db->installAndSeed();
Admin::install($db);
Notifications::install($db);
$counts=['quick'=>0,'merchant'=>0,'payout'=>0];
$cutoff=gmdate('Y-m-d\TH:i:s\Z',time()-86400);
$since=gmdate('Y-m-d\TH:i:s\Z',time()-75);
if(MisticPayFinance::configured()){
 try{
  $finance=new MisticPayFinance((string)getenv('ARGUS_FINANCE_QR_CLIENT_ID'),(string)getenv('ARGUS_FINANCE_QR_CLIENT_SECRET'));
  $rows=$db->all("SELECT * FROM admin_quick_pix WHERE status IN ('pending','unknown') AND provider_id IS NOT NULL AND provider_id<>'' AND created_at>=? AND (checked_at IS NULL OR checked_at<?) ORDER BY created_at ASC LIMIT 20",[$cutoff,$since]);
  foreach($rows as $row){
   try{
    $check=$finance->check((string)$row['provider_id']);
    if($check['provider_id']!==$row['provider_id']||($check['amount_cents']!==null&&(int)$check['amount_cents']!==(int)$row['amount_cents']))throw new RuntimeException('Quick Pix response mismatch');
    $status=match(strtoupper($check['status'])){
      'PAID','SETTLED','COMPLETED'=>'paid','EXPIRED'=>'expired','CANCELLED','CANCELED','FAILED','REFUSED'=>'failed',
      'PENDING','CREATED','ACTIVE'=>'pending',default=>'unknown'};
    if($status==='paid'){
      $changed=$db->run("UPDATE admin_quick_pix SET status='paid',checked_at=? WHERE id=? AND status IN ('pending','unknown')",[Database::stamp(),$row['id']]);
      if($changed->rowCount()>0)Notifications::adminPixReceived($db,$row['id'],(int)$row['amount_cents']);
    } else {
      $db->run('UPDATE admin_quick_pix SET status=?,checked_at=? WHERE id=? AND status IN (\'pending\',\'unknown\')',[$status,Database::stamp(),$row['id']]);
    }
    $counts['quick']++;
   }catch(Throwable $e){error_log('ARGUS quick Pix reconciliation failed: '.get_class($e));}
  }
 }catch(Throwable $e){error_log('ARGUS quick Pix worker unavailable: '.get_class($e));}
}
if(LivePix::readiness($db)['ready']){
 try{
  $rows=$db->all("SELECT * FROM b2b_live_pix WHERE status IN ('pending','review') AND provider_tx_id IS NOT NULL AND provider_tx_id<>'' AND created_at>=? AND (checked_at IS NULL OR checked_at<?) ORDER BY created_at ASC LIMIT 15",[$cutoff,$since]);
  foreach($rows as $row){
   try{LivePix::reconcile($db,$row);$counts['merchant']++;}
   catch(Throwable $e){error_log('ARGUS merchant Pix status check failed: '.get_class($e));}
  }
 }catch(Throwable $e){error_log('ARGUS merchant reconciliation unavailable: '.get_class($e));}
}
if(getenv('ARGUS_PAYOUTS_ENABLED')==='yes'&&strlen((string)getenv('ARGUS_MISTICPAY_PAYOUT_PK'))>10){
 try{
  $payout=new MisticPayPayout((string)getenv('ARGUS_MISTICPAY_PAYOUT_PK'),(string)getenv('ARGUS_MISTICPAY_PAYOUT_SK'));
  $rows=$db->all("SELECT * FROM admin_payouts WHERE status IN ('pending','queued','unknown') AND provider_tx_id IS NOT NULL AND provider_tx_id<>'' AND created_at>=? AND (checked_at IS NULL OR checked_at<?) ORDER BY created_at ASC LIMIT 12",[$cutoff,$since]);
  foreach($rows as $row){
   try{
    $result=$payout->status((string)$row['provider_tx_id']);
    if($result['transaction_id']!==$row['provider_tx_id'])throw new RuntimeException('Payout transaction mismatch');
    $status=match($result['state']){
      'COMPLETO'=>'paid','PENDENTE'=>'pending','FALHA'=>'failed','CANCELADO'=>'cancelled',
      'DEVOLVIDO'=>'refunded','DEVOLVIDO_PARCIAL'=>'partially_refunded'};
    if($status==='paid'){
      $changed=$db->run("UPDATE admin_payouts SET status='paid',checked_at=? WHERE id=? AND status IN ('pending','queued','unknown')",[Database::stamp(),$row['id']]);
      if($changed->rowCount()>0)Notifications::adminPixSent($db,$row['actor_id'],$row['id'],(int)$row['amount_cents']);
    }else{$db->run('UPDATE admin_payouts SET status=?,checked_at=? WHERE id=? AND status IN (\'pending\',\'queued\',\'unknown\')',[$status,Database::stamp(),$row['id']]);}
    $counts['payout']++;
   }catch(Throwable $e){error_log('ARGUS payout reconciliation failed: '.get_class($e));}
  }
 }catch(Throwable $e){error_log('ARGUS payout read-only worker unavailable: '.get_class($e));}
}
error_log('ARGUS notification reconciliation cycle complete: quick='.$counts['quick'].' merchant='.$counts['merchant'].' payouts='.$counts['payout']);
