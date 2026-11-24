<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\ArgusGrowth;
use ArgusPayments\Admin;
use ArgusPayments\Portal;
use ArgusPayments\MerchantWallet;
try{
 $db=new Database(require '/var/www/html/config.php');
 $pdo=$db->pdo();$pg=$db->driver()==='pgsql';$mysql=$db->driver()==='mysql';
 if($pg){$pdo->exec("SET lock_timeout='3s'");$pdo->exec("SET statement_timeout='20s'");$pdo->query("SELECT pg_advisory_lock(hashtext(current_schema()||':argus-growth-migration'))");}
 elseif($mysql&& (int)$pdo->query("SELECT GET_LOCK(CONCAT(DATABASE(),':argus-growth-migration'),3)")->fetchColumn()!==1)throw new RuntimeException('Migration lock unavailable');
 try{ArgusGrowth::ready($db);$ready=true;}catch(\Throwable $e){$ready=false;}
 if(!$ready){
  $db->installAndSeed();Admin::install($db);Portal::install($db);MerchantWallet::install($db);\ArgusPayments\Notifications::install($db);
  ArgusGrowth::financialIndexes($db,false);ArgusGrowth::financialIndexes($db,true);ArgusGrowth::install($db);
 }
 error_log('ARGUS_GROWTH_MIGRATION status=ready');
}catch(\Throwable $e){error_log('ARGUS_GROWTH_MIGRATION status=blocked class='.get_class($e));exit(1);}
finally{if(isset($pdo)){try{if($pg)$pdo->query("SELECT pg_advisory_unlock(hashtext(current_schema()||':argus-growth-migration'))");elseif($mysql)$pdo->query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':argus-growth-migration'))");}catch(\Throwable $e){}}}
