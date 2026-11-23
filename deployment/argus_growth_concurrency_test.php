<?php
declare(strict_types=1);
// Invoked only by the isolated build test. Never open a production database.
if(PHP_SAPI!=='cli')exit(1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database;
use ArgusPayments\ArgusGrowth as G;
use ArgusPayments\ApiError;
if(($argv[1]??'')==='child'){
 $file=$argv[2]??'';
 if(!preg_match('~^/tmp/argus_growth_fixture_[a-f0-9]{24}\.sqlite$~D',$file)||!is_file($file))exit(2);
 $mode=$argv[3]??'';
 $db=new Database(array_merge(require '/var/www/html/config.php',['driver'=>'sqlite','sqlite_path'=>$file]));
 if($db->driver()!=='sqlite')exit(2);
 $db->pdo()->exec('PRAGMA busy_timeout=10000');
 // Refuse accidental use of another SQLite path.
 $actual=$db->pdo()->query('PRAGMA database_list')->fetchAll(\PDO::FETCH_ASSOC);
 if(($actual[0]['file']??'')!==$file)exit(2);
 try{
  if($mode==='verify'){G::verification($db,'admin','load-fixture','deposit','qpx_load_fixture');echo 'created';}
  elseif($mode==='record'){G::create($db,'admin','load-fixture','invoice',['title'=>'Retry fixture','note'=>'','amount_cents'=>100,'due'=>'2027-01-01','nonce'=>str_repeat('a',32)]);echo 'ok';}
  else exit(2);
 }catch(ApiError $e){if($mode==='verify'){echo 'limited';}else{fwrite(STDERR,get_class($e));exit(3);}}
 exit(0);
}
if(getenv('ARGUS_DB_DRIVER')!=='sqlite')exit(2);
$file='/tmp/argus_growth_fixture_'.bin2hex(random_bytes(12)).'.sqlite';
touch($file);
try{
 $config=array_merge(require '/var/www/html/config.php',['driver'=>'sqlite','sqlite_path'=>$file]);
 $db=new Database($config);
 $actual=$db->pdo()->query('PRAGMA database_list')->fetchAll(\PDO::FETCH_ASSOC);
 if($db->driver()!=='sqlite'||($actual[0]['file']??'')!==$file)throw new RuntimeException('Unsafe fixture configuration');
 $db->pdo()->exec('PRAGMA busy_timeout=10000');
 $db->pdo()->exec('PRAGMA journal_mode=WAL');
 $db->installAndSeed();\ArgusPayments\Admin::install($db);\ArgusPayments\FeeExecution::install($db);G::install($db);
 $now=gmdate('Y-m-d H:i:s');
 $insert='INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
 $db->pdo()->beginTransaction();
 $db->run($insert,['qpx_load_fixture','load-fixture',hash('sha256','load fixture idem'),hash('sha256','load fixture body'),100,'Synthetic fixture','fixture_provider',null,'paid',$now,$now]);
 for($i=0;$i<10000;$i++){
  $id='qpx_load_'.str_pad((string)$i,8,'0',STR_PAD_LEFT);
  $db->run($insert,[$id,'load-fixture',hash('sha256','idem'.$id),hash('sha256','body'.$id),100,'Synthetic load','fixture_'.$id,null,'paid',$now,$now]);
 }
 $db->pdo()->commit();
 $start=microtime(true);$report=G::metrics($db,'admin','load-fixture');
 if($report['confirmed_count']!==10001||$report['gross_cents']!==1000100)throw new RuntimeException('10k aggregate mismatch');
 printf("PASS: 10001 synthetic paid entries, exact aggregate (%.3fs in SQLite fixture).\n",microtime(true)-$start);
 $run=function(string $mode,int $n)use($file):array{
  $children=[];
  for($i=0;$i<$n;$i++){
   $pipes=[];$p=proc_open([PHP_BINARY,__FILE__,'child',$file,$mode],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
   if(!is_resource($p))throw new RuntimeException('Child start failed');
   fclose($pipes[0]);$children[]=[$p,$pipes];
  }
  $results=[];
  foreach($children as [$p,$pipes]){
   $out=trim(stream_get_contents($pipes[1]));$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);
   if(proc_close($p)!==0)throw new RuntimeException('Concurrent child failed: '.substr($err,0,200));$results[]=$out;
  }
  return $results;
 };
 $tokens=$run('verify',14);if(count(array_filter($tokens,fn($s)=>$s==='created'))!==10||count(array_filter($tokens,fn($s)=>$s==='limited'))!==4)throw new RuntimeException('Concurrent verification cap failed');
 $run('record',8);$rows=G::listing($db,'admin','load-fixture','invoice')['items'];if(count($rows)!==1)throw new RuntimeException('Concurrent idempotency failed');
 echo "PASS: 14 competing verification requests (10 permitted), 8 competing record retries (one record).\n";
}finally{unset($db);foreach([$file,$file.'-wal',$file.'-shm'] as $p)if(is_file($p))unlink($p);}
