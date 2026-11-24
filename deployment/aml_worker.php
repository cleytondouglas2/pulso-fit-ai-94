<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once '/var/www/html/src/Gateway.php';
if(getenv('ARGUS_AML_ENABLED')!=='yes')exit(0);
$db=new \ArgusPayments\Database(require '/var/www/html/config.php');
$pdo=$db->pdo();$locked=false;
try{
 if($db->driver()==='pgsql'){
  $value=$pdo->query("SELECT CASE WHEN pg_try_advisory_lock(hashtext(current_schema()||':argus-aml-scan')) THEN 1 ELSE 0 END")->fetchColumn();
  $locked=(int)$value===1;
  if(!$locked)exit(0);
 }else{throw new RuntimeException('Scheduled AML scan requires shared PostgreSQL');}
 foreach(['seller','admin'] as $scope)foreach([gmdate('Y-m-d',time()-86400),gmdate('Y-m-d')] as $day){
  $cursor='';$scanned=0;$created=0;
  do{$r=\ArgusPayments\AmlCenter::scanPage($db,$day,$cursor,$scope);$scanned+=$r['scanned'];$created+=$r['created'];$cursor=$r['next_cursor'];}while($cursor!==null);
  echo "AML scope=$scope day=$day scanned=$scanned created=$created\n";
 }
}finally{if($locked)$pdo->query("SELECT pg_advisory_unlock(hashtext(current_schema()||':argus-aml-scan'))");}
