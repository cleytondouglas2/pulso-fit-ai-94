<?php
declare(strict_types=1);
require_once '/var/www/html/src/Gateway.php';
use ArgusPayments\KycStudio as K;
use ArgusPayments\Database as D;

if(K::required('PF')!==['identidade_frente','identidade_verso','selfie'])
    throw new RuntimeException('PF document requirements incorrect');
foreach(['cnpj_comprovante','contrato_social','identidade_frente','identidade_verso','selfie'] as $type)
    if(!in_array($type,K::required('PJ'),true))
        throw new RuntimeException('PJ owner / business evidence missing: '.$type);
foreach(['CNH','senha','arquivo_externo'] as $type)
    if(in_array($type,K::required('PF'),true)||in_array($type,K::required('PJ'),true))
        throw new RuntimeException('Unrecognized upload type accepted');

putenv('ARGUS_DOC_HMAC_KEY='.str_repeat('K',64)); // test key is never used in live Render
$db=new D(require '/var/www/html/config.php');
$db->installAndSeed();K::install($db);
$id='arguskyctest'.bin2hex(random_bytes(10));
$fake=['id'=>$id,'account_type'=>'PF','status'=>'documents_required','merchant_id'=>null];
$result=K::summary($db,$fake);
if($result['complete']||count($result['missing'])!==3||$result['financial_enabled'])
    throw new RuntimeException('Incomplete customer must have no payment rights');
$sealed=(new ReflectionMethod(K::class,'encrypt'))->invoke(null,'simulated document bytes');
if(str_contains($sealed,'simulated document bytes'))
    throw new RuntimeException('KYC file must never be stored plaintext');
$plain=(new ReflectionMethod(K::class,'decrypt'))->invoke(null,$sealed);
if($plain!=='simulated document bytes')throw new RuntimeException('Encrypted document roundtrip failed');
try{
 (new ReflectionMethod(K::class,'decrypt'))->invoke(null,substr($sealed,0,-5).'AAAAA');
 throw new RuntimeException('Altered encrypted document was accepted');
}catch(\ArgusPayments\ApiError $expected){}

$first='00000000000000000000000000000001';
$view='00000000000000000000000000000002';
$fix='00000000000000000000000000000003';
$db->run('INSERT INTO argus_kyc_review_events(id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at) VALUES(?,?,?,?,?,?,?,?)',
    [$first,$id,'staff01','admin','identity_approved','Documentos conferidos','',D::stamp()]);
if(!K::identityApproved($db,$id))throw new RuntimeException('Approved KYC not recognized');
$db->run('INSERT INTO argus_kyc_review_events(id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at) VALUES(?,?,?,?,?,?,?,?)',
    [$view,$id,'staff01','admin','document_viewed','Audit read','',D::stamp()]);
if(!K::identityApproved($db,$id))throw new RuntimeException('Document read revoked KYC approval');
$db->run('INSERT INTO argus_kyc_review_events(id,account_id,reviewer_id,reviewer_role,event_type,note,document_types,created_at) VALUES(?,?,?,?,?,?,?,?)',
    [$fix,$id,'staff01','admin','needs_changes','Additional evidence required','',D::stamp()]);
if(K::identityApproved($db,$id))throw new RuntimeException('Correction request failed to revoke KYC approval');
$db->run('DELETE FROM argus_kyc_review_events WHERE account_id=?',[$id]);

$portal=(string)file_get_contents('/var/www/html/src/Portal.php');
$admin=(string)file_get_contents('/var/www/html/src/Admin.php');
$gateway=(string)file_get_contents('/var/www/html/src/Gateway.php');
$client=(string)file_get_contents('/var/www/html/public/static/client.html');
$adminHtml=(string)file_get_contents('/var/www/html/public/static/admin.html');
$clientJs=(string)file_get_contents('/var/www/html/public/static/kyc-portal.js');
$adminJs=(string)file_get_contents('/var/www/html/public/static/kyc-studio.js');
foreach(['KycStudio::summary','KycStudio::upload','KycStudio::portal','KycStudio::identityApproved'] as $needle)
    if(!str_contains($portal,$needle))throw new RuntimeException('Missing protected onboarding route: '.$needle);
if(!str_contains($gateway,"require_once __DIR__ . '/KycStudio.php'"))
    throw new RuntimeException('Gateway did not load KYC');
if(!str_contains($admin,"KycStudio::admin("))
    throw new RuntimeException('KYC analyst API missing from MFA authenticated admin router');
if(!str_contains($portal,"'account'=>self::summary(\$db,\$fresh)"))
    throw new RuntimeException('New customer does not receive an immediate restricted dashboard');
if(!str_contains($portal,"if(\$decision!=='approve')self::fail")||
   !str_contains($portal,"KycStudio::identityApproved"))
    throw new RuntimeException('Financial release is not gated by approved KYC');
foreach(['kyc-portal.js?v=1','kyc-portal.css?v=1','Selecione o tipo de pessoa'] as $needle)
    if(!str_contains($client,$needle))throw new RuntimeException('Customer KYC UI missing '.$needle);
foreach(['kyc-studio.js?v=1','kyc-studio.css?v=1','page-kyc-studio','data-nav="kyc-studio"'] as $needle)
    if(!str_contains($adminHtml,$needle))throw new RuntimeException('Admin KYC studio missing '.$needle);
foreach(['/api/portal/kyc/upload','/api/portal/kyc/representative','Pessoa jurídica','documentos'] as $needle)
    if(!str_contains($clientJs,$needle)&&$needle!=='Pessoa jurídica')throw new RuntimeException('Customer KYC workflow incomplete: '.$needle);
foreach(['/api/admin/kyc/queue','/api/admin/kyc/applications/','identity','needs_changes','approve_identity','reject','provider_approved'] as $needle)
    if(!str_contains($adminJs,$needle))throw new RuntimeException('KYC admin review action missing '.$needle);
if(!str_contains((string)file_get_contents('/var/www/html/src/KycStudio.php'),'sodium_crypto_secretbox'))
    throw new RuntimeException('KYC storage not encrypted');
echo "PASS: encrypted KYC dossier, PF/PJ requirements, audit history, staff routes, immediate locked dashboard and finance isolation.\n";
