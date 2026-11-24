<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\ArgusGrowth;
use ArgusPayments\ArgusAI;
try{
 $db=new Database(require '/var/www/html/config.php');if(!in_array($db->driver(),['pgsql','mysql'],true))exit(0);
 $pdo=$db->pdo();$pg=$db->driver()==='pgsql';
 if($pg)$locked=$pdo->query("SELECT CASE WHEN pg_try_advisory_lock(hashtext(current_schema()||':argus-growth-advisory')) THEN 1 ELSE 0 END")->fetchColumn();
 else $locked=$pdo->query("SELECT GET_LOCK(CONCAT(DATABASE(),':argus-growth-advisory'),0)")->fetchColumn();
 if((int)$locked!==1)exit(0);
 ArgusGrowth::ready($db);
 ArgusGrowth::heartbeat($db,'start');
 ArgusGrowth::maintenance($db);
 ArgusGrowth::retryAdvisories($db);
 ArgusGrowth::worker($db);ArgusAI::worker($db);
 ArgusGrowth::heartbeat($db,'complete');error_log('ARGUS_GROWTH_WORKER status=healthy');
}catch(\Throwable $e){if(isset($db,$locked)&&(int)$locked===1){try{ArgusGrowth::heartbeat($db,'error');}catch(\Throwable $ignored){}}error_log('ARGUS_GROWTH_WORKER status=unavailable class='.get_class($e));exit(1);}
finally{if(isset($locked)&&(int)$locked===1){try{$pdo->query($pg?"SELECT pg_advisory_unlock(hashtext(current_schema()||':argus-growth-advisory'))":"SELECT RELEASE_LOCK(CONCAT(DATABASE(),':argus-growth-advisory'))");}catch(\Throwable $e){}}}
