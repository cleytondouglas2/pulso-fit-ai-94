<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Compliance;
use ArgusPayments\ApiError;
foreach(['reseller','viewer','admin',''] as $role){try{Compliance::authorize(['role'=>$role]);throw new RuntimeException('Unauthorized role accepted');}catch(ApiError $expected){}}
Compliance::authorize(['role'=>'superadmin']);
if(count(Compliance::sources())!==4)throw new RuntimeException('Source coverage wrong');
$db=new \ArgusPayments\Database(require '/var/www/html/config.php');
$db->installAndSeed();\ArgusPayments\Admin::install($db);\ArgusPayments\FeeExecution::install($db);
$id='qpx_'.bin2hex(random_bytes(16));
$db->run('INSERT INTO admin_quick_pix(id,actor_id,idempotency_hash,body_hash,amount_cents,description,provider_id,qr_copy,status,created_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$id,'synthetic-audit',hash('sha256',$id),hash('sha256','body'.$id),1200,'Synthetic trace','test-reference',null,'pending','2026-01-01 00:00:00','2026-01-01 00:01:00']);
$r=Compliance::trace($db,['role'=>'superadmin'],'admin-deposit',$id);
if($r['operation']['status']!=='pending'||$r['operation']['amount_cents']!=1200||$r['end_to_end_id']!==null||count($r['events'])!==2)throw new RuntimeException('Incorrect trace or invented confirmation');
foreach([['bad-source',$id],['admin-deposit','bad/id'],['admin-deposit','missing']] as [$source,$ref]){try{Compliance::trace($db,['role'=>'superadmin'],$source,$ref);throw new RuntimeException('Invalid reference accepted');}catch(ApiError $expected){}}
try{Compliance::trace($db,['role'=>'reseller'],'admin-deposit',$id);throw new RuntimeException('Cross-role trace exposed');}catch(ApiError $expected){}
foreach(['privacy-lgpd.html','terms-of-use.html'] as $f){$s=file_get_contents('/var/www/html/public/static/'.$f);if(!str_contains($s,'MINUTA')||!str_contains($s,'não vigente'))throw new RuntimeException('Unreviewed legal text misrepresented');}
echo "PASS: superadmin-only read-only trace, synthetic record and legal draft labeling\n";

// Structured API responses must round-trip without emitting HTML metacharacters.
$probe=['provider_reference'=>"</script><svg onload=alert(1)>&'\"",'status'=>'pending'];
$encoded=Compliance::encodeJson($probe);
if(strpbrk($encoded,"<>&'")!==false||json_decode($encoded,true,512,JSON_THROW_ON_ERROR)!==$probe)throw new RuntimeException('Unsafe JSON encoding or lost audit data');
echo "PASS: XSS-safe JSON response encoding and exact data round-trip\n";
