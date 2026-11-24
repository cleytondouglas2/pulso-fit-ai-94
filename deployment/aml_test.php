<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\AmlCenter;
use ArgusPayments\ApiError;
$db=new \ArgusPayments\Database(require '/var/www/html/config.php');
$db->installAndSeed();\ArgusPayments\Portal::install($db);\ArgusPayments\MerchantWallet::install($db);\ArgusPayments\HybridPayout::install($db);AmlCenter::install($db);
if(AmlCenter::signals([],null)!==[])throw new RuntimeException('Empty account falsely flagged');
$m=['deposit_count'=>12,'deposit_cents'=>200000,'similar_count'=>12,'withdraw_cents'=>190000,'month_cents'=>300000,'payout_review_count'=>2];
$p=['expected_monthly_cents'=>100000,'sanctions'=>'pending','pep'=>'confirmed','risk'=>'high'];
$s=AmlCenter::signals($m,$p);
foreach(['repeated_similar_credits','high_in_out_ratio','repeated_payout_review','profile_volume_deviation','pep_due_diligence','high_risk_profile'] as $key)if(!isset($s[$key]))throw new RuntimeException('Pilot signal missing');
if(isset($s['sanctions_manual_review']))throw new RuntimeException('Pending screening treated as match');
$actor=['role'=>'superadmin','id'=>'synthetic-reviewer'];$id=bin2hex(random_bytes(32));$now=gmdate('c');
$db->run("INSERT INTO argus_aml_cases(id,account_id,rule_code,rule_version,period_key,severity,evidence_json,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'open',?,?)",[$id,'synthetic-account','pilot','pilot-1',gmdate('Y-m-d'),'medium','{}',$now,$now]);
try{AmlCenter::overview($db,['role'=>'reseller']);throw new RuntimeException('Restricted case data exposed');}catch(ApiError $e){}
try{AmlCenter::decide($db,$actor,['case_id'=>$id,'from_state'=>'open','state'=>'closed_no_escalation','evidence_ref'=>'TEST.1']);throw new RuntimeException('Invalid transition accepted');}catch(ApiError $e){}
AmlCenter::decide($db,$actor,['case_id'=>$id,'from_state'=>'open','state'=>'investigating','evidence_ref'=>'TEST.1']);
AmlCenter::decide($db,$actor,['case_id'=>$id,'from_state'=>'investigating','state'=>'escalated','evidence_ref'=>'TEST.2']);
$d=AmlCenter::detail($db,$actor,$id);
if($d['case']['state']!=='escalated'||count($d['events'])!==2)throw new RuntimeException('Case state or history wrong');
try{AmlCenter::decide($db,$actor,['case_id'=>$id,'from_state'=>'investigating','state'=>'closed_no_escalation','evidence_ref'=>'TEST.3']);throw new RuntimeException('Stale review accepted');}catch(ApiError $e){}
echo "PASS: AML pilot signals, no fabricated match, RBAC, state transitions, review history and stale-write protection\n";
