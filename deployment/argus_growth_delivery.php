<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\ArgusGrowth as G;
try{
 $db=new Database(require '/var/www/html/config.php');if(!in_array($db->driver(),['pgsql','mysql'],true))exit(0);
 G::ready($db);$pdo=$db->pdo();$pg=$db->driver()==='pgsql';
 $lock=$pg?$pdo->query("SELECT CASE WHEN pg_try_advisory_lock(hashtext(current_schema()||':argus-growth-delivery')) THEN 1 ELSE 0 END")->fetchColumn():$pdo->query("SELECT GET_LOCK(CONCAT(DATABASE(),':argus-growth-delivery'),0)")->fetchColumn();
 if((int)$lock!==1)exit(0);
 G::saveCursor($db,'notice_start',(string)time());
 G::retryAdvisories($db);
 G::saveCursor($db,'notice_complete',(string)time());
}catch(\Throwable $e){if(isset($db,$lock)&&(int)$lock===1){try{G::saveCursor($db,'notice_error',(string)time());}catch(\Throwable $ignored){}}error_log('ARGUS_ADVISORY_DELIVERY status=unavailable class='.get_class($e));exit(1);}
finally{if(isset($lock)&&(int)$lock===1){try{$pdo->query($pg?"SELECT pg_advisory_unlock(hashtext(current_schema()||':argus-growth-delivery'))":"SELECT RELEASE_LOCK(CONCAT(DATABASE(),':argus-growth-delivery'))");}catch(\Throwable $e){}}}
