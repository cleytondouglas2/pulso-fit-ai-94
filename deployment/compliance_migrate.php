<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once '/var/www/html/src/Gateway.php';
if(getenv('ARGUS_COMPLIANCE_MIGRATION_APPROVED')!=='yes')throw new RuntimeException('Explicit migration approval required');
$db=new \ArgusPayments\Database(require '/var/www/html/config.php');
$pdo=$db->pdo();
if(!in_array($db->driver(),['sqlite','pgsql'],true))throw new RuntimeException('Unsupported journal database');
$pdo->beginTransaction();
try{
 if($db->driver()==='pgsql'){
    $pdo->exec("SET LOCAL lock_timeout='3s'");
    $pdo->exec("SET LOCAL statement_timeout='30s'");
    $pdo->query("SELECT pg_advisory_xact_lock(hashtext(current_schema()||':argus-compliance'))");
 }
 \ArgusPayments\LegalAcceptance::install($db);
 \ArgusPayments\TransactionJournal::install($db);
 $pdo->commit();
 echo "PASS: compliance migration installed; future transitions only\n";
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
