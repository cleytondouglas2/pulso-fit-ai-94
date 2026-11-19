<?php
declare(strict_types=1);
/**
 * Real local KYC summary/crypto methods plus UI contract checks.
 * Never touches production accounts or marks anyone approved.
 */
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\Database as DB;
use ArgusPayments\Portal;
use ArgusPayments\KycStudio as K;
use ArgusPayments\ApiError;

putenv('ARGUS_DOC_HMAC_KEY='.str_repeat('T',64));
$db=new DB(require '/var/www/html/config.php');
$db->installAndSeed();
Portal::install($db);K::install($db);
$id=bin2hex(random_bytes(16));
$merchant=null;
$account=['id'=>$id,'account_type'=>'PF','status'=>'documents_under_review',
    'merchant_id'=>$merchant];
$db->run('INSERT INTO argus_portal_accounts
    (id,account_type,display_name,email,document_digest,document_last4,
     password_hash,status,merchant_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
    $id,'PF','Exemplo KYC Teste','kyc-test-'.substr($id,0,8).'@example.invalid',
    hash('sha256',$id),'0000','non-login-test','documents_under_review',null,
    DB::stamp(),DB::stamp()
]);
$encrypt=new ReflectionMethod(K::class,'encrypt');
$decrypt=new ReflectionMethod(K::class,'decrypt');
$types=['identidade_frente','identidade_verso','selfie'];
foreach($types as $i=>$type){
    $docId=bin2hex(random_bytes(16));
    $bytes='synthetic protected KYC document '.$type.' '.str_repeat('X',1200);
    $sealed=$encrypt->invoke(null,$bytes);
    if(!is_string($sealed)||str_contains($sealed,$bytes))
        throw new RuntimeException('KYC plaintext storage');
    $db->run('INSERT INTO argus_kyc_encrypted_documents
        (id,account_id,document_type,mime,payload_encrypted,sha256,created_at)
        VALUES(?,?,?,?,?,?,?)',[
        $docId,$id,$type,'image/jpeg',$sealed,hash('sha256',$bytes),DB::stamp()
    ]);
    $db->run('INSERT INTO argus_portal_documents
        (id,account_id,document_type,mime,sealed_file,file_digest,created_at,review_status)
        VALUES(?,?,?,?,?,?,?,?)',[
        $docId,$id,$type,'image/jpeg','database:'.$docId,
        hash('sha256',$bytes),DB::stamp(),'awaiting_review'
    ]);
    $current=K::summary($db,$account);
    if(count($current['received'])!==$i+1)
        throw new RuntimeException('KYC queue did not find protected documents');
    if($decrypt->invoke(null,$sealed)!==$bytes)
        throw new RuntimeException('Protected KYC file failed round trip');
}
$ready=K::summary($db,$account);
if(!$ready['complete']||count($ready['received'])!==3||count($ready['missing'])!==0)
    throw new RuntimeException('Complete dossier not marked ready for human review');
if(K::identityApproved($db,$id))
    throw new RuntimeException('Uploading KYC files implicitly approved identity');
// Metadata alone (legacy file without encrypted database bytes) MUST NOT
// satisfy current KYC controls.
$legacyId=bin2hex(random_bytes(16));
$db->run('INSERT INTO argus_portal_documents
  (id,account_id,document_type,mime,sealed_file,file_digest,created_at,review_status)
  VALUES(?,?,?,?,?,?,?,?)',[
  $legacyId,$id,'selfie','image/jpeg','kyc_'.bin2hex(random_bytes(16)).'.enc',
  hash('sha256','legacy-not-present'),DB::stamp(),'awaiting_review'
]);
if(K::summary($db,$account)['complete'])
    throw new RuntimeException('Unrecoverable legacy metadata passed KYC');
$reviewer=new ReflectionMethod(K::class,'reviewer');
try{$reviewer->invoke(null,['role'=>'viewer']);throw new RuntimeException('Viewer was authorized to examine KYC');}
catch(ApiError $e){if($e->status!==403)throw $e;}
$reviewer->invoke(null,['role'=>'superadmin']);
$public='/var/www/html/public/static/';
$admin=(string)file_get_contents($public.'admin.js');
$kyc=(string)file_get_contents($public.'kyc-studio.js');
$css=(string)file_get_contents($public.'kyc-studio.css');
$html=(string)file_get_contents($public.'admin.html');
$service=(string)file_get_contents('/var/www/html/src/KycStudio.php');
foreach(['argus-review-list','Examinar no KYC','/api/admin/kyc/queue',
         'window.argusOpenKycApplication'] as $needle)
    if(!str_contains($admin,$needle)&&!str_contains($html,$needle)&&!str_contains($kyc,$needle))
        throw new RuntimeException('Legacy review bridge missing: '.$needle);
if(str_contains($admin,'<form id="application-review-form"'))
    throw new RuntimeException('Unsafe pre-KYC financial approve modal still present');
foreach(['kyc-document-viewer','kyc-viewer-pdf','kyc-viewer-image',
         'credentials:\'same-origin\'','argusOpenKycApplication'] as $needle)
    if(!str_contains($kyc,$needle))
        throw new RuntimeException('Authenticated visual document review missing '.$needle);
foreach(['argus-review-account','kyc-viewer-card iframe','@media(max-width:500px)'] as $needle)
    if(!str_contains($css,$needle))
        throw new RuntimeException('Mobile KYC styles missing '.$needle);
foreach(["argus_kyc_encrypted_documents","document_viewed","self::decrypt",
         "hash('sha256',\$bytes)","identity_approved"] as $needle)
    if(!str_contains($service,$needle))
        throw new RuntimeException('KYC storage/review safeguards missing: '.$needle);
if(!str_contains($html,'kyc-studio.js?v=3')||
   !str_contains($html,'admin.js?v=kyc-nov19'))
    throw new RuntimeException('iPhone browser cache version not bumped');
echo "PASS: authenticated KYC document access, three uploaded PF files available for examiner, legacy metadata not trusted, review role required, mobile photo/PDF preview and separate financial stage.\n";
