<?php
declare(strict_types=1);
require_once '/var/www/html/src/AI.php';
use ArgusPayments\ArgusAI;
$now=strtotime('2026-11-18T18:00:00Z');
$rows=[];
for($i=0;$i<8;$i++)$rows[]=['status'=>'paid','direction'=>'received','amount_cents'=>2000,'created_at'=>gmdate('Y-m-d\TH:i:s\Z',$now-60-$i*40)];
$rows[]=['status'=>'pending','direction'=>'sent','amount_cents'=>3000,'created_at'=>gmdate('Y-m-d\TH:i:s\Z',$now-70)];
$x=ArgusAI::analyze($rows,$now);
if($x['received_cents']!==16000||$x['sent_cents']!==0||$x['pending_count']!==1||$x['paid_count']!==8||!count($x['alerts']))throw new RuntimeException('ARGUS IA calculation failed');
if(isset($x['records'])||isset($x['transactions']))throw new RuntimeException('ARGUS IA must not expose raw data');
$empty=ArgusAI::analyze([],$now);
if($empty['received_cents']!==0||count($empty['alerts'])!==0)throw new RuntimeException('ARGUS IA empty analytics failed');
echo "ARGUS IA insights and protective aggregation unit tests passed\n";
